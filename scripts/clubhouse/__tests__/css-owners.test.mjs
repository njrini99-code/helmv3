import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorsOf, checkClassOwners } from '../css-owners.mjs';

test('a selector anchors on its first page class, after a shared scope', () => {
  const shared = new Set(['ch-root', 'ch-btn']);
  const css = '.ch-root .ch-rs{} .ch-rsu-tee > .ch-rd-tee{} .ch-btn.ch-ms-send{} .ch-root:has(.ch-sheet) .ch-z{} @media (max-width: 600px){.ch-root .ch-ph{}}';
  assert.deepEqual([...anchorsOf(css, shared)].sort(), ['ch-ms-send', 'ch-ph', 'ch-rs', 'ch-rsu-tee', 'ch-z']);
});

test('two page stylesheets anchoring one class are flagged (the Roster and Setup .ch-rs bug)', () => {
  const v = checkClassOwners({
    'shell.css': '.ch-root{}',
    'roster.css': '.ch-root .ch-rs{visibility:hidden}',
    'rounds-setup.css': '.ch-rs{display:grid}',
  });
  assert.equal(v.length, 1);
  assert.match(v[0], /roster\.css and .*rounds-setup\.css both anchor \.ch-rs/);
});

test('a page split by work package (messages.css + messages-thread.css) owns its classes as one family', () => {
  const v = checkClassOwners({
    'messages.css': '.ch-ms-bub{padding:0}',
    'messages-thread.css': '[data-ch-ms-v2] .ch-ms-bub{padding:1px}',
    'roster.css': '.ch-rs{display:grid}',
  });
  assert.deepEqual(v, []);
  assert.equal(checkClassOwners({ 'messages-thread.css': '.ch-ms-bub{}', 'roster.css': '.ch-ms-bub{}' }).length, 1);
});

test("styling another page's class inside your own is not a collision, and shared classes are everyone's", () => {
  const v = checkClassOwners({
    'ui.css': '.ch-btn{}',
    'rounds.css': '.ch-rd-tee{width:10px}',
    'rounds-setup.css': '.ch-rsu-sw .ch-rd-tee{width:22px} .ch-btn{margin:0}',
    'hub.css': '.ch-btn{margin:0}',
  });
  assert.deepEqual(v, []);
});
