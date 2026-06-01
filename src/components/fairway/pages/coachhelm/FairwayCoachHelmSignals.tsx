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
import { Check, X, Target, ChevronDown, ChevronRight } from 'lucide-react';

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
import { InsightPanel } from '@/components/fairway/cards-insight/InsightPanel';
import { MetricCard } from '@/components/fairway/cards-insight/MetricCard';
import { Button } from '@/components/fairway/controls/button';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { InsufficientData } from '@/components/fairway/feedback/InsufficientData';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { SkeletonList } from '@/components/fairway/feedback/Skeleton';
import type { ToolbarFilterOption } from '@/components/fairway/controls/Toolbar';
import {
  Segmented,
  type SegmentedOption,
} from '@/components/fairway/controls/segmented';

// ── PRESERVED server actions (imported, never rewritten) ─────────────────────
import {
  getInsightsForCoach,
  type EvidenceInsight,
} from '@/app/golf/actions/insight-delivery';
import {
  acknowledgeInsight,
  dismissInsight,
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
  type ExtendedPattern,
} from '@/app/golf/actions/pattern-management';

/* ───────────────────────────────────────────────────────────────────────────
 * Props — the discriminated surface contract.
 * ─────────────────────────────────────────────────────────────────────────── */

export type SignalsView = 'feed' | 'table' | 'grouped';
export type SignalGroupBy = 'none' | 'player' | 'category';

/** The default-filter preset a route passes in (the only per-route variance). */
export interface SignalsDefaultFilter {
  /** Pre-selected severity (priority) values, e.g. ['urgent','high']. */
  severity?: string[];
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

/** Map the insight `status` enum onto a severity-tone label. */
const VIEW_OPTIONS: SegmentedOption<SignalsView>[] = [
  { value: 'feed', label: 'Feed' },
  { value: 'table', label: 'Table' },
  { value: 'grouped', label: 'Grouped' },
];

/** The triage grouping axis — scan by athlete, by category, or one flat list. */
const GROUP_BY_OPTIONS: SegmentedOption<SignalGroupBy>[] = [
  { value: 'player', label: 'By player' },
  { value: 'category', label: 'By category' },
  { value: 'none', label: 'Flat' },
];

/** The smart-default shortlist cap — /insights opens to the N most pressing
 *  signals (priority desc, then recency): never empty, never a firehose. */
const SMART_DEFAULT_CAP = 8;

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
  signalCount,
  showScanTeam = false,
  title,
  initialSearchParams,
}: FairwayCoachHelmSignalsProps) {
  const router = useRouter();
  const isPatterns = signalSource === 'patterns';

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
  const [, startActionTransition] = useTransition();

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

  /* -- expand-in-place panel (the InsightPanel read of one signal) -- */
  const [openRowId, setOpenRowId] = useState<string | null>(null);

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
        const rows = await getInsightsForCoach(coachId, {
          limit: 100,
          priorities: defaultFilter?.severity as
            | Array<'low' | 'medium' | 'high' | 'urgent'>
            | undefined,
        });
        setInsights(rows);
      } catch {
        setError('Could not load signals. Try refreshing.');
      } finally {
        setLoading(false);
      }
    },
    [coachId, defaultFilter?.severity],
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
    return insightsToSignalRows(insights);
  }, [isPatterns, patterns, insights]);

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

  /* ── per-row triage handlers (PORTED optimistic-removal-with-rollback) ─── */

  const removeInsightOptimistic = useCallback(
    (
      insightId: string,
      action: (id: string) => Promise<{ success: boolean }>,
    ) => {
      const prev = insights;
      startActionTransition(async () => {
        try {
          setInsights((r) => r.filter((x) => x.id !== insightId));
          const res = await action(insightId);
          if (!res.success) setInsights(prev);
        } catch {
          setInsights(prev);
        }
      });
    },
    [insights],
  );

  const handleAcknowledge = useCallback(
    (insightId: string) => removeInsightOptimistic(insightId, acknowledgeInsight),
    [removeInsightOptimistic],
  );

  const handleDismissInsight = useCallback(
    (insightId: string) => removeInsightOptimistic(insightId, dismissInsight),
    [removeInsightOptimistic],
  );

  const handleCreateFocusAreaFromInsight = useCallback(
    (row: SignalRow) => {
      const insight = row.raw as EvidenceInsight;
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
          if (res.success) router.push('/golf/dashboard/development');
        } catch {
          setError('Could not create the focus area. Try again.');
        }
      });
    },
    [coachId, router],
  );

  /* ── pattern lifecycle handlers (PORTED optimistic-removal-with-rollback) */

  const removePatternOptimistic = useCallback(
    (patternId: string, action: () => Promise<{ success: boolean }>) => {
      const prev = patterns;
      startActionTransition(async () => {
        try {
          setPatterns((r) => r.filter((x) => x.id !== patternId));
          const res = await action();
          if (!res.success) setPatterns(prev);
        } catch {
          setPatterns(prev);
        }
      });
    },
    [patterns],
  );

  const handleConfirmPattern = useCallback(
    (row: SignalRow) => {
      const p = row.raw as ExtendedPattern;
      // Validate (confirm) — does NOT remove the row; flip its lifecycle in place.
      const prev = patterns;
      startActionTransition(async () => {
        try {
          setPatterns((r) =>
            r.map((x) => (x.id === p.id ? { ...x, lifecycleState: 'confirmed' } : x)),
          );
          const res = await validatePattern(p.id, {
            isAccurate: true,
            severity: p.severity,
          });
          if (!res.success) setPatterns(prev);
        } catch {
          setPatterns(prev);
        }
      });
    },
    [patterns],
  );

  const handleAddressPattern = useCallback(
    (row: SignalRow) => removePatternOptimistic(row.id, () => markPatternAddressed(row.id)),
    [removePatternOptimistic],
  );

  const handleResolvePattern = useCallback(
    (row: SignalRow) => removePatternOptimistic(row.id, () => resolvePattern(row.id)),
    [removePatternOptimistic],
  );

  const handleDismissPattern = useCallback(
    (row: SignalRow) => removePatternOptimistic(row.id, () => dismissPattern(row.id)),
    [removePatternOptimistic],
  );

  /* ── bulk actions (wires the previously dead-coded actions) ────────────── */

  const reload = useCallback(
    () => (isPatterns ? loadPatterns(false) : loadInsights(false)),
    [isPatterns, loadPatterns, loadInsights],
  );

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
    for (const s of severitySet)
      chips.push({
        key: `sev-${s}`,
        label: s.charAt(0).toUpperCase() + s.slice(1),
        onRemove: () => onToggleSeverity(s),
      });
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

  /* ── header summary tiles (honest counts, never fabricated) ────────────── */
  const summary = useMemo(() => {
    const open = allRows.filter(
      (r) => r.status === 'active' || r.status === 'Detected' || r.status === 'Confirmed',
    ).length;
    const urgent = allRows.filter(
      (r) => r.priority === 'critical' || r.priority === 'high',
    ).length;
    return { total: allRows.length, open, urgent };
  }, [allRows]);

  /* ── grouping — drives BOTH the dense default feed and the grouped view ── */
  // While the smart-default shortlist is active, render it FLAT — a curated
  // cross-player triage list fragments badly grouped one-row-per-player.
  const grouped =
    !smartDefaultActive && (view === 'grouped' || (view === 'feed' && groupBy !== 'none'));
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
      if (row.source === 'patterns') {
        const lifecycle = (row.raw as ExtendedPattern).lifecycleState;
        return (
          <>
            {lifecycle === 'detected' ? (
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
                onClick={() => handleConfirmPattern(row)}
              >
                Confirm
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Target className="h-4 w-4" strokeWidth={2} aria-hidden />}
              onClick={() => handleAddressPattern(row)}
            >
              Address
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleResolvePattern(row)}>
              Resolve
            </Button>
            <Button
              size="sm"
              variant="ghost"
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
            leftIcon={<Target className="h-4 w-4" strokeWidth={2} aria-hidden />}
            onClick={() => handleCreateFocusAreaFromInsight(row)}
          >
            <span className="hidden sm:inline">Focus area</span>
            <span className="sm:hidden">Focus</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
            onClick={() => handleAcknowledge(row.id)}
          >
            Acknowledge
          </Button>
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<X className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
            onClick={() => handleDismissInsight(row.id)}
          >
            Dismiss
          </Button>
        </>
      );
    },
    [
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
        row.evidence.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {row.evidence.map((e) => (
              <div key={e.label} className="flex flex-col">
                <dt className="font-fw-sans text-eyebrow uppercase text-text-tertiary">
                  {e.label}
                </dt>
                <dd className="font-fw-mono text-body-sm tabular-nums text-text-primary">
                  {e.value}
                  {e.gloss ? (
                    <span className="ml-1 font-fw-sans text-caption text-text-tertiary">
                      {e.gloss}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        ) : undefined;

      return (
        <InsightCard
          key={row.id}
          variant={opts?.hero ? 'hero' : opts?.compact ? 'compact' : 'default'}
          priority={row.priority}
          overline={row.overline}
          title={row.title}
          evidence={opts?.compact ? undefined : evidenceNode}
          meta={
            row.confidenceWord ? (
              <span className="whitespace-nowrap">{row.confidenceWord}</span>
            ) : undefined
          }
          interactive
          onClick={() => setOpenRowId(row.id)}
          actions={opts?.compact ? undefined : rowActions(row)}
        >
          {row.body}
        </InsightCard>
      );
    },
    [rowActions],
  );

  /* ── the InsightPanel read of the currently-open row ───────────────────── */
  const openRow = useMemo(
    () => rows.find((r) => r.id === openRowId) ?? allRows.find((r) => r.id === openRowId),
    [rows, allRows, openRowId],
  );

  const panelActions = useMemo(() => {
    if (!openRow) return [];
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
            handleConfirmPattern(openRow);
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
      ];
    }
    return [
      {
        key: 'focus-area',
        label: 'Create focus area',
        onClick: () => handleCreateFocusAreaFromInsight(openRow),
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
    ];
  }, [
    openRow,
    handleAddressPattern,
    handleConfirmPattern,
    handleDismissPattern,
    handleCreateFocusAreaFromInsight,
    handleAcknowledge,
    handleDismissInsight,
  ]);

  /* ── bulk-action cluster (insights only; patterns lifecycle is per-row) ── */
  const bulkActions = !isPatterns ? (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => runBulk(bulkAcknowledgeInsights, 'acknowledged')}
      >
        Acknowledge
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => runBulk(bulkResolveInsights, 'resolved')}
      >
        Resolve
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => runBulk(bulkDismissInsights, 'dismissed')}
      >
        Dismiss
      </Button>
      <Button size="sm" variant="ghost" onClick={handleExport}>
        Export
      </Button>
    </>
  ) : undefined;

  /* ── render ────────────────────────────────────────────────────────────── */

  const [hero, ...restRows] = rows;

  return (
    <CoachHelmShell
      active="signals"
      role="coach"
      signalCount={signalCount}
      title={title ?? 'Signals'}
      description={
        isPatterns
          ? 'Detected performance patterns across your team — confirm, address, or convert into a plan.'
          : 'The highest-priority CoachHelm signals — triage, acknowledge, or turn into a focus area.'
      }
    >
      <div className="flex flex-col gap-6">
        {/* honest summary tiles — never fabricate a 0%; show counts only */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard label="Open signals" value={summary.open} />
          <MetricCard label="Urgent + high" value={summary.urgent} goodDirection="down" />
          {/* "Loaded" (not "Total"): this counts the rows currently in view —
              the read caps at limit:100 and the smart default narrows further —
              so labeling it "Total" over-claims completeness when more are
              eligible than loaded. */}
          <MetricCard label="Loaded" value={summary.total} />
        </div>

        {/* ONE toolbar — the single coherent filter system */}
        <SignalsToolbar<SignalsView>
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
          view={view}
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
          selectedCount={selectedIds.size}
          bulkActions={bulkActions}
          onClearSelection={() => setSelectedIds(new Set())}
        />

        {/* notices — honest error / bulk confirmation (never a silent empty) */}
        {error ? (
          <InlineNotice
            tone="danger"
            title="Something went wrong"
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

        {/* grouping density control — hidden while the smart-default shortlist
            is active: that path renders a FLAT curated list (see `grouped`),
            so the Group control would highlight a selection it cannot honor
            (a no-op). The duplicate open-urgent Readout was removed — the
            "Urgent + high" summary tile above is the single source of truth
            for that count. */}
        {!loading && rows.length > 0 && !smartDefaultActive ? (
          <div className="flex flex-wrap items-center gap-4">
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
          </div>
        ) : null}

        {/* body */}
        {loading ? (
          <SkeletonList rows={4} />
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
          ) : (
            <EmptyState
              title="All clear — no signals right now"
              description="Your players are on track. Scan the team to check for anything new."
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
                      // (feed only); the dedicated grouped view stays dense/compact.
                      gi === 0 && ri === 0 && view === 'feed'
                        ? renderCard(r, { hero: true })
                        : renderCard(r, { compact: view === 'grouped' }),
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
        ) : view === 'table' ? (
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
          overline={openRow.overline}
          title={openRow.title}
          meta={openRow.confidenceWord ?? undefined}
          evidence={
            openRow.evidence.length > 0 ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
                {openRow.evidence.map((e) => (
                  <div key={e.label} className="flex flex-col">
                    <dt className="font-fw-sans text-eyebrow uppercase text-text-tertiary">
                      {e.label}
                    </dt>
                    <dd className="font-fw-mono text-body-sm tabular-nums text-text-primary">
                      {e.value}
                      {e.gloss ? (
                        <span className="ml-1 font-fw-sans text-caption text-text-tertiary">
                          {e.gloss}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
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

      {/* a quiet cross-link back into the workspace / deep view */}
      {!isPatterns ? (
        <p className="mt-6 font-fw-sans text-body-sm text-text-tertiary">
          Looking for the full archive?{' '}
          <Link
            href="/golf/dashboard/insights"
            className="rounded-fw-sm font-medium text-accent-700 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Open the insight workspace
          </Link>
        </p>
      ) : null}
    </CoachHelmShell>
  );
}
