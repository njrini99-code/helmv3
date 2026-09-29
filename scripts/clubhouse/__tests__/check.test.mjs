import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSource, checkProgress } from '../check.mjs';

test('flags Fairway imports and tokens', () => {
  const v = checkSource('src/clubhouse/x.tsx', "import { Button } from '@/components/fairway/controls';\nconst s = { color: 'var(--fw-ink)' };");
  assert.ok(v.some((x) => x.includes('Fairway UI')));
  assert.ok(v.some((x) => x.includes('non-Clubhouse custom property')));
});

test('flags unscoped CSS selectors and literal durations', () => {
  const v = checkSource('src/clubhouse/a.css', '.button{transition:opacity 200ms}\n.ch-ok{color:var(--ch-ink-900)}');
  assert.ok(v.some((x) => x.includes('unscoped selector ".button"')));
  assert.ok(v.some((x) => x.includes('literal duration')));
  assert.equal(v.filter((x) => x.includes('.ch-ok')).length, 0);
});

test('red is allowed for under par only', () => {
  assert.equal(checkSource('src/clubhouse/a.css', '.ch-topar.is-under{color:var(--ch-score-under)}').length, 0);
  assert.equal(checkSource('src/clubhouse/a.css', '.ch-badge{color:var(--ch-score-under)}').length, 1);
});

test('flags emoji, exclamation copy, staggers and uppercase', () => {
  const src = "const a = <p>Great round!</p>;\nconst b = 'Nice \u{1F3CC}';\nconst t = { staggerChildren: 0.1 };\nconst c = <span className=\"uppercase\" />;";
  const v = checkSource('src/clubhouse/b.tsx', src);
  for (const want of ['exclamation', 'emoji', 'staggers', 'uppercase']) assert.ok(v.some((x) => x.includes(want)), want);
});

test('ignores comments and non-null assertions', () => {
  const src = '// Wow! uppercase stagger\nconst x = foo!.bar;\nif (a !== b) run();';
  assert.deepEqual(checkSource('src/clubhouse/c.ts', src), []);
});

test('flags off-scale durations', () => {
  const v = checkSource('src/clubhouse/d.tsx', 'const t = { duration: 0.5 };\nconst ok = { duration: 0.22 };');
  assert.equal(v.length, 1);
});

const table = (row) =>
  `<!-- clubhouse:screens:start -->\n| Screen | Route | spec | desktop | wired | states | error-tracking | phone-spec | phone | motion | accessibility | performance | verified |\n| --- |\n${row}\n<!-- clubhouse:screens:end -->`;

test('tracker: verified requires every gate done', () => {
  const v = checkProgress(table('| Home | /x | done | done | done | done | done | done | todo | done | done | done | done |'), () => true, ".", () => "Status: approved");
  assert.ok(v.some((x) => x.includes('verified but not every gate')));
});

test('tracker: phone needs an approved phone spec file', () => {
  const v = checkProgress(table('| Home | /x | done | done | done | done | done | done | done | todo | todo | todo | todo |'), () => false);
  assert.ok(v.some((x) => x.includes('home.md is missing')));
});

test('tracker: rejects unknown statuses', () => {
  const v = checkProgress(table('| Home | /x | nearly | todo | todo | todo | todo | todo | todo | todo | todo | todo | todo |'), () => true, ".", () => "Status: approved");
  assert.ok(v.some((x) => x.includes('invalid status')));
});

test('tracker: a done gate needs its checklist section fully checked', () => {
  const md = '## spec\n- [x] a\n## desktop\n- [x] b\n- [ ] c\n';
  const row = '| Home | /x | done | done | todo | todo | todo | todo | todo | todo | todo | todo | todo |';
  const v = checkProgress(table(row), () => true, '.', () => md);
  assert.ok(v.some((x) => x.includes('gate desktop is done but 1 item(s) are unchecked')));
  assert.ok(!v.some((x) => x.includes('gate spec')));
});

test('tracker: a started screen needs a checklist file', () => {
  const row = '| Roster | /x | done | doing | todo | todo | todo | todo | todo | todo | todo | todo | todo |';
  const v = checkProgress(table(row), (p) => !p.includes('screens/'), '.', () => '');
  assert.ok(v.some((x) => x.includes('roster.md is missing')));
});
