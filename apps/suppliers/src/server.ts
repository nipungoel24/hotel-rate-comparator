import { readInfrastructureConfig } from '@hotel/contracts';
import { createApp } from './app';

const config = readInfrastructureConfig(process.env);
const server = createApp({
  scenarioControlsDisabled:
    process.env.SUPPLIER_SCENARIO_CONTROLS === 'disabled',
}).listen(config.suppliersPort, config.host);
server.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
  if (process.connected) process.disconnect();
});
server.on('listening', () =>
  console.log(
    JSON.stringify({ event: 'suppliers-ready', port: config.suppliersPort }),
  ),
);
let stopping = false;
const stop = (): void => {
  if (stopping) return;
  stopping = true;
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
    console.log(JSON.stringify({ event: 'suppliers-stopped' }));
    if (process.connected) process.disconnect();
  });
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('message', (message: unknown) => {
  if (message === 'shutdown') stop();
});
