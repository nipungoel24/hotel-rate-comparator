import express from 'express';
import type { Express } from 'express';
import type { HealthResponse } from '@hotel/contracts';
import { hotelsHandler } from './routes/hotels';

export interface SupplierAppOptions {
  scenarioControlsDisabled?: boolean;
}

export function createApp(options: SupplierAppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => {
    const response: HealthResponse = { status: 'ok', service: 'suppliers' };
    res.json(response);
  });
  app.get(
    '/supplierA/hotels',
    hotelsHandler('A', options.scenarioControlsDisabled ?? false),
  );
  app.get(
    '/supplierB/hotels',
    hotelsHandler('B', options.scenarioControlsDisabled ?? false),
  );
  return app;
}
