/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Tạo database test và chạy migration (cần PostgreSQL của npm run services:up).
  globalSetup: '<rootDir>/src/test/global-setup.ts',
  testTimeout: 15000,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  moduleNameMapper: {
    // Dùng mã nguồn TS của gói shared, không cần build trước khi test.
    '^@olympia/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    // Import tương đối có đuôi .js (chuẩn nodenext) trỏ về file .ts.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
