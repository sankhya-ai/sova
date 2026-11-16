# Safety and shared state

- **Destructive pages.** Do not submit reset, delete, wipe, import or payment forms. `sova plan`
  never drafts a submit for them. If one must be tested, use a throwaway instance.
- **Permission checks on destructive endpoints.** Use an id that does not exist (403 when
  guarded, 404 when the guard is broken). CTFd: DELETE /api/v1/users/999999 as a regular user.
- **Cleanup.** Put it in `sova/fixtures.ts` as an auto fixture. Delete what tests create.
  Use a cookie-less request context for admin-token calls: CTFd upgrades a session cookie it
  arrives with, which turned the saved regular-user session into an admin one.
- **Shared accounts.** Two tests that change one account's server state race when run in
  parallel. Give each its own account, or run with `workers: 1`.
- **Rate limits.** Know where the counters live before you drive. FlaskBB limits the whole
  /auth blueprint to 20 requests per 15 minutes per IP, in process memory: planning, driving and
  three sign-ins hit HTTP 429, and nothing can clear a memory counter except restarting the app.
  If the counters cannot be cleared between tests, raise the limit in the throwaway seed data
  (FlaskBB: `AUTH_REQUESTS` in the settings table) and SAY SO in the report; the limit itself is
  then untested here. Test it on a second instance with a low limit, or mark the case
  `skip: limiter raised for the suite`. Otherwise keep it ON. CTFd keeps counters in the same cache as login sessions, so
  clear only the counter entries (integer values) between tests. Clearing the whole cache logs
  every saved session out.
- **Unique data.** `{{unique.name@example.com}}` for emails and names a test creates.
- **Roles.** `login.roles` for each extra role; `login.as` for flows that start as one.
- **Do not disable protections to make tests pass** unless you say so in the report.
- **Small machines.** A framework dev server can starve a 2GB box (react-admin's did). Serve a
  built or light version, and never run a gate while `sova mutate` runs. react-admin demo:
  26 flows, 19 of 19 screens covered, gate stable 5/5 once served lightly.
