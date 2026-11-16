# Deciding the expected result

An assertion is only worth writing if you know why the expected result is right.

1. **User or spec said so.** Highest. Tag it `[spec]`.
2. **The code says so.** An error string (`"Pick a longer password"`), a validator, a guard
   (`admins_only`). Quote it in the flow step. Tag it `[code]`; a person can `sova confirm` it.
3. **The running app does it and that is plainly the intent.** Run the flow once by hand and
   look at the result. Never record a result you did not see.

If the app does something that looks like a bug, stop and report it. Do not write a test that
passes on it. CTFd example: the admin API accepted a challenge with an empty name (HTTP 200).
No test was written; it was listed as a finding.

Assert the thing that proves the rule, not that the page loaded. CTFd scoring: the scoreboard
row for the solver must show 100, not just the solver's name, or breaking the sum to a count
survives. Gate for a draft that only opens a page: it is a smoke check, say so.

Pages a crawl calls "valid" with made-up input pass with no check of the result. Add the
real expected outcome or do not count the draft as coverage.

## Asserting messages

`sova look` lists only named controls. Flash messages, alert boxes and field errors are plain
text and do not show up in it. Assert them by selector, once you have the exact string from the
source: `sova act value ref="css=.alert-danger" expected="Wrong username or password." -s "..."`.
In FlaskBB field errors are `.invalid-feedback`, flashes `.alert-success` / `.alert-danger`.
`sova save` warns that a CSS selector is weak; for message text that is the accepted choice.
If two alerts can be on screen, the first one wins: check the page before asserting the second.
A refusal that redirects (FlaskBB sends a member who opens /admin/ back to / with a flash) is
asserted with `url` plus the flash text, not with a 403 page.
