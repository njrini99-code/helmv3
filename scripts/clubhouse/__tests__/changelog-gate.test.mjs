import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkChangelogs, implementationPaths, isTestFile, pagesTouched } from '../changelog-gate.mjs';

const messages = {
  id: 'P007',
  name: 'Messages',
  slug: 'messages',
  implementation: {
    root: 'src/clubhouse/screens/messages',
    loader: 'src/clubhouse/data/messages.ts',
    route: 'src/clubhouse/routes/messages.tsx',
    styles: 'src/clubhouse/styles/messages.css',
    tests: ['src/clubhouse/__tests__/messages.test.tsx'],
  },
  actions: [{ component: 'src/clubhouse/screens/messages/MessagesView.tsx#Composer' }, { component: 'src/clubhouse/screens/other/Extra.tsx#X' }],
};
const home = { id: 'P002', name: 'Home', slug: 'home', implementation: { root: 'src/clubhouse/screens/home', loader: null, route: null, styles: 'src/clubhouse/styles/home.css' } };
const LOG = 'docs/clubhouse/pages/P007-messages/CHANGELOG.md';

test('implementation paths: root, loader, route, styles and action component files, never tests', () => {
  const paths = implementationPaths(messages);
  assert.ok(paths.includes('src/clubhouse/screens/messages'));
  assert.ok(paths.includes('src/clubhouse/screens/other/Extra.tsx'), 'an action component only this page names is owned');
  assert.ok(!paths.some((p) => p.includes('__tests__') || p.includes('#')));
});

test('a component file two pages name is shared and belongs to neither', () => {
  const a = { id: 'P011', name: 'Rounds', slug: 'rounds', implementation: { root: 'src/clubhouse/screens/rounds' }, actions: [{ component: 'src/clubhouse/ui/Notices.tsx#Retry' }, { component: 'src/app/golf/(dashboard)/dashboard/rounds/page.tsx#Page' }] };
  const b = { id: 'P012', name: 'Classes', slug: 'classes', implementation: { root: 'src/clubhouse/screens/classes' }, actions: [{ component: 'src/clubhouse/ui/Notices.tsx#Retry' }] };
  assert.equal(pagesTouched([a, b], ['src/clubhouse/ui/Notices.tsx']).size, 0);
  assert.deepEqual([...pagesTouched([a, b], ['src/app/golf/(dashboard)/dashboard/rounds/page.tsx']).keys()], ['P011']);
});

test('test files never trigger the gate', () => {
  for (const f of ['src/clubhouse/screens/messages/__tests__/x.tsx', 'src/clubhouse/screens/messages/a.test.tsx', 'src/clubhouse/screens/messages/a.spec.ts']) assert.ok(isTestFile(f), f);
  assert.ok(!isTestFile('src/clubhouse/screens/messages/Composer.tsx'));
  assert.equal(pagesTouched([messages], ['src/clubhouse/screens/messages/a.test.tsx']).size, 0);
});

test('a changed implementation file without its CHANGELOG names the page and the files', () => {
  const v = checkChangelogs([messages, home], ['src/clubhouse/styles/messages.css', 'src/clubhouse/screens/messages/MessagesView.tsx', 'README.md'], 'origin/main (abc1234)');
  assert.equal(v.length, 1);
  assert.match(v[0], /P007 Messages/);
  assert.match(v[0], /messages\.css/);
  assert.match(v[0], /MessagesView\.tsx/);
  assert.ok(v[0].includes(LOG));
});

test('the page CHANGELOG changing in the same diff satisfies the gate', () => {
  assert.deepEqual(checkChangelogs([messages], ['src/clubhouse/data/messages.ts', LOG], 'base'), []);
});

test("another page's CHANGELOG does not satisfy it, and a path prefix is not a match", () => {
  const other = 'docs/clubhouse/pages/P002-home/CHANGELOG.md';
  assert.equal(checkChangelogs([messages, home], ['src/clubhouse/routes/messages.tsx', other], 'base').length, 1);
  assert.equal(pagesTouched([messages], ['src/clubhouse/screens/messages-archive/x.tsx']).size, 0);
});

test('files outside every page, docs and many files report once with a count', () => {
  assert.deepEqual(checkChangelogs([messages], ['src/clubhouse/lib/haptics.ts', 'docs/clubhouse/PROGRESS.md'], 'base'), []);
  const many = Array.from({ length: 8 }, (_, i) => `src/clubhouse/screens/messages/F${i}.tsx`);
  const v = checkChangelogs([messages], many, 'base');
  assert.equal(v.length, 1);
  assert.match(v[0], /\+3 more/);
});
