// Waits until the local Temporal frontend port accepts connections. Used by
// CI between starting scripts/temporal.mjs in the background and running the
// compiled smoke. Fails visibly instead of sleeping a fixed arbitrary time.
import { Socket } from 'node:net';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.TEMPORAL_UI_PORT ?? 7233);
const TIMEOUT_MS = Number(process.env.TEMPORAL_WAIT_TIMEOUT ?? 60000);

function probe() {
  return new Promise((resolveProbe, reject) => {
    const socket = new Socket();
    socket.once('error', reject);
    socket.connect(PORT, HOST, () => {
      socket.destroy();
      resolveProbe(undefined);
    });
  });
}

const deadline = Date.now() + TIMEOUT_MS;
for (;;) {
  try {
    await probe();
    console.log(`Temporal frontend reachable at ${HOST}:${PORT}`);
    break;
  } catch {
    if (Date.now() >= deadline) {
      console.error(
        `Temporal did not become reachable within ${TIMEOUT_MS} ms.`,
      );
      process.exitCode = 1;
      break;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
}
