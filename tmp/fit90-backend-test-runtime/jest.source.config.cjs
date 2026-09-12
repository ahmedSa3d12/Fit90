module.exports = {
  rootDir: 'E:/final_projects/asmaa/23-8-2026/FIT90_19-8/release/FIT90-FULL-update-20260906/backend/src',
  testRegex: '.*employees\\.service\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  moduleDirectories: [
    'E:/final_projects/asmaa/23-8-2026/FIT90_19-8/tmp/fit90-backend-test-runtime/node_modules',
    'node_modules',
  ],
};
