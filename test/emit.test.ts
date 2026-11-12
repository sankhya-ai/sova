import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULTS } from "../src/config.js";
import { actArgs, openArgs, resolveUrl } from "../src/drive.js";
import { emitCall, emitTrail, relativeToBase, trailId } from "../src/emit.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectApp } from "../src/init.js";
import { lintSource } from "../src/lint.js";
import { Blocked, locatorFromRef, locatorFromSelector, nameMatcher } from "../src/locator.js";
import { parseTrail } from "../src/trail.js";
import { quoteForCmd } from "../src/util.js";

const config = { baseURL: "http://localhost:3000" };

test("a metacharacter-free or \\Q-quoted name is a literal; anything else is an anchored regex", () => {
  assert.deepEqual(nameMatcher("Sign in"), { literal: "Sign in" });
  assert.deepEqual(nameMatcher("^Save$"), { literal: "Save" });
  assert.deepEqual(nameMatcher("\\QPrice (USD)\\E"), { literal: "Price (USD)" });
  assert.deepEqual(nameMatcher("Save.*"), { source: "^(?:Save.*)$", flags: "" });
  assert.deepEqual(nameMatcher("(?i)save"), { source: "^(?:save)$", flags: "i" });
});

test("selectors resolve most durable first: test id, role and name, CSS, bare role", () => {
  assert.equal(
    locatorFromSelector({ dataTestId: "pay", ariaRole: "button", ariaNameRegex: "Pay", cssSelector: "#pay" }).code,
    "page.getByTestId('pay')",
  );
  assert.equal(
    locatorFromSelector({ ariaRole: "button", ariaNameRegex: "Pay", cssSelector: "#pay" }).code,
    "page.getByRole('button', { name: 'Pay', exact: true })",
  );
  assert.equal(locatorFromSelector({ ariaRole: "button", cssSelector: "#pay" }).code, "page.locator('#pay')");
  assert.equal(locatorFromSelector({ ariaRole: "navigation" }).code, "page.getByRole('navigation')");
});

test("a regex name becomes an anchored regex literal", () => {
  assert.equal(
    locatorFromSelector({ ariaRole: "link", ariaNameRegex: "Order #\\d+" }).code,
    "page.getByRole('link', { name: /^(?:Order #\\d+)$/ })",
  );
  assert.equal(
    locatorFromSelector({ ariaRole: "link", ariaNameRegex: "a/b.*" }).code,
    "page.getByRole('link', { name: /^(?:a\\/b.*)$/ })",
  );
});

test("roles that have no accessible name are matched on their text", () => {
  assert.equal(
    locatorFromSelector({ ariaRole: "paragraph", ariaNameRegex: "\\QTotal: $5.00\\E" }).code,
    "page.getByRole('paragraph').filter({ hasText: /^Total: \\$5\\.00$/ })",
  );
  assert.equal(
    locatorFromSelector({ ariaRole: "listitem", ariaNameRegex: "Milk" }).code,
    "page.getByRole('listitem', { name: 'Milk', exact: true }).or(page.getByRole('listitem').filter({ hasText: /^Milk$/ }))",
  );
  assert.equal(
    locatorFromSelector({ ariaRole: "text", ariaNameRegex: "Hello" }).code,
    "page.getByText('Hello', { exact: true })",
  );
});

test("heading level and occurrence index are kept, and an index marks the locator positional", () => {
  assert.equal(
    locatorFromSelector({ ariaRole: "heading", ariaNameRegex: "News", headingLevel: 2 }).code,
    "page.getByRole('heading', { name: 'News', exact: true, level: 2 })",
  );
  const second = locatorFromSelector({ ariaRole: "button", ariaNameRegex: "Add", nthIndex: 1 });
  assert.equal(second.code, "page.getByRole('button', { name: 'Add', exact: true }).nth(1)");
  assert.equal(second.positional, true);
  assert.equal(locatorFromSelector({ cssSelector: "li", nthIndex: 0 }).code, "page.locator('li').first()");
});

test("a snapshot ref without a selector is blocked; durable refs are not", () => {
  assert.throws(() => locatorFromRef("e12"), Blocked);
  assert.equal(locatorFromRef("css=#name-input").code, "page.locator('#name-input')");
  assert.equal(locatorFromRef('button "Save (draft)"').code, "page.getByRole('button', { name: 'Save (draft)', exact: true })");
});

test("navigation under the base URL is emitted as a path", () => {
  assert.equal(relativeToBase("http://localhost:3000/login?x=1", "http://localhost:3000"), "/login?x=1");
  assert.equal(relativeToBase("http://localhost:3000", "http://localhost:3000/"), "/");
  assert.equal(relativeToBase("http://localhost:30001/x", "http://localhost:3000"), "http://localhost:30001/x");
  assert.equal(relativeToBase("https://other.example/x", "http://localhost:3000"), "https://other.example/x");
});

test("each web tool maps to the matching Playwright call", () => {
  const button = { nodeSelector: { web: { ariaRole: "button", ariaNameRegex: "Go" } } };
  const go = "page.getByRole('button', { name: 'Go', exact: true })";
  const lines = (tool: string, args: Record<string, unknown>) => emitCall({ tool, args }, config).lines;

  assert.deepEqual(lines("web_navigate", { action: "back" }), ["await page.goBack();"]);
  assert.deepEqual(lines("web_click", button), [`await ${go}.click();`]);
  assert.deepEqual(lines("web_type", { ...button, text: "it's" }), [`await ${go}.fill('it\\'s');`]);
  assert.deepEqual(lines("web_type", { ...button, text: "a", clearFirst: false }), [`await ${go}.pressSequentially('a');`]);
  assert.deepEqual(lines("web_selectOption", { ...button, values: ["a", "b"] }), [`await ${go}.selectOption(['a', 'b']);`]);
  assert.deepEqual(lines("web_pressKey", { key: "Enter" }), ["await page.keyboard.press('Enter');"]);
  assert.deepEqual(lines("web_scroll", { direction: "UP", amount: 300 }), ["await page.mouse.wheel(0, -300);"]);
  assert.deepEqual(lines("web_waitForUrl", { pattern: "/(dashboard|home)" }), ["await expect(page).toHaveURL(/\\/(dashboard|home)/);"]);
  assert.deepEqual(lines("web_verifyElementVisible", button), [`await expect(${go}).toBeVisible();`]);
  assert.deepEqual(lines("web_verifyValue", { ...button, expected: "x" }), [`await expect(${go}).toContainText('x');`]);
  assert.deepEqual(lines("web_verifyValue", { ...button, type: "value", expected: "x" }), [`await expect(${go}).toHaveValue('x');`]);
  assert.deepEqual(lines("web_snapshot", { screenName: "home" }), []);
});

test("a fixed wait is dropped with a note instead of becoming a sleep", () => {
  const code = emitCall({ tool: "web_wait", args: { seconds: 3 } }, config);
  assert.deepEqual(code.lines, []);
  assert.match(code.warnings[0]!, /dropped a fixed web_wait/);
});

test("custom tools, unsupported tools and memory templates are blocked", () => {
  assert.throws(() => emitCall({ tool: "myapp_web_login", args: {} }, config), /custom tool/);
  assert.throws(() => emitCall({ tool: "web_drag", args: {} }, config), /not supported/);
  assert.throws(
    () => emitCall({ tool: "web_type", args: { text: "{{password}}", ref: "css=#p" } }, config),
    /memory template/,
  );
});

const TRAIL = `
config:
  devices:
    web:
      driver: PLAYWRIGHT_NATIVE
  title: "Submit the form"
  tags: [smoke]
trail:
  - step: "Open the form"
    recording:
      web:
        - web_navigate:
            url: http://localhost:3000/form
  - step: "Submit"
    recording:
      web:
        - web_click:
            ref: e17
            reasoning: It is the submit button.
            nodeSelector:
              web:
                ariaRole: button
                ariaNameRegex: Submit
  - step: "The form reports success"
    recording:
      web:
        - web_verifyElementVisible:
            nodeSelector:
              web:
                ariaRole: strong
                ariaNameRegex: Form submitted!
`;

test("a recorded trail becomes one test with a step per trail step, and lints clean", () => {
  const result = emitTrail(parseTrail(TRAIL), "trails/form/trail.yaml", "form", config);
  assert.equal(result.status, "emitted");
  assert.equal(result.assertions, 1);
  assert.equal(
    result.spec,
    `// Generated by sova from trails/form/trail.yaml
// Do not edit. Change the trail, then run \`sova emit\`.
import { expect, test } from '@playwright/test';

test('Submit the form', { tag: ['@smoke'] }, async ({ page }) => {
  await test.step('Open the form', async () => {
    await page.goto('/form');
  });

  await test.step('Submit', async () => {
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
  });

  await test.step('The form reports success', async () => {
    await expect(page.getByRole('strong').filter({ hasText: /^Form submitted!$/ })).toBeVisible();
  });
});
`,
  );
  assert.deepEqual(lintSource(result.spec!), []);
});

test("a step with no web recording blocks the trail and names the step", () => {
  const trail = parseTrail(`
config: { devices: { web: { driver: PLAYWRIGHT_NATIVE } } }
trail:
  - step: Call the login tool
`);
  const result = emitTrail(trail, "t", "t", config);
  assert.equal(result.status, "blocked");
  assert.match(result.reason!, /step 1 \("Call the login tool"\) has no web recording/);
});

test("a trail with no web device and no web recording is skipped", () => {
  const trail = parseTrail(`
config: { devices: { android: {} } }
trail:
  - step: Tap
    recording:
      android:
        - tap: { ref: y778 }
`);
  assert.equal(emitTrail(trail, "t", "t", config).status, "skipped");
});

test("a trailhead is emitted as the first step", () => {
  const trail = parseTrail(`
trailhead:
  step: Start on the home page
  recording:
    web:
      web_navigate:
        url: /
trail:
  - verify: The title is shown
    recording:
      web:
        - web_verifyElementVisible:
            ref: 'heading "Home"'
`);
  const spec = emitTrail(trail, "t", "t", config).spec!;
  assert.ok(spec.indexOf("Start on the home page") < spec.indexOf("The title is shown"));
  assert.match(spec, /await page\.goto\('\/'\);/);
});

test("trail ids come from the directory or the file stem", () => {
  assert.equal(trailId("/p/trails/auth/login/trail.yaml", "/p/trails"), "auth/login");
  assert.equal(trailId("/p/trails/auth/login.trail.yaml", "/p/trails"), "auth/login");
});

test("lint flags the practices that cause flake or hide failures", () => {
  const rules = (source: string) => lintSource(source).map((finding) => finding.rule);
  assert.deepEqual(rules("test('a', async ({ page }) => { await page.click('x'); });"), ["must-assert"]);
  assert.ok(rules("await page.waitForTimeout(500); expect(1)").includes("no-fixed-wait"));
  assert.ok(rules("expect(await page.locator('a').isVisible()).toBe(true)").includes("web-first-assertion"));
  assert.ok(rules("test.only('a', () => { expect(1) })").includes("no-focused-test"));
  assert.ok(rules("page.locator('//div[2]'); expect(1)").includes("no-xpath"));
  assert.ok(rules("await page.goto('https://prod.example.com/x'); expect(1)").includes("use-base-url"));
  assert.deepEqual(rules("// await page.waitForTimeout(500);\nexpect(1)"), []);
});

test("init reads the start command and port from package.json, preferring an explicit port", () => {
  const project = (pkg: object, lockfile?: string) => {
    const dir = mkdtempSync(join(tmpdir(), "sova-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
    if (lockfile) writeFileSync(join(dir, lockfile), "");
    return dir;
  };
  assert.deepEqual(detectApp(project({ scripts: { dev: "next dev" }, dependencies: { next: "15" } })), {
    startCommand: "npm run dev",
    baseURL: "http://localhost:3000",
  });
  assert.deepEqual(
    detectApp(project({ scripts: { dev: "vite --port 5180" }, devDependencies: { vite: "6" } }, "pnpm-lock.yaml")),
    { startCommand: "pnpm run dev", baseURL: "http://localhost:5180" },
  );
  assert.deepEqual(detectApp(project({ scripts: { start: "node server.js" } })), { startCommand: "npm run start" });
  assert.deepEqual(detectApp(project({})), {});
});

test("driving commands translate to the driver's CLI and always carry a step", () => {
  const cfg = { ...DEFAULTS, baseURL: "http://localhost:3000/" };
  const device = ["tool", "-d", "web/playwright-native"];
  assert.equal(resolveUrl("/login", cfg.baseURL), "http://localhost:3000/login");
  assert.equal(resolveUrl("https://x.test/a", cfg.baseURL), "https://x.test/a");
  assert.deepEqual(openArgs(cfg, ["/login"]), [...device, "web_navigate", "url=http://localhost:3000/login", "-s", "Open /login"]);
  assert.deepEqual(
    actArgs(cfg, ["type", "ref=e3", "text=ada@example.com", "-s", "Type the email"]),
    [...device, "web_type", "ref=e3", "text=ada@example.com", "-s", "Type the email"],
  );
  assert.deepEqual(actArgs(cfg, ["back", "-s", "Go back"]), [...device, "web_navigate", "action=BACK", "-s", "Go back"]);
  assert.deepEqual(actArgs(cfg, ["web_drag", "--help"]), ["tool", "web_drag", "--help"]);
  assert.throws(() => actArgs(cfg, ["click", "ref=e5"]), /Say what the step is for/);
});

test("arguments with spaces or shell characters are quoted for Windows", () => {
  assert.equal(quoteForCmd("ref=e5"), "ref=e5");
  assert.equal(quoteForCmd("Click Sign in"), '"Click Sign in"');
  assert.equal(quoteForCmd('say "hi"'), '"say \\"hi\\""');
  assert.equal(quoteForCmd("a&b"), '"a&b"');
  assert.equal(quoteForCmd(""), '""');
});
