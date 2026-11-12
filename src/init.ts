import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_PATH, DEFAULTS, type SovaConfig } from "./config.js";
import { SCREENS_PATH } from "./coverage.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SKILL_SOURCE = join(PACKAGE_ROOT, "skill");
const CONFIG_TEMPLATE = join(PACKAGE_ROOT, "templates", "playwright.config.mts");

/** Where coding agents look for skills: Claude Code, then the shared location the others read. */
export const SKILL_TARGETS = [join(".claude", "skills", "sova"), join(".agents", "skills", "sova")];

const SCREENS_TEMPLATE = `# The app's screens, mapped from its routes and components.
# \`sova coverage\` fails while a screen has no working trail and no \`skip:\` reason.
#
# screens:
#   - id: login
#     route: /login
#     source: src/pages/Login.tsx
#     trails: [login, login-invalid]     # ids under trails/, i.e. trails/login/trail.yaml
#   - id: billing
#     route: /settings/billing
#     source: src/pages/Billing.tsx
#     trails: []
#     skip: charges a real card; needs a sandbox account
screens: []
`;

const GITIGNORE_LINES = ["sova/.results/"];

export interface InitOptions {
  baseURL?: string;
  startCommand?: string;
  /** Install missing dependencies (Playwright, a browser, Trailblaze). Default true. */
  install?: boolean;
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPackage(root: string): PackageJson | null {
  const path = join(root, "package.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

export function detectPackageManager(root: string): PackageManager {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return "bun";
  return "npm";
}

/** Default dev-server port per framework, checked in order. */
const FRAMEWORK_PORTS: [dependency: string, port: number][] = [
  ["next", 3000], ["nuxt", 3000], ["@angular/core", 4200], ["astro", 4321], ["@sveltejs/kit", 5173],
  ["vite", 5173], ["react-scripts", 3000], ["@remix-run/dev", 5173], ["gatsby", 8000],
];

/**
 * Guess how the app starts and where it listens, from package.json. A port named in the dev
 * script wins over the framework default. Returns nothing it cannot back with evidence.
 */
export function detectApp(root: string): { startCommand?: string; baseURL?: string } {
  const pkg = readPackage(root);
  if (!pkg) return {};
  const scriptName = ["dev", "start", "serve"].find((name) => pkg.scripts?.[name]);
  if (!scriptName) return {};
  const script = pkg.scripts![scriptName]!;
  const manager = detectPackageManager(root);
  const startCommand = `${manager} run ${scriptName}`;
  const explicit = /(?:--port[= ]|-p |PORT=)(\d{2,5})/.exec(script);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const port = explicit ? Number(explicit[1]) : FRAMEWORK_PORTS.find(([name]) => name in deps)?.[1];
  return port ? { startCommand, baseURL: `http://localhost:${port}` } : { startCommand };
}

function run(root: string, command: string, args: string[]): boolean {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  return spawnSync(command, args, { cwd: root, stdio: "inherit" }).status === 0;
}

/** Install what is missing. Returns one log line per thing attempted. */
function installDependencies(root: string): string[] {
  const log: string[] = [];
  if (!existsSync(join(root, "package.json"))) {
    writeFileSync(join(root, "package.json"), `${JSON.stringify({ private: true }, null, 2)}\n`);
    log.push("created  package.json");
  }
  if (!existsSync(join(root, "node_modules", "@playwright", "test"))) {
    const manager = detectPackageManager(root);
    const add = manager === "npm" ? ["install", "-D", "@playwright/test"] : ["add", "-D", "@playwright/test"];
    log.push(run(root, manager, add) ? "installed @playwright/test" : `FAILED   ${manager} ${add.join(" ")}`);
  }
  if (existsSync(join(root, "node_modules", "@playwright", "test"))) {
    const ok = run(root, "npx", ["--no-install", "playwright", "install", "chromium"]);
    log.push(ok ? "installed Chromium for Playwright" : "FAILED   npx playwright install chromium");
  }
  if (!onPath("trailblaze")) {
    if (onPath("brew")) {
      const ok = run(root, "brew", ["install", "block/tap/trailblaze"]);
      log.push(ok ? "installed trailblaze" : "FAILED   brew install block/tap/trailblaze");
    } else {
      log.push("MISSING  trailblaze: install it from https://block.github.io/trailblaze (Homebrew not found)");
    }
  }
  return log;
}

const AGENTS_MARKER = "<!-- sova -->";
const AGENTS_SECTION = `${AGENTS_MARKER}
## End-to-end tests (sova)

End-to-end tests in this project are generated, not hand-written. To add, fix or refresh
them, follow the sova skill: \`.agents/skills/sova/SKILL.md\` (or run \`npx --no-install sova skill show\`).
Never edit files in \`sova/tests/\`; change the trail and run \`npx --no-install sova emit\`.
`;

/** Point agents that read AGENTS.md (Codex, Cursor and others) at the skill. */
function linkFromAgentsFile(root: string): string {
  const path = join(root, "AGENTS.md");
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (current.includes(AGENTS_MARKER)) return "kept     AGENTS.md";
  const prefix = current === "" ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  writeFileSync(path, `${current}${prefix}${AGENTS_SECTION}`);
  return current === "" ? "created  AGENTS.md" : "updated  AGENTS.md";
}

/** Create a file unless it exists. Returns a line describing what happened. */
function createOnce(root: string, path: string, content: string): string {
  const full = join(root, path);
  if (existsSync(full)) return `kept     ${path}`;
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return `created  ${path}`;
}

export function installSkill(root: string): string[] {
  return SKILL_TARGETS.map((target) => {
    cpSync(SKILL_SOURCE, join(root, target), { recursive: true });
    return `wrote    ${target}/SKILL.md`;
  });
}

/** Set a project up for sova. Safe to re-run: existing config and inventory are kept. */
export function init(root: string, options: InitOptions): string[] {
  const log: string[] = [];
  const detected = detectApp(root);
  const config: SovaConfig = {
    ...DEFAULTS,
    ...detected,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    ...(options.startCommand ? { startCommand: options.startCommand } : {}),
  };
  const configExisted = existsSync(join(root, CONFIG_PATH));
  log.push(createOnce(root, CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`));
  log.push(createOnce(root, SCREENS_PATH, SCREENS_TEMPLATE));
  log.push(createOnce(root, config.playwrightConfig, readFileSync(CONFIG_TEMPLATE, "utf8")));
  log.push(...installSkill(root));
  log.push(linkFromAgentsFile(root));
  if (!configExisted) {
    const guessed = !options.baseURL && !detected.baseURL;
    log.push(`app      ${config.baseURL}${guessed ? " (a guess; correct baseURL in sova/config.json)" : ""}`);
    log.push(`start    ${config.startCommand || "(none; the app must already be running)"}`);
  }
  if (options.install !== false) log.push(...installDependencies(root));

  const gitignore = join(root, ".gitignore");
  const current = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
  const missing = GITIGNORE_LINES.filter((line) => !current.split("\n").includes(line));
  if (missing.length > 0) {
    const prefix = current === "" || current.endsWith("\n") ? "" : "\n";
    writeFileSync(gitignore, `${current}${prefix}${missing.join("\n")}\n`);
    log.push("updated  .gitignore");
  }

  const packagePath = join(root, "package.json");
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { scripts?: Record<string, string> };
    if (!pkg.scripts?.["test:e2e:sova"]) {
      pkg.scripts = { ...pkg.scripts, "test:e2e:sova": "sova run" };
      writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
      log.push('updated  package.json (script "test:e2e:sova")');
    }
  }
  return log;
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  /** What to do when the check fails. */
  fix?: string;
}

function onPath(command: string): boolean {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [command], { encoding: "utf8" });
  return probe.status === 0;
}

/** Check everything a sova run depends on. */
export async function doctor(root: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({ name: `Node ${process.versions.node}`, ok: major >= 20, fix: "Install Node 20 or newer." });
  checks.push({
    name: "browser driver (Trailblaze) installed, needed to explore and record",
    ok: onPath("trailblaze"),
    fix: "sova init   (or: brew install block/tap/trailblaze)",
  });
  checks.push({
    name: "@playwright/test installed (needed to run tests)",
    ok: existsSync(join(root, "node_modules", "@playwright", "test")),
    fix: "npm i -D @playwright/test && npx playwright install chromium",
  });
  const hasConfig = existsSync(join(root, CONFIG_PATH));
  checks.push({ name: CONFIG_PATH, ok: hasConfig, fix: "sova init" });
  checks.push({
    name: "agent skill installed",
    ok: SKILL_TARGETS.some((target) => existsSync(join(root, target, "SKILL.md"))),
    fix: "sova init",
  });
  if (hasConfig) {
    const config = { ...DEFAULTS, ...JSON.parse(readFileSync(join(root, CONFIG_PATH), "utf8")) } as SovaConfig;
    let reachable = false;
    try {
      await fetch(config.baseURL, { signal: AbortSignal.timeout(3000) });
      reachable = true;
    } catch {
      reachable = false;
    }
    checks.push({
      name: `app reachable at ${config.baseURL}`,
      ok: reachable || config.startCommand !== "",
      fix: "Start the app, or set startCommand in sova/config.json so sova can start it.",
    });
  }
  return checks;
}
