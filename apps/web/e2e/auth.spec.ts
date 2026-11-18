import { expect, type Page, test } from '@playwright/test';

// API được giả lập qua page.route; luồng thật với backend được kiểm tra bằng test tích hợp API.

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'an@example.com',
  displayName: 'Nguyễn An',
  avatarUrl: null,
  emailVerified: false,
  systemRole: 'member',
  canHost: true,
  organizationId: null,
};

async function mockBackend(page: Page) {
  await page.route('**/api/health/ready', (route) =>
    route.fulfill({ json: { status: 'ok', checks: {} } }),
  );
  await page.route('**/api/auth/login', async (route) => {
    const body = route.request().postDataJSON() as { password: string };
    if (body.password !== 'Mat-khau-123') {
      await route.fulfill({
        status: 401,
        json: {
          error: { code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không đúng.' },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        accessToken: 'token',
        accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
        user,
      },
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('đăng nhập sai báo lỗi, đúng thì vào trang tài khoản', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/tai-khoan');

  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByLabel('Email').fill('an@example.com');
  await page.getByLabel('Mật khẩu').fill('sai-mat-khau');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu không đúng.');

  await page.getByLabel('Mật khẩu').fill('Mat-khau-123');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  await expect(page.getByRole('heading', { name: 'Tài khoản' })).toBeVisible();
  await expect(page.getByText('Email chưa được xác minh.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Tài khoản' })).toContainText('Nguyễn An');
  await expectNoHorizontalOverflow(page);
});

test('trang đăng ký không bị tràn ngang', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/dang-ky');

  await expect(page.getByRole('heading', { name: 'Đăng ký' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
