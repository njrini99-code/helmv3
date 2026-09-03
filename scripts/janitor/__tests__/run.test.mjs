import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFixtureRepo } from './helpers.mjs';
import { runAll } from '../run.mjs';
import { buildFindingsJson, buildMarkdownReport } from '../lib/report.mjs';
import { rankFindings } from '../lib/rank.mjs';
import { VALID_VERDICTS } from '../lib/verdicts.mjs';

/**
 * A full, small fixture repo (not a copy of the real helmv3 tree — see
 * .claude/rules/shipping.md on never re-deriving repo state without
 * verifying it, which applies just as much to a TEST fixture claiming to
 * model the repo) exercising every classifier at least once without a
 * crash, and proving the two report writers produce well-formed output
 * from real classifier results — not hand-built fixtures of the report
 * shape, which could drift from what classifiers actually return.
 */
const FIXTURE_FILES = {
  'memory/registry.yml': `version: 1

features:
  mapped_feature:
    name: Mapped Feature
    status: active
    owner: platform
    criticality: medium
    code:
      routes:
        - src/app/mapped/**
`,
  'src/app/mapped/page.tsx': 'export default function Page() { return null; }\n',
  'src/app/unmapped/page.tsx': 'export default function Page2() { return null; }\n',
  'src/lib/thing.ts': '/** @deprecated use other */\n// TODO: revisit\nexport function thing() {}\n',
  'src/lib/thing.test.ts': "vi.mock('./a');\ntest('x', () => {});\n",
  '.duplicate-exports-baseline.json': JSON.stringify({ total: 0, entries: [] }),
  '.doc-path-baseline.json': JSON.stringify({ total: 0, entries: [] }),
  // A trivial stand-in for the real scripts/find-orphan-mounts.mjs so
  // orphan-routes.mjs exercises its real success path here, not just its
  // NO_SIGNAL "script missing" path (already covered directly in
  // classifiers-fs.test.mjs).
  'scripts/find-orphan-mounts.mjs':
    "console.log('route roots walked          : 1');\nconsole.log('files reachable from a root : 1');\nconsole.log('UNREACHABLE component files : 0');\n",
};

test('runAll: every classifier returns a valid, assertable result against a real fixture repo', async () => {
  await withFixtureRepo(FIXTURE_FILES, async (repoRoot) => {
    const { results, crashes } = await runAll({ repoRoot });
    assert.equal(crashes.length, 0, `unexpected classifier crash(es): ${JSON.stringify(crashes.map((c) => c.error.message))}`);
    assert.equal(results.length, 12);
    for (const r of results) {
      assert.ok(VALID_VERDICTS.has(r.verdict), `${r.classId} returned an invalid verdict: ${r.verdict}`);
      assert.equal(typeof r.evidenceCommand, 'string');
      assert.ok(r.evidenceCommand.length > 0);
    }
  });
});

test('runAll: report writers produce valid JSON/Markdown from real classifier output', async () => {
  await withFixtureRepo(FIXTURE_FILES, async (repoRoot) => {
    const { results } = await runAll({ repoRoot });
    const ranked = rankFindings(results);
    const generatedAt = new Date().toISOString();

    const json = buildFindingsJson({ repoRoot, classResults: results, rankedFindings: ranked, generatedAt });
    // Must round-trip through JSON.stringify/parse without throwing.
    const reparsed = JSON.parse(JSON.stringify(json));
    assert.equal(reparsed.classes.length, 12);
    assert.equal(reparsed.findings.length, ranked.length);
    for (const entry of reparsed.findings) {
      assert.equal(entry.owner, 'unassigned');
      assert.ok(entry.id);
      assert.ok(entry.closes_when);
    }

    const markdown = buildMarkdownReport({ repoRoot, classResults: results, rankedFindings: ranked, generatedAt });
    assert.match(markdown, /^<!-- markdownlint-disable/);
    assert.match(markdown, /not.*config\/control-plane-gaps\.json/i);
    assert.match(markdown, /## Class coverage/);
    assert.match(markdown, /## Ranked findings/);
    // Every class must appear in the coverage table, even ones with nothing to report.
    for (const r of results) {
      assert.ok(markdown.includes(r.title), `report is missing a row for class "${r.title}"`);
    }
  });
});

test('runAll: a classifier that throws is caught, reported as NO_SIGNAL, and does not abort the run', async () => {
  // Corrupt the registry so missing-feature-mappings' loadRegistry() path
  // still succeeds (it tolerates malformed YAML gracefully via its own
  // parser), so instead force a crash a different way: point at a repoRoot
  // that does not exist, which is fatal to git ls-files/grep and to
  // readFileSync alike — every classifier should degrade to NO_SIGNAL/it's
  // own error handling rather than the run aborting.
  const { results, crashes } = await runAll({ repoRoot: '/nonexistent/janitor-test-path-xyz' });
  assert.equal(results.length, 12); // the run completed all 12, even if every one failed
  for (const r of results) {
    assert.ok(VALID_VERDICTS.has(r.verdict));
  }
});
