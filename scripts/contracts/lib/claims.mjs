/**
 * claims.mjs — turn gathered sources into a flat list of Claim objects.
 *
 * A Claim is the compiler's atomic unit:
 *
 *   {
 *     id: string,                // stable within one run
 *     kind: string,               // route|component|action|api|service|test|
 *                                  // required_check|observability|status|owner|
 *                                  // observability_manifest|table|view|function|
 *                                  // rls_policy|business_rule|ui_contract|risk|
 *                                  // current_state|core_data|data_flow|
  *                                 // architecture_decision|ledger_entry|other
 *     text: string,
 *     source: { kind, path, line, heading },
 *     date: string|null,          // YYYY-MM-DD if the claim carries one
 *     sha: string|null,
 *     refs: { paths: string[], globs: string[], identifiers: string[] },
 *     verified: 'exists'|'absent'|'not_checked',
 *   }
 *
 * `refs` is what supersede.mjs checks against tracked files / generated
 * schema truth — extraction and verification are deliberately separate
 * passes so a claim's evidence can be inspected independent of the verdict.
 */
import { escapeRegExp } from './regex.mjs';
import {
  getFeatureBlock,
  findLineForValue,
  findLineForKey,
} from './registry.mjs';

const PATH_TOKEN_RE =
  /(?:^|[\s`"([|])((?:src|docs|memory|scripts|supabase|e2e|tools|public)\/[A-Za-z0-9._/[\]()@*-]+)/g;
/**
 * Same shape as check-doc-schema-drift.mjs's IDENT_RE (this repo's hard rule
 * is every table carries a sport prefix), reused here for ONE feature's
 * already-scoped text, not as a second repo-wide schema-drift pass — see
 * supersede.mjs's header for what this module does and does not reimplement.
 */
const IDENT_RE = /\b((?:golf|baseball)_[a-z0-9_]{3,})\b/g;

function extractRefs(text) {
  const paths = new Set();
  const globs = new Set();
  const identifiers = new Set();
  if (text) {
    for (const m of text.matchAll(PATH_TOKEN_RE)) {
      const token = m[1].replace(/[.,;:)]+$/, '');
      // A token containing `*` is a glob, not a literal path — matchGlob
      // understands `**`/`*`; a plain existence/prefix check (pathResolves
      // in supersede.mjs) does not, and would treat the literal asterisks as
      // filename characters that can never match a real path. Observed:
      // memory/features/coachhelm-ai.md's own `src/lib/coachhelm/v2/**`
      // reference false-flagged as absent before this split existed.
      if (token.includes('*')) globs.add(token);
      else paths.add(token);
    }
    for (const m of text.matchAll(IDENT_RE)) {
      if (!m[1].endsWith('_')) identifiers.add(m[1]);
    }
  }
  return { paths: [...paths], globs: [...globs], identifiers: [...identifiers] };
}

let claimCounter = 0;
function makeClaim({ kind, text, source, date = null, sha = null, refs = null }) {
  claimCounter += 1;
  return {
    id: `c${claimCounter}-${kind}`,
    kind,
    text: text.trim(),
    source,
    date,
    sha,
    refs: refs ?? { paths: [], globs: [], identifiers: [] },
    verified: 'not_checked',
  };
}

/** Reset the id counter — call once per resolve() run so ids stay stable
 * within a run and tests can assert on them without global leakage. */
export function resetClaimCounter() {
  claimCounter = 0;
}

const CODE_CATEGORY_KIND = {
  routes: 'route',
  components: 'component',
  api: 'api',
  actions: 'action',
  services: 'service',
  db: 'db',
  tests: 'test',
};

/** Claims from the registry.yml entry itself — the semantic router, and per
 * ADR-2026-08-30-helm-knowledge-authority.md §1 row 3, the authority for
 * "which files belong to which feature". */
export function claimsFromRegistry(featureId, entry, rawRegistryText) {
  const claims = [];
  const block = getFeatureBlock(rawRegistryText, featureId);
  const path = 'memory/registry.yml';

  claims.push(
    makeClaim({
      kind: 'status',
      text: `status: ${entry.status ?? 'unknown'}; criticality: ${entry.criticality ?? 'unknown'}`,
      source: { kind: 'registry', path, line: findLineForKey(block, 'status'), heading: featureId },
    }),
  );
  claims.push(
    makeClaim({
      kind: 'owner',
      text: `owner: ${entry.owner ?? 'unknown'}`,
      source: { kind: 'registry', path, line: findLineForKey(block, 'owner'), heading: featureId },
    }),
  );

  const featureKeys = entry.observability?.feature_keys;
  if (Array.isArray(featureKeys) && featureKeys.length > 0) {
    claims.push(
      makeClaim({
        kind: 'observability',
        text: `runtime FeatureKey vocabulary: [${featureKeys.join(', ')}]`,
        source: { kind: 'registry', path, line: findLineForKey(block, 'feature_keys'), heading: featureId },
      }),
    );
  } else if (typeof entry.observability?.reason === 'string') {
    claims.push(
      makeClaim({
        kind: 'observability',
        text: `zero FeatureKeys, declared reason: ${entry.observability.reason}`,
        source: { kind: 'registry', path, line: findLineForKey(block, 'reason'), heading: featureId },
      }),
    );
  }

  const code = entry.code ?? {};
  for (const [category, kind] of Object.entries(CODE_CATEGORY_KIND)) {
    const values = Array.isArray(code[category]) ? code[category] : [];
    for (const value of values) {
      claims.push(
        makeClaim({
          kind,
          text: value,
          source: { kind: 'registry', path, line: findLineForValue(block, value), heading: `code.${category}` },
          refs: { paths: [], globs: [value], identifiers: [] },
        }),
      );
    }
  }

  for (const check of entry.review?.required_checks ?? []) {
    claims.push(
      makeClaim({
        kind: 'required_check',
        text: check,
        source: {
          kind: 'registry',
          path,
          line: findLineForValue(block, check),
          heading: 'review.required_checks',
        },
      }),
    );
  }

  if (Array.isArray(entry.integrations) && entry.integrations.length > 0) {
    claims.push(
      makeClaim({
        kind: 'other',
        text: `declared integrations: ${entry.integrations.join(', ')}`,
        source: { kind: 'registry', path, line: findLineForKey(block, 'integrations'), heading: featureId },
      }),
    );
  }

  return claims;
}

/**
 * Claims from src/lib/admin/feature-registry.ts — the runtime observability
 * vocabulary (ADR §4). One claim per FeatureKey this feature owns, extracted
 * as the brace-matched object literal around `key: '<featureKey>'` — a
 * bounded structural grab, not a TS parse.
 */
export function claimsFromFeatureRegistry(sources) {
  const { featureRegistryText, featureRegistryPath, featureKeys } = sources;
  const claims = [];
  if (!featureRegistryText || featureKeys.length === 0) return claims;

  const lines = featureRegistryText.split('\n');
  for (const key of featureKeys) {
    const keyRe = new RegExp(`key:\\s*['"]${escapeRegExp(key)}['"]`);
    const lineIdx = lines.findIndex((l) => keyRe.test(l));
    if (lineIdx === -1) {
      claims.push(
        makeClaim({
          kind: 'observability_manifest',
          text: `FeatureKey '${key}' is declared in memory/registry.yml but NOT found in ${featureRegistryPath}`,
          source: { kind: 'feature_registry_ts', path: featureRegistryPath, line: null, heading: key },
        }),
      );
      continue;
    }
    // Walk backward to the object literal's opening brace, forward to its
    // matching close, bounded so one malformed file can't hang extraction.
    let openLine = lineIdx;
    while (openLine > 0 && !lines[openLine].includes('{') && lineIdx - openLine < 20) openLine -= 1;
    let depth = 0;
    let closeLine = lineIdx;
    for (let i = openLine; i < Math.min(lines.length, openLine + 60); i += 1) {
      for (const ch of lines[i]) {
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
      }
      if (depth <= 0 && i > openLine) {
        closeLine = i;
        break;
      }
    }
    const chunk = lines.slice(openLine, closeLine + 1).join('\n');
    claims.push(
      makeClaim({
        kind: 'observability_manifest',
        text: chunk,
        source: { kind: 'feature_registry_ts', path: featureRegistryPath, line: openLine + 1, heading: key },
      }),
    );
  }
  return claims;
}

const H2_RE = /^## (.+)$/;
const H3_RE = /^### (.+)$/;
const DATE_MARKER_RE = /\((?:updated|added)\s+(\d{4}-\d{2}-\d{2})\)/i;

const SECTION_KIND = {
  status: 'status',
  'current state': 'current_state',
  'primary entry points': 'other',
  routes: 'route',
  components: 'component',
  'actions and services': 'action',
  'actions and apis': 'action',
  'actions and engine code': 'action',
  actions: 'action',
  'related engine code': 'service',
  'engine code': 'service',
  'core data': 'core_data',
  'data flow': 'data_flow',
  'business rules': 'business_rule',
  'ui contract': 'ui_contract',
  'known risk areas': 'risk',
  'tests to prefer': 'test',
  'related docs': 'other',
};

function sectionKind(heading) {
  const key = heading
    .replace(DATE_MARKER_RE, '')
    .trim()
    .toLowerCase();
  return SECTION_KIND[key] ?? 'other';
}

/** Bound how many paragraph-blocks one section contributes, so a 400-line
 * Business Rules section (memory/features/admin-platform.md's is 429 lines)
 * cannot silently balloon claim counts — dropped blocks are LOGGED per
 * .claude/rules/quality-gates.md §1 ("log() what was dropped"), never
 * silently truncated. */
const MAX_BLOCKS_PER_SECTION = 40;

/**
 * Claims from memory/features/<id>.md — split into H2 (and H3-nested) named
 * sections, each section split further into blank-line-delimited blocks.
 * Each block is one claim; every block is scanned for repo-relative paths
 * and golf_/baseball_ identifiers so supersede.mjs can existence-check it.
 */
export function claimsFromFeatureDoc(sources, log = () => {}) {
  const { featureDocText, featureDocPath } = sources;
  const claims = [];
  if (!featureDocText) return claims;

  const lines = featureDocText.split('\n');
  // sections: [{ heading, h3, kind, startLine, endLine }]
  const sections = [];
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const h2 = lines[i].match(H2_RE);
    const h3 = lines[i].match(H3_RE);
    if (h2) {
      if (current) current.endLine = i;
      current = { heading: h2[1].trim(), h3: null, startLine: i + 1 };
      sections.push(current);
    } else if (h3 && current) {
      current.endLine = i;
      current = { heading: current.heading, h3: h3[1].trim(), startLine: i + 1 };
      sections.push(current);
    }
  }
  if (current) current.endLine = lines.length;

  for (const section of sections) {
    const kind = sectionKind(section.h3 ?? section.heading);
    const dateMatch = section.heading.match(DATE_MARKER_RE);
    const bodyLines = lines.slice(section.startLine, section.endLine);
    const heading = section.h3 ? `${section.heading} > ${section.h3}` : section.heading;

    // Split into blank-line-delimited blocks, tracking each block's start line.
    const blocks = [];
    let blockLines = [];
    let blockStart = section.startLine;
    for (let i = 0; i < bodyLines.length; i += 1) {
      const line = bodyLines[i];
      if (line.trim() === '') {
        if (blockLines.length > 0) {
          blocks.push({ text: blockLines.join('\n'), line: blockStart + 1 });
          blockLines = [];
        }
        blockStart = section.startLine + i + 1;
      } else {
        if (blockLines.length === 0) blockStart = section.startLine + i;
        blockLines.push(line);
      }
    }
    if (blockLines.length > 0) blocks.push({ text: blockLines.join('\n'), line: blockStart + 1 });

    const kept = blocks.slice(0, MAX_BLOCKS_PER_SECTION);
    if (blocks.length > MAX_BLOCKS_PER_SECTION) {
      log(
        `feature doc ${featureDocPath} section "${heading}": ${blocks.length} blocks, ` +
          `kept first ${MAX_BLOCKS_PER_SECTION}, dropped ${blocks.length - MAX_BLOCKS_PER_SECTION}`,
      );
    }

    for (const block of kept) {
      claims.push(
        makeClaim({
          kind,
          text: block.text,
          source: { kind: 'feature_doc', path: featureDocPath, line: block.line, heading },
          date: dateMatch ? dateMatch[1] : null,
          refs: extractRefs(block.text),
        }),
      );
    }
  }

  return claims;
}

const LEDGER_ENTRY_RE = /^## (\d{4}-\d{2}-\d{2}) — (.+)$/;
const SHA_RE = /SHA:\s*(?:branch `([^`]+)`|`?([0-9a-f]{7,40})`?)/;
const PR_RE = /PR #(\d+)|PR pending/;

/**
 * Claims from an append-only ledger (memory/ledgers/changes/<id>.md or
 * memory/ledgers/tests/<id>.md) — one claim per dated `## YYYY-MM-DD —
 * <title>` entry, the whole entry body as the claim text.
 */
export function claimsFromLedger(path, text, ledgerKind) {
  const claims = [];
  if (!text) return claims;
  const lines = text.split('\n');
  const entries = [];
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(LEDGER_ENTRY_RE);
    if (m) {
      if (current) current.endLine = i;
      current = { date: m[1], title: m[2].trim(), startLine: i, endLine: lines.length };
      entries.push(current);
    }
  }
  if (current) current.endLine = lines.length;

  for (const entry of entries) {
    const body = lines.slice(entry.startLine, entry.endLine).join('\n');
    const shaMatch = body.match(SHA_RE);
    const prMatch = body.match(PR_RE);
    const sha = shaMatch ? shaMatch[2] ?? shaMatch[1] ?? null : null;
    claims.push(
      makeClaim({
        kind: 'ledger_entry',
        text: body,
        source: { kind: ledgerKind, path, line: entry.startLine + 1, heading: entry.title },
        date: entry.date,
        sha,
        refs: extractRefs(body),
      }),
    );
    if (prMatch && prMatch[1]) claims[claims.length - 1].pr = prMatch[1];
  }
  return claims;
}

const ADR_STATUS_RE = /\*\*Status:\*\*\s*([^·\n]+)/;
const ADR_DATE_RE = /\*\*Date:\*\*\s*([^·\n]+)/;
const ADR_SUPERSEDES_RE = /\*\*Supersedes:\*\*\s*([^·\n]+)/;
const ADR_ANCHOR_RE = /\*\*Anchor SHA:\*\*\s*`?([0-9a-f]{7,40})`?/;

/**
 * Claims from memory/decisions/ADR-*.md — included only when the ADR's body
 * actually names this feature (its canonical id or its feature-doc path),
 * per this tool's authority ordering (ADRs are architectural, not routine
 * per-feature history — memory/decisions/README.md). A repo-wide ADR that
 * never mentions this feature is correctly excluded, not silently missed.
 */
export function claimsFromAdrs(sources, canonicalId, featureDocPath) {
  const claims = [];
  const relevant = [];
  for (const { path, text } of sources.adrFiles) {
    if (!text) continue;
    const mentionsId = new RegExp(`\\b${escapeRegExp(canonicalId)}\\b`).test(text);
    const mentionsDoc = featureDocPath ? text.includes(featureDocPath) : false;
    if (!mentionsId && !mentionsDoc) continue;
    relevant.push({ path, text });

    const titleMatch = text.match(/^#\s+(.+)$/m);
    const decisionStart = text.indexOf('\n## Decision');
    const decisionEnd = decisionStart === -1 ? -1 : text.indexOf('\n## ', decisionStart + 1);
    const decisionText =
      decisionStart === -1
        ? text.slice(0, 1500)
        : text.slice(decisionStart, decisionEnd === -1 ? text.length : decisionEnd).slice(0, 2000);

    const status = text.match(ADR_STATUS_RE)?.[1]?.trim() ?? 'unknown';
    const date = text.match(ADR_DATE_RE)?.[1]?.trim() ?? null;
    const supersedes = text.match(ADR_SUPERSEDES_RE)?.[1]?.trim() ?? null;
    const anchorSha = text.match(ADR_ANCHOR_RE)?.[1] ?? null;

    const claim = makeClaim({
      kind: 'architecture_decision',
      text: decisionText,
      source: { kind: 'adr', path, line: 1, heading: titleMatch ? titleMatch[1] : path },
      date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      sha: anchorSha,
    });
    claim.adrStatus = status;
    claim.adrSupersedes = supersedes && supersedes.toLowerCase() !== 'nothing' ? supersedes : null;
    claims.push(claim);
  }
  return { claims, relevantAdrFiles: relevant };
}

const TABLE_OBJECT_RE =
  /CREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|VIEW|FUNCTION|POLICY)\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z0-9_.]+)"?/gi;

/**
 * Claims from migrations matching this feature's `code.db` globs — the
 * objects each migration creates/replaces, cross-checkable against
 * `src/lib/types/database.ts` by supersede.mjs. This extracts NAMES only; it
 * does not attempt column-level or RLS-policy-body comparison, which is
 * scripts/check-doc-schema-drift.mjs's and .claude/rules/database.md's job,
 * not this tool's.
 */
export function claimsFromMigrations(sources) {
  const claims = [];
  for (const { path, text } of sources.migrationFiles) {
    if (!text) continue;
    const lines = text.split('\n');
    const seen = new Set();
    for (let i = 0; i < lines.length; i += 1) {
      // Migration headers narrate their own DDL in `--` comments (e.g.
      // "-- CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION /") —
      // confirmed against three real false hits in this worktree
      // (supabase/migrations/20260624000081_baseball_staff_roles_scope_
      // audit.sql:29 among them) before this guard existed. A real DDL
      // statement never starts a line with `--`.
      if (lines[i].trim().startsWith('--')) continue;
      TABLE_OBJECT_RE.lastIndex = 0;
      const m = TABLE_OBJECT_RE.exec(lines[i]);
      if (!m) continue;
      const type = m[1].toUpperCase();
      const name = m[2].replace(/^public\./, '');
      const dedupeKey = `${type}:${name}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const kind = { TABLE: 'table', VIEW: 'view', FUNCTION: 'function', POLICY: 'rls_policy' }[type];
      // src/lib/types/database.ts is generated from what PostgREST exposes —
      // public/graphql_public schema tables, views and functions ONLY. It is
      // not ground truth, and cannot ever be, for:
      //   - POLICY names — RLS policies have no type-level representation at
      //     all, in any schema; every one would false-positive as "absent".
      //   - a schema-qualified name outside public/graphql_public (e.g.
      //     `helm_private.guard_golf_round_lifecycle`, `helm_debug.*`) — those
      //     schemas are deliberately NOT PostgREST-exposed (that is the whole
      //     point of a "private" schema per memory/decisions/ADR-2026-08-30-
      //     helm-knowledge-authority.md's helm_debug precedent), so their
      //     absence from database.ts proves nothing.
      // Confirmed empirically against this worktree: `public.` functions like
      // `recalculate_round_strokes_gained` ARE in database.ts;
      // `helm_private.*` functions are not, by design, not by drift.
      const schemaQualified = name.includes('.') && !name.startsWith('public.');
      // Same reasoning, third case: a TRIGGER function (`RETURNS trigger`) is
      // never RPC-callable, so it is never in database.ts's Functions block
      // either — confirmed against this worktree's own
      // prevent_golf_qualifier_round_cap_regression(), which returns trigger
      // and is genuinely absent while its public-schema RPC neighbours in the
      // same file are genuinely present. Look a bounded few lines ahead for
      // the `RETURNS trigger` that always immediately follows a function's
      // signature line in this repo's migrations.
      const isTriggerFunction =
        type === 'FUNCTION' && lines.slice(i, i + 4).some((l) => /RETURNS\s+trigger\b/i.test(l));
      const checkableIdentifier =
        kind === 'rls_policy' || schemaQualified || isTriggerFunction ? [] : [name];
      claims.push(
        makeClaim({
          kind,
          text: `${type} ${name}`,
          source: { kind: 'migration', path, line: i + 1, heading: null },
          refs: { paths: [], globs: [], identifiers: checkableIdentifier },
        }),
      );
    }
  }
  return claims;
}
