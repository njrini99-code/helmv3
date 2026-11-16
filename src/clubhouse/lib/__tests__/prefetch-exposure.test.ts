import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CH_NAV_COACH, CH_NAV_PLAYER, CH_NAV_PRACTICE, CH_NAV_TOURNAMENTS, CH_SETTINGS_ITEM } from '../../shell/nav';
import { fullPrefetchAllowed } from '../prefetch-guard';

/**
 * Prod audit 2026-11-15, PMAC-01: the strip fetched Team Hub whole on every player's first open of the day, and the Hub's loader
 * recorded its top insight as shown (`golf_insight_exposure`, `hub_signal`). No page the nav can fetch ahead of a tap may record what it
 * shows. This walks each nav page's value imports to the delivery functions that record exposure and requires every page that reaches
 * one to be held back by the prefetch guard.
 */

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const DELIVERY = join(SRC, 'app/golf/actions/insight-delivery.ts');
/** The delivery functions that write `golf_insight_exposure` for what they return (`recordExposureForReturned`). */
const RECORDERS = ['getTopInsightForPlayer', 'getInsightsForPlayer', 'getInsightsForCoach', 'getInsightsForCoachWithMeta', 'getRoundTakeawayInsight'];

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

type Decl = { name: string; body: string };

/** A file's top-level declarations (functions, consts, classes), each with its text up to the next one. */
function topLevelDecls(src: string): Decl[] {
  const at = [...src.matchAll(/^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?\s+([\w$]+)|(?:const|let|var|class)\s+([\w$]+))/gm)];
  // Comments name functions they do not call ("the aggregate (getPlayerHubSummaryData) selects no event_id"): they are not code.
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  return at.map((m, i) => ({ name: m[1] ?? m[2] ?? '', body: code(src.slice(m.index ?? 0, at[i + 1]?.index ?? src.length)) }));
}

const memo = new Map<string, Set<string>>();
/** Why a name records: `file#name` → the next step, for the failure message. */
const why = new Map<string, string>();
const rel = (f: string) => f.slice(ROOT.length + 1);

/**
 * The top-level names in `file` whose code reaches a recording delivery function: through what they call in the file, what they import
 * by name, or a module they load. Symbol by symbol, so a page that imports a pure helper from a module that also has a recording loader
 * is not flagged (a module walk flagged Home through Team Hub's task helpers).
 */
function recordingNames(file: string): Set<string> {
  const known = memo.get(file);
  if (known) return known;
  const out = new Set<string>();
  memo.set(file, out); // a cycle reads as "records nothing yet"
  const src = readFileSync(file, 'utf8');
  const seeds = new Set<string>();
  const stmt = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(stmt)) {
    if (m[2]) continue;
    const path = resolveImport(file, m[4] ?? '');
    if (!path || path.includes('/__tests__/')) continue;
    const theirs = path === DELIVERY ? new Set(RECORDERS) : recordingNames(path);
    if (theirs.size === 0) continue;
    const clause = m[3] ?? '';
    const braces = clause.match(/\{([^}]*)\}/);
    for (const raw of braces?.[1]?.split(',') ?? []) {
      const spec = raw.trim();
      if (!spec || spec.startsWith('type ')) continue;
      const [from = '', local] = spec.split(/\s+as\s+/).map((x) => x.trim());
      if (theirs.has(from)) {
        (m[1] === 'export' ? out : seeds).add(local ?? from);
        why.set(`${file}#${local ?? from}`, path === DELIVERY ? `${from} (insight-delivery)` : `${path}#${from}`);
      }
    }
    const outside = clause.replace(/\{[^}]*\}/, '');
    const star = outside.match(/\*\s+as\s+([\w$]+)/);
    if (star?.[1]) seeds.add(star[1]);
    if (m[1] === 'export' && /^\s*\*\s*$/.test(outside)) for (const n of theirs) out.add(n);
    const def = m[1] === 'import' ? outside.match(/^\s*([\w$]+)\s*(,|$)/) : null;
    if (def?.[1] && theirs.has('default')) seeds.add(def[1]);
  }
  const decls = topLevelDecls(src);
  // A module loaded on demand inside a declaration counts for that declaration.
  for (const d of decls) {
    for (const m of d.body.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const path = resolveImport(file, m[1] ?? '');
      if (path && (path === DELIVERY || recordingNames(path).size > 0)) seeds.add(d.name);
    }
  }
  const recording = new Set(seeds);
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of decls) {
      if (recording.has(d.name)) continue;
      const hit = [...recording].find((n) => new RegExp(`(?<![\\w$.])${n.replace(/\$/g, '\\$')}(?![\\w$])`).test(d.body));
      if (hit) {
        recording.add(d.name);
        why.set(`${file}#${d.name}`, `${file}#${hit}`);
        grew = true;
      }
    }
  }
  for (const d of decls) if (recording.has(d.name)) out.add(d.name);
  const defaultName = src.match(/^export\s+default\s+(?:async\s+)?function\s+([\w$]+)/m)?.[1];
  if (defaultName && recording.has(defaultName)) out.add('default');
  return out;
}

/** Whether the page at `entry` reaches a recording delivery function from any of its own declarations. */
function pageRecords(entry: string): boolean {
  return recordingNames(entry).size > 0;
}

/** The path from a page to the recorder, as `file#name` steps. */
function explain(entry: string): string {
  const first = [...recordingNames(entry)][0];
  const steps: string[] = [];
  let at: string | undefined = `${entry}#${first}`;
  while (at && steps.length < 40 && !steps.includes(at)) {
    steps.push(at);
    at = why.get(at);
    if (at?.endsWith('(insight-delivery)')) {
      steps.push(at);
      break;
    }
  }
  return steps.map((x) => (x.startsWith(ROOT) ? rel(x) : x)).join(' → ');
}

const pageFor = (href: string) => {
  const seg = href.replace(/^\/golf\/dashboard\/?/, '');
  return join(SRC, 'app/golf/(dashboard)/dashboard', seg, 'page.tsx');
};

const NAV_HREFS = [...new Set([...CH_NAV_COACH, ...CH_NAV_PLAYER, CH_NAV_PRACTICE, CH_NAV_TOURNAMENTS, CH_SETTINGS_ITEM].map((i) => i.href))];

describe('no page the nav fetches ahead of a tap records exposure (PMAC-01)', () => {
  it('every nav page exists to be walked', () => {
    for (const href of NAV_HREFS) expect(existsSync(pageFor(href)), href).toBe(true);
  });

  it('a nav page whose server render reaches a recording delivery function is held back from full prefetch', () => {
    const leaks = NAV_HREFS.filter((href) => pageRecords(pageFor(href)) && fullPrefetchAllowed(href)).map((href) => `${href}: ${explain(pageFor(href))}`);
    expect(leaks).toEqual([]);
  });

  it('CoachHelm is one of them, and the walk finds it', () => {
    expect(pageRecords(pageFor('/golf/dashboard/coachhelm'))).toBe(true);
  });

  // PMAC-01 found Team Hub recording its top insight on prefetch; DF-P-02 (launch readiness, 15 Nov 2026) found it recorded on every
  // open, for a card no screen draws. The aggregate no longer reads the insight, so Team Hub records nothing and the strip may fetch it.
  it('Team Hub records nothing, so it may be fetched ahead', () => {
    expect(pageRecords(pageFor('/golf/dashboard/team-hub'))).toBe(false);
    expect(fullPrefetchAllowed('/golf/dashboard/team-hub')).toBe(true);
  });

  it('the hub aggregate never reads a CoachHelm insight', () => {
    expect(recordingNames(join(SRC, 'app/golf/actions/player-hub-data.ts')).size).toBe(0);
  });
});
