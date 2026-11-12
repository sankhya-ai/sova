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
