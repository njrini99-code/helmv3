import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendRows, buildName, checkScreenshotLog, logRows, checkStore, looseCaptures, looksClubhouse, parseName, validateFields } from '../shots.mjs';

const fields = { page: 'P007', surface: 'list', role: 'coach', viewport: '390', state: 'unread-mixed', phase: 'before', sha7: 'a1b2c3d' };
const NAME = 'P007__list__coach__390__unread-mixed__before__a1b2c3d.png';
const pages = new Map([['P007', 'messages'], ['P003', 'roster']]);

test('builds and parses the convention name', () => {
  assert.equal(buildName(fields), NAME);
  assert.deepEqual(parseName(NAME), fields);
  assert.equal(parseName(buildName({ ...fields, viewport: '1440x900', role: 'none', phase: 'evidence' }))?.viewport, '1440x900');
});

test('rejects fields that would break the name', () => {
  const bad = validateFields({ ...fields, page: '7', surface: 'Thread View', role: 'admin', viewport: 'wide', state: 'a__b', phase: 'later', sha7: 'xyz' });
  assert.equal(bad.length, 7);
  assert.throws(() => buildName({ ...fields, phase: 'later' }), /phase "later"/);
  for (const n of ['screenshot.png', 'P007__list__coach__390__unread-mixed__before.png', NAME.replace('.png', '.jpg'), NAME.replace('before', 'during'), NAME.replace('__a1b2c3d', '__A1B2C3D')]) assert.equal(parseName(n), null, n);
});

test('check: a well-filed store is clean, with a warning for a shot with no manifest entry', () => {
  const dir = 'P007-messages/2026-10-01';
  const ok = checkStore({ files: [`${dir}/${NAME}`, `${dir}/manifest.json`, 'INDEX.md'], pages, manifests: { [dir]: [{ file: NAME }] } });
  assert.deepEqual(ok, { violations: [], warnings: [] });
  const bare = checkStore({ files: [`${dir}/${NAME}`], pages });
  assert.equal(bare.violations.length, 0);
  assert.match(bare.warnings[0], /no manifest entry/);
  assert.match(checkStore({ files: [`${dir}/manifest.json`], pages, manifests: { [dir]: [{ file: NAME }] } }).warnings[0], /has no file/);
});

test('check: reports unlabeled, misfiled, unknown-page, bad-date and bad-manifest files', () => {
  const dir = 'P007-messages/2026-10-01';
  const { violations: v } = checkStore({
    files: [`${dir}/shot.png`, `P003-roster/2026-10-01/${NAME}`, `P099-nope/2026-10-01/${NAME.replace('P007', 'P099')}`, `P007-messages/2026-13-45/${NAME}`, `${NAME}`, `${dir}/manifest.json`],
    pages,
    manifests: { [dir]: null },
  });
  assert.ok(v.some((x) => /shot\.png: unlabeled/.test(x)));
  assert.ok(v.some((x) => /misfiled; the name says P007 but the directory is P003-roster/.test(x)));
  assert.ok(v.some((x) => /P099-nope.*not a page directory/.test(x)));
  assert.ok(v.some((x) => /2026-13-45.*not a YYYY-MM-DD/.test(x)));
  assert.ok(v.some((x) => /^P007__.*misfiled; expected/.test(x)));
  assert.ok(v.some((x) => /manifest\.json: is not valid JSON/.test(x)));
});

const log = (rows) => `# P007 - Verification\n\n## Screenshots\n\nPointer.\n\n| Label | Phase | Commit | What it shows |\n|---|---|---|---|\n${rows}\n## Open verification gaps\n\n- none\n`;

test('VERIFY log: needs the section; an empty table is valid; rows must be convention files of the page', () => {
  assert.match(checkScreenshotLog('# P007\n\n## Performance\n', 'v.md', 'P007')[0], /no "## Screenshots" section/);
  assert.deepEqual(checkScreenshotLog(log(''), 'v.md', 'P007'), []);
  assert.deepEqual(checkScreenshotLog(log(`| \`${NAME}\` | before | a1b2c3d | The thread list with two unread rows |\n`), 'v.md', 'P007'), []);
  const bad = checkScreenshotLog(log(`| shot.png | before | | |\n| ${NAME} | after | a1b2c3d | x |\n| ${NAME.replace('P007', 'P003')} | before | a1b2c3d | y |\n`), 'v.md', 'P007');
  assert.equal(bad.length, 5);
  assert.ok(bad.some((x) => /not a convention file name/.test(x)));
  assert.ok(bad.some((x) => /says phase "after" but the file name says before/.test(x)));
  assert.ok(bad.some((x) => /is for P003, not P007/.test(x)));
});

test('scratch dirs: a Clubhouse-looking image is a loose capture; other images and non-images are not', () => {
  const imgs = ['test-results/clubhouse-messages-chromium/shot.png', '.helm/runtime/ui-audit/probe.png', '.dev-screenshots/P007-before.png', 'e2e-screenshots/messages-thread.webp', '.playwright-mcp/golf-login.png', 'test-results/x/video.webm', '.helm/runtime/ui-audit/notes.md'];
  assert.deepEqual(looseCaptures(imgs, pages), imgs.slice(0, 4));
  assert.equal(looksClubhouse('test-results/roster-page/a.png', pages), true);
  assert.equal(looksClubhouse('test-results/rosterfoo/a.png', pages), false);
});

test('import moves a loose capture into the store under its label, records it, and the store then checks clean', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ch-shots-'));
  const store = join(tmp, 'store');
  const loose = join(tmp, 'loose.png');
  writeFileSync(loose, 'png');
  const run = (...args) => spawnSync(process.execPath, [new URL('../shots.mjs', import.meta.url).pathname, ...args], { env: { ...process.env, CLUBHOUSE_SHOTS_DIR: store }, encoding: 'utf8' });
  const opts = ['--page', 'P007', '--surface', 'thread', '--role', 'coach', '--viewport', '390', '--state', 'keyboard-open', '--phase', 'after', '--sha', 'abc1234', '--date', '2026-10-01'];
  const bad = run('import', join(tmp, 'loose.jpg'), ...opts);
  assert.equal(bad.status, 1);
  const res = run('import', loose, ...opts);
  assert.equal(res.status, 0, res.stderr);
  const dest = join(store, 'P007-messages/2026-10-01/P007__thread__coach__390__keyboard-open__after__abc1234.png');
  assert.ok(existsSync(dest) && !existsSync(loose), 'moved, not copied');
  const entries = JSON.parse(readFileSync(join(store, 'P007-messages/2026-10-01/manifest.json'), 'utf8'));
  assert.equal(entries[0].route, '/golf/dashboard/messages');
  assert.equal(entries[0].phase, 'after');
  assert.equal(run('check').status, 0);
  writeFileSync(join(store, 'P007-messages/2026-10-01/stray.png'), 'x');
  assert.equal(run('check').status, 1);
});

test('log: rows come from manifest entries, skip labels already listed, and append to the end of the table', () => {
  const entries = [{ file: NAME, fixture: '/clubhouse-preview/messages?state=rail (synthetic preview fixture)' }, { file: 'notes.txt' }];
  const rows = logRows(entries, '');
  assert.equal(rows.length, 1);
  assert.match(rows[0], new RegExp(`^\\| \`${NAME}\` \\| before \\| a1b2c3d \\| list \\(coach\\), 390px, unread-mixed; /clubhouse-preview/messages\\?state=rail, synthetic preview fixture \\|$`));
  assert.deepEqual(logRows(entries, `| ${NAME} | before |`), []);
  const md = `# P007\n\n## Screenshots\n\nPointer.\n\n| Label | Phase | Commit | What it shows |\n| --- | --- | --- | --- |\n\n## Open verification gaps\n`;
  const out = appendRows(md, rows);
  assert.ok(out.indexOf(rows[0]) > out.indexOf('| --- |') && out.indexOf(rows[0]) < out.indexOf('## Open'));
  assert.deepEqual(checkScreenshotLog(out, 'v.md', 'P007'), []);
  assert.equal(appendRows('# no section\n', rows), '# no section\n');
});
