// =============================================================================
// src/lib/baseball/read-models/signal-inbox.ts
//
// Packet: signal-inbox — the Signal Inbox read model (V10 §Signals tab).
//
// The central staff triage workspace. Loads team signals + the actions they
// converted into, shapes each into a render-ready row (severity, source chips,
// confidence, why-it-matters, evidence, recommended action, owner, lifecycle,
// "sample too small" first-class), and pre-computes the four V10 views:
//
//   - feed     : open signals, severity-then-recency ordered (daily triage).
//   - compact  : the same set, dense (staff meeting / quick review).
//   - grouped  : pre-bucketed by player / position-group proxy / category /
//                source / owner (the client toggles the active grouping).
//   - board    : action-lifecycle columns (new / acknowledged / converted /
//                resolved) for the kanban view.
//
// STAFF ONLY: the inbox is a coaching surface. Resolves the viewer server-side
// and returns an authorized:false envelope (NOT an error, NOT partial data)
// when the current user is not staff. RLS backs every query; this is the
// in-process gate + honest envelope on top.
//
// HONESTY (binding):
//   * Every signal carries a real SourceTrust built from its source_kind +
//     confidence — never a fabricated 100%. Confidence renders "—" when null.
//   * `sampleTooSmall` is surfaced as a first-class flag (from disposition OR a
//     sub-threshold sample_n) so a source-starved signal is never shown as
//     authoritative.
//   * Recommended actions are honest: a signal whose disposition is
//     sample_too_small exposes its recommendation as advisory, not a directive.
//
// 'server-only' + plain async functions (NOT 'use server') so server components
// and other read models can import it.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import {
  buildSourceRef,
  normalizeConfidence,
  type SourceRef,
} from '@/lib/baseball/source-record';
import { buildSourceTrust } from '@/components/baseball/source-trust/build-source-trust';
import type {
  SourceTrust,
  SourceProvenance,
} from '@/components/baseball/source-trust/source-trust-types';
import {
  parseSignalSourceRefs,
  OPEN_SIGNAL_DISPOSITIONS,
  type BaseballSignal,
  type BaseballAction,
  type BaseballSignalSeverity,
  type BaseballSignalDisposition,
  type BaseballSignalSourceRef,
  type BaseballSignalSourceKind,
  type BaseballActionType,
  type BaseballActionStatus,
} from '@/lib/types/baseball-signals';
import type { BaseballActionOutcomeVerdict } from '@/lib/types/baseball-coachhelm-v10';

// -----------------------------------------------------------------------------
// Tuning — recalibrated for 12-25 player rosters + box-score-only confidence
// -----------------------------------------------------------------------------

/**
 * Below this many observations a numeric signal is treated as "sample too
 * small" even if a generator forgot to set the disposition. Box-score baseball
 * lives in small samples; we never emit a confident claim from < 6 obs.
 */
const SAMPLE_TOO_SMALL_THRESHOLD = 6;

// -----------------------------------------------------------------------------
// Public shapes
// -----------------------------------------------------------------------------

/** A converted action attached to its source signal in the inbox. */
export interface SignalActionRow {
  id: string;
  actionType: BaseballActionType;
  title: string;
  status: BaseballActionStatus;
  assigneeCoachId: string | null;
  assigneePlayerId: string | null;
  dueDate: string | null;
  ownerCoachId: string | null;
  /**
   * V10 did-it-move verdict (outcome ledger). null until the outcome sweep has
   * measured the after-window. 'too_early'/'insufficient_sample' are honest
   * non-claims — the card renders them neutral, never as a win.
   */
  outcomeVerdict: BaseballActionOutcomeVerdict | null;
  /** After-window observations the verdict rests on (drives 'too_early'). */
  outcomeSampleN: number | null;
}

/** A render-ready signal row for every Signals view. */
export interface SignalInboxRow {
  id: string;
  teamId: string;
  playerId: string | null;
  eventId: string | null;
  signalType: string;
  category: string;
  severity: BaseballSignalSeverity;
  title: string;
  whyItMatters: string | null;
  evidence: string | null;
  /** Parsed provenance entries (also used to render the source drawer). */
  sourceRefs: BaseballSignalSourceRef[];
  /** Normalized [0,1] confidence, or null (renders "—"). */
  confidence: number | null;
  sampleN: number | null;
  /** FIRST-CLASS: disposition === 'sample_too_small' OR sample_n below floor. */
  sampleTooSmall: boolean;
  recommendedActionLabel: string | null;
  recommendedActionType: BaseballSignal['recommended_action_type'];
  recommendedOwnerRole: string | null;
  ownerCoachId: string | null;
  disposition: BaseballSignalDisposition;
  visibility: BaseballSignal['visibility'];
  feedback: BaseballSignal['feedback'];
  sourceKind: BaseballSignalSourceKind;
  createdAt: string;
  expiresAt: string | null;
  /** Render-ready trust descriptor for the SourceTrustBadge. */
  trust: SourceTrust;
  /** Rich provenance for the source drawer (built from sourceRefs). */
  provenance: SourceProvenance;
  /** Actions this signal has already converted into. */
  actions: SignalActionRow[];
}

export type SignalGrouping = 'player' | 'category' | 'source' | 'owner';

export interface SignalGroup {
  key: string;
  label: string;
  count: number;
  signalIds: string[];
}

export interface SignalBoardColumns {
  new: string[];
  acknowledged: string[];
  converted: string[];
  resolved: string[];
}

export interface SignalInboxReadModel {
  teamId: string;
  authorized: boolean;
  /** All loaded rows (the views below are indexes into this). */
  signals: SignalInboxRow[];
  /** feed/compact share the same ordered id list (compact is a render variant). */
  feedOrder: string[];
  /** Pre-bucketed groupings the client can switch between. */
  grouped: Record<SignalGrouping, SignalGroup[]>;
  /** Lifecycle columns for the board view. */
  board: SignalBoardColumns;
  summary: {
    open: number;
    critical: number;
    warning: number;
    info: number;
    sampleTooSmall: number;
    converted: number;
    activeActions: number;
  };
  error: string | null;
}

export interface SignalInboxOptions {
  /** Max signals (default 200). */
  limit?: number;
  /** Include terminal (dismissed/resolved/expired) signals too. Default false. */
  includeClosed?: boolean;
}

// -----------------------------------------------------------------------------
// Severity ordering helpers
// -----------------------------------------------------------------------------

const SEVERITY_RANK: Record<BaseballSignalSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

// -----------------------------------------------------------------------------
// Staff authorization (mirrors command-center read model)
// -----------------------------------------------------------------------------

async function isTeamStaff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) return false;

  const { data: staff } = await supabase
    .from('baseball_team_coach_staff')
    .select('id')
    .eq('team_id', teamId)
    .eq('coach_id', coach.id)
    .maybeSingle();

  return !!staff;
}

// -----------------------------------------------------------------------------
// Row shaping
// -----------------------------------------------------------------------------

function sourceRefLabel(refs: BaseballSignalSourceRef[]): string | null {
  if (refs.length === 0) return null;
  const first = refs[0];
  if (!first) return null;
  const extra = refs.length - 1;
  const base = first.label ?? first.source_table;
  return extra > 0 ? `${base} +${extra}` : base;
}

function buildTrust(signal: BaseballSignal, refs: BaseballSignalSourceRef[]): SourceTrust {
  // The signal's own provenance kind drives the badge; a recommendation is a
  // 'logged_intent' honesty-wise (it is advisory until converted), but the
  // underlying detection is an active capture, so the trust reflects the data.
  const label = sourceRefLabel(refs) ?? signalSourceLabel(signal.source_kind);
  const ref: SourceRef = buildSourceRef({
    source: signal.source_kind,
    sourceId: signal.id,
    label,
  });
  return buildSourceTrust({
    ref,
    confidence: normalizeConfidence(signal.confidence),
    // Detection itself is observed; the *recommendation* is rendered as advisory
    // by the card, not by faking the capture mode.
    captureMode: 'active_capture',
    verified: signal.feedback === 'useful',
    conflict: signal.feedback === 'wrong',
    trustLevel: signal.source_kind === 'ai' ? 'ai_derived' : undefined,
  });
}

function signalSourceLabel(kind: BaseballSignalSourceKind): string {
  switch (kind) {
    case 'ai':
      return 'CoachHelm engine';
    case 'csv_import':
      return 'Import pipeline';
    case 'integration':
      return 'Device integration';
    case 'manual':
      return 'Coach entry';
    case 'system':
      return 'System rule';
    default:
      return 'Unverified source';
  }
}

function buildProvenance(
  signal: BaseballSignal,
  refs: BaseballSignalSourceRef[],
): SourceProvenance {
  return {
    ref: buildSourceRef({
      source: signal.source_kind,
      sourceId: signal.id,
      label: signalSourceLabel(signal.source_kind),
    }),
    sourceName: signalSourceLabel(signal.source_kind),
    generatedAt: signal.created_at,
    expiresAt: signal.expires_at,
    visibility:
      signal.visibility === 'staff_only'
        ? 'staff_only'
        : signal.visibility === 'player_only'
          ? 'restricted'
          : 'player_visible',
    facts: refs
      .map((r) =>
        r.label
          ? `${r.label}${r.sample_n ? ` (n=${r.sample_n})` : ''}`
          : `${r.source_table}${r.column ? `.${r.column}` : ''}`,
      )
      .filter(Boolean),
    interpretation: signal.why_it_matters,
    relatedObjects: refs.map((r) => ({
      kind: 'Source',
      label: r.label ?? r.source_table,
    })),
  };
}

function shapeSignal(
  signal: BaseballSignal,
  actionsBySignal: Map<string, SignalActionRow[]>,
): SignalInboxRow {
  const refs = parseSignalSourceRefs(signal.source_refs);
  const sampleTooSmall =
    signal.disposition === 'sample_too_small' ||
    (signal.sample_n != null && signal.sample_n < SAMPLE_TOO_SMALL_THRESHOLD);

  return {
    id: signal.id,
    teamId: signal.team_id,
    playerId: signal.player_id,
    eventId: signal.event_id,
    signalType: signal.signal_type,
    category: signal.category,
    severity: signal.severity,
    title: signal.title,
    whyItMatters: signal.why_it_matters,
    evidence: signal.evidence,
    sourceRefs: refs,
    confidence: normalizeConfidence(signal.confidence),
    sampleN: signal.sample_n,
    sampleTooSmall,
    recommendedActionLabel: signal.recommended_action_label,
    recommendedActionType: signal.recommended_action_type,
    recommendedOwnerRole: signal.recommended_owner_role,
    ownerCoachId: signal.owner_coach_id,
    disposition: signal.disposition,
    visibility: signal.visibility,
    feedback: signal.feedback,
    sourceKind: signal.source_kind,
    createdAt: signal.created_at,
    expiresAt: signal.expires_at,
    trust: buildTrust(signal, refs),
    provenance: buildProvenance(signal, refs),
    actions: actionsBySignal.get(signal.id) ?? [],
  };
}

// -----------------------------------------------------------------------------
// Grouping
// -----------------------------------------------------------------------------

function buildGroups(
  rows: SignalInboxRow[],
  playerNames: Map<string, string>,
): Record<SignalGrouping, SignalGroup[]> {
  const byKey = (
    keyOf: (r: SignalInboxRow) => { key: string; label: string },
  ): SignalGroup[] => {
    const map = new Map<string, SignalGroup>();
    for (const r of rows) {
      const { key, label } = keyOf(r);
      const g = map.get(key);
      if (g) {
        g.count += 1;
        g.signalIds.push(r.id);
      } else {
        map.set(key, { key, label, count: 1, signalIds: [r.id] });
      }
    }
    // Largest groups first; stable label tiebreak.
    return [...map.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );
  };

  return {
    player: byKey((r) => ({
      key: r.playerId ?? 'team',
      label: r.playerId
        ? (playerNames.get(r.playerId) ?? 'Player')
        : 'Team-wide',
    })),
    category: byKey((r) => ({ key: r.category, label: titleCase(r.category) })),
    source: byKey((r) => ({
      key: r.sourceKind,
      label: signalSourceLabel(r.sourceKind),
    })),
    owner: byKey((r) => ({
      key: r.ownerCoachId ?? 'unassigned',
      label: r.ownerCoachId ? 'Assigned' : 'Unassigned',
    })),
  };
}

function titleCase(s: string): string {
  return s
    .split(/[_\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// -----------------------------------------------------------------------------
// getSignalInbox
// -----------------------------------------------------------------------------

/**
 * Build the Signal Inbox read model for a team. Staff-only: returns
 * authorized:false with empty views when the current user is not staff. Never
 * throws — sub-read failures degrade to empty arrays + an `error` string.
 */
export async function getSignalInbox(
  teamId: string,
  options: SignalInboxOptions = {},
): Promise<SignalInboxReadModel> {
  const { limit = 200, includeClosed = false } = options;

  const empty = (
    authorized: boolean,
    error: string | null,
  ): SignalInboxReadModel => ({
    teamId,
    authorized,
    signals: [],
    feedOrder: [],
    grouped: { player: [], category: [], source: [], owner: [] },
    board: { new: [], acknowledged: [], converted: [], resolved: [] },
    summary: {
      open: 0,
      critical: 0,
      warning: 0,
      info: 0,
      sampleTooSmall: 0,
      converted: 0,
      activeActions: 0,
    },
    error,
  });

  if (!teamId) return empty(false, 'A team id is required.');

  const supabase = await createClient();
  if (!(await isTeamStaff(supabase, teamId))) {
    return empty(false, null); // honest unauthorized envelope (not an error)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const signalQuery = sb
    .from('baseball_signals')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));

  if (!includeClosed) {
    signalQuery.in('disposition', [
      ...OPEN_SIGNAL_DISPOSITIONS,
      'converted', // converted stays visible (it links to its actions)
    ]);
  }

  const [signalsRes, actionsRes, membersRes] = await Promise.all([
    signalQuery,
    sb
      .from('baseball_actions')
      .select(
        'id, signal_id, action_type, title, status, assignee_coach_id, assignee_player_id, due_date, owner_coach_id, outcome_verdict, outcome_sample_n',
      )
      .eq('team_id', teamId),
    supabase
      .from('baseball_team_members')
      .select('player_id, baseball_players!inner ( id, first_name, last_name )')
      .eq('team_id', teamId),
  ]);

  let error: string | null = null;

  // Player name lookup for grouping labels.
  const playerNames = new Map<string, string>();
  if (!membersRes.error) {
    for (const m of membersRes.data ?? []) {
      const p = m.baseball_players as unknown as {
        id: string;
        first_name: string | null;
        last_name: string | null;
      } | null;
      if (p) {
        playerNames.set(
          p.id,
          `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player',
        );
      }
    }
  }

  // Actions indexed by signal.
  const actionsBySignal = new Map<string, SignalActionRow[]>();
  let activeActions = 0;
  if (actionsRes.error) {
    error = 'Converted actions could not be loaded.';
  } else {
    const VALID_VERDICTS: ReadonlySet<string> = new Set([
      'improved', 'no_change', 'regressed', 'too_early', 'insufficient_sample',
    ]);
    for (const a of (actionsRes.data ?? []) as Array<
      BaseballAction & { outcome_verdict?: string | null; outcome_sample_n?: number | null }
    >) {
      if (!a.signal_id) continue;
      const rawVerdict = a.outcome_verdict ?? null;
      const row: SignalActionRow = {
        id: a.id,
        actionType: a.action_type,
        title: a.title,
        status: a.status,
        assigneeCoachId: a.assignee_coach_id,
        assigneePlayerId: a.assignee_player_id,
        dueDate: a.due_date,
        ownerCoachId: a.owner_coach_id,
        outcomeVerdict:
          rawVerdict && VALID_VERDICTS.has(rawVerdict)
            ? (rawVerdict as BaseballActionOutcomeVerdict)
            : null,
        outcomeSampleN: a.outcome_sample_n ?? null,
      };
      const arr = actionsBySignal.get(a.signal_id) ?? [];
      arr.push(row);
      actionsBySignal.set(a.signal_id, arr);
      if (a.status === 'open' || a.status === 'in_progress' || a.status === 'blocked') {
        activeActions += 1;
      }
    }
  }

  // Signals.
  const signals: SignalInboxRow[] = [];
  if (signalsRes.error) {
    error = error ?? 'Signals could not be loaded.';
  } else {
    for (const s of (signalsRes.data ?? []) as BaseballSignal[]) {
      signals.push(shapeSignal(s, actionsBySignal));
    }
  }

  // feed/compact order: severity then recency. sample-too-small de-prioritized
  // within the same severity (it is not authoritative).
  const feedOrder = [...signals]
    .sort((a, b) => {
      const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sev !== 0) return sev;
      if (a.sampleTooSmall !== b.sampleTooSmall) return a.sampleTooSmall ? 1 : -1;
      return b.createdAt.localeCompare(a.createdAt);
    })
    .map((s) => s.id);

  // board lifecycle columns.
  const board: SignalBoardColumns = {
    new: [],
    acknowledged: [],
    converted: [],
    resolved: [],
  };
  for (const s of signals) {
    if (s.disposition === 'converted') board.converted.push(s.id);
    else if (s.disposition === 'resolved') board.resolved.push(s.id);
    else if (s.disposition === 'acknowledged') board.acknowledged.push(s.id);
    else board.new.push(s.id); // new + sample_too_small both start as triageable
  }

  const grouped = buildGroups(signals, playerNames);

  const openSignals = signals.filter((s) =>
    (OPEN_SIGNAL_DISPOSITIONS as readonly string[]).includes(s.disposition),
  );

  return {
    teamId,
    authorized: true,
    signals,
    feedOrder,
    grouped,
    board,
    summary: {
      open: openSignals.length,
      critical: openSignals.filter((s) => s.severity === 'critical').length,
      warning: openSignals.filter((s) => s.severity === 'warning').length,
      info: openSignals.filter((s) => s.severity === 'info').length,
      sampleTooSmall: signals.filter((s) => s.sampleTooSmall).length,
      converted: signals.filter((s) => s.disposition === 'converted').length,
      activeActions,
    },
    error,
  };
}
