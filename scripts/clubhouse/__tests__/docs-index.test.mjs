import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAudits, renderAudits, renderRelated } from '../docs-index.mjs';

const m = { id: 'P007', name: 'Messages', slug: 'messages', progressRow: 'Messages', catalog: 'docs/clubhouse/catalog/messages.md', phoneSpec: 'docs/clubhouse/phone/messages.md', implementation: { root: 'src/clubhouse/screens/messages', route: null }, design: { desktop: ['design/handoff/Coach - Messages.html'] } };
const other = { id: 'P011', name: 'Rounds', slug: 'rounds' };
const audits = [
  { file: 'DEPTH_AUDIT.md', title: 'Depth', kind: 'audit', date: '2026-10-01', scope: 'Depth.', status: 'in_progress', allPages: true, pages: ['P007'] },
  { file: 'ROUNDS_PLAN.md', title: 'Rounds plan', kind: 'plan', date: '2026-09-30', scope: 'Rounds.', status: 'done', pages: ['P011'] },
];
const exists = (p) => !p.endsWith('phone/messages.md');
const page = '# P007 — Messages\n\nIntro.\n';

test('Related block: inserted under the title, relative links, only what exists, audits that name the page', () => {
  const out = renderRelated({ m, audits, exists, existing: page });
  assert.ok(out.startsWith('# P007 — Messages\n\n<!-- clubhouse:related:start'));
  assert.ok(out.includes('(../../../../config/clubhouse/pages/P007-messages.json)'));
  assert.ok(out.includes('(../../catalog/messages.md)'));
  assert.ok(out.includes('(../../../../design/handoff/Coach%20-%20Messages.html)'));
  assert.ok(!out.includes('Phone spec'), 'a missing phone spec is not linked');
  assert.ok(out.includes('[DEPTH_AUDIT](../../DEPTH_AUDIT.md)'));
  assert.ok(!out.includes('ROUNDS_PLAN'), 'another page\'s audit is not listed');
  assert.ok(out.endsWith('Intro.\n'));
});

test('Related block: regeneration replaces the block and is stable', () => {
  const once = renderRelated({ m, audits, exists, existing: page });
  assert.equal(renderRelated({ m, audits, exists, existing: once }), once);
  const changed = renderRelated({ m, audits: [], exists, existing: once });
  assert.ok(!changed.includes('DEPTH_AUDIT'));
  assert.equal(changed.split('clubhouse:related:start').length, 2);
});

test('AUDITS.md lists newest first, links the docs and the pages', () => {
  const md = renderAudits({ audits, manifests: [m, other], head: (t, w) => `# ${t}\n\n${w}\n` });
  assert.ok(md.indexOf('DEPTH_AUDIT.md') < md.indexOf('ROUNDS_PLAN.md'));
  assert.ok(md.includes('all (detail: [P007](pages/P007-messages/PAGE.md))'));
  assert.ok(md.includes('[P011](pages/P011-rounds/PAGE.md)'));
});

const ctx = { audits, manifests: [m, other], exists: () => true, docs: ['DEPTH_AUDIT.md', 'ROUNDS_PLAN.md', 'AUDITS.md', 'README.md'], readmeMd: '[a](AUDITS.md)', progressMd: '[a](AUDITS.md)' };

test('audit check: a registered set is clean; an unregistered audit or plan doc, a bad page, a missing file and a missing link are not', () => {
  assert.deepEqual(checkAudits(ctx), []);
  const v = checkAudits({ ...ctx, docs: [...ctx.docs, 'UI_AUDIT_PASS1.md', 'NEW_PLAN.md'], audits: [{ ...audits[0], pages: ['P099'] }, audits[1]], exists: (p) => p !== 'docs/clubhouse/ROUNDS_PLAN.md', readmeMd: '', progressMd: '' });
  assert.ok(v.some((x) => /UI_AUDIT_PASS1\.md: an audit or plan doc/.test(x)));
  assert.ok(v.some((x) => /NEW_PLAN\.md: an audit or plan doc/.test(x)));
  assert.ok(v.some((x) => /page P099 is not a registered page/.test(x)));
  assert.ok(v.some((x) => /ROUNDS_PLAN\.md does not exist/.test(x)));
  assert.ok(v.some((x) => /README\.md does not link AUDITS\.md/.test(x)));
  assert.ok(v.some((x) => /PROGRESS\.md does not link AUDITS\.md/.test(x)));
  assert.ok(checkAudits({ ...ctx, audits: [{ ...audits[1], status: 'someday', kind: 'memo', date: 'soon' }] }).length >= 3);
});
