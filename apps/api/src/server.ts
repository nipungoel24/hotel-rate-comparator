import { readInfrastructureConfig } from '@hotel/contracts';
import { createApp } from './app';
import { connectTemporal } from './temporal/client';

async function main(): Promise<void> {
  const config = readInfrastructureConfig(process.env);
  const temporal = await connectTemporal(config);
  const server = createApp({
    client: temporal.client,
    taskQueue: config.taskQueue,
  }).listen(config.apiPort, config.host);
  server.on('error', (error) => {
    console.error(error);
    void temporal.close().finally(() => {
      process.exitCode = 1;
    });
  });
  server.on('listening', () =>
    console.log(
      JSON.stringify({
        event: 'api-ready',
        port: config.apiPort,
        namespace: config.namespace,
      }),
    ),
  );
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    server.close((error) => {
      void temporal
        .close()
        .then(() => {
          if (error) {
            console.error(error);
            process.exitCode = 1;
          }
          console.log(JSON.stringify({ event: 'api-stopped' }));
          if (process.connected) process.disconnect();
        })
        .catch((failure: unknown) => {
          console.error(failure);
          process.exitCode = 1;
        });
    });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('message', (message: unknown) => {
    if (message === 'shutdown') stop();
  });
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
  if (process.connected) process.disconnect();
});
