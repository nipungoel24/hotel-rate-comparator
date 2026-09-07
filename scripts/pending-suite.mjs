console.error(
  `Suite "${process.argv[2]}" is not implemented in Phase 1. Run npm run test:smoke for infrastructure; product suites arrive in their approved phases.`,
);
process.exitCode = 1;
