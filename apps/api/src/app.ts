import express from 'express';
import type { Express } from 'express';
import type { Client } from '@temporalio/client';
import type { HealthResponse } from '@hotel/contracts';
import { createErrorHandler } from './middleware/error-handler';
import { createSearchHotelsRouter } from './routes/search-hotels';
import { createSearchWorkflowGateway } from './services/search-service';
import type { SearchWorkflowGateway } from './services/search-service';

export interface ApiDependencies {
  // Shared Temporal client: one connection reused by every search request.
  client: Client;
  taskQueue: string;
  // Test seams only; production uses the Temporal-backed gateway and the
  // real UTC business date.
  gateway?: SearchWorkflowGateway;
  today?: () => string;
  makeSearchId?: () => string;
}

export function createApp(deps: ApiDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_req, res) => {
    const response: HealthResponse = { status: 'ok', service: 'api' };
    res.json(response);
  });
  app.get('/ready', async (_req, res) => {
    try {
      await deps.client.connection.withDeadline(Date.now() + 3000, () =>
        deps.client.workflowService.describeNamespace({
          namespace: deps.client.options.namespace,
        }),
      );
      res.json({ status: 'ready', namespace: deps.client.options.namespace });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  const gateway =
    deps.gateway ?? createSearchWorkflowGateway(deps.client, deps.taskQueue);
  app.use(
    '/api/search-hotels',
    createSearchHotelsRouter({
      gateway,
      ...(deps.today !== undefined ? { today: deps.today } : {}),
      ...(deps.makeSearchId !== undefined
        ? { makeSearchId: deps.makeSearchId }
        : {}),
    }),
  );
  app.use(createErrorHandler());
  return app;
}
