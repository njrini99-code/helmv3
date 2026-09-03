/**
 * supersede.mjs — mark which extracted claims are CURRENT and which are
 * SUPERSEDED, with evidence and a confidence tier per finding.
 *
 * WHAT THIS DOES NOT ATTEMPT
 *
 * Natural-language contradiction detection between two prose claims.
 * `check-authority.mjs`'s header explains why: a paragraph that says
 * something false is not something a pattern can find, and a checker that
 * claims otherwise is worse than none — a green run then reads as "no
 * contradictions". Every mechanical finding below resolves to something
 * checkable (a path either has a tracked file matching it or it does not; an
 * identifier either appears in generated schema truth or it does not).
 *
 * NOR DOES THIS REIMPLEMENT scripts/check-doc-schema-drift.mjs.
 *
 * That script is a repo-wide gate with a baseline ratchet, a `<!--
 * schema-drift-absent: ... -->` declared-absence convention, and full-corpus
 * identifier extraction across `memory/` and `.claude/rules/`. This module
 * checks a MUCH narrower thing — for the identifiers already extracted from
 * ONE feature's already-gathered sources, does the identifier appear in
 * `src/lib/types/database.ts` — and reuses that exact file as ground truth
 * (the same source that script's own header names as canonical) rather than
 * re-deriving what "the schema" means. It also reads that script's own
 * baseline (`.doc-schema-baseline.json`) to distinguish a known, already-
 * tracked absence from a brand new one — never writes to it.
 *
 * THREE CONFIDENCE TIERS, kept visually distinct in every renderer
 * (mirrors check-authority.mjs's own "REPORTED, never failed" split between
 * structural findings and prose "authority language"):
 *
 *   mechanical   — a path/identifier verifiably does not exist. Zero
 *                  interpretation; either `git ls-files` /
 *                  `src/lib/types/database.ts` has it or it doesn't.
 *   structured   — an ADR's own `**Supersedes:**` header names another ADR.
 *                  Zero interpretation of prose meaning; a declared field.
 *   heuristic    — a ledger entry matches a curated correction-marker
 *                  phrase (e.g. "Stale-warning correction:", literally used
 *                  in memory/ledgers/changes/admin_platform.md) and,
 *                  best-effort, is linked to the earlier entry it most
 *                  resembles by shared vocabulary. This is a PROMPT FOR A
 *                  HUMAN, not a verdict — never treated as equal-confidence
 *                  to the other two tiers in any renderer.
 */
import { matchGlob } from '../../knowledge/lib/registry.mjs';

/**
 * Curated, TIGHT marker set — deliberately narrower than a bare "no longer",
 * which this repo's own ledgers use constantly to describe ordinary product
 * behavior change ("the auto-save fallback no longer deletes an ...") and
 * would false-positive on almost every entry. These are the phrases actually
 * observed in this repo's ledgers marking a DOC/CLAIM correction, not a
 * behavior change: memory/ledgers/changes/admin_platform.md:96,779;
 * memory/ledgers/changes/qualifiers.md:25.
 */
const CORRECTION_MARKER_RE =
  /\b(stale-warning correction|correction:|was stale against|superseded (by|date-based)|is no longer (accurate|true|correct)|used to (say|read|claim)|previously (said|read|claimed)|this (section|line|paragraph|entry) said)\b/i;

const STOPWORDS = new Set(
  'the a an of to in on for and or is are was were be been being this that with as at by from into it its it\'s not no'.split(
    ' ',
  ),
);

function significantWords(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[`*_#()[\]]/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function markSuperseded(claim, superseded) {
  claim.superseded = superseded;
}

/**
 * A NEGATED assertion is not a stale claim — it is a claim ABOUT an absence,
 * and is correct precisely because the path doesn't resolve. Same exemption
 * scripts/check-doc-path-drift.mjs makes, for the same reason: flagging it
 * would demand a session "fix" a true statement.
 */
const NEGATED_RE =
  /\b(there is no|there's no|no longer exist|does not exist|doesn't exist|never existed|was removed|has been removed|not present)\b/i;

/**
 * Does `path` resolve against the tracked-file set? Mirrors
 * check-doc-path-drift.mjs's `resolves()` — extensionless module references
 * and directory references are both legitimate doc shapes — but against a
 * `Set<string>` of tracked files rather than a real filesystem, which needs
 * one more case that script doesn't: a bare directory reference
 * (`supabase/tests/rls/`, no glob, no filename) has no filesystem entry of
 * its own in `git ls-files` — only files WITHIN it — so it resolves via a
 * prefix check, not an exact or suffixed match.
 */
function pathResolves(path, trackedFiles) {
  const q = path.replace(/\/+$/, '');
  const candidates = [q, `${q}.ts`, `${q}.tsx`, `${q}.mjs`, `${q}.js`, `${q}.sql`, `${q}.md`, `${q}/index.ts`, `${q}/index.tsx`];
  if (candidates.some((c) => trackedFiles.has(c))) return true;
  const prefix = `${q}/`;
  for (const f of trackedFiles) {
    if (f.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * EXISTENCE checks — the mechanical tier. Runs over every claim whose
 * `refs.globs` or `refs.paths` names something that should resolve against
 * tracked files.
 */
export function checkPathExistence(claims, trackedFiles, headShaShort, log = () => {}) {
  for (const claim of claims) {
    if (NEGATED_RE.test(claim.text)) continue;
    const globs = claim.refs?.globs ?? [];
    const paths = claim.refs?.paths ?? [];
    if (globs.length === 0 && paths.length === 0) continue;

    const missingGlobs = [];
    for (const glob of globs) {
      const hasMatch = [...trackedFiles].some((f) => matchGlob(glob, f));
      if (!hasMatch) missingGlobs.push(glob);
    }
    const missingPaths = paths.filter((p) => !pathResolves(p, trackedFiles));

    const allMissing =
      missingGlobs.length === globs.length && missingPaths.length === paths.length && (globs.length + paths.length) > 0;
    claim.verified = allMissing ? 'absent' : 'exists';

    // Only flag when EVERY path/glob this block names is missing — a block
    // naming several paths where most still resolve is not a stale claim,
    // it is a claim about several things, most of them still true.
    if (allMissing) {
      const missing = [...missingGlobs, ...missingPaths];
      markSuperseded(claim, {
        reason: 'ABSENT_FROM_TRACKED_FILES',
        confidence: 'mechanical',
        evidence: `${missing.join(', ')} — matches 0 files in \`git ls-files\` as of ${headShaShort}`,
      });
    }
  }
}

/**
 * SCHEMA existence checks — the mechanical tier, database-object flavor.
 * Excludes: (a) any identifier that is itself a registry.yml feature id
 * (same exclusion check-doc-schema-drift.mjs makes — a feature id matching
 * the golf_/baseball_ shape is not a table name), (b) any identifier the
 * feature doc/ledger text declares absent via the same
 * `<!-- schema-drift-absent: ... -->` marker that script recognizes.
 */
export function checkSchemaExistence(claims, sources, registryFeatureIds, log = () => {}) {
  const { databaseTypesText, schemaBaselineIdentifiers, featureDocText, ledgerChangesText } = sources;
  if (!databaseTypesText) {
    log('src/lib/types/database.ts not readable — schema-existence checks skipped');
    return;
  }

  const declaredAbsent = new Set();
  const absentRe = /<!--\s*schema-drift-absent:\s*([^>]*?)\s*-->/g;
  for (const text of [featureDocText, ledgerChangesText]) {
    if (!text) continue;
    for (const m of text.matchAll(absentRe)) {
      for (const name of m[1].split(',').map((x) => x.trim()).filter(Boolean)) declaredAbsent.add(name);
    }
  }

  for (const claim of claims) {
    const identifiers = claim.refs?.identifiers ?? [];
    if (identifiers.length === 0) continue;
    const missing = [];
    for (const ident of identifiers) {
      if (registryFeatureIds.has(ident)) continue; // feature id, not a DB object
      if (declaredAbsent.has(ident)) continue; // documented-because-absent
      const present = new RegExp(`\\b${ident}\\b`).test(databaseTypesText);
      if (!present) missing.push(ident);
    }
    if (missing.length === 0) continue;
    const known = missing.filter((m) => schemaBaselineIdentifiers.has(m));
    const brandNew = missing.filter((m) => !schemaBaselineIdentifiers.has(m));
    markSuperseded(claim, {
      reason: 'ABSENT_FROM_GENERATED_SCHEMA_TYPES',
      confidence: 'mechanical',
      evidence:
        `${missing.join(', ')} not found in src/lib/types/database.ts` +
        (known.length > 0 ? ` (${known.join(', ')} already tracked in .doc-schema-baseline.json)` : '') +
        (brandNew.length > 0 ? ` (${brandNew.join(', ')} NOT yet in .doc-schema-baseline.json — run npm run docs:schema-drift)` : ''),
    });
  }
}

/**
 * LEDGER self-correction — the heuristic tier. An entry matching
 * CORRECTION_MARKER_RE is linked, best-effort, to the earlier same-file
 * entry with the highest shared-vocabulary overlap above a low bar. Below
 * the bar, the marker is still reported — just with no automatic target.
 */
export function checkLedgerCorrections(ledgerClaims) {
  // ledgerClaims must already be in file order (claimsFromLedger preserves it).
  for (let i = 0; i < ledgerClaims.length; i += 1) {
    const claim = ledgerClaims[i];
    if (!CORRECTION_MARKER_RE.test(claim.text)) continue;

    const correctionWords = significantWords(claim.text);
    let best = null;
    let bestScore = 0;
    for (let j = 0; j < i; j += 1) {
      const candidate = ledgerClaims[j];
      const score = jaccard(correctionWords, significantWords(candidate.text));
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (best && bestScore >= 0.15) {
      markSuperseded(best, {
        reason: 'LEDGER_SELF_CORRECTION',
        confidence: 'heuristic',
        evidence:
          `entry "${claim.source.heading}" (${claim.date}, ${claim.source.path}:${claim.source.line}) ` +
          `contains a correction marker and shares vocabulary (Jaccard ${bestScore.toFixed(2)}) with this entry`,
        matchedBy: 'shared-vocabulary heuristic, not semantic understanding — confirm by reading both entries',
      });
    } else {
      claim.correctionMarkerUnlinked = true;
    }
  }
}

/**
 * ADR Supersedes: header — the structured tier. Zero interpretation: the
 * field is declared, not inferred.
 */
export function checkAdrSupersedes(adrClaims, allAdrFiles) {
  const byTitleOrFilename = new Map();
  for (const { path, text } of allAdrFiles) {
    const filename = path.split('/').pop();
    byTitleOrFilename.set(filename, path);
    byTitleOrFilename.set(filename.replace(/\.md$/, ''), path);
  }

  for (const claim of adrClaims) {
    if (!claim.adrSupersedes) continue;
    // Strip surrounding backticks ONLY — the target is a filename ending in
    // `.md`, and a `.`-stripping regex here (a bug this fixture caught)
    // silently turns "ADR-x.md" into "ADR-xmd", which then never matches.
    const target = claim.adrSupersedes.replace(/`/g, '').trim();
    const targetPath = byTitleOrFilename.get(target) ?? byTitleOrFilename.get(`${target}.md`);
    const targetClaim = targetPath ? adrClaims.find((c) => c.source.path === targetPath) : null;
    if (targetClaim) {
      markSuperseded(targetClaim, {
        reason: 'ADR_SUPERSEDES_FIELD',
        confidence: 'structured',
        evidence: `${claim.source.path}'s own header declares Supersedes: ${claim.adrSupersedes}`,
      });
    }
  }
}

/** Partition claims into { current, superseded }. */
export function partition(claims) {
  const current = [];
  const superseded = [];
  for (const claim of claims) {
    if (claim.superseded) superseded.push(claim);
    else current.push(claim);
  }
  return { current, superseded };
}
