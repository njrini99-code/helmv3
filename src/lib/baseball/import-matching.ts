// =============================================================================
// src/lib/baseball/import-matching.ts
//
// Wave 6 / packet: source-registry (stats-integrations)
//
// Fuzzy + deterministic player matching for the Import Center, with stored
// confidence. Pure logic only (no DB, no 'use server') so it can run in the
// wizard preview on the server action side and be unit-tested in isolation.
//
//   * SOURCE REGISTRY — the known external systems the wizard can import from,
//     each with a header signature used to auto-detect the file's origin.
//   * DETERMINISTIC MATCH — if a row carries an external id we have already
//     mapped (baseball_player_external_ids), match by it at confidence 1.0.
//   * FUZZY MATCH — otherwise fall back to name similarity (csv-utils), then
//     decide the per-row commit action (create / update / skip).
// =============================================================================

import { findBestPlayerMatch, normalizeNameForMatch, scoreSourceSignature } from '@/lib/baseball/csv-utils';
import type {
  BaseballImportSource,
  BaseballImportRowMatch,
  BaseballImportRowAction,
  BaseballImportMatchTier,
} from '@/lib/types/baseball-imports';
import type {
  BaseballPlayerMatchStrategy,
  BaseballDedupeStrictness,
} from '@/lib/types/baseball-settings';

// -----------------------------------------------------------------------------
// Source registry
// -----------------------------------------------------------------------------

/**
 * The known external stat sources. `signatureHeaders` are the column names most
 * distinctive to that source; detection scores a file's headers against each.
 * `generic_csv` is the catch-all and always available.
 */
export const BASEBALL_IMPORT_SOURCES: readonly BaseballImportSource[] = [
  {
    id: 'trackman',
    label: 'TrackMan',
    description: 'TrackMan pitch/hit tracking exports (exit velo, spin, etc.).',
    signatureHeaders: ['exit_velocity', 'launch_angle', 'spin_rate', 'pitch_velocity'],
  },
  {
    id: 'rapsodo',
    label: 'Rapsodo',
    description: 'Rapsodo hitting/pitching unit exports.',
    signatureHeaders: ['exit_velocity', 'launch_angle', 'spin_rate'],
  },
  {
    id: 'gamechanger',
    label: 'GameChanger',
    description: 'GameChanger scorebook box-score exports.',
    signatureHeaders: ['ab', 'h', 'rbi', 'bb', 'so', 'avg'],
  },
  {
    id: 'generic_csv',
    label: 'Generic CSV',
    description: 'Any CSV with a player name column and stat columns.',
    signatureHeaders: ['player', 'name'],
  },
] as const;

/** Look up a source by id; falls back to generic_csv. */
export function getImportSource(sourceId: string): BaseballImportSource {
  return (
    BASEBALL_IMPORT_SOURCES.find((s) => s.id === sourceId) ??
    BASEBALL_IMPORT_SOURCES.find((s) => s.id === 'generic_csv')!
  );
}

/**
 * Rank the registry sources by how well the file's headers match each
 * signature. Returns sources best-first with their score; the top entry is the
 * wizard's auto-detect suggestion.
 */
export function detectSource(
  headers: string[]
): Array<{ source: BaseballImportSource; score: number }> {
  return BASEBALL_IMPORT_SOURCES.map((source) => ({
    source,
    score: scoreSourceSignature(headers, source.signatureHeaders),
  })).sort((a, b) => b.score - a.score);
}

// -----------------------------------------------------------------------------
// Matching
// -----------------------------------------------------------------------------

/** Minimum fuzzy confidence to auto-accept a name match as a player. */
export const AUTO_MATCH_THRESHOLD = 0.7;

/**
 * The confidence we award a normalized-name match that a jersey AND/OR class
 * signal disambiguates (player_matching_v2.md tier 3). It sits ABOVE the fuzzy
 * auto-accept floor and below an exact-roster (1.0) / external-id (1.0) hit, so a
 * jersey/class-corroborated name beats a bare fuzzy name but never outranks a
 * deterministic id or a clean exact match.
 */
const NAME_JERSEY_CLASS_CONFIDENCE = 0.92;

/**
 * The per-signal boost applied when a fuzzy/exact name candidate is corroborated
 * by a matching jersey number or class (grad year). Two same-last-name players
 * that the old scorer collapsed to an ambiguous 0.7 are pulled apart by this:
 * the one whose jersey/class ALSO matches the source row wins decisively.
 */
const JERSEY_MATCH_BOOST = 0.18;
const CLASS_MATCH_BOOST = 0.12;

export interface MatchablePlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  /**
   * Roster jersey number (baseball_team_members.jersey_number) — a per-team
   * disambiguation signal the spec's tier 3 keys on. Null when the roster row
   * carries no number.
   */
  jersey_number?: number | null;
  /**
   * Class year, sourced from baseball_players.grad_year (the live "class"
   * signal — there is no separate class_year column). Used as a secondary
   * disambiguator when two players share a last name.
   */
  grad_year?: number | null;
  /**
   * Primary position (baseball_players.primary_position) — carried for the
   * manual-match dropdown so a coach can tell two same-name players apart, even
   * when the file gives no jersey/class to auto-disambiguate on.
   */
  primary_position?: string | null;
}

/**
 * A previously-stored external-id -> player mapping (from
 * baseball_player_external_ids), keyed by external id for the active source.
 */
export type ExternalIdIndex = Map<string, { playerId: string; confidence: number }>;

export interface MatchRowInput {
  rowIndex: number;
  /** The player name parsed from the source row. */
  sourceName: string;
  /** Optional external id parsed from the source row (e.g. TrackMan PlayerId). */
  externalId?: string | null;
  /**
   * Optional jersey number parsed from the source row (e.g. a "#" / "jersey"
   * column). Drives the tier-3 (name + jersey + class) disambiguation. Raw string
   * is normalized to an int here so "12", "#12", " 12 " all compare equal.
   */
  sourceJersey?: string | null;
  /**
   * Optional class/grad-year token parsed from the source row (a "class" /
   * "year" / "grad" column — either a 4-digit grad year like "2026" or a class
   * label like "Jr"/"Senior"). Used as the tier-3 secondary disambiguator.
   */
  sourceClass?: string | null;
}

/** Parse a raw jersey cell ("12", "#12", " 12 ") to an int, or null. */
function parseJersey(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits === '') return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/** Map a class label to a grad year RELATIVE to a reference year, or parse a
 * literal 4-digit grad year. Returns null when the token says nothing usable.
 *
 *   "2026" / "Class of 2026"  -> 2026 (literal)
 *   "Sr"/"Senior"             -> ref + 0
 *   "Jr"/"Junior"             -> ref + 1
 *   "So"/"Sophomore"          -> ref + 2
 *   "Fr"/"Freshman"           -> ref + 3
 *
 * The reference is "this season's seniors graduate at the end of this school
 * year"; we approximate it from the current calendar year so the label tier is
 * a useful DISAMBIGUATOR (does the file's class agree with the roster's grad
 * year?) without pretending to be an exact registrar lookup. */
function classTokenToGradYear(raw: string | null | undefined, refYear: number): number | null {
  if (raw == null) return null;
  const t = String(raw).trim().toLowerCase();
  if (t === '') return null;
  const literal = t.match(/(20\d{2})/);
  if (literal) return parseInt(literal[1]!, 10);
  if (/\bsr\b|senior/.test(t)) return refYear;
  if (/\bjr\b|junior/.test(t)) return refYear + 1;
  if (/\bso\b|soph/.test(t)) return refYear + 2;
  if (/\bfr\b|fresh/.test(t)) return refYear + 3;
  return null;
}

/** The reference graduation year for class-label resolution: a school year that
 * starts in Aug graduates the following spring, so seniors in the fall of year Y
 * graduate in Y+1 once the calendar rolls past midyear. We use the calendar year
 * as a stable approximation (exactness isn't required — this is a tie-breaker). */
function currentRefGradYear(): number {
  return new Date().getFullYear();
}

/** Display "First Last (#12 · 2026 · SS)" for a roster player — used in the
 * manual-match dropdown so a coach can disambiguate same-name players. Each
 * signal is omitted when absent so a sparse roster row stays clean. */
export function describeMatchablePlayer(p: MatchablePlayer): string {
  const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed player';
  const bits: string[] = [];
  if (p.jersey_number != null) bits.push(`#${p.jersey_number}`);
  if (p.grad_year != null) bits.push(String(p.grad_year));
  if (p.primary_position) bits.push(p.primary_position);
  return bits.length > 0 ? `${name} (${bits.join(' · ')})` : name;
}

/** Build the resolved-match outcome for a found player at a given tier. */
function resolved(
  input: MatchRowInput,
  player: MatchablePlayer,
  confidence: number,
  matchTier: BaseballImportMatchTier
): BaseballImportRowMatch {
  return {
    rowIndex: input.rowIndex,
    sourceName: input.sourceName,
    playerId: player.id,
    playerName: `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
    confidence,
    matchTier,
    isManualMatch: false,
    action: 'update',
  };
}

/**
 * Resolve a single source row to a player through the FULL tiered cascade from
 * player_matching_v2.md — "exact external ID, exact roster match, normalized
 * name + jersey + class, fuzzy name, and manual review" — HONORING the registered
 * source's player-matching strategy (baseball_import_sources.player_match_strategy):
 *
 *   * external_id_only      — only tier 1 (a previously-mapped external id). A
 *     name-only row stays unmatched/skip; fuzzy name-matching device handles is a
 *     known false-positive source.
 *   * name_then_external_id — (default) tier 1 wins; else tiers 2 -> 4 in order.
 *   * manual_only           — never auto-match; every row lands unmatched/skip so
 *     a coach explicitly assigns each one (tier 5, high-stakes imports).
 *
 * TIERS (most-trusted first), each stamping `matchTier` (the spec's stored
 * "chosen resolution") alongside the numeric confidence:
 *   1. external_id        confidence 1.0  — deterministic id hit.
 *   2. exact_roster       confidence 1.0  — the normalized name matches EXACTLY
 *      one roster player. When >1 player normalizes to the same name (e.g. two
 *      "j smith"s), this tier does NOT fire alone — jersey/class must break it.
 *   3. name_jersey_class                  — a name match (exact-but-ambiguous OR
 *      fuzzy) DISAMBIGUATED or boosted by a matching jersey number and/or class
 *      (grad year). This is the tier that resolves the two-same-last-name case
 *      the old code collapsed to an ambiguous 0.7.
 *   4. fuzzy_name                         — name similarity with no jersey/class.
 *
 * A confident match defaults to 'update' (the player exists on the roster); an
 * unconfident/unmatched row defaults to 'skip' so a coach must explicitly opt in.
 */
export function matchRow(
  input: MatchRowInput,
  players: MatchablePlayer[],
  externalIdIndex: ExternalIdIndex,
  strategy: BaseballPlayerMatchStrategy = 'name_then_external_id'
): BaseballImportRowMatch {
  const unmatched = (confidence = 0): BaseballImportRowMatch => ({
    rowIndex: input.rowIndex,
    sourceName: input.sourceName,
    playerId: null,
    playerName: null,
    confidence,
    matchTier: 'unmatched',
    isManualMatch: false,
    action: 'skip',
  });

  // manual_only: the registered source forbids any automatic resolution.
  if (strategy === 'manual_only') return unmatched();

  // ---- TIER 1: deterministic external-id match (highest trust) -------------
  if (input.externalId) {
    const hit = externalIdIndex.get(input.externalId);
    if (hit) {
      const player = players.find((p) => p.id === hit.playerId);
      return {
        rowIndex: input.rowIndex,
        sourceName: input.sourceName,
        playerId: hit.playerId,
        playerName: player
          ? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim()
          : null,
        confidence: 1,
        matchTier: 'external_id',
        isManualMatch: false,
        action: 'update',
      };
    }
  }

  // external_id_only: stop here — never fall back to name matching.
  if (strategy === 'external_id_only') return unmatched();

  // The row's parsed disambiguation signals (null when the file gives none).
  const srcJersey = parseJersey(input.sourceJersey);
  const srcGrad = classTokenToGradYear(input.sourceClass, currentRefGradYear());

  // ---- TIER 2: exact roster match (only when UNAMBIGUOUS) ------------------
  const normSource = normalizeNameForMatch(input.sourceName);
  if (normSource) {
    const exactHits = players.filter(
      (p) =>
        normalizeNameForMatch(`${p.first_name ?? ''} ${p.last_name ?? ''}`) === normSource
    );
    if (exactHits.length === 1) {
      return resolved(input, exactHits[0]!, 1, 'exact_roster');
    }
    // ---- TIER 3a: exact name but AMBIGUOUS -> jersey/class breaks the tie ---
    if (exactHits.length > 1 && (srcJersey != null || srcGrad != null)) {
      const disambiguated = exactHits.filter(
        (p) =>
          (srcJersey != null && p.jersey_number === srcJersey) ||
          (srcGrad != null && p.grad_year === srcGrad)
      );
      if (disambiguated.length === 1) {
        return resolved(input, disambiguated[0]!, NAME_JERSEY_CLASS_CONFIDENCE, 'name_jersey_class');
      }
      // Still ambiguous after jersey/class -> leave for manual review.
      return unmatched(0.7);
    }
    // Exact-but-ambiguous with NO disambiguator -> manual review (don't guess).
    if (exactHits.length > 1) return unmatched(0.7);
  }

  // ---- TIER 3b / TIER 4: fuzzy name, jersey/class as boosting tie-breaker ---
  // Score every candidate by name similarity, then ADD jersey/class boosts so a
  // same-last-name pair the bare scorer ties at 0.7 is pulled apart decisively.
  let best: { player: MatchablePlayer; score: number; boosted: boolean } | null = null;
  for (const p of players) {
    // findBestPlayerMatch already tries both "First Last" and "Last First".
    let score = findBestPlayerMatch(input.sourceName, [p]).confidence;
    let boosted = false;
    if (srcJersey != null && p.jersey_number === srcJersey) {
      score += JERSEY_MATCH_BOOST;
      boosted = true;
    }
    if (srcGrad != null && p.grad_year === srcGrad) {
      score += CLASS_MATCH_BOOST;
      boosted = true;
    }
    if (!best || score > best.score) best = { player: p, score, boosted };
  }

  if (!best) return unmatched(0);
  const finalScore = Math.min(best.score, 1);
  if (finalScore < AUTO_MATCH_THRESHOLD) return unmatched(finalScore);

  // A boost that lifted a name into (or past) the accept band IS the jersey/class
  // tier; an unboosted name match is plain fuzzy.
  const tier: BaseballImportMatchTier = best.boosted ? 'name_jersey_class' : 'fuzzy_name';
  return resolved(input, best.player, finalScore, tier);
}

/**
 * Match every source row, returning the per-row outcomes the wizard previews.
 * `strategy` is the registered source's player_match_strategy (default keeps the
 * prior name-then-external-id behavior for unregistered sources).
 */
export function matchRows(
  rows: MatchRowInput[],
  players: MatchablePlayer[],
  externalIdIndex: ExternalIdIndex,
  strategy: BaseballPlayerMatchStrategy = 'name_then_external_id'
): BaseballImportRowMatch[] {
  return rows.map((r) => matchRow(r, players, externalIdIndex, strategy));
}

// -----------------------------------------------------------------------------
// Registry-driven duplicate detection (dedupe_strictness)
// -----------------------------------------------------------------------------

/**
 * An existing committed stat row, reduced to the fields duplicate detection
 * keys on. The commit path loads these for the (team, session, stat_type) the
 * import targets so we can decide whether an incoming row is a duplicate of one
 * already present.
 */
export interface ExistingStatKey {
  /** existing baseball_player_stats.id */
  statId: string;
  playerId: string;
  /** the source string already on the existing row (e.g. "import:trackman"). */
  source: string | null;
}

export interface DedupeInput {
  playerId: string;
  /** the source string the incoming row WILL be stamped with. */
  incomingSource: string;
}

export type DedupeOutcome =
  | { duplicate: false }
  | { duplicate: true; existingStatId: string; reason: string };

/**
 * Decide whether an incoming row duplicates an existing (player, session,
 * stat_type) row, per the registered source's dedupe_strictness
 * (baseball_import_sources.dedupe_strictness):
 *
 * A "duplicate" here means the incoming row must NOT be written (it would stomp
 * or redundantly re-create an existing session row). The bands:
 *
 *   * loose    — never a duplicate; always write. The single (player, session,
 *     stat_type) row is upserted in place, which is the prior behavior.
 *   * standard — (default) protect a row written by a DIFFERENT source: a sensor
 *     or spreadsheet import will NOT overwrite an existing official box-score row
 *     for the same player+session. A SAME-source re-import is allowed through (a
 *     scoring correction re-uploads the same export and updates in place).
 *   * strict   — ANY existing row for the same player+session+stat_type blocks
 *     the write, regardless of source, so an official line can never be silently
 *     replaced; a coach must roll back the prior run first.
 *
 * The commit path narrows `existingForSession` to the targeted (team, session,
 * stat_type), so a match here means same session by construction.
 */
export function detectDuplicate(
  incoming: DedupeInput,
  existingForSession: ExistingStatKey[],
  strictness: BaseballDedupeStrictness = 'standard'
): DedupeOutcome {
  if (strictness === 'loose') return { duplicate: false };

  const samePlayer = existingForSession.filter((e) => e.playerId === incoming.playerId);
  if (samePlayer.length === 0) return { duplicate: false };

  if (strictness === 'strict') {
    return {
      duplicate: true,
      existingStatId: samePlayer[0]!.statId,
      reason: 'strict: an existing row for this player+session already exists',
    };
  }

  // standard: block only when a DIFFERENT source already owns this session row.
  const otherSource = samePlayer.find((e) => e.source !== incoming.incomingSource);
  if (otherSource) {
    return {
      duplicate: true,
      existingStatId: otherSource.statId,
      reason: 'standard: a different source already imported this player+session',
    };
  }
  return { duplicate: false };
}

// -----------------------------------------------------------------------------
// Stable source-row identity + per-row duplicate verdict (PREVIEW + COMMIT)
// -----------------------------------------------------------------------------

/**
 * The STABLE identity of a source row, used to decide whether it duplicates an
 * already-committed record. The gap calls for "external event id + player +
 * grain", not just session_date+stat_type: an external id (when the file carries
 * one) is the strongest identity, falling back to player+grain. This is what makes
 * re-importing the same file idempotent (same identity -> same existing record)
 * while still keeping two genuinely different lines apart.
 */
export function sourceRowIdentity(args: {
  playerId: string;
  /** external row/event id parsed from the source row, when present. */
  externalId: string | null;
  statType: string;
  sessionDate: string;
}): string {
  const grain = `${args.statType}|${args.sessionDate}`;
  // External id (when present) anchors identity to the SAME line across re-imports
  // regardless of date drift; otherwise fall back to player+grain (the natural
  // key the stat row is stored under).
  return args.externalId
    ? `ext:${args.externalId}|${grain}`
    : `pl:${args.playerId}|${grain}`;
}

/** An existing committed stat row reduced to what duplicate-verdict needs. */
export interface ExistingStatRecord {
  statId: string;
  playerId: string;
  source: string | null;
  /** the external id stamped on the existing row, when matching kept one. */
  externalId: string | null;
  /** the normalized stat values already stored (for the value-equality check). */
  values: Record<string, number | null>;
}

/** An incoming write reduced to what duplicate-verdict needs. */
export interface IncomingRowForVerdict {
  rowIndex: number;
  playerId: string;
  externalId: string | null;
  /** the source string this row WILL be stamped with (e.g. "import:trackman"). */
  incomingSource: string;
  values: Record<string, number | null>;
}

export interface RowDuplicateVerdict {
  rowIndex: number;
  /** The player id this verdict was computed against (for stale-verdict invalidation). */
  playerId: string | null;
  verdict: 'new' | 'will_update' | 'exact_duplicate' | 'unresolved';
  existingStatId: string | null;
  existingSource: string | null;
  changedFields: Array<{ field: string; before: number | null; after: number | null }>;
}

/** Numeric-equality treating null and 0/absent consistently for the diff. */
function statsEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  const av = a ?? null;
  const bv = b ?? null;
  return av === bv;
}

/**
 * Decide, for each incoming row, whether committing it will create / update /
 * skip-as-exact-duplicate an existing record — BEFORE anything is written. This
 * is the spec's "detect existing source rows and SHOW create/update/skip
 * decisions before commit". It indexes the existing session records by the SAME
 * stable identity the row resolves to (external id first, else player+grain) so
 * the verdict is keyed correctly, and computes a precise changed-field diff for
 * the will_update case so the coach sees exactly what an OVERWRITE changes.
 */
export function computeRowVerdicts(
  incoming: IncomingRowForVerdict[],
  existing: ExistingStatRecord[]
): RowDuplicateVerdict[] {
  // Index existing rows by BOTH possible identity keys (ext id and player) so an
  // incoming row resolves whether or not it carries an external id, and an
  // existing row that was stored with an ext id is still found by a later
  // file that dropped it.
  const byExtId = new Map<string, ExistingStatRecord>();
  const byPlayer = new Map<string, ExistingStatRecord>();
  for (const e of existing) {
    byPlayer.set(e.playerId, e);
    if (e.externalId) byExtId.set(e.externalId, e);
  }

  return incoming.map((row) => {
    const match =
      (row.externalId ? byExtId.get(row.externalId) : undefined) ??
      byPlayer.get(row.playerId) ??
      null;

    if (!match) {
      return {
        rowIndex: row.rowIndex,
        playerId: row.playerId,
        verdict: 'new',
        existingStatId: null,
        existingSource: null,
        changedFields: [],
      };
    }

    // Compute the changed-field diff (only fields the incoming row maps).
    const changedFields: RowDuplicateVerdict['changedFields'] = [];
    for (const field of Object.keys(row.values)) {
      const after = row.values[field] ?? null;
      const before = match.values[field] ?? null;
      if (!statsEqual(before, after)) changedFields.push({ field, before, after });
    }

    const sameSource = match.source === row.incomingSource;
    if (sameSource && changedFields.length === 0) {
      return {
        rowIndex: row.rowIndex,
        playerId: row.playerId,
        verdict: 'exact_duplicate',
        existingStatId: match.statId,
        existingSource: match.source,
        changedFields: [],
      };
    }

    return {
      rowIndex: row.rowIndex,
      playerId: row.playerId,
      verdict: 'will_update',
      existingStatId: match.statId,
      existingSource: match.source,
      changedFields,
    };
  });
}

/**
 * Apply a coach's manual override to a single row's match, recomputing the
 * commit action. Setting playerId to null reverts the row to a skip.
 */
export function applyManualMatch(
  match: BaseballImportRowMatch,
  playerId: string | null,
  players: MatchablePlayer[],
  action?: BaseballImportRowAction
): BaseballImportRowMatch {
  const player = playerId ? players.find((p) => p.id === playerId) : null;
  const resolvedAction: BaseballImportRowAction =
    action ?? (playerId ? 'update' : 'skip');
  return {
    ...match,
    playerId,
    playerName: player
      ? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim()
      : null,
    confidence: playerId ? 1 : match.confidence,
    // The chosen resolution is now explicitly a human decision (the spec's tier
    // 5 "manual review"); clearing a row returns it to unmatched.
    matchTier: playerId ? 'manual' : 'unmatched',
    isManualMatch: true,
    action: resolvedAction,
  };
}

/** Roll up the match outcomes into the counts the run header stores. */
export function summarizeMatches(matches: BaseballImportRowMatch[]): {
  total: number;
  matched: number;
  unmatched: number;
} {
  const total = matches.length;
  const matched = matches.filter((m) => m.playerId && m.action !== 'skip').length;
  return { total, matched, unmatched: total - matched };
}
