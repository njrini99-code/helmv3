import test from 'node:test';
import assert from 'node:assert/strict';
import { controlsIn, pageOf, buildMap } from '../clickable-map.mjs';

const src = `
export function A() {
  return (
    <section data-ch-code="CH-9001">
      <button onClick={go}>Save plan</button>
      <a href="/x" aria-label="Open the plan">icon</a>
      <div role="button" tabIndex={0}>Row</div>
      <Button code="CH-9002" onPress={go}>{label}</Button>
      <span>Not a control</span>
      <input type="checkbox" />
    </section>
  );
}
`;

test('finds each kind of control with its label, reason, line and nearest code', () => {
  const rows = controlsIn(src);
  assert.deepEqual(rows.map((r) => [r.line, r.element, r.label, r.via, r.code]), [
    [5, 'button', 'Save plan', 'button, onClick', 'CH-9001'],
    [6, 'a', 'Open the plan', 'link, href', 'CH-9001'],
    [7, 'div', 'Row', 'role=button', 'CH-9001'],
    [8, 'Button', '(label built at run time)', 'button, onPress', 'CH-9002'],
    [10, 'input', '(no label)', 'type=checkbox', 'CH-9001'],
  ]);
});

test('a file belongs to the page with the longest matching implementation path', () => {
  const manifests = [
    { id: 'P001', name: 'Shell', implementation: { root: 'src/clubhouse/shell' } },
    { id: 'P002', name: 'Home', implementation: { root: 'src/clubhouse/screens/home', also: ['src/clubhouse/shell/nav.ts'] } },
  ];
  assert.equal(pageOf('src/clubhouse/shell/Bell.tsx', manifests).id, 'P001');
  assert.equal(pageOf('src/clubhouse/shell/nav.ts', manifests).id, 'P002');
  assert.equal(pageOf('src/clubhouse/ui/Button.tsx', manifests), null);
  assert.equal(pageOf('src/clubhouse/shellx/A.tsx', manifests), null);
});

test('the map is deterministic and puts unclaimed files last under Shared', () => {
  const manifests = [{ id: 'P001', name: 'Shell', implementation: { root: 'src/clubhouse/shell' } }];
  const files = { 'src/clubhouse/ui/B.tsx': src, 'src/clubhouse/shell/A.tsx': src };
  const a = buildMap({ files, manifests });
  assert.equal(a, buildMap({ files: Object.fromEntries(Object.entries(files).reverse()), manifests }));
  assert.ok(a.indexOf('## P001 Shell') < a.indexOf('## Shared'));
  assert.doesNotMatch(a, /Generated (on|at) /);
});
