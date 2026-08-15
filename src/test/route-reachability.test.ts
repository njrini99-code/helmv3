/**
 * #1264 — every component file must be reachable from an app-router entry point.
 *
 * "Referenced by anything" and "reachable from a route" are different
 * questions, and only the second one tells you whether a user can get there.
 * Five component files (2,808 lines) were reachable from nothing, and four of
 * the five had GREEN TEST SUITES — so every signal a reviewer normally looks
 * at said they were alive. One of them, `GoalCard`, even appeared to be
 * rendered: the `<GoalCard>` in baseball's DevPlanClient is a locally-defined
 * function in that same file, not the component.
 *
 * Knip cannot express this, structurally rather than by configuration: a test
 * importing a component makes it "referenced", so those files showed up only
 * as single lines inside its 205-item "unused exports" and 719-item "unused
 * exported types" lists. That job also runs `|| true` and only weekly, so it
 * can never fail. This check is the opposite: small, deterministic, blocking.
 *
 * The walk:
 *   • seed from every app-router entry point (page/layout/template/error/
 *     loading/not-found/route + middleware);
 *   • follow VALUE imports only — `import type` and `export type` are
 *     deliberately ignored, because a type-only importer makes an orphaned
 *     component look used to every grep. That is exactly how these five hid;
 *   • follow `next/dynamic(() => import('…'))`, which is how the calendar
 *     modal and sheet are loaded;
 *   • then assert nothing under src/components/** is left unvisited.
 *
 * If this fails on a file you have just added, the honest question is not
 * "how do I appease the check" but "can a user actually reach this yet?" —
 * an unreachable component is either work-in-progress that should not be
 * merged, or dead weight.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const ENTRY_BASENAMES = new Set([
  'page',
  'layout',
  'template',
  'error',
  'global-error',
  'loading',
  'not-found',
  'route',
  'default',
]);

const CODE_EXT = ['.ts', '.tsx', '.js', '.jsx'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__snapshots__') continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const isTestFile = (f: string) =>
  /\.(test|spec)\.[jt]sx?$/.test(f) || f.includes(`${'/'}__tests__${'/'}`) || f.includes('/src/test/');

/** Resolve an import specifier to a real file on disk, or null if it is external. */
function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // package import

  for (const ext of CODE_EXT) {
    if (existsSync(base + ext) && statSync(base + ext).isFile()) return base + ext;
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of CODE_EXT) {
      const idx = join(base, 'index' + ext);
      if (existsSync(idx)) return idx;
    }
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  return null;
}

/**
 * VALUE import specifiers only. Strips `import type ...` / `export type ...`
 * statements before matching, so a type-only edge never marks a file reachable.
 */
/**
 * Drop comments before import-matching, preserving string literals.
 *
 * WHY (2026-08-15, the SECOND bug of this family — see the note in
 * valueImports): the matchers below bound a statement with `[^;]*?`, which
 * cannot cross a semicolon. A semicolon inside a COMMENT that sits within a
 * multi-line `export { … } from '…'` block therefore severs that barrel edge,
 * and every component reachable only through that barrel reports as an orphan.
 *
 * That is not hypothetical. During a dead-code pass a tombstone comment ending
 * `…the drill absorbed both);` was added inside the coachhelm export block of
 * fairway/index.ts, and this check reported EIGHT unreachable components —
 * including GenomeCompareView, which genome/compare/page.tsx imports directly.
 * It reads exactly like a real dead-code cascade and is entirely an artifact.
 *
 * Comments BETWEEN statements were always fine; only inside an unterminated one.
 * The alternation keeps quoted strings intact first, so a `//` inside a
 * specifier (or any URL in a string) is never mistaken for a line comment.
 */
function stripComments(source: string): string {
  return source.replace(
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (_match, stringLiteral: string | undefined) => (stringLiteral ? stringLiteral : ' '),
  );
}

function valueImports(rawSource: string): string[] {
  // NOTE: these patterns must tolerate NEWLINES inside a statement. A first cut
  // used `[^;\n]*?`, which silently missed every multi-line
  // `import {\n  A,\n  B,\n} from '...'` — the dominant style in this repo — and
  // the check then reported ~40 genuinely reachable files as orphans.
  // `[^;]*?` allows newlines but still cannot run past the end of a statement —
  // which is why comments must be stripped first (see stripComments).
  const source = stripComments(rawSource);
  const withoutTypeOnly = source
    .replace(/(?:^|\n)\s*import\s+type\b[^;]*?from\s*['"][^'"]*['"];?/g, '')
    .replace(/(?:^|\n)\s*export\s+type\b[^;]*?from\s*['"][^'"]*['"];?/g, '');

  const specs: string[] = [];
  const staticRe = /(?:^|\n)\s*(?:import|export)\b[^;]*?from\s*['"]([^'"]+)['"]/g;
  const sideEffectRe = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const re of [staticRe, sideEffectRe, dynamicRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(withoutTypeOnly)) !== null) {
      if (m[1]) specs.push(m[1]);
    }
  }
  return specs;
}

describe('every component is reachable from a route (#1264)', () => {
  it('has no component file unreachable from any app-router entry point', () => {
    const allFiles = walk(SRC).filter((f) => CODE_EXT.some((e) => f.endsWith(e)));

    const entries = allFiles.filter((f) => {
      if (isTestFile(f)) return false;
      const rel = relative(SRC, f);
      if (rel.startsWith('app/')) {
        const basename = rel.split('/').pop()!.replace(/\.[jt]sx?$/, '');
        return ENTRY_BASENAMES.has(basename);
      }
      return rel === 'middleware.ts' || rel === 'instrumentation.ts';
    });

    expect(entries.length, 'found no app-router entry points — the walk is broken').toBeGreaterThan(100);

    const visited = new Set<string>();
    const queue = [...entries];
    while (queue.length) {
      const file = queue.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);
      let source: string;
      try {
        source = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const spec of valueImports(source)) {
        const target = resolveSpecifier(spec, file);
        if (target && !visited.has(target)) queue.push(target);
      }
    }

    // Scoped to the sport/design trees, matching the audit that found the
    // original five. `src/components/ui` is deliberately excluded: it is a
    // shadcn-style primitive library consumed through barrels and re-export
    // shims, where "unreachable" mostly means "primitive nobody happens to use
    // yet" rather than a feature a user cannot get to. Widening this check to
    // cover it is a separate, larger cleanup.
    const SCOPED = ['components/golf/', 'components/fairway/', 'components/baseball/',
                    'components/lifting/', 'components/shared/'];
    const components = allFiles.filter((f) => {
      if (isTestFile(f)) return false;
      // COMPONENTS only (.tsx). A `.ts` module in these trees is a types file
      // or a helper, and a types file is BY DEFINITION never value-reachable —
      // this walk ignores `import type` edges on purpose, so including them
      // would report 5 legitimate type modules as orphans forever.
      //
      // That exclusion is not free, and one real find is recorded here rather
      // than swept up silently: `plan-markdown.ts` (72 lines, untouched since
      // 2026-06-22) exports a genuine VALUE function, `planToMarkdown`, whose
      // only importer is its own test — the same orphan class as the five
      // components, but a helper rather than a component and so outside the
      // scope this check was filed for. Left in place deliberately, not missed.
      if (!f.endsWith('.tsx')) return false;
      const rel = relative(SRC, f);
      return SCOPED.some((d) => rel.startsWith(d));
    });

    const unreachable = components
      .filter((f) => !visited.has(f))
      .map((f) => relative(ROOT, f))
      .sort();

    expect(
      unreachable,
      `These component files cannot be reached from any route. A passing test ` +
        `suite does NOT make a component reachable — four of the five found by ` +
        `this check originally had green suites. Either wire it to a route or ` +
        `delete it.\n` +
        unreachable.map((f) => `  - ${f}`).join('\n'),
    ).toEqual([]);
  });
});
