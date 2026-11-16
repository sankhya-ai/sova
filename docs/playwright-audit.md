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

3. **Test titles** were the trail id. `sova emit` now turns an id into a sentence ("Customers create valid"). A title that is already a sentence is left alone.
4. **Cleanup and fixtures.** `sova init` now writes `sova/fixtures.ts` once. Generated specs import `test` and `expect` from it, so shared setup, page objects and an auto `cleanup` fixture live in one place. The template only provides the hook. What to delete is app specific, so the agent or developer registers it. On the react-admin demo the data is in memory, so there is nothing to clean up and no cleanup was written.
5. **Per-run unique data.** `sova act type text=unique:<value>` records `{{unique.<value>}}`; the spec then types a value made unique per run. This clears the `unique-test-data` warning on the demo.
6. **Weak "still on URL" checks.** Where the app shows an error, the flow now asserts it: the field-level "Required" error, or the browser's own `:invalid` state when native validation blocks the submit. One remains: the signed-out redirect asserts the login route, because the login page rendered blank after that redirect in the demo.
7. **Smoke-only flows.** The 8 smoke flows each got one real interaction (sort flips, open the create form, open a row, navigate by menu). These are light checks of behaviour, not data-changing flows.

Not fixed, listed for follow-up:
8. **Shared login for tests that change data.** The auth guide recommends one account per parallel worker for tests that modify server state. Sova always shares one.
9. **Page objects.** The fixture file is the place for them, but Sova does not generate any.
10. **`exact: true` on every accessible name.** A trade-off, not a violation.
11. **No grouping or tags.** No `describe` per screen, no `@smoke` tags.
12. **Video is on (retain-on-failure).** Kept because the Allure report uses it.
13. **CSS locators.** The new checks use four `css=` refs (for example the first visible `p.Mui-error`). The linter warns on them. A `data-testid` in the app would remove that.

## What is not checked

Accessibility checks, visual snapshots, cross-browser projects (Chromium only; the guide suggests all browsers), sharding for CI speed, and ESLint `no-floating-promises` on the generated files.
