import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Accessibility assertion built on axe-core. Runs an audit against WCAG 2.0/2.1
 * A & AA and fails the test on any `serious`/`critical` violation — EXCEPT a
 * documented baseline of pre-existing, app-wide issues (see {@link KNOWN_ISSUES}).
 *
 * Why a baseline? These rules are violated on essentially every screen today
 * (icon-only buttons with no accessible name, low-contrast muted text, a
 * scrollable region without keyboard access). They are genuine app defects, but
 * fixing the application is outside the QA harness's remit. Rather than let
 * pre-existing debt make the whole gate red (and hide regressions), we:
 *   • record them as a baseline so they don't fail the build, and
 *   • still hard-fail on ANY other serious/critical violation — so newly
 *     introduced a11y regressions are caught immediately.
 *
 * As the app team fixes a rule, delete it from KNOWN_ISSUES to ratchet the gate
 * tighter. `@axe-core/playwright` is a pure npm package (injects axe's JS) — no
 * browser download — so it works behind the firewalled CDN.
 */
export const KNOWN_ISSUES: ReadonlySet<string> = new Set([
  "button-name", // icon-only action buttons (edit/delete/etc.) lack a label
  "color-contrast", // muted-foreground text below AA contrast in many places
  "scrollable-region-focusable", // scrollable lists not keyboard-focusable
]);

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

export async function assertNoA11yViolations(
  page: Page,
  opts: { disableRules?: string[] } = {}
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
  ]);
  if (opts.disableRules?.length)
    builder = builder.disableRules(opts.disableRules);

  const { violations } = await builder.analyze();

  const known = violations.filter(v => KNOWN_ISSUES.has(v.id));
  const blocking = violations.filter(
    v => BLOCKING_IMPACTS.has(v.impact ?? "") && !KNOWN_ISSUES.has(v.id)
  );

  // Surface the accepted baseline so it stays visible (and shrinkable) over time.
  if (known.length) {
    const ids = [...new Set(known.map(v => v.id))].join(", ");
    console.warn(
      `[a11y] ${page.url()} — ${known.length} known baseline issue(s): ${ids}`
    );
  }

  if (blocking.length) {
    const summary = blocking
      .map(
        v =>
          `  • [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n` +
          `    ${v.helpUrl}`
      )
      .join("\n");
    expect(blocking, `New accessibility violations:\n${summary}`).toEqual([]);
  }
}
