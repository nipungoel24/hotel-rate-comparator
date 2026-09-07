import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer, Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const TEMPORAL_BINARY = resolve(
  ROOT,
  '.tools/temporal/1.8.3',
  process.platform === 'win32' ? 'temporal.exe' : 'temporal',
);

interface NodeHandle {
  child: ChildProcess;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  output: () => string;
}
interface TemporalHandle {
  child: ChildProcess;
  exited: Promise<unknown>;
  stop: () => Promise<void>;
}
export interface Stack {
  apiUrl: string;
  webUrl: string;
  stop: () => Promise<PromiseSettledResult<unknown>[]>;
}

async function processHelpers(): Promise<{
  startNode: (
    file: string,
    args: string[],
    env: Record<string, string>,
  ) => NodeHandle;
  stopNode: (handle: NodeHandle) => Promise<unknown>;
  waitFor: (
    check: () => boolean | Promise<boolean>,
    label: string,
    timeout?: number,
  ) => Promise<void>;
}> {
  const helpers = (await import('../../scripts/processes.mjs')) as {
    startNode: (
      file: string,
      args: string[],
      env: Record<string, string>,
    ) => NodeHandle;
    stopNode: (handle: NodeHandle) => Promise<unknown>;
    waitFor: (
      check: () => boolean | Promise<boolean>,
      label: string,
      timeout?: number,
    ) => Promise<void>;
  };
  return helpers;
}

export async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolveFree, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(() => resolveFree()));
  });
}

export async function startTemporal(
  port = 7233,
  uiPort = 8233,
): Promise<TemporalHandle> {
  await assertPortFree(port);
  const child = spawn(
    TEMPORAL_BINARY,
    [
      'server',
      'start-dev',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--ui-port',
      String(uiPort),
      '--namespace',
      'default',
    ],
    { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true },
  );
  const exited = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolveExit) =>
    child.once('exit', (code, signal) => resolveExit({ code, signal })),
  );
  const { waitFor } = await processHelpers();
  await waitFor(
    async () => {
      await new Promise<void>((resolveTry, rejectTry) => {
        const socket = new Socket();
        socket.once('error', rejectTry);
        socket.connect(port, '127.0.0.1', () => {
          socket.destroy();
          resolveTry();
        });
      });
      return true;
    },
    `Temporal on :${port}`,
    45000,
  );
  return {
    child,
    exited,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill();
      await exited;
    },
  };
}

export async function startStack(options: {
  name: string;
  taskQueue?: string;
  apiPort?: number;
  suppliersPort?: number;
  webPort?: number;
  workerFile?: string;
  scenarios?: { A?: string; B?: string };
  temporal?: 'start' | 'share';
}): Promise<Stack> {
  const name = options.name;
  const taskQueue = options.taskQueue ?? 'hotel-rate-comparator';
  const apiPort = options.apiPort ?? 3001;
  const suppliersPort = options.suppliersPort ?? 4001;
  const webPort = options.webPort ?? 5173;
  for (const port of [apiPort, suppliersPort, webPort]) {
    await assertPortFree(port);
  }
  const ownsTemporal = options.temporal !== 'share';
  const temporal = ownsTemporal ? await startTemporal(7233) : undefined;
  const env: Record<string, string> = {
    TEMPORAL_ADDRESS: '127.0.0.1:7233',
    TEMPORAL_TASK_QUEUE: taskQueue,
    HOST: '127.0.0.1',
    API_PORT: String(apiPort),
    SUPPLIERS_PORT: String(suppliersPort),
    WEB_PORT: String(webPort),
    TEMPORAL_UI_PORT: '8233',
    ...(options.scenarios?.A !== undefined
      ? { E2E_SUPPLIER_A_SCENARIO: options.scenarios.A }
      : {}),
    ...(options.scenarios?.B !== undefined
      ? { E2E_SUPPLIER_B_SCENARIO: options.scenarios.B }
      : {}),
  };
  const { startNode, stopNode, waitFor } = await processHelpers();
  const handles = [
    startNode('apps/suppliers/dist/server.js', [], env),
    startNode(options.workerFile ?? 'apps/worker/dist/worker.js', [], env),
    startNode('apps/api/dist/server.js', [], env),
    startNode('scripts/web.mjs', [], env),
  ];
  const [suppliers, worker, api, web] = handles;
  if (!suppliers || !worker || !api || !web)
    throw new Error('Stack process handles were not created');
  try {
    await waitFor(
      () => suppliers.output().includes('"event":"suppliers-ready"'),
      `${name} suppliers`,
      45000,
    );
    await waitFor(
      () => worker.output().includes('"event":"worker-created"'),
      `${name} worker`,
      60000,
    );
    await waitFor(
      () => api.output().includes('"event":"api-ready"'),
      `${name} api`,
      45000,
    );
    await waitFor(
      () => web.output().includes('"event":"web-ready"'),
      `${name} web`,
      45000,
    );
  } catch (error) {
    for (const handle of handles) {
      try {
        await stopNode(handle);
      } catch {
        /* already failed */
      }
    }
    await temporal?.stop();
    throw error;
  }
  return {
    apiUrl: `http://127.0.0.1:${apiPort}`,
    webUrl: `http://127.0.0.1:${webPort}`,
    stop: async () => {
      const results = await Promise.allSettled(handles.map(stopNode));
      await temporal?.stop();
      await delay(300);
      return results;
    },
  };
}
