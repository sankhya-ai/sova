import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CASE_KINDS, caseCoverage, loadCases, type CaseRow } from "./cases.js";
import { loadConfig } from "./config.js";
import { loadScreens } from "./coverage.js";
import { emitAll } from "./emit.js";
import { describeKill } from "./mutate.js";
import type { TestStability } from "./playwright.js";

export const GATE_RESULTS = join("sova", ".results", "gate.json");
export const MUTATION_RESULTS = join("sova", ".results", "mutations.json");
export const SUMMARY_PATH = join("sova", "summary", "index.html");

export interface GateResults { at: string; repeat: number; tests: TestStability[] }
export interface MutationRow { id: string; file: string; note?: string; status: "killed" | "survived" | "invalid" | "error"; detail: string }
export interface MutationResults { at: string; results: MutationRow[] }
export interface SummaryInput {
  gate?: GateResults;
  mutations?: MutationResults;
  cases: CaseRow[];
  /** Relative link from the summary page to the Playwright report, when it exists. */
  links: { playwright?: string };
  title?: string;
}

/** A skipped case that names a hand-written spec is covered, but not by a trail: counted on its own. */
export type CaseGroup = "trail" | "hand-written" | "na" | "skipped" | "missing";
export function caseGroup(row: CaseRow): CaseGroup {
  if (row.status === "covered") return "trail";
  if (row.status === "na") return "na";
  if (row.status === "missing") return "missing";
  return /^hand-written/i.test(row.detail) ? "hand-written" : "skipped";
}

export function countCases(rows: CaseRow[]): Record<CaseGroup, number> {
  const out: Record<CaseGroup, number> = { trail: 0, "hand-written": 0, na: 0, skipped: 0, missing: 0 };
  for (const row of rows) out[caseGroup(row)] += 1;
  return out;
}

const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** How a mutation result reads: the test that caught it, and whether the kill is weak evidence. */
export function mutationReading(row: MutationRow): { label: string; weak: boolean } {
  if (row.status === "killed") {
    const label = describeKill(row.detail);
    const broad = /caught by (\d+) tests/.exec(label);
    return { label, weak: label.includes("coarse") || (broad !== null && Number(broad[1]) > 3) };
  }
  if (row.status === "survived") return { label: "no test noticed", weak: false };
  return { label: row.detail, weak: false };
}

const CSS = `
:root{--ok:#1a7f37;--bad:#cf222e;--warn:#9a6700;--mute:#59636e;--line:#d1d9e0;--bg:#f6f8fa}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2328;background:#fff}
main{max-width:1100px;margin:0 auto;padding:24px 20px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:36px 0 10px}
.sub{color:var(--mute);margin:0 0 20px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.card{border:1px solid var(--line);border-radius:8px;padding:14px 16px;background:var(--bg)}.card b{font-size:26px;display:block}
.card span{color:var(--mute);font-size:13px}.links a{display:inline-block;margin:0 14px 0 0;color:#0969da}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{background:var(--bg);font-weight:600}.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;white-space:nowrap}
.ok{background:#dafbe1;color:var(--ok)}.bad{background:#ffebe9;color:var(--bad)}.warn{background:#fff8c5;color:var(--warn)}.mute{background:#eaeef2;color:var(--mute)}
.bar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:#eaeef2;min-width:80px}.bar i{display:block;background:var(--ok)}.bar i.x{background:var(--bad)}
.grid td.c{text-align:center;font-size:12px}.note{color:var(--mute);font-size:13px}code{font-size:13px;background:var(--bg);padding:1px 4px;border-radius:4px;word-break:break-all}
.wrap{overflow-x:auto}.wrap table{min-width:640px}td code{white-space:nowrap;word-break:normal}tr.survivor td{background:#fff5f5}`;

function cards(input: SummaryInput): string {
  const out: string[] = [];
  if (input.gate) {
    const stable = input.gate.tests.filter((t) => t.passed === t.runs).length;
    out.push(`<div class="card"><b>${stable} / ${input.gate.tests.length}</b><span>tests stable (${input.gate.repeat} runs each, no retries)</span></div>`);
  } else out.push(`<div class="card"><b>none</b><span>no gate run yet: <code>sova check</code></span></div>`);
  if (input.mutations) {
    const r = input.mutations.results;
    const killed = r.filter((x) => x.status === "killed").length;
    const weak = r.filter((x) => x.status === "killed" && mutationReading(x).weak).length;
    out.push(`<div class="card"><b>${killed} / ${r.length}</b><span>breaks caught${weak ? `, ${weak} by a weak kill` : ""}; ${r.filter((x) => x.status === "survived").length} survived</span></div>`);
  } else out.push(`<div class="card"><b>none</b><span>no mutation run yet: <code>sova mutate</code></span></div>`);
  const c = countCases(input.cases);
  out.push(`<div class="card"><b>${c.trail + c["hand-written"]} / ${input.cases.length}</b><span>cases covered: ${c.trail} by trails, ${c["hand-written"]} by hand-written specs; ${c.na} n/a, ${c.skipped} skipped, ${c.missing} missing</span></div>`);
  return `<div class="cards">${out.join("")}</div>`;
}

function gateSection(gate?: GateResults): string {
  if (!gate) return "";
  const rows = gate.tests.map((t) => {
    const ok = t.passed === t.runs;
    const pct = t.runs === 0 ? 0 : Math.round((t.passed / t.runs) * 100);
    return `<tr><td>${esc(t.file)}</td><td>${esc(t.title)}</td><td>${t.passed} / ${t.runs}</td><td><div class="bar" title="${pct}%"><i style="width:${pct}%"></i><i class="x" style="width:${100 - pct}%"></i></div></td><td><span class="badge ${ok ? "ok" : "bad"}">${ok ? "stable" : "flaky"}</span></td></tr>`;
  });
  return `<h2>Gate: stability</h2><p class="note">Every test run ${gate.repeat} times in a row, retries off. Run at ${esc(gate.at)}.</p><div class="wrap"><table><tr><th>File</th><th>Test</th><th>Passed</th><th></th><th></th></tr>${rows.join("")}</table></div>`;
}

function mutationSection(m?: MutationResults): string {
  if (!m) return "";
  const rows = m.results.map((r) => {
    const read = mutationReading(r);
    const badge = r.status === "killed" ? (read.weak ? "warn" : "ok") : r.status === "survived" ? "bad" : "mute";
    const word = r.status === "killed" && read.weak ? "killed (weak)" : r.status;
    return `<tr class="${r.status === "survived" ? "survivor" : ""}"><td><code>${esc(r.id)}</code></td><td>${esc(r.note)}</td><td><span class="badge ${badge}">${esc(word)}</span></td><td>${esc(read.label)}</td></tr>`;
  });
  return `<h2>Break-the-app run</h2><p class="note">Each row is one deliberate code break. A survivor is a behaviour no test protects (or a break that missed the code the app really uses). A weak kill is credited to a broad failure or a sign-in-only failure, so it is weak evidence. Run at ${esc(m.at)}.</p><div class="wrap"><table><tr><th>Break</th><th>What it does</th><th>Result</th><th>Caught by</th></tr>${rows.join("")}</table></div>`;
}

const GROUP_BADGE: Record<CaseGroup, [string, string]> = { trail: ["ok", "trail"], "hand-written": ["ok", "hand-written"], na: ["mute", "n/a"], skipped: ["warn", "skipped"], missing: ["bad", "missing"] };

function caseSection(rows: CaseRow[]): string {
  if (rows.length === 0) return `<h2>Case checklist</h2><p class="note">No cases in <code>sova/screens.yaml</code> yet (<code>sova cases init</code>).</p>`;
  const screens = [...new Set(rows.map((r) => r.screen))];
  const body = screens.map((s) => {
    const cells = CASE_KINDS.map((k) => {
      const row = rows.find((r) => r.screen === s && r.kind === k);
      if (!row) return `<td class="c">-</td>`;
      const [cls, word] = GROUP_BADGE[caseGroup(row)];
      return `<td class="c" title="${esc(row.detail)}"><span class="badge ${cls}">${word}</span></td>`;
    });
    return `<tr><td>${esc(s)}</td>${cells.join("")}</tr>`;
  });
  const reasons = rows.filter((r) => ["na", "skipped", "hand-written"].includes(caseGroup(r)))
    .map((r) => `<tr><td>${esc(r.screen)}</td><td>${esc(r.kind)}</td><td>${esc(GROUP_BADGE[caseGroup(r)][1])}</td><td>${esc(r.detail)}</td></tr>`);
  const c = countCases(rows);
  return `<h2>Case checklist</h2><p class="note">${rows.length} required cases: ${c.trail} covered by trails, ${c["hand-written"]} by hand-written specs (not trails), ${c.na} n/a, ${c.skipped} skipped, ${c.missing} missing.</p>
<div class="wrap"><table class="grid"><tr><th>Screen</th>${CASE_KINDS.map((k) => `<th class="c">${k}</th>`).join("")}</tr>${body.join("")}</table></div>
<h2>Reasons</h2><div class="wrap"><table><tr><th>Screen</th><th>Case</th><th>Kind</th><th>Reason or spec</th></tr>${reasons.join("")}</table></div>`;
}

/** The whole page as one self-contained HTML string. */
export function renderSummary(input: SummaryInput): string {
  const links = [
    input.links.playwright ? `<a href="${esc(input.links.playwright)}">Playwright report (traces, screenshots, video of failures)</a>` : "",
  ].filter(Boolean).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(input.title ?? "sova summary")}</title><style>${CSS}</style></head><body><main>
<h1>${esc(input.title ?? "sova summary")}</h1><p class="sub">Gate results, break-the-app results and the case checklist, from the last runs.</p>
${cards(input)}
${links ? `<p class="links" style="margin-top:16px">${links}</p>` : ""}
${gateSection(input.gate)}${mutationSection(input.mutations)}${caseSection(input.cases)}
</main></body></html>
`;
}

function readJson<T>(path: string): T | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined;
}

export function saveResults(root: string, path: string, value: unknown): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(value, null, 2) + "\n");
}

/** Build sova/summary/index.html from the last gate, mutation run and the screens file. */
export function summaryCommand(root: string): number {
  const config = loadConfig(root);
  const screens = loadScreens(root);
  const run = emitAll(root, config, false);
  const cases = caseCoverage(screens, loadCases(root), run);
  const out = join(root, SUMMARY_PATH);
  const link = (rel: string) => (existsSync(join(root, rel)) ? join("..", "..", rel).replace(/\\/g, "/") : undefined);
  const html = renderSummary({
    gate: readJson<GateResults>(join(root, GATE_RESULTS)),
    mutations: readJson<MutationResults>(join(root, MUTATION_RESULTS)),
    cases,
    links: { playwright: link("sova/.results/html/index.html") },
    title: "sova summary",
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`summary  ${SUMMARY_PATH}`);
  return 0;
}
