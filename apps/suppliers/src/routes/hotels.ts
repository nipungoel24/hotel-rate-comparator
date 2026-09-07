import type { Request, Response } from 'express';
import { searchRequestSchema } from '@hotel/contracts/hotels';
import type { SupplierHotel } from '@hotel/contracts/hotels';
import { inventoryFor } from '../fixtures';
import type { SupplierName } from '../fixtures';
import {
  ATTEMPT_HEADER,
  DEFAULT_DELAY_MS,
  DELAY_MODE_MS,
  FAIL_TWICE_ATTEMPTS,
  SCENARIOS,
  SCENARIO_HEADER,
  VERY_SLOW_MODE_MS,
  parseAttemptHeader,
  parseScenarioHeader,
} from '../scenarios';
import type { ScenarioName } from '../scenarios';

const INVALID_PAYLOAD_BODY = {
  hotels: [{ hotelId: 123, name: 'Broken Hotel', price: 'free' }],
  currency: 'USD',
  priceBasis: 'per_night',
};

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function successBody(hotels: SupplierHotel[]): unknown {
  return { hotels, currency: 'AUD', priceBasis: 'total_stay' };
}

function sendAfter(
  res: Response,
  milliseconds: number,
  respond: () => void,
): void {
  const timer = setTimeout(() => {
    if (!res.writableEnded) respond();
  }, milliseconds);
  res.on('close', () => {
    clearTimeout(timer);
  });
}

// GET /supplierA/hotels and GET /supplierB/hotels (both named mock endpoints).
export function hotelsHandler(
  supplier: SupplierName,
  scenarioControlsDisabled: boolean,
) {
  return (req: Request, res: Response): void => {
    const scenario: ScenarioName = scenarioControlsDisabled
      ? 'normal'
      : (parseScenarioHeader(req.header(SCENARIO_HEADER)) ?? 'normal');
    if (
      !scenarioControlsDisabled &&
      req.header(SCENARIO_HEADER) !== undefined &&
      parseScenarioHeader(req.header(SCENARIO_HEADER)) === null
    ) {
      res.status(400).json({
        error: `Unknown scenario; allowed values: ${SCENARIOS.join(', ')}`,
      });
      return;
    }
    const attempt = scenarioControlsDisabled
      ? 1
      : parseAttemptHeader(req.header(ATTEMPT_HEADER));
    if (attempt === null) {
      res
        .status(400)
        .json({ error: 'Attempt header must be a positive integer' });
      return;
    }
    const parsed = searchRequestSchema.safeParse({
      city: queryString(req.query.city),
      checkIn: queryString(req.query.checkIn),
      checkOut: queryString(req.query.checkOut),
    });
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'invalid_query', issues: parsed.error.issues });
      return;
    }
    console.log(
      JSON.stringify({
        event: 'supplier-request',
        supplier,
        scenario,
        attempt,
      }),
    );
    const hotels = inventoryFor(supplier, parsed.data.city);
    switch (scenario) {
      case 'normal':
        sendAfter(res, DEFAULT_DELAY_MS[supplier], () =>
          res.status(200).json(successBody(hotels)),
        );
        return;
      case 'delay':
        sendAfter(res, DELAY_MODE_MS, () =>
          res.status(200).json(successBody(hotels)),
        );
        return;
      case 'very-slow':
        sendAfter(res, VERY_SLOW_MODE_MS, () =>
          res.status(200).json(successBody(hotels)),
        );
        return;
      case 'hang':
        res.on('close', () => {
          if (!res.writableEnded)
            console.log(
              JSON.stringify({ event: 'supplier-hang-cleaned', supplier }),
            );
        });
        return;
      case 'empty':
        res.status(200).json(successBody([]));
        return;
      case 'server-error':
        res.status(500).json({ error: 'Internal Server Error' });
        return;
      case 'invalid-payload':
        res.status(200).json(INVALID_PAYLOAD_BODY);
        return;
      case 'fail-twice':
        if (attempt < FAIL_TWICE_ATTEMPTS) {
          res.status(500).json({ error: 'Internal Server Error' });
        } else {
          res.status(200).json(successBody(hotels));
        }
        return;
    }
  };
}
