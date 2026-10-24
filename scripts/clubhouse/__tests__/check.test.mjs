import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSource, checkProgress, checkCatalog, checkScreens, readRebuiltRoutes, checkServerOnlyImports } from '../check.mjs';

test('flags Fairway imports and tokens', () => {
  const v = checkSource('src/clubhouse/x.tsx', "import { Button } from '@/components/fairway/controls';\nconst s = { color: 'var(--fw-ink)' };");
  assert.ok(v.some((x) => x.includes('Fairway UI')));
  assert.ok(v.some((x) => x.includes('non-Clubhouse custom property')));
});

test('the iOS keyboard height is the one foreign property a phone surface may read', () => {
  assert.equal(checkSource('src/clubhouse/a.css', '.ch-ms-comp{padding-bottom:var(--keyboard-height, 0px)}').length, 0);
  assert.ok(checkSource('src/clubhouse/a.css', '.ch-x{height:var(--keyboard-heights)}').some((x) => x.includes('non-Clubhouse custom property')));
  assert.ok(checkSource('src/clubhouse/a.css', '.ch-x{color:var(--text-primary)}').some((x) => x.includes('non-Clubhouse custom property')));
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

test('a gain or loss tone paints only with the chart gain and loss family (CONS-20)', () => {
  const tone = (css) => checkSource('src/clubhouse/a.css', css).filter((x) => x.includes('CONS-20'));
  // The family, a filled key's ink, neutral keywords and non-colour declarations pass.
  assert.deepEqual(tone('.ch-a.is-gain{color:var(--ch-chart-gain)}'), []);
  assert.deepEqual(tone('.ch-a.is-loss{background:var(--ch-chart-loss-fill);box-shadow:inset 0 0 0 1px rgb(0 0 0 / 0.2)}'), []);
  assert.deepEqual(tone('.ch-a.is-gain{background:var(--ch-chart-gain-fill);color:var(--ch-text-on-accent)}'), []);
  assert.deepEqual(tone('.ch-a.is-gain .ch-b{bottom:50%;--ch-spark:var(--ch-chart-gain);background:none}'), []);
  // Anything else a tone paints with is flagged: another token, a literal, a gradient of either, an ancestor's tone.
  assert.equal(tone('.ch-a.is-gain{color:var(--ch-green-700)}').length, 1);
  assert.equal(tone('.ch-a.is-loss{background-image:linear-gradient(180deg, #c58a2c, #7a4a08)}').length, 1);
  assert.equal(tone('.ch-a.is-gain{background:linear-gradient(90deg, var(--ch-green-400), var(--ch-chart-gain))}').length, 1);
  assert.equal(tone('.ch-a.is-gain .ch-v{color:var(--ch-warning-600)}').length, 1);
  assert.equal(tone(':where(html) .ch-a.is-loss{--ch-tone:var(--ch-champagne-500)}').length, 1);
  // A rule that only excludes the tones (:not(.is-gain)) is not a tone's paint.
  assert.deepEqual(tone('.ch-a:not(.is-gain, .is-loss) .ch-w{color:var(--ch-text-secondary)}'), []);
});

test('flags emoji, exclamation copy, staggers and uppercase', () => {
  const src = "const a = <p>Great round!</p>;\nconst b = 'Nice \u{1F3CC}';\nconst t = { staggerChildren: 0.1 };\nconst c = <span className=\"uppercase\" />;";
  const v = checkSource('src/clubhouse/b.tsx', src);
  for (const want of ['exclamation', 'emoji', 'staggers', 'uppercase']) assert.ok(v.some((x) => x.includes(want)), want);
});

test('ignores comments and non-null assertions', () => {
  const src = '// Wow! uppercase stagger\nconst x = foo!.bar;\nif (a !== b) run();\nconst y = v! < w!;';
  assert.deepEqual(checkSource('src/clubhouse/c.ts', src), []);
});

test('flags durations off the v2 scale (D-64)', () => {
  const v = checkSource('src/clubhouse/d.tsx', 'const t = { duration: 0.5 };\nconst old = { duration: 0.22 };\nconst ok = { duration: 0.26 };\nconst ok2 = { duration: 0.52 };');
  assert.equal(v.length, 2);
});

test('flags the retired motion tokens (D-64)', () => {
  const css = checkSource('src/clubhouse/styles/e.css', '.ch-a { transition: color var(--ch-dur-instant) var(--ch-ease); transform: scale(var(--ch-press-scale)); }');
  assert.equal(css.filter((x) => x.includes('retired motion token')).length, 2);
  assert.ok(checkSource('src/clubhouse/f.tsx', 'const s = CH_PRESS_SCALE;').some((x) => x.includes('retired motion token')));
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

test('12401 72401 catalog: every number is catalogued once, in its block, used and tested', () => {
  const catalogs = {
    'docs/clubhouse/catalog/settings.md': [
      '| CH-8001 | a | b | c | settings.test |',
      '| CH-8002 | a | b | c | settings.test |',
      '| CH-8401 | a | b | c | preview |',
      '| CH-8601 | a | b | c | preview |',
      '| CH-2001 | wrong block | b | c | t |',
      '| CH-8001 | twice | b | c | t |',
    ].join('\n'),
  };
  const sources = { 'src/clubhouse/a.tsx': "code: 'CH-8001'; code: 'CH-8999'" };
  const tests = { 'settings.test.tsx': "it('CH-8001 …')" };
  const v = checkCatalog({ catalogs, sources, tests }).join('\n');
  assert.match(v, /CH-8999 is not in docs\/clubhouse\/catalog/);
  assert.match(v, /CH-2001 is outside the settings block/);
  assert.match(v, /CH-8001 is catalogued twice/);
  assert.match(v, /CH-8002 is catalogued but not used/);
  assert.match(v, /CH-8002 has no test/);
  assert.doesNotMatch(v, /CH-8401/);
  assert.doesNotMatch(v, /CH-8601/);
});

test('catalog: pages after the first eight use a two-digit prefix; an unknown page is flagged', () => {
  const catalogs = {
    'docs/clubhouse/catalog/rounds.md': ['| CH-09001 | a | b | c | rounds.test |', '| CH-09301 | a | b | c | rounds.test |', '| CH-9001 | short | b | c | t |', '| CH-09601 | a | b | c | preview |'].join('\n'),
    'docs/clubhouse/catalog/practice.md': '| CH-13001 | a | b | c | t |',
  };
  const sources = { 'src/clubhouse/r.tsx': "code: 'CH-09001'; code: 'CH-09301'" };
  const tests = { 'rounds.test.tsx': "it('CH-09001 …')" };
  const v = checkCatalog({ catalogs, sources, tests, pages: { rounds: '09' } }).join('\n');
  assert.match(v, /CH-9001 is outside the rounds block \(09xxx\)/);
  assert.match(v, /CH-09301 has no test/);
  assert.doesNotMatch(v, /CH-09001/);
  assert.doesNotMatch(v, /CH-09601/);
  assert.match(v, /no page number for "practice"/);
});

test('screens: ticks match the rebuilt routes, per role', () => {
  const nav = "const SETTINGS_ROUTES = ['/golf/dashboard/settings'];\nexport const CH_REBUILT_ROUTES: Record<ChRole, readonly string[]> = {\n  coach: ['/golf/dashboard', '/golf/dashboard/roster', ...SETTINGS_ROUTES],\n  player: ['/golf/dashboard/calendar'],\n};";
  const rebuilt = readRebuiltRoutes(nav);
  assert.deepEqual([...rebuilt.coach], ['/golf/dashboard', '/golf/dashboard/roster', '/golf/dashboard/settings']);
  const md = [
    '## Coaches',
    '- [x] **Home** `/` — a',
    '- [ ] **Roster** `/roster` — b',
    '- [x] **Travel** `/travel` — c',
    '## Players',
    '- [x] **Calendar** `/calendar` — d',
  ].join('\n');
  const v = checkScreens(md, rebuilt).join('\n');
  assert.match(v, /Roster \(coach\) is rebuilt; tick it/);
  assert.match(v, /Travel \(coach\) is ticked but/);
  assert.match(v, /\/golf\/dashboard\/settings is rebuilt for the coach role but not listed/);
  assert.doesNotMatch(v, /Home|Calendar/);
});

test('a client file may import only types from a server-only module', () => {
  const loader = "import 'server-only';\nexport const LEGS = ['a'];\nexport type ChLeg = string;";
  const bad = checkServerOnlyImports({
    'src/clubhouse/data/stats-team.ts': loader,
    'src/clubhouse/screens/stats/Phone.tsx': "'use client';\nimport { LEGS, type ChLeg } from '../../data/stats-team';",
  });
  assert.equal(bad.length, 1);
  assert.ok(bad[0].includes('imports LEGS from server-only src/clubhouse/data/stats-team.ts'));
  const ok = checkServerOnlyImports({
    'src/clubhouse/data/stats-team.ts': loader,
    'src/clubhouse/screens/stats/Phone.tsx': "'use client';\nimport type { ChLeg } from '../../data/stats-team';\nimport { type ChLeg as L } from '../../data/stats-team';",
    'src/clubhouse/routes/stats.tsx': "import 'server-only';\nimport { LEGS } from '../data/stats-team';",
  });
  assert.deepEqual(ok, []);
});

test('a comma inside :is() is part of one selector, not a second unscoped one', () => {
  const v = checkSource('src/clubhouse/styles/x.css', '.ch-a:is(:active, [data-ch-pressed]) { color: red; }\n.ch-b, .button { color: red; }');
  assert.ok(!v.some((x) => x.includes('data-ch-pressed')));
  assert.ok(v.some((x) => x.includes('unscoped selector ".button"')));
});

test('a z-index is a ladder step, a step plus or minus 1 to 5, or a local -1 to 5 (CONS-35)', () => {
  const ok = '.ch-a{z-index:var(--ch-z-dock)}\n.ch-b{z-index:calc(var(--ch-z-dock) + 1)}\n.ch-c{z-index:-1}\n.ch-d{z-index:5}\n.ch-e{z-index:auto}';
  assert.deepEqual(checkSource('src/clubhouse/styles/x.css', ok), []);
  for (const bad of ['55', '6', 'calc(var(--ch-z-sticky) + 11)', '9999']) {
    assert.ok(checkSource('src/clubhouse/styles/x.css', `.ch-a { z-index: ${bad}; }`).some((x) => x.includes('CONS-35')), bad);
  }
  // In a media block too.
  assert.ok(checkSource('src/clubhouse/styles/x.css', '@media (max-width: 820px) {\n  .ch-a {\n    z-index: 70;\n  }\n}').some((x) => x.includes('z-index 70')));
});

test('a card, panel or tile takes its corner from the radius scale; its children do not count (CONS-32)', () => {
  const css = (decl, sel = '.ch-x-card') => checkSource('src/clubhouse/styles/x.css', `${sel} { ${decl} }`);
  assert.deepEqual(css('border-radius: var(--ch-radius-card);'), []);
  assert.deepEqual(css('border-radius: var(--ch-radius-sheet) var(--ch-radius-sheet) 0 0;'), []);
  assert.deepEqual(css('border-radius: 999px;'), []);
  assert.ok(css('border-radius: 22px;').some((x) => x.includes('CONS-32')));
  assert.ok(css('border-top-left-radius: 18px;', '.ch-a .ch-stm-panel:hover').some((x) => x.includes('CONS-32')));
  assert.ok(css('border-radius: 8px;', '.ch-team-tile').some((x) => x.includes('CONS-32')));
  // The subject is what is styled: a card's child is not a card.
  assert.deepEqual(css('border-radius: 6px;', '.ch-x-card .ch-x-chip'), []);
  // A named exception is the file and the subject.
  assert.deepEqual(checkSource('src/clubhouse/styles/settings.css', '.ch-setm-tile { border-radius: 8px; }'), []);
  assert.ok(checkSource('src/clubhouse/styles/other.css', '.ch-setm-tile { border-radius: 8px; }').some((x) => x.includes('CONS-32')));
});
