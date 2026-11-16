// Hand-written. Server rules a browser form never sends: empty or oversized fields, rate limits, API calls with bad input.
// Each test starts with empty rate-limit counters (see fixtures.ts), so the rate-limit test is the only one that hits a limit.
import { expect, test } from '../fixtures';

const api = process.env.SOVA_BASE_URL ?? 'http://127.0.0.1:4000';
const token = () => ({ Authorization: `Token ${process.env.CTFD_ADMIN_TOKEN}`, 'Content-Type': 'application/json' });

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  async function postForm(page: import('@playwright/test').Page, path: string, fields: Record<string, string>) {
    await page.goto(path);
    const nonce = await page.locator('input[name=nonce]').inputValue();
    const res = await page.request.post(path, { form: { nonce, ...fields } });
    return { status: res.status(), body: await res.text() };
  }

  test('Login with empty fields is rejected', async ({ page }) => {
    const { body } = await postForm(page, '/login', { name: '', password: '' });
    expect(body).toContain('Your username or password is incorrect');
  });

  test('Login is rate limited after 10 wrong attempts', async ({ page }) => {
    const results: number[] = [];
    for (let i = 0; i < 12; i++) results.push((await postForm(page, '/login', { name: 'qa-user', password: `wrong-${i}` })).status);
    expect(results.slice(0, 10).every((s) => s !== 429)).toBe(true);
    expect(results.slice(10)).toContain(429);
  });

  test('Register with an empty name is rejected', async ({ page }) => {
    const { body } = await postForm(page, '/register', { name: '', email: 'sova-empty@example.com', password: 'secret-pass-123' });
    expect(body).toContain('Pick a longer user name');
  });

  test('Register with a password over 128 characters is rejected', async ({ page }) => {
    const { body } = await postForm(page, '/register', { name: 'sova-longpass', email: 'sova-longpass@example.com', password: 'x'.repeat(129) });
    expect(body).toContain('Pick a shorter password');
  });

  test('An unknown user page is not found', async ({ page }) => {
    expect((await page.request.get('/users/999999')).status()).toBe(404);
  });

  test('The scoreboard lists nobody while nothing is solved', async ({ page }) => {
    const body = await (await page.request.get('/scoreboard')).text();
    expect(body).not.toContain('qa-solver');
  });
});

test.describe('signed in as the solver', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('An empty flag is not accepted', async ({ page }) => {
    await page.goto('/login');
    const nonce = await page.locator('input[name=nonce]').inputValue();
    await page.request.post('/login', { form: { nonce, name: process.env.SOLVER_NAME!, password: process.env.SOLVER_PASSWORD! } });
    await page.goto('/challenges');
    const csrf = await page.evaluate(() => (window as any).init?.csrfNonce as string);
    const res = await page.request.post('/api/v1/challenges/attempt', { headers: { 'CSRF-Token': csrf, 'Content-Type': 'application/json' }, data: { challenge_id: 1, submission: '' } });
    const body = await res.json();
    expect(body.data?.status).not.toBe('correct');
  });
});

test('Admin API rejects a second user with a taken name', async ({ request }) => {
  const res = await request.post(`${api}/api/v1/users`, { headers: token(), data: { name: 'qa-user', email: 'sova-other@example.com', password: 'secret-pass-123', type: 'user', verified: true, hidden: false, banned: false } });
  expect(res.status()).toBe(400);
});
