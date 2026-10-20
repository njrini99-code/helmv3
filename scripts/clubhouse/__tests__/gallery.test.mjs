import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupShots, pairGroup, renderGallery, renderIndex, sortShots } from '../gallery.mjs';

const shot = (o) => ({ surface: 'thread', role: 'coach', viewport: '390', state: 'default', phase: 'after', commit: 'abcdef1234', date: '2026-10-01', capturedAt: '2026-10-01T10:00:00Z', file: 'P007__thread__coach__390__default__after__abcdef1.png', ...o });
const named = (o) => shot({ ...o, file: `P007__${o.surface ?? 'thread'}__${o.role ?? 'coach'}__${o.viewport ?? '390'}__${o.state ?? 'default'}__${o.phase ?? 'after'}__${o.sha ?? 'abcdef1'}.png` });

test('sortShots: newest first by capture time, then date, then file; the input is not mutated', () => {
  const a = named({ capturedAt: '2026-10-01T09:00:00Z' });
  const b = named({ capturedAt: '2026-10-01T11:00:00Z', sha: 'bbbbbbb' });
  const c = named({ capturedAt: undefined, date: '2026-09-30', sha: 'ccccccc' });
  const input = [a, c, b];
  assert.deepEqual(sortShots(input).map((s) => s.file), [b.file, a.file, c.file]);
  assert.deepEqual(input, [a, c, b]);
});

test('pairGroup: a before and an after of one surface, role, viewport and state are paired; the rest follow newest first', () => {
  const after = named({ capturedAt: '2026-10-01T12:00:00Z' });
  const oldAfter = named({ capturedAt: '2026-10-01T08:00:00Z', sha: '1111111' });
  const before = named({ phase: 'before', capturedAt: '2026-10-01T07:00:00Z', sha: '2222222' });
  const evidence = named({ phase: 'evidence', capturedAt: '2026-10-01T09:00:00Z', sha: '3333333' });
  const g = pairGroup(sortShots([oldAfter, before, evidence, after]));
  assert.equal(g.pair.before, before);
  assert.equal(g.pair.after, after, 'the newest after');
  assert.deepEqual(g.others, [evidence, oldAfter]);
});

test('pairGroup: a baseline stands in for a missing before, and a before wins over a baseline', () => {
  const baseline = named({ phase: 'baseline', sha: '4444444' });
  const after = named({ capturedAt: '2026-10-01T12:00:00Z' });
  assert.equal(pairGroup([after, baseline]).pair.before, baseline);
  const before = named({ phase: 'before', sha: '5555555' });
  assert.equal(pairGroup([after, baseline, before]).pair.before, before);
});

test('pairGroup: no pair without both sides; every shot is then listed', () => {
  const after = named({});
  const before = named({ phase: 'before', sha: '6666666' });
  assert.equal(pairGroup([after]).pair, null);
  assert.equal(pairGroup([before]).pair, null);
  assert.deepEqual(pairGroup([after]).others, [after]);
});

test('groupShots: by surface then state; role and viewport never pair with each other', () => {
  const shots = [
    named({ surface: 'thread', role: 'coach', viewport: '390', phase: 'before', sha: '1000001' }),
    named({ surface: 'thread', role: 'coach', viewport: '390', phase: 'after', sha: '1000002' }),
    named({ surface: 'thread', role: 'player', viewport: '390', phase: 'after', sha: '1000003' }),
    named({ surface: 'thread', role: 'coach', viewport: '1440', phase: 'before', sha: '1000004' }),
    named({ surface: 'thread', role: 'coach', viewport: '390', state: 'empty', phase: 'after', sha: '1000005' }),
    named({ surface: 'list', role: 'coach', viewport: '390', phase: 'after', sha: '1000006' }),
  ];
  const grouped = groupShots(shots);
  assert.deepEqual(grouped.map((s) => s.surface), ['list', 'thread']);
  const thread = grouped[1];
  assert.deepEqual(thread.states.map((s) => s.state), ['default', 'empty']);
  const def = thread.states[0].groups;
  assert.deepEqual(def.map((g) => `${g.role}@${g.viewport}`), ['coach@390', 'coach@1440', 'player@390'], 'role, then viewport numerically');
  assert.ok(def[0].pair, 'coach 390 has both sides');
  assert.equal(def[1].pair, null, 'coach 1440 has only a before');
  assert.equal(def[2].pair, null, 'player 390 has only an after');
  assert.equal(thread.states[1].groups[0].pair, null, 'a different state is its own group');
});

test('renderGallery: relative image paths, a caption with label, role, viewport, phase, commit, date and note, filters, light and dark', () => {
  const html = renderGallery({
    page: 'P007',
    slug: 'messages',
    shots: [
      named({ phase: 'before', date: '2026-09-30', sha: '7000001', note: 'before the <unread> weight' }),
      named({ phase: 'after', route: '/clubhouse-preview/messages' }),
    ],
  });
  assert.ok(html.includes('src="2026-09-30/P007__thread__coach__390__default__before__7000001.png"'));
  assert.ok(html.includes('src="2026-10-01/P007__thread__coach__390__default__after__abcdef1.png"'));
  assert.ok(!/src="(?:\/|https?:)/.test(html), 'no absolute or remote image paths');
  assert.ok(html.includes('coach · 390px'));
  assert.ok(html.includes('abcdef1'), 'commit, seven characters');
  assert.ok(html.includes('before the &lt;unread&gt; weight'), 'the note is escaped');
  assert.ok(html.includes('route /clubhouse-preview/messages'));
  assert.ok(html.includes('id="role"') && html.includes('id="viewport"'));
  assert.ok(html.includes('prefers-color-scheme:dark'));
  assert.equal(html.match(/class="pair"/g).length, 1, 'the before and after sit in one pair');
  assert.ok(!/<script src=|<link /.test(html), 'no dependencies');
});

test('renderIndex: one link per page, an empty list says so', () => {
  const html = renderIndex([{ page: 'P007', slug: 'messages', count: 3, latest: '2026-10-01' }]);
  assert.ok(html.includes('href="P007-messages/GALLERY.html"'));
  assert.ok(html.includes('3 shot(s), latest 2026-10-01'));
  assert.ok(renderIndex([]).includes('No screenshots yet.'));
});
