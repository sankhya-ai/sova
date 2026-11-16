import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { loadConfig } from "./config.js";
import { CASE_KINDS } from "./cases.js";

/** One input of a form, as the page declares it. */
export interface PlanField { label: string; type: string; required: boolean; maxlength?: number; minlength?: number }
export interface PlanForm { fields: PlanField[]; submit: string }
export interface PlanPage { route: string; anonymous: "open" | "login" | "missing"; forms: PlanForm[] }

/** Screen id from a route: /admin/users -> admin-users. */
export function screenId(route: string): string {
  const slug = route.replace(/^\/|\/$/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return slug === "" ? "home" : slug;
}

/** Collapse numeric path segments so /users/1 and /users/2 are one screen. */
export function normalizeRoute(path: string): string {
  return path.replace(/\/\d+(?=\/|$)/g, "/:id");
}

/** A value that passes the field's declared rules, by input type. */
export function validValue(field: PlanField): string {
  if (field.type === "email") return "{{unique.sova-plan@example.com}}";
  if (field.type === "password") return "plan-pass-123";
  if (field.type === "url") return "https://example.com";
  if (field.type === "number") return "1";
  return "sova-plan";
}

/** What the plan says for each case kind on a page, from its forms and anonymous access alone. */
export function planCases(page: PlanPage): Record<string, { draft?: string; na?: string; skip?: string }> {
  const form = page.forms[0];
  const fields = form?.fields ?? [];
  const out: Record<string, { draft?: string; na?: string; skip?: string }> = {};
  if (form && isDestructive(page.route, form.submit)) {
    const skip = "destructive form (reset, delete or wipe): a person must decide how to test it safely";
    for (const k of CASE_KINDS) out[k] = k === "permission" && page.anonymous === "login" ? { draft: "visit signed out and expect the sign-in page" } : { skip };
    return out;
  }
  out.valid = form ? { draft: "fill every field with a valid value and submit" } : { draft: "open the page and check it loads" };
  out.invalid = fields.some((f) => ["email", "url", "number"].includes(f.type))
    ? { draft: "fill a typed field with a malformed value and submit" }
    : { na: form ? "no typed field to get wrong from the markup alone (needs a person to name a rule)" : "no form on this page" };
  out.empty = fields.some((f) => f.required) ? { draft: "submit with required fields blank" } : { na: form ? "no required field declared" : "no form on this page" };
  out.boundary = fields.some((f) => f.maxlength !== undefined || f.minlength !== undefined)
    ? { draft: "fill a field at its declared length limit" }
    : { na: "no length limit declared in the markup (server rules cannot be seen from the page)" };
  out.permission = page.anonymous === "login" ? { draft: "visit signed out and expect the sign-in page" } : { na: page.anonymous === "open" ? "page is open to signed-out visitors" : "page not reachable" };
  out["server-error"] = { skip: "cannot be made to fail on demand from the page" };
  return out;
}

function stepYaml(step: string, call: string, args: Record<string, unknown>): string[] {
  const lines = [`  - step: ${JSON.stringify(step)}`, "    recording:", "      web:", `        - ${call}:`];
  for (const [k, v] of Object.entries(args)) lines.push(`            ${k}: ${JSON.stringify(v)}`);
  return [...lines, ""];
}

/** Pages whose submit would destroy or wipe data. A draft must never press them. */
export function isDestructive(route: string, submit: string): boolean {
  return /reset|delete|remove|wipe|destroy|purge|drop|logout|export|import/i.test(`${route} ${submit}`);
}

/** The draft flow for one case, or null when the plan has none. */
export function draftTrail(baseURL: string, page: PlanPage, kind: string): string | null {
  const form = page.forms[0];
  if (form && isDestructive(page.route, form.submit) && kind !== "permission") return null;
  const steps: string[] = [];
  const url = baseURL.replace(/\/$/, "") + page.route;
  const nav = stepYaml(`Open ${page.route}`, "web_navigate", { url });
  if (kind === "valid") {
    steps.push(...nav);
    for (const f of form?.fields ?? []) steps.push(...stepYaml(`Type ${f.label}`, "web_type", { text: validValue(f), ref: `textbox "${f.label}"` }));
    if (form) steps.push(...stepYaml("Submit the form", "web_click", { ref: `button "${form.submit}"` }));
  } else if (kind === "empty" && form) {
    steps.push(...nav, ...stepYaml("Submit with nothing filled in", "web_click", { ref: `button "${form.submit}"` }));
    const first = form.fields.find((f) => f.required);
    if (first) steps.push(...stepYaml("The first required field is still on screen", "web_verifyElementVisible", { ref: `textbox "${first.label}"` }));
  } else if (kind === "permission" && page.anonymous === "login") {
    steps.push(...stepYaml(`Open ${page.route} signed out`, "web_navigate", { url }), ...stepYaml("The sign-in page is shown", "web_waitForUrl", { pattern: "/login" }));
  } else return null;
  return ["config:", "  devices:", "    web:", "      driver: PLAYWRIGHT_NATIVE", `  title: auto ${screenId(page.route)} ${kind}`, "", "trail:", ...steps].join("\n") + "\n";
}

/** Crawl the running app and write a screen map, a case plan and draft flows. Nothing is overwritten. */
export async function planCommand(root: string, maxPages = 40): Promise<number> {
  const config = loadConfig(root);
  const req = createRequire(join(root, "package.json"));
  const { chromium } = req("@playwright/test") as { chromium: any };
  const browser = await chromium.launch();
  const anon = await browser.newContext();
  const authFile = join(root, "sova", ".auth", "user.json");
  const signed = existsSync(authFile) ? await browser.newContext({ storageState: authFile }) : anon;
  const base = new URL(config.baseURL);
  const queue = ["/"], seen = new Set<string>(), pages: PlanPage[] = [];
  while (queue.length > 0 && pages.length < maxPages) {
    const path = queue.shift()!;
    const key = normalizeRoute(path);
    if (seen.has(key) || /logout|\.(png|jpg|css|js)$/.test(path)) continue;
    seen.add(key);
    const page = await signed.newPage();
    const res = await page.goto(base.origin + path, { waitUntil: "domcontentloaded" }).catch(() => null);
    if (!res || res.status() >= 400) { await page.close(); continue; }
    const final = new URL(page.url());
    const links = await page.$$eval("a[href]", (as: any[]) => as.map((a: any) => a.getAttribute("href") ?? ""));
    for (const l of links) {
      try { const u = new URL(l, page.url()); if (u.origin === base.origin && !u.hash) queue.push(u.pathname); } catch { /* skip */ }
    }
    const forms = await page.$$eval("form", (fs: any[]) => fs.map((f: any) => ({
      fields: Array.from(f.querySelectorAll("input,textarea")).filter((i: any) => !["hidden", "submit", "button", "checkbox", "radio", "file"].includes((i as HTMLInputElement).type)).map((i: any) => {
        const el = i;
        const lab = (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()) || el.getAttribute("aria-label") || el.placeholder || el.name;
        return { label: lab, type: el.type || "text", required: el.required, maxlength: el.maxLength > 0 ? el.maxLength : undefined, minlength: el.minLength > 0 ? el.minLength : undefined };
      }),
      submit: (f.querySelector("[type=submit]")?.value || f.querySelector("button[type=submit],button:not([type])")?.textContent?.trim() || "Submit"),
    })).filter((f) => f.fields.length > 0));
    await page.close();
    // The same route signed out: open, sent to sign-in, or missing.
    const ap = await anon.newPage();
    const ar = await ap.goto(base.origin + final.pathname, { waitUntil: "domcontentloaded" }).catch(() => null);
    const anonymous = !ar || ar.status() >= 400 ? "missing" : /login/.test(new URL(ap.url()).pathname) && !/login/.test(final.pathname) ? "login" : "open";
    await ap.close();
    pages.push({ route: normalizeRoute(final.pathname), anonymous, forms });
  }
  await browser.close();
  const unique = [...new Map(pages.map((p) => [p.route, p])).values()];
  const screens = unique.map((p) => {
    const plan = planCases(p);
    return { id: screenId(p.route), route: p.route, trails: [] as string[], cases: CASE_KINDS.map((k) => ({ kind: k, ...(plan[k]!.draft ? { trail: `auto-${screenId(p.route)}-${k}` } : plan[k]!.na ? { na: plan[k]!.na } : { skip: plan[k]!.skip }) })) };
  });
  mkdirSync(join(root, "trails-draft"), { recursive: true });
  let drafts = 0;
  for (const p of unique) for (const k of CASE_KINDS) {
    const body = draftTrail(config.baseURL, p, k);
    if (!body) continue;
    const dir = join(root, "trails-draft", `auto-${screenId(p.route)}-${k}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "trail.yaml"), body);
    drafts++;
  }
  writeFileSync(join(root, "sova", "screens.plan.yaml"), `# Drafted by \`sova plan\` from the running app. Review it, then merge it into screens.yaml.\n${stringify({ screens })}`);
  console.log(`${unique.length} screen(s) found, ${drafts} draft flow(s) written to trails-draft/, plan in sova/screens.plan.yaml`);
  return 0;
}
