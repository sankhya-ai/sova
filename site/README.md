# Sova product page

Static, local-first product landing page. No framework, build step, remote fonts,
analytics, API keys or runtime dependencies. Nothing here deploys the page.

## Preview

From the repository root:

```sh
python3 site/serve.py
```

Open the address printed by the command (http://127.0.0.1:4187).
The server binds to loopback only. Any static file server can serve `site/`.

## Content baseline

This page describes the development build in draft PR #1, head `47beb5f`,
not just the default branch. The install command deliberately names that branch.
Update the command and early-build notice when those changes land.

Sources reviewed:

- `README.md`, `skill-planning/` and `docs/mobile.md` on PR #1.
- `examples/ctfd-qa/`, `examples/flaskbb-qa/RUN-NOTES.md` and their mutations.
- Actual CTFd summary and Playwright captures supplied for this page.

The summary screenshot is historical: its 29/29 result used three repeats.
The current default is one run, with no retries. The caption calls this out.
The Playwright screenshots show an intentional failure, not a current outage.

The 16/16 mutation results are selected trials, not full app coverage or a promise
for another app. FlaskBB's route and rate-limit gaps remain visible on the page.
Phone support is explicitly experimental: no device/simulator execution is claimed.
No hosted runs, SaaS dashboard or automatic self-healing is advertised.

## Assets

- `summary.webp`: supplied full desktop summary screenshot.
- `summary-crop.webp`: top crop of that screenshot, no content changes.
- `summary-phone.webp`: supplied phone-width summary screenshot.
- `playwright.webp`: supplied Playwright report index.
- `failure.webp`: supplied Playwright failure detail.
- `mark.svg`: original small owl mark for this page.

WebP compression only; no invented report data or altered result counts. The
report sections are screenshot previews, not a hosted or interactive Sova dashboard.
All screenshots open in a full-image dialog. Summary uses the real phone capture
at narrow widths. Other report screenshots can scroll horizontally at phone width.

## Design

Electric blue, ink and paper. Oversized plain typography, an evidence-sheet hero,
editorial rules and a small original owl mark. References informed the quality bar,
not copied layouts or assets. No gradient text, fake terminal, invented dashboard,
background blobs, stock testimonials or made-up customer logos. Motion is short,
nonessential and disabled for `prefers-reduced-motion`.

## Verification

Local Chromium checks: 320, 360, 390, 420, 768, 1024, 1440 and 1920 px widths,
with no page-wide horizontal overflow. Tab buttons support arrow keys, Home and
End; full screenshot dialog supports Escape and returns focus. Clipboard success
and denied-access fallback are present. No third-party resource requests.

Automated accessibility scan: axe-core WCAG 2 A/AA and 2.1 AA, zero violations
in the default desktop state. This is not an accessibility certification. Desktop,
phone, report and failure states were rendered and visually inspected.

Not verified: Safari, Firefox, real phones, screen-reader behavior, an end-to-end
package installation from the CTA command, or any deployment. No paid calls.
