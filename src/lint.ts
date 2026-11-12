import { readFileSync } from "node:fs";

export interface Finding {
  rule: string;
  severity: "error" | "warning";
  line: number;
  message: string;
}

interface LineRule {
  rule: string;
  severity: "error" | "warning";
  pattern: RegExp;
  message: string;
}

/**
 * Line-level checks for Playwright practices that cause flake or hide failures. These are
 * pattern matches, not a parse of the code, so they can miss a construct split across lines.
 */
const LINE_RULES: LineRule[] = [
  {
    rule: "no-fixed-wait",
    severity: "error",
    pattern: /\bwaitForTimeout\s*\(/,
    message: "fixed sleeps are flaky; wait with a web-first assertion such as expect(locator).toBeVisible()",
  },
  {
    rule: "no-networkidle",
    severity: "error",
    pattern: /['"]networkidle['"]/,
    message: "networkidle is unreliable; assert on the element the page shows when it is ready",
  },
  {
    rule: "no-focused-test",
    severity: "error",
    pattern: /\b(test|describe)\.only\s*\(/,
    message: ".only silently skips every other test",
  },
  {
    rule: "no-pause",
    severity: "error",
    pattern: /\bpage\.pause\s*\(/,
    message: "page.pause() hangs a headless run",
  },
  {
    rule: "no-xpath",
    severity: "error",
    pattern: /xpath=|locator\(\s*['"`]\s*\/\//,
    message: "XPath ties the test to DOM structure; use getByRole, getByLabel or getByTestId",
  },
  {
    rule: "no-element-handle",
    severity: "error",
    pattern: /\bpage\.\$\$?\s*\(/,
    message: "element handles do not auto-wait or retry; use a locator",
  },
  {
    rule: "web-first-assertion",
    severity: "error",
    pattern: /expect\(\s*await\s+.*\.(isVisible|isHidden|isEnabled|isDisabled|isChecked|textContent|innerText|inputValue|getAttribute|count)\(/,
    message: "this reads the page once and never retries; use expect(locator).toBeVisible() / toHaveText() / toHaveCount()",
  },
  {
    rule: "no-force",
    severity: "warning",
    pattern: /force:\s*true/,
    message: "force skips actionability checks, so the test can pass on a control a user cannot use",
  },
  {
    rule: "use-base-url",
    severity: "warning",
    pattern: /\.goto\(\s*['"`]https?:\/\//,
    message: "absolute URL; navigate with a path so the test follows baseURL across environments",
  },
  {
    rule: "prefer-user-facing-locator",
    severity: "warning",
    pattern: /\bpage\.locator\(/,
    message: "CSS locator; prefer getByRole, getByLabel or getByTestId (add a data-testid to the app if needed)",
  },
  {
    rule: "no-positional-locator",
    severity: "warning",
    pattern: /\.(first|last)\(\)|\.nth\(/,
    message: "depends on match order; make the locator unique instead",
  },
];

/** Lint one Playwright spec's source. */
export function lintSource(source: string): Finding[] {
  const findings: Finding[] = [];
  const lines = source.split("\n");
  lines.forEach((text, index) => {
    if (text.trim().startsWith("//")) return;
    for (const rule of LINE_RULES) {
      if (rule.pattern.test(text)) {
        findings.push({ rule: rule.rule, severity: rule.severity, line: index + 1, message: rule.message });
      }
    }
  });
  if (/\btest\s*\(/.test(source) && !/\bexpect\s*\(/.test(source)) {
    findings.push({
      rule: "must-assert",
      severity: "error",
      line: 1,
      message: "no assertion; a test that only clicks through proves nothing, so verify the outcome",
    });
  }
  return findings;
}

export function lintFile(path: string): Finding[] {
  return lintSource(readFileSync(path, "utf8"));
}
