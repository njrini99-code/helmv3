import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ROOT, walk } from './_scan';

/**
 * CONS-3: an action on its way is `busy`, never only `disabled`. A Button whose label turns to "…ing…" while it runs
 * also says busy, so it keeps its width and its light, sets aria-busy and takes no second press (ui/Button.tsx).
 */
function inFlightWithoutBusy(): string[] {
  const bad: string[] = [];
  for (const file of walk(ROOT, /\.tsx$/).filter((f) => !f.includes('__tests__'))) {
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(src) === 'Button') {
        const label = node.children.map((c) => c.getText(src)).join('');
        const props = node.openingElement.attributes.properties.filter(ts.isJsxAttribute).map((p) => p.name.getText(src));
        if (/ing…/.test(label) && !props.includes('busy')) {
          bad.push(`${relative(ROOT, file)}:${src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
  return bad;
}

describe('in flight is busy (CONS-3)', () => {
  it('a Button whose label becomes "…ing…" also says busy', () => {
    expect(inFlightWithoutBusy()).toEqual([]);
  });
});
