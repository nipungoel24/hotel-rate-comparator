import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export function startNode(file, args = [], env = {}) {
  const child = spawn(
    process.execPath,
    ['--env-file-if-exists=.env', file, ...args],
    {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return { child, exited, output: () => output };
}
export async function stopNode(handle) {
  if (handle.child.exitCode !== null || handle.child.signalCode !== null) {
    const result = await handle.exited;
    if (result.code !== 0)
      throw new Error(
        `Process already failed: ${JSON.stringify(result)}\n${handle.output()}`,
      );
    return result;
  }
  handle.child.send('shutdown');
  const result = await Promise.race([
    handle.exited,
    delay(10000).then(() => null),
  ]);
  if (!result) {
    handle.child.kill();
    throw new Error(
      'Graceful shutdown exceeded 10 seconds (forced cleanup is a test failure).',
    );
  }
  if (result.code !== 0)
    throw new Error(
      `Shutdown failed: ${JSON.stringify(result)}\n${handle.output()}`,
    );
  return result;
}
export async function waitFor(check, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}`, { cause: lastError });
}
