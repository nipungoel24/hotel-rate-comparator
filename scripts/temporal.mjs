import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readInfrastructureConfig } from '@hotel/contracts';

const config = readInfrastructureConfig(process.env);
const binary = resolve(
  '.tools/temporal/1.8.3',
  process.platform === 'win32' ? 'temporal.exe' : 'temporal',
);
const version = spawnSync(binary, ['--version'], {
  encoding: 'utf8',
  windowsHide: true,
});
if (
  version.error ||
  version.status !== 0 ||
  !version.stdout.includes('temporal version 1.8.3 ')
) {
  throw new Error('Install the pinned CLI first: npm run setup:temporal', {
    cause: version.error,
  });
}
mkdirSync('.temporal', { recursive: true });
const [ip, port] = config.temporalAddress.split(':');
const child = spawn(
  binary,
  [
    'server',
    'start-dev',
    '--ip',
    ip,
    '--port',
    port,
    '--ui-port',
    String(config.temporalUiPort),
    '--namespace',
    config.namespace,
    '--db-filename',
    resolve('.temporal/dev.db'),
  ],
  { stdio: 'inherit', windowsHide: true },
);
// A terminal Ctrl+C reaches the native child in the same Windows console.
// Do not use child.kill('SIGINT'): Windows turns it into forcible termination.
process.on('SIGINT', () => {});
process.on('SIGTERM', () => {
  if (child.exitCode === null) child.kill('SIGTERM');
});
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
