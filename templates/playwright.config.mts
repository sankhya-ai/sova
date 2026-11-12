// Playwright config for the sova-generated suite. Settings come from sova/config.json.
// Run it with `npx --no-install sova run`, or directly: `npx playwright test -c sova/playwright.config.mts`.
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const sova = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));
const fromRoot = (path: string) => (isAbsolute(path) ? path : join(root, path));

export default defineConfig({
  testDir: fromRoot(sova.specsDir ?? 'sova/tests'),
  outputDir: join(here, '.results', 'artifacts'),
  // Every test must stand alone, so they can all run at once.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: join(here, '.results', 'html'), open: 'never' }]]
    : 'list',
  use: {
    baseURL: process.env.SOVA_BASE_URL ?? sova.baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
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
