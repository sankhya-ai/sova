// Hand-written (an API check, not a browser trail). A regular user must not reach the admin delete-user API.
// The target id does not exist, so a broken guard answers 404 and the intact guard answers 403: nothing is deleted either way.
import { expect, test } from '../fixtures';

test.use({ storageState: process.env.SOVA_AUTH_STATE_USER! });

test('Regular user cannot delete users through the API', async ({ page }) => {
  await page.goto('/settings');
  const nonce = await page.evaluate(() => (window as any).init?.csrfNonce as string);
  expect(nonce).toBeTruthy();
  const res = await page.request.delete('/api/v1/users/999999', { headers: { 'CSRF-Token': nonce, 'Content-Type': 'application/json' } });
  expect(res.status()).toBe(403);
});
