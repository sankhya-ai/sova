import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { ENV_PATH, loadEnv, type SovaConfig } from "./config.js";
import { isTrailFile } from "./emit.js";
import { readTrail } from "./trail.js";
import { AUTHOR_NAMED_ROLES, NAME_PROHIBITED_ROLES } from "./locator.js";
import { onPath, runTool, UserError, walk } from "./util.js";

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

/** One element of the last screen the driver printed. */
export interface ScreenElement {
  role: string;
  name: string;
}

const SCREEN_PATH = join("sova", ".results", "screen.json");

/** The `[e5] button "Sign in"` lines of a driver snapshot, keyed by ref. */
export function parseScreen(output: string): Record<string, ScreenElement> {
  const elements: Record<string, ScreenElement> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*\[(e\d+)\]\s+([A-Za-z]+)(?:\s+"(.*)")?/.exec(line);
    if (match) elements[match[1]!] = { role: match[2]!, name: match[3] ?? "" };
  }
  return elements;
}

function loadScreen(root: string): Record<string, ScreenElement> | null {
  const path = join(root, SCREEN_PATH);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, ScreenElement>;
  } catch {
    return null;
  }
}

/**
 * A snapshot ref such as `e5` only means something inside one browser session, and the
 * driver records it as typed. So a ref is swapped for the element's role and accessible
 * name, which is what a test can find again. Anything that is not a bare ref passes through.
 */
export function durableRef(ref: string, screen: Record<string, ScreenElement> | null): string {
  if (!/^e\d+$/.test(ref)) return ref;
  if (!screen) throw new UserError(`No screen has been captured yet, so ${ref} means nothing. Run \`sova look\` first.`);
  const element = screen[ref];
  if (!element) {
    throw new UserError(`${ref} is not on the last screen sova saw. Refs change when the page does; run \`sova look\` again.`);
  }
  const fix =
    "Give the element a unique accessible name (a label, aria-label or visible text) in the app's code, " +
    'or target it with ref="css=<selector>" (ideally a [data-testid="..."] you add).';
  if (element.name === "") {
    throw new UserError(`${ref} is a ${element.role} with no accessible name, so a test could not find it again.\n${fix}`);
  }
  const twins = Object.entries(screen).filter(
    ([other, e]) => other !== ref && e.role === element.role && e.name === element.name,
  );
  if (twins.length > 0) {
    throw new UserError(
      `${ref} is one of ${twins.length + 1} elements that are all ${element.role} "${element.name}" ` +
        `(also ${twins.map(([other]) => other).join(", ")}), so a test could not tell them apart.\n${fix}`,
    );
  }
  return `${element.role} "${element.name}"`;
}

function trailblaze(root: string, args: string[], quiet = false): number {
  if (!onPath("trailblaze")) {
    throw new UserError("The browser driver is not installed. Run `sova doctor` to see how to install it.");
  }
  const result = runTool("trailblaze", args, {
    cwd: root,
    stdio: ["inherit", "pipe", "inherit"],
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = String(result.stdout ?? "");
  if (!quiet || result.status !== 0) process.stdout.write(output);
  // Remember the screen the driver just printed, so the next `act` can resolve its refs.
  const screen = parseScreen(output);
  if (Object.keys(screen).length > 0) {
    const path = join(root, SCREEN_PATH);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(screen, null, 2));
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
export function actArgs(
  config: SovaConfig,
  args: string[],
  screen: Record<string, ScreenElement> | null = null,
): string[] {
  const [name, ...others] = args;
  if (!name) throw new UserError("Usage: sova act <action> [key=value ...] -s \"<what this step is for>\"\nRun `sova actions` for the list.");
  const tool = ACTIONS[name]?.tool ?? name;
  if (others.includes("--help") || others.includes("-h")) return ["tool", tool, "--help"];
  const { step, rest } = takeStep(others);
  const text = requireStep(step, `sova act click ref=e5 -s "Click Sign in"`);
  const extra = name === "back" ? ["action=BACK"] : [];
  // Refuse a ref no test could find again before the driver acts on it.
  for (const arg of rest) if (arg.startsWith("ref=")) durableRef(arg.slice(4), screen);
  return ["tool", "-d", config.device, tool, ...extra, ...rest, "-s", text];
}

export function open(root: string, config: SovaConfig, args: string[]): number {
  return trailblaze(root, openArgs(config, args));
}

export function look(root: string, config: SovaConfig): number {
  return trailblaze(root, ["snapshot", "-d", config.device]);
}

/**
 * What to hand the driver for a snapshot ref. Elements the snapshot lists by their text
 * (an alert, a paragraph, a quote) have no accessible name, and released drivers cannot
 * find them by id or by role, only by that text.
 */
export function driverRef(ref: string, screen: Record<string, ScreenElement> | null): string {
  const element = /^e\d+$/.test(ref) ? screen?.[ref] : undefined;
  if (element && (AUTHOR_NAMED_ROLES.has(element.role) || NAME_PROHIBITED_ROLES.has(element.role))) return element.name;
  return ref;
}

export function act(root: string, config: SovaConfig, args: string[]): number {
  const screen = loadScreen(root);
  const planned = actArgs(config, args, screen);
  const noted: JournalEntry[] = [];
  const step = planned[planned.length - 1]!;
  const env = loadEnv(root);
  const driverArgs = planned.map((arg, index) => {
    // `text=env:NAME` types a secret: the driver gets the value, the trail gets `{{env.NAME}}`.
    const secret = index < planned.length - 2 ? /^([A-Za-z]+)=env:([A-Za-z_][A-Za-z0-9_]*)$/.exec(arg) : null;
    if (secret) {
      const value = env[secret[2]!];
      if (value === undefined || value === "") {
        throw new UserError(`${secret[2]} is not set. Add ${secret[2]}=<value> to ${ENV_PATH} (it is git-ignored) or the environment.`);
      }
      noted.push({ step, key: secret[1]!, sent: value, durable: `{{env.${secret[2]}}}` });
      return `${secret[1]}=${value}`;
    }
    // `text=unique:ada@example.com` types a value that is new each time (ada+k3j9x2@example.com); the trail keeps `{{unique.<base>}}`.
    const fresh = index < planned.length - 2 ? /^([A-Za-z]+)=unique:(.+)$/.exec(arg) : null;
    if (fresh) {
      const base = fresh[2]!;
      const tag = Math.random().toString(36).slice(2, 8);
      const at = base.indexOf("@");
      const value = at === -1 ? `${base}-${tag}` : `${base.slice(0, at)}+${tag}${base.slice(at)}`;
      noted.push({ step, key: fresh[1]!, sent: value, durable: `{{unique.${base}}}` });
      return `${fresh[1]}=${value}`;
    }
    if (!/^ref=e\d+$/.test(arg)) return arg;
    const sent = driverRef(arg.slice(4), screen);
    noted.push({ step, sent, durable: durableRef(arg.slice(4), screen) });
    return `ref=${sent}`;
  });
  const code = trailblaze(root, driverArgs);
  if (code === 0 && noted.length > 0) writeJournal(root, [...readJournal(root), ...noted]);
  return code;
}

/** One driven step that used a snapshot ref, and the selector that ref stood for. */
export interface JournalEntry {
  step: string;
  /** The argument this is about. Absent means `ref`. */
  key?: string;
  /** The value as it was handed to the driver, which is how the driver records it. */
  sent: string;
  durable: string;
}

const JOURNAL_PATH = join("sova", ".results", "session.json");

function readJournal(root: string): JournalEntry[] {
  try {
    return JSON.parse(readFileSync(join(root, JOURNAL_PATH), "utf8")) as JournalEntry[];
  } catch {
    return [];
  }
}

function writeJournal(root: string, entries: JournalEntry[]): void {
  const path = join(root, JOURNAL_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(entries, null, 2));
}

/**
 * The driver records a snapshot ref exactly as it was given (`ref: e16`), and that id is
 * gone once the browser closes. Swap each one for the selector sova noted when the step ran.
 */
export function withDurableRefs(trailYaml: string, journal: JournalEntry[]): string {
  const left = [...journal];
  let step = "";
  return trailYaml
    .split("\n")
    .map((line) => {
      const stepLine = /^\s*-\s+(?:step|verify):\s*(.*)$/.exec(line);
      if (stepLine) {
        try {
          step = String(parseYaml(stepLine[1]!));
        } catch {
          step = stepLine[1]!;
        }
        return line;
      }
      const refLine = /^(\s*([A-Za-z]+):\s*)(.+?)\s*$/.exec(line);
      if (!refLine) return line;
      const key = refLine[2]!;
      let recorded = refLine[3]!;
      try {
        recorded = String(parseYaml(recorded));
      } catch {
        // Not a YAML scalar on its own; compare it as written.
      }
      const index = left.findIndex((entry) => (entry.key ?? "ref") === key && entry.sent === recorded && entry.step === step);
      if (index === -1) return line;
      const [entry] = left.splice(index, 1);
      return `${refLine[1]}${JSON.stringify(entry!.durable)}`;
    })
    .join("\n");
}

/** Abandon the flow in progress: close the browser session and forget its steps. */
export function discard(root: string, config: SovaConfig): number {
  rmSync(join(root, JOURNAL_PATH), { force: true });
  rmSync(join(root, SCREEN_PATH), { force: true });
  return trailblaze(root, ["session", "stop", "-d", config.device]);
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
  const journal = readJournal(root);
  for (const file of changed) writeFileSync(file, withDurableRefs(readFileSync(file, "utf8"), journal));
  rmSync(join(root, JOURNAL_PATH), { force: true });
  rmSync(join(root, SCREEN_PATH), { force: true });
  return { code, changed };
}

/** Replay a trail, letting the driver repair steps the app has drifted away from. */
export function heal(root: string, config: SovaConfig, id: string): number {
  return trailblaze(root, ["run", join(config.trailsDir, id), "-d", config.device, "--self-heal"]);
}

/** A clean, signed-out browser: drop the flow in progress and restart the driver. */
export function reset(root: string, config: SovaConfig): number {
  discard(root, config);
  return trailblaze(root, ["--stop"]);
}

/**
 * Sign the driven browser in by replaying the configured sign-in flow, without recording it.
 * Flows driven afterwards start signed in, the way their tests will.
 */
export function login(root: string, config: SovaConfig): number {
  const id = config.login?.trail;
  if (!id) {
    throw new UserError('No sign-in flow is configured. Drive one, save it, then set "login": { "trail": "<id>" } in sova/config.json.');
  }
  const candidates = [join(root, config.trailsDir, id, "trail.yaml"), join(root, config.trailsDir, `${id}.trail.yaml`)];
  const file = candidates.find((path) => existsSync(path));
  if (!file) throw new UserError(`The sign-in flow trails/${id} does not exist yet. Drive it and \`sova save ${id}\`.`);
  const env = loadEnv(root);
  reset(root, config);
  for (const step of readTrail(file).steps) {
    for (const call of step.calls ?? []) {
      const args = Object.entries(call.args).map(([key, value]) => {
        let text = String(value).replace(/\{\{env\.([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (_, name: string) => {
          const found = env[name];
          if (found === undefined) throw new UserError(`${name} is not set. Add it to ${ENV_PATH} or the environment.`);
          return found;
        });
        const described = key === "ref" ? /^([a-z]+)\s+"(.*)"$/.exec(text) : null;
        if (described && (AUTHOR_NAMED_ROLES.has(described[1]!) || NAME_PROHIBITED_ROLES.has(described[1]!))) text = described[2]!;
        return `${key}=${text}`;
      });
      const code = trailblaze(root, ["tool", "-d", config.device, call.tool, ...args, "-s", step.text], true);
      if (code !== 0) {
        console.log(`Sign-in stopped at "${step.text}". Fix the flow (or the account in ${ENV_PATH}) and try again.`);
        return code;
      }
      console.log(`ok       ${step.text}`);
    }
  }
  // Close the session so these steps are not part of the next flow; the browser stays signed in.
  trailblaze(root, ["session", "stop", "-d", config.device], true);
  rmSync(join(root, SCREEN_PATH), { force: true });
  console.log("Signed in. Flows you drive now start signed in.");
  return 0;
}
