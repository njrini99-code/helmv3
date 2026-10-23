import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ROOT, walk } from './_scan';

/**
 * CONS-5: a button's weight follows its role, not its file. "Done" closes a sheet the person finished with, so it is the
 * sheet's one primary action; "Clear filters" and "Clear search" are a way back, never the primary. Read from the JSX
 * itself (a `<Button>` whose only text is the label), so a moved line or a reformatted prop still counts.
 */
type Found = { file: string; label: string; variant: string | null; feel: string | null; before: string };

function buttons(): Found[] {
  const out: Found[] = [];
  for (const file of walk(ROOT, /\.tsx$/)) {
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(src) === 'Button') {
        const label = node.children.map((c) => (ts.isJsxText(c) ? c.getText(src) : '')).join('').trim();
        const prop = node.openingElement.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(src) === 'variant');
        const init = prop && ts.isJsxAttribute(prop) ? prop.initializer : undefined;
        const variant = init && ts.isStringLiteral(init) ? init.text : init ? init.getText(src) : null;
        const feelProp = node.openingElement.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(src) === 'feel');
        const feel = feelProp && ts.isJsxAttribute(feelProp) ? (feelProp.initializer?.getText(src) ?? null) : null;
        // What sits just above the key (its own line, or a comment among its props): where a silenced key says why.
        const at = feelProp ? feelProp.getStart(src) : node.getStart(src);
        const before = src.text.slice(Math.max(0, node.getStart(src) - 160), at);
        out.push({ file: relative(ROOT, file), label, variant, feel, before });
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
  return out;
}

describe('Button weight by role (CONS-5)', () => {
  const all = buttons();

  it('reads the buttons', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it('"Done" is the primary action', () => {
    const done = all.filter((b) => b.label === 'Done' && !b.file.startsWith('preview/'));
    expect(done.length).toBeGreaterThanOrEqual(2);
    expect(done.filter((b) => b.variant !== 'primary')).toEqual([]);
  });

  it('"Clear filters" and "Clear search" are never primary', () => {
    const clear = all.filter((b) => b.label === 'Clear filters' || b.label === 'Clear search');
    expect(clear.length).toBeGreaterThanOrEqual(3);
    expect(clear.filter((b) => b.variant === 'primary')).toEqual([]);
  });

  it('a danger key warns as it is pressed, unless the warning came with its question and it says so (CONS-1)', () => {
    const silenced = all.filter((b) => b.variant === 'danger' && b.feel === '{null}');
    expect(silenced.length).toBeGreaterThan(0);
    expect(silenced.filter((b) => !/The warning came with the question/.test(b.before)).map((b) => `${b.file}: ${b.label}`)).toEqual([]);
  });
});
