import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBlock, contrast, parseColour, readTokens, renderTokenTables } from '../design-language.mjs';

const css = `
[data-ui='clubhouse'] {
  --ch-workspace: #e8e3d5;
  --ch-card-bg: #faf7ef;
  --ch-bg-surface: var(--ch-card-bg);
  --ch-text-primary: var(--ch-ink-900);
  --ch-ink-900: #1c1b18;
  --ch-card-ring: rgb(28 25 18 / 0.08);
  --ch-elevation-card: 0 0 0 1px var(--ch-card-ring);
  --ch-radius-card: 16px;
  --ch-type-meta: 400 calc(14 * var(--ch-type-k))/calc(20 * var(--ch-type-k)) var(--ch-font-sans);
}
html[data-fw-theme='dark'] [data-ui='clubhouse'] {
  --ch-workspace: #131814;
  --ch-card-bg: #212722;
  --ch-ink-900: #f1ecdf;
}
@media (max-width: 820px) { [data-ui='clubhouse'] { --ch-card-bg: #ffffff; } }
`;

test('reads only the light and dark roots, never a media block', () => {
  const t = readTokens(css);
  assert.equal(t.light.get('--ch-card-bg'), '#faf7ef');
  assert.equal(t.dark.get('--ch-card-bg'), '#212722');
});

test('parses hex and rgb() colours and composites alpha in a contrast ratio', () => {
  assert.deepEqual(parseColour('#fff'), [255, 255, 255, 1]);
  assert.deepEqual(parseColour('rgb(28 25 18 / 0.08)'), [28, 25, 18, 0.08]);
  assert.equal(parseColour('linear-gradient(red, blue)'), undefined);
  assert.ok(Math.abs(contrast([0, 0, 0, 1], [255, 255, 255, 1]) - 21) < 0.01);
  assert.ok(contrast([28, 25, 18, 0.08], [250, 247, 239, 1]) < 1.3);
});

test('tables resolve aliases per theme and measure the card on the page', () => {
  const md = renderTokenTables(css);
  assert.match(md, /\| `--ch-card-bg` \| `#faf7ef` \| `#212722` \|.*\| 1\.20 \| 1\.18 \|/);
  assert.match(md, /\| `--ch-text-primary` \| `#1c1b18` \| `#f1ecdf` \|/);
  assert.match(md, /`--ch-elevation-card` \| `0 0 0 1px rgb\(28 25 18 \/ 0\.08\)`/);
  assert.match(md, /\| Meta, notes, subtitles \(15 on phone\) \| `--ch-type-meta` \| 400 \| 14 \/ 20 \|/);
  assert.doesNotMatch(md, /#ffffff/);
});

test('replaces only the block between the markers, and refuses a doc without them', () => {
  const doc = 'before\n<!-- AUTOGEN:clubhouse-design-tokens:start (node scripts/clubhouse/design-language.mjs; do not edit inside) -->\nold\n<!-- AUTOGEN:clubhouse-design-tokens:end -->\nafter\n';
  const next = applyBlock(doc, 'new');
  assert.equal(next, doc.replace('\nold\n', '\nnew\n'));
  assert.throws(() => applyBlock('no markers', 'x'));
});
