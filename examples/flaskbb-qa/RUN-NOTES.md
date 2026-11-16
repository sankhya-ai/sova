# FlaskBB: a fresh-agent run of the sova-planning skill

App: FlaskBB master (1028f17), Python 3.12, SQLite, run locally, source edited by `sova mutate`.
Not react-admin, Gitea, CTFd or the sova demo. Followed only `skill-planning/` and the sova CLI help.

## What worked without judgment
- `sova init` installed Playwright, Chromium and the skill. `sova plan` ran in 7 s.
- Role sessions (`login.roles`, `login.as`), named refs, `unique:` data, `sova emit`.
- 19 flows driven and saved; every one ends on an asserted message or URL.

## Where the skill was unclear, wrong or missing (all fixed in this PR)
1. Step 1 said sign in before `sova plan`; the sign-in trail does not exist yet. Plan runs signed out.
2. No setup step: `init` guessed :3000, no start command; the driver needs Java 17+ (box had 11);
   seed accounts for each role were never mentioned.
3. Plan drafted a password-reset *request* as destructive and each user profile as its own screen.
4. Messages are not in `sova look`. Nothing said to assert them by selector with `value`.
5. `sova login` needs `sova reset` first; the error is misleading.
6. A sign-in assertion on the username link fails when the name appears twice on the page.
7. In-memory rate limiter (20 requests per 15 min on /auth) returned 429 mid-run; the skill said
   "keep ON, clear counters", impossible for memory counters. I raised AUTH_REQUESTS to 1000 in the seed.
8. `login.anonymous` / `login.as` must list every flow; shape was not shown.
9. `sova save` has no dry run; a half flow got saved once.
10. Orphan `sign-in.spec.ts` files written before `login.trail` was set fail the baseline of
    `sova mutate` until deleted (emit prints "orphan", mutate only says the suite fails).

## Second pass
- Fixed the 2 invalid mutations (YAML block scalars strip the first line's indent, so a multi-line
  find never matched mid-file code). Added 4 more.
- `sova mutate`, run alone, app restored from seed before each: **16 killed, 0 survived, 0 invalid.**
  Each kill is caught by the test about that behaviour (see list above, plus: duplicate username and
  email at registration, logout message, admin add-user message, empty password (hand-written spec),
  admin form taken username).
- Gate: `sova check` (5 runs, no retries): 22 tests stable 5/5, 4 sign-in setups 1/1, lint 0 errors
  (28+ warnings, all "CSS locator" for message text). Includes 2 hand-written tests in `sova/tests/hand-login-empty.spec.ts`.
- Case checklist filled for 10 screens: 17 covered, 9 n/a (named reasons), 34 skipped, 0 missing of 60.
  Of the 34 skips: 10 are real causes (backend cannot be made to fail, lockout, would break the shared
  account), 24 are "not examined yet" and should be read as untested.

## Still not done
- Only 10 of about 100 routes are in screens.yaml. Not covered: topic reply/delete/report/hide/lock,
  moderator actions, ban/unban, group and forum admin, search, memberlist, attachments, avatar upload.
- No valid password change or email change (would break the seeded accounts; needs a throwaway account).
- Empty-input cases other than login have no hand-written spec yet.
- The rate limiter itself is untested (raised to 1000 in the seed).
- `/admin/users` as a regular member shows two alerts and did not match the panel message; unresolved.
- Test seed changed: ACTIVATE_ACCOUNT=false, AUTH_REQUESTS=1000. One browser, one machine, one app.
