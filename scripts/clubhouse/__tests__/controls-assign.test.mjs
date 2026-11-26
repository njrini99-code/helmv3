import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assign, controlProblems, labelInfo, scanFile, renderLedger, parseBoardRows, boardVerdict, assignOnDisk, checkControls, checkClickableMap } from '../clickable-map.mjs';

const manifests = [
  {
    id: 'P007',
    name: 'Messages',
    roles: ['coach', 'player'],
    screens: [{ route: '/m', audience: 'coach', coach: 'src/clubhouse/screens/messages/Inbox.tsx#Inbox' }],
    implementation: { root: 'src/clubhouse/screens/messages' },
    actions: [{ id: 'ACT-P007-SEND', label: 'Send a message', component: 'src/clubhouse/screens/messages/Inbox.tsx#Inbox', handler: 'send.run' }],
  },
];
const INBOX = 'src/clubhouse/screens/messages/Inbox.tsx';
const inbox = `export function Inbox({ p }) {
  return (
    <div>
      <button onClick={() => send.run()}>Send</button>
      <a href={\`/m/\${p.id}\`}>Open {p.name}'s thread</a>
      <button onClick={close}><Icon icon={X} /></button>
    </div>
  );
}
`;
/** Run assign and fold its edits and ledgers back in, as the disk would. */
const step = (files, ledgers = {}, extra = {}) => {
  const r = assign({ files, manifests, ledgers, today: '2026-11-25', ...extra });
  return { files: { ...files, ...r.edits }, ledgers: r.ledgers, r };
};

test('the first run numbers every control in file and source order and writes data-ctl on the element', () => {
  const { files, ledgers } = step({ [INBOX]: inbox });
  assert.match(files[INBOX], /<button data-ctl="CTL-P007-001" onClick=\{\(\) => send\.run\(\)\}>Send<\/button>/);
  assert.match(files[INBOX], /<a data-ctl="CTL-P007-002" href=/);
  assert.match(files[INBOX], /<button data-ctl="CTL-P007-003" onClick=\{close\}>/);
  const [a, b, c] = ledgers.P007.controls;
  assert.deepEqual([a.id, a.label, a.actions, a.role, a.viewport], ['CTL-P007-001', 'Send', ['ACT-P007-SEND'], 'coach', 'all']);
  assert.equal(a.description, 'Send a message');
  assert.equal(b.labelTemplate, "Open {name}'s thread");
  assert.equal(b.label, null);
  assert.equal(c.label, null, 'an icon-only button has no label until someone writes one');
});

test('a second run changes nothing (idempotent), and authored labels and descriptions survive', () => {
  const one = step({ [INBOX]: inbox });
  one.ledgers.P007.controls[2].label = 'Close the thread';
  one.ledgers.P007.controls[0].description = 'Sends the draft to everyone in the thread';
  const two = step(one.files, one.ledgers);
  assert.deepEqual(two.r.edits, {});
  assert.equal(two.ledgers.P007.controls[2].label, 'Close the thread');
  assert.equal(two.ledgers.P007.controls[0].description, 'Sends the draft to everyone in the thread');
  assert.equal(renderLedger('P007', two.ledgers.P007), renderLedger('P007', step(two.files, two.ledgers).ledgers.P007));
});

test('ids are stable when controls move, and a new control takes the next free number', () => {
  const one = step({ [INBOX]: inbox });
  // Swap the first two controls and add one at the top.
  const moved = one.files[INBOX]
    .replace(/(\s*<button data-ctl="CTL-P007-001"[^\n]*)(\n\s*<a data-ctl="CTL-P007-002"[^\n]*)/, '$2$1')
    .replace('<div>', '<div>\n      <button onClick={archive}>Archive</button>');
  const two = step({ [INBOX]: moved }, one.ledgers);
  assert.match(two.files[INBOX], /<button data-ctl="CTL-P007-004" onClick=\{archive\}>Archive/);
  assert.match(two.files[INBOX], /<button data-ctl="CTL-P007-001" onClick=\{\(\) => send\.run\(\)\}>Send/);
  assert.deepEqual(two.ledgers.P007.controls.map((e) => e.id), ['CTL-P007-001', 'CTL-P007-002', 'CTL-P007-003', 'CTL-P007-004']);
});

test('a removed control is tombstoned and its number is never reused', () => {
  const one = step({ [INBOX]: inbox });
  const without = one.files[INBOX].replace(/\n\s*<button data-ctl="CTL-P007-003"[^\n]*\n[^\n]*\n?/, '\n').replace(/<button data-ctl="CTL-P007-003".*?<\/button>/s, '');
  const two = step({ [INBOX]: without }, one.ledgers);
  assert.deepEqual(two.ledgers.P007.tombstones, [{ id: 'CTL-P007-003', file: INBOX, label: null, removedAt: '2026-11-25' }]);
  const three = step({ [INBOX]: `${two.files[INBOX]}\nexport const More = () => <button onClick={more}>More</button>;\n` }, two.ledgers);
  assert.match(three.files[INBOX], /data-ctl="CTL-P007-004" onClick=\{more\}/);
});

test('an id written twice (a copy, or two branches taking the same number) stays on the first; the copy is renumbered', () => {
  const one = step({ [INBOX]: inbox });
  const copy = 'export const B = () => <button data-ctl="CTL-P007-001" onClick={go}>Go</button>;\n';
  const two = step({ [INBOX]: one.files[INBOX], 'src/clubhouse/screens/messages/Zed.tsx': copy }, one.ledgers);
  assert.match(two.files['src/clubhouse/screens/messages/Zed.tsx'], /data-ctl="CTL-P007-004"/);
  assert.equal(two.r.edits[INBOX], undefined, 'the first occurrence keeps its id');
});

test('a forwarding element (data-ctl as an expression) takes no id; a CTL literal inside the expression is its own', () => {
  const wrapper = `export function Row({ 'data-ctl': ctl, href }) { return <a data-ctl={ctl} href={href}>Open</a>; }
export function Key({ 'data-ctl': ctl }) { return <button data-ctl={ctl ?? 'CTL-P007-009'} onClick={go}>Go</button>; }
`;
  const r = assign({ files: { 'src/clubhouse/screens/messages/W.tsx': wrapper }, manifests, ledgers: {} });
  assert.deepEqual(r.edits, {});
  assert.deepEqual(r.ledgers.P007.controls.map((e) => e.id), ['CTL-P007-009']);
  assert.equal(r.controls.filter((s) => s.row.ctl?.kind === 'forward').length, 1);
});

test('files no manifest claims are numbered under P000; --page numbers one page only', () => {
  const files = { 'src/clubhouse/ui/Thing.tsx': 'export const T = () => <button onClick={x}>T</button>;\n', [INBOX]: inbox };
  const r = assign({ files, manifests, ledgers: {}, only: 'P000' });
  assert.deepEqual(Object.keys(r.edits), ['src/clubhouse/ui/Thing.tsx']);
  assert.match(r.edits['src/clubhouse/ui/Thing.tsx'], /CTL-P000-001/);
});

test('labels: aria-label, aria={{ label }}, children through conditionals, and label templates', () => {
  const rows = scanFile(`export const A = () => (<>
    <button onClick={a} aria-label="Close">x</button>
    <Button onClick={a} aria={{ label: 'Delete round' }}>Delete</Button>
    <button onClick={a}>{busy ? <span>Saving…</span> : 'Save'}</button>
    <Button onClick={a}><Icon icon={X} /> Add&nbsp;player</Button>
    <IconButton onClick={a} label={\`Remove \${p.name}\`} icon={X} />
    <button onClick={a}><Icon icon={X} /></button>
  </>);`);
  assert.deepEqual(rows.map((r) => r.labelInfo), [
    { kind: 'static', text: 'Close' },
    { kind: 'static', text: 'Delete round' },
    { kind: 'runtime', template: '{Saving…|Save}' },
    { kind: 'static', text: 'Add player' },
    { kind: 'runtime', template: 'Remove {name}' },
    { kind: 'none' },
  ]);
  assert.equal(typeof labelInfo, 'function');
});

test('board verdicts match conservatively: the row cites the file and names the same control', () => {
  const md = `### \`Coach - Messages.html\` (coach, desktop)

| Control | Where | Clubhouse today | Status | Note |
| --- | --- | --- | --- | --- |
| Send / Send (enter) | Composer | src/clubhouse/screens/messages/Inbox.tsx:12 | \`works\` | |
| Archive | Row | src/clubhouse/screens/messages/Other.tsx:3 | \`GAP\` | |
`;
  const rows = parseBoardRows(md);
  assert.equal(rows.length, 2);
  assert.deepEqual(boardVerdict(INBOX, 'Send', rows), { status: 'works', board: 'Coach - Messages.html (coach, desktop)', control: 'Send / Send (enter)' });
  assert.equal(boardVerdict(INBOX, 'Archive', rows), null, 'a row citing another file never matches');
  const { ledgers } = step({ [INBOX]: inbox }, {}, { boardMd: md });
  assert.equal(ledgers.P007.controls[0].verdict.status, 'works');
});

test('the gate: clean when numbered and labelled; fails on a missing data-ctl, a missing label, or a stale ledger', () => {
  const one = step({ [INBOX]: inbox });
  const unlabelled = controlProblems({ files: one.files, manifests, ledgers: one.ledgers });
  assert.equal(unlabelled.length, 1);
  assert.match(unlabelled[0], /CTL-P007-003 .* has no label/);
  one.ledgers.P007.controls[2].label = 'Close the thread';
  assert.deepEqual(controlProblems({ files: one.files, manifests, ledgers: one.ledgers }), []);
  const added = { ...one.files, [INBOX]: one.files[INBOX].replace('<div>', '<div>\n      <button onClick={x}>New</button>') };
  const v = controlProblems({ files: added, manifests, ledgers: one.ledgers });
  assert.ok(v.some((x) => /Inbox\.tsx:4 <button> has no data-ctl/.test(x)), v.join('\n'));
  assert.ok(v.some((x) => /P007\.json is out of date/.test(x)));
  const dup = { ...one.files, 'src/clubhouse/screens/messages/Zed.tsx': 'export const Z = () => <button data-ctl="CTL-P007-001" onClick={z}>Z</button>;\n' };
  assert.ok(controlProblems({ files: dup, manifests, ledgers: one.ledgers }).some((x) => /data-ctl="CTL-P007-001" is taken or tombstoned/.test(x)));
});

test('on disk: --assign writes code, ledger and map; a second run is a no-op; the checks are clean', () => {
  const root = mkdtempSync(join(tmpdir(), 'ch-controls-'));
  mkdirSync(join(root, 'config/clubhouse/pages'), { recursive: true });
  writeFileSync(join(root, 'config/clubhouse/pages/P007-messages.json'), JSON.stringify(manifests[0]));
  mkdirSync(join(root, 'src/clubhouse/screens/messages'), { recursive: true });
  writeFileSync(join(root, INBOX), inbox.replace('<button onClick={close}><Icon icon={X} /></button>', '<button onClick={close} aria-label="Close"><Icon icon={X} /></button>'));
  const first = assignOnDisk(root, { today: '2026-11-25' });
  assert.equal(first.numbered, 3);
  const code = readFileSync(join(root, INBOX), 'utf8');
  const ledger = readFileSync(join(root, 'config/clubhouse/controls/P007.json'), 'utf8');
  const second = assignOnDisk(root, { today: '2026-11-26' });
  assert.deepEqual([second.numbered, second.files, second.ledgerWrites], [0, 0, 0]);
  assert.equal(readFileSync(join(root, INBOX), 'utf8'), code);
  assert.equal(readFileSync(join(root, 'config/clubhouse/controls/P007.json'), 'utf8'), ledger);
  assert.deepEqual(checkControls(root), []);
  assert.deepEqual(checkClickableMap(root), []);
  assert.match(readFileSync(join(root, 'docs/clubhouse/generated/CLUBHOUSE_CLICKABLE_MAP.md'), 'utf8'), /^- CTL-P007-001 4 `button` "Send" \(button, onClick\)$/m);
});
