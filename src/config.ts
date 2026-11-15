import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { UserError } from "./util.js";

export interface SovaConfig {
  /** Origin (and optional path) the app is served at. Emitted specs navigate relative to it. */
  baseURL: string;
  /** Command that starts the app for a test run. Empty when the app is already running. */
  startCommand: string;
  /** Where Trailblaze saves trails. */
  trailsDir: string;
  /** Where sova writes generated Playwright specs. */
  specsDir: string;
  /** The Playwright config `sova run` and `sova check` use. */
  playwrightConfig: string;
  /** The browser device the driving commands (`open`, `look`, `act`) control. */
  device: string;
  /**
   * Signing in once for the whole suite. `trail` is the flow that signs in; it runs first and
   * every other test starts from the session it leaves. Trails listed in `anonymous` start
   * signed out instead (the sign-in page's own tests).
   */
  login?: { trail: string; anonymous?: string[] };
  /** How many tests run at once. Leave unset for Playwright's default. */
  workers?: number;
  /** How long an assertion waits, in milliseconds. Playwright's default is 5000. */
  expectTimeout?: number;
  /** When true, `sova coverage` fails while a required case has no trail, skip or n/a reason. */
  requireCases?: boolean;
}

/** Where secrets for flows live. Never committed; `sova init` git-ignores it. */
export const ENV_PATH = join("sova", ".env");

/** `KEY=value` lines of `sova/.env`, under the real environment (which wins). */
export function loadEnv(root: string): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  const path = join(root, ENV_PATH);
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (match) values[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return { ...values, ...process.env };
}

export const CONFIG_PATH = join("sova", "config.json");

export const DEFAULTS: SovaConfig = {
  baseURL: "http://localhost:3000",
  startCommand: "",
  trailsDir: "trails",
  specsDir: join("sova", "tests"),
  playwrightConfig: join("sova", "playwright.config.mts"),
  device: "web/playwright-native",
};

export function loadConfig(root: string): SovaConfig {
  const path = join(root, CONFIG_PATH);
  if (!existsSync(path)) {
    throw new UserError(`No ${CONFIG_PATH} in ${root}. Run \`sova init\` first.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new UserError(`${CONFIG_PATH} is not valid JSON: ${(error as Error).message}`);
  }
  return { ...DEFAULTS, ...(parsed as Partial<SovaConfig>) };
}
