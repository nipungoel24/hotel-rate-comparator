import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Context } from '@temporalio/activity';
import { Worker, bundleWorkflowCode } from '@temporalio/worker';
import type { WorkflowBundle } from '@temporalio/worker';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import type { SupplierId } from '@hotel/domain';
import type { searchHotels } from '../../apps/worker/src/workflows/search-hotels.workflow';
import { createApp } from '../../apps/suppliers/src/app';
import type { ScenarioName } from '../../apps/suppliers/src/scenarios';
import { createSupplierActivities } from '../../apps/worker/src/activities';
import type { SupplierActivityInput } from '../../apps/worker/src/activities';

export const search = {
  city: 'Sydney',
  checkIn: '2030-10-12',
  checkOut: '2030-10-15',
};
export async function eventually(
  check: () => boolean,
  timeout = 3000,
): Promise<void> {
  const until = Date.now() + timeout;
  while (!check()) {
    if (Date.now() >= until)
      throw new Error('Expected observable condition did not occur');
    await delay(25);
  }
}
export interface RequestRecord {
  supplier: string;
  attempt: number;
  started: number;
  closed?: number;
  finished?: number;
  status?: number;
}
export interface AttemptRecord {
  supplier: SupplierId;
  attempt: number;
  workflowId: string;
  deadline: number;
  started: number;
  settled?: number;
  cancelled?: boolean;
}
export class Harness {
  constructor(
    readonly env: TestWorkflowEnvironment,
    readonly bundle: WorkflowBundle,
  ) {}
  static async create(): Promise<Harness> {
    const bundle = await bundleWorkflowCode({
      workflowsPath: require.resolve('../../apps/worker/src/workflows'),
    });
    const env = await TestWorkflowEnvironment.createLocal({
      server: {
        executable: {
          type: 'existing-path',
          path: resolve(
            '.tools/temporal/1.8.3',
            process.platform === 'win32' ? 'temporal.exe' : 'temporal',
          ),
        },
        ip: '127.0.0.1',
      },
    });
    return new Harness(env, bundle);
  }
  async scenario(
    a: ScenarioName = 'normal',
    b: ScenarioName = 'normal',
    barrier = false,
  ) {
    const requests: RequestRecord[] = [];
    const attempts: AttemptRecord[] = [];
    const releases: (() => void)[] = [];
    const app = createApp();
    const server = createServer((req, res) => {
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
      if (barrier)
        releases.push(() => {
          if (!res.destroyed) app(req, res);
        });
      else app(req, res);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const activities = createSupplierActivities({
      A: { baseUrl, headers: { 'x-hotel-scenario': a } },
      B: { baseUrl, headers: { 'x-hotel-scenario': b } },
    });
    const taskQueue = `phase3-${randomUUID()}`;
    let worker: Worker;
    try {
      worker = await Worker.create({
        connection: this.env.nativeConnection,
        taskQueue,
        workflowBundle: this.bundle,
        maxHeartbeatThrottleInterval: 250,
        shutdownGraceTime: '5 seconds',
        activities: {
          fetchSupplier: async (input: SupplierActivityInput) => {
            const ctx = Context.current();
            const record: AttemptRecord = {
              supplier: input.supplier,
              attempt: ctx.info.attempt,
              workflowId:
                ctx.info.workflowExecution?.workflowId ?? 'missing-workflow',
              deadline: input.deadlineEpochMs,
              started: Date.now(),
            };
            attempts.push(record);
            try {
              return await activities.fetchSupplier(input);
            } finally {
              record.settled = Date.now();
              record.cancelled = ctx.cancellationSignal.aborted;
            }
          },
        },
      });
    } catch (error) {
      await closeServer(server);
      throw error;
    }
    return {
      worker,
      taskQueue,
      requests,
      attempts,
      release: () => {
        for (const release of releases.splice(0)) release();
      },
      close: () => closeServer(server),
      start: (city = 'Sydney') =>
        this.env.client.workflow.start<typeof searchHotels>('searchHotels', {
          workflowId: `search-${randomUUID()}`,
          taskQueue,
          args: [{ ...search, city }],
          workflowExecutionTimeout: '15 seconds',
          retry: { maximumAttempts: 1 },
        }),
    };
  }
}
export async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
