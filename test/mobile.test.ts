import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { emitAll } from "../src/emit.js";
import { DEFAULTS, type SovaConfig } from "../src/config.js";
import {
  classifyRun, isMobile, lintMobileTrail, measureMobileStability, mobileDevice, mobileTrailResult,
  platformOf, runArgs, runOnceMobile,
} from "../src/mobile.js";
import { actArgs, openArgs } from "../src/drive.js";
import { parseTrail } from "../src/trail.js";

// Shapes taken from the trails Block ships in trailblaze/examples/android-sample-app.
const RECORDED = `
config:
  id: sample-app/forms/text-input-native
  devices:
    android-phone:
      driver: ANDROID_TEST
trailhead:
  step: "Launch the sample app"
  recording:
    android-phone:
      launchApp:
        appId: xyz.block.trailblaze.examples.sampleapp
trail:
  - step: Open the Forms tab
    recording:
      android-phone:
        - tapOnElementBySelector:
            nodeSelector:
              compose:
                contentDescriptionRegex: Forms
        - assertVisibleBySelector:
            nodeSelector:
              compose:
                contentDescriptionRegex: Forms
`;

const PROSE_ONLY = `
config:
  id: x
trailhead:
  step: Launch the sample app
  recording:
    android:
      launchApp:
        appId: a.b
trail:
  - step: Navigate to the Catalog tab
  - verify: Pumpkin Spice is not visible
`;

const config = (over: Partial<SovaConfig> = {}): SovaConfig => ({ ...DEFAULTS, platform: "android", device: "android", ...over });

test("the platform comes from platform, else from the device name", () => {
  assert.equal(platformOf({ platform: undefined, device: "web/playwright-native" }), "web");
  assert.equal(platformOf({ platform: undefined, device: "android/emulator-5554" }), "android");
  assert.equal(platformOf({ platform: "ios", device: "web/playwright-native" }), "ios");
  assert.equal(isMobile(config()), true);
  assert.equal(mobileDevice({ platform: "android", device: "android/emulator-5554" }), "android/emulator-5554");
  assert.equal(mobileDevice({ platform: "ios", device: "web/playwright-native" }), "ios");
});

test("a recording under android-phone is found, with its assertions", () => {
  const trail = parseTrail(RECORDED);
  assert.deepEqual(trail.mobilePlatforms, ["android"]);
  assert.equal(trail.steps[0]!.kind, "trailhead");
  assert.equal(trail.steps[0]!.mobile.android![0]!.tool, "launchApp");
  const result = mobileTrailResult(trail, "android");
  assert.equal(result.status, "emitted");
  assert.equal(result.assertions, 1);
  assert.deepEqual(lintMobileTrail(trail, "android"), []);
});

test("a recording for another platform does not count", () => {
  assert.equal(mobileTrailResult(parseTrail(RECORDED), "ios").status, "skipped");
});

test("steps with no recording, and a verify with none, block the trail", () => {
  const findings = lintMobileTrail(parseTrail(PROSE_ONLY), "android");
  assert.deepEqual(findings.filter((f) => f.severity === "error").map((f) => f.rule), ["no-recording", "verify-needs-model"]);
  assert.equal(mobileTrailResult(parseTrail(PROSE_ONLY), "android").status, "blocked");
});

test("coordinates block, index-only selectors and a missing trailhead warn", () => {
  const trail = parseTrail(`
trail:
  - step: Tap the corner
    recording:
      android:
        - tapOnPoint: { x: 10, y: 20 }
  - step: Tap the third row
    recording:
      android:
        - tapOnElementBySelector:
            nodeSelector:
              androidAccessibility:
                index: 2
        - assertVisibleBySelector:
            nodeSelector:
              androidAccessibility:
                textRegex: Done
`);
  const rules = lintMobileTrail(trail, "android").map((f) => `${f.severity}:${f.rule}`);
  assert.deepEqual(rules.sort(), ["error:tap-on-point", "warning:index-selector", "warning:no-trailhead"].sort());
});

test("a trail that asserts nothing gets a warning, not a block", () => {
  const trail = parseTrail(`
trailhead:
  step: Launch
  recording:
    android: { launchApp: { appId: a.b } }
trail:
  - step: Tap
    recording:
      android:
        - tapOnElementBySelector: { nodeSelector: { androidAccessibility: { textRegex: Go } } }
`);
  assert.equal(mobileTrailResult(trail, "android").status, "emitted");
  assert.deepEqual(lintMobileTrail(trail, "android").map((f) => f.rule), ["no-assertion"]);
});

test("run arguments replay the recording with no model and do not overwrite it", () => {
  assert.deepEqual(runArgs(config(), "t/trail.yaml"), ["run", "t/trail.yaml", "-d", "android", "--llm", "none", "--no-save-recording"]);
});

test("exit 0 passes; exit 1 with no device is infrastructure; a real assertion failure fails", () => {
  assert.equal(classifyRun(0, ""), "passed");
  assert.equal(classifyRun(1, "❌ FAILED: No connected device for platform 'android'"), "infra");
  assert.equal(classifyRun(1, "❌ FAILED: assertVisibleBySelector did not match"), "failed");
  assert.equal(classifyRun(3, "Command parse failed"), "infra");
  assert.equal(classifyRun(2, ""), "infra");
  assert.equal(classifyRun(null, ""), "infra");
});

function project(trails: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "sova-mobile-"));
  for (const [id, body] of Object.entries(trails)) {
    mkdirSync(join(root, "trails", id), { recursive: true });
    writeFileSync(join(root, "trails", id, "trail.yaml"), body);
  }
  return root;
}

test("emitAll on a phone project reports ready and blocked trails and writes nothing", () => {
  const root = project({ good: RECORDED, bad: PROSE_ONLY });
  const run = emitAll(root, config(), true);
  const byId = Object.fromEntries(run.files.map((f) => [f.id, f.result.status]));
  assert.deepEqual(byId, { bad: "blocked", good: "emitted" });
  assert.deepEqual(run.orphans, []);
});

test("stability counts passes per trail and never counts a missing device as a failure", () => {
  const root = project({ good: RECORDED, bad: PROSE_ONLY });
  let calls = 0;
  const report = measureMobileStability(root, config(), 3, () => ({ status: ++calls === 2 ? 1 : 0, output: "assertion failed" }));
  assert.equal(report.failure, undefined);
  assert.deepEqual(report.tests.map((t) => [t.title, t.passed, t.runs]), [["good", 2, 3]]);
  const infra = measureMobileStability(root, config(), 3, () => ({ status: 1, output: "FAILED: No connected device for platform 'android'" }));
  assert.match(infra.failure ?? "", /not a test failure/);
});

test("a single mutation run lists the failed trail and stops at max failures", () => {
  const root = project({ a: RECORDED, b: RECORDED, c: RECORDED });
  const failing = runOnceMobile(root, config(), 1, () => ({ status: 1, output: "assertion failed" }));
  assert.equal(failing.passed, false);
  assert.equal(failing.failed.length, 1);
  assert.equal(runOnceMobile(root, config(), undefined, () => ({ status: 0, output: "" })).passed, true);
});

test("on a phone, open launches the app and act does not rewrite refs", () => {
  const phone = config({ appId: "com.example.app" });
  assert.deepEqual(openArgs(phone, []), ["tool", "-d", "android", "launchApp", "appId=com.example.app", "-s", "Launch com.example.app"]);
  assert.deepEqual(actArgs(phone, ["tap", "ref=e42", "-s", "Tap Go"], null), ["tool", "-d", "android", "tap", "ref=e42", "-s", "Tap Go"]);
  assert.throws(() => openArgs(config(), []), /Which app/);
});
