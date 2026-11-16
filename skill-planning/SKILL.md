---
name: sova-planning
description: >
  Plan QA for a web app before writing tests: crawl it, build a per-screen case checklist,
  decide each expected result against the real app, and prove the suite by breaking the code.
  Use when asked to "plan tests", "what should we test", "review test coverage", or before
  using the sova skill on a new app. Read it first; the sova skill does the driving.
---

# Planning app QA with sova

The sova skill drives flows. This one decides **what to test and how to know it worked**.
`sova plan` drafts the mechanical part. Everything below is judgment you add. Nobody has
yet followed this file with a real agent (see "What is untested").

## Steps

1. **Crawl first.** Start the app, sign in once (`sova login` or the sign-in trail), run
   `sova plan`. It writes `sova/screens.plan.yaml`, `trails-draft/` and
   `sova/plan.anonymous.json`. Treat all of it as a draft. Read the screens it found against
   the source routes: add what it missed (modals, pages behind other roles), drop what is noise.
   A single-page app that switches views without changing the URL shows up as one screen
   (the demo app: login, dashboard and settings all on `/`; the crawl found 1 screen of 3).
   For those, list the screens from the components, not from the crawl.
2. **One checklist per screen.** `sova cases init`, then give each of `valid`, `invalid`,
   `empty`, `boundary`, `permission`, `server-error` exactly one of: `trail: <id>`,
   `na: <reason>`, `skip: <reason>`. A reason names the actual cause ("read-only list, takes no
   input"), never "not needed". Count them at the end: trails, hand-written specs, n/a, skipped,
   missing. Report those counts as they are. See `references/cases.md`.
3. **Decide each expected result before you drive it.** Where it comes from, in order:
   the spec or the user; the app's own code (error strings, validators, guards); what the
   running app does, only if that is plainly the intent. If the app does something that looks
   wrong, do not assert it: report it. See `references/expected-outcomes.md`.
4. **Keep the app safe.** Never submit reset, delete, wipe, import or payment forms. Use
   throwaway accounts. For permission checks on destructive endpoints, aim at an id that does
   not exist: a guard answers 403, a broken one 404 and nothing is deleted. Leave rate limiting
   ON and clear only its counters between tests. See `references/safety-and-state.md`.
5. **Set up sessions.** Default role in `login.trail`; other roles in `login.roles`; flows that
   start signed out in `login.anonymous` (paste `sova/plan.anonymous.json` there); flows that
   start as another role in `login.as`. A signed-out draft that runs with a session fails.
6. **Run the gate** (`sova check`, no retries, serial when tests share an account). A flaky
   test is a finding: find the shared state, do not add retries.
7. **Prove the suite by breaking the code.** Write 10 or more mutations in
   `sova/mutations.yaml` across validation, permission checks and calculations. Set
   `mutationRebuild` and `mutationReset`. Run `sova mutate` alone, never next to a gate.
   Read each line: "caught by N tests, first: X" with X unrelated to the break means polluted
   state or a broad failure, not a real kill. Survivors are test gaps or a wrong mutation:
   check which before adding a flow. See `references/mutation.md`.
8. **Report plainly.** Counts before and after, which kills are clearly attributed, what is
   untested (rate limits if disabled, other roles, server errors), and what a person must
   still decide.

## What is untested

- No real coding agent has followed this skill end to end. It was written from one author's
  runs on CTFd, Gitea and react-admin.
- `sova plan` was run on CTFd, and in one short dry run on the demo app, where it found 1 of 3
  screens (view switching without a URL change). I did only steps 1 and 2 of this file on that
  app, as the author, not as a separate agent. It reads forms
  and links; it cannot see server rules, modals, or state.
- Native mobile apps are out of scope: Sova drives a browser.
