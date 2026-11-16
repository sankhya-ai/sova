import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Trail, TrailStep } from "./trail.js";

/** Where an assertion's expected result came from. */
export type AssertionSource = "spec" | "code" | "untagged";

export interface AssertionInfo {
  text: string;
  tool: string;
  /** weak: only proves an element is on the page. strong: proves a value, a URL or a changed state. */
  strength: "weak" | "strong";
  source: AssertionSource;
  /** The reference after `spec:` (a ticket, doc or a person who confirmed it). */
  ref?: string;
  /** True when the assertion came after the flow did something (click, type, select). */
  afterAction: boolean;
}

export type TrailGrade = "behavioural" | "smoke" | "none";

export interface TrailQuality {
  grade: TrailGrade;
  assertions: AssertionInfo[];
}

const TAG = /\[(spec|code)(?::\s*([^\]]*))?\]/i;

/**
 * An assertion's step text can carry a tag saying where the expected result came from:
 * `[spec: JIRA-12]` (a ticket, doc, schema or a person said so) or `[code]` (guessed from
 * reading the app's code, so it may be locking in a bug).
 */
export function parseSource(text: string): { source: AssertionSource; ref?: string } {
  const match = TAG.exec(text);
  if (!match) return { source: "untagged" };
  const ref = match[2]?.trim();
  return { source: match[1]!.toLowerCase() as "spec" | "code", ref: ref === "" ? undefined : ref };
}

const ASSERT_TOOLS = new Set(["web_verifyElementVisible", "web_verifyValue", "web_waitForUrl", "web_verifyListVisible", "web_verifyText"]);
const PASSIVE_TOOLS = new Set(["web_navigate", "web_scroll", "web_wait", "web_back", "web_hover"]);

function refOf(step: TrailStep): string {
  for (const call of step.calls ?? []) {
    const ref = call.args.ref;
    if (typeof ref === "string") return ref;
  }
  return "";
}

/** A visible heading or menu entry says the page loaded, not that it works. */
function isPresenceOnly(tool: string, ref: string): boolean {
  if (tool !== "web_verifyElementVisible") return false;
  return /^(heading|menuitem|banner|navigation|link|img)\b/.test(ref);
}

export function gradeTrail(trail: Trail): TrailQuality {
  const assertions: AssertionInfo[] = [];
  let acted = false;
  for (const step of trail.steps) {
    const calls = step.calls ?? [];
    const assertCall = calls.find((call) => ASSERT_TOOLS.has(call.tool));
    if (assertCall) {
      const { source, ref } = parseSource(step.text);
      const weak = isPresenceOnly(assertCall.tool, refOf(step)) && !acted;
      assertions.push({ text: step.text, tool: assertCall.tool, strength: weak ? "weak" : "strong", source, ref, afterAction: acted });
    } else if (calls.some((call) => !PASSIVE_TOOLS.has(call.tool))) {
      acted = true;
    }
  }
  if (assertions.length === 0) return { grade: "none", assertions };
  const behavioural = assertions.some((a) => a.afterAction || a.strength === "strong");
  return { grade: behavioural ? "behavioural" : "smoke", assertions };
}

/**
 * Move a trail's guessed assertions to confirmed: `[code]` becomes `[spec: confirmed by <who>]`.
 * Returns how many tags changed. The trail then needs `sova emit`.
 */
export function confirmTrailFile(path: string, who: string): number {
  const source = readFileSync(path, "utf8");
  let count = 0;
  const next = source.replace(/\[code\]/gi, () => {
    count += 1;
    return `[spec: confirmed by ${who.replace(/[\]\n]/g, " ")}]`;
  });
  if (count > 0) writeFileSync(path, next);
  return count;
}

export function trailPath(root: string, trailsDir: string, id: string): string {
  return join(root, trailsDir, id, "trail.yaml");
}

export function hasTrail(root: string, trailsDir: string, id: string): boolean {
  return existsSync(trailPath(root, trailsDir, id)) && readdirSync(join(root, trailsDir, id)).length > 0;
}
