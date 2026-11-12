import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { EmitRun } from "./emit.js";
import { UserError } from "./util.js";

export const SCREENS_PATH = join("sova", "screens.yaml");

export interface Screen {
  id: string;
  route?: string;
  /** Trail ids (paths under the trails directory, without `/trail.yaml`) that exercise it. */
  trails: string[];
  /** A reason this screen is deliberately untested. */
  skip?: string;
}

export interface ScreenCoverage {
  screen: Screen;
  status: "covered" | "skipped" | "uncovered";
  /** What is missing, per listed trail, when uncovered. */
  problems: string[];
}

export function loadScreens(root: string): Screen[] {
  const path = join(root, SCREENS_PATH);
  if (!existsSync(path)) throw new UserError(`No ${SCREENS_PATH}. Run \`sova init\`, then map the app's screens into it.`);
  const doc = parse(readFileSync(path, "utf8")) as { screens?: unknown } | null;
  const list = Array.isArray(doc?.screens) ? doc.screens : [];
  return list
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .filter((item) => typeof item.id === "string")
    .map((item) => ({
      id: item.id as string,
      route: typeof item.route === "string" ? item.route : undefined,
      trails: Array.isArray(item.trails) ? item.trails.filter((t): t is string => typeof t === "string") : [],
      skip: typeof item.skip === "string" && item.skip.trim() !== "" ? item.skip : undefined,
    }));
}

/** A screen is covered when at least one of its trails exists and emits a spec. */
export function screenCoverage(screens: Screen[], run: EmitRun): ScreenCoverage[] {
  const byId = new Map(run.files.map((file) => [file.id, file]));
  return screens.map((screen) => {
    if (screen.skip) return { screen, status: "skipped", problems: [] };
    const problems: string[] = [];
    let covered = false;
    for (const id of screen.trails) {
      const file = byId.get(id);
      if (!file) problems.push(`trail ${id} does not exist`);
      else if (file.result.status !== "emitted") problems.push(`trail ${id} is ${file.result.status}: ${file.result.reason}`);
      else covered = true;
    }
    if (screen.trails.length === 0) problems.push("no trail listed");
    return { screen, status: covered ? "covered" : "uncovered", problems };
  });
}

/** Trails that no screen claims. Usually a screen missing from the inventory. */
export function unclaimedTrails(screens: Screen[], run: EmitRun): string[] {
  const claimed = new Set(screens.flatMap((screen) => screen.trails));
  return run.files.filter((file) => file.result.status !== "skipped" && !claimed.has(file.id)).map((file) => file.id);
}
