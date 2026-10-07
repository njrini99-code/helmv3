import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectMaterials} from '../material-inventory.mjs';
test('material inventory preserves media context and separates tokens, resets and exceptions',()=>{
  const rows=inspectMaterials('@media(max-width:820px){.ch-card{box-shadow:var(--ch-elevation-reading);border-radius:16px;background:#fff;filter:none;}}');
  assert.equal(rows.length,4);
  assert.match(rows[0].context, /@media \(max-width:820px\)/);
  assert.equal(rows[0].classification,'token-reference');
  assert.equal(rows[1].classification,'review-material-exception');
  assert.equal(rows[2].rawColor,true);
  assert.equal(rows[3].classification,'structural-or-reset');
});

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectMaterialDeclarations, inspectInlineMaterials, materialInventory, main } from '../material-inventory.mjs';

test('canonical material rows preserve comments, ownership, spatial shapes and focus exceptions', () => {
  const rows = inspectMaterialDeclarations(`/* A chart mark, not a decorative card rail. */
@media (max-width: 820px) {
.ch-chart { border-radius: 50%; background: #fff; }
.ch-input:focus-visible { box-shadow: 0 0 0 2px #155a39; }
}`, 'src/clubhouse/styles/chart.css', { ownership: () => ['P004', 'P005'] });
  assert.equal(rows[0].classification, 'spatial-shape');
  assert.deepEqual(rows[0].pageOwnership, ['P004', 'P005']);
  assert.match(rows[0].context, /@media \(max-width: 820px\)/);
  assert.match(rows[0].comments, /chart mark/);
  assert.equal(rows[2].classification, 'focus-material');
  assert.equal(rows[2].shared, false);
  for (const row of rows) for (const key of ['file', 'line', 'selector', 'context', 'property', 'value', 'roleCandidate', 'classification']) assert.ok(key in row, key);
});
test('token aliases reveal gradients while cyclic and missing aliases remain finite', () => {
  const definitions = new Map([
    ['--ch-face', ['var(--ch-paper)']],
    ['--ch-paper', ['linear-gradient(#fff,#eee)']],
    ['--ch-a', ['var(--ch-b)']], ['--ch-b', ['var(--ch-a)']],
  ]);
  const rows = inspectMaterialDeclarations('.ch-card{background:var(--ch-face);color:var(--ch-a);border-color:var(--ch-missing)}', 'fixture.css', { definitions });
  assert.equal(rows[0].classification, 'semantic-token');
  assert.ok(rows[0].categories.includes('gradient'));
  assert.match(rows[0].resolvedMaterial, /linear-gradient/);
  assert.match(rows[1].resolvedMaterial ?? rows[1].value, /var\(--ch-a\)/);
  assert.equal(rows[2].resolvedMaterial, undefined);
});
test('inline inventory retains separate test and authored illustration classifications', () => {
  const code = 'export const View = () => <path fill="#155a39" />;';
  assert.equal(inspectInlineMaterials(code, 'src/clubhouse/screens/auth/SceneLayers.tsx')[0].classification, 'spatial-illustration');
  assert.equal(inspectInlineMaterials(code, 'src/clubhouse/__tests__/view.test.tsx')[0].classification, 'test-fixture');
  assert.equal(inspectInlineMaterials(code, 'src/clubhouse/screens/stats/Chart.tsx')[0].classification, 'needs-review');
  assert.deepEqual(inspectInlineMaterials('/* #fff */ export const empty = "nothing";', 'example.tsx'), []);
});
test('full inventory reads fresh sources, separates runtime scope and writes requested JSON reproducibly', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'clubhouse-materials-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  for (const folder of ['src/clubhouse/styles', 'src/clubhouse/screens/home', 'src/clubhouse/__tests__', 'src/clubhouse/preview', 'config/clubhouse/pages']) mkdirSync(join(root, folder), { recursive: true });
  writeFileSync(join(root, 'src/clubhouse/styles/tokens.css'), '[data-ui="clubhouse"]{--ch-bg-surface:linear-gradient(#fff,#eee)}');
  writeFileSync(join(root, 'src/clubhouse/styles/home.css'), '.ch-card{background:var(--ch-bg-surface);border-radius:50%}');
  writeFileSync(join(root, 'src/clubhouse/screens/home/Home.tsx'), 'export const Home=()=> <div style={{color:"#155a39"}} />;');
  writeFileSync(join(root, 'src/clubhouse/__tests__/home.test.tsx'), 'export const fixture = "#fff";');
  writeFileSync(join(root, 'src/clubhouse/preview/Preview.tsx'), 'export const preview = "#eee";');
  writeFileSync(join(root, 'config/clubhouse/pages/P002-home.json'), JSON.stringify({ id: 'P002', implementation: { root: 'src/clubhouse/screens/home', styles: 'src/clubhouse/styles/home.css' } }));
  const first = materialInventory(root);
  assert.equal(first.summary.cssFileCount, 2);
  assert.equal(first.summary.total, 6);
  assert.equal(first.summary.runtimeEntries, 4);
  assert.equal(first.summary.testEntries, 1);
  assert.equal(first.summary.previewEntries, 1);
  assert.deepEqual(first, materialInventory(root));
  assert.deepEqual(first.declarations.find((row) => row.file.endsWith('/Home.tsx')).pageOwnership, ['P002']);
  const output = join(root, 'reports/inventory.json');
  main(['--root', root, '--output', output]);
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), first.declarations);
  main(['--root', root, '--output', output, '--summary']);
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), first.summary);
  assert.throws(() => main(['--output']), /incomplete/);
  assert.throws(() => main(['--unknown']), /Unknown/);
});

test('inline object styles include raw shadows and numeric radii without conflating ordinary numbers', () => {
  const rows = inspectInlineMaterials('export const View=()=> <div style={{boxShadow:"0 2px 8px #abc",borderRadius:16,width:16}} />;', 'src/clubhouse/ui/View.tsx');
  assert.equal(rows.length, 2);
  assert.ok(rows[0].categories.includes('shadow'));
  assert.deepEqual(rows[1].categories, ['radius']);
  assert.equal(rows[1].value, '16');
  const quoted = inspectInlineMaterials('export const style={"border-radius":"16px"};', 'src/clubhouse/ui/View.tsx');
  assert.equal(quoted.length, 1);
  assert.equal(quoted[0].value, '16px');
  assert.equal(inspectInlineMaterials('export const View=()=> <div style={{borderRadius:"50%"}} />;', 'src/clubhouse/ui/View.tsx')[0].classification, 'spatial-shape');
});
