# Sova product page

Static landing page. No framework, build step, analytics, API keys, external
runtime requests or JavaScript dependencies. Nothing here deploys the page.

## Local preview

From the repository root:

```sh
python3 site/serve.py
```

Open http://127.0.0.1:4187. Loopback only. Any static server can serve `site/`.

## Design: make the test prove itself

The page's visual material is the product doing its job: a real browser flow,
the generated test, a deliberate source edit and the captured mutation result.
An asymmetric side rail becomes chapter navigation for the recording. Bricolage
Grotesque gives the headings and wordmark a less anonymous voice; Geist stays
quiet for reading. Paper and charcoal, with one sparse blue accent. No gradients,
glows, decorative dashboard, glass, stamp, floating sheet or feature-card trio.

Actual screenshots studied from Awwwards, Godly, Raycast, Resend, Cursor, Arc,
Vercel and Readymag, plus prior Linear and Stripe captures. Useful distinctions:
Cursor makes the editor the subject; Raycast has a strong directional visual
motif; Resend contrasts editorial and technical type; Readymag has irregular
rhythm and unmistakable typography. The page borrows principles, not assets or
layouts. Siteinspire was inaccessible and Berd did not yield a usable finished
capture, so neither is claimed as a completed visual study.

## Hero recording

The approximately 32-second MP4 is an actual local run of Sova PR #1 at
`47beb5f`, using Trailblaze v2026.11.12. Sova drove a rejection flow on the seeded
Ledger demo, generated the Playwright test, passed its gate, caught an intentional
password-check bypass, restored the source and passed again. No paid model calls.

It is a composite screen recording, not a continuous native desktop capture:
browser screenshots refresh after commands; actual CLI stdout streams beside
them. The generated source and mutation diff replace the browser view for the
later stages. Initial setup is trimmed. The phone video crops the same capture
rather than shrinking both panels to illegibility. No autoplay. Native controls,
English captions, chapter seeking, transcript and download links are provided.
A click-to-play still uses a frame from the actual recording, not mock UI.

Full provenance, local setup workarounds, fixture source, trail, generated spec,
mutation and result files are in `demo/`. The test-data warning remains visible.
This is one agent-chosen flow and one bug on a small fixture, not evidence of
whole-app autonomous coverage. No engine code was changed for the page.

## Other product evidence

Content baseline: PR #1 at `47beb5f`, including all `skill-planning/` references,
`docs/mobile.md`, CTFd examples and FlaskBB run notes. The install command targets
that development branch deliberately. Update it when those features land.

The larger summary screenshot is a historical CTFd run with three repeats.
Current default is one run, no retries; the caption says so. Playwright shows an
intentional failure. Selected 16/16 mutation trials are not full app coverage.
FlaskBB route/rate-limit gaps are stated. Real device/simulator phone execution
remains unproven. No hosted service or automatic self-healing is advertised.

Supplied product screenshots, WebP compressed with no count/content changes:

- `summary.webp`: full desktop summary.
- `summary-phone.webp`: phone-width summary.
- `overview.webp`: summary crop, (100,24) to (1180,620).
- `breaks.webp`: mutation-result crop, (100,1465) to (1180,2115).
- `playwright.webp`: Playwright index.
- `failure.webp`: full Playwright failure detail.

Self-hosted Geist and Bricolage Grotesque Latin fonts with their OFL licenses.

## Checks and remaining limits

Local Chromium: no page-wide overflow at 320/360/390/420/768/1024/1440/1920 px.
Report tabs, keyboard arrows/Home, full-image dialog/Escape/focus return and
clipboard success checked. Video playback/pause, chapter seek/active state,
no autoplay and correct desktop/phone media sources checked. No page JS or local
resource errors. axe-core WCAG 2 A/AA and 2.1 AA returned zero violations in the
default desktop state, not an accessibility certification. Desktop/phone hero,
full pages, lower sections and video frames visually inspected.

Not verified: Safari/Firefox, physical phones, screen readers, end-to-end package
installation from the displayed command, or deployment. Existing CTFd/FlaskBB
trials were not rerun for the page; the new Ledger demonstration was run.

Self-critique: the point of view now comes from deliberate breaking, not generic
marketing sections. The report area remains dense. The small seeded demo is
honest but less impressive than a longer realistic app workflow. Phone terminal
text is still better fullscreen or as a downloaded film/transcript. The page has
a stronger identity, but it is still an early product page, not a finished brand
system or a claim to award-level execution.
