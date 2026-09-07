import { Router } from 'express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { WorkflowFailedError } from '@temporalio/client';
import { CancelledFailure, TimeoutFailure } from '@temporalio/common';
import { validateSearchRequest } from '@hotel/contracts/hotels';
import type {
  SearchEmptyBody,
  SearchErrorBody,
  SearchSuccessBody,
  ValidationErrorBody,
} from '@hotel/contracts';
import type { HotelOffer, SearchOutcome, SupplierOutcome } from '@hotel/domain';
import type {
  SearchWorkflowGateway,
  WorkflowHandleLike,
} from '../services/search-service';

export function createSearchId(): string {
  // cryptographically safe, collision-free across concurrent requests
  return `hotel-search-${randomUUID()}`;
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function logInfo(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}

function logError(event: string, fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, ...fields }));
}

function errorSummary(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

function sendJson(res: Response, status: number, body: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.status(status).json(body);
}

export function publicOffer(offer: HotelOffer) {
  return {
    hotelId: offer.hotelId,
    name: offer.name,
    supplier: offer.supplier,
    price: offer.priceMinor / 100, // major units derived from integer cents
    priceMinor: offer.priceMinor,
    currency: 'AUD',
    priceBasis: 'total_stay',
  } as const;
}

export function publicSupplierOutcome(outcome: SupplierOutcome) {
  switch (outcome.status) {
    case 'success':
      return { status: 'success', supplier: outcome.supplier } as const;
    case 'empty':
      return { status: 'empty', supplier: outcome.supplier } as const;
    case 'failed':
      return {
        status: 'failed',
        supplier: outcome.supplier,
        code: outcome.code,
      } as const;
    case 'timed_out':
      return { status: 'timed_out', supplier: outcome.supplier } as const;
  }
}

export interface MappedSearchResponse {
  status: number;
  body: SearchSuccessBody | SearchEmptyBody | SearchErrorBody;
}

// Pure SearchOutcome -> HTTP mapping; no Temporal objects or stack traces
// ever reach a client through this function.
export function mapSearchOutcome(
  outcome: SearchOutcome,
  searchId: string,
): MappedSearchResponse {
  switch (outcome.kind) {
    case 'result':
      return {
        status: 200,
        body: {
          status: 'success',
          searchId,
          bestOffer: publicOffer(outcome.best),
          partial: outcome.partial,
          suppliers: {
            a: publicSupplierOutcome(outcome.a),
            b: publicSupplierOutcome(outcome.b),
          },
        },
      };
    case 'no_hotels':
      return {
        status: 200,
        body: { status: 'empty', message: 'No hotels found', searchId },
      };
    case 'suppliers_unavailable':
      return {
        status: 502,
        body: {
          status: 'error',
          code: 'SUPPLIERS_UNAVAILABLE',
          message:
            'No offers were returned and at least one supplier could not be checked',
          searchId,
        },
      };
  }
}

function serviceUnavailableBody(searchId: string): SearchErrorBody {
  return {
    status: 'error',
    code: 'SEARCH_SERVICE_UNAVAILABLE',
    message: 'The search service is currently unavailable, please retry',
    searchId,
  };
}

function internalErrorBody(searchId: string): SearchErrorBody {
  return {
    status: 'error',
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    searchId,
  };
}

function observeResult(handle: WorkflowHandleLike, searchId: string): void {
  // The cancelled execution eventually rejects result(); this handler keeps
  // that rejection observed so it can never become an unhandled rejection.
  handle.result().then(
    () =>
      logInfo('search-cancelled-workflow-completed', {
        searchId,
        workflowId: handle.workflowId,
      }),
    (error: unknown) =>
      logInfo('search-cancelled-workflow-settled', {
        searchId,
        workflowId: handle.workflowId,
        error: errorSummary(error),
      }),
  );
}

function mapWorkflowFailure(
  res: Response,
  error: WorkflowFailedError,
  searchId: string,
): void {
  const cause = error.cause;
  if (cause instanceof TimeoutFailure) {
    sendJson(res, 504, {
      status: 'error',
      code: 'SEARCH_TIMEOUT',
      message: 'The search exceeded its time limit',
      searchId,
    });
    return;
  }
  if (cause instanceof CancelledFailure) {
    // Only the disconnect bridge cancels searches; a live client reaching
    // this branch is an unexpected terminal race, never a supplier outcome.
    logError('search-cancelled-unexpectedly', { searchId });
    sendJson(res, 500, internalErrorBody(searchId));
    return;
  }
  logError('search-workflow-failed', {
    searchId,
    cause: cause instanceof Error ? cause.name : undefined,
    message: cause instanceof Error ? cause.message : undefined,
  });
  sendJson(res, 500, internalErrorBody(searchId));
}

export interface SearchHotelsRouteOptions {
  gateway: SearchWorkflowGateway;
  today?: () => string;
  makeSearchId?: () => string;
}

export function createSearchHotelsRouter(
  options: SearchHotelsRouteOptions,
): Router {
  const router = Router();
  const gateway = options.gateway;
  const today = options.today ?? utcToday;
  const makeSearchId = options.makeSearchId ?? createSearchId;

  router.post('/', async (req, res) => {
    const searchId = makeSearchId();
    const validation = validateSearchRequest(req.body, today());
    if (!validation.ok) {
      const body: ValidationErrorBody = {
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: 'Invalid search request',
        searchId,
        fields: validation.fieldErrors,
      };
      sendJson(res, 400, body);
      return;
    }
    const search = validation.value;

    // Per-request state only. The client is shared; handles never are.
    let disconnected = false;
    let handle: WorkflowHandleLike | undefined;
    let cancelIssued = false;

    const cancelOnce = async (): Promise<void> => {
      if (cancelIssued || handle === undefined) return;
      cancelIssued = true;
      const current = handle;
      try {
        await current.cancel();
        logInfo('search-cancelled', {
          searchId,
          workflowId: current.workflowId,
        });
      } catch (error) {
        // The client is gone; keep the process healthy and record the failure.
        logError('search-cancel-failed', {
          searchId,
          workflowId: current.workflowId,
          error: errorSummary(error),
        });
      }
    };

    // Registered before the workflow start call so a disconnect during the
    // start handshake can never be lost (S17). Normal completion also emits
    // 'close', but then the response already finished (S19).
    const onResponseClose = (): void => {
      if (res.writableEnded) return;
      disconnected = true;
      void cancelOnce();
    };
    res.once('close', onResponseClose);

    try {
      try {
        handle = await gateway.start({ workflowId: searchId, search });
      } catch (error) {
        if (disconnected || res.destroyed || res.writableEnded) {
          logInfo('search-abandoned-at-submission', { searchId });
          return;
        }
        logError('search-submission-failed', {
          searchId,
          error: errorSummary(error),
        });
        sendJson(res, 503, serviceUnavailableBody(searchId));
        return;
      }

      // Unreachable after a successful start, but narrows `handle` for the
      // compiler without unsafe assertions.
      if (handle === undefined) return;

      if (disconnected) {
        // Client left while the start call was in flight; cancel as soon as
        // the handle exists, exactly once, and observe the terminal result.
        await cancelOnce();
        observeResult(handle, searchId);
        return;
      }

      let outcome: SearchOutcome;
      try {
        outcome = await handle.result();
      } catch (error) {
        if (disconnected || res.destroyed || res.writableEnded) {
          logInfo('search-abandoned', { searchId });
          return;
        }
        if (error instanceof WorkflowFailedError) {
          mapWorkflowFailure(res, error, searchId);
          return;
        }
        logError('search-result-failed', {
          searchId,
          error: errorSummary(error),
        });
        sendJson(res, 503, serviceUnavailableBody(searchId));
        return;
      }

      if (disconnected || res.destroyed || res.writableEnded) {
        logInfo('search-abandoned', { searchId });
        return;
      }
      const mapped = mapSearchOutcome(outcome, searchId);
      sendJson(res, mapped.status, mapped.body);
    } finally {
      res.removeListener('close', onResponseClose);
    }
  });

  return router;
}
