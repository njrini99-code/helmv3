/**
 * Bridge Premium Phase 6 (polish) — motion / reduced-motion coverage gate for
 * the admin surface.
 *
 * The admin console does not use framer-motion for its own chrome or triage
 * visuals (that library is reserved for product-facing pages and is already
 * covered by `scripts/__tests__/motion-reduced-motion-coverage.test.mjs`).
 * Admin motion is plain Tailwind utility classes — `animate-spin`,
 * `animate-pulse`, `transition-transform` — and this repo's own established
 * convention (see `src/app/admin/_components/AdminShell.tsx`'s
 * `REFRESH_SPIN_CLASS`, `UnifiedIncidentCard.tsx`, `ErrorsFilterBar.tsx`,
 * `TraceTree.tsx`) is to gate every one of them, either with a `motion-safe:`
 * prefix (no motion at all for a reduced-motion user) or a
 * `motion-reduce:transition-none` / `motion-reduce:animate-none` companion
 * (the motion is cancelled, not merely renamed).
 *
 * Two classes of Tailwind utility are load-bearing here:
 *   - INFINITE / auto-playing loops (`animate-spin`, `animate-pulse`,
 *     `animate-bounce`, `animate-ping`, or a bracket `animate-[...]`
 *     shorthand) — these run without any user interaction, which is exactly
 *     what WCAG 2.3.3 (Animation from Interactions) and vestibular-safety
 *     guidance target. An unguarded one shipped twice in admin before this
 *     gate existed: `activity/page.tsx`'s filter skeleton and
 *     `golf/tracer/TracerRoundDiagnostic.tsx`'s loading spinner, both fixed
 *     alongside this test.
 *   - TRANSFORM-bearing transitions (`transition-transform`, or a bracket
 *     `transition-[...]` that names a transform property such as `width`,
 *     `height`, `translate`, `scale`, `rotate`) — movement, not a colour or
 *     opacity crossfade. `transition-colors` / `transition-opacity` /
 *     `transition-shadow` are deliberately OUT of scope: they carry no
 *     motion in the vestibular sense, and every one of the ~30 existing call
 *     sites in admin already omits a guard by convention (confirmed by grep
 *     across `src/app/admin` and `src/components/admin` at write time) — a
 *     test that flagged them would be a mass rewrite unrelated to the actual
 *     hazard, exactly the trap this file's own header warns against.
 *
 * If you add a new animate-* or transform-transition class under
 * `src/app/admin/**` or `src/components/admin/**`, gate it the way every
 * existing one already is, or this test fails the PR.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = [join(process.cwd(), 'src/app/admin'), join(process.cwd(), 'src/components/admin')];

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      return entry === '__tests__' ? [] : walk(full);
    }
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every occurrence of a raw infinite-loop animation utility, with the 12
 * characters immediately before it (enough to see a `motion-safe:` prefix,
 * which is always adjacent — Tailwind variants are not separated from the
 * utility they modify). */
const INFINITE_ANIMATION = /(.{0,12})\banimate-(spin|pulse|bounce|ping|\[)/g;

/** Every `transition-transform` or a bracket `transition-[...]` that names a
 * transform-affecting CSS property, with 12 characters of lookbehind and the
 * rest of the line for lookahead (a `motion-reduce:transition-none`
 * companion can appear anywhere later in the same class string). */
const TRANSFORM_TRANSITION =
  /(.{0,12})\btransition-(transform\b|\[(?:width|height|translate|scale|rotate)[^\]]*\])/g;

interface Offense {
  file: string;
  line: number;
  snippet: string;
}

function findOffenses(rel: string, raw: string): Offense[] {
  const stripped = stripComments(raw);
  const lines = stripped.split('\n');
  const offenses: Offense[] = [];

  lines.forEach((line, idx) => {
    for (const match of line.matchAll(INFINITE_ANIMATION)) {
      const before = match[1] ?? '';
      if (/motion-safe:$/.test(before)) continue; // gated: no motion at all when reduced.
      offenses.push({ file: rel, line: idx + 1, snippet: line.trim() });
    }
    for (const match of line.matchAll(TRANSFORM_TRANSITION)) {
      const before = match[1] ?? '';
      const guardedByPrefix = /motion-safe:$/.test(before);
      const guardedByCompanion = /motion-reduce:(transition-none|transform-none)/.test(line);
      if (guardedByPrefix || guardedByCompanion) continue;
      offenses.push({ file: rel, line: idx + 1, snippet: line.trim() });
    }
  });

  return offenses;
}

describe('admin motion respects prefers-reduced-motion', () => {
  it('every animate-* / transform-transition utility in src/app/admin and src/components/admin is guarded', () => {
    const files = ROOTS.flatMap(walk);

    expect(files.length).toBeGreaterThan(50); // discovery-walk sanity check

    const offenses = files.flatMap((full) => {
      const rel = full.slice(process.cwd().length + 1);
      return findOffenses(rel, readFileSync(full, 'utf8'));
    });

    if (offenses.length > 0) {
      const report = offenses
        .map((o) => `  - ${o.file}:${o.line}  ${o.snippet}`)
        .join('\n');
      throw new Error(
        'These admin components use an unguarded animate-* or transform-transition ' +
          'utility. Prefix it with motion-safe: (no motion for reduced-motion users) or ' +
          'add a motion-reduce:transition-none / motion-reduce:transform-none companion ' +
          '— see AdminShell.tsx REFRESH_SPIN_CLASS or UnifiedIncidentCard.tsx for the ' +
          `established pattern:\n${report}`,
      );
    }
  });
});
