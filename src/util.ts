import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** A JavaScript single-quoted string literal for `value`. */
export function quote(value: string): string {
  const body = value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  return `'${body}'`;
}

/** Escape `value` so it matches literally inside a regular expression. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A JavaScript regex literal for `source`, or null when `source` is not a valid JS regex. */
export function regexLiteral(source: string, flags = ""): string | null {
  try {
    new RegExp(source, flags);
  } catch {
    return null;
  }
  // A bare `/` would end the literal early.
  const escaped = source.replace(/\\[\s\S]|\//g, (match) => (match === "/" ? "\\/" : match));
  return `/${escaped}/${flags}`;
}

/** Every file under `dir` (recursive) for which `keep` returns true. Missing dir gives []. */
export function walk(dir: string, keep: (path: string) => boolean): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries.sort()) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path, keep));
    else if (keep(path)) found.push(path);
  }
  return found;
}

/** Thrown for a problem the user can fix; the CLI prints the message without a stack. */
export class UserError extends Error {}

const WINDOWS = process.platform === "win32";

/** Whether `command` can be found on PATH. */
export function onPath(command: string): boolean {
  return spawnSync(WINDOWS ? "where" : "which", [command], { stdio: "ignore" }).status === 0;
}

/** Quote one argument for cmd.exe, which is what runs a `.cmd` launcher on Windows. */
export function quoteForCmd(arg: string): string {
  if (arg !== "" && !/[\s"&|<>^%()!]/.test(arg)) return arg;
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1").replace(/%/g, "%%")}"`;
}

/**
 * Run a command-line tool that is found on PATH (npm, pnpm, brew, the browser driver). On
 * Windows these are `.cmd` launchers, which Node only starts through a shell, so the
 * arguments are quoted here instead of being passed through untouched.
 */
export function runTool(command: string, args: string[], options: SpawnSyncOptions): SpawnSyncReturns<Buffer | string> {
  if (!WINDOWS) return spawnSync(command, args, options);
  return spawnSync([command, ...args].map(quoteForCmd).join(" "), { ...options, shell: true });
}
