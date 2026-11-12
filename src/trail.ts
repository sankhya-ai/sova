import { readFileSync } from "node:fs";
import { parse } from "yaml";

/** One recorded tool call, e.g. `web_click` with its arguments. */
export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface TrailStep {
  /** The natural-language step text. */
  text: string;
  kind: "trailhead" | "step" | "verify";
  /** Recorded web tool calls, or null when the step has no web recording. */
  calls: ToolCall[] | null;
}

export interface Trail {
  title: string | null;
  tags: string[];
  /** True when the trail targets the web at all (declares a web device or has a web recording). */
  isWeb: boolean;
  steps: TrailStep[];
}

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A recording slot is a list of single-key maps, or (for a trailhead) one such map. */
function toCalls(slot: unknown): ToolCall[] {
  const items = Array.isArray(slot) ? slot : [slot];
  const calls: ToolCall[] = [];
  for (const item of items) {
    if (!isDict(item)) continue;
    for (const [tool, args] of Object.entries(item)) {
      calls.push({ tool, args: isDict(args) ? args : {} });
    }
  }
  return calls;
}

/** The web slot of a `recording:` block: `web`, else the first `web-*` classifier. */
function webSlot(recording: unknown): unknown {
  if (!isDict(recording)) return undefined;
  if ("web" in recording) return recording.web;
  const key = Object.keys(recording).find((name) => name.startsWith("web"));
  return key ? recording[key] : undefined;
}

function toStep(item: unknown, forcedKind?: "trailhead"): TrailStep | null {
  if (!isDict(item)) return null;
  const verifyText = typeof item.verify === "string" ? item.verify : null;
  const stepText = typeof item.step === "string" ? item.step : null;
  const text = stepText ?? verifyText;
  if (text === null) return null;
  const slot = webSlot(item.recording);
  return {
    text: text.trim(),
    kind: forcedKind ?? (verifyText !== null || item.verify === true ? "verify" : "step"),
    calls: slot === undefined ? null : toCalls(slot),
  };
}

/** Parse a unified Trailblaze `trail.yaml`. Throws on YAML that is not a trail. */
export function parseTrail(source: string): Trail {
  const doc = parse(source) as unknown;
  if (!isDict(doc) || !Array.isArray(doc.trail)) {
    throw new Error("not a unified trail: expected a top-level `trail:` list");
  }
  const config = isDict(doc.config) ? doc.config : {};
  const steps: TrailStep[] = [];
  const head = toStep(doc.trailhead, "trailhead");
  if (head) steps.push(head);
  for (const item of doc.trail) {
    const step = toStep(item);
    if (step) steps.push(step);
  }
  const declaresWeb = isDict(config.devices) && Object.keys(config.devices).some((k) => k.startsWith("web"));
  return {
    title: typeof config.title === "string" ? config.title : null,
    tags: Array.isArray(config.tags) ? config.tags.filter((t): t is string => typeof t === "string") : [],
    isWeb: declaresWeb || steps.some((step) => step.calls !== null),
    steps,
  };
}

export function readTrail(path: string): Trail {
  return parseTrail(readFileSync(path, "utf8"));
}
