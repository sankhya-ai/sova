import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import type { SovaConfig } from "./config.js";
import { isTrailFile } from "./emit.js";
import { UserError, walk } from "./util.js";

/**
 * The browser-driving commands. Each one runs the Trailblaze CLI, which owns the browser
 * session and the recording, so nobody using sova has to learn a second tool.
 */

/** Short action names and the Trailblaze web tool each one runs. */
export const ACTIONS: Record<string, { tool: string; use: string }> = {
  click: { tool: "web_click", use: "ref=<ref>" },
  type: { tool: "web_type", use: 'ref=<ref> text="<text>"' },
  select: { tool: "web_selectOption", use: "ref=<ref> values=<option value>" },
  hover: { tool: "web_hover", use: "ref=<ref>" },
  press: { tool: "web_pressKey", use: "key=<key, e.g. Enter>" },
  scroll: { tool: "web_scroll", use: "direction=<UP|DOWN|LEFT|RIGHT> [amount=<pixels>] [ref=<ref>]" },
  see: { tool: "web_verifyElementVisible", use: "ref=<ref>            (assert: the element is visible)" },
  value: { tool: "web_verifyValue", use: 'ref=<ref> expected="<text>" [type=<TEXT|VALUE|ATTRIBUTE>]   (assert)' },
  url: { tool: "web_waitForUrl", use: 'pattern="<regex found in the URL>"   (assert)' },
  back: { tool: "web_navigate", use: "(no arguments)" },
};

function trailblaze(root: string, args: string[]): number {
  const result = spawnSync("trailblaze", args, { cwd: root, stdio: "inherit" });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new UserError("The browser driver is not installed. Run `sova init` to install it.");
  }
  return result.status ?? 1;
}

/** Pull `-s <text>` / `--step <text>` out of `args`. */
export function takeStep(args: string[]): { step: string | undefined; rest: string[] } {
  const rest = [...args];
  const index = rest.findIndex((arg) => arg === "-s" || arg === "--step");
  if (index === -1) return { step: undefined, rest };
  const step = rest[index + 1];
  rest.splice(index, 2);
  return { step, rest };
}

function requireStep(step: string | undefined, example: string): string {
  if (!step || step.trim() === "") {
    throw new UserError(`Say what the step is for with -s. It becomes the step name in the test.\nExample: ${example}`);
  }
  return step;
}

/** A URL to navigate to: absolute as given, anything else resolved against the base URL. */
export function resolveUrl(target: string, baseURL: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  return `${baseURL.replace(/\/+$/, "")}/${target.replace(/^\/+/, "")}`;
}

/** The Trailblaze arguments for `sova open <url>`. */
export function openArgs(config: SovaConfig, args: string[]): string[] {
  const { step, rest } = takeStep(args);
  const target = rest[0] ?? "/";
  const url = resolveUrl(target, config.baseURL);
  return ["tool", "-d", config.device, "web_navigate", `url=${url}`, "-s", step ?? `Open ${target}`];
}

/** The Trailblaze arguments for `sova act <action> ...`. */
export function actArgs(config: SovaConfig, args: string[]): string[] {
  const [name, ...others] = args;
  if (!name) throw new UserError("Usage: sova act <action> [key=value ...] -s \"<what this step is for>\"\nRun `sova actions` for the list.");
  const tool = ACTIONS[name]?.tool ?? name;
  if (others.includes("--help") || others.includes("-h")) return ["tool", tool, "--help"];
  const { step, rest } = takeStep(others);
  const text = requireStep(step, `sova act click ref=e5 -s "Click Sign in"`);
  const extra = name === "back" ? ["action=BACK"] : [];
  return ["tool", "-d", config.device, tool, ...extra, ...rest, "-s", text];
}

export function open(root: string, config: SovaConfig, args: string[]): number {
  return trailblaze(root, openArgs(config, args));
}

export function look(root: string, config: SovaConfig): number {
  return trailblaze(root, ["snapshot", "-d", config.device]);
}

export function act(root: string, config: SovaConfig, args: string[]): number {
  return trailblaze(root, actArgs(config, args));
}

function trailTimes(root: string, config: SovaConfig): Map<string, number> {
  const files = walk(join(root, config.trailsDir), isTrailFile);
  return new Map(files.map((file) => [file, statSync(file).mtimeMs]));
}

/**
 * Save the current session as a trail and close the browser session so the next flow starts
 * clean. Returns the trail files that were created or changed.
 */
export function save(root: string, config: SovaConfig, id: string): { code: number; changed: string[] } {
  const before = trailTimes(root, config);
  const code = trailblaze(root, ["session", "save", "-t", id]);
  // Stop even when the save failed: a half-finished session must not leak into the next flow.
  trailblaze(root, ["session", "stop", "-d", config.device]);
  const changed = [...trailTimes(root, config)]
    .filter(([file, time]) => before.get(file) !== time)
    .map(([file]) => file);
  return { code, changed };
}

/** Replay a trail, letting the driver repair steps the app has drifted away from. */
export function heal(root: string, config: SovaConfig, id: string): number {
  return trailblaze(root, ["run", join(config.trailsDir, id), "-d", config.device, "--self-heal"]);
}
