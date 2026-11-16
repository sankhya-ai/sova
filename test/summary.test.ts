import assert from "node:assert/strict";
import { test } from "node:test";
import type { CaseRow } from "../src/cases.js";
import { caseGroup, countCases, mutationReading, renderSummary } from "../src/summary.js";

const rows: CaseRow[] = [
  { screen: "login", kind: "valid", status: "covered", detail: "sign-in" },
  { screen: "login", kind: "empty", status: "skipped", detail: "hand-written spec, not a trail: server-rules.spec.ts > Login with empty fields" },
  { screen: "login", kind: "server-error", status: "skipped", detail: "cannot be made to fail" },
  { screen: "login", kind: "permission", status: "na", detail: "open to everyone" },
  { screen: "login", kind: "boundary", status: "missing", detail: "not declared" },
];

test("hand-written specs are counted apart from trails and from plain skips", () => {
  assert.deepEqual(rows.map(caseGroup), ["trail", "hand-written", "skipped", "na", "missing"]);
  assert.deepEqual(countCases(rows), { trail: 1, "hand-written": 1, na: 1, skipped: 1, missing: 1 });
});

test("a kill by many tests, or by the sign-in flow alone, is weak evidence", () => {
  assert.equal(mutationReading({ id: "a", file: "f", status: "killed", detail: "t.spec.ts > T" }).weak, false);
  assert.equal(mutationReading({ id: "a", file: "f", status: "killed", detail: "a > A; b > B; c > C; d > D" }).weak, true);
  assert.equal(mutationReading({ id: "a", file: "f", status: "killed", detail: "s.setup.ts > Sign in [only the sign-in flow ran; so this kill is coarse]" }).weak, true);
  assert.equal(mutationReading({ id: "a", file: "f", status: "survived", detail: "" }).label, "no test noticed");
});

test("the page shows all three sections, escapes text and links the Playwright report", () => {
  const html = renderSummary({
    gate: { at: "now", repeat: 5, tests: [{ file: "a.spec.ts", title: "A <b>", passed: 5, runs: 5 }, { file: "b.spec.ts", title: "B", passed: 3, runs: 5 }] },
    mutations: { at: "now", results: [{ id: "m1", file: "f", note: "n", status: "killed", detail: "a.spec.ts > A" }, { id: "m2", file: "f", status: "survived", detail: "every test still passed" }] },
    cases: rows,
    links: { playwright: "../.results/html/index.html" },
  });
  assert.match(html, /1 \/ 2<\/b><span>tests stable/);
  assert.match(html, /1 \/ 2<\/b><span>breaks caught/);
  assert.match(html, /2 \/ 5<\/b><span>cases covered: 1 by trails, 1 by hand-written/);
  assert.match(html, /A &lt;b&gt;/);
  assert.match(html, /href="..\/.results\/html\/index.html"/);
  assert.match(html, /class="survivor"/);
  assert.match(html, /flaky/);
});

test("with no runs yet the page says what to run", () => {
  const html = renderSummary({ cases: [], links: {} });
  assert.match(html, /sova check/);
  assert.match(html, /sova mutate/);
  assert.match(html, /sova cases init/);
});
