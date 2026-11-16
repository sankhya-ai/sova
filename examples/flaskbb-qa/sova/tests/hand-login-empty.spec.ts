// Hand-written: the browser blocks an empty required field, so submit the form without it.
// Expected strings come from flaskbb/auth/forms.py (LoginForm).  [code]
import { expect, test } from '../fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

test('Login with an empty password is refused', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByRole('textbox', { name: 'Username or Email address', exact: true }).fill('alice');
  await page.locator('form').first().evaluate((f: HTMLFormElement) => f.setAttribute('novalidate', ''));
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.locator('.invalid-feedback')).toContainText('Please enter your password.');
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('Login with an empty username is refused', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('whatever');
  await page.locator('form').first().evaluate((f: HTMLFormElement) => f.setAttribute('novalidate', ''));
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.locator('.invalid-feedback')).toContainText('Please enter your username or email address.');
});
