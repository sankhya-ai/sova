import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, parseDocument } from "yaml";
import type { EmitRun } from "./emit.js";
import { SCREENS_PATH, type Screen } from "./coverage.js";

/** The behaviours a screen is checked against. Coverage counts these, not just screens. */
export const CASE_KINDS = ["valid", "invalid", "empty", "boundary", "permission", "server-error"] as const;
export type CaseKind = (typeof CASE_KINDS)[number];

export const CASE_HELP: Record<CaseKind, string> = {
  valid: "the normal path works and the result shows",
  invalid: "bad input is rejected with a message, nothing is saved",
  empty: "no data / no results state",
  boundary: "limits: min/max length, zero, very long text, duplicate",
  permission: "a role that must not see or do this is stopped",
  "server-error": "the backend fails: the user sees an error, not a blank screen",
};

export interface CaseEntry {
  kind: CaseKind;
  /** Trail id that exercises the case. */
  trail?: string;
  /** The case matters but is deliberately not tested, with the reason. */
  skip?: string;
  /** The case cannot happen on this screen, with the reason (for example a read-only list has no invalid input). */
  na?: string;
}

export type CaseStatus = "covered" | "skipped" | "na" | "missing";

export interface CaseRow {
  screen: string;
  kind: CaseKind;
  status: CaseStatus;
  detail: string;
}

/** Read the `cases:` of every screen in screens.yaml. Unknown kinds are ignored. */
export function loadCases(root: string): Map<string, CaseEntry[]> {
  const path = join(root, SCREENS_PATH);
  const result = new Map<string, CaseEntry[]>();
  if (!existsSync(path)) return result;
  const doc = parse(readFileSync(path, "utf8")) as { screens?: unknown } | null;
  const list = Array.isArray(doc?.screens) ? doc.screens : [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    const entries: CaseEntry[] = [];
    if (Array.isArray(record.cases)) {
      for (const raw of record.cases) {
        if (typeof raw !== "object" || raw === null) continue;
        const c = raw as Record<string, unknown>;
        if (!CASE_KINDS.includes(c.kind as CaseKind)) continue;
        entries.push({
          kind: c.kind as CaseKind,
          trail: typeof c.trail === "string" && c.trail !== "" ? c.trail : undefined,
          skip: typeof c.skip === "string" && c.skip.trim() !== "" ? c.skip : undefined,
          na: typeof c.na === "string" && c.na.trim() !== "" ? c.na : undefined,
        });
      }
    }
    result.set(record.id, entries);
  }
  return result;
}

/**
 * Every non-skipped screen needs each case kind to be covered by an emitted trail, skipped
 * with a reason, or marked n/a with a reason. Anything else is missing.
 */
export function caseCoverage(screens: Screen[], cases: Map<string, CaseEntry[]>, run: EmitRun): CaseRow[] {
  const byId = new Map(run.files.map((file) => [file.id, file]));
  const rows: CaseRow[] = [];
  for (const screen of screens) {
    if (screen.skip) continue;
    const entries = cases.get(screen.id) ?? [];
    for (const kind of CASE_KINDS) {
      const entry = entries.find((e) => e.kind === kind);
      if (!entry) {
        rows.push({ screen: screen.id, kind, status: "missing", detail: "not declared" });
      } else if (entry.trail) {
        const file = byId.get(entry.trail);
        if (!file) rows.push({ screen: screen.id, kind, status: "missing", detail: `trail ${entry.trail} does not exist` });
        else if (file.result.status !== "emitted") {
          rows.push({ screen: screen.id, kind, status: "missing", detail: `trail ${entry.trail} is ${file.result.status}` });
        } else rows.push({ screen: screen.id, kind, status: "covered", detail: entry.trail });
      } else if (entry.skip) {
        rows.push({ screen: screen.id, kind, status: "skipped", detail: entry.skip });
      } else if (entry.na) {
        rows.push({ screen: screen.id, kind, status: "na", detail: entry.na });
      } else {
        rows.push({ screen: screen.id, kind, status: "missing", detail: "no trail, skip or na reason" });
      }
    }
  }
  return rows;
}

export function summarizeCases(rows: CaseRow[]): Record<CaseStatus, number> & { total: number } {
  const out = { covered: 0, skipped: 0, na: 0, missing: 0, total: rows.length };
  for (const row of rows) out[row.status] += 1;
  return out;
}

/**
 * Add the full case checklist to every screen that has none yet, so the plan for the whole app
 * exists in one place. Existing entries are kept. Returns how many screens changed.
 */
export function initCases(root: string): number {
  const path = join(root, SCREENS_PATH);
  const doc = parseDocument(readFileSync(path, "utf8"));
  const screens = doc.get("screens", true) as { items?: unknown[] } | undefined;
  let changed = 0;
  for (const node of screens?.items ?? []) {
    const map = node as { get: (k: string) => unknown; has: (k: string) => boolean; set: (k: string, v: unknown) => void };
    if (typeof map.has !== "function" || map.has("cases") || map.has("skip")) continue;
    map.set(
      "cases",
      CASE_KINDS.map((kind) => ({ kind, trail: "" })),
    );
    changed += 1;
  }
  if (changed > 0) writeFileSync(path, doc.toString());
  return changed;
}
