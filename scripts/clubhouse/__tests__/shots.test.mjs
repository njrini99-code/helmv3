import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildName, checkScreenshotLog, checkStore, parseName, validateFields } from '../shots.mjs';

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
