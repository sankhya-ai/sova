# Proving the suite

A suite that passes proves nothing until it fails when the code is wrong.

Write 10+ mutations in `sova/mutations.yaml`, each a small, real break:
- validation: remove an error branch (`errors.append(...)` becomes `pass`)
- permission: make a guard always true, remove an admin decorator, drop a private-page check
- calculation: sum becomes count, filter inverted
- limits: remove a length check or the rate limiter

Config in `sova/config.json`:
- `mutationRebuild`: restarts the app after each source edit.
- `mutationReset`: puts data back to seed before the baseline and every mutation. Without it,
  a mutation that lets a test create a duplicate account fails every later mutation on
  unrelated tests (CTFd: 2 of 3 kills wrongly credited, until reset was added).

Read the output:
- `caught by <test>` where the test is about that behaviour: a real kill.
- `caught by N tests, first: X` with X unrelated: polluted state or broad breakage. Not proof.
- Survivor: first check the mutation hit the line the app really uses (CTFd had two copies of
  a password check; the first mutation hit the email-change one). Then check the flow tests the
  right page (the `admins_only` survivor: the flow opened /admin, which the decorator does not
  guard; /admin/users did). Only then add a flow.

Run `sova mutate` alone. Never next to `sova check`. Pick an app whose source you can rebuild
on your machine: Gitea (Go) could not be rebuilt on a 2GB box, so only 1 mutation counted there.
CTFd (Python) rebuilds in seconds.

A multi-line `find` must match the file byte for byte, indentation included. A miss is reported
as `invalid ... text to replace was not found` and the mutation never ran: it is not a survivor and
proves nothing. Copy the lines with `sed -n` instead of retyping them. `sova mutate` also stops at the
baseline when stale specs exist (e.g. `sign-in.spec.ts` written before `login.trail` was set;
`sova emit` calls them orphans): delete them first. FlaskBB: 12 mutations, about 25 s each.
