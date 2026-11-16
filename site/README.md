# Sova product page

Static landing page. No framework, build step, analytics, API keys or runtime
JavaScript dependencies. Nothing here deploys the page.

## Local preview

From the repository root:

```sh
python3 site/serve.py
```

Open http://127.0.0.1:4187. The server binds to loopback only.
Any static file server can serve `site/`.

## Content baseline

Copy describes draft PR #1 at `47beb5f`, not only the default branch. The install
command deliberately targets its development branch. Update that command and
notice after the features land.

Sources: PR #1's README, all `skill-planning/` references, `docs/mobile.md`, CTFd
example files and `examples/flaskbb-qa/RUN-NOTES.md`.

The summary screenshot is a historical CTFd run with three repeats. Current
default: one run, no retries. The nearby caption says so. Playwright screenshots
show an intentional failure. Selected 16/16 mutation trials are not full app
coverage. FlaskBB route/rate-limit gaps stay visible. Phone execution remains
experimental and unproven on a real device or simulator. No hosted runs,
dashboard or automatic self-healing is advertised.

## Redesign

Removed the tilted sheet, stamp, drawn underline, owl wordmark, numbered mono
labels, icon feature trio, dark section, oversized slogans and blue CTA fill.

The page now uses a shared 1100px content grid, one type family, near-white and
charcoal, and blue only for selection/focus/link states. The report is straight,
large and readable, not a background decoration. Report tabs select actual
product captures; they do not simulate a working hosted dashboard.

Reviewed Linear, Vercel, Berd and Stripe for spacing, hierarchy and relationship
between product imagery and page copy. No reference site assets or copy used.

## Assets

Actual supplied Sova and Playwright screenshots, WebP compressed:

- `summary.webp`: original full desktop summary.
- `summary-phone.webp`: original phone-width summary.
- `overview.webp`: desktop summary crop, (100,24) to (1180,620).
- `breaks.webp`: desktop mutation-result crop, (100,1465) to (1180,2115).
- `cases.webp`: desktop case-checklist crop, (100,2650) to (1180,3110).
- `playwright.webp`: original Playwright index.
- `failure.webp`: original failure detail, opened from the Playwright view.

No report content or counts changed. Crops are taken from the supplied 1280px
source, not reconstructed UI. On phones, wide table images scroll inside their
own containers. Clicking opens the full original screenshot.

Self-hosted Geist Latin variable font, distributed under the SIL Open Font
License in `assets/Geist-LICENSE.txt`. No font CDN or external runtime requests.

## Verification and limits

Local Chromium: no page-wide horizontal overflow at 320, 360, 390, 420, 768,
1024, 1440 and 1920 px. Report tabs support arrows, Home and End. Screenshot
dialog supports Escape and focus return. Copy buttons handle success and denial.
No JavaScript or local resource errors. axe-core WCAG 2 A/AA and 2.1 AA scan:
zero violations in the default desktop state, not an accessibility certification.
Desktop, phone, lower page and report views rendered and visually inspected.
Reduced-motion preference disables nonessential transitions.

Not verified: Safari, Firefox, physical phones, screen readers, end-to-end package
installation from the displayed command, or any deployment. Sova's engine and
trial results were not rerun for this page.

Remaining design limits: the report itself is dense, the coverage matrix still
needs horizontal scrolling on a phone, and static captures cannot show the full
record-to-test workflow. A genuine short product recording would communicate
that better than more landing-page decoration.
