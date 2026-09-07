import { Context } from '@temporalio/activity';
import { ApplicationFailure } from '@temporalio/common';
import {
  parseSupplierResponse,
  searchRequestSchema,
} from '@hotel/contracts/hotels';
import type { SearchRequest } from '@hotel/contracts';
import { toSupplierOutcome } from '@hotel/domain';
import type { SupplierId, SupplierOutcome } from '@hotel/domain';

export interface SupplierActivityInput {
  supplier: SupplierId;
  search: SearchRequest;
  deadlineEpochMs: number;
}
export interface SupplierActivities {
  fetchSupplier(input: SupplierActivityInput): Promise<SupplierOutcome>;
}
export interface SupplierAdapter {
  baseUrl: string;
  // Trusted worker wiring only; never populated from a customer request.
  headers?: Readonly<Record<string, string>>;
}

function deadlineFailure(): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    'Supplier budget exhausted',
    'SupplierDeadline',
  );
}

export function createSupplierActivities(
  adapters: Readonly<Record<SupplierId, SupplierAdapter>>,
): SupplierActivities {
  // Fail worker startup for impossible configuration, before polling any work.
  const urls = {
    A: new URL(adapters.A.baseUrl),
    B: new URL(adapters.B.baseUrl),
  };
  for (const url of Object.values(urls)) {
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error('Supplier base URL must be HTTP(S) without credentials');
    }
  }
  const headers = {
    A: { ...adapters.A.headers },
    B: { ...adapters.B.headers },
  };
  return {
    async fetchSupplier({ supplier, search, deadlineEpochMs }) {
      const context = Context.current();
      if (context.cancellationSignal.aborted) return await context.cancelled;
      if (supplier !== 'A' && supplier !== 'B') {
        throw ApplicationFailure.nonRetryable(
          'Unsupported supplier',
          'InvalidSupplierInput',
        );
      }
      const parsedSearch = searchRequestSchema.safeParse(search);
      if (!parsedSearch.success || !Number.isSafeInteger(deadlineEpochMs)) {
        throw ApplicationFailure.nonRetryable(
          'Invalid supplier input',
          'InvalidSupplierInput',
        );
      }
      const remaining = deadlineEpochMs - Date.now();
      if (remaining <= 0) throw deadlineFailure();
      const url = new URL(`/supplier${supplier}/hotels`, urls[supplier]);
      url.search = new URLSearchParams(parsedSearch.data).toString();
      const controller = new AbortController();
      const cancel = (): void =>
        controller.abort(context.cancellationSignal.reason);
      context.cancellationSignal.addEventListener('abort', cancel, {
        once: true,
      });
      // Explicit listener composition also works with the SDK's AbortSignal type.
      if (context.cancellationSignal.aborted) cancel();
      const deadlineTimer = setTimeout(
        () => controller.abort(deadlineFailure()),
        remaining,
      );
      const heartbeat = (): void =>
        context.heartbeat({ supplier, attempt: context.info.attempt });
      const heartbeatTimer = setInterval(heartbeat, 250);
      const assertActive = async (): Promise<void> => {
        // Root/Temporal cancellation always takes precedence over the local deadline.
        if (context.cancellationSignal.aborted) await context.cancelled;
        if (Date.now() >= deadlineEpochMs) throw deadlineFailure();
      };
      try {
        heartbeat();
        context.log.info('Supplier attempt started', {
          supplier,
          attempt: context.info.attempt,
          workflowId: context.info.workflowExecution?.workflowId,
        });
        let response: Response;
        let body: string;
        try {
          response = await fetch(url, {
            headers: {
              ...headers[supplier],
              'x-supplier-attempt': String(context.info.attempt),
            },
            signal: controller.signal,
            redirect: 'error',
          });
          if (!response.ok) {
            await response.body?.cancel();
            await assertActive();
            const retryable =
              response.status === 408 ||
              response.status === 429 ||
              response.status >= 500;
            throw ApplicationFailure.create({
              message: 'Supplier HTTP failure',
              type: 'SupplierHttpError',
              nonRetryable: !retryable,
              details: [response.status],
            });
          }
          body = await response.text();
        } catch (error) {
          await assertActive();
          if (error instanceof ApplicationFailure) throw error;
          throw ApplicationFailure.create({
            message: 'Supplier transport failure',
            type: 'SupplierNetworkError',
            ...(error instanceof Error ? { cause: error } : {}),
          });
        }
        await assertActive();
        let json: unknown;
        try {
          json = JSON.parse(body);
        } catch (error) {
          throw ApplicationFailure.create({
            message: 'Invalid supplier JSON',
            type: 'SupplierInvalidResponse',
            nonRetryable: true,
            ...(error instanceof Error ? { cause: error } : {}),
          });
        }
        const parsed = parseSupplierResponse(json);
        if (!parsed.ok) {
          throw ApplicationFailure.nonRetryable(
            'Invalid supplier payload',
            'SupplierInvalidResponse',
          );
        }
        await assertActive();
        return toSupplierOutcome(supplier, parsed.value);
      } finally {
        clearInterval(heartbeatTimer);
        clearTimeout(deadlineTimer);
        context.cancellationSignal.removeEventListener('abort', cancel);
        context.log.debug('Supplier attempt resources released', {
          supplier,
          attempt: context.info.attempt,
        });
      }
    },
  };
}
