#!/usr/bin/env node
/**
 * check-doc-schema-drift.mjs — fail when the knowledge base names a database
 * object that does not exist.
 *
 * WHY THIS EXISTS
 *
 * `CLAUDE.md` orders every session to read `memory/**` before touching code
 * ("Before starting any GolfHelm task, read the file(s) that match your task
 * type"). On 2026-08-19 an audit found those docs named **59 distinct
 * `golf_*` / `baseball_*` identifiers that do not exist in production** —
 * confirmed by direct query against pg_class, pg_proc and pg_type, all 59
 * absent in every catalog. They were not marked as gaps: they were rendered
 * with full column tables, FK targets and RLS policy names, formatted
 * identically to the real ones.
 *
 * The effect is worse than staleness. A doc that is vague makes a reader
 * hesitant; a doc that is specific and wrong makes it confident. Sessions
 * produced fluent, detailed, schema-shaped work against tables that were
 * never there, and every check available to them agreed.
 *
 * `docs:check` could not catch it: it re-runs `regen-docs.mjs` and diffs the
 * output against the file, so it only ever compares the generator to itself,
 * only reads AUTOGEN blocks (every phantom lived in hand-written narrative),
 * and covers 3 files. This script closes that gap by checking doc claims
 * against the schema instead.
 *
 * MECHANISM
 *
 * Source of truth is `src/lib/types/database.ts` (produced by `npm run
 * db:types` from the live database; `db:types:check` keeps it honest). We
 * take the union of tables + views + functions + enums so that RPC names and
 * enum types are never miscounted as phantom tables — the audit's first pass
 * flagged 160 before widening the surface, and ~45 of those were legitimate
 * functions and enums. Crying wolf here would train people to ignore it.
 *
 * BASELINE
 *
 * `.doc-schema-baseline.json` records the known-bad identifiers so this can
 * land red-free and ratchet down, the same pattern as `.lint-baseline.json`
 * and `.supabase-error-baseline.json`. The count may only shrink. Adding a
 * NEW unknown identifier fails immediately; fixing one and not updating the
 * baseline also fails, so the number cannot silently drift back up.
 *
 * Usage:
 *   node scripts/check-doc-schema-drift.mjs            # check (CI + docs:check)
 *   node scripts/check-doc-schema-drift.mjs --update   # rewrite the baseline
 *
 * Pure stdlib. No child_process, no network, no deps.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const TYPES_FILE = join(ROOT, 'src/lib/types/database.ts');
const BASELINE_FILE = join(ROOT, '.doc-schema-baseline.json');

/** Docs that a session is routed to and will treat as fact. */
const SCAN_DIRS = ['memory', '.claude/rules'];
const SCAN_FILES = ['CLAUDE.md', 'AGENTS.md'];

/**
 * Identifiers matching this are database objects by naming convention — the
 * repo's hard rule is that every table carries a sport prefix
 * (CLAUDE.md "Table Names — ALWAYS Use Sport Prefix"), which is what makes
 * this greppable at all.
 */
const IDENT_RE = /\b((?:golf|baseball)_[a-z0-9_]{3,})\b/g;

/**
 * A trailing underscore means the doc wrote a prefix stub like
 * `baseball_lift_` or `baseball_box_score_`, not a real name.
 */
const isStub = (n) => n.endsWith('_');

/**
 * SEMANTIC FEATURE IDS ARE A DIFFERENT NAMESPACE.
 *
 * `memory/registry.yml` keys are snake_case and several carry a sport prefix —
 * `golf_round_lifecycle`, `baseball_core`. They match IDENT_RE exactly, and
 * they are not database objects and never will be. Any doc that discusses
 * feature routing has to name one, and until 2026-08-30 doing so in a `.md`
 * file under `memory/` failed this gate as a phantom table.
 *
 * The exclusion is DECLARED, not pattern-matched: only keys actually present
 * under `features:` in the registry are exempt, so a genuinely misspelled
 * table name is still caught. A name that is BOTH a registry key and a real
 * schema object is unaffected — it resolves against the schema first.
 *
 * Parsed with a line regex rather than a YAML dependency to keep this script
 * standalone, which is a property the file's header already relies on.
 */
async function loadFeatureIds() {
  try {
    const raw = await readFile(join(ROOT, 'memory/registry.yml'), 'utf8');
    const start = raw.indexOf('\nfeatures:');
    if (start === -1) return new Set();
    return new Set(
      [...raw.slice(start).matchAll(/^ {2}([a-z][a-z0-9_]*):$/gm)].map((m) => m[1]),
    );
  } catch {
    // Unreadable registry means no exemptions, which fails toward reporting
    // rather than toward silence.
    return new Set();
  }
}

/**
 * A DOCUMENT THAT NAMES AN OBJECT BECAUSE IT IS ABSENT.
 *
 * This gate exists because a doc naming a table that does not exist produces
 * confident, well-formatted broken code. An incident record does the opposite:
 * its whole subject can BE the absence — INC-2026-08-30 documents that
 * `golf_player_anonymize_on_unlink` is missing from production and that
 * `golf_players_user_id_fkey` is still ON DELETE CASCADE, and a reader who
 * removed those names would delete the finding.
 *
 * Baselining them would be wrong twice over: the baseline is for known-bad
 * references that should shrink, and these are neither bad nor going away until
 * the migration is applied. So the exemption is DECLARED IN THE DOCUMENT, per
 * identifier, and printed on every run:
 *
 *     <!-- schema-drift-absent: name_one, name_two -->
 *
 * It exempts only those names, only in that file. Anything else in the same
 * document is still checked, so a genuine typo two lines away is still caught.
 */
const ABSENT_RE = /<!--\s*schema-drift-absent:\s*([^>]*?)\s*-->/g;

async function loadDeclaredAbsent(files) {
  const declared = new Map();
  for (const f of files) {
    let raw;
    try {
      raw = await readFile(join(ROOT, f), 'utf8');
    } catch {
      continue;
    }
    for (const m of raw.matchAll(ABSENT_RE)) {
      for (const name of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
        declared.set(name, [...(declared.get(name) ?? []), f]);
      }
    }
  }
  return declared;
}

// ---------------------------------------------------------------------------
// Schema surface
// ---------------------------------------------------------------------------

/**
 * database.ts declares the empty `graphql_public` schema BEFORE `public`, and
 * both nest identically-indented blocks — a bare indexOf locks onto
 * graphql_public and reports an empty database. Anchor inside `public`.
 * (Same guard as regen-docs.mjs; kept local so this script stays standalone.)
 */
function publicSchemaOffset(src) {
  const start = src.indexOf('  public: {');
  return start === -1 ? 0 : start;
}

function blockText(src, blockName) {
  const start = src.indexOf(`    ${blockName}: {`, publicSchemaOffset(src));
  if (start === -1) return '';
  let depth = 0;
  let i = start + `    ${blockName}: {`.length - 1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(start, i);
}

/** Every top-level key in a block, whatever its value shape. */
function topLevelKeys(src, blockName) {
  const text = blockText(src, blockName);
  return [...text.matchAll(/^ {6}([a-z_][a-z0-9_]*):/gm)].map((m) => m[1]);
}

async function loadSchema() {
  const src = await readFile(TYPES_FILE, 'utf8');
  const parts = {
    tables: topLevelKeys(src, 'Tables'),
    views: topLevelKeys(src, 'Views'),
    functions: topLevelKeys(src, 'Functions'),
    enums: topLevelKeys(src, 'Enums'),
  };
  const all = new Set(Object.values(parts).flat());
  if (all.size === 0) {
    throw new Error(
      `No schema identifiers parsed from ${TYPES_FILE}. Refusing to run — an ` +
        `empty schema would mark every doc reference as drift.`
    );
  }
  return { parts, all };
}

// ---------------------------------------------------------------------------
// Doc scan
// ---------------------------------------------------------------------------

async function walkMarkdown(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walkMarkdown(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

async function collectDocFiles() {
  const files = [];
  for (const d of SCAN_DIRS) await walkMarkdown(join(ROOT, d), files);
  for (const f of SCAN_FILES) files.push(join(ROOT, f));
  return files;
}

/** name -> sorted list of repo-relative files that mention it */
async function scanDocs() {
  const found = new Map();
  for (const file of await collectDocFiles()) {
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const rel = file.startsWith(ROOT) ? file.slice(ROOT.length + 1) : file;
    for (const m of text.matchAll(IDENT_RE)) {
      const name = m[1];
      if (isStub(name)) continue;
      if (!found.has(name)) found.set(name, new Set());
      found.get(name).add(rel);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------

async function loadBaseline() {
  try {
    const raw = JSON.parse(await readFile(BASELINE_FILE, 'utf8'));
    return { total: raw.total ?? 0, known: new Set(raw.identifiers ?? []) };
  } catch {
    return { total: 0, known: new Set() };
  }
}

async function main() {
  const update = process.argv.includes('--update');

  const { parts, all } = await loadSchema();
  const docs = await scanDocs();
  const featureIds = await loadFeatureIds();

  // Declared-absent names are exempt only in the file that declares them, so a
  // phantom cannot hide behind another document's declaration.
  const declaredAbsent = await loadDeclaredAbsent(
    [...new Set([...docs.values()].flatMap((set) => [...set]))],
  );
  const isDeclaredAbsentEverywhere = (n) => {
    const where = declaredAbsent.get(n);
    if (!where) return false;
    return [...docs.get(n)].every((f) => where.includes(f));
  };

  const exempt = [...docs.keys()].filter((n) => !all.has(n) && featureIds.has(n)).sort();
  const absent = [...docs.keys()]
    .filter((n) => !all.has(n) && !featureIds.has(n) && isDeclaredAbsentEverywhere(n))
    .sort();
  const unknown = [...docs.keys()]
    .filter((n) => !all.has(n) && !featureIds.has(n) && !isDeclaredAbsentEverywhere(n))
    .sort();

  if (update) {
    await writeFile(
      BASELINE_FILE,
      `${JSON.stringify(
        {
          $comment:
            'Identifiers named in the knowledge base that do not exist in ' +
            'src/lib/types/database.ts. This number may only go DOWN. See ' +
            'scripts/check-doc-schema-drift.mjs for why this file exists.',
          total: unknown.length,
          identifiers: unknown,
          byFile: Object.fromEntries(
            unknown.map((n) => [n, [...docs.get(n)].sort()])
          ),
        },
        null,
        2
      )}\n`
    );
    console.log(
      `Baseline written: ${unknown.length} identifiers not in the schema.`
    );
    return;
  }

  const baseline = await loadBaseline();
  const added = unknown.filter((n) => !baseline.known.has(n));
  const fixed = [...baseline.known].filter((n) => !unknown.includes(n)).sort();

  console.log(
    `Schema surface: ${parts.tables.length} tables, ${parts.views.length} views, ` +
      `${parts.functions.length} functions, ${parts.enums.length} enums`
  );
  console.log(
    `Docs reference ${docs.size} golf_*/baseball_* identifiers; ` +
      `${unknown.length} not in the schema (baseline ${baseline.total}).`
  );
  if (exempt.length) {
    // Printed, never silent: an exemption that nobody can see is how a real
    // phantom eventually hides behind a registry key.
    console.log(
      `${exempt.length} excluded as declared memory/registry.yml feature id(s), ` +
        `not database objects: ${exempt.join(', ')}`
    );
  }

  if (absent.length) {
    // Printed, never silent — same rule as the registry-key exemption above.
    console.log(
      `${absent.length} excluded as DECLARED ABSENT — documented because they do ` +
        `not exist: ${absent.join(', ')}`
    );
  }

  let failed = false;

  if (added.length) {
    failed = true;
    console.error(
      `\n❌ ${added.length} NEW identifier(s) documented that do not exist in the schema:\n`
    );
    for (const n of added) {
      console.error(`   ${n}`);
      for (const f of [...docs.get(n)].sort()) console.error(`       ${f}`);
    }
    console.error(
      `\n   These docs are what CLAUDE.md routes sessions to read FIRST. A\n` +
        `   confident, well-formatted reference to a table that does not exist\n` +
        `   produces confident, well-formatted broken code.\n\n` +
        `   Fix the doc, or — if the object is real — run 'npm run db:types'\n` +
        `   so the schema snapshot catches up.`
    );
  }

  if (fixed.length) {
    failed = true;
    console.error(
      `\n❌ ${fixed.length} baseline identifier(s) no longer appear — the ratchet must tighten:\n`
    );
    for (const n of fixed) console.error(`   ${n}`);
    console.error(
      `\n   Run: node scripts/check-doc-schema-drift.mjs --update && git add .doc-schema-baseline.json`
    );
  }

  if (failed) process.exit(1);

  console.log(
    unknown.length === 0
      ? '\n✅ Every database object named in the knowledge base exists.'
      : `\n✅ No new drift. ${unknown.length} known issue(s) remain in the baseline — ratchet them down.`
  );
}

main().catch((err) => {
  console.error(`check-doc-schema-drift failed: ${err.message}`);
  process.exit(1);
});
