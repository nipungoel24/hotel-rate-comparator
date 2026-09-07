import { spawnSync } from 'node:child_process';
const run = (file, args) => {
  const result = spawnSync(process.execPath, [file, ...args], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const projects = [
  'packages/contracts',
  'packages/domain',
  'apps/api',
  'apps/suppliers',
  'apps/worker',
  'apps/web',
];
const build = (noEmit) => {
  for (const project of projects)
    run('node_modules/typescript/bin/tsc', [
      '-p',
      project,
      ...(noEmit ? ['--noEmit'] : []),
    ]);
  if (!noEmit) run('node_modules/vite/bin/vite.js', ['build', 'apps/web']);
};
switch (process.argv[2]) {
  case 'typecheck':
    // Consumers resolve @hotel/* declaration files from dist, so the shared
    // packages must be emitted first; then verify the workspace without emitting.
    for (const project of ['packages/contracts', 'packages/domain']) {
      run('node_modules/typescript/bin/tsc', ['-p', project]);
    }
    build(true);
    // Playwright specs are transpiled by Playwright itself, but they are
    // type-checked here so the e2e suite has an authoritative strict check.
    run('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.e2e.json']);
    break;
  case 'build':
    build(false);
    break;
  case 'check':
    run('node_modules/prettier/bin/prettier.cjs', ['--check', '.']);
    run('node_modules/eslint/bin/eslint.js', ['.']);
    build(false);
    build(true);
    run('node_modules/jest/bin/jest.js', [
      '--config',
      'jest.config.mjs',
      '--runInBand',
    ]);
    run('scripts/smoke.mjs', []);
    break;
  default:
    throw new Error('Expected build, typecheck or check');
}
