#!/usr/bin/env node
/**
 * bench.mjs — Context Retrieval Bench (Bridge Control Plane Phase K.4.2).
 *
 * docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md section 7
 * (K.4, item 2): "Context Retrieval Bench as a harness around the existing
 * commands ... start from the real memory/incidents/** entries ... which
 * *is* the gold set. Do not invent synthetic tasks when real incident
 * history already provides a small, honest gold set."
 *
 * This scores the CURRENT retrieval path — the real `knowledge:map` and
 * `knowledge:context` CLIs, invoked exactly as a session would invoke them —
 * against scripts/knowledge/bench/gold-set.v1.json, a FROZEN, versioned gold
 * set hand-curated from all memory/incidents/**\/INC-*.md files that existed
 * at freeze time (see that file's own `provenance` and `seed_rule` fields).
 *
 * WHAT THIS DELIBERATELY DOES NOT REPORT: a "Recall@5/@10" over
 * knowledge:map's own output. `mapFilesToFeatures` returns an unordered set
 * of typically 1-3 matching features for a single input file — Recall@K over
 * that set is identical to plain recall for any K >= 3, which is exactly the
 * "gate that cannot fail" class .claude/rules/quality-gates.md exists to
 * name. Feature-level retrieval is instead scored as:
 *
 *   - feature_recall        gold_feature present in the features knowledge:map
 *                            returns for the task's single seed file
 *   - wrong_feature_rate    knowledge:map returned a feature that is neither
 *                            gold_feature nor a declared gold_feature_secondary
 *
 * Recall@5/@10 IS meaningful, and IS reported, at the DOCUMENT level: the
 * doc list `generate-context-pack.mjs` builds (AGENTS.md, CLAUDE.md,
 * memory/registry.yml, then each matched feature's registry-declared docs,
 * in that fixed order) routinely exceeds ten entries and is genuinely
 * ordered, so truncating at 5 or 10 is a real, discriminating question.
 * Because the three fixed docs (AGENTS.md/CLAUDE.md/memory/registry.yml)
 * always occupy the first three slots by design — they are baseline
 * context, not something a query should have to "retrieve" — this script
 * reports BOTH the recall over the full ordered list AND, as the primary
 * number, recall over the feature-specific docs only (the fixed three
 * excluded and the list re-indexed from 1).
 *
 * Other metrics and what they are actually computed from (no invented
 * notions — see the docstrings on the functions below):
 *
 *   - gold_file_recall       does EVERY other file the incident names
 *                            (excluding the one seed file fed to the
 *                            retriever) match at least one code glob of a
 *                            feature knowledge:map found for the seed file?
 *   - irrelevant_token_rate  share of the pack's FEATURE-DOC characters
 *                            (fixed preamble excluded) that come from a doc
 *                            owned only by a feature outside the gold set
 *   - stale_context_rate     share of the pack's INCLUDED docs that are
 *                            SUPERSEDED/HISTORICAL/archived, using the same
 *                            three-way detector check-authority.mjs's
 *                            retired() uses
 *   - historical_analogue_retrieval_rate
 *                            share of tasks whose pack includes ANY path
 *                            under memory/incidents/ — reported honestly;
 *                            do not widen the retriever to inflate this
 *                            number (K.7's own risk note applies)
 *
 * Usage:
 *   node scripts/knowledge/bench.mjs [path/to/gold-set.json]
 * Writes docs/generated/RETRIEVAL_BENCH.md and .json. Report-only: no CI
 * caller. The plan (K.5, K.7) asks for a bench-REGRESSION TEST — that is
 * scripts/knowledge/__tests__/bench.test.mjs's fixed-fixture floor
 * assertion — and explicitly says to treat live scores as directional, not
 * a hard gate, until the incident corpus grows. It does not name a trigger
 * condition for re-running this against live retrieval, so none is added
 * here.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { loadRegistry, flattenCodePatterns, matchGlob } from './lib/registry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_GOLD_SET = 'scripts/knowledge/bench/gold-set.v1.json';
const REPORT_MD = 'docs/generated/RETRIEVAL_BENCH.md';
const REPORT_JSON = 'docs/generated/retrieval-bench.json';

// Same three-way staleness detector check-authority.mjs's retired() uses,
// reproduced rather than imported because that script is a standalone CLI,
// not a module with an exported surface. Kept intentionally tiny (this is
// the whole detector, not a partial copy) so drift between the two is easy
// to spot in review.
export function isRetiredDoc(path, headText) {
  if (headText === null) return null; // file does not exist / could not be read
  if (/^STATUS:\s*SUPERSEDED/im.test(headText) || /\*\*Status:\*\*\s*SUPERSEDED/i.test(headText)) return 'SUPERSEDED';
  if (/^STATUS:\s*HISTORICAL/im.test(headText)) return 'HISTORICAL';
  if (path.startsWith('docs/archive/') || path.startsWith('archive/')) return 'ARCHIVED';
  return null;
}

/**
 * Reconstruct the ordered doc list generate-context-pack.mjs builds
 * (AGENTS.md, CLAUDE.md, memory/registry.yml, then each matched feature's
 * `.docs` in registry order, deduped) directly from lib/registry.mjs's
 * output, rather than parsing the CLI's rendered markdown file.
 *
 * This is not a second implementation of that logic to drift against: it is
 * the identical three-line snippet generate-context-pack.mjs itself runs
 * (`docPaths = [...fixed3, ...impactedFeatures.flatMap(f => f.docs)]`,
 * `[...new Set(docPaths)]`), because that script does not export a reusable
 * function. An earlier version of this file instead split the rendered
 * markdown file on its '\n\n---\n\n' section separator — that broke the
 * first time a doc's OWN CONTENT happened to contain that exact substring
 * (AGENTS.md does, repeatedly, as a markdown thematic break), silently
 * producing a section with a null path. Reconstructing the list structurally
 * and reading each doc's bytes directly from disk (same existsSync +
 * truncate-to-maxDocChars logic that script uses) cannot suffer that
 * failure mode. The real CLI is still invoked once per task in
 * runRetrieval() below, as a cross-check that it runs cleanly end to end for
 * every seed file in the gold set — not as the source of the scored data.
 */
export function buildDocEntries(mapFeatureRecords, { root, maxDocChars = 5000, readFileText, fileExists }) {
  const docPaths = ['AGENTS.md', 'CLAUDE.md', 'memory/registry.yml', ...mapFeatureRecords.flatMap((f) => f.docs ?? [])];
  const uniqueDocPaths = [...new Set(docPaths)];
  return uniqueDocPaths.map((path) => {
    if (!fileExists(root, path)) return { path, included: false, text: '' };
    const full = readFileText(root, path);
    const text = full.length <= maxDocChars ? full : full.slice(0, maxDocChars);
    return { path, included: true, text };
  });
}

/**
 * Score one gold-set task given already-retrieved outputs.
 * Pure — takes retrieval results in, returns a metrics object out. No file
 * I/O, so this is what scripts/knowledge/__tests__/bench.test.mjs exercises
 * directly with fixtures.
 */
export function scoreTask(task, { predictedFeatures, mapFeatureRecords, registryFeatures, docEntries, goldDocPath, retiredLookup }) {
  const goldSet = new Set([task.gold_feature, ...(task.gold_feature_secondary ?? [])]);

  const featureRecallHit = predictedFeatures.includes(task.gold_feature);
  const wrongFeatures = predictedFeatures.filter((f) => !goldSet.has(f));

  // gold_file_recall: for every OTHER file the incident names, does it
  // match at least one registered code glob of a feature knowledge:map
  // found for the single seed file we gave it? `mapFeatureRecords` (from
  // knowledge:map's own JSON output) carries only the reduced projection
  // (id/name/criticality/matchedFiles/docs/requiredChecks) — it deliberately
  // does not re-expose the full registry `code:` block, so the glob patterns
  // have to come from the full registry feature record, looked up by id.
  let goldFileRecall = null;
  if (task.gold_files.length > 0) {
    const patterns = predictedFeatures
      .map((id) => registryFeatures[id])
      .filter(Boolean)
      .flatMap((f) => flattenCodePatterns(f));
    const found = task.gold_files.filter((gf) => patterns.some((pattern) => matchGlob(pattern, gf)));
    goldFileRecall = found.length / task.gold_files.length;
  }

  // Doc-level: build the owning-feature set for every doc in the pack from
  // mapFeatureRecords (each predicted feature already carries its own
  // `.docs` list, computed by the exact same flattenDocs() knowledge:context
  // uses) — no separate registry lookup needed for this part.
  const docOwners = new Map(); // docPath -> Set<featureId>
  for (const feature of mapFeatureRecords) {
    for (const docPath of feature.docs ?? []) {
      if (!docOwners.has(docPath)) docOwners.set(docPath, new Set());
      docOwners.get(docPath).add(feature.id);
    }
  }

  const FIXED_DOCS = new Set(['AGENTS.md', 'CLAUDE.md', 'memory/registry.yml']);
  const includedDocs = docEntries.filter((d) => d.included);
  const featureDocs = includedDocs.filter((d) => !FIXED_DOCS.has(d.path));
  const featureDocPaths = featureDocs.map((d) => d.path);

  const goldDocIndexFull = includedDocs.findIndex((d) => d.path === goldDocPath);
  const goldDocIndexFeatureOnly = featureDocPaths.indexOf(goldDocPath);

  const recallAtKFull = { 5: goldDocIndexFull >= 0 && goldDocIndexFull < 5, 10: goldDocIndexFull >= 0 && goldDocIndexFull < 10 };
  const recallAtKFeatureOnly =
    goldDocPath === null
      ? { 5: null, 10: null }
      : { 5: goldDocIndexFeatureOnly >= 0 && goldDocIndexFeatureOnly < 5, 10: goldDocIndexFeatureOnly >= 0 && goldDocIndexFeatureOnly < 10 };

  let irrelevantChars = 0;
  let totalFeatureDocChars = 0;
  for (const doc of featureDocs) {
    totalFeatureDocChars += doc.text.length;
    const owners = docOwners.get(doc.path) ?? new Set();
    const relevant = [...owners].some((o) => goldSet.has(o));
    if (!relevant) irrelevantChars += doc.text.length;
  }

  let staleCount = 0;
  for (const doc of includedDocs) {
    if (retiredLookup(doc.path)) staleCount += 1;
  }

  const historicalAnalogueHit = includedDocs.some((d) => d.path.startsWith('memory/incidents/'));

  return {
    id: task.id,
    gold_feature: task.gold_feature,
    predicted_features: predictedFeatures,
    feature_recall_hit: featureRecallHit,
    wrong_features: wrongFeatures,
    gold_file_recall: goldFileRecall,
    gold_files_total: task.gold_files.length,
    recall_at_k_full: recallAtKFull,
    recall_at_k_feature_docs_only: recallAtKFeatureOnly,
    irrelevant_chars: irrelevantChars,
    total_feature_doc_chars: totalFeatureDocChars,
    included_doc_count: includedDocs.length,
    stale_doc_count: staleCount,
    historical_analogue_hit: historicalAnalogueHit,
  };
}

/** Aggregate per-task scores into headline numbers. Pure, and what the
 * generated report's summary table is built from. */
export function aggregateScores(perTask) {
  const n = perTask.length;
  const mean = (arr) => (arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length);

  const featureRecall = mean(perTask.map((t) => (t.feature_recall_hit ? 1 : 0)));
  const wrongFeatureRate = mean(perTask.map((t) => (t.wrong_features.length > 0 ? 1 : 0)));
  const goldFileRecallSamples = perTask.map((t) => t.gold_file_recall).filter((v) => v !== null);
  const goldFileRecall = mean(goldFileRecallSamples);

  const recallAt = (key, k) => mean(perTask.map((t) => t[key][k]).filter((v) => v !== null).map((v) => (v ? 1 : 0)));

  const totalIrrelevant = perTask.reduce((a, t) => a + t.irrelevant_chars, 0);
  const totalFeatureDocChars = perTask.reduce((a, t) => a + t.total_feature_doc_chars, 0);
  const irrelevantTokenRate = totalFeatureDocChars === 0 ? null : totalIrrelevant / totalFeatureDocChars;

  const totalIncludedDocs = perTask.reduce((a, t) => a + t.included_doc_count, 0);
  const totalStaleDocs = perTask.reduce((a, t) => a + t.stale_doc_count, 0);
  const staleContextRate = totalIncludedDocs === 0 ? null : totalStaleDocs / totalIncludedDocs;

  const historicalAnalogueRate = mean(perTask.map((t) => (t.historical_analogue_hit ? 1 : 0)));

  return {
    task_count: n,
    feature_recall: featureRecall,
    wrong_feature_rate: wrongFeatureRate,
    gold_file_recall: goldFileRecall,
    gold_file_recall_sample_size: goldFileRecallSamples.length,
    recall_at_5_full: recallAt('recall_at_k_full', 5),
    recall_at_10_full: recallAt('recall_at_k_full', 10),
    recall_at_5_feature_docs_only: recallAt('recall_at_k_feature_docs_only', 5),
    recall_at_10_feature_docs_only: recallAt('recall_at_k_feature_docs_only', 10),
    irrelevant_token_rate: irrelevantTokenRate,
    stale_context_rate: staleContextRate,
    historical_analogue_retrieval_rate: historicalAnalogueRate,
  };
}

const fsFileExists = (root, p) => existsSync(resolve(root, p));
const fsReadFileText = (root, p) => readFileSync(resolve(root, p), 'utf8');

function runRetrieval(task, { root, tmpDir }) {
  // The real CLI — this is knowledge:map, invoked exactly as a session
  // would invoke it. Its parsed JSON output IS the scored feature-level
  // data (predictedFeatures / mapFeatureRecords below), not a re-derivation.
  const mapOut = execFileSync(process.execPath, ['scripts/knowledge/map-changed-files.mjs', '--files', task.seed_file], {
    cwd: root,
    encoding: 'utf8',
  });
  const mapJson = JSON.parse(mapOut);
  const predictedFeatures = mapJson.impactedFeatures.map((f) => f.id);

  // Cross-check: the real knowledge:context CLI must run cleanly end to end
  // for this seed file, and its rendered output must actually contain every
  // doc header buildDocEntries() independently computed below — if it does
  // not, the two have drifted and that is a bug worth knowing about, not
  // something to paper over.
  const outFile = resolve(tmpDir, `${task.id}.md`);
  execFileSync(
    process.execPath,
    ['scripts/knowledge/generate-context-pack.mjs', '--files', task.seed_file, '--task', task.task_description, '--output', outFile],
    { cwd: root },
  );
  const packText = readFileSync(outFile, 'utf8');

  const docEntries = buildDocEntries(mapJson.impactedFeatures, { root, readFileText: fsReadFileText, fileExists: fsFileExists });
  for (const doc of docEntries) {
    const header = doc.included ? `## ${doc.path}` : `## Missing Doc: ${doc.path}`;
    if (!packText.includes(header)) {
      throw new Error(
        `bench cross-check failed for task "${task.id}": knowledge:context's real output does not contain the expected header ${JSON.stringify(header)} — the reconstructed doc list has drifted from the live CLI.`,
      );
    }
  }

  return { predictedFeatures, mapFeatureRecords: mapJson.impactedFeatures, docEntries };
}

function pct(v) {
  return v === null ? 'N/A' : `${(v * 100).toFixed(0)}%`;
}

function renderReport(goldSet, perTask, aggregate) {
  const lines = [];
  lines.push('<!-- markdownlint-disable -->\n# Context Retrieval Bench');
  lines.push('');
  lines.push(
    '<!-- GENERATED by scripts/knowledge/bench.mjs — do not hand-edit. Re-run `npm run knowledge:bench`. -->',
  );
  lines.push('');
  lines.push(
    `Scored against gold set \`${DEFAULT_GOLD_SET}\` (schema ${goldSet.schema_version}, frozen ${goldSet.frozen_at} against commit ${goldSet.frozen_against_commit}), ${aggregate.task_count} tasks.`,
  );
  lines.push('');
  lines.push(`> ${goldSet.known_limitation}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value | What it measures |');
  lines.push('| --- | --- | --- |');
  lines.push(`| Feature recall | ${pct(aggregate.feature_recall)} | gold feature present in knowledge:map's output for the seed file |`);
  lines.push(`| Wrong-feature rate | ${pct(aggregate.wrong_feature_rate)} | knowledge:map returned a feature outside the gold set |`);
  lines.push(`| Gold-file recall | ${pct(aggregate.gold_file_recall)} (n=${aggregate.gold_file_recall_sample_size}) | other incident files reachable via the matched feature's own code globs |`);
  lines.push(`| Recall@5 (feature docs only) | ${pct(aggregate.recall_at_5_feature_docs_only)} | gold feature doc within the first 5 feature-specific docs |`);
  lines.push(`| Recall@10 (feature docs only) | ${pct(aggregate.recall_at_10_feature_docs_only)} | gold feature doc within the first 10 feature-specific docs |`);
  lines.push(`| Recall@5 (full ordered list) | ${pct(aggregate.recall_at_5_full)} | same, but counting the 3 fixed docs (AGENTS.md/CLAUDE.md/registry.yml) against the budget |`);
  lines.push(`| Recall@10 (full ordered list) | ${pct(aggregate.recall_at_10_full)} | same, K=10 |`);
  lines.push(`| Irrelevant-token % | ${pct(aggregate.irrelevant_token_rate)} | share of feature-doc characters owned by a feature outside the gold set |`);
  lines.push(`| Stale-context % | ${pct(aggregate.stale_context_rate)} | share of included docs flagged SUPERSEDED/HISTORICAL/archived |`);
  lines.push(`| Historical-analogue retrieval rate | ${pct(aggregate.historical_analogue_retrieval_rate)} | pack includes any \`memory/incidents/**\` path |`);
  lines.push('');
  lines.push('## Per-task detail');
  lines.push('');
  lines.push('| Task | Gold feature | Predicted | Feature hit | Wrong features | Gold-file recall |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const t of perTask) {
    lines.push(
      `| ${t.id} | ${t.gold_feature} | ${t.predicted_features.join(', ') || '(none)'} | ${t.feature_recall_hit ? 'yes' : 'no'} | ${t.wrong_features.join(', ') || '—'} | ${t.gold_file_recall === null ? 'N/A' : pct(t.gold_file_recall)} |`,
    );
  }
  lines.push('');
  lines.push('## Reading these numbers');
  lines.push('');
  lines.push(
    'This is a first run against an 11-task gold set — read every number above as directional, per K.7\'s own instruction, not a release gate. Two findings worth acting on rather than averaging away:',
  );
  lines.push('');
  lines.push(
    '- Several seed files this gold set uses map to **zero** features under `memory/registry.yml` today (`src/lib/utils/emergency-save.ts`, `src/app/api/account/delete/route.ts`, `src/app/api/cron/event-reminders/route.ts`, `src/hooks/use-presence.ts`, `src/lib/settled-failures.ts`) — each is a real file this task\'s own incident names as the fix location. These are genuine `memory/registry.yml` coverage gaps, not bench artifacts; each pulls feature_recall and gold_file_recall down for its task by construction.',
  );
  lines.push(
    '- `src/lib/golf/qualifier-lifecycle.ts` maps only to `golf_round_lifecycle`, not `qualifiers`, even though it is the fix location for a qualifiers-feature incident (`INC-2026-08-22-end-date-closed-qualifier-early`) — another real gap, not an artifact.',
  );
  lines.push(
    "- Most of the wrong-feature rate traces to one cause: `team_access_control`'s registered `db` glob is `supabase/migrations/*.sql` — every migration file, unconditionally — so any migration-file seed picks it up regardless of content. That is a defensible design (RLS/grants touch most migrations, and team_access_control is explicitly this repo's cross-cutting authorization feature), not obviously a bug, but it does mean `wrong_feature_rate` on a migration-seeded task should be read alongside which feature was flagged, not as a flat score.",
  );
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const goldSetPath = process.argv[2] ?? DEFAULT_GOLD_SET;
  const goldSet = JSON.parse(readFileSync(resolve(ROOT, goldSetPath), 'utf8'));

  const registry = await loadRegistry(ROOT);
  const tmpDir = resolve(tmpdir(), `helmv3-retrieval-bench-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const retiredCache = new Map();
  const retiredLookup = (path) => {
    if (retiredCache.has(path)) return retiredCache.get(path);
    let head = null;
    try {
      head = readFileSync(resolve(ROOT, path), 'utf8').slice(0, 1500);
    } catch {
      head = null;
    }
    const result = isRetiredDoc(path, head);
    retiredCache.set(path, result);
    return result;
  };

  const perTask = [];
  for (const task of goldSet.tasks) {
    const { predictedFeatures, mapFeatureRecords, docEntries } = runRetrieval(task, { root: ROOT, tmpDir });
    const feature = registry.features?.[task.gold_feature];
    const goldDocPath = feature?.docs?.feature ?? null;
    perTask.push(
      scoreTask(task, {
        predictedFeatures,
        mapFeatureRecords,
        registryFeatures: registry.features ?? {},
        docEntries,
        goldDocPath,
        retiredLookup,
      }),
    );
  }

  const aggregate = aggregateScores(perTask);

  const reportDir = resolve(ROOT, 'docs/generated');
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
  writeFileSync(resolve(ROOT, REPORT_JSON), JSON.stringify({ goldSet: { schema_version: goldSet.schema_version, frozen_at: goldSet.frozen_at, frozen_against_commit: goldSet.frozen_against_commit }, perTask, aggregate }, null, 2) + '\n');
  writeFileSync(resolve(ROOT, REPORT_MD), renderReport(goldSet, perTask, aggregate) + '\n');

  console.log(`knowledge:bench: scored ${aggregate.task_count} tasks. feature_recall=${pct(aggregate.feature_recall)} wrong_feature_rate=${pct(aggregate.wrong_feature_rate)} gold_file_recall=${pct(aggregate.gold_file_recall)}`);
  console.log(`Wrote ${REPORT_MD} and ${REPORT_JSON}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
