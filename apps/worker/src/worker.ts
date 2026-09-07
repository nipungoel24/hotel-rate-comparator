import { NativeConnection, Worker } from '@temporalio/worker';
import { readInfrastructureConfig } from '@hotel/contracts';
import { createSupplierActivities } from './activities';

async function main(): Promise<void> {
  const config = readInfrastructureConfig(process.env);
  const activities = createSupplierActivities({
    A: { baseUrl: config.supplierABaseUrl },
    B: { baseUrl: config.supplierBBaseUrl },
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
      workflowsPath: require.resolve('./workflows'),
      shutdownGraceTime: '5 seconds',
    });
    const stop = (): void => {
      if (worker.getState() === 'RUNNING') worker.shutdown();
    };
    process.on('message', (message: unknown) => {
      if (message === 'shutdown') stop();
    });
    console.log(
      JSON.stringify({
        event: 'worker-created',
        namespace: config.namespace,
        taskQueue: config.taskQueue,
      }),
    );
    await worker.run();
    console.log(JSON.stringify({ event: 'worker-stopped' }));
  } finally {
    await connection.close();
    if (process.connected) process.disconnect();
  }
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
  if (process.connected) process.disconnect();
});
