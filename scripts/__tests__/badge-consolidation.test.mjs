import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Regression guard for Wave W2D — Badge (pill/chip) consolidation (agent badge).
 *
 * W2D refactored `src/components/ui/badge.tsx` into the single canonical pill
 * primitive with a `tone × appearance` API (tone = neutral|primary|positive|
 * warning|destructive|info|accent + the literal hues warm/green/emerald/amber/
 * orange/rose/red/blue/violet/indigo/teal; appearance = solid|soft|outline),
 * and migrated the ~14 one-off pill/badge components so their COLORED SHELL
 * delegates to <Badge> instead of being hand-rolled. The migration is strictly
 * color-faithful: distinct hues (rose vs red, emerald vs green vs primary,
 * amber vs orange, violet vs indigo, blue vs teal) map to distinct tones and
 * are never flattened into one.
 *
 * This test re-asserts that contract so a pill cannot silently start
 * hand-rolling its own colored pill styling again:
 *
 *   1. The canonical Badge exposes the `tone`, `appearance` and `as` API.
 *   2. Each migrated pill module imports + delegates to <Badge> (so it no
 *      longer paints its own `bg-<color> + text-<color> + rounded-full` span).
 *   3. None of the migrated modules contains a bare hand-rolled colored pill
 *      element (a `rounded-full` span/div carrying its OWN `bg-<hue>-NN` +
 *      `text-<hue>-NNN` recipe) that bypasses <Badge>.
 *
 * Audit reference: ultra-audit master synthesis — component consistency /
 * implementation-debt (A4): one canonical pill primitive, no hand-rolled
 * colored pills in product code.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const BADGE_FILE = join(REPO_ROOT, 'src', 'components', 'ui', 'badge.tsx');

// The pill/badge modules consolidated in W2D. Each must delegate its colored
// shell to <Badge>. (StatusPill is the former parallel pill primitive; it now
// wraps Badge for its soft/solid surfaces.)
const MIGRATED_PILLS = [
  'src/components/ui/status-pill.tsx',
  'src/components/golf/calendar/StatusBadge.tsx',
  'src/app/golf/admin/components/shared/StatusBadge.tsx',
  'src/app/golf/admin/components/shared/LifecycleBadge.tsx',
  'src/components/golf/roster/YearBadge.tsx',
  'src/components/golf/roster/PlayerStatusBadge.tsx',
  'src/components/golf/tasks/ReminderBadge.tsx',
  'src/components/baseball/tasks/ReminderBadge.tsx',
  'src/components/golf/coachhelm/insight-card/MovementPill.tsx',
  'src/components/golf/coachhelm/alerts/AlertBadge.tsx',
  'src/components/golf/calendar/editorial/EventChip.tsx',
  'src/app/golf/admin/crm/components/badges/EngagementBadge.tsx',
  'src/app/golf/admin/crm/components/EmailStatusBadge.tsx',
  'src/components/baseball/recruiting-philosophy/MatchScoreBadge.tsx',
];

/**
 * Modules in the W2D pill list whose visual treatment is genuinely RICHER than
 * a tone-able pill (a glassmorphic/gradient interactive button, or an
 * interactive Button-primitive chip). Per the feature/visual-preservation rule,
 * these are NOT downgraded into a flat <Badge>; they keep their bespoke look.
 * They still hold the listed pill NAME but are exempt from the delegation
 * assertion. The test still FAILS if a new colored *pill span* sneaks into the
 * other modules.
 *
 * Each entry carries a one-line reason so the exemption is auditable.
 */
const RICHER_TREATMENT_ALLOWLIST = [
  {
    file: 'src/components/baseball/position-planner/PositionPlayerPill.tsx',
    reason:
      'Glassmorphic interactive avatar-chip (per-stage gradient + glow + inner ' +
      'highlight + framer-motion). Flattening to a tone pill is a visual regression.',
  },
  {
    file: 'src/components/golf/coachhelm/insight-card/DrillChips.tsx',
    reason:
      'Interactive drill-chip buttons with bespoke cream surface + hover-to-white ' +
      'border-glow choreography (not a status pill).',
  },
  {
    file: 'src/app/golf/admin/crm/components/segments/SegmentBadge.tsx',
    reason:
      'Both variants are interactive Button primitives (nav-rail item + clickable ' +
      'filter chip), not a hand-rolled colored pill span.',
  },
  {
    file: 'src/components/golf/coachhelm/v3/IntentPill/index.tsx',
    reason:
      'Color is lib-owned (NARRATIVE_GOAL_PRESENTATION.pillClass, shared with ' +
      'IntentDrawer) — IntentPill does not hand-roll colors. It keeps raw ' +
      'template-string class composition because its custom text-eyebrow size + ' +
      'pillClass text-<hue> color do not collide under raw concat, whereas the ' +
      'tests render path asserts text-eyebrow survives. (Migrating it gains no ' +
      'color fidelity and risks the existing IntentPill size test.)',
  },
];

// A hand-rolled colored PILL element: a `rounded-full` span/div that paints
// its OWN `bg-<hue>-NN` tint AND carries horizontal padding (`px-…`) — i.e. the
// exact pill recipe <Badge> now owns. The `px-` requirement distinguishes a
// real pill (always padded) from a tiny colored *dot* (`w-1.5 h-1.5 rounded-
// full bg-…` with no padding) which is a legitimate child of a <Badge> and not
// a pill shell. Both class orderings (rounded-full before/after bg) are caught;
// `px-` may appear anywhere in the same opening tag.
const HUE = '(?:primary|warm|green|emerald|amber|orange|rose|red|blue|violet|indigo|teal)';

/** True if a span/div opening tag is a hand-rolled colored *pill* shell. */
function hasHandrolledPill(src) {
  const TAG = /<(?:span|div)\b[^>]*>/gs;
  let m;
  while ((m = TAG.exec(src)) !== null) {
    const tag = m[0];
    const hasRoundedFull = /\brounded-full\b/.test(tag);
    const hasColoredBg = new RegExp(`\\bbg-${HUE}-\\d`).test(tag);
    const hasPadding = /\bpx-/.test(tag);
    if (hasRoundedFull && hasColoredBg && hasPadding) return true;
  }
  return false;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Strip block + line comments so prose mentioning a class isn't a false hit. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

test('canonical Badge exposes the tone × appearance × as API', async () => {
  assert.ok(await exists(BADGE_FILE), `Expected canonical Badge at ${BADGE_FILE}`);
  const src = await readFile(BADGE_FILE, 'utf8');

  // The tone API + the seven semantic tones the brief specifies.
  assert.match(src, /export type BadgeTone\s*=/, 'Badge must export a BadgeTone union');
  for (const tone of [
    'neutral',
    'primary',
    'positive',
    'warning',
    'destructive',
    'info',
    'accent',
  ]) {
    assert.match(
      src,
      new RegExp(`['"\\b]${tone}['"\\b]`),
      `BadgeTone must include the semantic tone "${tone}"`,
    );
  }
  // The surface (appearance) variants.
  for (const appearance of ['solid', 'soft', 'outline']) {
    assert.match(
      src,
      new RegExp(`['"]${appearance}['"]`),
      `Badge must support the "${appearance}" appearance`,
    );
  }
  // Polymorphic `as` so animated pills can delegate their colored shell.
  assert.match(src, /\bas\?:\s*ElementType/, 'Badge must accept a polymorphic `as` prop');
});

test('every migrated pill module exists and delegates to <Badge>', async () => {
  const allowlisted = new Set(RICHER_TREATMENT_ALLOWLIST.map((e) => e.file));
  const missing = [];
  const notDelegating = [];

  for (const rel of MIGRATED_PILLS) {
    if (allowlisted.has(rel)) continue;
    const full = join(REPO_ROOT, rel);
    if (!(await exists(full))) {
      missing.push(rel);
      continue;
    }
    const src = await readFile(full, 'utf8');
    const importsBadge =
      /from\s+['"]@\/components\/ui\/badge['"]/.test(src) &&
      /\bBadge\b/.test(src);
    if (!importsBadge) notDelegating.push(rel);
  }

  assert.deepEqual(missing, [], `Migrated pill module(s) unexpectedly missing:\n${missing.join('\n')}`);
  assert.deepEqual(
    notDelegating,
    [],
    `These W2D pill modules no longer delegate to <Badge> (they must import + ` +
      `render <Badge> for their colored shell):\n${notDelegating.join('\n')}`,
  );
});

test('no migrated pill module hand-rolls its own colored pill span/div', async () => {
  const allowlisted = new Set(RICHER_TREATMENT_ALLOWLIST.map((e) => e.file));
  const violations = [];

  for (const rel of MIGRATED_PILLS) {
    if (allowlisted.has(rel)) continue;
    const full = join(REPO_ROOT, rel);
    if (!(await exists(full))) continue;
    const src = stripComments(await readFile(full, 'utf8'));
    if (hasHandrolledPill(src)) {
      violations.push(rel);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `These W2D pill modules still hand-roll a colored pill shell (a rounded-full ` +
      `span/div carrying its own bg-<hue>-NN tint). Delegate the colored shell to ` +
      `<Badge tone=… appearance=…> instead:\n${violations.join('\n')}`,
  );
});

test('richer-treatment allowlist entries are real files with reasons', async () => {
  for (const entry of RICHER_TREATMENT_ALLOWLIST) {
    assert.ok(
      await exists(join(REPO_ROOT, entry.file)),
      `Allowlisted file should exist (remove the stale entry otherwise): ${entry.file}`,
    );
    assert.ok(
      typeof entry.reason === 'string' && entry.reason.length > 20,
      `Allowlist entry for ${entry.file} must carry a substantive reason`,
    );
  }
});

test('the hand-rolled-pill detector matches a real colored pill but not a dot or Badge call', () => {
  // Positive: a hand-rolled colored pill span (rounded-full + colored bg + px).
  assert.ok(
    hasHandrolledPill(
      '<span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">x</span>',
    ),
    'detector should flag a hand-rolled colored pill span',
  );
  // Positive (reverse class order).
  assert.ok(
    hasHandrolledPill('<div className="bg-rose-500 px-2 rounded-full text-white">x</div>'),
    'detector should flag a hand-rolled colored pill div (reverse order)',
  );
  // Negative: a tiny colored DOT (no padding) is a legitimate <Badge> child.
  assert.ok(
    !hasHandrolledPill('<span className="w-1.5 h-1.5 rounded-full bg-primary-500" />'),
    'detector must not flag a colored dot (no padding)',
  );
  // Negative: a <Badge> call delegating the color is NOT a hand-rolled span.
  assert.ok(
    !hasHandrolledPill('<Badge tone="amber" className="px-2">x</Badge>'),
    'detector must not flag a <Badge> delegation',
  );
});
