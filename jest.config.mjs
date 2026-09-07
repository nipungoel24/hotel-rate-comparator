/** @type {import('jest').Config} */
const shared = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@hotel/contracts/hotels$': '<rootDir>/packages/contracts/src/hotels.ts',
    '^@hotel/contracts$': '<rootDir>/packages/contracts/src/index.ts',
    '^@hotel/domain$': '<rootDir>/packages/domain/src/index.ts',
  },
};

export default {
  testTimeout: 30000,
  projects: [
    ...['activity', 'workflow', 'integration'].map((name) => ({
      ...shared,
      displayName: name,
      testMatch: [`<rootDir>/tests/${name}/**/*.test.ts`],
    })),
    {
      ...shared,
      displayName: 'api',
      testMatch: ['<rootDir>/tests/api/**/*.test.ts'],
    },
    {
      displayName: 'web',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/tests/web/**/*.test.ts',
        '<rootDir>/tests/web/**/*.test.tsx',
      ],
      setupFilesAfterEnv: ['<rootDir>/tests/web/setup.ts'],
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          { tsconfig: '<rootDir>/tests/web/tsconfig.json' },
        ],
      },
      moduleNameMapper: {
        '^@hotel/contracts/hotels$':
          '<rootDir>/packages/contracts/src/hotels.ts',
        '^@hotel/contracts$': '<rootDir>/packages/contracts/src/index.ts',
        '^@hotel/domain$': '<rootDir>/packages/domain/src/index.ts',
        '^@/(.*)$': '<rootDir>/apps/web/src/$1',
        '^morphicons/react$': '<rootDir>/tests/web/morphicons-stub.tsx',
        '\\.css$': '<rootDir>/tests/web/style-stub.js',
      },
    },
    {
      ...shared,
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
    },
    {
      ...shared,
      displayName: 'suppliers',
      testMatch: ['<rootDir>/tests/suppliers/**/*.test.ts'],
    },
  ],
};
