import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

/**
 * Regression guard for Wave W4-surface (W4D) — admin tables + the WeekView
 * calendar get a usable <md mobile fallback.
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md — responsive /
 *   "data table escapes the viewport on mobile" findings. Wide admin tables
 *   (CoachIntelligenceCard, the CRM CoachTable, the three Business-Intelligence
 *   tables, and QualifierRoundBreakdown) used a single `min-w-[…]` <table>
 *   behind a horizontal scroller, which on a phone hides columns off-screen and
 *   drops actions behind the scroll. The fix keeps the rich desktop table
 *   (now `hidden md:block` / `hidden md:table`, still inside `overflow-x-auto`)
 *   and adds a `md:hidden` card-list fallback that renders one card per row
 *   carrying the SAME columns / values / actions. WeekView additionally gets a
 *   `md:hidden` vertical day-list companion (its grid needs an 800px min-width).
 *
 * Each targeted file MUST contain BOTH:
 *   1. a desktop table/grid gated to >= md  (`hidden md:block` or
 *      `hidden md:table`), and
 *   2. a `md:hidden` mobile fallback block.
 *
 * The test FAILS on regression — i.e. if any target loses either half (a raw
 * always-visible wide table with no mobile companion, or a mobile companion
 * that is no longer gated to <md).
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

// Files that must expose both a >=md desktop view and a <md mobile fallback.
const TARGETS = [
  'src/app/golf/admin/components/CoachIntelligenceCard.tsx',
  'src/app/golf/admin/crm/components/CoachTable.tsx',
  'src/app/golf/admin/components/BusinessIntelligenceTab.tsx',
  'src/app/golf/(dashboard)/dashboard/qualifiers/[id]/QualifierRoundBreakdown.tsx',
  'src/components/golf/calendar/WeekView.tsx',
];

// A desktop surface gated to the md breakpoint and up: either a block-level
// wrapper (`hidden md:block`) or a table that only becomes a table at md
// (`hidden md:table`).
const DESKTOP_GATE_RE = /hidden\s+md:(block|table)\b/;

// The <md mobile fallback marker.
const MOBILE_FALLBACK_RE = /\bmd:hidden\b/;

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('every targeted admin table / WeekView ships a >=md desktop view AND a <md mobile fallback', async () => {
  const problems = [];

  for (const rel of TARGETS) {
    const full = join(REPO_ROOT, rel);
    let raw;
    try {
      raw = await readFile(full, 'utf8');
    } catch {
      problems.push(`${rel} — file is missing (did it move or get renamed?).`);
      continue;
    }
    const content = stripComments(raw);

    if (!DESKTOP_GATE_RE.test(content)) {
      problems.push(
        `${rel} — no desktop view gated to >= md found ` +
          `(expected a "hidden md:block" wrapper or a "hidden md:table" table). ` +
          `The wide table must be hidden on phones and replaced by the card fallback.`,
      );
    }

    if (!MOBILE_FALLBACK_RE.test(content)) {
      problems.push(
        `${rel} — no "md:hidden" mobile fallback found. Every targeted table ` +
          `needs a <md card-list (or day-list) companion carrying the same ` +
          `columns / values / actions.`,
      );
    }
  }

  if (problems.length > 0) {
    assert.fail(
      `Found ${problems.length} admin-tables-mobile regression(s).\n` +
        `Wave W4D requires each admin table + WeekView to ship BOTH a >=md ` +
        `desktop table/grid and a <md mobile fallback.\n\n` +
        problems.map((p) => `  - ${p}`).join('\n'),
    );
  }
});

test('WeekView mobile companion is a vertical day-list, not the 800px grid', async () => {
  // The desktop time-grid carries `min-w-[800px]`; the <md companion must NOT
  // reuse it. Assert the wide grid wrapper is gated behind `hidden md:block`
  // so it can never force a horizontal scroll on a phone.
  const rel = 'src/components/golf/calendar/WeekView.tsx';
  const content = stripComments(await readFile(join(REPO_ROOT, rel), 'utf8'));

  assert.match(
    content,
    /hidden\s+md:block\s+min-w-\[800px\]/,
    `${rel} — the 800px-wide time-grid wrapper must be gated behind ` +
      `"hidden md:block" so it never forces a horizontal scroll on <md. ` +
      `The <md surface is the md:hidden vertical day-list.`,
  );
});
