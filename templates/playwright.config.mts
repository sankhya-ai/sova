// Playwright config for the sova-generated suite. Settings come from sova/config.json.
// Run it with `npx --no-install sova run`, or directly: `npx playwright test -c sova/playwright.config.mts`.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices, type ReporterDescription } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const sova = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));
const fromRoot = (path: string) => (isAbsolute(path) ? path : join(root, path));

// Secrets for flows (test account passwords) live in sova/.env, which is git-ignored.
// In CI, set the same names as environment variables instead; those win.
const envFile = join(here, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

// When a sign-in flow is configured it runs first, and the other tests start from its session.
const signsIn = Boolean(sova.login?.trail);
const authState = join(here, '.auth', 'user.json');
process.env.SOVA_AUTH_STATE = authState;

// Allure results are written when allure-playwright is installed; `sova report` builds the report.
const hasAllure = (() => {
  try {
    createRequire(import.meta.url).resolve('allure-playwright');
    return true;
  } catch {
    return false;
  }
})();
const reporter: ReporterDescription[] = [
  [process.env.CI ? 'github' : 'list'],
  ['html', { outputFolder: join(here, '.results', 'html'), open: 'never' }],
];
if (hasAllure) reporter.push(['allure-playwright', { resultsDir: join(here, '.results', 'allure-results') }]);

export default defineConfig({
  testDir: fromRoot(sova.specsDir ?? 'sova/tests'),
  outputDir: join(here, '.results', 'artifacts'),
  // Every test must stand alone, so they can all run at once.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Optional in sova/config.json, for apps whose backend is slow when several tests run at once.
  workers: sova.workers,
  expect: { timeout: sova.expectTimeout ?? 5_000 },
  reporter,
  use: {
    baseURL: process.env.SOVA_BASE_URL ?? sova.baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: signsIn
    ? [
        { name: 'sign-in', testMatch: /.*\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'], storageState: authState },
          dependencies: ['sign-in'],
        },
      ]
    : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: sova.startCommand
    ? {
        command: sova.startCommand,
        cwd: root,
        url: sova.baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
