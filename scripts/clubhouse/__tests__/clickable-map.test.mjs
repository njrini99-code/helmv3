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
  assert.match(a, /^- 5 `button` "Save plan" \(button, onClick\) CH-9001$/m);
});

test('checkClickableMap: clean when the map matches the code, a violation when a control is added', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { checkClickableMap, OUT } = await import('../clickable-map.mjs');
  const root = mkdtempSync(join(tmpdir(), 'ch-clickables-'));
  mkdirSync(join(root, 'config/clubhouse/pages'), { recursive: true });
  writeFileSync(join(root, 'config/clubhouse/pages/P001-shell.json'), JSON.stringify({ id: 'P001', slug: 'shell', title: 'Shell', files: ['src/clubhouse/shell/'] }));
  mkdirSync(join(root, 'src/clubhouse/shell'), { recursive: true });
  writeFileSync(join(root, 'src/clubhouse/shell/A.tsx'), 'export const A = () => <button onClick={() => {}}>Save</button>;\n');
  mkdirSync(join(root, 'docs/clubhouse/generated'), { recursive: true });
  assert.equal(checkClickableMap(root).length, 1, 'a missing map is stale');
  const { buildMap, loadManifests } = await import('../clickable-map.mjs');
  const { readFileSync } = await import('node:fs');
  writeFileSync(join(root, OUT), buildMap({ files: { 'src/clubhouse/shell/A.tsx': readFileSync(join(root, 'src/clubhouse/shell/A.tsx'), 'utf8') }, manifests: loadManifests(root) }));
  assert.deepEqual(checkClickableMap(root), []);
  writeFileSync(join(root, 'src/clubhouse/shell/B.tsx'), 'export const B = () => <button onClick={() => {}}>Send</button>;\n');
  assert.match(checkClickableMap(root)[0], /is stale/);
});
