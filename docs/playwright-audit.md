# Audit: do Sova's generated Playwright tests follow best practice?

Checked against Playwright's own guidance:
- Best practices: https://playwright.dev/docs/best-practices
- Locators: https://playwright.dev/docs/locators
- Authentication: https://playwright.dev/docs/auth
- Page object models: https://playwright.dev/docs/pom
- Retries and isolation: https://playwright.dev/docs/test-retries

Scope: the generator (`src/emit.ts`, `templates/playwright.config.mts`, lint rules) and the 16 specs Sova produced for the react-admin demo. Reviewed by reading the generated code. This is a review, not a proof that every app is covered.

## Follows the guidance

| Practice | Evidence |
|---|---|
| Prefer role and label locators over CSS or XPath (locators page) | Generated specs use `getByRole(..., { name })`. Lint rejects XPath and element handles, warns on CSS, `.first()`, `.nth()` |
| Web-first assertions, no manual `expect(await ...)` (best practices) | Emitted as `await expect(locator).toBeVisible()` and similar. Lint errors on the manual forms |
| No fixed sleeps | `web_wait` is dropped on emit. Lint errors on `waitForTimeout` and `networkidle` |
| Isolated tests, own context per test (best practices, auth) | One test per file, fresh context, `fullyParallel: true` |
| Authenticate once in a setup project and reuse `storageState` (auth) | Sign-in setup project, session saved to a git-ignored `.auth` folder, secrets via env |
| Secrets not in code | `env('NAME')`, values in `sova/.env` |
| CI hygiene | `forbidOnly` in CI, retries 2 in CI, baseURL, webServer with `reuseExistingServer` |

## Deviations found

Fixed in this PR:
1. **Trace setting.** Playwright recommends trace on first retry in CI, and says not to set it to `on` for every run. Sova used `retain-on-failure`, which records every run. Now `on-first-retry` in CI and `retain-on-failure` locally (retries are 0 locally, so first-retry would give no trace).
2. **Literal test data.** Generated create tests type values like `ada@example.com`. Against a real backend the second run can collide, which breaks isolation. New lint warning `unique-test-data`. It cannot be fixed by the generator alone, because only the agent knows which field must be unique.

Not fixed, listed for follow-up:
3. **Shared login for tests that change data.** The auth guide recommends one shared state for tests without server-side state, and one account per parallel worker for tests that modify server state. Sova always shares one. Risk: parallel create/edit tests on the same account can interfere. Not hit on the demo (in-memory data).
4. **Test titles are the trail id** (`customers-create-valid`), not a sentence describing behaviour. Readable enough, not a convention-follower. Fix is in `sova save` (humanize the title).
5. **No cleanup of created records.** `customers-create-valid` leaves a customer behind. Fine on a throwaway demo, wrong on a shared environment.
6. **No page objects or fixtures.** The POM guide suggests them for large suites. Every spec repeats its navigation and field steps. Not wrong at 16 tests; it will hurt at hundreds. A fixture layer would be a real design change.
7. **`exact: true` on every accessible name.** Stricter than the default substring match. Resists wrong matches, breaks on any copy change. A trade-off, not a violation.
8. **URL assertions are unanchored regexes** (`/customers\/create/`). Used for "still on the form", which only proves a submit did not navigate. The mutation run showed this: see the PR description.
9. **Assertion strength.** 8 of 16 flows are still smoke (a heading is visible). Graded by `sova assertions`.
10. **No grouping or tags.** No `describe` per screen, no `@smoke` tags. Cosmetic until the suite is large.
11. **Video is on (retain-on-failure).** Playwright says use the trace viewer rather than video for CI. Kept because the Allure report uses it.

## What is not checked

Accessibility checks, visual snapshots, cross-browser projects (Chromium only; the guide suggests all browsers), sharding for CI speed, and ESLint `no-floating-promises` on the generated files.
