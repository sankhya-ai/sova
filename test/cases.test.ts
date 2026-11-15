import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { caseCoverage, initCases, loadCases, summarizeCases, CASE_KINDS } from "../src/cases.js";
import type { EmitRun } from "../src/emit.js";

function run(ids: string[]): EmitRun {
  return { files: ids.map((id) => ({ id, result: { status: "emitted", reason: "" } })) } as unknown as EmitRun;
}

function project(yaml: string): string {
  const root = mkdtempSync(join(tmpdir(), "sova-cases-"));
  mkdirSync(join(root, "sova"));
  writeFileSync(join(root, "sova", "screens.yaml"), yaml);
  return root;
}

test("a screen with no cases lists every case kind as missing", () => {
  const root = project("screens:\n  - id: a\n    trails: [t]\n");
  const rows = caseCoverage([{ id: "a", trails: ["t"] }], loadCases(root), run(["t"]));
  assert.equal(rows.length, CASE_KINDS.length);
  assert.ok(rows.every((r) => r.status === "missing"));
});

test("covered, skipped and n/a cases count; a trail that does not exist is missing", () => {
  const root = project(
    [
      "screens:",
      "  - id: a",
      "    trails: [t]",
      "    cases:",
      "      - {kind: valid, trail: t}",
      "      - {kind: invalid, trail: ghost}",
      "      - {kind: empty, skip: needs seeded empty db}",
      "      - {kind: boundary, na: read-only list}",
      "",
    ].join("\n"),
  );
  const rows = caseCoverage([{ id: "a", trails: ["t"] }], loadCases(root), run(["t"]));
  const sum = summarizeCases(rows);
  assert.deepEqual([sum.covered, sum.skipped, sum.na, sum.missing], [1, 1, 1, 3]);
  assert.match(rows.find((r) => r.kind === "invalid")!.detail, /does not exist/);
});

test("a skipped screen needs no cases", () => {
  const rows = caseCoverage([{ id: "a", trails: [], skip: "charges a card" }], new Map(), run([]));
  assert.equal(rows.length, 0);
});

test("cases init adds the checklist once, keeps comments and skipped screens", () => {
  const root = project("# map\nscreens:\n  - id: a\n    trails: []\n  - id: b\n    trails: []\n    skip: paid\n");
  assert.equal(initCases(root), 1);
  assert.equal(initCases(root), 0);
  const text = readFileSync(join(root, "sova", "screens.yaml"), "utf8");
  assert.match(text, /# map/);
  assert.equal(loadCases(root).get("a")!.length, CASE_KINDS.length);
  assert.equal(loadCases(root).get("b")!.length, 0);
});
