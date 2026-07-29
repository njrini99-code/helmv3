// =============================================================================
// Nothing outside a disabled module may link INTO it.
//
// WHY. Closing a route is half the job. The sunset gated
// /baseball/dashboard/discover and /baseball/dashboard/activate, and both
// stayed advertised from surfaces that are very much alive:
//
//   • Calendar's no-team empty state — a **Browse prospects** button into
//     /discover, shown to a college coach on their first login.
//   • Four player surfaces — including /baseball/player/today, the FIRST
//     screen after a player logs in — each with a green **Activate
//     Recruiting** button into /activate.
//
// Every one of those was found by reading. This test is the version that does
// not depend on someone thinking to look, and it fails with the file and line
// rather than a count.
//
// THE RULE. A file may link to a module-disabled route only if the file
// belongs to that module — a recruiting screen linking to another recruiting
// screen is correct and must keep working the day the module returns. So the
// allowlist is expressed as OWNERSHIP, not as a list of forgiven links: it
// names the directories that ARE the module. Anything else linking inward is
// a leak.
//
// WHAT THIS CAN AND CANNOT PROVE — read this before trusting a green run.
//
// The first draft asserted "no file outside the module contains an inbound
// link" and immediately failed on all five sites I had just FIXED. The markup
// is still there; it now sits inside a conditional the module flag controls.
// A source scan cannot see a conditional, and demanding the markup be absent
// would have forced the links to be deleted rather than gated — destroying the
// restoration path the whole sunset is built on.
//
// So the rule is the checkable one: a file that links into a disabled module
// must CONSULT THE GATE. Referencing a gate symbol is evidence a human made a
// decision at that site.
//
// The residual gap, stated plainly: a NEW ungated link added to a file that
// already consults the gate will not be caught. What is caught — and is the
// realistic failure — is a link added by someone who does not know the module
// is off, in a file with no gate anywhere in it. That is what every one of the
// five real leaks looked like before it was fixed.
//
// Also literal targets only: a template literal with an interpolation is
// invisible here, so green means "no hardcoded ungated inbound link". Same
// limit as no-dead-baseball-links.test.ts, for the same reason.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { isPathnameModuleDisabled, moduleForPathname } from '@/lib/baseball/product-modules';

const ROOT = join(__dirname, '../../..');
const SRC = join(ROOT, 'src');

/**
 * Directories that BELONG to the recruiting module. A file here linking to a
 * recruiting route is linking within its own module, which is correct and is
 * how restoration stays testable.
 *
 * Path fragments, matched against the repo-relative path with normalised
 * separators. Deliberately specific — a broad fragment like 'baseball' would
 * silence the whole check.
 */
const MODULE_OWNED_PATHS: readonly string[] = [
  // Route directories for recruiting surfaces.
  'src/app/baseball/(dashboard)/dashboard/pipeline/',
  'src/app/baseball/(dashboard)/dashboard/college-interest/',
  'src/app/baseball/(dashboard)/dashboard/colleges/',
  'src/app/baseball/(dashboard)/dashboard/discover/',
  'src/app/baseball/(dashboard)/dashboard/scouting/',
  'src/app/baseball/(dashboard)/dashboard/scout-packets/',
  'src/app/baseball/(dashboard)/dashboard/camps/',
  'src/app/baseball/(dashboard)/dashboard/comparisons/',
  'src/app/baseball/(dashboard)/dashboard/compare/',
  'src/app/baseball/(dashboard)/dashboard/journey/',
  'src/app/baseball/(dashboard)/dashboard/activate/',
  // Closed by requireRecruiting*Route rather than by the prefix registry, but
  // recruiting surfaces all the same.
  'src/app/baseball/(dashboard)/dashboard/watchlist/',
  'src/app/baseball/(dashboard)/dashboard/analytics/',
  'src/app/baseball/(public)/packet/',
  // Component directories that exist only to render recruiting.
  'src/components/coach/discover/',
  'src/components/baseball/recruiting-philosophy/',
  'src/components/baseball/position-planner/',
  'src/components/baseball/player-access/',
  'src/components/features/saved-comparisons-list.tsx',
  // The gate itself, and the copy it preserves for restoration.
  'src/lib/baseball/product-modules.ts',
  'src/lib/baseball/recruiting-activation.ts',
  'src/lib/baseball/marketing/landing-copy.ts',
  'src/lib/baseball/nav-registry.ts',
  'src/lib/baseball/route-contract.ts',
  'src/lib/baseball/nav-manifest.ts',
  'src/lib/supabase/middleware.ts',
  'src/hooks/use-route-protection.ts',
];

function isModuleOwned(repoRelative: string): boolean {
  const normalised = repoRelative.split(sep).join('/');
  return MODULE_OWNED_PATHS.some((owned) => normalised.startsWith(owned));
}

const LINK_RE =
  /(?:href|router\.(?:push|replace|prefetch)\(|redirect\(|permanentRedirect\()\s*[=(]?\s*["'`](\/[^"'`\s${]*)["'`]/g;

function collectSourceFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'test') {
        continue;
      }
      collectSourceFiles(p, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(p);
    }
  }
}

/**
 * Symbols whose presence in a file means the module gate was consulted there.
 * A comment naming one counts, deliberately: a component that receives its
 * gate decision as a PROP (CalendarFairway, whose `recruitingEmpty` comes from
 * resolveCalendarEmptyState in the page above it) has no other way to point at
 * the gate, and "say which gate governs this link" is the behaviour worth
 * enforcing.
 */
const GATE_SYMBOLS: readonly string[] = [
  'isRecruitingEnabled',
  'isModuleEnabled',
  'isPathnameModuleDisabled',
  'isHubDisabled',
  'isNavKeyDisabled',
  'showRecruitingActivationPrompt',
  'resolveCalendarEmptyState',
  'resolvePrivateProfileDisclosure',
  'resolveBaseballLandingCopy',
];

function consultsModuleGate(src: string): boolean {
  return GATE_SYMBOLS.some((symbol) => src.includes(symbol));
}

interface Leak {
  href: string;
  module: string;
  site: string;
}

function findInboundLeaks(files: string[]): Leak[] {
  const leaks: Leak[] = [];
  for (const file of files) {
    const repoRelative = relative(ROOT, file);
    if (isModuleOwned(repoRelative)) continue;

    const src = readFileSync(file, 'utf8');
    if (consultsModuleGate(src)) continue;

    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(src)) !== null) {
      const captured = m[1];
      if (!captured) continue;
      const href = captured.split('?')[0]?.split('#')[0]?.replace(/\/$/, '') || '/';
      if (!isPathnameModuleDisabled(href)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      leaks.push({
        href,
        module: moduleForPathname(href) ?? 'unknown',
        site: `${repoRelative}:${line}`,
      });
    }
  }
  return leaks;
}

describe('inbound links to disabled modules', () => {
  it('detects a link into a disabled module (non-vacuity)', () => {
    // Proves the predicate can say yes. Without it, a registry change that
    // emptied MODULE_ROUTE_PREFIXES would make the sweep below pass by
    // checking nothing — the same failure the /activate omission was.
    expect(isPathnameModuleDisabled('/baseball/dashboard/discover')).toBe(true);
    expect(isPathnameModuleDisabled('/baseball/dashboard/activate')).toBe(true);
    expect(isPathnameModuleDisabled('/baseball/dashboard/calendar')).toBe(false);
  });

  it('has an ownership allowlist that actually matches files', () => {
    // A typo'd path fragment silently forgives nothing and the test still
    // passes — so assert the allowlist is live, not decorative.
    const files: string[] = [];
    collectSourceFiles(SRC, files);
    const owned = files.filter((f) => isModuleOwned(relative(ROOT, f)));
    expect(owned.length).toBeGreaterThan(10);
  });

  it('no live surface links into a disabled module', () => {
    const files: string[] = [];
    collectSourceFiles(SRC, files);
    expect(files.length).toBeGreaterThan(500);

    const leaks = findInboundLeaks(files);
    expect(
      leaks,
      'A surface outside the module links into it and never consults the module ' +
        'gate. Gate the link at read time (see resolveCalendarEmptyState / ' +
        'showRecruitingActivationPrompt), or — if the file really belongs to the ' +
        'module — add it to MODULE_OWNED_PATHS.\n' +
        leaks.map((l) => `  ${l.site}  →  ${l.href}  [${l.module}]`).join('\n'),
    ).toEqual([]);
  });
});
