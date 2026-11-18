import { expect, test } from '@playwright/test';

// E2E ở P0 chỉ kiểm tra frontend; API được giả lập qua page.route.
// Từ P1 sẽ chạy cùng backend thật.

test('trang chủ hiển thị tiêu đề và trạng thái hệ thống', async ({ page }) => {
  await page.route('**/api/health/ready', (route) =>
    route.fulfill({ json: { status: 'ok', checks: { database: 'up', redis: 'up' } } }),
  );

  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Olympia Online' })).toBeVisible();
  await expect(page.getByText('Hệ thống hoạt động bình thường.')).toBeVisible();
});

test('trang chủ không bị tràn ngang', async ({ page }) => {
  await page.route('**/api/health/ready', (route) =>
    route.fulfill({ json: { status: 'ok', checks: {} } }),
  );

  await page.goto('/');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('đường dẫn không tồn tại hiển thị trang 404', async ({ page }) => {
  await page.route('**/api/health/ready', (route) =>
    route.fulfill({ json: { status: 'ok', checks: {} } }),
  );

  await page.goto('/khong-ton-tai');

  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
});
