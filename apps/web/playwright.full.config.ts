import { defineConfig, devices } from '@playwright/test';

/**
 * E2E đầy đủ với backend thật (P8): API trên database riêng `olympia_e2e` (cổng 3100) và web
 * (cổng 5174). Cần `npm run services:up`. Chạy: `npm run test:e2e:full`.
 */
const WEB_PORT = 5174;
const API_PORT = 3100;

export default defineConfig({
  testDir: './e2e/full',
  // Các trận dùng chung một Host: chạy tuần tự để giới hạn phòng mở của Host không bị vượt.
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    {
      command: 'npm run e2e:server -w @olympia/api',
      cwd: '../..',
      url: `http://localhost:${API_PORT}/api/health/live`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { VITE_API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
