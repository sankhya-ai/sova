---
name: sova
description: >
  Test a web app end to end with no hand-written tests: map every screen from the
  code, drive each one in a real browser, and get gated Playwright specs. Use when
  asked to "test this app", "add e2e tests", "cover this screen", or to fix or
  refresh sova-generated tests.
---

# sova

You are producing a Playwright suite for this project's web app without anyone writing
tests by hand. You have something a recorder does not: the source code. Use it to find
every screen, to know what each one is for, and to decide what must be asserted.

Everything goes through one CLI. Run every command as `npx --no-install sova <command>`
(written below as `sova`). `--no-install` matters: an unrelated package named `sova`
exists on npm, and plain `npx sova` would download it if this project's copy were missing.

What you produce, and who writes each file:

| File | Written by | Edit by hand? |
|---|---|---|
| `sova/screens.yaml` | you, from the code | yes |
| `trails/<id>/trail.yaml` | `sova save`, from your driving | no; re-drive the flow |
| `sova/tests/<id>.spec.ts` | `sova save` / `sova emit` | never |

## 0. Preflight

1. `sova doctor`. If anything is missing, run `sova init`: it detects how the app
   starts, installs Playwright, Chromium and the browser driver, and is safe to re-run.
   It installs software on the user's machine, so say so before you run it.
2. Open `sova/config.json` and check `baseURL` and `startCommand` against the dev
   server config in the code. `sova init` guesses them from `package.json`; you can
   read the real values. Fix them if they are wrong.
3. Start the app if it is not running.

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

## 2. Drive each flow

One flow per behaviour, not per screen: "log in", "log in with a wrong password",
"change the display name". Short flows fail for one reason and are cheap to redo.

```bash
sova open /login                                   # a path under baseURL, or a full URL
sova look                                          # what is on screen, with a ref per element
sova act type  ref=<ref> text="ada@example.com" -s "Type the email"
sova act click ref=<ref>                        -s "Click Sign in"
sova act see   ref=<ref>                        -s "The dashboard heading is shown"
sova save login                                    # writes the trail and the spec, closes the browser
```

- `sova actions` lists every action: `click`, `type`, `select`, `hover`, `press`,
  `scroll`, `back`, and the assertions `see`, `value`, `url`.
- Refs come from `sova look` and change when the screen changes, so look again after
  any action that changes the page.
- `-s` is required. Write what the step is for, as you would for a human reviewer. It
  becomes the step name in the test.

Rules that decide whether the generated test is any good:

- **Every flow ends by asserting the outcome**, and asserts after each step whose
  result matters. Clicking Save proves nothing; the saved value showing afterwards does.
- **Assert what the user came for**, taken from the code's intent: the success message,
  the new row, the changed URL. Do not assert incidental copy, timestamps, counts or
  ids that change between runs.
- **Each flow starts from a fresh browser** (`sova save` closes it) and sets up what it
  needs. Never rely on a previous flow having run.
- **Never wait for time.** If a step needs the page to settle, assert the thing you are
  waiting for with `see`.
- **No secrets in a flow.** Use a throwaway test account. If the only credentials
  available are real, stop and ask.

After `sova save <id>`, add `<id>` under its screen's `trails:` in `sova/screens.yaml`.

Reading the output of `sova save`:

- `wrote sova/tests/<id>.spec.ts`: done.
- `blocked`: the message names the step and the reason. Fix the cause and drive the
  flow again. Do not hand-write the spec.
- `note:` lines are selector weaknesses. A CSS or positional locator means the element
  has no unique accessible name. Fix that at the source: give the element a proper
  label or a `data-testid` in the app's code, tell the user you did, drive the flow
  again. That is better than a brittle test.

## 3. Gate

```bash
sova check          # specs current, lint clean, 5 passes in a row with no retries
sova coverage       # every screen has a working flow or a skip reason
```

A test that fails the gate is not done. Read the failure, then decide which is true:

- the app has a real bug: report it to the user with the trace; do not weaken the test;
- the flow asserted something unstable: drive it again with a stable assertion;
- the test depends on leftover state: make the flow set up its own state.

Never make the gate pass by deleting an assertion, adding a wait, or lowering
`--repeat`.

## 4. Hand over

Tell the user, briefly: screens covered / skipped (with reasons) / uncovered, anything
blocked, any app bugs found, any `data-testid` you added. Then how to run it:

```bash
npx --no-install sova run                     # the whole suite
npx --no-install sova run -- --headed         # any Playwright flag after --
npx --no-install sova run -- -g "log in"      # one test
```

For CI: `npx --no-install sova emit --check && npx --no-install sova run`.

## When the app changes

- A test fails after a UI change: `sova heal <id>` replays the flow, repairs small
  drift, and regenerates the spec. If it cannot, drive the flow again. Then `sova check`.
- A new screen or route appears in a diff: add it to `sova/screens.yaml`, drive its
  flows, gate.
- A screen was removed: delete its `trails/<id>` folders and its entry;
  `sova emit --check` names the orphaned specs to delete.
