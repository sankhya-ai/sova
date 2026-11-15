import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyMutation, loadMutations } from "../src/mutate.js";

test("applyMutation replaces only the first occurrence and reports a miss as null", () => {
  assert.equal(applyMutation("a b a", { find: "a", replace: "X" }), "X b a");
  assert.equal(applyMutation("abc", { find: "zzz", replace: "X" }), null);
  assert.equal(applyMutation("abc", { find: "", replace: "X" }), null);
});

test("mutations load, and one missing a field is a clear error", () => {
  const root = mkdtempSync(join(tmpdir(), "sova-mut-"));
  mkdirSync(join(root, "sova"));
  writeFileSync(join(root, "sova", "mutations.yaml"), "mutations:\n  - {id: m1, file: src/a.ts, find: 'x', replace: 'y', note: n}\n");
  assert.deepEqual(loadMutations(root), [{ id: "m1", file: "src/a.ts", find: "x", replace: "y", note: "n" }]);
  writeFileSync(join(root, "sova", "mutations.yaml"), "mutations:\n  - {id: m2, file: src/a.ts}\n");
  assert.throws(() => loadMutations(root), /needs id, file, find and replace/);
});
