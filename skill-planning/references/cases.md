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
