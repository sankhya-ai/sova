# sova

Your coding agent explores a web app, and you get a Playwright suite nobody wrote by hand.

sova is one CLI and one agent skill:

1. **The skill tells the agent how to cover the whole app.** It maps every screen from
   the source code and drives each flow in a real browser with `sova open`, `sova look`
   and `sova act`.
2. **`sova save`** records the flow as a `trail.yaml` and turns it into a
   `@playwright/test` spec.
3. **`sova check`** is the gate. It refuses specs which are stale, break Playwright
   practices, or fail even once in repeated runs.

Under the hood the browser is driven and recorded by
[Trailblaze](https://github.com/block/trailblaze) (Apache 2.0). `sova init` installs it and
sova runs it for you, so nobody on the team needs to learn it.

Status: a working spike. See [Limits](#limits).

## Set up a project

In the web app's repo:

```bash
npm i -D @sankhya/sova
npx --no-install sova init
```

`init` is the whole setup. It:

- reads `package.json` to find how the app starts and which port it uses;
- installs `@playwright/test` and Chromium, and Trailblaze through Homebrew, if missing;
- installs the skill where agents look for it: `.claude/skills/` for Claude Code,
  `.agents/skills/` for Codex, Cursor, Gemini CLI and Goose, plus a pointer in `AGENTS.md`;
- writes `sova/config.json`, `sova/screens.yaml` and `sova/playwright.config.mts`.

Pass `--no-install` to skip the installs, or `--base-url` / `--start` to override what it
detects. It is safe to re-run.

Then tell your agent: **"Use the sova skill to test this app."**

The package is `@sankhya/sova`; the command it installs is `sova`. Use
`npx --no-install sova`, not `npx sova`: an unrelated package called plain `sova` exists on
npm, and `npx` would fetch that one if the local install were missing.

## What ends up in the repo

```
trails/<flow>/trail.yaml        recorded by `sova save`; the source of truth
sova/screens.yaml               every screen, and which trails cover it
sova/tests/<flow>.spec.ts       generated; never edited by hand
sova/config.json                base URL, start command, directories
sova/playwright.config.mts      Playwright config for the generated suite
```

## Commands

| Command | What it does |
|---|---|
| `sova init` | One-step setup. |
| `sova doctor` | Checks that everything needed is installed, and prints the fix for what is not. |
| `sova open [url]` | Opens a page in the driven browser. |
| `sova look` | Prints what is on screen, with a ref for each element. |
| `sova act <action> ... -s "<step>"` | Does or asserts one thing. `sova actions` lists them. |
| `sova save <id>` | Saves the flow as `trails/<id>`, closes the browser session, generates the spec. |
| `sova heal <id>` | Replays a trail, repairs small drift, regenerates the spec. |
| `sova emit` | Turns every web trail into a spec. `--check` writes nothing and fails on stale or orphaned specs. |
| `sova lint` | Checks specs against Playwright practices. |
| `sova check` | The gate: specs current, no lint errors, every test passes `--repeat` runs in a row (default 5) with retries off. |
| `sova coverage` | Fails while a screen in `screens.yaml` has no working trail and no `skip:` reason. |
| `sova run` | Runs the suite. Anything after `--` goes to Playwright: `sova run -- --headed`. |
| `sova skill show` | Prints the agent skill. |

Anyone can also run the suite without sova: `npx playwright test -c sova/playwright.config.mts`.

In CI: `npx --no-install sova emit --check && npx --no-install sova run`.

## What the emitter writes

One test per trail, one `test.step` per trail step, named with the step's own text.

- Locators follow the recording, most durable first: `getByTestId`, then
  `getByRole(role, { name })`, then CSS. Weak ones are reported so the agent can fix the
  app (add a label or `data-testid`) and re-record.
- Assertions are web-first (`expect(locator).toBeVisible()`), so they wait and retry.
- Fixed waits in a trail are dropped, not turned into sleeps.
- URLs under the configured base URL become paths, so the suite follows `baseURL`.
- A trail that cannot be replayed exactly is **blocked** with the step and the reason;
  sova does not guess.

## Limits

- **Web only.** Trailblaze also drives iOS and Android; sova ignores those recordings.
- **Recorded `web_*` primitives only.** Custom scripted tools, memory templates
  (`{{name}}`), `web_fillSecret`, `web_drag`, `web_resize` and network assertions are
  blocked for now.
- **No shared login.** Each test signs in through the UI. Playwright's `storageState`
  setup project is the next thing to add.
- **Lint is pattern-based**, not a parse of the code.
- **Coverage is by screen**, from an inventory the agent writes. There is no check yet
  that the suite would catch a real bug (mutation testing is the planned answer).
- Selector patterns are Java regexes in Trailblaze and JavaScript regexes in Playwright.
  Patterns that are not valid JavaScript are blocked; ones that are valid but mean
  something different are not detected.

## Develop

```bash
npm install
npm test                 # unit tests
cd examples/demo-app && npm install && npx playwright install chromium
node ../../dist/cli.js emit && node ../../dist/cli.js check
```

`examples/demo-app` is a three-screen app with trails written by hand in Trailblaze's
recorded format, and the specs sova generates from them.

## License

[Apache 2.0](LICENSE), the same licence as Trailblaze.
