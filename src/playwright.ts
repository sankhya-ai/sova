import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { SovaConfig } from "./config.js";
import { UserError } from "./util.js";

function requirePlaywright(root: string, config: SovaConfig): void {
  if (!existsSync(join(root, "node_modules", "@playwright", "test"))) {
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
  const result = spawnSync(
    "npx",
    ["--no-install", "playwright", "test", "-c", config.playwrightConfig, ...extraArgs],
    { cwd: root, stdio: "inherit" },
  );
  return result.status ?? 1;
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
    "npx",
    [
      "--no-install", "playwright", "test", "-c", config.playwrightConfig,
      `--repeat-each=${repeat}`, "--retries=0", "--reporter=json",
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: jsonPath, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonPath },
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
