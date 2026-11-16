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

## Not done
- Case checklist (`sova cases init`) added, not filled: 54 cases, 0 covered, 0 n/a, 0 skipped, 54 missing.
- No hand-written specs for `required` inputs, no moderator or admin happy paths, no topic reply,
  edit, delete, report or ban flows, no `sova check` 5x run.
- `/admin/users` as a regular member shows two alerts and did not match the panel message; unresolved.
- Test seed changed: ACTIVATE_ACCOUNT=false, AUTH_REQUESTS=1000.

## Mutation result (`sova mutate`, run alone, app restored from seed before each)
10 killed, 0 survived, 2 invalid (my multi-line `find` text did not match the file's whitespace, so
those two mutations never ran: duplicate username and duplicate email at registration are NOT proven).
Every kill names the test about that behaviour. Raw: `sova mutate` log in this folder's notes above.
Kills: old-password, same-password, old-email, duplicate change-email, username length, blacklist,
any-password login, admin panel open, edit any post, details message.
Stability: `sova check` (5 runs) was NOT run on the full suite; only the mutate baseline and single runs passed.
