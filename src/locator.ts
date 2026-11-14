import { escapeRegex, quote, regexLiteral } from "./util.js";

/** The `nodeSelector.web` block Trailblaze records for a web element. */
export interface WebSelector {
  ariaRole?: string | null;
  ariaNameRegex?: string | null;
  ariaDescriptorRegex?: string | null;
  headingLevel?: number | null;
  cssSelector?: string | null;
  dataTestId?: string | null;
  nthIndex?: number | null;
}

/** How durable a locator is, best first. */
export type LocatorQuality = "testid" | "role" | "text" | "css";

export interface LocatorCode {
  /** A Playwright locator expression, e.g. `page.getByRole('button', { name: 'Save', exact: true })`. */
  code: string;
  quality: LocatorQuality;
  /** True when the locator depends on match order (`.first()` / `.nth(n)`). */
  positional: boolean;
}

/** A step sova cannot turn into deterministic Playwright code. */
export class Blocked extends Error {}

/**
 * Roles ARIA forbids naming. Trailblaze's snapshot prints them by their text (`paragraph:
 * Saved`) and records that text as the "name", so `getByRole(role, { name })` would find
 * nothing. They are matched on text instead.
 */
export const NAME_PROHIBITED_ROLES = new Set([
  "paragraph", "strong", "emphasis", "generic", "code", "deletion", "insertion", "subscript",
  "superscript", "caption",
]);

/**
 * Roles that take a name only from `aria-label` / `aria-labelledby`, never from content. The
 * recorded "name" is the label when the author gave one and the printed text otherwise, and
 * the recording does not say which, so both are matched.
 */
export const AUTHOR_NAMED_ROLES = new Set([
  "listitem", "status", "alert", "note", "blockquote", "time", "mark", "term", "definition",
]);

const REGEX_METACHARACTERS = /[\\^$.|?*+()[\]{}]/;

type NameMatcher = { literal: string } | { source: string; flags: string };

/**
 * Trailblaze selector values are regexes matched against the WHOLE property. A `\Q...\E` quote
 * or a metacharacter-free string (optionally `^...$` anchored) is a plain literal.
 */
export function nameMatcher(value: string): NameMatcher {
  const quoted = /^\\Q([\s\S]*)\\E$/.exec(value);
  if (quoted && !quoted[1]!.includes("\\E")) return { literal: quoted[1]! };
  const unanchored = value.replace(/^\^/, "").replace(/\$$/, "");
  if (!REGEX_METACHARACTERS.test(unanchored)) return { literal: unanchored };
  // A leading inline flag group such as `(?i)` is Java syntax; JS takes flags separately.
  const inline = /^\(\?([a-z]+)\)/.exec(value);
  const flags = inline ? [...new Set(inline[1]!.split("").filter((f) => "ims".includes(f)))].join("") : "";
  const source = inline ? value.slice(inline[0].length) : value;
  return { source: `^(?:${source})$`, flags };
}

function nameCode(matcher: NameMatcher): string {
  if ("literal" in matcher) return quote(matcher.literal);
  const literal = regexLiteral(matcher.source, matcher.flags);
  if (literal === null) {
    throw new Blocked(`selector pattern ${JSON.stringify(matcher.source)} is not a valid JavaScript regex`);
  }
  return literal;
}

/** A regex literal matching exactly the text `matcher` describes. */
function wholeTextRegex(matcher: NameMatcher): string {
  if ("literal" in matcher) return regexLiteral(`^${escapeRegex(matcher.literal)}$`)!;
  return nameCode(matcher);
}

function byRoleAndName(role: string, name: string, headingLevel: number | null): LocatorCode {
  const matcher = nameMatcher(name);
  if (role === "text") {
    const code = "literal" in matcher
      ? `page.getByText(${quote(matcher.literal)}, { exact: true })`
      : `page.getByText(${nameCode(matcher)})`;
    return { code, quality: "text", positional: false };
  }
  if (NAME_PROHIBITED_ROLES.has(role)) {
    return {
      code: `page.getByRole(${quote(role)}).filter({ hasText: ${wholeTextRegex(matcher)} })`,
      quality: "text",
      positional: false,
    };
  }
  const options = "literal" in matcher
    ? [`name: ${quote(matcher.literal)}`, "exact: true"]
    : [`name: ${nameCode(matcher)}`];
  if (role === "heading" && headingLevel !== null) options.push(`level: ${headingLevel}`);
  const named = `page.getByRole(${quote(role)}, { ${options.join(", ")} })`;
  if (AUTHOR_NAMED_ROLES.has(role)) {
    const byText = `page.getByRole(${quote(role)}).filter({ hasText: ${wholeTextRegex(matcher)} })`;
    return { code: `${named}.or(${byText})`, quality: "role", positional: false };
  }
  return { code: named, quality: "role", positional: false };
}

function withIndex(locator: LocatorCode, nthIndex: number | null | undefined): LocatorCode {
  if (nthIndex === null || nthIndex === undefined) return locator;
  const suffix = nthIndex === 0 ? ".first()" : `.nth(${nthIndex})`;
  return { ...locator, code: locator.code + suffix, positional: true };
}

/**
 * Turn a recorded selector into a Playwright locator. Matchers are tried most durable first,
 * in the same order Trailblaze resolves them at replay: test id, role + name, CSS, bare role.
 */
export function locatorFromSelector(web: WebSelector): LocatorCode {
  const level = typeof web.headingLevel === "number" ? web.headingLevel : null;
  let locator: LocatorCode;
  if (web.dataTestId) {
    locator = { code: `page.getByTestId(${quote(web.dataTestId)})`, quality: "testid", positional: false };
  } else if (web.ariaRole && web.ariaNameRegex) {
    locator = byRoleAndName(web.ariaRole, web.ariaNameRegex, level);
  } else if (web.cssSelector) {
    locator = { code: `page.locator(${quote(web.cssSelector)})`, quality: "css", positional: false };
  } else if (web.ariaRole) {
    const options = web.ariaRole === "heading" && level !== null ? `, { level: ${level} }` : "";
    locator = { code: `page.getByRole(${quote(web.ariaRole)}${options})`, quality: "role", positional: false };
  } else {
    throw new Blocked("recorded selector has no test id, role, or CSS to locate the element by");
  }
  return withIndex(locator, web.nthIndex);
}

/**
 * Turn a bare `ref` into a locator. Only durable refs work: `css=...` and ARIA descriptors
 * such as `button "Save"`. Snapshot refs (`e12`) exist only inside the session that made them.
 */
export function locatorFromRef(ref: string): LocatorCode {
  const trimmed = ref.trim();
  if (trimmed.startsWith("css=")) {
    return { code: `page.locator(${quote(trimmed.slice(4))})`, quality: "css", positional: false };
  }
  if (/^\[?e\d+\]?$/.test(trimmed)) {
    throw new Blocked(
      `ref ${trimmed} is a snapshot id with no recorded selector, so it cannot be replayed; re-record the step`,
    );
  }
  const described = /^([a-z]+)\s+"(.*)"$/.exec(trimmed);
  if (described) {
    // A descriptor's quoted name is a literal, not a pattern.
    return byRoleAndName(described[1]!, `\\Q${described[2]!}\\E`, null);
  }
  throw new Blocked(`ref ${JSON.stringify(trimmed)} is not a durable selector`);
}

/** The locator for a recorded tool call: its `nodeSelector.web` when present, else its `ref`. */
export function locatorForCall(args: Record<string, unknown>): LocatorCode | null {
  const selector = args.nodeSelector as { web?: WebSelector } | undefined;
  if (selector && typeof selector === "object" && selector.web) return locatorFromSelector(selector.web);
  if (typeof args.ref === "string" && args.ref.trim() !== "") return locatorFromRef(args.ref);
  return null;
}
