/**
 * Golf render-path bans, as a ratchet (design-direction §5.2 and Phase 2 lint
 * bans; ledger DS-10, DS-14, DS-15).
 *
 * Why a ratchet and not an ESLint rule: `npm run lint` runs with
 * `--max-warnings 0` over all of `src`, and every pattern below has existing
 * offenders, so a warn-level rule would fail Lint on every PR. This test
 * counts each pattern per file and fails only when a file's count goes UP or
 * a new file starts using a banned pattern. Existing debt can be paid down
 * file by file; lower the baseline when you do:
 *
 *   UPDATE_GOLF_RENDER_BANS=1 npm run test:file -- src/test/golf/golf-render-bans.test.ts
 *
 * Only rewrite the baseline to LOWER counts (after migrating call sites).
 * Raising a count to get green is weakening the test.
 *
 * The replacements each ban points at:
 *   toFixed          → formatMetric / MetricValue (src/lib/golf/metrics/display-registry.ts)
 *   fontMono         → font-fw-sans tabular-nums (Fragment Mono is gone)
 *   transitionAll    → transition-[specific properties] with the motion tokens
 *   rawReducedMotion → useReducedMotionGuard (src/lib/coachhelm/v3/motion.ts)
 *   rawTriggerHaptic → fwHaptic (src/lib/fairway/haptics.ts)
 *   activeScale      → Pressable (controls/press-target.tsx, fwPress 0.97)
 *   retiredImport    → the §5 replacement component (design-direction §5.1)
 *   eyebrow          → a plain heading; at most one eyebrow per screen (TYPE-03)
 *   rawRadius        → the Fairway ramp: rounded-fw-sm / fw-md / card / fw-lg / full (DS-R1)
 *
 * Arbitrary `text-[Npx]` is already enforced by the `helm/no-arbitrary-text-px`
 * ESLint rule, so it is not repeated here.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../..');
const BASELINE_PATH = resolve(__dirname, 'golf-render-bans.baseline.json');

/** Golf render paths: route files and the Fairway/golf component trees. */
const SCAN_DIRS = ['src/app/golf', 'src/components/fairway', 'src/components/golf'];

const RETIRED = [
  'Bento',
  'BentoCell',
  'MetricCard',
  'StatTile',
  'InstrumentPanel',
  'InstrumentCluster',
  'GlassSurface',
  'HubInsightSignalCard',
  'StandingStrip',
  'StandingTrack',
  'Dial',
  'RadialGauge',
  'RingGauge',
  'GenomeRadar',
  'DivergingBars',
  'StrokesGainedTornado',
  'GenomeFingerprint',
  'Ribbon',
  'EkgSparkline',
  'TrendChip',
  'Spine',
  'SpineLedger',
  'PlayerSpine',
  'SignalChip',
  'TickerStrip',
  'RxCard',
  'FairwayHubSubNav',
  'MoreNavSheet',
];
const RETIRED_SET = new Set(RETIRED);
const RETIRED_PATH = new RegExp(`/(${[...RETIRED, 'glass-surface'].join('|')})(\\.tsx?)?$`);

/** Retired components are banned under the golf routes and Fairway pages only. */
const RETIRED_SCOPE = ['src/app/golf/', 'src/components/fairway/pages/'];

type RuleId =
  | 'toFixed'
  | 'fontMono'
  | 'transitionAll'
  | 'rawReducedMotion'
  | 'rawTriggerHaptic'
  | 'activeScale'
  | 'retiredImport'
  | 'eyebrow'
  | 'rawRadius';

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
}

function countMatches(code: string, re: RegExp): number {
  return code.match(re)?.length ?? 0;
}

function countRetiredImports(code: string): number {
  let n = 0;
  const importRe = /import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(importRe)) {
    if (m[1]) continue; // type-only imports render nothing
    const clause = m[2] ?? '';
    const spec = m[3] ?? '';
    if (RETIRED_PATH.test(spec)) {
      n++;
      continue;
    }
    const named = clause.match(/\{([\s\S]*)\}/)?.[1];
    if (!named) continue;
    for (const part of named.split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim();
      if (name && RETIRED_SET.has(name) && !part.trim().startsWith('type ')) n++;
    }
  }
  return n;
}

const RULES: Record<RuleId, (code: string, rel: string) => number> = {
  toFixed: (code) => countMatches(code, /\.toFixed\(/g),
  fontMono: (code) => countMatches(code, /\bfont-(fw-)?mono\b/g),
  transitionAll: (code) => countMatches(code, /\btransition-all\b/g),
  rawReducedMotion: (code) => countMatches(code, /\buseReducedMotion\s*\(/g),
  rawTriggerHaptic: (code) => countMatches(code, /\btriggerHaptic\s*\(/g),
  activeScale: (code) => countMatches(code, /\bactive:scale-/g),
  retiredImport: (code, rel) => (RETIRED_SCOPE.some((p) => rel.startsWith(p)) ? countRetiredImports(code) : 0),
  eyebrow: (code) => countMatches(code, /\btext-eyebrow(?![\w-])/g),
  // The calendar tree also renders in Baseball and keeps the legacy scale.
  rawRadius: (code, rel) =>
    rel.startsWith('src/components/golf/calendar/')
      ? 0
      : countMatches(code, /\brounded(?:-[trblse]{1,2})?-(?:sm|md|lg|xl|2xl|3xl|\[[^\]]+\])(?![\w-])/g),
};

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec|stories)\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
}

type Counts = Record<RuleId, Record<string, number>>;

function census(): Counts {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(resolve(ROOT, d), files);
  const counts = Object.fromEntries(Object.keys(RULES).map((k) => [k, {}])) as Counts;
  for (const abs of files.sort()) {
    const rel = relative(ROOT, abs).split('\\').join('/');
    const code = stripComments(readFileSync(abs, 'utf8'));
    for (const [rule, fn] of Object.entries(RULES) as Array<[RuleId, (c: string, r: string) => number]>) {
      const n = fn(code, rel);
      if (n > 0) counts[rule][rel] = n;
    }
  }
  return counts;
}

const current = census();

if (process.env.UPDATE_GOLF_RENDER_BANS === '1') {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
}

const baseline: Counts = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

describe('golf render-path bans (ratchet)', () => {
  it.each(Object.keys(RULES) as RuleId[])('%s: no file exceeds its baseline count', (rule) => {
    const allowed = baseline[rule] ?? {};
    const regressions = Object.entries(current[rule])
      .filter(([file, n]) => n > (allowed[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} (baseline ${allowed[file] ?? 0})`);
    expect(regressions, `New ${rule} uses; see the header of this test for the replacement`).toEqual([]);
  });

  it('the retired-import matcher sees named, path and aliased imports but not type-only ones', () => {
    expect(countRetiredImports(`import { Bento, BentoCell } from '@/components/fairway/modules';`)).toBe(2);
    expect(countRetiredImports(`import { Dial as D } from '@/components/fairway/charts';`)).toBe(1);
    expect(countRetiredImports(`import { EkgSparkline } from '@/components/fairway/charts/EkgSparkline';`)).toBe(1);
    expect(countRetiredImports(`import type { TrendChip } from 'x';`)).toBe(0);
    expect(countRetiredImports(`import { type TrendChip, Surface } from 'x';`)).toBe(0);
    expect(countRetiredImports(`import { Surface } from '@/components/fairway/surfaces/surface';`)).toBe(0);
  });

  it('the scanners ignore comments and the guarded hook name', () => {
    expect(RULES.toFixed(stripComments('// n.toFixed(1)\nconst a = 1;'), 'x')).toBe(0);
    expect(RULES.rawReducedMotion('const r = useReducedMotionGuard();', 'x')).toBe(0);
    expect(RULES.rawReducedMotion('const r = useReducedMotion();', 'x')).toBe(1);
    expect(RULES.activeScale('className="active:scale-[0.97]"', 'x')).toBe(1);
    expect(RULES.rawRadius('rounded-xl rounded-t-2xl rounded-[18px]', 'x')).toBe(3);
    expect(RULES.rawRadius('rounded-fw-md rounded-card rounded-full rounded-lg-x', 'x')).toBe(0);
    expect(RULES.rawRadius('rounded-xl', 'src/components/golf/calendar/A.tsx')).toBe(0);
    expect(RULES.eyebrow('text-eyebrow text-eyebrow-x', 'x')).toBe(1);
  });
});
