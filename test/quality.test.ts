import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { confirmTrailFile, gradeTrail, parseSource } from "../src/quality.js";
import { parseTrail } from "../src/trail.js";

function trail(steps: string): ReturnType<typeof parseTrail> {
  return parseTrail(`config:\n  devices:\n    web:\n      driver: PLAYWRIGHT_NATIVE\ntrail:\n${steps}`);
}

const nav = `  - step: "Open /orders"
    recording:
      web:
        - web_navigate:
            url: http://x/orders
`;
const headingSee = `  - step: "The Orders heading is shown"
    recording:
      web:
        - web_verifyElementVisible:
            ref: "heading \\"Orders\\""
`;
const click = `  - step: "Press Save"
    recording:
      web:
        - web_click:
            ref: "button \\"Save\\""
`;
const statusSee = (tag: string) => `  - step: "The saved message shows ${tag}"
    recording:
      web:
        - web_verifyElementVisible:
            ref: "status \\"Saved\\""
`;

test("source tags parse; no tag is untagged", () => {
  assert.deepEqual(parseSource("Total is 12 [spec: SHOP-4]"), { source: "spec", ref: "SHOP-4" });
  assert.deepEqual(parseSource("Total is 12 [code]"), { source: "code", ref: undefined });
  assert.deepEqual(parseSource("Total is 12"), { source: "untagged" });
});

test("navigate then see a heading is a smoke test", () => {
  const q = gradeTrail(trail(nav + headingSee));
  assert.equal(q.grade, "smoke");
  assert.equal(q.assertions[0]!.strength, "weak");
});

test("an assertion after an action is behavioural", () => {
  const q = gradeTrail(trail(nav + click + statusSee("[code]")));
  assert.equal(q.grade, "behavioural");
  assert.equal(q.assertions[0]!.source, "code");
  assert.equal(q.assertions[0]!.afterAction, true);
});

test("a trail with no assertion is graded none", () => {
  assert.equal(gradeTrail(trail(nav + click)).grade, "none");
});

test("confirm turns [code] into spec and counts the changes", () => {
  const dir = mkdtempSync(join(tmpdir(), "sova-q-"));
  const path = join(dir, "trail.yaml");
  writeFileSync(path, `x: "a [code]"\ny: "b [code]"\nz: "c [spec: T-1]"\n`);
  assert.equal(confirmTrailFile(path, "Ana"), 2);
  assert.equal(readFileSync(path, "utf8"), `x: "a [spec: confirmed by Ana]"\ny: "b [spec: confirmed by Ana]"\nz: "c [spec: T-1]"\n`);
  assert.equal(confirmTrailFile(path, "Ana"), 0);
});
