import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import type { SovaConfig } from "./config.js";
import { isTrailFile } from "./emit.js";
import { measureStability, runOnce, type RunOutcome, type StabilityReport, type TestStability } from "./playwright.js";
import { readTrail, type MobilePlatform, type Trail, type ToolCall } from "./trail.js";
import { trailId } from "./emit.js";
import { onPath, runTool, UserError, walk } from "./util.js";

/**
 * The mobile path. On the web sova turns Trailblaze recordings into Playwright tests. Playwright cannot
 * drive a phone, so for Android and iOS the recording itself is the test: the gate replays it with
 * `trailblaze run --llm none`, which uses each step's recorded tool calls and calls no model.
 */

export type Platform = "web" | MobilePlatform;

/** The platform a config targets: `platform`, else what `device` starts with, else web. */
export function platformOf(config: Pick<SovaConfig, "platform" | "device">): Platform {
  if (config.platform) return config.platform;
  if (config.device.startsWith("android")) return "android";
  if (config.device.startsWith("ios")) return "ios";
  return "web";
}

export function isMobile(config: Pick<SovaConfig, "platform" | "device">): boolean {
  return platformOf(config) !== "web";
}

/** The device Trailblaze is told to use: a configured mobile device, or just the platform name. */
export function mobileDevice(config: Pick<SovaConfig, "platform" | "device">): string {
  const platform = platformOf(config);
  return config.device.startsWith(platform) ? config.device : platform;
}

/** Short action names for `sova act` on a phone and the Trailblaze tool each one runs. */
export const MOBILE_ACTIONS: Record<string, { tool: string; use: string }> = {
  tap: { tool: "tap", use: "ref=<ref from `sova look`>" },
  type: { tool: "type", use: 'text="<text>"            (types into the focused field)' },
  launch: { tool: "launchApp", use: "appId=<package or bundle id>" },
};

export interface MobileFinding {
  step: number;
  severity: "error" | "warning";
  rule: string;
  message: string;
}

/** Tools that check something. A trail with none of them only proves the app did not crash. */
export function isAssertion(tool: string): boolean {
  return tool.startsWith("assert");
}

/** Coordinates mean the test breaks on another screen size. */
const COORDINATE_TOOLS = new Set(["tapOnPoint", "longPressOnPoint"]);

function hasKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => hasKey(item, key));
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(([k, v]) => k === key || hasKey(v, key));
}

/** A selector that matches by position only is the first thing to break when the layout changes. */
function onlyByIndex(call: ToolCall): boolean {
  const selector = call.args.nodeSelector ?? call.args.selector;
  if (typeof selector !== "object" || selector === null) return false;
  const text = JSON.stringify(selector);
  return hasKey(selector, "index") && !/(Regex|resourceId|uniqueId|contentDescription|testTag)/.test(text);
}

/**
 * What stops a trail being a trustworthy gate test on a device. Errors block it from the gate.
 * Steps are numbered from 1; the trailhead (when the trail has one) is step 1.
 */
export function lintMobileTrail(trail: Trail, platform: MobilePlatform): MobileFinding[] {
  const findings: MobileFinding[] = [];
  let assertions = 0;
  const head = trail.steps[0]?.kind === "trailhead";
  if (!head) {
    findings.push({
      step: 0,
      severity: "warning",
      rule: "no-trailhead",
      message: "the trail has no trailhead, so nothing says how the app starts. Add a recorded launchApp so every run starts from the same place.",
    });
  }
  for (const [index, step] of trail.steps.entries()) {
    const calls = step.mobile[platform];
    const where = `step ${index + 1} (${JSON.stringify(step.text)})`;
    if (calls === undefined || calls.length === 0) {
      findings.push({
        step: index + 1,
        severity: "error",
        rule: step.kind === "verify" ? "verify-needs-model" : "no-recording",
        message:
          step.kind === "verify"
            ? `${where} is a verify with no ${platform} recording. A model judges it from a screenshot at every run. Record an assertVisibleBySelector for it.`
            : `${where} has no ${platform} recording, so a run would have to ask a model what to do. Drive it once so it is recorded.`,
      });
      continue;
    }
    for (const call of calls) {
      if (isAssertion(call.tool)) assertions += 1;
      if (COORDINATE_TOOLS.has(call.tool)) {
        findings.push({ step: index + 1, severity: "error", rule: "tap-on-point", message: `${where} taps a screen position. Use a selector (text, content description or id) so it works on any screen size.` });
      }
      if (onlyByIndex(call)) {
        findings.push({ step: index + 1, severity: "warning", rule: "index-selector", message: `${where} finds its element by position in a list only. Add text or an id.` });
      }
    }
  }
  if (assertions === 0) {
    findings.push({ step: 0, severity: "warning", rule: "no-assertion", message: "the trail never asserts anything, so it passes whenever the app does not crash." });
  }
  return findings;
}

export interface MobileTrailResult {
  status: "emitted" | "blocked" | "skipped";
  reason?: string;
  warnings: string[];
  assertions: number;
}

/** The mobile equivalent of emitting a spec: is this trail ready to be a gate test? */
export function mobileTrailResult(trail: Trail, platform: MobilePlatform): MobileTrailResult {
  if (!trail.mobilePlatforms.includes(platform)) {
    return { status: "skipped", reason: `no ${platform} recording`, warnings: [], assertions: 0 };
  }
  const findings = lintMobileTrail(trail, platform);
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning").map((f) => f.message);
  const assertions = trail.steps.reduce((n, step) => n + (step.mobile[platform] ?? []).filter((c) => isAssertion(c.tool)).length, 0);
  if (errors.length > 0) return { status: "blocked", reason: errors.map((e) => e.message).join("\n         "), warnings, assertions };
  return { status: "emitted", warnings, assertions };
}

/** The `trailblaze run` arguments for one trail: replay the recording, no model, leave the recording as it is. */
export function runArgs(config: Pick<SovaConfig, "platform" | "device">, trailPath: string): string[] {
  return ["run", trailPath, "-d", mobileDevice(config), "--llm", "none", "--no-save-recording"];
}

export type RunVerdict = "passed" | "failed" | "infra";

/**
 * Read one `trailblaze run`. Seen on Trailblaze v2026.11.12: with no device connected it prints
 * "No connected device for platform ..." and exits 1, the same code as a failed assertion, so the
 * output decides, not only the exit code. A flag it does not know exits 3.
 */
export function classifyRun(status: number | null, output: string): RunVerdict {
  if (status === 0) return "passed";
  if (status === null || status >= 2) return "infra";
  if (/No connected device|Device bind failed|already in use|Command parse failed|Could not connect|daemon/i.test(output)) return "infra";
  return "failed";
}

export interface RunResult {
  status: number | null;
  output: string;
}

export type TrailRunner = (trailPath: string) => RunResult;

function realRunner(root: string, config: SovaConfig): TrailRunner {
  return (trailPath) => {
    const result = runTool("trailblaze", runArgs(config, trailPath), {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: result.status, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
  };
}

/** Every trail that is ready to be a gate test on this platform, as `[path, id]`. */
export function gateTrails(root: string, config: SovaConfig): { path: string; id: string }[] {
  const platform = platformOf(config) as MobilePlatform;
  const dir = join(root, config.trailsDir);
  const found: { path: string; id: string }[] = [];
  for (const path of walk(dir, isTrailFile)) {
    try {
      const trail = readTrail(path);
      if (mobileTrailResult(trail, platform).status === "emitted") found.push({ path, id: trailId(path, dir) });
    } catch {
      // A file that is not a trail is reported by `sova emit`, not here.
    }
  }
  return found;
}

function needTrailblaze(): void {
  if (!onPath("trailblaze")) throw new UserError("Trailblaze is not installed. Run `sova doctor` to see how to install it.");
}

/** Run every ready trail `repeat` times, retries off, and say how often each passed. A device or daemon problem is not a test result: it stops the run. */
export function measureMobileStability(
  root: string,
  config: SovaConfig,
  repeat: number,
  runner: TrailRunner = realRunner(root, config),
): StabilityReport {
  const trails = gateTrails(root, config);
  if (trails.length === 0) return { tests: [], failure: "No trail is ready to run on this platform. Run `sova emit` to see why each one is blocked." };
  const tests: TestStability[] = [];
  for (const trail of trails) {
    const entry: TestStability = { file: relative(root, trail.path), title: trail.id, runs: 0, passed: 0 };
    for (let i = 0; i < repeat; i += 1) {
      const result = runner(trail.path);
      const verdict = classifyRun(result.status, result.output);
      if (verdict === "infra") {
        const tail = result.output.trim().split("\n").slice(-6).join("\n");
        return { tests, failure: `Trailblaze could not run ${trail.id} (not a test failure):\n${tail}` };
      }
      entry.runs += 1;
      if (verdict === "passed") entry.passed += 1;
    }
    tests.push(entry);
  }
  return { tests };
}

/** Run the suite once, as `mutate` needs. With `maxFailures` it stops at the first failures. */
export function runOnceMobile(root: string, config: SovaConfig, maxFailures?: number, runner: TrailRunner = realRunner(root, config)): RunOutcome {
  const trails = gateTrails(root, config);
  if (trails.length === 0) return { passed: false, failed: [], failure: "No trail is ready to run on this platform." };
  const failed: string[] = [];
  for (const trail of trails) {
    const result = runner(trail.path);
    const verdict = classifyRun(result.status, result.output);
    if (verdict === "infra") return { passed: false, failed, failure: result.output.trim().split("\n").slice(-6).join("\n") };
    if (verdict === "failed") {
      failed.push(`${relative(root, trail.path)} > ${trail.id}`);
      if (maxFailures && failed.length >= maxFailures) break;
    }
  }
  return { passed: failed.length === 0, failed };
}

/** The gate's measurement, for whichever platform the project targets. */
export function measureSuite(root: string, config: SovaConfig, repeat: number): StabilityReport {
  if (!isMobile(config)) return measureStability(root, config, repeat);
  needTrailblaze();
  return measureMobileStability(root, config, repeat);
}

/** One run of the suite, for whichever platform the project targets. */
export function runSuite(root: string, config: SovaConfig, maxFailures?: number): RunOutcome {
  if (!isMobile(config)) return runOnce(root, config, maxFailures);
  needTrailblaze();
  return runOnceMobile(root, config, maxFailures);
}

/** Whether `trailblaze device list` shows a device for the platform. Null when it could not be asked. */
export function deviceConnected(platform: MobilePlatform): boolean | null {
  if (!onPath("trailblaze")) return null;
  const result = spawnSync("trailblaze", ["device", "list"], { encoding: "utf8", timeout: 60_000 });
  if (result.status !== 0) return null;
  return new RegExp(`--device ${platform}[/\\s]`).test(String(result.stdout));
}
