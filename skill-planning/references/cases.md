# The case checklist

Six kinds per screen. Each ends covered, `na` with a reason, or `skip` with a reason.

| Kind | Ask | CTFd example |
|---|---|---|
| valid | does the normal path work and show a result? | register a new user, land on /challenges |
| invalid | is bad input rejected with a message and nothing saved? | taken user name, wrong current password |
| empty | blank required input | empty password (the browser blocks it, so a form POST) |
| boundary | the limit itself, one past it | password of 129 characters; the 11th login attempt in 5 seconds |
| permission | who must not get in? | a regular user opening /admin/users; signed out on /settings |
| server-error | what does the user see when the backend fails? | usually `skip`: cannot make it fail on demand |

Good `na` reasons: "read-only page: it takes no input", "score visibility is public in this
setup", "no paging at this size". Bad: "not needed", "later".

Some cases cannot be a trail because the browser refuses to send the input (`required`,
`type=email`, `maxlength`). Test them with a form POST or API call in a hand-written spec, and
record the case as `skip: hand-written spec, not a trail: <file> > <test>`. Count these
separately from trails: CTFd had 17 trails, 8 hand-written, 15 n/a, 8 server-error skips.

What a crawl gives you for free: required / typed / length-limited fields, signed-out
redirects. What it cannot give: server-side rules, rate limits, duplicates, calculations.
Those come from reading the source.

## Driving tips found by a fresh run (FlaskBB)

- A `required` input blocks the browser, so the empty case is usually a hand-written spec.
  A `type=checkbox` the form defaults to ticked may not be ticked in the page: click it.
- `sova act ... ref='textbox "Password"'` (role plus name from `sova look`) works and survives
  page changes; plain `e7` refs do not.
- `sova save` saves whatever you drove, even half a flow, with no prompt. Use `sova discard`.
- Use `text=unique:name` for usernames: the result is `name-xxxxxx`, so check the app's
  maximum length (FlaskBB: 20).
- Never change the password of the account a sign-in flow uses; give password-change flows
  their own role account (`login.as`).
- A case holds one `trail:`; list the other trails of that screen under the screen's `trails:`.
- `sova coverage` accepts any skip text. Keep two counts: skips with a real cause ("cannot make the
  backend fail") and skips that only mean "not examined yet". Report the second one as untested.
- Hand-written specs sit in `sova/tests/` as `hand-<name>.spec.ts`; `sova emit --check` does not
  call them orphans. They run with the saved session, so start a signed-out one with
  `test.use({ storageState: { cookies: [], origins: [] } })`. To submit a form the browser would
  block, set `novalidate` on the form first.
- Content a flow creates piles up over the 5 gate runs. Create it in the same flow with a
  `unique:` title and assert it on its own page; do not assert a fixed string on a shared list.
