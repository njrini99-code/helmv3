// =============================================================================
// src/lib/baseball/source-record.ts
//
// Wave 3 / packet P3.4 — Source-labeled record helpers.
//
// THE HONESTY LAYER for BaseballHelm read models.
//
// Every record that BaseballHelm surfaces in a read model — a stat row, a
// timeline event, an AI insight, an imported value — must be able to answer two
// questions truthfully:
//
//   1. WHERE did this come from?   -> a `SourceRef` { source, sourceId?, label }
//   2. HOW CONFIDENT are we?       -> a normalized `confidence` in [0,1] | null
//
// and one product-critical honesty distinction:
//
//   3. Is this an "active capture" (a real measured/observed value, e.g. a
//      stat actually recorded, a TrackMan reading, a player-logged set) or only
//      a "logged intent" (something the coach planned/assigned/expected but
//      that has NOT yet been observed to happen — an assignment, a scheduled
//      event, a draft)? The UI MUST render these differently so a planned lift
//      is never shown as if the player actually did it.
//
// This module is pure (no I/O, no 'use server') so it can be imported by read
// models (server) AND by client components that need to render the badges. It
// shares nothing with GolfHelm.
// =============================================================================

import type { Json } from '@/lib/types';

// -----------------------------------------------------------------------------
// Source identity
// -----------------------------------------------------------------------------

/**
 * The canonical provenance kinds a BaseballHelm record can carry. `manual` is a
 * coach/player-entered value; `csv_import`/`integration` come through the import
 * pipeline (carry a source registry id); `ai` is engine-generated; `system` is
 * a platform-derived/computed value; `unknown` is the honest fallback when a row
 * predates source tracking (do NOT pretend it is manual).
 */
export type SourceKind =
  | 'manual'
  | 'csv_import'
  | 'integration'
  | 'ai'
  | 'system'
  | 'unknown';

/**
 * A normalized reference to where a record came from. `sourceId` is the import
 * run / external source registry id / model version when applicable. `label` is
 * a short human string for the UI ("Coach entry", "TrackMan import", "CoachHelm
 * engine").
 */
export interface SourceRef {
  source: SourceKind;
  /** Import run id, external source id, or AI model version. Null when n/a. */
  sourceId: string | null;
  /** Short human-readable provenance label for badges/tooltips. */
  label: string;
}

/**
 * "active capture" — the value was actually observed/measured/logged.
 * "logged intent" — the value was planned/assigned/expected, NOT yet observed.
 * This drives the UI distinction the v12 honesty rules require.
 */
export type CaptureMode = 'active_capture' | 'logged_intent';

/**
 * A value paired with its provenance + confidence + capture honesty. Read
 * models wrap surfaced records in this so the UI never has to guess.
 */
export interface SourcedRecord<T> {
  value: T;
  source: SourceRef;
  /** Normalized model/match confidence in [0,1], or null when not applicable. */
  confidence: number | null;
  captureMode: CaptureMode;
}

// -----------------------------------------------------------------------------
// Labels
// -----------------------------------------------------------------------------

const SOURCE_LABELS: Record<SourceKind, string> = {
  manual: 'Manual entry',
  csv_import: 'CSV import',
  integration: 'Integration',
  ai: 'AI generated',
  system: 'System',
  unknown: 'Unverified source',
};

/** Default human label for a source kind. */
export function sourceLabel(kind: SourceKind): string {
  return SOURCE_LABELS[kind] ?? SOURCE_LABELS.unknown;
}

// -----------------------------------------------------------------------------
// Normalization helpers
// -----------------------------------------------------------------------------

const KNOWN_SOURCE_KINDS = new Set<SourceKind>([
  'manual',
  'csv_import',
  'integration',
  'ai',
  'system',
  'unknown',
]);

/**
 * Map a raw DB `source` / `source_type` string (free text across legacy rows)
 * onto a canonical SourceKind. Anything unrecognized becomes 'unknown' — we
 * never silently upgrade an unknown row to 'manual'.
 */
export function normalizeSourceKind(raw: string | null | undefined): SourceKind {
  if (!raw) return 'unknown';
  const v = raw.trim().toLowerCase();
  if (KNOWN_SOURCE_KINDS.has(v as SourceKind)) return v as SourceKind;
  // Legacy / alias mappings observed in the stat + insight tables.
  if (v === 'csv_upload' || v === 'csv' || v === 'upload' || v === 'import') {
    return 'csv_import';
  }
  if (v === 'trackman' || v === 'rapsodo' || v === 'blast' || v === 'api') {
    return 'integration';
  }
  if (v === 'coachhelm' || v === 'engine' || v === 'model' || v === 'llm') {
    return 'ai';
  }
  if (v === 'manual' || v === 'coach' || v === 'player') return 'manual';
  if (v === 'computed' || v === 'derived' || v === 'aggregate') return 'system';
  return 'unknown';
}

/**
 * Clamp/normalize any numeric-ish confidence to [0,1]. Accepts a 0–100 percent
 * and rescales it. Returns null for missing/NaN so the UI shows "—" rather than
 * a fake 0%.
 */
export function normalizeConfidence(
  raw: number | string | null | undefined,
): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const scaled = n > 1 ? n / 100 : n;
  if (scaled < 0) return 0;
  if (scaled > 1) return 1;
  return scaled;
}

// -----------------------------------------------------------------------------
// Builders
// -----------------------------------------------------------------------------

/**
 * Build a SourceRef from raw DB fields. `customLabel` overrides the default
 * label for the resolved kind (e.g. an external source's display name).
 */
export function buildSourceRef(input: {
  source?: string | null;
  sourceId?: string | null;
  label?: string | null;
}): SourceRef {
  const source = normalizeSourceKind(input.source);
  return {
    source,
    sourceId: input.sourceId ?? null,
    label: input.label?.trim() || sourceLabel(source),
  };
}

/**
 * Wrap a value with resolved provenance, confidence, and capture honesty.
 *
 * `captureMode` defaults are honest:
 *   - 'ai' and 'system' sources default to 'active_capture' for *derived facts*
 *     but a generator that produces a *recommendation* should pass
 *     captureMode: 'logged_intent' explicitly.
 *   - Pass captureMode explicitly for anything that represents a plan/assignment
 *     /draft/schedule (logged_intent) vs an observed/measured value
 *     (active_capture). When omitted, defaults to 'active_capture'.
 */
export function toSourcedRecord<T>(
  value: T,
  input: {
    source?: string | null;
    sourceId?: string | null;
    label?: string | null;
    confidence?: number | string | null;
    captureMode?: CaptureMode;
  },
): SourcedRecord<T> {
  return {
    value,
    source: buildSourceRef(input),
    confidence: normalizeConfidence(input.confidence),
    captureMode: input.captureMode ?? 'active_capture',
  };
}

/** True when the record is a plan/assignment/schedule, NOT an observed value. */
export function isLoggedIntent(rec: { captureMode: CaptureMode }): boolean {
  return rec.captureMode === 'logged_intent';
}

/**
 * A small, serializable provenance badge descriptor the UI can render without
 * importing this module's logic. `tone` lets the badge pick a color: 'verified'
 * for high-confidence active captures, 'planned' for logged intent, 'unverified'
 * for unknown-source rows, 'ai' for engine output.
 */
export interface SourceBadge {
  label: string;
  /** "Active capture" | "Logged intent" — the honesty line. */
  captureLabel: string;
  /** 0–100 integer percent, or null. */
  confidencePct: number | null;
  tone: 'verified' | 'planned' | 'unverified' | 'ai';
}

/** Derive a render-ready badge from a SourcedRecord. Pure + serializable. */
export function toSourceBadge(rec: {
  source: SourceRef;
  confidence: number | null;
  captureMode: CaptureMode;
}): SourceBadge {
  const confidencePct =
    rec.confidence === null ? null : Math.round(rec.confidence * 100);

  let tone: SourceBadge['tone'];
  if (rec.captureMode === 'logged_intent') {
    tone = 'planned';
  } else if (rec.source.source === 'ai') {
    tone = 'ai';
  } else if (rec.source.source === 'unknown') {
    tone = 'unverified';
  } else {
    tone = 'verified';
  }

  return {
    label: rec.source.label,
    captureLabel:
      rec.captureMode === 'active_capture' ? 'Active capture' : 'Logged intent',
    confidencePct,
    tone,
  };
}

/**
 * Helper for write paths (insight/timeline/import writers in later waves): build
 * the `source_refs`-shaped jsonb payload a row should persist so its provenance
 * round-trips. Kept here so the read + write sides agree on the shape.
 */
export function sourceRefToJson(ref: SourceRef, confidence: number | null): Json {
  return {
    source: ref.source,
    source_id: ref.sourceId,
    label: ref.label,
    confidence,
  } as Json;
}
