import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect, checkTokenRefs } from '../token-refs.mjs';

const files = {
  'src/clubhouse/styles/tokens.css': `[data-ui='clubhouse'] { --ch-card-bg: #faf7ef; --ch-text-on-accent: #fff; }`,
  'src/clubhouse/styles/page.css': [
    '.a { background: var(--ch-card-bg); }',
    '.b { color: var(--ch-on-accent); }',
    '.c { gap: var(--ch-x-gap, 8px); }',
    '.d { width: var(--ch-modal-w); height: var(--ch-sun-x); }',
    '/* var(--ch-in-a-comment) */',
    '.e { bottom: var(--ch-ms-comp-h, 54px); }',
  ].join('\n'),
  'src/clubhouse/ui/Modal.tsx': `const s = { ['--ch-modal-w' as string]: '4px' }; el.style.setProperty(\`--ch-sun-\${k}\`, v);`,
  'src/clubhouse/screens/messages/inset.ts': `export const VAR = '--ch-ms-comp-h';`,
};

test('a reference with no fallback to an undefined name fails, with its line', () => {
  const { violations } = checkTokenRefs(collect(files), ['--ch-x-gap']);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /page\.css:2: var\(--ch-on-accent\)/);
});

test('names set from modules, constants and template prefixes count as defined; comments are not read', () => {
  const c = collect(files);
  assert.ok(c.defined.has('--ch-modal-w'));
  assert.ok(c.defined.has('--ch-ms-comp-h'));
  assert.ok(c.prefixes.has('--ch-sun-'));
  assert.ok(!c.refs.some((r) => r.name === '--ch-in-a-comment'));
});

test('a fallback-only hook nothing sets must be in the baseline, and the baseline may only shrink', () => {
  const c = collect(files);
  assert.ok(checkTokenRefs(c, []).violations.some((v) => /--ch-x-gap, …\) names a custom property nothing sets/.test(v)));
  assert.ok(checkTokenRefs(c, ['--ch-x-gap', '--ch-gone']).violations.some((v) => /--ch-gone no longer needs an entry/.test(v)));
});
