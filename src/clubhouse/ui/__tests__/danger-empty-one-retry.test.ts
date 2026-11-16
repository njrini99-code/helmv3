import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GAP-S-06: one recovery action per failure. A danger EmptyState (CH-1211) brings PageRetry, its own Try again that
 * re-runs the page in place, so an `action` or `secondaryAction` that says "Try again" is a second one (Practice's old
 * FAILED sent it to Practice home). This reads every Clubhouse and golf route source for a `<EmptyState … tone="danger"
 * …>` whose own attributes hold "Try again".
 */
const ROOTS = ['src/clubhouse', 'src/app/golf'];

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') files(p, out);
    } else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** The `action` and `secondaryAction` values among `attrs` (the body may say "try again" in words; only a control counts). */
function actions(attrs: string): string {
  let out = '';
  for (const m of attrs.matchAll(/\b(?:secondaryAction|action)=\{/g)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    for (; i < attrs.length && depth > 0; i++) depth += attrs[i] === '{' ? 1 : attrs[i] === '}' ? -1 : 0;
    out += attrs.slice(m.index! + m[0].length, i - 1);
  }
  return out;
}

/** The attributes of the JSX element that opens at `from` (just past its tag name): up to its `>` or `/>` at depth 0. */
function attributes(src: string, from: number): string {
  let depth = 0;
  let quote = '';
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = '';
    } else if (depth > 0 && (c === '"' || c === "'" || c === '`')) quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0 && c === '>') return src.slice(from, i);
  }
  return src.slice(from);
}

describe('GAP-S-06 · a danger EmptyState has one Try again, its own', () => {
  it('no source hands a danger EmptyState a second Try again', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of files(join(process.cwd(), root))) {
        const src = readFileSync(file, 'utf8');
        for (let at = src.indexOf('<EmptyState'); at > -1; at = src.indexOf('<EmptyState', at + 1)) {
          const attrs = attributes(src, at + '<EmptyState'.length);
          if (/tone="danger"/.test(attrs) && /Try again/i.test(actions(attrs))) offenders.push(`${file.slice(process.cwd().length + 1)}:${src.slice(0, at).split('\n').length}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the reader finds an offender when there is one (the check can fail)', () => {
    const src = '<EmptyState size="page" tone="danger" title="x" action={<Button href="/a">Try again</Button>} />';
    expect(/Try again/i.test(actions(attributes(src, '<EmptyState'.length)))).toBe(true);
    const fine = '<EmptyState size="page" tone="danger" title="x" body="Try again in a moment." /><p>Try again</p>';
    expect(/Try again/i.test(actions(attributes(fine, '<EmptyState'.length)))).toBe(false);
  });
});
