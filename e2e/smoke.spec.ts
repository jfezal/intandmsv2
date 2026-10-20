import { expect, test } from '@playwright/test';

test.describe('IntanDMS web smoke', () => {
  test('login screen renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByLabel('Login')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('API health reachable via web proxy when stack is up', async ({ request }) => {
    const response = await request.get('/api/v1/health').catch(() => null);
    test.skip(!response, 'API not running — start dev:api + dev:web for full smoke');
    expect(response!.ok()).toBeTruthy();
  });
});
