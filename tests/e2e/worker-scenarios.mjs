// Test-only worker launcher: same compiled activities as production, but the
// deterministic supplier scenarios are wired here for e2e orchestration.
// Scenario controls never reach the public API surface.
import { fileURLToPath } from 'node:url';
import { NativeConnection, Worker } from '@temporalio/worker';
import { createSupplierActivities } from '../../apps/worker/dist/activities/index.js';
import { readInfrastructureConfig } from '@hotel/contracts';

const workflowsPath = fileURLToPath(
  new URL('../../apps/worker/dist/workflows/index.js', import.meta.url),
);

const scenarioA = process.env.E2E_SUPPLIER_A_SCENARIO ?? 'normal';
const scenarioB = process.env.E2E_SUPPLIER_B_SCENARIO ?? 'normal';
const config = readInfrastructureConfig(process.env);

const activities = createSupplierActivities({
  A: {
    baseUrl: config.supplierABaseUrl,
    headers: { 'x-hotel-scenario': scenarioA },
  },
  B: {
    baseUrl: config.supplierBBaseUrl,
    headers: { 'x-hotel-scenario': scenarioB },
  },
});

const connection = await NativeConnection.connect({
  address: config.temporalAddress,
});
try {
  const worker = await Worker.create({
    connection,
    activities,
    maxHeartbeatThrottleInterval: 250,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    workflowsPath,
    shutdownGraceTime: '5 seconds',
  });
  const stop = () => {
    if (worker.getState() === 'RUNNING') worker.shutdown();
  };
  process.on('message', (message) => {
    if (message === 'shutdown') stop();
  });
  console.log(
    JSON.stringify({
      event: 'worker-created',
      scenarioA,
      scenarioB,
      taskQueue: config.taskQueue,
    }),
  );
  await worker.run();
  console.log(JSON.stringify({ event: 'worker-stopped' }));
} finally {
  await connection.close();
  if (process.connected) process.disconnect();
}
