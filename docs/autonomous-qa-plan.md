# Plan: Sova without a test automation engineer

Goal: any dev, with a coding agent, gets test automation for a complex web app, and new screens get tests without anyone asking.

## What we believe

- Structure can be automated in one planned pass. Routes give every screen. Components give every button, field and state. An agent can enumerate all of them.
- Correctness cannot come from the code alone. The code says what the app does, not what it should do. A test written from code locks a bug in as the expected result. So every assertion needs a source of truth, or a label saying it has none.
- Most "automation engineer" work is state (data, roles, the step before), picking which of many cases matter, and keeping tests honest as the app changes.

## The loop

1. **Plan the whole app in one pass.** Agent reads the router and components and writes `sova/screens.yaml`. `sova cases init` adds the case checklist to every screen.
2. **Per-screen cases.** Each screen is checked against: valid, invalid, empty, boundary, permission, server-error. Each case is covered by a trail, skipped with a reason, or marked n/a with a reason. Coverage counts cases, not screens.
3. **Every assertion has a source.** The step text carries `[spec: <ticket, doc, schema or person>]` or `[code]` (guessed from reading the code). `sova assertions` lists all of them. Guessed ones form a confirmation queue: one person looks once, then `sova confirm <id> --by <name>` marks them as spec.
4. **Assertions must prove behaviour.** `sova assertions` grades each flow. Smoke means it only shows a heading or menu entry. Behavioural means something was done and a result was checked.
5. **Control data.** Seeded state and reset between tests. Not built yet.
6. **Prove the tests can fail.** Mutation check: change the app on purpose, tests must go red. Not built yet.
7. **Find new screens.** On a PR, diff the router and components against `screens.yaml`, add the screens, drive them, gate them. Not built yet.
8. **Run on every PR.** `sova emit --check && sova coverage && sova check`. When a test fails, decide: real bug or outdated test.

## Status

| Piece | State |
|---|---|
| Screen map, stability gate, lint | existed |
| Case checklist and case coverage (`sova cases init`, `sova coverage`) | built in this PR |
| Assertion source tags, confirmation queue (`sova assertions`, `sova confirm`) | built in this PR |
| Smoke vs behavioural grading | built in this PR |
| Seeded data and reset | not built |
| Mutation check | not built |
| New-screen discovery from a diff | not built |
| PR-time loop in CI | not built |

## Limits

- A person is still needed once per guessed assertion, and to supply specs. The aim is a few minutes of review, not zero.
- Not proven on an app with real auth, roles, multi-step flows or a real backend.
- Case counts say a case has a flow, not that the flow is good. The grade and the source tags help; mutation checks would prove it.
