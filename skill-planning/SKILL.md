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

0. **Set up.** `sova doctor` must be all ok. Check three things `sova init` cannot guess:
   `baseURL` in `sova/config.json` (it guesses :3000 and an empty `startCommand` for any app
   that is not a Node project); that the browser driver (Trailblaze) needs Java 17 or later, so
   a machine with Java 11 stays "MISSING" until you install a newer JRE; and that the app is
   running with throwaway seed data: one account for each role you will test (create them with
   the app's own CLI or fixtures), and a way to put that data back (copy of the database file,
   a reset command). Write the passwords in `sova/.env`.
1. **Crawl first.** Start the app and run `sova plan`. A signed-out crawl is fine; the sign-in
   trail does not exist yet (you drive it in step 5) and plan does not follow menus that only
   open on click (a user dropdown with Settings and Logout was not reached). Re-run it after
   step 5 only if you want the signed-in pages; do not expect many more. It writes `sova/screens.plan.yaml`, `trails-draft/` and
   `sova/plan.anonymous.json`. Treat all of it as a draft. Read the screens it found against
   the source routes: add what it missed (modals, pages behind other roles), drop what is noise.
   A single-page app that switches views without changing the URL shows up as one screen
   (the demo app: login, dashboard and settings all on `/`; the crawl found 1 screen of 3).
   For those, list the screens from the components, not from the crawl.
   Expect noise: one screen per user profile (`/user/alice`, `/user/bob`) is one screen, and
   a form named "reset" that only asks for an email (password-reset request) is drafted as
   destructive; read it and decide. Get the real route list from the app (a framework's URL map
   or the router file), not from the crawl: on FlaskBB the crawl saw 22 pages, the code has ~100.
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
5. **Set up sessions.** Drive the sign-in flow once per role with the sova skill (`sova reset`
   first, so the driven browser starts signed out; `sova login` fails with a misleading "no
   element found" if the browser is already signed in). End each sign-in flow with something only
   that role sees; a username link in the navbar can appear twice (also in "who is online"), and
   `sova act see` refuses it. Default role in `login.trail`; other roles in `login.roles`; flows that
   start signed out in `login.anonymous` (paste `sova/plan.anonymous.json` there); flows that
   start as another role in `login.as`. A signed-out draft that runs with a session fails: every flow you drive signed out must be in
   `login.anonymous`, and every flow that starts as another role in `login.as`, or it fails
   at the gate for no reason about the app. Shape:
   `"login": {"trail": "sign-in", "anonymous": ["login-wrong-password"], "roles": {"admin": {"trail": "sign-in-admin"}}, "as": {"admin-add-user": "admin"}}`.
   Set `"workers": 1` when flows share accounts.
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

- One fresh run followed this file on FlaskBB (Python, SQLite): steps 0 to 5 and 7 partly, see
  `examples/flaskbb-qa/RUN-NOTES.md` for what worked, what needed judgment and what is missing.
  Result: gate passed (22 tests 5/5), 16 of 16 mutations killed and attributed, checklist filled
  for 10 screens (17 covered, 34 skipped of which 24 only mean "not examined"). Not shown: full
  coverage of the app (10 of ~100 routes), server-error cases, a rate limiter test, any second app.
- `sova plan` reads forms and links. It cannot see server rules, modals, menus that open on
  click, or state. On FlaskBB it found 22 pages of about 100 routes.
- Native mobile apps are out of scope: Sova drives a browser.
