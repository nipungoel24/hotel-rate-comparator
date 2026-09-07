// Cross-platform installer for the project-pinned Temporal CLI. Mirrors the
// Windows PowerShell script's verification policy: official release archive,
// SHA256 verified against the release's checksums.txt, installed project-local
// under .tools/temporal/<version>/ (ignored by Git).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VERSION = '1.8.3';
const RELEASE = `https://github.com/temporalio/cli/releases/download/v${VERSION}`;

function platformTarget() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'win32' && arch === 'x64')
    return { name: 'windows_amd64', archive: 'zip', binary: 'temporal.exe' };
  if (platform === 'win32' && arch === 'arm64')
    return { name: 'windows_arm64', archive: 'zip', binary: 'temporal.exe' };
  if (platform === 'linux' && arch === 'x64')
    return { name: 'linux_amd64', archive: 'tar.gz', binary: 'temporal' };
  if (platform === 'linux' && arch === 'arm64')
    return { name: 'linux_arm64', archive: 'tar.gz', binary: 'temporal' };
  if (platform === 'darwin' && arch === 'x64')
    return { name: 'darwin_amd64', archive: 'tar.gz', binary: 'temporal' };
  if (platform === 'darwin' && arch === 'arm64')
    return { name: 'darwin_arm64', archive: 'tar.gz', binary: 'temporal' };
  throw new Error(
    `Unsupported platform for the pinned CLI: ${platform}/${arch}`,
  );
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok)
    throw new Error(`Download failed (${response.status}): ${url}`);
  const body = new Uint8Array(await response.arrayBuffer());
  const { writeFileSync } = await import('node:fs');
  writeFileSync(destination, body);
  return body;
}

function verifyChecksum(archivePath, checksumsPath, archiveName) {
  const checksums = readFileSync(checksumsPath, 'utf8');
  const line = checksums
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.endsWith(archiveName));
  if (!line) throw new Error('Archive checksum entry missing or ambiguous.');
  const expected = line.split(/\s+/)[0].toLowerCase();
  const actual = createHash('sha256')
    .update(readFileSync(archivePath))
    .digest('hex')
    .toLowerCase();
  if (actual !== expected)
    throw new Error('Temporal archive checksum mismatch.');
  return actual;
}

function extract(archivePath, target) {
  // Both Windows (bsdtar) and POSIX ship a tar that handles zip and tar.gz.
  const result = spawnSync('tar', ['-xf', archivePath, '-C', target], {
    stdio: 'inherit',
  });
  if (result.status !== 0)
    throw new Error('Temporal archive extraction failed.');
}

function verifyBinary(binaryPath) {
  const result = spawnSync(binaryPath, ['--version'], { encoding: 'utf8' });
  if (
    result.status !== 0 ||
    !result.stdout.includes(`temporal version ${VERSION} `)
  )
    throw new Error('Temporal version verification failed.');
}

const target = resolve('.tools/temporal', VERSION);
const { name, archive: archiveKind, binary } = platformTarget();
const archiveName = `temporal_cli_${VERSION}_${name}.${archiveKind}`;
const archivePath = resolve(target, archiveName);
const checksumsPath = resolve(target, 'checksums.txt');
const binaryPath = resolve(target, binary);

mkdirSync(target, { recursive: true });
try {
  await download(`${RELEASE}/${archiveName}`, archivePath);
  await download(`${RELEASE}/checksums.txt`, checksumsPath);
  const digest = verifyChecksum(archivePath, checksumsPath, archiveName);
  extract(archivePath, target);
  if (process.platform !== 'win32') chmodSync(binaryPath, 0o755);
  verifyBinary(binaryPath);
  console.log(`Verified SHA256: ${digest}`);
  console.log(
    `Installed official release at ${binaryPath} (project-local; npm scripts resolve this path).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
