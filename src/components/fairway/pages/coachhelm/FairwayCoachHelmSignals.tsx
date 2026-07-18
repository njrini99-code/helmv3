'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · FairwayCoachHelmSignals — the ONE triage workspace
 * ----------------------------------------------------------------------------
 * The single Signals surface body for alerts + insights + patterns. THREE thin
 * route forks mount this ONE component, discriminated by `signalSource`
 * ('insights' | 'patterns') + a `defaultFilter` preset (cohesionResolution
 * "SIGNALS IS ONE COMPONENT"):
 *   • /alerts    → signalSource='insights', default {urgent/high, active},
 *                  signalTypes=[insight,pattern] (interleaves both), showScanTeam
 *   • /insights  → signalSource='insights', smartDefault 'new_and_critical_this_week'
 *   • /patterns  → signalSource='patterns', groupBy 'player', view 'grouped'
 *
 * Everything renders under ONE InsightCard / InsightPanel vocabulary + ONE
 * Toolbar (via SignalsToolbar): patterns are projected through the pure
 * `patternToInsightVocabulary` adapter so a pattern reads like every other
 * CoachHelm signal (plain-language "so what" + evidence Inset + confidence word).
 *
 * ── PRESERVE LOGIC (imported UNCHANGED) ──────────────────────────────────────
 *   insight-delivery.ts#getInsightsForCoach          (the single insight read)
 *   insights.ts#acknowledgeInsight, dismissInsight   (per-insight triage)
 *   development.ts#createFocusAreaFromInsight         (insight → focus area)
 *   alerts.ts#generateAlerts (via ScanTeamControl), dismissAllAlerts,
 *             acknowledgeAllAlerts                     (bulk / scan)
 *   insight-management.ts#bulk*, exportInsights, getInsightsStats
 *   pattern-management.ts#getTeamPatterns, getPatternStats, validatePattern,
 *             dismissPattern, markPatternAddressed, resolvePattern
 *
 * ── PORTED (same calls, re-implemented control shape) ────────────────────────
 *   • Optimistic-removal-with-rollback handler shape — from CoachAlertCenter
 *     (snapshot prev → filter row out → await action → restore prev on !success).
 *   • URL-as-state filter contract (parseSetParam + router.replace sync) —
 *     from InsightsPageContent.
 *
 * The component RENDERS the CoachHelmShell wrapper itself (active='signals') and
 * accepts the per-route initial data + defaultFilter as props; the route fork
 * just calls this component. PRESENTATION + LAYOUT + ORGANIZATION only.
 * ========================================================================== */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Check, X, Target, ChevronDown, ChevronRight, RefreshCw, SlidersHorizontal, User } from 'lucide-react';

import { CoachHelmShell } from './CoachHelmShell';
import {
  SignalsToolbar,
  type AppliedFilterChip,
} from './signals/SignalsToolbar';
import { ScanTeamControl } from './signals/ScanTeamControl';
import {
  insightsToSignalRows,
  patternsToSignalRows,
  type SignalRow,
  type SignalSource,
} from './signals/patternToInsightVocabulary';

import { InsightCard } from '@/components/fairway/cards-insight/InsightCard';
import { Checkbox } from '@/components/fairway/forms/Checkbox';
import { InsightPanel } from '@/components/fairway/cards-insight/InsightPanel';
import { MetricCard } from '@/components/fairway/cards-insight/MetricCard';
import { DiagnosisPanel } from '@/components/golf/coachhelm/insights/DiagnosisPanel';
import { LeakBoard, type LeakInsight } from '@/components/golf/coachhelm/coach/LeakBoard';
import { Button } from '@/components/fairway/controls/button';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { InsufficientData } from '@/components/fairway/feedback/InsufficientData';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import type { ToolbarFilterOption } from '@/components/fairway/controls/Toolbar';
import {
  Segmented,
  type SegmentedOption,
} from '@/components/fairway/controls/segmented';

// ── PRESERVED server actions (imported, never rewritten) ─────────────────────
import {
  getInsightsForCoachWithMeta,
  type EvidenceInsight,
} from '@/app/golf/actions/insight-delivery';
import {
  acknowledgeInsight,
  dismissInsight,
  reactivateInsight,
} from '@/app/golf/actions/insights';
import { createFocusAreaFromInsight } from '@/app/golf/actions/development';
import {
  bulkAcknowledgeInsights,
  bulkDismissInsights,
  bulkResolveInsights,
  exportInsights,
} from '@/app/golf/actions/insight-management';
import {
  getTeamPatterns,
  validatePattern,
  dismissPattern,
  markPatternAddressed,
  resolvePattern,
  reopenPattern,
  type ExtendedPattern,
  type PatternSeverity,
} from '@/app/golf/actions/pattern-management';
import type { InsightPriority } from '@/components/fairway/cards-insight/InsightCard';
import { InsightTrustChips } from './InsightTrustChips';
import { getInsightTrustSignals } from '@/app/golf/actions/coachhelm-analytics';
import type { TrustSignal } from '@/lib/coachhelm/v3/effectiveness/event-ledger';
import { surfaceHref, surfaceName } from '@/lib/golf/surface-registry';

/* ───────────────────────────────────────────────────────────────────────────
 * Props — the discriminated surface contract.
 * ─────────────────────────────────────────────────────────────────────────── */

export type SignalsView = 'feed' | 'table' | 'grouped';
export type SignalGroupBy = 'none' | 'player' | 'category';

/** The default-filter preset a route passes in (the only per-route variance). */
export interface SignalsDefaultFilter {
  /**
   * Pre-selected severity values for the CLIENT filter, expressed in the MAPPED
   * row-tone vocabulary (e.g. ['critical','high']) — insight `urgent` is mapped
   * to row `critical` in INSIGHT_PRIORITY_MAP, so seeding ['urgent',…] here
   * would never match a row and would hide every urgent signal by default.
   */
  severity?: string[];
  /**
   * Raw insight priorities for the SERVER read (`getInsightsForCoach`), e.g.
   * ['urgent','high']. Kept separate from `severity` because the DB enum
   * ('urgent') differs from the mapped client tone ('critical').
   */
  fetchPriorities?: Array<'low' | 'medium' | 'high' | 'urgent'>;
  /** Pre-selected status value(s) the surface opens at. */
  status?: string;
  /** Which signal types this route shows. */
  signalTypes?: Array<'insight' | 'pattern'>;
  /** Pre-selected category/type values. */
  categories?: string[];
  /** Group rows (patterns default to 'player'). */
  groupBy?: SignalGroupBy;
  /** Initial render view. */
  view?: SignalsView;
  /**
   * A named smart default — e.g. 'new_and_critical_this_week' for /insights so
   * the workspace is never an unfiltered firehose nor an empty shell.
   */
  smartDefault?: 'new_and_critical_this_week';
}

export interface FairwayCoachHelmSignalsProps {
  /* identity */
  coachId: string;
  teamId: string;

  /* discriminator */
  signalSource: SignalSource;
  defaultFilter?: SignalsDefaultFilter;

  /* per-route initial data (SSR-fetched above the fork; UNCHANGED actions) */
  initialInsights?: EvidenceInsight[];
  initialPatterns?: ExtendedPattern[];
  /**
   * `player_id -> display name` for the coach's team roster (SSR-resolved via
   * `getTeamPlayers`). Insight-sourced rows (alerts/insights) don't carry a
   * player name of their own — only patterns do (resolved inline by
   * `getTeamPatterns`) — so this is how the "By player" grouping gets a real
   * name instead of falling back to "Unknown player" for every row. Optional:
   * omitting it just means insight rows group under "Unknown player", the
   * prior (degraded) behavior — never a hard failure.
   */
  playerNames?: Record<string, string>;

  /* shell chrome */
  /** Urgent+high open-signal count, computed once server-side (shell badge). */
  signalCount?: number | null;
  /** Whether to show the Scan-Team control (alerts route → true). */
  showScanTeam?: boolean;
  /** SSR-known title override; defaults to "Signals". */
  title?: React.ReactNode;
  /** Optional shareable initial filter from the URL (?severity=&status=…). */
  initialSearchParams?: Record<string, string | undefined>;
}

/* ───────────────────────────────────────────────────────────────────────────
 * URL-as-state helpers — ported from InsightsPageContent (parseSetParam + sync)
 * ─────────────────────────────────────────────────────────────────────────── */

function parseSetParam(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0),
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Filter vocabularies (the ONE coherent system replacing 3 mechanisms)
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * The ONE evidence renderer, shared by the feed card and the open-signal
 * InsightPanel — the panel previously carried its own copy of this markup and
 * silently missed the phone fix (#957 review). Below `sm` it is a stack of
 * label⇄value rows (label left, value right): a column grid at ~150px per
 * column forced eyebrow labels like "ESTIMATED 3-PUTT RATE (15+ FT)" to wrap
 * one word per line. From `sm` up, the original column grid (3-up on the
 * feed card, 2-up in the narrower panel) is unchanged.
 *
 * The mobile row's value column (`dd`) is capped at `max-w-[45%]` (audit W2):
 * it previously carried an unconditional `shrink-0` with NO ceiling, while the
 * label (`dt`) had no floor beyond `min-w-0` — so a wide value+gloss (e.g. a
 * pattern's "high · costing" gloss beside a signed stroke figure) could claim
 * however much of the row it wanted, squeezing a genuinely long label (like
 * the example above) down to a sliver and forcing it across many more lines
 * than the row's own gap could visually separate from the value beside it.
 * Capping `dd` guarantees `dt` always keeps the majority share of the row, so
 * a long label wraps to a reasonable couple of lines instead of collapsing.
 */
export function EvidenceList({
  items,
  columns,
}: {
  items: ReadonlyArray<{ label: string; value: string; gloss?: string }>;
  columns: 2 | 3;
}) {
  return (
    <dl
      className={cn(
        'flex flex-col gap-2 sm:grid sm:gap-x-6',
        columns === 3 ? 'sm:grid-cols-3 sm:gap-y-1.5' : 'sm:grid-cols-2 sm:gap-y-2',
      )}
    >
      {items.map((e) => (
        <div
          key={e.label}
          className="flex items-baseline justify-between gap-x-4 sm:flex-col sm:justify-start"
        >
          <dt className="min-w-0 font-fw-sans text-eyebrow uppercase text-text-tertiary">
            {e.label}
          </dt>
          <dd className="max-w-[45%] shrink-0 text-right font-fw-mono text-body-sm tabular-nums text-text-primary sm:max-w-none sm:text-left">
            {e.value}
            {e.gloss ? (
              <span className="ml-1 font-fw-sans text-caption text-text-tertiary">{e.gloss}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const SEVERITY_OPTIONS: ToolbarFilterOption[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const INSIGHT_STATUS_OPTIONS: ToolbarFilterOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

const PATTERN_STATUS_OPTIONS: ToolbarFilterOption[] = [
  { value: 'Detected', label: 'Detected' },
  { value: 'Confirmed', label: 'Confirmed' },
  { value: 'Addressed', label: 'Addressed' },
  { value: 'Resolved', label: 'Resolved' },
];

/** The three feed densities. P046: the `table` value renders a flat list of
 *  COMPACT cards (no <table>, no column headers, no aligned cells), so it is
 *  labeled "Compact" — calling it "Table" claimed a tabular grid the surface
 *  does not produce (match-to-real-world honesty). The internal value stays
 *  `table` so shareable `?view=table` URLs keep working. */
const VIEW_OPTIONS: SegmentedOption<SignalsView>[] = [
  { value: 'feed', label: 'Feed' },
  { value: 'table', label: 'Compact' },
  { value: 'grouped', label: 'Grouped' },
];

/** The triage grouping axis — scan by athlete, by category, or one flat list. */
const GROUP_BY_OPTIONS: SegmentedOption<SignalGroupBy>[] = [
  { value: 'player', label: 'By player' },
  { value: 'category', label: 'By category' },
  { value: 'none', label: 'Flat' },
];

/**
 * The 3 sibling Signals routes this ONE shell serves. The segmented control
 * cross-links them so a coach can hop Alerts ↔ Insights ↔ Patterns without a
 * detour through the rail. Labels/hrefs come from surface-registry.ts (the
 * single source of truth) — never a local string literal.
 */
type SignalsSegmentId = 'alerts' | 'insights' | 'patterns';
const SIGNALS_SEGMENT_OPTIONS: SegmentedOption<SignalsSegmentId>[] = (
  ['alerts', 'insights', 'patterns'] as const
).map((id) => ({ value: id, label: surfaceName(id) }));

/** The smart-default shortlist cap — /insights opens to the N most pressing
 *  signals (priority desc, then recency): never empty, never a firehose. */
const SMART_DEFAULT_CAP = 8;

/**
 * Map a row's DERIVED InsightPriority (from the adapter's pattern_type +
 * |stroke_impact| derivation) onto the DB's PatternSeverity enum, so confirming
 * a pattern writes the honest severity rather than the all-'medium' column. The
 * `info` tone has no severity peer → 'low' (the floor), never a fabricated tier.
 */
function signalPriorityToPatternSeverity(priority: InsightPriority): PatternSeverity {
  switch (priority) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
    case 'info':
    default:
      return 'low';
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ─────────────────────────────────────────────────────────────────────────── */

export function FairwayCoachHelmSignals({
  coachId,
  teamId,
  signalSource,
  defaultFilter,
  initialInsights = [],
  initialPatterns = [],
  playerNames,
  signalCount,
  showScanTeam = false,
  title,
  initialSearchParams,
}: FairwayCoachHelmSignalsProps) {
  const router = useRouter();
  const isPatterns = signalSource === 'patterns';

  /* -- which of the 3 sibling Signals routes this mount IS, derived from the
        same discriminators the route forks already pass (never a pathname
        sniff, so it can't drift from the props that actually shaped this
        render): signalSource splits patterns off, and — within the
        'insights' source — the alerts preset is the only one that seeds a
        severity filter (['critical','high']); /insights opens unfiltered
        (smartDefault narrows client-side, not via a seeded severity set). -- */
  const activeSegment: SignalsSegmentId = isPatterns
    ? 'patterns'
    : (defaultFilter?.severity?.length ?? 0) > 0
      ? 'alerts'
      : 'insights';
  const onSegmentChange = useCallback(
    (next: SignalsSegmentId) => {
      if (next === activeSegment) return;
      router.push(surfaceHref(next));
    },
    [activeSegment, router],
  );

  /* -- the raw, source-typed working sets (separate so rollback is clean) -- */
  const [insights, setInsights] = useState<EvidenceInsight[]>(initialInsights);
  const [patterns, setPatterns] = useState<ExtendedPattern[]>(initialPatterns);

  /* -- patterns-only: contextual suppression state (the noise fix) ---------
     By default getTeamPatterns hides the ~13k low-value `contextual` rows; the
     coach can opt them back in. We keep the count it reports so the banner can
     honestly say "X contextual hidden". `showContextual` re-reads with the
     opt-in flag. Both are inert on the insights/alerts surfaces. */
  const [showContextual, setShowContextual] = useState(false);
  const [patternCounts, setPatternCounts] = useState<{
    returned: number;
    contextualHidden: number;
    capped: boolean;
  } | null>(null);

  const [loading, setLoading] = useState(
    isPatterns ? initialPatterns.length === 0 : initialInsights.length === 0,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBulkPending, startActionTransition] = useTransition();

  /* -- P058: the TRUE eligible insight total (post rank+dedupe, pre-100-slice)
        from the meta read, so the "Showing" tile can honestly disclose
        "N of TOTAL" rather than silently truncating at the cap. Insights-only;
        patterns carry their own `patternCounts`. null until first load. */
  const [eligibleTotal, setEligibleTotal] = useState<number | null>(null);

  /* -- P1-12: per-insight TRUST signals (the effectiveness payoff rendered as
        inline chips on each card). Keyed by insight id. Populated by ONE
        batched read in loadInsights for the COACH insights surface only — the
        patterns tab never fetches these. Failure-silent: a failed/empty read
        leaves this {} and the cards simply render no chips (never a fake one).
        Always reflects real ledger rows only. */
  const [trustSignals, setTrustSignals] = useState<Record<string, TrustSignal>>({});

  /* -- P061: a manual refresh in flight (re-pull the feed without a triage
        side-effect). Separate from `loading` so the first paint still uses the
        shape-matched skeleton while a refresh shows a quiet busy state. */
  const [isRefreshing, setIsRefreshing] = useState(false);

  /* -- per-row in-flight guard: which row ids have a mutation in flight. Drives
        the busy/disabled affordance on that row's action buttons so a coach
        can't double-fire (e.g. click 'Resolve' twice before the optimistic
        removal lands). A Set so independent rows can be acted on concurrently. */
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const markPending = useCallback((id: string, on: boolean) => {
    setPendingIds((prev) => {
      if (on === prev.has(id)) return prev;
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  /* -- filter state (seeded from defaultFilter + any shareable URL params) -- */
  const sp = initialSearchParams ?? {};
  const [query, setQuery] = useState(sp.q ?? '');
  const [severitySet, setSeveritySet] = useState<Set<string>>(
    () => parseSetParam(sp.severity) ?? new Set(),
  );
  const [statusSet, setStatusSet] = useState<Set<string>>(
    () => parseSetParam(sp.status),
  );
  const [categorySet, setCategorySet] = useState<Set<string>>(
    () => parseSetParam(sp.category),
  );
  const [view, setView] = useState<SignalsView>(
    (sp.view as SignalsView) ?? defaultFilter?.view ?? (isPatterns ? 'grouped' : 'feed'),
  );

  /* -- W2: mobile triage default (audit finding) --------------------------
        The bare fallback above (`isPatterns ? 'grouped' : 'feed'`) is what
        /alerts renders with — /insights and /patterns both already pin an
        explicit `defaultFilter.view` ('table' / 'grouped'), so this is the
        ONE default a coach actually hits unmodified. On a phone, 'feed'
        combined with the default `groupBy: 'player'` still renders each
        player's group as FULL InsightCards (evidence Inset + 3 full-weight
        buttons) — a reading assignment, not a triage list (the audited
        ~31,000px / 37-screen Signals feed). The `table`/`grouped` presets
        already render the dense one-line-row treatment this needs; the fix
        is choosing THAT by default under `sm`, not inventing a new one.

        `useMediaQuery` is SSR-safe (server snapshot = false, mobile-first —
        see AppShell's identical usage): the very first paint on an actual
        phone already matches (no correction needed), and on an actual
        desktop viewport React corrects the value synchronously BEFORE paint,
        so this never produces a hydration mismatch or a visible flash on
        either device class.

        The override only ever applies to the UNTOUCHED default: a `?view=`
        in the URL, a route's own `defaultFilter.view`, or the coach tapping
        ANY option in the toolbar (`viewTouched`) all take precedence
        permanently for the rest of the session — the existing toggle keeps
        working exactly as before, on every viewport. */
  const isCompactViewport = !useMediaQuery('(min-width: 640px)');
  const [viewTouched, setViewTouched] = useState(false);
  const hasExplicitViewPreset = Boolean(sp.view || defaultFilter?.view);
  const mobileTriageDefaultActive =
    isCompactViewport && !hasExplicitViewPreset && !viewTouched;
  /** The view every RENDER decision (grouping/compact/hero + the toolbar's
   *  own highlighted option) reads. `view` itself stays the coach's true,
   *  URL-synced preference — `displayView` only ever diverges from it while
   *  `mobileTriageDefaultActive` is active, and collapses back to `view` the
   *  instant that stops being true. */
  const displayView: SignalsView = mobileTriageDefaultActive ? 'grouped' : view;

  /* Grouping axis — the coach can swap player↔category from the toolbar. The
     insights triage workspace groups by player by default so a coach scans by
     athlete instead of reading a flat ~50-row firehose. */
  const [groupBy, setGroupBy] = useState<SignalGroupBy>(
    () =>
      (sp.groupBy as SignalGroupBy) ??
      defaultFilter?.groupBy ??
      (isPatterns ? 'player' : 'player'),
  );

  // Seed the preset ONCE on mount (no URL written until the coach changes it).
  useEffect(() => {
    if (!defaultFilter) return;
    if (!sp.severity && defaultFilter.severity?.length) {
      setSeveritySet(new Set(defaultFilter.severity));
    }
    if (!sp.status && defaultFilter.status) {
      setStatusSet(new Set([defaultFilter.status]));
    }
    if (!sp.category && defaultFilter.categories?.length) {
      setCategorySet(new Set(defaultFilter.categories));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -- selection (drives the bulk-action bar) -- */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /** Toggle one row's selection (the per-card checkbox). */
  const toggleRowSelected = useCallback((id: string, next: boolean) => {
    setSelectedIds((prev) => {
      if (next === prev.has(id)) return prev;
      const updated = new Set(prev);
      if (next) updated.add(id);
      else updated.delete(id);
      return updated;
    });
  }, []);

  /* -- expand-in-place panel (the InsightPanel read of one signal) --
        Seed from a `?id=` deep-link (the command palette's "Recent insights"
        result pushes `/golf/dashboard/insights?id=<insightId>`) so the palette
        lands on the EXACT insight panel, not the firehose list. The targeted
        row resolves once the data load completes (rows.find / allRows.find at
        the panel below). The param is stripped on mount (effect below) to keep
        the URL clean — `?id=` is a one-shot open intent, not shareable filter
        state. (Premium hard-gate B1: a deep-link must reach its target.) */
  const [openRowId, setOpenRowId] = useState<string | null>(sp.id ?? null);

  // Strip the one-shot `?id=` deep-link param once consumed into openRowId, so
  // it doesn't linger in the shareable URL (syncUrl owns the persisted filter
  // state and never emits `id`). Runs once on mount; replace (not push) avoids
  // a history entry and { scroll: false } preserves position.
  useEffect(() => {
    if (!sp.id) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('id');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -- the smart-default narrowing: ON by first paint, DISMISSIBLE (never
        hides anything silently — the banner says "show all"). Only ever armed
        on a route that opts in via smartDefault. -------------------------- */
  const hasSmartDefault = defaultFilter?.smartDefault === 'new_and_critical_this_week';
  const [smartDefaultOn, setSmartDefaultOn] = useState(hasSmartDefault);

  /* -- per-group collapse for the dense triage list ("show N more") ------- */
  const COLLAPSED_GROUP_SIZE = 4;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroupExpanded = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /* ── URL sync (ported contract) — quiet, shareable, scroll-preserving ──── */
  const syncUrl = useCallback(
    (next: {
      q?: string;
      severity?: Set<string>;
      status?: Set<string>;
      category?: Set<string>;
      view?: SignalsView;
      groupBy?: SignalGroupBy;
    }) => {
      const params = new URLSearchParams();
      const q = next.q ?? query;
      const sev = next.severity ?? severitySet;
      const st = next.status ?? statusSet;
      const cat = next.category ?? categorySet;
      const vw = next.view ?? view;
      const gb = next.groupBy ?? groupBy;
      if (q) params.set('q', q);
      if (sev.size) params.set('severity', Array.from(sev).join(','));
      if (st.size) params.set('status', Array.from(st).join(','));
      if (cat.size) params.set('category', Array.from(cat).join(','));
      if (vw !== (isPatterns ? 'grouped' : 'feed')) params.set('view', vw);
      if (gb !== (isPatterns ? 'player' : 'player')) params.set('groupBy', gb);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [query, severitySet, statusSet, categorySet, view, groupBy, isPatterns, router],
  );

  /* ── data load — preserved reads, honest error (never silent empty) ────── */
  const loadInsights = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setError(null);
      try {
        // P2-15: the meta read returns a DISCRIMINATED result so a DB failure
        // renders an error state instead of an empty "all clear" feed. P058:
        // it also carries the true eligible `total` (pre-100-cap) for honest
        // "N of TOTAL" disclosure.
        const res = await getInsightsForCoachWithMeta(coachId, {
          limit: 100,
          // The DB read uses the raw insight priorities, NOT the mapped
          // client-tone `severity` set (which holds 'critical', not 'urgent').
          priorities: defaultFilter?.fetchPriorities,
        });
        if (res.ok) {
          setInsights(res.data);
          setEligibleTotal(res.total);

          // P1-12: one batched trust-signal read for the visible insight ids.
          // FAILURE-SILENT — the effectiveness chips are a non-critical
          // enhancement, so any error/exception here must never disturb the
          // insight feed's happy path. On failure we simply leave the chips
          // off (no fake signals). Coach insights surface only (this is the
          // insights path; patterns never reach here).
          const insightIds = res.data
            .map((i) => i.id)
            .filter((id): id is string => !!id);
          if (insightIds.length > 0) {
            try {
              const trust = await getInsightTrustSignals(insightIds);
              if (trust.success) {
                setTrustSignals(trust.signals);
              }
            } catch {
              // swallow — chips stay off, feed is unaffected
            }
          } else {
            setTrustSignals({});
          }
        } else {
          setError(res.error);
        }
      } catch {
        setError('Could not load signals. Try refreshing.');
      } finally {
        setLoading(false);
      }
    },
    [coachId, defaultFilter?.fetchPriorities],
  );

  const loadPatterns = useCallback(
    async (showLoading = true, includeContextualOverride?: boolean) => {
      if (showLoading) setLoading(true);
      setError(null);
      try {
        // Patterns-only: respect the contextual toggle. Default hides the
        // ~13k-row contextual noise; the override lets the toggle re-read.
        const res = await getTeamPatterns({
          includeContextual: includeContextualOverride ?? showContextual,
        });
        if (res.success) {
          setPatterns(res.patterns ?? []);
          setPatternCounts(res.counts ?? null);
        } else setError(res.error ?? 'Could not load patterns.');
      } catch {
        setError('Could not load patterns. Try refreshing.');
      } finally {
        setLoading(false);
      }
    },
    [showContextual],
  );

  // Initial client fetch only when the route did NOT pre-seed data.
  // Patterns: when the route DID pre-seed (the common SSR path), the seeded
  // rows already reflect the default contextual suppression, but the counts
  // (returned / contextualHidden) are not passed through props — so we do a
  // quiet background refresh (no skeleton) ONLY to populate `patternCounts` for
  // the honest "X contextual hidden" banner. Insights/alerts are untouched.
  useEffect(() => {
    if (isPatterns) {
      if (initialPatterns.length === 0) void loadPatterns();
      else void loadPatterns(false);
    } else if (initialInsights.length === 0) {
      void loadInsights();
    } else {
      // P1-12: insights were SSR-pre-seeded so loadInsights won't run on
      // mount — fetch the trust signals for those seeded ids here so the chips
      // appear without a wasted full re-load. Failure-silent (chips stay off
      // on any error). Coach insights surface only.
      const ids = initialInsights
        .map((i) => i.id)
        .filter((id): id is string => !!id);
      if (ids.length > 0) {
        void (async () => {
          try {
            const trust = await getInsightTrustSignals(ids);
            if (trust.success) setTrustSignals(trust.signals);
          } catch {
            // swallow — chips stay off, feed is unaffected
          }
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -- patterns-only: flip the contextual toggle and re-read with the opt-in
        flag. Pass the next value explicitly so we don't race the state set. -- */
  const toggleContextual = useCallback(() => {
    const next = !showContextual;
    setShowContextual(next);
    setSelectedIds(new Set());
    void loadPatterns(true, next);
  }, [showContextual, loadPatterns]);

  /* ── project both sources into the ONE row vocabulary ──────────────────── */
  const allRows: SignalRow[] = useMemo(() => {
    if (isPatterns) return patternsToSignalRows(patterns);
    return insightsToSignalRows(insights, playerNames);
  }, [isPatterns, patterns, insights, playerNames]);

  // Team "where are we bleeding strokes" rollup (LeakBoard) — groups insights
  // by skill category by summed stroke-impact. Fed from its OWN full
  // team-wide read (below), NOT the active sub-tab's `insights` state: that
  // state is scoped per route (e.g. /alerts fetches urgent+high ONLY, via
  // `priorities: defaultFilter.fetchPriorities`; /insights fetches the full
  // range), so reusing it made the SAME "Where the team is bleeding" banner
  // silently re-total depending on which sub-tab was open. A stable, whole-
  // team source means the board reads the same number on /alerts and
  // /insights. Insights only (patterns have their own evidence shape);
  // LeakBoard renders its own honest-empty state, so we just pass what we have.
  const [leakSourceInsights, setLeakSourceInsights] = useState<EvidenceInsight[]>([]);
  useEffect(() => {
    if (isPatterns) return;
    let cancelled = false;
    void (async () => {
      try {
        // Deliberately NO `priorities` filter — the whole team, every
        // severity, is the stable scope this rollup promises.
        const res = await getInsightsForCoachWithMeta(coachId, { limit: 100 });
        if (!cancelled && res.ok) setLeakSourceInsights(res.data);
      } catch {
        // Best-effort / failure-silent — the board just stays at its own
        // honest empty state, never a stale or wrong total.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPatterns, coachId]);

  const leakInsights: LeakInsight[] = useMemo(() => {
    if (isPatterns) return [];
    const PRIORITY: Record<string, LeakInsight['priority']> = {
      critical: 'urgent', urgent: 'urgent', high: 'high', medium: 'medium', low: 'low', info: 'low',
    };
    const out: LeakInsight[] = [];
    for (const ins of leakSourceInsights) {
      const impact = ins.evidence?.strokes_impact;
      if (typeof impact !== 'number' || impact === 0) continue;
      out.push({
        id: ins.id,
        category: ins.category ?? null,
        title: ins.title,
        strokesImpact: impact,
        priority: PRIORITY[ins.priority as string] ?? 'medium',
        // LeakBoard uses playerName only for the distinct-player COUNT (never
        // displays it), so player_id gives an accurate count without a name.
        playerName: ins.player_id ?? undefined,
      });
    }
    return out;
  }, [isPatterns, leakSourceInsights]);

  /* ── client-side filter (ported applyClientFilters) ────────────────────── */
  const weight: Record<string, number> = useMemo(
    () => ({ critical: 4, high: 3, medium: 2, low: 1, info: 0 }),
    [],
  );

  const sortByUrgency = useCallback(
    (list: SignalRow[]) =>
      [...list].sort((a, b) => {
        // ── PATTERNS-ONLY ordering (GUARDED by signalSource === 'patterns' via
        //    isPatterns) ──────────────────────────────────────────────────────
        // For /dashboard/patterns the all-'medium' severity column made the
        // existing priority-then-recency sort float the NOISIEST player up, not
        // the most-impactful pattern. Order instead by:
        //   1. pattern_type rank desc (compound > conditional > temporal > contextual)
        //   2. priority desc (derived in the adapter from type + |impact|)
        //   3. |stroke_impact| desc
        //   4. recency desc
        // This branch NEVER runs for insights/alerts (isPatterns === false),
        // so their existing sort below is byte-for-byte unchanged.
        if (isPatterns) {
          const tr = (b.patternTypeRank ?? 0) - (a.patternTypeRank ?? 0);
          if (tr !== 0) return tr;
          const pw = (weight[b.priority] ?? 0) - (weight[a.priority] ?? 0);
          if (pw !== 0) return pw;
          const im = Math.abs(b.strokeImpact ?? 0) - Math.abs(a.strokeImpact ?? 0);
          if (im !== 0) return im;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        // ── EXISTING insights/alerts ordering (UNCHANGED) ────────────────────
        const pw = (weight[b.priority] ?? 0) - (weight[a.priority] ?? 0);
        if (pw !== 0) return pw;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [weight, isPatterns],
  );

  /* The explicit-filter result — what the coach's own filters/search select. */
  const filteredRows: SignalRow[] = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const next = allRows.filter((r) => {
      if (needle) {
        const hay = `${r.title} ${r.body} ${r.playerName ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (severitySet.size && !severitySet.has(r.priority)) return false;
      if (statusSet.size && !statusSet.has(r.status)) return false;
      if (categorySet.size) {
        if (!r.category || !categorySet.has(r.category)) return false;
      }
      return true;
    });
    return sortByUrgency(next);
  }, [allRows, query, severitySet, statusSet, categorySet, sortByUrgency]);

  /* Whether the coach has touched any explicit filter (smart default yields). */
  const noExplicitFilter =
    !query.trim() &&
    severitySet.size === 0 &&
    statusSet.size === 0 &&
    categorySet.size === 0;

  /* The smart-default narrowing: "new & critical this week". Applied on first
     paint (smartDefaultOn) whenever no explicit filter competes, so /insights
     opens as a triage shortlist, NEVER a ~50-item firehose. Honest: it narrows
     even when the count happens to equal allRows — the banner still says so. */
  const smartDefaultActive = hasSmartDefault && smartDefaultOn && noExplicitFilter;

  const rows: SignalRow[] = useMemo(() => {
    if (!smartDefaultActive) return filteredRows;
    // filteredRows is already priority-desc then recency-desc, so the top N are
    // the most pressing — critical/high float up when they exist, the freshest
    // signals lead otherwise. Never empty when filteredRows is non-empty.
    return filteredRows.slice(0, SMART_DEFAULT_CAP);
  }, [filteredRows, smartDefaultActive]);

  /* The denominator for the honest banner — the full set the smart default is
     narrowing FROM (everything the coach would see with the default cleared). */
  const fullCount = filteredRows.length;

  /* ── select-all-visible (insights/alerts only; patterns have no bulk bar) ──
     "Visible" = the rows currently rendered (`rows`), so a select-all matches
     what the coach can actually see, not a hidden firehose. */
  const selectableVisibleIds = useMemo(
    () => (isPatterns ? [] : rows.map((r) => r.id)),
    [isPatterns, rows],
  );
  const allVisibleSelected =
    selectableVisibleIds.length > 0 &&
    selectableVisibleIds.every((id) => selectedIds.has(id));

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const everySelected =
        selectableVisibleIds.length > 0 &&
        selectableVisibleIds.every((id) => next.has(id));
      if (everySelected) {
        for (const id of selectableVisibleIds) next.delete(id);
      } else {
        for (const id of selectableVisibleIds) next.add(id);
      }
      return next;
    });
  }, [selectableVisibleIds]);

  /* ── per-row triage handlers (PORTED optimistic-removal-with-rollback) ─── */

  const removeInsightOptimistic = useCallback(
    (
      insightId: string,
      action: (id: string) => Promise<{ success: boolean; error?: string }>,
      successLabel: string,
    ) => {
      // Double-submit guard: ignore a second click while this row is in flight.
      if (pendingIds.has(insightId)) return;
      const prev = insights;
      // Capture the removed row so an Undo can restore its prior lifecycle
      // server-side (not just flicker it back in the UI).
      const removedRow = prev.find((x) => x.id === insightId);
      const priorLifecycle = removedRow?.lifecycle_state;
      markPending(insightId, true);
      startActionTransition(async () => {
        try {
          setInsights((r) => r.filter((x) => x.id !== insightId));
          const res = await action(insightId);
          if (!res.success) {
            // Roll back AND tell the coach why — never let a failed row silently
            // flicker back with no explanation (Nielsen #1/#9).
            setInsights(prev);
            setError(res.error ?? `Could not ${successLabel.toLowerCase()} this signal. Try again.`);
          } else {
            // Visible per-row status feedback (Nielsen #1) + a real Undo
            // (Nielsen #3): the undo restores the row in the UI AND reverses the
            // mutation server-side via reactivateInsight, so a refresh agrees.
            fairwayToast.success(`Signal ${successLabel.toLowerCase()}.`, {
              action: {
                label: 'Undo',
                onClick: () => {
                  // Optimistically restore the row, then reverse server-side.
                  setInsights((r) =>
                    r.some((x) => x.id === insightId) ? r : prev,
                  );
                  void reactivateInsight(
                    insightId,
                    priorLifecycle === 'tentative' || priorLifecycle === 'archived'
                      ? undefined
                      : priorLifecycle,
                  ).then((undoRes) => {
                    if (!undoRes.success) {
                      // The reverse failed — re-remove the row so the UI doesn't
                      // claim a restore the server didn't honor, and say why.
                      setInsights((r) => r.filter((x) => x.id !== insightId));
                      setError(undoRes.error ?? 'Could not undo. Try again.');
                    }
                  });
                },
              },
            });
          }
        } catch {
          setInsights(prev);
          setError(`Could not ${successLabel.toLowerCase()} this signal. Try again.`);
        } finally {
          markPending(insightId, false);
        }
      });
    },
    [insights, pendingIds, markPending],
  );

  const handleAcknowledge = useCallback(
    (insightId: string) => removeInsightOptimistic(insightId, acknowledgeInsight, 'Acknowledged'),
    [removeInsightOptimistic],
  );

  const handleDismissInsight = useCallback(
    (insightId: string) => removeInsightOptimistic(insightId, dismissInsight, 'Dismissed'),
    [removeInsightOptimistic],
  );

  const handleCreateFocusAreaFromInsight = useCallback(
    (row: SignalRow) => {
      if (pendingIds.has(row.id)) return;
      const insight = row.raw as EvidenceInsight;
      markPending(row.id, true);
      startActionTransition(async () => {
        try {
          const res = await createFocusAreaFromInsight({
            insight_id: insight.id,
            player_id: insight.player_id,
            coach_id: coachId,
            title: insight.title,
            description: insight.content ?? '',
            insight_type: (insight.category as string | undefined) ?? 'general',
          });
          if (res.success) {
            // Confirm before we navigate away — the coach sees their action
            // succeeded rather than a silent route change (Nielsen #1).
            fairwayToast.success('Focus area created.');
            router.push('/golf/dashboard/development');
          } else {
            setError('Could not create the focus area. Try again.');
            markPending(row.id, false);
          }
        } catch {
          setError('Could not create the focus area. Try again.');
          markPending(row.id, false);
        }
      });
    },
    [coachId, router, pendingIds, markPending],
  );

  /* ── pattern lifecycle handlers (PORTED optimistic-removal-with-rollback) */

  const removePatternOptimistic = useCallback(
    (
      patternId: string,
      action: () => Promise<{ success: boolean; error?: string }>,
      successLabel: string,
    ) => {
      if (pendingIds.has(patternId)) return;
      const prev = patterns;
      // Capture the prior lifecycle so an Undo restores the EXACT pre-triage
      // state server-side (detected/confirmed/addressed), not a guess.
      const removedRow = prev.find((x) => x.id === patternId);
      const priorLifecycle = removedRow?.lifecycleState;
      const reopenTo: 'detected' | 'confirmed' | 'addressed' =
        priorLifecycle === 'confirmed' || priorLifecycle === 'addressed'
          ? priorLifecycle
          : 'detected';
      markPending(patternId, true);
      startActionTransition(async () => {
        try {
          setPatterns((r) => r.filter((x) => x.id !== patternId));
          const res = await action();
          if (!res.success) {
            setPatterns(prev);
            setError(res.error ?? `Could not ${successLabel.toLowerCase()} this pattern. Try again.`);
          } else {
            // Visible per-row status feedback (Nielsen #1) + a real Undo
            // (Nielsen #3): restores the row in the UI AND reverses the
            // mutation server-side via reopenPattern, so a refresh agrees.
            fairwayToast.success(`Pattern ${successLabel.toLowerCase()}.`, {
              action: {
                label: 'Undo',
                onClick: () => {
                  setPatterns((r) => (r.some((x) => x.id === patternId) ? r : prev));
                  void reopenPattern(patternId, reopenTo).then((undoRes) => {
                    if (!undoRes.success) {
                      setPatterns((r) => r.filter((x) => x.id !== patternId));
                      setError(undoRes.error ?? 'Could not undo. Try again.');
                    }
                  });
                },
              },
            });
          }
        } catch {
          setPatterns(prev);
          setError(`Could not ${successLabel.toLowerCase()} this pattern. Try again.`);
        } finally {
          markPending(patternId, false);
        }
      });
    },
    [patterns, pendingIds, markPending],
  );

  const handleConfirmPattern = useCallback(
    (row: SignalRow) => {
      if (pendingIds.has(row.id)) return;
      const p = row.raw as ExtendedPattern;
      // Validate (confirm) — does NOT remove the row; flip its lifecycle in place.
      const prev = patterns;
      markPending(row.id, true);
      startActionTransition(async () => {
        try {
          setPatterns((r) =>
            r.map((x) => (x.id === p.id ? { ...x, lifecycleState: 'confirmed' } : x)),
          );
          const res = await validatePattern(p.id, {
            isAccurate: true,
            // Write the DERIVED severity (from pattern_type + |stroke_impact|),
            // NOT the all-'medium' `golf_patterns_v2.severity` column — confirming
            // a pattern shouldn't stamp a misleading 'medium' over a genuine
            // high-impact signal. `row.priority` is the adapter's honest derivation.
            severity: signalPriorityToPatternSeverity(row.priority),
          });
          if (!res.success) {
            setPatterns(prev);
            setError(res.error ?? 'Could not confirm this pattern. Try again.');
          } else {
            fairwayToast.success('Pattern confirmed.');
          }
        } catch {
          setPatterns(prev);
          setError('Could not confirm this pattern. Try again.');
        } finally {
          markPending(row.id, false);
        }
      });
    },
    [patterns, pendingIds, markPending],
  );

  const handleAddressPattern = useCallback(
    (row: SignalRow) =>
      removePatternOptimistic(row.id, () => markPatternAddressed(row.id), 'Addressed'),
    [removePatternOptimistic],
  );

  const handleResolvePattern = useCallback(
    (row: SignalRow) =>
      removePatternOptimistic(row.id, () => resolvePattern(row.id), 'Resolved'),
    [removePatternOptimistic],
  );

  const handleDismissPattern = useCallback(
    (row: SignalRow) =>
      removePatternOptimistic(row.id, () => dismissPattern(row.id), 'Dismissed'),
    [removePatternOptimistic],
  );

  /* ── bulk actions (wires the previously dead-coded actions) ────────────── */

  const reload = useCallback(
    () => (isPatterns ? loadPatterns(false) : loadInsights(false)),
    [isPatterns, loadPatterns, loadInsights],
  );

  /* P061: manual refresh — re-pull the feed with NO triage side-effect, so a
     coach can re-read the latest without acting on a row. Uses showLoading=false
     (the shape-matched skeleton is for first paint); the shell action shows its
     own busy state via `isRefreshing`. Mirrors the legacy header's Refresh. */
  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    void Promise.resolve(reload()).finally(() => setIsRefreshing(false));
  }, [isRefreshing, reload]);

  const runBulk = useCallback(
    (
      action: (ids: string[]) => Promise<{ success: boolean }>,
      label: string,
    ) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      startActionTransition(async () => {
        try {
          const res = await action(ids);
          if (res.success) {
            setSelectedIds(new Set());
            setNotice(`${ids.length} signal${ids.length === 1 ? '' : 's'} ${label}.`);
            await reload();
          } else {
            setError(`Bulk ${label} failed. Try again.`);
          }
        } catch {
          setError(`Bulk ${label} failed. Try again.`);
        }
      });
    },
    [selectedIds, reload],
  );

  const handleExport = useCallback(() => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : filteredRows.map((r) => r.id);
    if (ids.length === 0) return;
    startActionTransition(async () => {
      try {
        const res = await exportInsights(ids, 'csv');
        if (res.success && res.data && typeof document !== 'undefined') {
          const blob = new Blob([res.data], { type: res.mimeType ?? 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = res.filename ?? 'signals.csv';
          a.click();
          URL.revokeObjectURL(url);
        } else if (!res.success) {
          setError(res.error ?? 'Export failed.');
        }
      } catch {
        setError('Export failed.');
      }
    });
  }, [selectedIds, filteredRows]);

  /* ── filter toggles + URL sync ─────────────────────────────────────────── */

  const toggleIn = useCallback(
    (
      value: string,
      set: Set<string>,
      apply: (next: Set<string>) => void,
      urlKey: 'severity' | 'status' | 'category',
    ) => {
      const next = new Set(set);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      if (setsEqual(next, set)) return;
      apply(next);
      setSelectedIds(new Set());
      syncUrl({ [urlKey]: next } as Parameters<typeof syncUrl>[0]);
    },
    [syncUrl],
  );

  const onToggleSeverity = (v: string) =>
    toggleIn(v, severitySet, setSeveritySet, 'severity');
  const onToggleStatus = (v: string) => toggleIn(v, statusSet, setStatusSet, 'status');
  const onToggleCategory = (v: string) =>
    toggleIn(v, categorySet, setCategorySet, 'category');

  const onQueryChange = (q: string) => {
    setQuery(q);
    setSelectedIds(new Set());
    syncUrl({ q });
  };

  const onViewChange = (v: SignalsView) => {
    // The coach has now made an explicit choice — the mobile triage default
    // (`mobileTriageDefaultActive`) must never override it again this session.
    setViewTouched(true);
    setView(v);
    syncUrl({ view: v });
  };

  const onGroupByChange = (g: SignalGroupBy) => {
    setGroupBy(g);
    setExpandedGroups(new Set());
    syncUrl({ groupBy: g });
  };

  /* ── applied-filter recall chips ───────────────────────────────────────── */
  const appliedChips: AppliedFilterChip[] = useMemo(() => {
    const chips: AppliedFilterChip[] = [];
    for (const s of severitySet) {
      // Label from the canonical mapped-tone options so the chip reads the SAME
      // word as the toolbar (e.g. 'critical' → "Critical", never the raw DB enum
      // 'Urgent'); fall back to a capitalized value for any unknown. The chip
      // label must be a string, so only adopt the option label when it is one.
      const optionLabel = SEVERITY_OPTIONS.find((o) => o.value === s)?.label;
      chips.push({
        key: `sev-${s}`,
        label:
          typeof optionLabel === 'string'
            ? optionLabel
            : s.charAt(0).toUpperCase() + s.slice(1),
        onRemove: () => onToggleSeverity(s),
      });
    }
    for (const s of statusSet)
      chips.push({ key: `st-${s}`, label: s, onRemove: () => onToggleStatus(s) });
    for (const c of categorySet)
      chips.push({ key: `cat-${c}`, label: c, onRemove: () => onToggleCategory(c) });
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severitySet, statusSet, categorySet]);

  /* ── category options derived from the present rows (no fabrication) ───── */
  const categoryOptions: ToolbarFilterOption[] = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of allRows) {
      if (r.category && !seen.has(r.category)) {
        const label = r.category
          .split(/[_\s]+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        seen.set(r.category, label);
      }
    }
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [allRows]);

  /* ── header summary tiles (honest counts, never fabricated) ──────────────
     "Urgent + high" is a SUBSET of "Open" — both scoped to open rows, priority
     the narrower filter — so the tiles can never contradict each other (the
     old version counted urgent+high across EVERY loaded row regardless of
     status, which let a sub-tab that pre-filtered its server fetch to
     urgent/high-only, like /alerts, show "Urgent + high" HIGHER than "Open"
     whenever a few of those loaded rows were already acknowledged/resolved —
     e.g. 13 urgent+high vs 10 open, reading as if there were MORE urgent
     signals than open ones). This also now matches the shell badge's own
     semantics (`getAlertCounts().counts.critical` — open urgent+high only). */
  const summary = useMemo(() => {
    const openRows = allRows.filter(
      (r) => r.status === 'active' || r.status === 'Detected' || r.status === 'Confirmed',
    );
    const urgent = openRows.filter(
      (r) => r.priority === 'critical' || r.priority === 'high',
    ).length;
    return { total: allRows.length, open: openRows.length, urgent };
  }, [allRows]);

  /* P058: honest "of N" footnote on the Loaded tile when the true eligible set
     exceeds what's loaded. Insights cap at limit:100 (eligibleTotal is the full
     post-rank/dedupe count); patterns cap at the read limit (patternCounts.capped
     means more were eligible than returned). Only render the footnote when there
     IS a known overflow — otherwise the value already IS complete. */
  const loadedFootnote = useMemo<string | undefined>(() => {
    if (isPatterns) {
      // "capped at N" (not "showing first N") — the tile label itself is
      // "Showing", so pairing it with a footnote that repeats the word read
      // as a stutter ("SHOWING 5 / showing first 5").
      if (patternCounts?.capped) {
        return `capped at ${summary.total}`;
      }
      return undefined;
    }
    if (eligibleTotal != null && eligibleTotal > allRows.length) {
      return `of ${eligibleTotal}`;
    }
    return undefined;
  }, [isPatterns, patternCounts, eligibleTotal, allRows.length, summary.total]);

  /** The sub-tab noun the KPI tiles are scoped to — each tile already reflects
   *  ONLY the active segment's own data (its own fetch/state), so the fix is
   *  labeling that scope honestly instead of a generic "signals" that reads as
   *  if all three sub-tabs shared one team-wide count. */
  const SIGNAL_NOUN: Record<SignalsSegmentId, string> = {
    alerts: 'alerts',
    insights: 'insights',
    patterns: 'patterns',
  };

  /* ── grouping — drives BOTH the dense default feed and the grouped view ── */
  // While the smart-default shortlist is active, render it FLAT — a curated
  // cross-player triage list fragments badly grouped one-row-per-player.
  const grouped =
    !smartDefaultActive &&
    (displayView === 'grouped' || (displayView === 'feed' && groupBy !== 'none'));
  const groups = useMemo(() => {
    if (groupBy === 'none' || !grouped) return null;
    const map = new Map<string, SignalRow[]>();
    for (const r of rows) {
      const key =
        groupBy === 'player'
          ? // Header is the player's display NAME. The pattern read
            // (getTeamPatterns) already resolves playerName from golf_players;
            // when it's absent (a row for a player no longer on the active
            // roster, or null name fields), we fall back to a humane label —
            // NEVER the raw player_id UUID, which is meaningless to a coach and
            // was the bug here. The UUID stays available on the row (r.playerId)
            // for focus-area conversion; it is just never the visible heading.
            (r.playerName?.trim() || 'Unknown player')
          : r.category
            ? r.category
                .split(/[_\s]+/)
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ')
            : 'Uncategorized';
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    // Order groups by their most-urgent member, then by size — the athlete /
    // category that needs attention first sits at the top of the workspace.
    return Array.from(map.entries()).sort((a, b) => {
      // ── PATTERNS-ONLY group ordering (GUARDED by isPatterns) ─────────────
      // With the all-'medium' severity column, "max priority weight" was the
      // SAME for every group, so groups fell back to size — i.e. the player
      // with the MOST (contextual-noise) patterns floated to the top instead
      // of the player with the most-impactful real signal. Rank groups by
      // their best pattern-type member first, then max priority, then max
      // |stroke_impact|, then size. Never runs for insights/alerts.
      if (isPatterns) {
        const atr = Math.max(...a[1].map((r) => r.patternTypeRank ?? 0));
        const btr = Math.max(...b[1].map((r) => r.patternTypeRank ?? 0));
        if (btr !== atr) return btr - atr;
        const apw = Math.max(...a[1].map((r) => weight[r.priority] ?? 0));
        const bpw = Math.max(...b[1].map((r) => weight[r.priority] ?? 0));
        if (bpw !== apw) return bpw - apw;
        const aim = Math.max(...a[1].map((r) => Math.abs(r.strokeImpact ?? 0)));
        const bim = Math.max(...b[1].map((r) => Math.abs(r.strokeImpact ?? 0)));
        if (bim !== aim) return bim - aim;
        return b[1].length - a[1].length;
      }
      // ── EXISTING insights/alerts group ordering (UNCHANGED) ──────────────
      const aw = Math.max(...a[1].map((r) => weight[r.priority] ?? 0));
      const bw = Math.max(...b[1].map((r) => weight[r.priority] ?? 0));
      if (bw !== aw) return bw - aw;
      return b[1].length - a[1].length;
    });
  }, [rows, groupBy, grouped, weight, isPatterns]);

  /* ── the shared row → action set (ONE vocabulary; per-source actions) ──── */
  const rowActions = useCallback(
    (row: SignalRow) => {
      // While THIS row has a mutation in flight, lock its whole action cluster:
      // the triggered (primary) action shows the spinner via `busy`; the others
      // disable so a coach can't fire a second mutation on a row mid-flight
      // (the double-submit guard in each handler is the belt; this is the
      // braces, plus the visible in-flight affordance Layer 3 requires).
      const rowPending = pendingIds.has(row.id);
      if (row.source === 'patterns') {
        const lifecycle = (row.raw as ExtendedPattern).lifecycleState;
        return (
          <>
            {lifecycle === 'detected' ? (
              <Button
                size="sm"
                variant="primary"
                busy={rowPending}
                leftIcon={<Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
                onClick={() => handleConfirmPattern(row)}
              >
                Confirm
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              disabled={rowPending}
              leftIcon={<Target className="h-4 w-4" strokeWidth={2} aria-hidden />}
              onClick={() => handleAddressPattern(row)}
            >
              Address
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={rowPending}
              onClick={() => handleResolvePattern(row)}
            >
              Resolve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={rowPending}
              leftIcon={<X className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
              onClick={() => handleDismissPattern(row)}
            >
              Dismiss
            </Button>
          </>
        );
      }
      return (
        <>
          <Button
            size="sm"
            variant="primary"
            busy={rowPending}
            leftIcon={<Target className="h-4 w-4" strokeWidth={2} aria-hidden />}
            onClick={() => handleCreateFocusAreaFromInsight(row)}
          >
            <span className="hidden sm:inline">Focus area</span>
            <span className="sm:hidden">Focus</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={rowPending}
            leftIcon={<Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
            onClick={() => handleAcknowledge(row.id)}
          >
            Acknowledge
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={rowPending}
            leftIcon={<X className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
            onClick={() => handleDismissInsight(row.id)}
          >
            Dismiss
          </Button>
        </>
      );
    },
    [
      pendingIds,
      handleConfirmPattern,
      handleAddressPattern,
      handleResolvePattern,
      handleDismissPattern,
      handleCreateFocusAreaFromInsight,
      handleAcknowledge,
      handleDismissInsight,
    ],
  );

  /* ── a single feed card (compact in table view, default otherwise) ─────── */
  const renderCard = useCallback(
    (row: SignalRow, opts?: { hero?: boolean; compact?: boolean }) => {
      const evidenceNode =
        row.evidence.length > 0 ? <EvidenceList items={row.evidence} columns={3} /> : undefined;

      // Multi-select is wired ONLY on the insights/alerts surface, where the
      // bulk-action bar (Acknowledge/Resolve/Dismiss/Export) exists. Patterns
      // have no bulk lifecycle, so they stay single-select per-row.
      const selectable = !isPatterns;

      // P1-12: the inline TRUST chips — the effectiveness payoff rendered right
      // on the card. COACH INSIGHTS SURFACE ONLY (row.source === 'insights');
      // patterns carry no insight-ledger signal. Not on the compact variant
      // (its narrative is line-clamped — no room for the row). The chips reflect
      // ONLY real ledger data; a missing signal renders nothing (no layout
      // shift beyond the row's own presence, which only appears once data lands).
      const trustChips =
        row.source === 'insights' && !opts?.compact ? (
          <InsightTrustChips signal={trustSignals[row.id]} />
        ) : null;

      return (
        <InsightCard
          key={row.id}
          variant={opts?.hero ? 'hero' : opts?.compact ? 'compact' : 'default'}
          priority={row.priority}
          // Bug #915: a pattern's icon/accent follows its SIGNED stroke_impact
          // (row.valence), not the priority severity tier — undefined for
          // insight rows, which fall back to the unchanged priority-driven icon.
          iconTone={row.valence}
          overline={row.overline}
          title={row.title}
          evidence={opts?.compact ? undefined : evidenceNode}
          meta={
            row.confidenceWord ? (
              <span className="whitespace-nowrap">{row.confidenceWord}</span>
            ) : undefined
          }
          interactive
          openLabel={`Open details for ${row.title}`}
          onClick={() => setOpenRowId(row.id)}
          selected={selectable ? selectedIds.has(row.id) : undefined}
          onSelectToggle={
            selectable ? (next) => toggleRowSelected(row.id, next) : undefined
          }
          selectLabel={`Select ${row.title}`}
          actions={opts?.compact ? undefined : rowActions(row)}
        >
          {row.body}
          {trustChips}
        </InsightCard>
      );
    },
    [rowActions, isPatterns, selectedIds, toggleRowSelected, trustSignals],
  );

  /* ── the InsightPanel read of the currently-open row ───────────────────── */
  const openRow = useMemo(
    () => rows.find((r) => r.id === openRowId) ?? allRows.find((r) => r.id === openRowId),
    [rows, allRows, openRowId],
  );

  // Root-cause spine (P0-05): every V3 insight stamps a structured
  // `evidence.diagnosis` (symptom → root cause → drivers → Rx + a Measured /
  // Hypothesis seal). It was rendered only on the Players-tab insight card, so
  // the main triage workflow here never showed it. Surface it in the detail
  // panel for insight rows that carry one.
  const openInsight =
    openRow && openRow.source === 'insights' ? (openRow.raw as EvidenceInsight) : null;
  const openDiagnosis = openInsight?.evidence?.diagnosis ?? null;

  const panelActions = useMemo(() => {
    if (!openRow) return [];
    // "View player" — a quiet cross-link to the player's stats surface. Shown
    // on every signal that carries a real playerId (both insights and
    // patterns always set it — see SignalRow.playerId). Not a canonical
    // acknowledge/dismiss/focus-area/ask key, so it gets its own icon/variant
    // rather than inheriting ACTION_ICON/ACTION_VARIANT defaults.
    const viewPlayerAction = openRow.playerId
      ? [
          {
            key: 'view-player',
            label: 'View player',
            icon: <User aria-hidden className="h-4 w-4" strokeWidth={2} />,
            variant: 'ghost' as const,
            onClick: () => {
              setOpenRowId(null);
              router.push(`/golf/dashboard/stats?player=${openRow.playerId}`);
            },
          },
        ]
      : [];
    if (openRow.source === 'patterns') {
      return [
        {
          key: 'focus-area',
          label: 'Address',
          onClick: () => {
            handleAddressPattern(openRow);
            setOpenRowId(null);
          },
        },
        {
          key: 'acknowledge',
          label: 'Confirm',
          onClick: () => {
            // P036: close after Confirm like every sibling action. The in-place
            // lifecycle flip is reflected in the list row; leaving the sheet
            // open on a just-changed row read inconsistently next to Address /
            // Dismiss, which both close.
            handleConfirmPattern(openRow);
            setOpenRowId(null);
          },
        },
        {
          key: 'dismiss',
          label: 'Dismiss',
          onClick: () => {
            handleDismissPattern(openRow);
            setOpenRowId(null);
          },
        },
        ...viewPlayerAction,
      ];
    }
    return [
      {
        key: 'focus-area',
        label: 'Create focus area',
        onClick: () => {
          // P036: close before navigating away, like every sibling action —
          // otherwise the sheet lingered over the route transition. The handler
          // pushes to /development on success.
          handleCreateFocusAreaFromInsight(openRow);
          setOpenRowId(null);
        },
      },
      {
        key: 'acknowledge',
        label: 'Acknowledge',
        onClick: () => {
          handleAcknowledge(openRow.id);
          setOpenRowId(null);
        },
      },
      {
        key: 'dismiss',
        label: 'Dismiss',
        onClick: () => {
          handleDismissInsight(openRow.id);
          setOpenRowId(null);
        },
      },
      ...viewPlayerAction,
    ];
  }, [
    openRow,
    router,
    handleAddressPattern,
    handleConfirmPattern,
    handleDismissPattern,
    handleCreateFocusAreaFromInsight,
    handleAcknowledge,
    handleDismissInsight,
  ]);

  /* ── bulk-action cluster (insights only; patterns lifecycle is per-row).
        While a bulk mutation/export is in flight, lock the cluster so a coach
        can't fire a second bulk op (double-submit guard + visible pending). ── */
  const bulkActions = !isPatterns ? (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={isBulkPending}
        onClick={() => runBulk(bulkAcknowledgeInsights, 'acknowledged')}
      >
        Acknowledge
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={isBulkPending}
        onClick={() => runBulk(bulkResolveInsights, 'resolved')}
      >
        Resolve
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isBulkPending}
        onClick={() => runBulk(bulkDismissInsights, 'dismissed')}
      >
        Dismiss
      </Button>
      <Button size="sm" variant="ghost" disabled={isBulkPending} onClick={handleExport}>
        Export
      </Button>
    </>
  ) : undefined;

  /* ── render ────────────────────────────────────────────────────────────── */

  const [hero, ...restRows] = rows;

  return (
    <CoachHelmShell
      active="signals"
      // eslint-disable-next-line jsx-a11y/aria-role
      role="coach"
      signalCount={signalCount}
      title={title ?? 'Signals'}
      description={
        isPatterns
          ? 'Detected performance patterns across your team — confirm, address, or convert into a plan.'
          : 'The highest-priority CoachHelm signals — triage, acknowledge, or turn into a focus area.'
      }
      actions={
        // P061: parity with the legacy header — a manual Refresh (re-pull the
        // feed with no triage side-effect) and a quiet link into the coaching-
        // intelligence settings. Generate intentionally stays on the Brief, not
        // here, so this surface is read/triage, not a generation trigger.
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            busy={isRefreshing}
            leftIcon={<RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden />}
            onClick={handleRefresh}
            aria-label="Refresh signals"
          >
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            asChild
            size="sm"
            variant="ghost"
            aria-label="Coaching intelligence settings"
          >
            {/* asChild forwards styling to the Link; leftIcon is bypassed under
                asChild, so the icon lives inside the Link child. */}
            <Link href="/golf/dashboard/settings/coaching-intelligence">
              <SlidersHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
              <span className="hidden sm:inline">AI settings</span>
            </Link>
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Signals segmented control — the 3 sibling routes this ONE shell
            serves (Alerts · Insights · Patterns) as a visible in-page
            cross-link, not just a Cmd+K-only path. */}
        <Segmented<SignalsSegmentId>
          options={SIGNALS_SEGMENT_OPTIONS}
          value={activeSegment}
          onValueChange={onSegmentChange}
          aria-label="Signals view"
        />

        {/* honest summary tiles — never fabricate a 0%; show counts only.
            2-up on phone (the 3rd tile spans the full second row), 3-up from
            `sm:` up. A fixed 3-up grid at EVERY width (the prior layout) gave
            each phone-width tile ~110px — not enough room for a label like
            "Showing patterns" or "Urgent + high", which truncated identically
            on Alerts/Insights/Patterns (all 3 share this one header). 2-up
            roughly triples the per-tile width at phone size; `labelLines={2}`
            is a defensive second line (rather than a hard ellipsis) for the
            rare case a label still doesn't fit on one line (e.g. the smallest
            phones). All three tiles are scoped to the ACTIVE sub-tab's own
            data (its own fetch/state) — the label says so explicitly ("Open
            alerts" on /alerts, "Open insights" on /insights, "Open patterns"
            on /patterns) instead of a generic "Open signals" that read as if
            it were a stable team-wide number, silently re-scoping as the
            coach switched tabs. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <MetricCard
            label={`Open ${SIGNAL_NOUN[activeSegment]}`}
            value={summary.open}
            labelLines={2}
          />
          {/* P035: no `goodDirection` here — it only colors a `delta` chip, and
              there is no delta on this tile, so it was a dead no-op prop.
              Scoped to the SAME open rows as the tile before it (see the
              `summary` useMemo above), so this can never read higher than
              "Open" — it's a severity breakdown OF the open count, not an
              independent count across every loaded row regardless of status. */}
          <MetricCard label="Urgent + high" value={summary.urgent} labelLines={2} />
          {/* "Showing" (not "Loaded" — dev-speak a coach shouldn't have to
              parse, and not "Total", which over-claims completeness when more
              are eligible than loaded: the read caps at limit:100 and the
              smart default narrows further). P058: when the eligible total
              exceeds the loaded set, disclose "of N" honestly rather than
              silently truncating; the footnote earns the tile its
              completeness claim.
              Bug #949 #3: this tile and "Open {noun}" both already read the
              SAME `allRows` for the active segment (see `summary` above), but
              the bare "Showing" label carried no scope hint — next to "Open
              alerts" it read as if it counted a DIFFERENT, wider population
              (alerts + insights + patterns combined) instead of the honest
              "13 loaded, 10 of them open" relationship. Suffixing the same
              `SIGNAL_NOUN` the Open tile already uses makes both tiles read
              as one obviously-related pair. Spans both phone columns (its own
              full row) since it also carries the "of N" footnote — the
              longest content of the three tiles gets the most room. */}
          <MetricCard
            label={`Showing ${SIGNAL_NOUN[activeSegment]}`}
            value={summary.total}
            footnote={loadedFootnote}
            labelLines={2}
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* ONE toolbar — the single coherent filter system. stickyTop=64 pins
            it BELOW the Fairway glass top bar (FairwayTopBar, 64px / 4rem),
            which the redesign shell owns; without it the sticky triage row
            would stick at top:0 and collide with that chrome. */}
        <SignalsToolbar<SignalsView>
          stickyTop={64}
          query={query}
          onQueryChange={onQueryChange}
          severityOptions={SEVERITY_OPTIONS}
          selectedSeverity={Array.from(severitySet)}
          onToggleSeverity={onToggleSeverity}
          onClearSeverity={() => {
            setSeveritySet(new Set());
            syncUrl({ severity: new Set() });
          }}
          statusOptions={isPatterns ? PATTERN_STATUS_OPTIONS : INSIGHT_STATUS_OPTIONS}
          selectedStatus={Array.from(statusSet)}
          onToggleStatus={onToggleStatus}
          onClearStatus={() => {
            setStatusSet(new Set());
            syncUrl({ status: new Set() });
          }}
          categoryOptions={categoryOptions}
          selectedCategory={Array.from(categorySet)}
          onToggleCategory={onToggleCategory}
          onClearCategory={() => {
            setCategorySet(new Set());
            syncUrl({ category: new Set() });
          }}
          viewOptions={VIEW_OPTIONS}
          view={displayView}
          onViewChange={onViewChange}
          appliedChips={appliedChips}
          onExport={!isPatterns ? handleExport : undefined}
          primaryAction={
            showScanTeam ? (
              <ScanTeamControl
                coachId={coachId}
                teamId={teamId}
                onScanned={() => loadInsights(false)}
                onError={setError}
              />
            ) : undefined
          }
          /* P048: the selection / bulk contract is INERT on patterns — pattern
             cards expose no checkbox (selection is insights-only, where the
             bulk lifecycle actions exist), so passing selectedCount/bulkActions/
             onClearSelection here would carry a dead bulk bar the surface can
             never populate. Omit the whole contract on patterns; the toolbar's
             defaults (selectedCount=0, no bulkActions) render no bulk chrome.
             NOTE: a plain block comment (no braces) — a brace-wrapped JSX-child
             comment is invalid BETWEEN JSX attributes and breaks compilation. */
          selectedCount={isPatterns ? undefined : selectedIds.size}
          bulkActions={isPatterns ? undefined : bulkActions}
          onClearSelection={isPatterns ? undefined : () => setSelectedIds(new Set())}
        />

        {/* notices — honest error / bulk confirmation (never a silent empty) */}
        {error ? (
          <InlineNotice
            tone="danger"
            title={isPatterns ? 'Couldn’t load your patterns' : 'Couldn’t load your signals'}
            dismissible
            onDismiss={() => setError(null)}
            action={
              <Button size="sm" variant="secondary" onClick={() => void reload()}>
                Try again
              </Button>
            }
          >
            {error}
          </InlineNotice>
        ) : null}
        {notice ? (
          <InlineNotice tone="success" dismissible onDismiss={() => setNotice(null)}>
            {notice}
          </InlineNotice>
        ) : null}

        {/* patterns-only: honest contextual-suppression banner (GUARDED by
            isPatterns). States how many high-signal patterns are shown and how
            many low-value contextual patterns are hidden, with a one-tap toggle
            to opt them in/out. Nothing is permanently hidden — it is one click
            away, and the count is exact. Never renders on insights/alerts. */}
        {isPatterns &&
        patternCounts &&
        (patternCounts.contextualHidden > 0 || showContextual) ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border-subtle bg-surface-raised/60 px-4 py-3"
          >
            <span className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent-600" aria-hidden />
              <span className="font-fw-sans text-body-sm text-text-secondary">
                {showContextual ? (
                  <>
                    Showing all{' '}
                    <span className="font-fw-mono tabular-nums text-text-primary">
                      {patternCounts.returned}
                    </span>{' '}
                    patterns, including low-value contextual ones
                  </>
                ) : (
                  <>
                    Showing{' '}
                    <span className="font-fw-mono tabular-nums text-text-primary">
                      {patternCounts.returned}
                    </span>{' '}
                    high-signal pattern{patternCounts.returned === 1 ? '' : 's'};{' '}
                    <span className="font-fw-mono tabular-nums text-text-secondary">
                      {patternCounts.contextualHidden}
                    </span>{' '}
                    low-value contextual hidden
                  </>
                )}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={toggleContextual}
            >
              {showContextual ? 'Hide contextual' : `Show contextual (${patternCounts.contextualHidden})`}
            </Button>
          </div>
        ) : null}

        {/* smart-default banner — the curated triage default, DISMISSIBLE so
            nothing is ever hidden silently: it states exactly what's shown
            (N of M) and offers a one-tap "show all" escape. */}
        {smartDefaultActive && fullCount > SMART_DEFAULT_CAP ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border-subtle bg-surface-raised/60 px-4 py-3"
          >
            <span className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent-600" aria-hidden />
              <span className="font-fw-sans text-body-sm text-text-secondary">
                Showing the{' '}
                <span className="font-fw-mono tabular-nums text-text-primary">{rows.length}</span>{' '}
                most pressing of{' '}
                <span className="font-fw-mono tabular-nums text-text-secondary">{fullCount}</span>
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => {
                // Dismiss the curated default → render the full filtered set.
                // No explicit filter is written, so the coach's own filters stay
                // free; re-arm happens only if they revisit the route.
                setSmartDefaultOn(false);
                setSelectedIds(new Set());
              }}
            >
              Show all {fullCount}
            </Button>
          </div>
        ) : null}

        {/* controls row — select-all (insights/alerts, drives the bulk bar) +
            the grouping density control. The Group control is hidden while the
            smart-default shortlist is active: that path renders a FLAT curated
            list (see `grouped`), so it would highlight a selection it cannot
            honor. Select-all stays available whenever there are selectable rows
            so a coach can populate the bulk-action bar in one tap. */}
        {!loading && rows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {selectableVisibleIds.length > 0 ? (
              <label className="flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={allVisibleSelected}
                  indeterminate={!allVisibleSelected && selectedIds.size > 0}
                  onCheckedChange={() => toggleSelectAllVisible()}
                  aria-label={
                    allVisibleSelected
                      ? 'Deselect all visible signals'
                      : 'Select all visible signals'
                  }
                />
                <span className="font-fw-sans text-body-sm text-text-secondary select-none">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} selected`
                    : 'Select all'}
                </span>
              </label>
            ) : null}
            {/* P047: the Group control only applies to feed/grouped — in the
                Compact view `grouped` is always false, so the segmented control
                would change state with zero visible effect (dead UI). Hide it
                there (and while the smart-default flat shortlist is active). */}
            {!smartDefaultActive && displayView !== 'table' ? (
              <div className="flex items-center gap-3">
                <span className="font-fw-display text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
                  Group
                </span>
                <Segmented<SignalGroupBy>
                  options={GROUP_BY_OPTIONS}
                  value={groupBy}
                  onValueChange={onGroupByChange}
                  size="sm"
                  aria-label="Group signals by"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Team "where are we bleeding strokes" rollup — insights only, and only
            once there's real stroke-impact to group. Honest-empty handled inside. */}
        {!isPatterns && !loading && leakInsights.length > 0 ? (
          <LeakBoard insights={leakInsights} className="mb-2" />
        ) : null}

        {/* body */}
        {loading ? (
          // Shape-matched skeleton: a hero card placeholder + 3 compact card
          // rows the size of the real InsightCards, so the layout doesn't jump
          // (CLS) when the live feed lands. NOT the flat avatar/line list.
          <div
            role="status"
            aria-busy="true"
            aria-live="polite"
            className="flex flex-col gap-4"
          >
            <span className="sr-only">Loading signals…</span>
            <Skeleton className="h-32 w-full rounded-card" />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-card" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          appliedChips.length > 0 || query.trim() ? (
            <EmptyState
              variant="search"
              title="No signals match these filters"
              description="Try widening severity, status, or category — or clear the search."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setSeveritySet(new Set());
                    setStatusSet(new Set());
                    setCategorySet(new Set());
                    setSelectedIds(new Set());
                    syncUrl({
                      q: '',
                      severity: new Set(),
                      status: new Set(),
                      category: new Set(),
                    });
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : isPatterns ? (
            <EmptyState
              title="No patterns detected yet"
              description="As your players log rounds, the engine surfaces performance patterns here."
            />
          ) : showScanTeam ? (
            // P037: /alerts CAN scan — the copy says "scan the team", so give
            // the empty state the actual Scan control (reusing ScanTeamControl)
            // so the suggested next action is one tap from the instruction.
            <EmptyState
              title="All clear — no signals right now"
              description="Your players are on track. Scan the team to check for anything new."
              action={
                <ScanTeamControl
                  coachId={coachId}
                  teamId={teamId}
                  size="md"
                  onScanned={() => loadInsights(false)}
                  onError={setError}
                />
              }
            />
          ) : (
            // P057: /insights renders with showScanTeam=false — there is NO
            // Scan control on this route, so the copy must NOT instruct one.
            // Point at an achievable next action that actually lives elsewhere
            // (the CoachHelm brief), not a phantom Scan or a self-link.
            <EmptyState
              title="All clear — no signals right now"
              description="New insights appear here as your players log rounds and the engine surfaces them."
              action={
                <Button asChild variant="secondary">
                  <Link href="/golf/dashboard/intelligence">Open the CoachHelm brief</Link>
                </Button>
              }
            />
          )
        ) : grouped && groups ? (
          // Dense triage: collapsible sections per player/category. The FIRST
          // group leads with its hero card; every group caps at N rows with a
          // "show N more" escape so a ~50-item set scans in a glance.
          <div className="flex flex-col gap-7">
            {groups.map(([label, groupRows], gi) => {
              const isExpanded = expandedGroups.has(label);
              const overflow = groupRows.length - COLLAPSED_GROUP_SIZE;
              const visible =
                isExpanded || overflow <= 0
                  ? groupRows
                  : groupRows.slice(0, COLLAPSED_GROUP_SIZE);
              const sectionId = `signals-group-${gi}`;
              return (
                <section key={label} className="flex flex-col gap-3" aria-labelledby={`${sectionId}-h`}>
                  <h2
                    id={`${sectionId}-h`}
                    className="flex items-baseline gap-2 font-fw-sans text-h3 font-semibold text-text-primary"
                  >
                    {label}
                    <span className="font-fw-mono text-body-sm tabular-nums text-text-tertiary">
                      {groupRows.length}
                    </span>
                  </h2>
                  <div id={sectionId} className="flex flex-col gap-3">
                    {visible.map((r, ri) =>
                      // the single hero card sits at the very top of the workspace
                      // (feed only); the dedicated grouped view — and the mobile
                      // triage default (`displayView`, see above) — stays dense/
                      // compact, so a phone never gets a hero-then-full-card group.
                      gi === 0 && ri === 0 && displayView === 'feed'
                        ? renderCard(r, { hero: true })
                        : renderCard(r, { compact: displayView === 'grouped' }),
                    )}
                  </div>
                  {overflow > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      aria-expanded={isExpanded}
                      aria-controls={sectionId}
                      leftIcon={
                        isExpanded ? (
                          <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden />
                        ) : (
                          <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
                        )
                      }
                      onClick={() => toggleGroupExpanded(label)}
                    >
                      {isExpanded ? 'Show less' : `Show ${overflow} more`}
                    </Button>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : displayView === 'table' ? (
          <div className="flex flex-col gap-2">
            {rows.map((r) => renderCard(r, { compact: true }))}
          </div>
        ) : (
          // flat feed (groupBy = none): the top row reads as the ONE hero glass
          // card, the rest matte.
          <div className="flex flex-col gap-4">
            {hero ? renderCard(hero, { hero: true }) : null}
            {restRows.map((r) => renderCard(r))}
          </div>
        )}
      </div>

      {/* expand-in-place panel — the InsightPanel READ of one signal (Sheet on
          narrow, docked on wide). Same vocabulary as the card. */}
      {openRow ? (
        <InsightPanel
          mode="sheet"
          open={openRowId != null}
          onOpenChange={(o) => {
            if (!o) setOpenRowId(null);
          }}
          priority={openRow.priority}
          // Bug #915 — same direction-by-sign override as the card (see
          // renderCard above) so the opened panel matches what was scanned.
          iconTone={openRow.valence}
          overline={openRow.overline}
          title={openRow.title}
          meta={openRow.confidenceWord ?? undefined}
          evidence={
            openRow.evidence.length > 0 ? (
              <EvidenceList items={openRow.evidence} columns={2} />
            ) : undefined
          }
          evidenceLabel={openRow.evidence.length > 0 ? 'Why this surfaced' : undefined}
          detail={
            <p className="font-fw-sans text-body-sm text-text-tertiary">
              {openRow.playerName ? `Player: ${openRow.playerName}` : null}
            </p>
          }
          actions={panelActions}
        >
          {openDiagnosis ? (
            <DiagnosisPanel
              diagnosis={openDiagnosis}
              category={openInsight?.category ?? undefined}
              confidence={
                typeof openInsight?.evidence?.confidence === 'number'
                  ? openInsight.evidence.confidence
                  : undefined
              }
              strokesImpact={
                typeof openInsight?.evidence?.strokes_impact === 'number'
                  ? openInsight.evidence.strokes_impact
                  : undefined
              }
              className="mb-5"
            />
          ) : null}
          {openRow.body}
        </InsightPanel>
      ) : null}

      {/* honest empty-evidence note when patterns carry no statistics (low-N) */}
      {isPatterns && rows.length > 0 && rows.every((r) => r.evidence.length === 0) ? (
        <div className="mt-6">
          <InsufficientData
            compact
            title="Statistical detail not available yet"
            description="These patterns were detected but their supporting statistics haven't been computed."
          />
        </div>
      ) : null}

      {/* a quiet cross-link back into the full workspace — /alerts ONLY. On
          /insights this link pointed at itself (a dead self-link, since both
          routes share isPatterns === false); gating on the segment (not
          isPatterns) fixes that without touching /patterns' behavior. */}
      {activeSegment === 'alerts' ? (
        <p className="mt-6 font-fw-sans text-body-sm text-text-tertiary">
          Looking for the full archive?{' '}
          <Link
            href={surfaceHref('insights')}
            className="rounded-fw-sm font-medium text-accent-700 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Open the insight workspace
          </Link>
        </p>
      ) : null}
    </CoachHelmShell>
  );
}
