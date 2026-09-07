import http from 'node:http';
import type { ClientRequest, Server } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Context } from '@temporalio/activity';
import { Worker } from '@temporalio/worker';
import { createApp as createSuppliersApp } from '../../apps/suppliers/src/app';
import { createSupplierActivities } from '../../apps/worker/src/activities';
import type { SupplierActivityInput } from '../../apps/worker/src/activities';
import { createApp as createApiApp } from '../../apps/api/src/app';
import type {
  AttemptRecord,
  Harness,
  RequestRecord,
} from '../workflow/harness';
import {
  Harness as HarnessClass,
  closeServer,
  eventually,
  search,
} from '../workflow/harness';
import type { ScenarioName } from '../../apps/suppliers/src/scenarios';

async function eventuallyAsync(
  check: () => Promise<boolean>,
  timeout = 3000,
): Promise<void> {
  const until = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() >= until)
      throw new Error('Expected observable condition did not occur');
    await delay(25);
  }
}

let harness: Harness;
beforeAll(async () => {
  harness = await HarnessClass.create();
}, 60000);
afterAll(async () => {
  await harness?.env.teardown();
});

async function listenApi(
  client = harness.env.client,
  taskQueue: string = randomUUID(),
): Promise<{ url: string; close: () => Promise<void> }> {
  const app = createApiApp({ client, taskQueue });
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

interface ApiSearchBody {
  status: string;
  searchId?: string;
  message?: string;
  code?: string;
  partial?: boolean;
  bestOffer?: {
    supplier: string;
    hotelId: string;
    name: string;
    price: number;
    priceMinor: number;
    currency: string;
    priceBasis: string;
  };
}

async function postSearch(
  url: string,
  body: Record<string, unknown> = search,
  timeoutMs = 30000,
): Promise<{ status: number; body: ApiSearchBody }> {
  const response = await fetch(`${url}/api/search-hotels`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return {
    status: response.status,
    body: (await response.json()) as ApiSearchBody,
  };
}

function postNativeAbortable(
  url: string,
  body: Record<string, unknown>,
): { req: ClientRequest; settled: Promise<{ status: number }> } {
  let requestInstance: ClientRequest | undefined;
  const settled = new Promise<{ status: number }>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: Number(url.split(':')[2]),
        path: '/api/search-hotels',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      },
      (message) => {
        message.resume();
        message.on('end', () => resolve({ status: message.statusCode ?? 0 }));
      },
    );
    req.on('error', (error) => {
      // the client deliberately destroys the socket; that local error is
      // expected and must not fail the test or leak as an unhandled event
      if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') {
        reject(error);
        return;
      }
      resolve({ status: 0 });
    });
    requestInstance = req;
    req.end(JSON.stringify(body));
  });
  if (!requestInstance) throw new Error('Request was not created');
  return { req: requestInstance, settled };
}

interface ApiScenarioRow {
  name: string;
  city: string;
  a: ScenarioName;
  b: ScenarioName;
  status: number;
  supplier?: string;
  hotelId?: string;
  priceMinor?: number;
  partial?: boolean;
  code?: string;
  empty?: boolean;
}

describe('POST /api/search-hotels real Temporal integration', () => {
  const rows: ApiScenarioRow[] = [
    {
      name: 'A01 Supplier A cheaper',
      city: 'Sydney',
      a: 'normal' as ScenarioName,
      b: 'normal' as ScenarioName,
      status: 200,
      supplier: 'A',
      hotelId: 'SYD-A-101',
      priceMinor: 12000,
      partial: false,
    },
    {
      name: 'A02 Supplier B cheaper',
      city: 'Melbourne',
      a: 'normal',
      b: 'normal',
      status: 200,
      supplier: 'B',
      hotelId: 'MEL-B-201',
      priceMinor: 16000,
      partial: false,
    },
    {
      name: 'A03 equal rate selects A',
      city: 'Brisbane',
      a: 'normal',
      b: 'normal',
      status: 200,
      supplier: 'A',
      hotelId: 'BNE-A-101',
      priceMinor: 9995,
      partial: false,
    },
    {
      name: 'A04 A fails, B partial',
      city: 'Sydney',
      a: 'server-error',
      b: 'normal',
      status: 200,
      supplier: 'B',
      hotelId: 'SYD-B-201',
      priceMinor: 15000,
      partial: true,
    },
    {
      name: 'A05 both suppliers fail',
      city: 'Sydney',
      a: 'server-error',
      b: 'server-error',
      status: 502,
      code: 'SUPPLIERS_UNAVAILABLE',
    },
    {
      name: 'A06 both empty',
      city: 'Sydney',
      a: 'empty',
      b: 'empty',
      status: 200,
      empty: true,
    },
    {
      name: 'A07 A times out, B partial',
      city: 'Sydney',
      a: 'very-slow',
      b: 'normal',
      status: 200,
      supplier: 'B',
      hotelId: 'SYD-B-201',
      priceMinor: 15000,
      partial: true,
    },
  ];

  test.each(rows)('$name', async (row) => {
    const s = await harness.scenario(row.a, row.b);
    try {
      await s.worker.runUntil(async () => {
        const api = await listenApi(harness.env.client, s.taskQueue);
        try {
          const result = await postSearch(api.url, {
            ...search,
            city: row.city,
          });
          expect(result.status).toBe(row.status);
          const body = result.body;
          if (row.empty) {
            expect(body).toMatchObject({ status: 'empty' });
            expect(body.message).toBe('No hotels found');
          } else if (row.code) {
            expect(body).toMatchObject({ status: 'error', code: row.code });
          } else {
            expect(body).toMatchObject({
              status: 'success',
              bestOffer: {
                supplier: row.supplier,
                hotelId: row.hotelId,
                priceMinor: row.priceMinor,
                currency: 'AUD',
                priceBasis: 'total_stay',
              },
              partial: row.partial,
            });
          }
          expect(String(body.searchId)).toMatch(/^hotel-search-[0-9a-f-]{36}$/);
        } finally {
          await api.close();
        }
      });
    } finally {
      await s.close();
    }
  });

  test('A09 S20 no worker polls: bounded 504 SEARCH_TIMEOUT', async () => {
    const taskQueue = `noworker-${randomUUID()}`;
    const api = await listenApi(harness.env.client, taskQueue);
    try {
      const started = Date.now();
      const result = await postSearch(api.url, search, 40000);
      expect(result.status).toBe(504);
      expect(result.body).toMatchObject({
        status: 'error',
        code: 'SEARCH_TIMEOUT',
      });
      const elapsed = Date.now() - started;
      expect(elapsed).toBeGreaterThan(12000);
      expect(elapsed).toBeLessThan(30000);
    } finally {
      await api.close();
    }
  });

  test('two concurrent searches stay isolated with distinct ids', async () => {
    const s = await harness.scenario('normal');
    try {
      await s.worker.runUntil(async () => {
        const api = await listenApi(harness.env.client, s.taskQueue);
        try {
          const [first, second] = await Promise.all([
            postSearch(api.url, search),
            postSearch(api.url, { ...search, city: 'Melbourne' }),
          ]);
          expect(first.status).toBe(200);
          expect(second.status).toBe(200);
          expect(first.body.searchId).not.toBe(second.body.searchId);
          expect(first.body.bestOffer?.supplier).toBe('A');
          expect(second.body.bestOffer?.supplier).toBe('B');
        } finally {
          await api.close();
        }
      });
    } finally {
      await s.close();
    }
  });

  test('C01 real client disconnect cancels the workflow end to end', async () => {
    const requests: RequestRecord[] = [];
    const attempts: AttemptRecord[] = [];
    const suppliers = createSuppliersApp();
    const supplierServer: Server = http.createServer((req, res) => {
      const record: RequestRecord = {
        supplier: req.url?.startsWith('/supplierA/') ? 'A' : 'B',
        attempt: Number(req.headers['x-supplier-attempt']),
        started: Date.now(),
      };
      requests.push(record);
      res.once('finish', () => {
        record.finished = Date.now();
        record.status = res.statusCode;
      });
      res.once('close', () => {
        record.closed = Date.now();
      });
      suppliers(req, res);
    });
    supplierServer.listen(0, '127.0.0.1');
    await once(supplierServer, 'listening');
    const address = supplierServer.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const hangActivities = createSupplierActivities({
      A: { baseUrl, headers: { 'x-hotel-scenario': 'hang' } },
      B: { baseUrl, headers: { 'x-hotel-scenario': 'hang' } },
    });
    const normalActivities = createSupplierActivities({
      A: { baseUrl, headers: { 'x-hotel-scenario': 'normal' } },
      B: { baseUrl, headers: { 'x-hotel-scenario': 'normal' } },
    });
    let activityCalls = 0;
    const taskQueue = `phase4-cancel-${randomUUID()}`;
    const worker = await Worker.create({
      connection: harness.env.nativeConnection,
      taskQueue,
      workflowBundle: harness.bundle,
      maxHeartbeatThrottleInterval: 250,
      shutdownGraceTime: '5 seconds',
      activities: {
        fetchSupplier: async (input: SupplierActivityInput) => {
          const ctx = Context.current();
          activityCalls += 1;
          const record: AttemptRecord = {
            supplier: input.supplier,
            attempt: ctx.info.attempt,
            workflowId:
              ctx.info.workflowExecution?.workflowId ?? 'missing-workflow',
            deadline: input.deadlineEpochMs,
            started: Date.now(),
          };
          attempts.push(record);
          // The first two supplier calls (one cancelled search) hang; every
          // later search on this worker behaves normally.
          const target = activityCalls <= 2 ? hangActivities : normalActivities;
          try {
            return await target.fetchSupplier(input);
          } finally {
            record.settled = Date.now();
            record.cancelled = ctx.cancellationSignal.aborted;
          }
        },
      },
    });
    try {
      await worker.runUntil(async () => {
        const api = await listenApi(harness.env.client, taskQueue);
        try {
          const abandoned = postNativeAbortable(api.url, search);

          // both supplier HTTP requests are in flight and hanging
          await eventually(() => requests.length === 2);
          await eventually(() => attempts.length === 2);
          const workflowId = attempts[0]?.workflowId;
          if (!workflowId) throw new Error('Missing workflow id evidence');
          expect(
            requests.every(
              (r) => r.finished === undefined && r.closed === undefined,
            ),
          ).toBe(true);
          const cancelledAt = Date.now();

          // real client disconnect mid-request
          abandoned.req.destroy();
          expect((await abandoned.settled).status).toBe(0);

          const handle = harness.env.client.workflow.getHandle(workflowId);
          await eventuallyAsync(async () => {
            const description = await handle.describe();
            return description.status.name === 'CANCELLED';
          }, 5000);
          expect(Date.now() - cancelledAt).toBeLessThan(5000);

          await eventually(
            () =>
              requests.every((r) => r.closed !== undefined) &&
              attempts.every((r) => r.settled !== undefined),
          );
          expect(requests.every((r) => r.finished === undefined)).toBe(true);
          expect(attempts.every((r) => r.cancelled === true)).toBe(true);
          await delay(1000);
          expect(attempts.map((r) => r.attempt)).toEqual([1, 1]);

          // API process healthy and the same worker serves the next search
          const health = await fetch(`${api.url}/health`);
          expect(health.status).toBe(200);
          const next = await postSearch(api.url);
          expect(next.status).toBe(200);
          expect(next.body).toMatchObject({
            status: 'success',
            bestOffer: { supplier: 'A', priceMinor: 12000 },
            partial: false,
          });
          expect(worker.getState()).toBe('RUNNING');
          console.log(
            'API CANCELLATION EVIDENCE',
            JSON.stringify({ workflowId, requests, attempts }),
          );
        } finally {
          await api.close();
        }
      });
    } finally {
      await closeServer(supplierServer);
    }
  });
});
