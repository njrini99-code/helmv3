import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * A14 (D-70): navigation is silent, as on iOS. No `<Link>` in Clubhouse ticks `haptic('select')`, nor any element that takes
 * an `href` (a LedgerRow, a Button drawn as a link, a plain `<a>`), nor a handler that ticks and then calls `router.push`; a
 * primary action may tick 'press'. The `<Link>` scan is line-based, from each `<Link` to the end of its opening tag, so an
 * `=>` inside a handler does not end the tag early; the href scan reads the syntax tree. The ESLint rule in
 * eslint.config.mjs's Clubhouse block says the same at the editor.
 */

const ROOT = join(process.cwd(), 'src/clubhouse');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : files(p);
    return p.endsWith('.tsx') ? [p] : [];
  });

/** Each `<Link` opening tag's text: its lines up to the first line that closes the tag (a `>` not preceded by `=`). */
function linkTags(src: string): Array<{ line: number; text: string }> {
  const lines = src.split('\n');
  const out: Array<{ line: number; text: string }> = [];
  lines.forEach((l, i) => {
    const at = l.indexOf('<Link');
    if (at < 0 || /<Link[A-Za-z]/.test(l.slice(at))) return;
    const parts: string[] = [];
    for (let j = i; j < Math.min(lines.length, i + 12); j++) {
      const seg = j === i ? lines[j]!.slice(at) : lines[j]!;
      parts.push(seg);
      if (/(^|[^=])>\s*($|[^=])/.test(seg.replace(/=>/g, '  '))) break;
    }
    out.push({ line: i + 1, text: parts.join('\n') });
  });
  return out;
}

/** Every JSX element that takes an `href` and ticks `haptic('select')` in one of its own attributes, as `file:line`. Read
 * from the syntax tree: a row's attributes run over many lines and hold JSX of their own, which a line scan misreads. */
function loudHrefElements(file: string): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
      const href = attrs.some((a) => a.name.getText(src) === 'href');
      if (href && attrs.some((a) => /haptic\('select'\)/.test(a.initializer?.getText(src) ?? ''))) {
        out.push(`${file.slice(ROOT.length + 1)}:${src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

describe('navigation links are silent (A14)', () => {
  it("no <Link> calls haptic('select')", () => {
    const loud = files(ROOT).flatMap((f) =>
      linkTags(readFileSync(f, 'utf8'))
        .filter((t) => /haptic\('select'\)/.test(t.text))
        .map((t) => `${f.slice(ROOT.length + 1)}:${t.line}`),
    );
    expect(loud).toEqual([]);
  });

  it("no element that takes an href (a row, a Button link, an <a>) calls haptic('select')", () => {
    expect(files(ROOT).flatMap(loudHrefElements)).toEqual([]);
  });

  it("no handler ticks haptic('select') and then pushes a route", () => {
    const loud = files(ROOT).flatMap((f) => {
      const lines = readFileSync(f, 'utf8').split('\n');
      return lines.flatMap((l, i) =>
        /haptic\('select'\)/.test(l) && lines.slice(i, i + 4).some((n) => /\brouter\.push\(/.test(n)) ? [`${f.slice(ROOT.length + 1)}:${i + 1}`] : [],
      );
    });
    expect(loud).toEqual([]);
  });

  it("the primary links keep their 'press'", () => {
    const src = readFileSync(join(ROOT, 'screens/rounds/parts.tsx'), 'utf8');
    expect(linkTags(src).some((t) => /haptic\('press'\)/.test(t.text))).toBe(true);
  });
});
