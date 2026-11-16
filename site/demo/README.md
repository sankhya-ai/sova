# Real-run capture

Recorded locally on 16 November 2026 using Sova PR #1 at 47beb5f and Trailblaze
v2026.11.12. This is an actual execution, not an animated mockup or fabricated
terminal. The supplied Ledger demo is a small seeded test fixture, not a real
customer app or a production authentication system.

## What the film contains

- Sova opens the demo, types the fixture email and an incorrect password,
  submits, then asserts that "Wrong email or password" is visible.
- `sova save reject-wrong-password` writes the recorded trail and emits the
  included Playwright spec. That spec was not written or repaired by hand.
- `sova check` passes one run with retries off.
- `sova mutate` passes its baseline, removes the password condition, reruns the
  suite and reports that the rejection test caught the break. It restores the
  original source.
- A final `sova check` passes the same generated test again.

One test and one deliberate mutation. This does not prove broad app coverage or
fully autonomous QA. The agent chose this flow and the mutation from the demo's
source. No built-in model or paid LLM call was used. The fixed fixture email
triggers Sova's test-data warning; it is not a registration against a live backend.
The warning remains in the film and transcript.

## Editing and presentation

The MP4 records a composite view while real commands execute: actual browser
screenshots on the left and actual command stdout on the right. Browser captures
refresh after commands, not every animation frame. After saving the flow, the
left side shows the actual generated spec, then an editorially formatted source
diff. The commands and outcomes were not replaced with invented text.

Initial driver setup was trimmed. The remaining clip is about 32 seconds at
normal playback speed. No action sequence or failed test was cut from the final
successful run. Earlier setup attempts were not used as evidence.

The phone version crops the same video: left side for browser/spec, right side
for the break check and restored run. It does not run a separate demo. Native
controls, captions, chapter buttons, and a full-size download are available. No
autoplay. Chapter controls seek within the recording, not a live hosted run.

## Local setup details

Used the repository's `examples/demo-app`, with larger form typography for the
capture. Its behavior was unchanged except for the intentional mutation, which
Sova restored. The original demo source is supplied as `ledger.html`.

The driver initially saved to its home-level trails directory. The demo's
`trails/` was linked to that directory so Sova could detect the saved trail and
rewrite temporary browser refs to durable role/name locators. No Sova engine
code changed. The driver was stopped after saving, before gate/mutation runs,
to reduce memory pressure during capture. Playwright used installed Chromium
via an explicit executablePath and the repo's current Playwright template.

Artifacts:
- `run.txt`: actual command stdout, in order.
- `trail/trail.yaml`: recorded trail with Sova's durable refs.
- `reject-wrong-password.spec.txt`: generated Playwright test, unchanged.
- `mutations.yaml`: exact deliberate source replacement.
- `mutation-result.json`: actual Sova mutation result.
- `gate-result.json`: actual final gate result.

The fixture password shown in the mutation/source is public example data, not a
user credential. No account cookies, tokens or private data appear in the capture.
