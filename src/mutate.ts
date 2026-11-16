import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { SovaConfig } from "./config.js";
import { runOnce } from "./playwright.js";
import { UserError } from "./util.js";

export const MUTATIONS_PATH = join("sova", "mutations.yaml");

export interface Mutation {
  id: string;
  /** Source file, relative to the project root. */
  file: string;
  /** Exact text to replace. Its first occurrence is replaced. */
  find: string;
  replace: string;
  /** The behaviour this breaks, in a sentence. A test should notice. */
  note?: string;
}

export type MutationStatus = "killed" | "survived" | "invalid" | "error";

export interface MutationResult {
  mutation: Mutation;
  status: MutationStatus;
  detail: string;
}

export function loadMutations(root: string): Mutation[] {
  const path = join(root, MUTATIONS_PATH);
  if (!existsSync(path)) throw new UserError(`No ${MUTATIONS_PATH}. List deliberate bugs there; see \`sova skill show\`.`);
  const doc = parse(readFileSync(path, "utf8")) as { mutations?: unknown } | null;
  const list = Array.isArray(doc?.mutations) ? doc.mutations : [];
  const out: Mutation[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const m = item as Record<string, unknown>;
    if (typeof m.id !== "string" || typeof m.file !== "string" || typeof m.find !== "string" || typeof m.replace !== "string") {
      throw new UserError(`Each mutation needs id, file, find and replace. Problem near ${JSON.stringify(m.id ?? m)}.`);
    }
    out.push({ id: m.id, file: m.file, find: m.find, replace: m.replace, note: typeof m.note === "string" ? m.note : undefined });
  }
  return out;
}

/** The file's text with the first `find` replaced, or null when `find` is not there. */
export function applyMutation(source: string, mutation: Pick<Mutation, "find" | "replace">): string | null {
  const index = source.indexOf(mutation.find);
  if (index === -1 || mutation.find === "") return null;
  return source.slice(0, index) + mutation.replace + source.slice(index + mutation.find.length);
}

function rebuild(root: string, config: SovaConfig): string | null {
  if (!config.mutationRebuild) return null;
  const result = spawnSync(config.mutationRebuild, { cwd: root, shell: true, encoding: "utf8" });
  return result.status === 0 ? null : `rebuild failed: ${`${result.stderr}${result.stdout}`.trim().split("\n").slice(-4).join(" | ")}`;
}

/** Put the app's data back to its seed state, when the project says how. */
export function resetApp(root: string, config: SovaConfig): string | null {
  if (!config.mutationReset) return null;
  const result = spawnSync(config.mutationReset, { cwd: root, shell: true, encoding: "utf8" });
  return result.status === 0 ? null : `reset failed: ${`${result.stderr}${result.stdout}`.trim().split("\n").slice(-4).join(" | ")}`;
}

/** Say who caught a mutation: the test's name if one did, the count if several did. */
export function describeKill(detail: string): string {
  const names = detail.replace(/ \[.*\]$/, "").split("; ").filter(Boolean);
  const coarse = detail.includes("coarse") ? ", coarse" : "";
  return names.length <= 1 ? `caught by ${names[0] ?? "?"}${coarse}` : `caught by ${names.length} tests, first: ${names[0]}${coarse}`;
}

/**
 * Break the app on purpose, one change at a time, and see whether the suite notices. The
 * suite must pass unchanged first. A mutation that no test fails on has survived: the tests
 * do not protect that behaviour. Source files are always put back.
 */
export function mutate(root: string, config: SovaConfig, mutations: Mutation[], log: (line: string) => void): MutationResult[] {
  const buildError = rebuild(root, config);
  if (buildError) throw new UserError(buildError);
  const baselineReset = resetApp(root, config);
  if (baselineReset) throw new UserError(baselineReset);
  const baseline = runOnce(root, config);
  if (!baseline.passed) {
    throw new UserError(`The suite must pass before it is mutated. Failing: ${baseline.failed.join("; ") || baseline.failure}`);
  }
  const results: MutationResult[] = [];
  for (const mutation of mutations) {
    const path = join(root, mutation.file);
    if (!existsSync(path)) {
      results.push({ mutation, status: "invalid", detail: `${mutation.file} does not exist` });
      continue;
    }
    const original = readFileSync(path, "utf8");
    const mutated = applyMutation(original, mutation);
    if (mutated === null) {
      results.push({ mutation, status: "invalid", detail: "the text to replace was not found" });
      continue;
    }
    const restore = () => writeFileSync(path, original);
    const onSignal = () => {
      restore();
      process.exit(130);
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    try {
      writeFileSync(path, mutated);
      const error = rebuild(root, config);
      if (error) {
        results.push({ mutation, status: "error", detail: error });
        continue;
      }
      const resetError = resetApp(root, config);
      if (resetError) {
        results.push({ mutation, status: "error", detail: resetError });
        continue;
      }
      const outcome = runOnce(root, config);
      if (outcome.failure) results.push({ mutation, status: "error", detail: outcome.failure });
      else if (outcome.failed.length > 0) {
        // When the sign-in flow breaks, every test that depends on it is skipped, so that kill says little about the mutated behaviour.
        const onlySetup = outcome.failed.every((name) => /\.setup\.ts/.test(name));
        results.push({ mutation, status: "killed", detail: outcome.failed.join("; ") + (onlySetup ? " [only the sign-in flow ran; the other tests were skipped, so this kill is coarse]" : "") });
      }
      else results.push({ mutation, status: "survived", detail: "every test still passed" });
    } finally {
      restore();
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
    }
    const last = results[results.length - 1]!;
    log(`${last.status.padEnd(8)} ${mutation.id}${last.status === "killed" ? `  (${describeKill(last.detail)})` : ""}`);
  }
  const restored = rebuild(root, config);
  if (restored) log(`warning: ${restored}`);
  return results;
}
