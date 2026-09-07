import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { readInfrastructureConfig } from '@hotel/contracts';
import { connectTemporal } from '../apps/api/dist/temporal/client.js';
import { startNode, stopNode, waitFor } from './processes.mjs';

const config = readInfrastructureConfig(process.env);
const evidence = {
  timestamp: new Date().toISOString(),
  node: process.version,
  namespace: config.namespace,
  taskQueue: config.taskQueue,
  checks: [],
};
const handles = [];
let temporal;
async function freePort(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, config.host, () => server.close(resolve));
  });
}
async function get(path, port) {
  const response = await fetch(`http://${config.host}:${port}${path}`, {
    signal: AbortSignal.timeout(2000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
try {
  for (const port of [config.apiPort, config.suppliersPort, config.webPort])
    await freePort(port);
  temporal = await connectTemporal(config);
  await temporal.client.connection.withDeadline(Date.now() + 3000, () =>
    temporal.client.workflowService.describeNamespace({
      namespace: config.namespace,
    }),
  );
  evidence.checks.push(
    'Temporal namespace reachable through compiled reusable API client',
  );
  for (const entry of [
    'apps/suppliers/dist/server.js',
    'apps/worker/dist/worker.js',
    'apps/api/dist/server.js',
    'scripts/web.mjs',
  ])
    handles.push(startNode(entry));
  const workerHandle = handles[1];
  await waitFor(
    () => workerHandle.output().includes('"event":"worker-created"'),
    'worker readiness signal',
    // Native Windows cold startup measured 23 s under test load (including
    // workflow bundling); this infrastructure allowance is not a search budget.
    45000,
  );
  evidence.checks.push(
    'Worker emitted its readiness signal before the workflow started',
  );
  await waitFor(
    async () => (await get('/health', config.apiPort)).service === 'api',
    'API health',
  );
  await waitFor(
    async () =>
      (await get('/health', config.suppliersPort)).service === 'suppliers',
    'suppliers health',
  );
  assert.equal(
    (await get('/ready', config.apiPort)).namespace,
    config.namespace,
  );
  await waitFor(
    async () =>
      (
        await fetch(`http://${config.host}:${config.webPort}`, {
          signal: AbortSignal.timeout(2000),
        })
      ).status === 200,
    'Vite server',
  );
  evidence.checks.push(
    'API /health, API /ready, suppliers /health, blank Vite entry respond',
  );
  const workflowId = `phase1-${randomUUID()}`;
  const token = randomUUID();
  const handle = await temporal.client.workflow.start('infrastructureProbe', {
    taskQueue: config.taskQueue,
    workflowId,
    args: [token],
    workflowExecutionTimeout: '15 seconds',
  });
  const result = await handle.result();
  assert.deepEqual(result, {
    token,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
  });
  const description = await handle.describe();
  assert.equal(description.status.name, 'COMPLETED');
  const history = await handle.fetchHistory();
  assert.ok(
    history.events.some(
      (event) => event.workflowExecutionCompletedEventAttributes,
    ),
  );
  evidence.workflow = {
    workflowId,
    runId: description.runId,
    status: description.status.name,
    result,
    historyEventCount: history.events.length,
  };
  evidence.checks.push(
    'Real workflow COMPLETED on configured queue; history verified',
  );
  await writeFileSyncSafe('artifacts/phase1-workflow-history.json', history);
  // A second execution proves the same API Client/Connection is reusable.
  const second = await temporal.client.workflow.execute('infrastructureProbe', {
    taskQueue: config.taskQueue,
    workflowId: `phase1-reuse-${randomUUID()}`,
    args: ['reuse'],
    workflowExecutionTimeout: '15 seconds',
  });
  assert.equal(second.token, 'reuse');
  evidence.checks.push('Second workflow completed using the same API client');
  const searchHandle = await temporal.client.workflow.start('searchHotels', {
    taskQueue: config.taskQueue,
    workflowId: 'phase3-' + randomUUID(),
    args: [{ city: 'Sydney', checkIn: '2030-10-12', checkOut: '2030-10-15' }],
    workflowExecutionTimeout: '15 seconds',
    retry: { maximumAttempts: 1 },
  });
  const searchResult = await searchHandle.result();
  assert.equal(searchResult.kind, 'result');
  assert.equal(searchResult.best.supplier, 'A');
  assert.equal(searchResult.best.priceMinor, 12000);
  assert.equal(searchResult.partial, false);
  assert.equal((await searchHandle.describe()).status.name, 'COMPLETED');
  evidence.searchWorkflow = {
    workflowId: searchHandle.workflowId,
    result: searchResult,
  };
  evidence.checks.push(
    'Compiled search Workflow and registered HTTP Activities returned the real supplier minimum',
  );
  // Phase 4: the public HTTP boundary, end to end. The API must reach the
  // same compiled Workflow through its reusable Temporal client.
  const apiResponse = await fetch(
    `http://${config.host}:${config.apiPort}/api/search-hotels`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        city: 'Sydney',
        checkIn: '2030-10-12',
        checkOut: '2030-10-15',
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  assert.equal(apiResponse.status, 200);
  const apiResult = await apiResponse.json();
  assert.equal(apiResult.status, 'success');
  assert.equal(apiResult.bestOffer.supplier, 'A');
  assert.equal(apiResult.bestOffer.priceMinor, 12000);
  assert.equal(apiResult.partial, false);
  assert.match(apiResult.searchId, /^hotel-search-[0-9a-f-]{36}$/);
  evidence.apiSearch = {
    searchId: apiResult.searchId,
    bestOffer: apiResult.bestOffer,
    partial: apiResult.partial,
  };
  evidence.checks.push(
    'Real HTTP POST /api/search-hotels returned the compiled workflow result',
  );
} finally {
  const results = await Promise.allSettled(handles.map(stopNode));
  if (temporal) await temporal.close();
  mkdirSync('artifacts', { recursive: true });
  for (let index = 0; index < handles.length; index++)
    writeFileSync(
      `artifacts/phase1-process-${index}.log`,
      handles[index].output(),
    );
  evidence.shutdown = results.map((result) =>
    result.status === 'fulfilled'
      ? result.value
      : { error: String(result.reason) },
  );
  writeFileSync(
    'artifacts/phase1-smoke.json',
    JSON.stringify(evidence, null, 2),
  );
  assert.ok(
    results.every((result) => result.status === 'fulfilled'),
    'All child processes must exit cleanly',
  );
}
for (const port of [config.apiPort, config.suppliersPort, config.webPort])
  await freePort(port);
console.log(JSON.stringify(evidence, null, 2));
console.log(
  'PASS: compiled API and worker, Temporal workflow, health, reusable connection, clean app shutdown and port release.',
);
function writeFileSyncSafe(path, value) {
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}
