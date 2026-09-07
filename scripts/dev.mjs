import { startNode, stopNode } from './processes.mjs';
const entries = [
  'apps/suppliers/dist/server.js',
  'apps/worker/dist/worker.js',
  'apps/api/dist/server.js',
  'scripts/web.mjs',
];
const handles = entries.map((entry) => startNode(entry));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const results = await Promise.allSettled(handles.map(stopNode));
  if (results.some((result) => result.status === 'rejected')) {
    console.error(results);
    process.exitCode = 1;
  }
  if (process.connected) process.disconnect();
}
for (const handle of handles) {
  handle.child.stdout.pipe(process.stdout);
  handle.child.stderr.pipe(process.stderr);
  void handle.exited
    .then((result) => {
      if (!stopping) {
        console.error('An application process exited', result);
        process.exitCode = 1;
        void stop();
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
      void stop();
    });
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
process.on('message', (message) => {
  if (message === 'shutdown') void stop();
});
