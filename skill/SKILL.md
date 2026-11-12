---
name: sova
description: >
  Test a web app end to end with no hand-written tests: map every screen from the
  code, drive each one with Trailblaze, save the trails, generate Playwright specs
  with sova, and gate them. Use when asked to "test this app", "add e2e tests",
  "cover this screen", or to fix or refresh sova-generated tests.
---

# sova

You are producing a Playwright suite for this project's web app without anyone writing
tests by hand. You have something a recorder does not: the source code. Use it to find
every screen, to know what each one is for, and to decide what must be asserted.

The pipeline, and who owns each artifact:

| Artifact | Written by | Edited by hand? |
|---|---|---|
| `sova/screens.yaml` | you, from the code | yes, by you |
| `trails/<id>/trail.yaml` | Trailblaze, from your driving | only via Trailblaze |
| `sova/tests/<id>.spec.ts` | `sova emit` | never; change the trail and re-emit |

Run every command as `npx --no-install sova <command>`. `--no-install` matters: an unrelated package named `sova` exists on npm, and plain `npx sova` would download it if this project's own copy were missing.

## 0. Preflight

1. `sova doctor`. If anything is missing, run `sova init`: it detects how the app
   starts, installs Playwright, Chromium and Trailblaze, and is safe to re-run. It
   installs software on the user's machine, so say so before you run it.
2. Open `sova/config.json` and check `baseURL` and `startCommand` against the dev
   server config in the code. `sova init` guesses them from `package.json`; you can
   read the real values. Fix them if they are wrong.
3. Run `trailblaze skill show` and follow it for every Trailblaze command. It matches
   the installed CLI; the commands below are the shape, not the reference.

## 1. Map the screens

Read the router (route table, `pages/` or `app/` directory, navigation components) and
write every distinct screen into `sova/screens.yaml`:

```yaml
screens:
  - id: login
    route: /login
    source: src/pages/Login.tsx
    trails: []
```

- A screen is a place with its own set of actions. A modal or wizard step with its own
  form counts. The same list with different data does not.
- Include screens only reachable by role (admin) or state (empty, error, loading
  failure). The code shows you these; a crawler would miss them.
- For each screen note, for yourself, what a user does there and what proves it worked.
  Those become the flows and assertions in step 2.
- A screen you must not exercise gets `skip: <reason>`, never silence.

**Ask before driving anything that cannot be undone or that reaches outside the app:**
payments, sending email or messages, deleting real data, changing credentials, third
party OAuth. Offer the alternative (a sandbox account, a seeded record, a `skip:`).

## 2. Drive and record each flow

One trail per behaviour, not per screen: "log in", "log in with a wrong password",
"change the display name". Short trails fail for one reason and are cheap to re-record.

```bash
trailblaze tool -d web/playwright-native web_navigate url=<baseURL>/login -s "Open the login page"
trailblaze snapshot -d web/playwright-native          # read the screen, get refs
trailblaze tool -d web/playwright-native web_type ref=<ref> text="ada@example.com" -s "Type the email"
trailblaze tool -d web/playwright-native web_click ref=<ref> -s "Click Sign in"
trailblaze tool -d web/playwright-native web_verifyElementVisible ref=<ref> -s "The dashboard heading is shown"
trailblaze session save -t "<id>"                     # writes trails/<id>/trail.yaml
trailblaze session stop -d web/playwright-native      # next flow starts clean
```

Rules that decide whether the generated test is any good:

- **Every trail ends by verifying the outcome**, and verifies after each step whose
  result matters. Clicking Save proves nothing; the saved value showing on reload does.
  Use `web_verifyElementVisible` and `web_verifyValue`.
- **Assert what the user came for**, taken from the code's intent: the success message,
  the new row, the changed URL. Do not assert incidental copy, timestamps, counts or
  ids that change between runs.
- **Each trail starts from a fresh browser** and sets up what it needs. Never rely on
  a previous trail having run.
- **Use only `web_*` primitives.** sova cannot see inside custom scripted tools, and
  it drops `web_wait`: if a step needs time, verify the thing you are waiting for.
- **No secrets in a trail.** Use a throwaway test account. If the only credentials
  available are real, stop and ask.
- Always pass `-s "<what this step is for>"`. It becomes the step name in the test.

After saving, list the trail's id under its screen's `trails:` in `sova/screens.yaml`.

## 3. Generate the tests

```bash
sova emit
```

- `wrote` / `current`: the spec is in `sova/tests/`.
- `blocked`: the message says which step and why. Fix the cause and re-record that
  flow; do not hand-write the spec.
- `note:` lines are selector weaknesses. A CSS or positional locator means the element
  has no unique accessible name. You can fix that at the source: give the element a
  proper label or a `data-testid` in the app's code, tell the user you did, re-record
  the step, and re-emit. That is better than a brittle test.

## 4. Gate

```bash
sova check          # specs current, lint clean, 5 passes in a row with no retries
sova coverage       # every screen has a working trail or a skip reason
```

A test that fails the gate is not done. Read the failure, then decide which is true:

- the app has a real bug: report it to the user with the trace; do not weaken the test;
- the trail asserted something unstable: re-record with a stable assertion;
- the test depends on leftover state: make the trail set up its own state.

Never make the gate pass by deleting an assertion, adding a wait, or lowering
`--repeat`.

## 5. Hand over

Tell the user, briefly: screens covered / skipped (with reasons) / uncovered, anything
blocked, any app bugs found, any `data-testid` you added. Then how to run it:

```bash
npx --no-install sova run                     # the whole suite
npx --no-install sova run -- --headed         # any Playwright flag after --
npx --no-install sova run -- -g "log in"      # one test
```

For CI: `npx --no-install sova emit --check && npx --no-install sova run`.

## When the app changes

- A test fails after a UI change: `trailblaze run trails/<id> --self-heal` repairs
  small drift in the trail; then `sova emit` and `sova check`.
- A new screen or route appears in a diff: add it to `sova/screens.yaml`, record its
  flows, emit, gate.
- A screen was removed: delete its trails and its entry; `sova emit --check` will name
  the orphaned specs to delete.
