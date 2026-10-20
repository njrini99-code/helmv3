import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorsOf, blankCode, checkLinks, extractLinks, slugify } from '../links.mjs';

const files = {
  'docs/clubhouse/a.md': '# A\n\n## Same name\n\n## Same name\n\nSee [b](b.md#the-heading-v2) and [self](#same-name-1) and [pic](../../design/x%20y.png).\n',
  'docs/clubhouse/b.md': '# B\n\n## The heading (v2)\n\n## `code` and **bold**\n',
};
const present = new Set(['design/x y.png', 'src/clubhouse']);
const exists = (p) => present.has(p) || p in files;
const run = (f) => checkLinks({ files: f, exists, read: (p) => files[p] });

test('slugs and anchors follow GitHub, with repeated headings numbered', () => {
  assert.equal(slugify('The heading (v2)'), 'the-heading-v2');
  assert.equal(slugify('`code` and **bold**'), 'code-and-bold');
  assert.deepEqual([...anchorsOf(files['docs/clubhouse/a.md'])], ['a', 'same-name', 'same-name-1']);
});

test('code spans and fenced code are not links', () => {
  const md = 'A `[x](nope.md)` here\n\n```md\n[y](nope2.md)\n```\n\n[real](real.md)\n';
  assert.equal(blankCode(md).split('\n').length, md.split('\n').length);
  assert.deepEqual(extractLinks(md), [{ target: 'real.md', line: 7 }]);
});

test('resolving links pass: relative, encoded, fragments, directories, external and site routes', () => {
  assert.deepEqual(run(files), []);
  const ok = { 'docs/clubhouse/c.md': '[w](https://x.dev) [m](mailto:a@b.c) [r](/golf/dashboard) [d](../../src/clubhouse) [t](b.md "title")' };
  assert.deepEqual(run({ ...files, ...ok }), []);
});

test('a missing file, a missing heading and a link out of the repo are each reported with file and line', () => {
  const bad = { 'docs/clubhouse/d.md': 'x\n[a](gone.md)\n[b](b.md#nope)\n[c](#nope-here)\n[d](../../../outside.md)\n' };
  const v = run({ ...files, ...bad });
  assert.equal(v.length, 4);
  assert.match(v[0], /d\.md:2 .*gone\.md is missing/);
  assert.match(v[1], /d\.md:3 .*no heading "#nope"/);
  assert.match(v[2], /d\.md:4 .*no heading "#nope-here"/);
  assert.match(v[3], /d\.md:5 .*leaves the repository/);
});
