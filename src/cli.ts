#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { loadConfig } from "./config.js";
import { loadScreens, screenCoverage, unclaimedTrails } from "./coverage.js";
import { ACTIONS, act, discard, heal, login, look, open, reset, save } from "./drive.js";
import { emitAll } from "./emit.js";
import { doctor, init, installSkill, SKILL_SOURCE } from "./init.js";
import { lintFile, type Finding } from "./lint.js";
import { report, measureStability, runTests } from "./playwright.js";
import { UserError, walk } from "./util.js";

const HELP = `sova: explored trails in, gated Playwright tests out.

Usage: sova <command> [options]

  init [--base-url <url>] [--start <command>] [--no-install]
                    One-step setup: detects how the app starts, installs
                    Playwright, Chromium and Trailblaze if missing, and
                    registers the skill for Claude Code, Codex, Cursor and
                    other agents. Safe to re-run.
  doctor            Check that everything sova needs is installed.
  open [<url or path>] [-s "<step>"]
                    Open a page in the driven browser (default: the app's root).
  look              Print what is on screen, with a ref for each element.
  act <action> [key=value ...] -s "<step>"
                    Do or assert one thing. Run "sova actions" for the list.
  save <id>         Save what you just did as trails/<id>, close the browser
                    session, and generate the Playwright spec.
  discard           Abandon the flow in progress and close the browser session.
  reset             Start over with a clean, signed-out browser.
  login             Sign the driven browser in with the configured sign-in flow,
                    so the flows you drive next start signed in.
  heal <id>         Replay a trail and repair steps the app has drifted from,
                    then regenerate its spec.
  emit [--check]    Turn every web trail into a Playwright spec. With --check,
                    write nothing and fail if any spec is out of date.
  lint              Check the generated specs against Playwright practices.
  check [--repeat <n>]
                    The gate: emit is current, lint has no errors, and every
                    test passes <n> runs in a row (default 5) with no retries.
  coverage          Compare sova/screens.yaml with the trails that exist.
  run [-- <playwright args>]
                    Run the generated suite.
  report [--open]   Build the report for the last run (Allure when installed,
                    with steps, screenshots, videos and traces of failures).
  skill show|install
                    Print the agent skill, or (re)install it into this project.
`;

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new UserError(`${name} needs a value`);
  return value;
}

function printFindings(root: string, path: string, findings: Finding[]): void {
  for (const finding of findings) {
    console.log(`  ${relative(root, path)}:${finding.line}  ${finding.severity}  ${finding.rule}: ${finding.message}`);
  }
}

/** Emit (or verify) specs and print one line per trail. Returns true when nothing is blocked or stale. */
function emitCommand(root: string, checkOnly: boolean): boolean {
  const config = loadConfig(root);
  const run = emitAll(root, config, !checkOnly);
  let ok = true;
  for (const file of run.files) {
    const trail = relative(root, file.trailPath);
    if (file.result.status === "skipped") continue;
    if (file.result.status === "blocked") {
      ok = false;
      console.log(`blocked  ${trail}\n         ${file.result.reason}`);
      continue;
    }
    if (checkOnly && !file.upToDate) {
      ok = false;
      console.log(`stale    ${relative(root, file.specPath)} (run \`sova emit\`)`);
    } else {
      const state = checkOnly || file.upToDate ? "current" : "wrote  ";
      console.log(`${state}  ${relative(root, file.specPath)}  (${file.result.assertions} assertions)`);
    }
    for (const warning of file.result.warnings) console.log(`         note: ${warning}`);
  }
  for (const orphan of run.orphans) {
    ok = false;
    console.log(`orphan   ${relative(root, orphan)} (its trail is gone or no longer emits; delete it)`);
  }
  const emitted = run.files.filter((file) => file.result.status === "emitted").length;
  const blocked = run.files.filter((file) => file.result.status === "blocked").length;
  const skipped = run.files.filter((file) => file.result.status === "skipped").length;
  console.log(`\n${emitted} emitted, ${blocked} blocked, ${skipped} skipped (not web)`);
  return ok;
}

/** Lint every spec in the specs directory. Returns the number of errors. */
function lintCommand(root: string): number {
  const config = loadConfig(root);
  const specs = walk(join(root, config.specsDir), (path) => path.endsWith(".spec.ts"));
  let errors = 0;
  let warnings = 0;
  for (const spec of specs) {
    const findings = lintFile(spec);
    printFindings(root, spec, findings);
    errors += findings.filter((finding) => finding.severity === "error").length;
    warnings += findings.filter((finding) => finding.severity === "warning").length;
  }
  console.log(`${specs.length} specs, ${errors} errors, ${warnings} warnings`);
  return errors;
}

function checkCommand(root: string, repeat: number): boolean {
  console.log("1/3 specs match their trails");
  if (!emitCommand(root, true)) return false;

  console.log("\n2/3 Playwright practices");
  if (lintCommand(root) > 0) return false;

  console.log(`\n3/3 stability: ${repeat} runs each, no retries`);
  const report = measureStability(root, loadConfig(root), repeat);
  if (report.failure) {
    console.log(`Playwright could not run the suite:\n${report.failure}`);
    return false;
  }
  let stable = true;
  for (const test of report.tests) {
    const passed = test.passed === test.runs;
    if (!passed) stable = false;
    console.log(`  ${passed ? "stable" : "FLAKY "}  ${test.passed}/${test.runs}  ${test.file} > ${test.title}`);
  }
  console.log(stable ? "\nGate passed." : "\nGate failed: fix or re-record the tests marked FLAKY.");
  return stable;
}

function coverageCommand(root: string): boolean {
  const config = loadConfig(root);
  const screens = loadScreens(root);
  const run = emitAll(root, config, false);
  const rows = screenCoverage(screens, run);
  for (const row of rows) {
    const route = row.screen.route ? `  ${row.screen.route}` : "";
    const note = row.status === "skipped" ? `  (${row.screen.skip})` : "";
    console.log(`${row.status.padEnd(9)} ${row.screen.id}${route}${note}`);
    if (row.status === "uncovered") for (const problem of row.problems) console.log(`          ${problem}`);
  }
  const unclaimed = unclaimedTrails(screens, run);
  if (unclaimed.length > 0) console.log(`\nTrails no screen lists: ${unclaimed.join(", ")}`);
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  console.log(`\n${count("covered")} covered, ${count("uncovered")} uncovered, ${count("skipped")} skipped of ${rows.length} screens`);
  if (rows.length === 0) console.log("sova/screens.yaml lists no screens yet.");
  return rows.length > 0 && count("uncovered") === 0;
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  const root = process.cwd();

  switch (command) {
    case "init": {
      const log = init(root, {
        baseURL: flag(args, "--base-url"),
        startCommand: flag(args, "--start"),
        install: !args.includes("--no-install"),
      });
      console.log("");
      for (const line of log) console.log(line);
      console.log("\nNext: ask your coding agent to \"use the sova skill to test this app\".");
      return log.some((line) => line.startsWith("FAILED") || line.startsWith("MISSING")) ? 1 : 0;
    }
    case "doctor": {
      const checks = await doctor(root);
      for (const check of checks) {
        console.log(`${check.ok ? "ok     " : "MISSING"}  ${check.name}`);
        if (!check.ok && check.fix) console.log(`         fix: ${check.fix}`);
      }
      return checks.every((check) => check.ok) ? 0 : 1;
    }
    case "open":
      return open(root, loadConfig(root), args);
    case "look":
      return look(root, loadConfig(root));
    case "act":
      return act(root, loadConfig(root), args);
    case "actions": {
      for (const [name, action] of Object.entries(ACTIONS)) console.log(`  ${name.padEnd(7)} ${action.use}`);
      console.log('\nEvery action needs -s "<what this step is for>". Refs come from `sova look`.');
      console.log("`sova act <action> --help` prints every argument an action takes.");
      return 0;
    }
    case "save": {
      const id = args[0];
      if (!id) throw new UserError("Usage: sova save <id>   (for example: sova save login-invalid)");
      const saved = save(root, loadConfig(root), id);
      if (saved.code !== 0) return saved.code;
      if (saved.changed.length === 0) {
        console.log(`\nNothing new appeared under ${loadConfig(root).trailsDir}/. Check the output above for where the trail went.`);
        return 1;
      }
      for (const file of saved.changed) console.log(`saved    ${relative(root, file)}`);
      return emitCommand(root, false) ? 0 : 1;
    }
    case "discard":
      return discard(root, loadConfig(root));
    case "reset":
      return reset(root, loadConfig(root));
    case "login":
      return login(root, loadConfig(root));
    case "heal": {
      const id = args[0];
      if (!id) throw new UserError("Usage: sova heal <id>");
      const code = heal(root, loadConfig(root), id);
      if (code !== 0) return code;
      return emitCommand(root, false) ? 0 : 1;
    }
    case "emit":
      return emitCommand(root, args.includes("--check")) ? 0 : 1;
    case "lint":
      return lintCommand(root) === 0 ? 0 : 1;
    case "check": {
      const repeat = Number(flag(args, "--repeat") ?? "5");
      if (!Number.isInteger(repeat) || repeat < 1) throw new UserError("--repeat must be a positive whole number");
      return checkCommand(root, repeat) ? 0 : 1;
    }
    case "coverage":
      return coverageCommand(root) ? 0 : 1;
    case "run": {
      const separator = args.indexOf("--");
      return runTests(root, loadConfig(root), separator === -1 ? args : args.slice(separator + 1));
    }
    case "report":
      return report(root, loadConfig(root), args.includes("--open"));
    case "skill": {
      if (args[0] === "show") {
        process.stdout.write(readFileSync(join(SKILL_SOURCE, "SKILL.md"), "utf8"));
        return 0;
      }
      if (args[0] === "install") {
        for (const line of installSkill(root)) console.log(line);
        return 0;
      }
      throw new UserError("Usage: sova skill show|install");
    }
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return 0;
    default:
      throw new UserError(`Unknown command "${command}".\n\n${HELP}`);
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof UserError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  },
);
