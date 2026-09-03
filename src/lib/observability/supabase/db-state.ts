/**
 * Bridge database state model — brief §67, §86.
 *
 * ONE pure fold from "what could we read, and what did it say" to a single
 * GREEN / AMBER / RED / DEGRADED / UNKNOWN verdict, plus the evidence that
 * produced it. No I/O, no clock, no server-only import: every input is
 * supplied by the caller so the whole state machine is fixture-testable.
 *
 * WHY A SEPARATE STATE FROM `summarizeTelemetryHealth`
 * ----------------------------------------------------
 * `freshness.ts`'s `summarizeTelemetryHealth` answers a narrower question —
 * "can this board be trusted right now" — over source freshness alone, and
 * its vocabulary is green/degraded/red/unknown. This module answers the
 * question the Bridge header actually asks: "is the DATABASE all right",
 * which needs both the trust axis (freshness) AND the signal axis (what the
 * readable sources reported). It CONSUMES `FreshnessState` rather than
 * redefining it, so there is still exactly one freshness vocabulary.
 *
 * THE FIVE STATES, AND WHY DEGRADED IS NOT A SEVERITY
 * ---------------------------------------------------
 *   GREEN     every live signal is ok, and nothing required is blind.
 *   AMBER     the worst live signal is a warning.
 *   RED       at least one live signal is critical.
 *   DEGRADED  every live signal is ok, but a REQUIRED source is not live —
 *             so "ok" describes only the part of the system we can see.
 *   UNKNOWN   there is no usable live signal at all. Not healthy. Not a
 *             fire. Nothing was learned.
 *
 * DEGRADED sits on the OBSERVABILITY axis, not the severity axis. That is
 * why RED beats DEGRADED: a partly-blind board that can nevertheless see a
 * fire must report the fire. The constraint the brief states is only that a
 * blind required source can never yield GREEN — it does not say such a
 * board must stop reporting what it can still see. Getting this backwards
 * would hide a live critical signal behind a collector outage, which is the
 * exact failure this whole program exists to remove.
 *
 * "UNKNOWN IS NEVER ZERO AND NEVER HEALTHY" (brief §6, §86)
 * ---------------------------------------------------------
 * A stale source's last row is not evidence about NOW. A collector that
 * stopped three hours ago is still holding a row that says "connections at
 * 12%", and folding that row in would render a dead collector as a healthy
 * database. So only sources whose freshness is `healthy` or `degraded`
 * contribute signals; `stale`, `blind` and `unknown` contribute a CAP and
 * nothing else. A signal whose own level is `unknown` contributes neither.
 */
import type { FreshnessState } from './freshness';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const DB_STATES = ['GREEN', 'AMBER', 'RED', 'DEGRADED', 'UNKNOWN'] as const;
export type DbState = (typeof DB_STATES)[number];

/** How much the verdict above is worth. `none` is reserved for UNKNOWN. */
export const DB_STATE_CONFIDENCES = ['high', 'medium', 'low', 'none'] as const;
export type DbStateConfidence = (typeof DB_STATE_CONFIDENCES)[number];

/** What one evaluated rule said. `unknown` is a real answer — a baseline
 *  that is still collecting has not said "ok". */
export type DbSignalLevel = 'ok' | 'warning' | 'critical' | 'unknown';

export interface DbStateSignal {
  /** Stable, low-cardinality id — a rule name, never an entity id
   *  (brief §6). e.g. `connection_saturation`, `rollback_rate`. */
  id: string;
  level: DbSignalLevel;
  /** One safe sentence for the surface. No raw SQL, no UUIDs, no PII. */
  summary: string;
}

export interface DbStateSource {
  /** Stable source name — a table/collector/service, e.g. `db_health_samples`. */
  name: string;
  /** `true` when this source is meant to always be producing telemetry.
   *  A required source that is not live blocks GREEN; an optional one only
   *  lowers confidence. */
  required: boolean;
  freshness: FreshnessState;
  /** Signals this source produced THIS refresh. A source that could not be
   *  read carries none — and any it does carry are ignored unless the
   *  source is live (see the header). */
  signals: readonly DbStateSignal[];
}

export interface FoldDatabaseStateInput {
  sources: readonly DbStateSource[];
}

/** How one piece of evidence relates to the verdict.
 *  `decisive`     — this is the signal that set the state.
 *  `contributing` — a non-ok signal that did not set the state.
 *  `capping`      — a source that limited what the verdict could be. */
export type DbStateEvidenceWeight = 'decisive' | 'contributing' | 'capping';

export interface DbStateEvidenceItem {
  kind: 'signal' | 'source';
  /** The signal id or the source name. */
  id: string;
  detail: string;
  weight: DbStateEvidenceWeight;
}

export interface DatabaseStateVerdict {
  state: DbState;
  confidence: DbStateConfidence;
  /** `true` when at least one REQUIRED source is not live. GREEN is then
   *  unreachable by construction — a caller can render the reason without
   *  re-deriving it. */
  greenBlocked: boolean;
  /** Names of the required sources that are not live, in input order. */
  blindRequiredSources: readonly string[];
  evidence: readonly DbStateEvidenceItem[];
}

// ---------------------------------------------------------------------------
// Fold
// ---------------------------------------------------------------------------

/** A source is LIVE when it was read AND its most recent sample is recent
 *  enough to describe the present. `degraded` is behind but usable;
 *  `stale`/`blind`/`unknown` are not. */
function isLive(freshness: FreshnessState): boolean {
  return freshness === 'healthy' || freshness === 'degraded';
}

const SIGNAL_RANK: Record<DbSignalLevel, number> = { unknown: -1, ok: 0, warning: 1, critical: 2 };

function freshnessReason(freshness: FreshnessState): string {
  switch (freshness) {
    case 'blind':
      return 'could not be read this refresh';
    case 'stale':
      return 'last sample is far past its expected interval';
    case 'unknown':
      return 'read successfully but has never produced a sample';
    default:
      return 'not live';
  }
}

/**
 * Pure. Never throws, never mutates its input, and returns the same verdict
 * for the same input every time.
 */
export function foldDatabaseState(input: FoldDatabaseStateInput): DatabaseStateVerdict {
  const evidence: DbStateEvidenceItem[] = [];

  if (input.sources.length === 0) {
    return {
      state: 'UNKNOWN',
      confidence: 'none',
      greenBlocked: false,
      blindRequiredSources: [],
      evidence: [
        {
          kind: 'source',
          id: 'no_sources',
          detail: 'No telemetry sources were supplied, so nothing is known about the database.',
          weight: 'capping',
        },
      ],
    };
  }

  const notLive = input.sources.filter((s) => !isLive(s.freshness));
  const blindRequiredSources = notLive.filter((s) => s.required).map((s) => s.name);
  const greenBlocked = blindRequiredSources.length > 0;
  const hasNotLiveOptional = notLive.some((s) => !s.required);
  const hasBehindButLive = input.sources.some((s) => s.freshness === 'degraded');

  // Every non-live source caps the verdict, required or not — the required
  // ones block GREEN, the optional ones lower confidence, and BOTH are
  // recorded so a reader can see exactly what the board could not see.
  for (const source of notLive) {
    evidence.push({
      kind: 'source',
      id: source.name,
      detail: `${source.required ? 'Required' : 'Optional'} source '${source.name}' ${freshnessReason(source.freshness)}.`,
      weight: 'capping',
    });
  }

  // Only LIVE sources contribute signals, and only signals with a real
  // level (`unknown` is not an answer).
  const usableSignals = input.sources
    .filter((s) => isLive(s.freshness))
    .flatMap((s) => s.signals)
    .filter((sig) => sig.level !== 'unknown');

  const unknownLevelSignals = input.sources
    .filter((s) => isLive(s.freshness))
    .flatMap((s) => s.signals)
    .filter((sig) => sig.level === 'unknown');

  for (const sig of unknownLevelSignals) {
    evidence.push({
      kind: 'signal',
      id: sig.id,
      detail: `${sig.summary} (no verdict — this rule could not decide)`,
      weight: 'capping',
    });
  }

  if (usableSignals.length === 0) {
    evidence.push({
      kind: 'source',
      id: 'no_usable_signal',
      detail: 'No live source produced a signal with a verdict, so the database state is unknown rather than healthy.',
      weight: 'capping',
    });
    return { state: 'UNKNOWN', confidence: 'none', greenBlocked, blindRequiredSources, evidence };
  }

  let worst = usableSignals[0]!;
  for (const sig of usableSignals) {
    if (SIGNAL_RANK[sig.level] > SIGNAL_RANK[worst.level]) worst = sig;
  }

  const state: DbState =
    worst.level === 'critical' ? 'RED' : worst.level === 'warning' ? 'AMBER' : greenBlocked ? 'DEGRADED' : 'GREEN';

  // The decisive signal is the worst one — but only when it actually set the
  // state. When everything is ok, no single signal is decisive: what set the
  // state was the ABSENCE of a problem plus (for DEGRADED) a blind source.
  if (worst.level === 'critical' || worst.level === 'warning') {
    evidence.push({ kind: 'signal', id: worst.id, detail: worst.summary, weight: 'decisive' });
    for (const sig of usableSignals) {
      if (sig === worst || sig.level === 'ok') continue;
      evidence.push({ kind: 'signal', id: sig.id, detail: sig.summary, weight: 'contributing' });
    }
  } else {
    for (const sig of usableSignals) {
      evidence.push({ kind: 'signal', id: sig.id, detail: sig.summary, weight: 'contributing' });
    }
  }

  const confidence: DbStateConfidence = greenBlocked
    ? 'low'
    : hasNotLiveOptional || hasBehindButLive || unknownLevelSignals.length > 0
      ? 'medium'
      : 'high';

  return { state, confidence, greenBlocked, blindRequiredSources, evidence };
}
