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
