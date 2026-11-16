import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { SovaConfig } from "./config.js";
import { UserError } from "./util.js";

/** Playwright's CLI entry point. Run with this Node, so no `npx` launcher is involved. */
export function playwrightCli(root: string): string {
  return join(root, "node_modules", "@playwright", "test", "cli.js");
}

export function requirePlaywright(root: string, config: SovaConfig): void {
  if (!existsSync(playwrightCli(root))) {
    throw new UserError(
      "@playwright/test is not installed here. Run `npm i -D @playwright/test && npx playwright install chromium`.",
    );
  }
  if (!existsSync(join(root, config.playwrightConfig))) {
    throw new UserError(`${config.playwrightConfig} is missing. Run \`sova init\` to restore it.`);
  }
}

/** Run the generated suite with Playwright's own output. Returns Playwright's exit code. */
export function runTests(root: string, config: SovaConfig, extraArgs: string[]): number {
  requirePlaywright(root, config);
  // A report covers one run, so the previous run's results go first.
  rmSync(join(root, ALLURE_RESULTS), { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    [playwrightCli(root), "test", "-c", config.playwrightConfig, ...extraArgs],
    { cwd: root, stdio: "inherit" },
  );
  return result.status ?? 1;
}

const ALLURE_RESULTS = join("sova", ".results", "allure-results");
const REPORT_DIR = join("sova", "report");
const HTML_REPORT = join("sova", ".results", "html");

/**
 * Build the report for the last `sova run`: Allure when it is installed, otherwise
 * Playwright's own HTML report. Returns the process exit code.
 */
export function report(root: string, config: SovaConfig, open: boolean): number {
  const allurePackage = join(root, "node_modules", "allure", "package.json");
  if (existsSync(allurePackage) && existsSync(join(root, "node_modules", "allure-playwright"))) {
    if (!existsSync(join(root, ALLURE_RESULTS))) {
      throw new UserError("There are no results yet. Run `sova run` first, then `sova report`.");
    }
    const pkg = JSON.parse(readFileSync(allurePackage, "utf8")) as { bin?: string | Record<string, string> };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.allure;
    if (!bin) throw new UserError("The installed allure package has no command. Reinstall it: npm i -D allure");
    const args = [join(root, "node_modules", "allure", bin), "generate", ALLURE_RESULTS, "--output", REPORT_DIR, "--clean", "--name", "sova end-to-end tests"];
    if (open) args.push("--open");
    const code = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" }).status ?? 1;
    if (code === 0) console.log(`\nreport   ${join(REPORT_DIR, "index.html")}${open ? "" : "   (open it with `sova report --open`)"}`);
    return code;
  }
  if (!existsSync(join(root, HTML_REPORT, "index.html"))) {
    throw new UserError("There are no results yet. Run `sova run` first, then `sova report`.");
  }
  console.log(`report   ${join(HTML_REPORT, "index.html")}  (Playwright's report; for Allure: npm i -D allure-playwright allure)`);
  if (!open) return 0;
  requirePlaywright(root, config);
  return spawnSync(process.execPath, [playwrightCli(root), "show-report", HTML_REPORT], { cwd: root, stdio: "inherit" }).status ?? 1;
}

export interface TestStability {
  file: string;
  title: string;
  runs: number;
  passed: number;
}

export interface StabilityReport {
  tests: TestStability[];
  /** Set when Playwright failed before producing results (bad config, server did not start). */
  failure?: string;
}

interface JsonSuite {
  file?: string;
  suites?: JsonSuite[];
  specs?: { title: string; file?: string; tests?: { results?: { status?: string }[] }[] }[];
}

function collect(suite: JsonSuite, into: Map<string, TestStability>): void {
  for (const spec of suite.specs ?? []) {
    const file = spec.file ?? suite.file ?? "";
    const key = `${file}\u0000${spec.title}`;
    const entry = into.get(key) ?? { file, title: spec.title, runs: 0, passed: 0 };
    for (const test of spec.tests ?? []) {
      for (const result of test.results ?? []) {
        entry.runs += 1;
        if (result.status === "passed") entry.passed += 1;
      }
    }
    into.set(key, entry);
  }
  for (const child of suite.suites ?? []) collect(child, into);
}

/**
 * Run every test `repeat` times with retries off and report how often each passed. A test
 * that fails even once is flaky or wrong; either way it should not reach CI.
 */
export function measureStability(root: string, config: SovaConfig, repeat: number): StabilityReport {
  requirePlaywright(root, config);
  const outDir = join(root, "sova", ".results");
  const jsonPath = join(outDir, "check.json");
  mkdirSync(outDir, { recursive: true });
  rmSync(jsonPath, { force: true });

  const result = spawnSync(
    process.execPath,
    [
      playwrightCli(root), "test", "-c", config.playwrightConfig,
      `--repeat-each=${repeat}`, "--retries=0", "--reporter=json,html",
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      // The HTML report of the gate run keeps traces, screenshots and video of every failure.
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: jsonPath, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonPath, PLAYWRIGHT_HTML_OUTPUT_DIR: join(root, HTML_REPORT), PLAYWRIGHT_HTML_OPEN: "never" },
    },
  );

  if (!existsSync(jsonPath)) {
    const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim().split("\n").slice(-15).join("\n");
    return { tests: [], failure: detail || "Playwright produced no report" };
  }
  const report = JSON.parse(readFileSync(jsonPath, "utf8")) as { suites?: JsonSuite[]; errors?: { message?: string }[] };
  const tests = new Map<string, TestStability>();
  for (const suite of report.suites ?? []) collect(suite, tests);
  const errors = (report.errors ?? []).map((error) => error.message ?? "").filter(Boolean);
  return {
    tests: [...tests.values()],
    failure: tests.size === 0 ? errors.join("\n") || "Playwright found no tests to run" : undefined,
  };
}

export interface RunOutcome {
  passed: boolean;
  /** Titles of the tests that failed, as `file > title`. */
  failed: string[];
  /** Set when Playwright could not run at all. */
  failure?: string;
}

function collectFailures(suite: JsonSuite, into: string[]): void {
  for (const spec of suite.specs ?? []) {
    const bad = (spec.tests ?? []).some((test) => (test.results ?? []).some((r) => r.status && r.status !== "passed" && r.status !== "skipped"));
    if (bad) into.push(`${spec.file ?? suite.file ?? ""} > ${spec.title}`);
  }
  for (const child of suite.suites ?? []) collectFailures(child, into);
}

/** Run the whole suite once, retries off, and say which tests failed. */
export function runOnce(root: string, config: SovaConfig, maxFailures?: number): RunOutcome {
  requirePlaywright(root, config);
  const jsonPath = join(root, "sova", ".results", "once.json");
  mkdirSync(join(root, "sova", ".results"), { recursive: true });
  rmSync(jsonPath, { force: true });
  const args = [playwrightCli(root), "test", "-c", config.playwrightConfig, "--retries=0", "--reporter=json"];
  if (maxFailures) args.push(`--max-failures=${maxFailures}`);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: jsonPath, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonPath },
  });
  if (!existsSync(jsonPath)) {
    const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim().split("\n").slice(-10).join("\n");
    return { passed: false, failed: [], failure: detail || "Playwright produced no report" };
  }
  const report = JSON.parse(readFileSync(jsonPath, "utf8")) as { suites?: JsonSuite[] };
  const failed: string[] = [];
  for (const suite of report.suites ?? []) collectFailures(suite, failed);
  return { passed: (result.status ?? 1) === 0 && failed.length === 0, failed };
}
