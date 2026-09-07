import { createServer } from 'vite';
import { readInfrastructureConfig } from '@hotel/contracts';
const config = readInfrastructureConfig(process.env);
const server = await createServer({
  root: 'apps/web',
  server: {
    host: config.host,
    port: config.webPort,
    strictPort: true,
    proxy: { '/api': `http://${config.host}:${config.apiPort}` },
  },
});
await server.listen();
console.log(JSON.stringify({ event: 'web-ready', port: config.webPort }));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.close();
  console.log(JSON.stringify({ event: 'web-stopped' }));
  if (process.connected) process.disconnect();
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
process.on('message', (message) => {
  if (message === 'shutdown') void stop();
});
