import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

/**
 * Regression guard for the Wave W7B CoachHelm hub disclosure.
 *
 * The Intelligence Command Center is the front door to the CoachHelm AI
 * layer. Before W7B it deep-linked to only two of CoachHelm's nine coach-
 * facing surfaces (the Intelligence dashboard and Coaching-Intelligence
 * settings); the other seven routes — Alerts, Patterns, Insights, Analytics,
 * AI Chat, Player Genome, and the Qualifying workspace — were orphaned, with
 * no in-product link from the command center.
 *
 * W7B added a 3-column (1 on mobile) surface-card disclosure grid that links
 * to ALL NINE surfaces (icon + eyebrow + title + one-line description + link).
 *
 * This test asserts that the CoachHelm hub (IntelligenceCommandCenter) links
 * to every one of the nine surfaces. It FAILS if any surface link is removed.
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md — CoachHelm
 *   surface-discoverability gap (orphaned routes with no in-product link).
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

// The CoachHelm hub component that owns the surface disclosure grid.
const HUB = join(
  REPO_ROOT,
  'src',
  'components',
  'golf',
  'coachhelm',
  'v2',
  'IntelligenceCommandCenter.tsx',
);

// The nine coach-facing CoachHelm surfaces the hub must link to. Each entry is
// the canonical landing href for that surface. The disclosure grid is the
// single in-product entry point for all of them.
const SURFACES = [
  { name: 'intelligence', href: '/golf/dashboard/intelligence' },
  { name: 'alerts', href: '/golf/dashboard/alerts' },
  { name: 'patterns', href: '/golf/dashboard/patterns' },
  { name: 'insights', href: '/golf/dashboard/insights' },
  { name: 'analytics/coachhelm', href: '/golf/dashboard/analytics/coachhelm' },
  { name: 'chat', href: '/golf/dashboard/coachhelm/chat' },
  { name: 'genome', href: '/golf/dashboard/coachhelm/genome/compare' },
  { name: 'qualifying', href: '/golf/dashboard/qualifiers' },
  { name: 'coaching-intelligence', href: '/golf/dashboard/settings/coaching-intelligence' },
];

async function exists(path) {
  return (await stat(path).catch(() => null)) !== null;
}

function countMatches(content, re) {
  const m = content.match(re);
  return m ? m.length : 0;
}

test('the CoachHelm hub component exists', async () => {
  assert.ok(await exists(HUB), `CoachHelm hub must exist: ${HUB}`);
});

test('the CoachHelm hub links to all nine surfaces', async () => {
  const content = await readFile(HUB, 'utf8');
  const missing = [];

  for (const surface of SURFACES) {
    // The href must appear in the source (inside a <Link href="…"> or the
    // SURFACES disclosure list). Exact-segment match so /alerts can't be
    // satisfied by an unrelated /alerts-something route.
    if (!content.includes(`'${surface.href}'`) && !content.includes(`"${surface.href}"`)) {
      missing.push(`${surface.name} → ${surface.href}`);
    }
  }

  assert.equal(
    missing.length,
    0,
    `CoachHelm hub is missing in-product links to ${missing.length} surface(s):\n` +
      missing.map((m) => `  - ${m}`).join('\n') +
      `\n\nWave W7B requires the IntelligenceCommandCenter disclosure to link to ` +
      `all nine CoachHelm surfaces. Re-add the missing href to COACHHELM_SURFACES.`,
  );
});

test('the surface disclosure is a real grid of cards (icon + eyebrow + title + link)', async () => {
  const content = await readFile(HUB, 'utf8');

  // The disclosure is declared as a single source-of-truth list.
  assert.match(
    content,
    /COACHHELM_SURFACES/,
    'Hub must declare a COACHHELM_SURFACES list that drives the disclosure grid.',
  );

  // 3-col on desktop, 1-col on mobile.
  assert.match(
    content,
    /grid-cols-1\s+md:grid-cols-3/,
    'Surface disclosure must be a 3-column (1 on mobile) grid.',
  );

  // The COACHHELM_SURFACES list must hold an href per surface (>= 9 entries).
  // The grid maps over it, rendering one navigational <Link> per surface.
  assert.ok(
    countMatches(content, /href:\s*['"]\/golf\/dashboard\//g) >= SURFACES.length,
    `COACHHELM_SURFACES must declare an href per surface (>= ${SURFACES.length} entries).`,
  );
  assert.match(
    content,
    /COACHHELM_SURFACES\.map\(/,
    'The disclosure grid must map over COACHHELM_SURFACES.',
  );
  assert.match(
    content,
    /<Link\b/,
    'Each surface card must be a navigational <Link>.',
  );

  // Cards carry an eyebrow + a title + a one-line description field.
  for (const field of ['eyebrow', 'title', 'description']) {
    assert.ok(
      content.includes(`${field}:`),
      `Each surface entry must define a "${field}" field for the card.`,
    );
  }
});
