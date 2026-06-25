// =============================================================================
// src/lib/baseball/adapters/index.ts
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// The CONCRETE adapter registry + the source-agnostic validate / match / preview
// logic that turns parsed canonical event rows into a CommitPlan. This is the
// missing middle the contracts file (stat-import-adapters.ts) only TYPED: it maps
// each parser-backed source_key to a real parse() and provides validate(),
// matchPlayers(), and buildEventCommitPlan() over the canonical event rows.
//
// PURE: no DB, no 'use server'. The server action (actions/stat-event-imports.ts)
// owns DB I/O (load roster, dedupe against existing events, write, rollback).
// =============================================================================

import {
  parseTrackMan,
  parseRapsodo,
  type ConcreteParseResult,
} from '@/lib/baseball/adapters/tracking-adapters';
import { parseBlast, parseDiamondKinetics } from '@/lib/baseball/adapters/swing-adapters';
import {
  parseGameChangerXml,
  parseStatCrewXml,
  parsePrestoSportsXml,
  parseNcaaLiveStatsXml,
  parseSidearmXml,
  parseStatBroadcastXml,
} from '@/lib/baseball/adapters/official-xml-adapters';
import { parsePdfExtract } from '@/lib/baseball/adapters/pdf-adapter';
import { decodeImportBody } from '@/lib/baseball/adapters/import-file-body';
import { xlsxToCsv } from '@/lib/baseball/adapters/xlsx-reader';
import {
  type CanonicalEventRow,
  type EventGrain,
} from '@/lib/baseball/adapters/event-rows';
import {
  findBestPlayerMatch,
  type PlayerMatch,
} from '@/lib/baseball/csv-utils';
import type { MatchablePlayer } from '@/lib/baseball/import-matching';
import {
  getSourceRegistryEntry,
  clampTrustToCeiling,
} from '@/lib/baseball/stat-import-adapters';
import type { BaseballSourceKey, BaseballTrustTier } from '@/lib/types/baseball-stat-events';

// -----------------------------------------------------------------------------
// Registry: which source_keys have a CONCRETE parser (file -> event rows). The
// remaining registry entries (generic_csv, teamworks_csv, etc.) keep the legacy
// flat path; this set is exactly the event-grain producers v10 demands be real.
// -----------------------------------------------------------------------------

export type ConcreteParser = (body: string) => ConcreteParseResult;

/**
 * Decode the transport body BEFORE a CSV-based adapter sees it: a plain-text CSV/TSV
 * passes through untouched; an XLSX binary envelope (the workbook formats Blast,
 * Diamond Kinetics, TeamBuildr, Google Sheets and generic uploads ship in) is
 * unzipped + flattened to RFC-4180 CSV so the adapter's existing tokenizer reads it
 * exactly as if it were a native CSV. This is the one seam that gives every
 * CSV-based vendor adapter XLSX support without per-adapter code. Returns the text
 * plus any reader warnings, which the wrapper folds into the parse result.
 */
function decodeCsvLikeBody(body: string): { text: string; warnings: string[] } {
  const decoded = decodeImportBody(body);
  if (decoded.kind === 'text') return { text: decoded.text, warnings: [] };
  // Binary: only XLSX is supported on the CSV-like path; treat anything else as a
  // failed read (the PDF path is handled separately and never reaches here).
  const { csv, warnings, sheetName } = xlsxToCsv(decoded.bytes);
  const note = sheetName ? [`Read worksheet "${sheetName}" from the workbook.`] : [];
  return { text: csv, warnings: [...note, ...warnings] };
}

/** Wrap a TEXT/CSV adapter so it transparently accepts an XLSX binary envelope. */
function csvLike(parser: ConcreteParser): ConcreteParser {
  return (body: string) => {
    const { text, warnings } = decodeCsvLikeBody(body);
    const result = parser(text);
    return warnings.length > 0
      ? { ...result, warnings: [...warnings, ...result.warnings] }
      : result;
  };
}

/** Wrap an XML adapter so it transparently decodes a (rare) binary envelope to text. */
function xmlLike(parser: ConcreteParser): ConcreteParser {
  return (body: string) => {
    const decoded = decodeImportBody(body);
    return parser(decoded.kind === 'text' ? decoded.text : new TextDecoder().decode(decoded.bytes));
  };
}

export const CONCRETE_EVENT_ADAPTERS: Partial<Record<BaseballSourceKey, ConcreteParser>> = {
  trackman_csv: csvLike(parseTrackMan),
  rapsodo_csv: csvLike(parseRapsodo),
  blast_csv: csvLike(parseBlast),
  diamond_kinetics_csv: csvLike(parseDiamondKinetics),
  gamechanger_xml: xmlLike(parseGameChangerXml),
  statcrew_xml: xmlLike(parseStatCrewXml),
  prestosports_xml: xmlLike(parsePrestoSportsXml),
  ncaa_live_stats: xmlLike(parseNcaaLiveStatsXml),
  sidearm_xml: xmlLike(parseSidearmXml),
  statbroadcast_xml: xmlLike(parseStatBroadcastXml),
  // PDF is handled raw (it owns its own binary-envelope decode) and ALWAYS yields
  // zero committable rows — a preserve-for-manual path, never an auto-extractor.
  pdf_extract: parsePdfExtract,
};

/** True when a source has a concrete event-grain parser (vs the legacy flat path). */
export function hasConcreteEventAdapter(sourceKey: string): sourceKey is BaseballSourceKey {
  return sourceKey in CONCRETE_EVENT_ADAPTERS;
}

export function getConcreteParser(sourceKey: BaseballSourceKey): ConcreteParser | null {
  return CONCRETE_EVENT_ADAPTERS[sourceKey] ?? null;
}

// -----------------------------------------------------------------------------
// Validation — physically-plausible ranges per metric. WARNINGS (not errors) keep
// an out-of-range row importable but flagged in the diff viewer (a coach may have
// a legit 105 mph EV); ERRORS block the row (negative velocity, impossible angle).
// -----------------------------------------------------------------------------

export interface EventValidationIssue {
  sourceRowNumber: number;
  grain: EventGrain;
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

const RANGES: Record<string, { hardMin: number; hardMax: number; softMin: number; softMax: number; label: string }> = {
  velocity: { hardMin: 20, hardMax: 110, softMin: 50, softMax: 105, label: 'pitch velocity (mph)' },
  spin_rate: { hardMin: 0, hardMax: 4000, softMin: 1000, softMax: 3500, label: 'spin rate (rpm)' },
  exit_velocity: { hardMin: 10, hardMax: 130, softMin: 40, softMax: 120, label: 'exit velocity (mph)' },
  launch_angle: { hardMin: -90, hardMax: 90, softMin: -40, softMax: 60, label: 'launch angle (deg)' },
  bat_speed: { hardMin: 20, hardMax: 110, softMin: 45, softMax: 95, label: 'bat speed (mph)' },
  attack_angle: { hardMin: -45, hardMax: 60, softMin: -10, softMax: 30, label: 'attack angle (deg)' },
};

function checkRange(
  grain: EventGrain,
  rowNo: number,
  field: string,
  value: number | null,
  issues: EventValidationIssue[],
): void {
  if (value == null) return;
  const r = RANGES[field];
  if (!r) return;
  if (value < r.hardMin || value > r.hardMax) {
    issues.push({
      sourceRowNumber: rowNo,
      grain,
      field,
      severity: 'error',
      message: `${r.label} = ${value} is outside the possible range [${r.hardMin}, ${r.hardMax}].`,
    });
  } else if (value < r.softMin || value > r.softMax) {
    issues.push({
      sourceRowNumber: rowNo,
      grain,
      field,
      severity: 'warning',
      message: `${r.label} = ${value} is unusual (expected ~[${r.softMin}, ${r.softMax}]).`,
    });
  }
}

export function validateEventRows(rows: CanonicalEventRow[]): EventValidationIssue[] {
  const issues: EventValidationIssue[] = [];
  for (const row of rows) {
    if (row.grain === 'pitch') {
      checkRange('pitch', row.sourceRowNumber, 'velocity', row.fields.velocity, issues);
      checkRange('pitch', row.sourceRowNumber, 'spin_rate', row.fields.spin_rate, issues);
    } else if (row.grain === 'batted_ball') {
      checkRange('batted_ball', row.sourceRowNumber, 'exit_velocity', row.fields.exit_velocity, issues);
      checkRange('batted_ball', row.sourceRowNumber, 'launch_angle', row.fields.launch_angle, issues);
    } else {
      checkRange('swing', row.sourceRowNumber, 'bat_speed', row.fields.bat_speed, issues);
      checkRange('swing', row.sourceRowNumber, 'attack_angle', row.fields.attack_angle, issues);
    }
  }
  return issues;
}

// -----------------------------------------------------------------------------
// Player matching across event rows. Event rows reuse the SAME fuzzy matcher as
// the flat path (csv-utils.findBestPlayerMatch) + the external-id index, but match
// by the PRIMARY player of each grain (pitcher / batter / player) and DISTINCT
// external handles only (so a 300-pitch TrackMan file resolves ~9 pitchers once).
// -----------------------------------------------------------------------------

export interface EventPlayerResolution {
  /** handle = externalPlayerId || normalized name; the dedupe key for matching. */
  handle: string;
  externalName: string | null;
  externalId: string | null;
  playerId: string | null;
  playerName: string | null;
  confidence: number;
  /** distinct event rows referencing this handle. */
  rowCount: number;
}

export type ExternalIdLookup = Map<string, { playerId: string; confidence: number }>;

const AUTO_MATCH_THRESHOLD = 0.7;

function handleOf(row: CanonicalEventRow): string {
  if (row.externalPlayerId) return `id:${row.externalPlayerId}`;
  return `name:${(row.externalPlayerName ?? '').toLowerCase().trim()}`;
}

export function resolveEventPlayers(
  rows: CanonicalEventRow[],
  roster: MatchablePlayer[],
  externalIds: ExternalIdLookup,
): EventPlayerResolution[] {
  const byHandle = new Map<string, EventPlayerResolution>();

  for (const row of rows) {
    const handle = handleOf(row);
    let res = byHandle.get(handle);
    if (!res) {
      // Deterministic external-id hit wins.
      if (row.externalPlayerId && externalIds.has(row.externalPlayerId)) {
        const hit = externalIds.get(row.externalPlayerId)!;
        const p = roster.find((rp) => rp.id === hit.playerId);
        res = {
          handle,
          externalName: row.externalPlayerName,
          externalId: row.externalPlayerId,
          playerId: hit.playerId,
          playerName: p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : null,
          confidence: 1,
          rowCount: 0,
        };
      } else {
        const best: PlayerMatch = findBestPlayerMatch(row.externalPlayerName ?? '', roster);
        const matched = best.confidence >= AUTO_MATCH_THRESHOLD && !!best.playerId;
        res = {
          handle,
          externalName: row.externalPlayerName,
          externalId: row.externalPlayerId,
          playerId: matched ? best.playerId : null,
          playerName: matched ? best.playerName : null,
          confidence: best.confidence,
          rowCount: 0,
        };
      }
      byHandle.set(handle, res);
    }
    res.rowCount += 1;
  }

  return [...byHandle.values()].sort((a, b) => b.rowCount - a.rowCount);
}

// -----------------------------------------------------------------------------
// previewCommit — the dry-run plan the Import Diff Viewer renders. It counts what
// commit() WOULD write per grain, splits create vs update (against a set of
// already-present external event ids), and surfaces duplicate + warning rows.
// -----------------------------------------------------------------------------

export interface EventCommitPlan {
  byGrain: Record<EventGrain, { creates: number; updates: number; skipped: number }>;
  totalCreates: number;
  totalUpdates: number;
  totalSkipped: number;
  /** rows skipped because their primary player did not match. */
  unmatchedRowCount: number;
  /** rows whose external event id already exists (idempotent re-import). */
  duplicateRowCount: number;
  warnings: string[];
  validationErrors: number;
  validationWarnings: number;
}

function emptyGrainCounts(): EventCommitPlan['byGrain'] {
  return {
    pitch: { creates: 0, updates: 0, skipped: 0 },
    batted_ball: { creates: 0, updates: 0, skipped: 0 },
    swing: { creates: 0, updates: 0, skipped: 0 },
  };
}

export interface BuildPlanInput {
  rows: CanonicalEventRow[];
  /** handle -> resolved player (from resolveEventPlayers, possibly coach-overridden). */
  resolutionByHandle: Map<string, EventPlayerResolution>;
  /** per-grain set of external event ids ALREADY present for this source/team. */
  existingExternalIds: Record<EventGrain, Set<string>>;
  parseWarnings: string[];
  validation: EventValidationIssue[];
}

export function buildEventCommitPlan(input: BuildPlanInput): EventCommitPlan {
  const byGrain = emptyGrainCounts();
  let unmatched = 0;
  let duplicates = 0;
  const errorRows = new Set<string>();

  for (const issue of input.validation) {
    if (issue.severity === 'error') errorRows.add(`${issue.grain}:${issue.sourceRowNumber}`);
  }

  for (const row of input.rows) {
    const res = input.resolutionByHandle.get(handleOf(row));
    const counts = byGrain[row.grain];

    if (!res || !res.playerId) {
      unmatched += 1;
      counts.skipped += 1;
      continue;
    }
    if (errorRows.has(`${row.grain}:${row.sourceRowNumber}`)) {
      counts.skipped += 1;
      continue;
    }
    if (row.externalEventId && input.existingExternalIds[row.grain].has(row.externalEventId)) {
      duplicates += 1;
      counts.updates += 1; // idempotent re-import = update-in-place by external id.
      continue;
    }
    counts.creates += 1;
  }

  const totalCreates = byGrain.pitch.creates + byGrain.batted_ball.creates + byGrain.swing.creates;
  const totalUpdates = byGrain.pitch.updates + byGrain.batted_ball.updates + byGrain.swing.updates;
  const totalSkipped = byGrain.pitch.skipped + byGrain.batted_ball.skipped + byGrain.swing.skipped;

  return {
    byGrain,
    totalCreates,
    totalUpdates,
    totalSkipped,
    unmatchedRowCount: unmatched,
    duplicateRowCount: duplicates,
    warnings: input.parseWarnings,
    validationErrors: input.validation.filter((v) => v.severity === 'error').length,
    validationWarnings: input.validation.filter((v) => v.severity === 'warning').length,
  };
}

// -----------------------------------------------------------------------------
// Trust resolution — the one place metric authority is applied to event rows. A
// row's trust is the source default, clamped to the source ceiling (so a TrackMan
// row can never be 'official', enforced again by the swing-table DB CHECK).
// -----------------------------------------------------------------------------

export function resolveEventTrust(sourceKey: BaseballSourceKey): BaseballTrustTier {
  const entry = getSourceRegistryEntry(sourceKey);
  const requested = entry?.defaultTrustTier ?? 'unverified';
  return clampTrustToCeiling(requested, sourceKey);
}

export { handleOf };

// =============================================================================
// detect() — the adapter contract's missing FIRST step. v9 Packet 4 acceptance
// ("upload shows detected source AND grain") + v10 Import Center step 3 ("Provider
// detection" / "File fingerprint card" / "Provider confidence meter") require the
// upload to surface, BEFORE matching, WHICH source this file is, what GRAINS it
// produces, the source's TRUST CEILING, and the confidence-based AUTO-COMMIT BAND.
//
// This is also where the previously-dead `decideAutoCommit` / `AutoCommitDecision`
// (typed in stat-import-adapters.ts, imported by nothing) finally run: the file's
// detection confidence is mapped onto the v8 auto-commit band that gates whether a
// source's rows could ever auto-commit vs always hold for coach review.
//
// PURE: detection runs the SAME concrete parser the preview/commit use, so the
// grain + confidence reflect what will REALLY be written (not a header guess that
// can disagree with the parse). No DB, no 'use server'.
// =============================================================================

import {
  decideAutoCommit,
  type AutoCommitDecision,
  type BaseballImportTargetGrain,
} from '@/lib/baseball/stat-import-adapters';

/** Human label for an event grain (the diff viewer's GRAIN_LABEL, source-side). */
const GRAIN_DISPLAY: Record<EventGrain, string> = {
  pitch: 'Pitch',
  batted_ball: 'Batted ball',
  swing: 'Swing',
};

export interface SourceFileDetection {
  /** the source whose concrete adapter best explains this file. */
  sourceKey: BaseballSourceKey;
  sourceLabel: string;
  /** source category (official_game / tracking / player_development / ...). */
  category: string;
  /** 0..1 — how confident detection is that this file IS this source. */
  confidence: number;
  /** distinct event grains the parser actually produced from this file. */
  grains: EventGrain[];
  /** display labels for the grains, file-order, deduped. */
  grainLabels: string[];
  /** the registry trust ceiling this source can ever claim. */
  trustCeiling: BaseballTrustTier;
  /** the trust a row from this source actually lands at (clamped). */
  resolvedTrust: BaseballTrustTier;
  /** v8 confidence band for whether this file could auto-commit. */
  autoCommit: AutoCommitDecision;
  /** event rows produced + physical rows read (parsed N of M honesty). */
  eventRowCount: number;
  rowsRead: number;
  /** ranked alternates the wizard offers as a manual override. */
  alternates: Array<{ sourceKey: BaseballSourceKey; sourceLabel: string; confidence: number }>;
  /** non-fatal parser notes (delimiter, ragged rows, skipped rows). */
  notes: string[];
  /**
   * Preserved document text for PDF (and other manual-mapping) sources — shown so a
   * coach can hand-map the lines. Empty for sources that auto-extract event rows. */
  preservedText?: string;
}

/**
 * Confidence for a CONFIRMED source (the user picked it OR detect resolved it):
 * derived from the parse outcome — a file that produced many event rows from many
 * physical rows is high-confidence; a file the adapter could barely parse is low.
 * This is deliberately PARSE-driven (not header-keyword-driven) so the auto-commit
 * band reflects real extraction quality, the property v8 actually cares about.
 */
function parseConfidence(eventRowCount: number, rowsRead: number, warnings: number): number {
  if (rowsRead === 0) return 0;
  // base = fraction of physical rows that yielded at least one event (a TrackMan
  // row yields 1-2 events, so this is >=1 typically; clamp to 1).
  const yieldRatio = Math.min(1, eventRowCount / rowsRead);
  // penalize files that are mostly warnings (wrong-source signal).
  const warnPenalty = Math.min(0.4, warnings / Math.max(1, rowsRead));
  return Math.max(0, Math.min(1, 0.55 + 0.45 * yieldRatio - warnPenalty));
}

/**
 * Header/marker signature score for the OTHER concrete sources, so the wizard can
 * offer honest alternates ("this looks more like Rapsodo"). Cheap: counts how many
 * of a source's `signatureMarkers` appear in the file's first ~4KB (case-folded).
 */
function signatureScore(sourceKey: BaseballSourceKey, haystack: string): number {
  const entry = getSourceRegistryEntry(sourceKey);
  if (!entry || entry.signatureMarkers.length === 0) return 0;
  const hay = haystack.toLowerCase();
  let hits = 0;
  for (const m of entry.signatureMarkers) if (hay.includes(m.toLowerCase())) hits += 1;
  return hits / entry.signatureMarkers.length;
}

/**
 * Detect a file against a CONFIRMED source: run that source's concrete parser, read
 * the grains it produced, score confidence from the parse, resolve trust + the
 * auto-commit band, and rank alternates by header signature. The wizard renders
 * this in its Detect step before the coach matches players.
 */
export function detectSourceFile(
  sourceKey: BaseballSourceKey,
  fileBody: string,
): SourceFileDetection {
  const parser = getConcreteParser(sourceKey);
  const parsed = parser
    ? parser(fileBody)
    : { rows: [], rowsRead: 0, warnings: [] as string[], preservedText: undefined };
  return detectFromParse(
    sourceKey,
    {
      rows: parsed.rows,
      rowsRead: parsed.rowsRead,
      warnings: parsed.warnings,
      preservedText: parsed.preservedText,
    },
    fileBody,
  );
}

/**
 * Build the Detect-step result from an ALREADY-parsed file (the preview action has
 * the parse in hand; this avoids parsing a large vendor file twice). `fileHead` is
 * just the first few KB used for alternate-source signature scoring.
 */
export function detectFromParse(
  sourceKey: BaseballSourceKey,
  parsed: { rows: CanonicalEventRow[]; rowsRead: number; warnings: string[]; preservedText?: string },
  fileHead: string,
): SourceFileDetection {
  const entry = getSourceRegistryEntry(sourceKey);

  // Distinct grains, in first-seen order.
  const seen = new Set<EventGrain>();
  const grains: EventGrain[] = [];
  for (const row of parsed.rows) {
    if (!seen.has(row.grain)) {
      seen.add(row.grain);
      grains.push(row.grain);
    }
  }
  const eventRowCount = parsed.rows.length;
  const rowsRead = parsed.rowsRead;
  const warnCount = parsed.warnings.length;
  const notes: string[] = parsed.warnings.length > 0 ? [parsed.warnings[0]!] : [];

  const confidence = parseConfidence(eventRowCount, rowsRead, warnCount);
  const trustCeiling = entry?.trustCeiling ?? 'unverified';
  const resolvedTrust = resolveEventTrust(sourceKey);

  // Auto-commit band is the SOURCE-aware product of detection confidence: a source
  // that requires review can NEVER reach an auto-commit band (it is held), and the
  // ceiling caps how high a non-official source can go regardless of confidence.
  let bandConfidence = confidence;
  if (entry?.requiresReviewByDefault) bandConfidence = Math.min(bandConfidence, 0.84);
  if (trustCeiling !== 'official') bandConfidence = Math.min(bandConfidence, 0.97);
  const autoCommit = decideAutoCommit(bandConfidence);

  // Alternates: other concrete sources whose signature the file also matches.
  const head = fileHead.slice(0, 4096);
  const alternates = (Object.keys(CONCRETE_EVENT_ADAPTERS) as BaseballSourceKey[])
    .filter((k) => k !== sourceKey)
    .map((k) => ({
      sourceKey: k,
      sourceLabel: getSourceRegistryEntry(k)?.label ?? k,
      confidence: signatureScore(k, head),
    }))
    .filter((a) => a.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  return {
    sourceKey,
    sourceLabel: entry?.label ?? sourceKey,
    category: entry?.category ?? 'operations',
    confidence,
    grains,
    grainLabels: grains.map((g) => GRAIN_DISPLAY[g]),
    trustCeiling,
    resolvedTrust,
    autoCommit,
    eventRowCount,
    rowsRead,
    alternates,
    notes,
    preservedText: parsed.preservedText,
  };
}

/** Plain-English copy for an auto-commit band, for the Detect step badge. */
export function autoCommitLabel(decision: AutoCommitDecision): {
  title: string;
  detail: string;
} {
  switch (decision) {
    case 'auto_commit_silent':
      return {
        title: 'Auto-commit eligible',
        detail: 'High-confidence official source — could commit without review.',
      };
    case 'auto_commit_warn':
      return {
        title: 'Auto-commit with notice',
        detail: 'Confident parse — would commit and flag for a glance.',
      };
    case 'hold_for_review':
      return {
        title: 'Held for review',
        detail: 'Imported, but flagged so a coach confirms before it powers insights.',
      };
    case 'do_not_commit':
      return {
        title: 'Manual review required',
        detail: 'Low parse confidence — every row needs a coach to confirm.',
      };
  }
}

// re-export the target-grain type so callers (the action) have one import surface.
export type { BaseballImportTargetGrain };
