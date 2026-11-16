// Hand-written. The browser's own form checks stop an empty password and a malformed email before they
// reach the server, so these post the form directly to test the server-side validation.
import { expect, test } from '../fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

async function register(page: import('@playwright/test').Page, fields: Record<string, string>) {
  await page.goto('/register');
  const nonce = await page.locator('input[name=nonce]').inputValue();
  const res = await page.request.post('/register', { form: { nonce, ...fields } });
  return res.text();
}

test('Server rejects an empty password', async ({ page }) => {
  const body = await register(page, { name: 'sova-nopass', email: `sova-nopass+${Date.now()}@example.com`, password: '' });
  expect(body).toContain('Pick a longer password');
});

test('Server rejects an invalid email', async ({ page }) => {
  const body = await register(page, { name: 'sova-bademail', email: 'not-an-email', password: 'secret-pass-123' });
  expect(body).toContain('Please enter a valid email address');
});
