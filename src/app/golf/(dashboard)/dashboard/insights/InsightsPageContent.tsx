'use client';

/**
 * InsightsPageContent — rewired under Wave 1A of the Insight Delivery phase.
 *
 * Data flow (new):
 *   getInsightsForCoach(coachId, { priorities?, categories?, player_id? })
 *     → client-side filter by query/dateRange/status
 *     → client-side paginate
 *     → render through `InsightListView` (which uses the unified primitive).
 *
 * Evidence-backed rows only (Rule 8 of the contract). The previous
 * `searchInsights` action pulled legacy rows that had no `evidence` JSONB —
 * those are filtered out by `getInsightsForCoach` at the source.
 */
import { useState, useEffect, useCallback, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/ui/card';
import { Button, IconButton } from '@/components/ui/button';
import {
  IconSparkles,
  IconRefresh,
  IconSettings,
  IconTrendingUp,
  IconCheck,
  IconX,
  IconWarning,
} from '@/components/icons';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { InsightSearchBar } from '@/components/golf/coachhelm/insights/InsightSearchBar';
import { InsightFiltersPanel, type InsightFilters } from '@/components/golf/coachhelm/insights/InsightFiltersPanel';
import { InsightListView } from '@/components/golf/coachhelm/insights/InsightListView';
import { InsightBulkActions } from '@/components/golf/coachhelm/insights/InsightBulkActions';
import { InsightExportModal } from '@/components/golf/coachhelm/insights/InsightExportModal';
import type { InsightAction } from '@/components/golf/coachhelm/insight-card';
import {
  getInsightsForCoach,
  type EvidenceInsight,
} from '@/app/golf/actions/insight-delivery';
import {
  bulkDismissInsights,
  bulkAcknowledgeInsights,
  bulkResolveInsights,
  getInsightsStats,
  type FilterOptions,
  type InsightsStats,
} from '@/app/golf/actions/insight-management';
import {
  generateTeamInsights,
  acknowledgeInsight,
  dismissInsight,
} from '@/app/golf/actions/insights';
import { createFocusAreaFromInsight } from '@/app/golf/actions/development';
import type {
  InsightType,
  InsightPriority,
  InsightStatus,
} from '@/lib/coachhelm/insight-types';

// ============================================================================
// TYPES
// ============================================================================

interface InsightsPageContentProps {
  coachId: string;
  initialSearchParams: {
    q?: string;
    player?: string;
    type?: string;
    priority?: string;
    status?: string;
    dateRange?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
    sort?: string;
    order?: string;
    lifecycle?: string;
    categoryChips?: string;
  };
  filterOptions: FilterOptions | null;
}

type SortBy = 'priority' | 'created_at' | 'player_name';
type SortOrder = 'asc' | 'desc';

// ----------------------------------------------------------------------------
// TRIAGE CHIP FILTERS — agent-12
// ----------------------------------------------------------------------------
// Two new client-side multi-select filters layered on top of the existing
// `InsightFiltersPanel`. They surface the canonical taxonomy used by V2
// evidence insights (lifecycle_state + category) which the legacy filter
// panel doesn't expose.

type LifecycleState = EvidenceInsight['lifecycle_state'];
type Category = NonNullable<EvidenceInsight['category']>;

const LIFECYCLE_OPTIONS: { value: LifecycleState; label: string }[] = [
  { value: 'tentative', label: 'Tentative' },
  { value: 'detected', label: 'Detected' },
  { value: 'matured', label: 'Matured' },
  { value: 'addressed', label: 'Addressed' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'archived', label: 'Archived' },
];

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'putting', label: 'Putting' },
  { value: 'tee', label: 'Tee' },
  { value: 'approach', label: 'Approach' },
  { value: 'short_game', label: 'Short Game' },
  { value: 'scoring', label: 'Scoring' },
  { value: 'pressure', label: 'Pressure' },
  { value: 'course_management', label: 'Course Mgmt' },
];

const LIFECYCLE_VALUES = new Set<string>(LIFECYCLE_OPTIONS.map((o) => o.value));
const CATEGORY_VALUES = new Set<string>(CATEGORY_OPTIONS.map((o) => o.value));

function parseSetParam<T extends string>(raw: string | undefined, allowed: Set<string>): Set<T> {
  if (!raw) return new Set();
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && allowed.has(p));
  return new Set(parts as T[]);
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// ============================================================================
// HELPERS
// ============================================================================

function parseSearchParams(params: InsightsPageContentProps['initialSearchParams']): {
  query: string;
  filters: InsightFilters;
  page: number;
  sortBy: SortBy;
  sortOrder: SortOrder;
  lifecycleSet: Set<LifecycleState>;
  categorySet: Set<Category>;
} {
  return {
    query: params.q || '',
    filters: {
      playerId: params.player || undefined,
      insightType: (params.type as InsightType) || undefined,
      priority: (params.priority as InsightPriority) || undefined,
      status: (params.status as InsightStatus) || undefined,
      dateRange: (params.dateRange as InsightFilters['dateRange']) || undefined,
      startDate: params.startDate || undefined,
      endDate: params.endDate || undefined,
    },
    page: params.page ? parseInt(params.page, 10) : 1,
    sortBy: (params.sort as SortBy) || 'created_at',
    sortOrder: (params.order as SortOrder) || 'desc',
    lifecycleSet: parseSetParam<LifecycleState>(params.lifecycle, LIFECYCLE_VALUES),
    categorySet: parseSetParam<Category>(params.categoryChips, CATEGORY_VALUES),
  };
}

function buildSearchParams(
  query: string,
  filters: InsightFilters,
  page: number,
  sortBy: SortBy,
  sortOrder: SortOrder,
  lifecycleSet: Set<LifecycleState>,
  categorySet: Set<Category>,
): URLSearchParams {
  const params = new URLSearchParams();

  if (query) params.set('q', query);
  if (filters.playerId) params.set('player', filters.playerId);
  if (filters.insightType) params.set('type', filters.insightType);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.status) params.set('status', filters.status);
  if (filters.dateRange) params.set('dateRange', filters.dateRange);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (page > 1) params.set('page', page.toString());
  if (sortBy !== 'created_at') params.set('sort', sortBy);
  if (sortOrder !== 'desc') params.set('order', sortOrder);
  if (lifecycleSet.size > 0) params.set('lifecycle', Array.from(lifecycleSet).join(','));
  if (categorySet.size > 0) params.set('categoryChips', Array.from(categorySet).join(','));

  return params;
}

/** Priority-ranked sort for evidence insights. Higher priority and newer
 *  rows float up; lower priority sinks. */
const PRIORITY_WEIGHT: Record<EvidenceInsight['priority'], number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function applyClientFilters(
  rows: EvidenceInsight[],
  query: string,
  filters: InsightFilters,
): EvidenceInsight[] {
  return rows.filter((row) => {
    // Text search on title/content.
    if (query && query.trim()) {
      const needle = query.trim().toLowerCase();
      const haystack = `${row.title} ${row.content}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    // Status filter (live column: status).
    if (filters.status && row.status !== filters.status) return false;

    // Date range filter — anchor on created_at.
    if (filters.dateRange) {
      const now = Date.now();
      let minTs: number | null = null;
      let maxTs: number | null = null;
      if (filters.dateRange === 'last_7_days') {
        minTs = now - 7 * 24 * 60 * 60 * 1000;
      } else if (filters.dateRange === 'last_30_days') {
        minTs = now - 30 * 24 * 60 * 60 * 1000;
      } else if (filters.dateRange === 'last_90_days') {
        minTs = now - 90 * 24 * 60 * 60 * 1000;
      } else if (filters.dateRange === 'custom') {
        if (filters.startDate) minTs = new Date(filters.startDate).getTime();
        if (filters.endDate) {
          const end = new Date(filters.endDate);
          end.setHours(23, 59, 59, 999);
          maxTs = end.getTime();
        }
      }

      const createdTs = new Date(row.created_at).getTime();
      if (minTs != null && createdTs < minTs) return false;
      if (maxTs != null && createdTs > maxTs) return false;
    }

    return true;
  });
}

function applySort(
  rows: EvidenceInsight[],
  sortBy: SortBy,
  sortOrder: SortOrder,
): EvidenceInsight[] {
  const dir = sortOrder === 'asc' ? 1 : -1;
  const sorted = [...rows];
  if (sortBy === 'priority') {
    sorted.sort((a, b) => {
      const pa = PRIORITY_WEIGHT[a.priority] ?? 0;
      const pb = PRIORITY_WEIGHT[b.priority] ?? 0;
      if (pa !== pb) return (pa - pb) * dir;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  } else if (sortBy === 'player_name') {
    sorted.sort((a, b) => (a.player_id || '').localeCompare(b.player_id || '') * dir);
  } else {
    sorted.sort(
      (a, b) =>
        (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir,
    );
  }
  return sorted;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function InsightsPageContent({
  coachId,
  initialSearchParams,
  filterOptions,
}: InsightsPageContentProps) {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const initialState = parseSearchParams(initialSearchParams);

  const [query, setQuery] = useState(initialState.query);
  const [filters, setFilters] = useState<InsightFilters>(initialState.filters);
  const [page, setPage] = useState(initialState.page);
  const [sortBy, setSortBy] = useState<SortBy>(initialState.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialState.sortOrder);
  const [pageSize] = useState(20);

  // Triage chip filters — multi-select. URL persisted via `lifecycle` and
  // `categoryChips` query params.
  const [lifecycleSet, setLifecycleSet] = useState<Set<LifecycleState>>(initialState.lifecycleSet);
  const [categorySet, setCategorySet] = useState<Set<Category>>(initialState.categorySet);

  const [allInsights, setAllInsights] = useState<EvidenceInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  // F055: distinguish a failed/timed-out read from a genuinely empty feed. The
  // read action returns [] on internal DB errors, but a rejected promise
  // (network / server-action transport / timeout) surfaces here — when it does
  // we render an error banner instead of the "all clear" empty state.
  const [loadError, setLoadError] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showExportModal, setShowExportModal] = useState(false);

  const [stats, setStats] = useState<InsightsStats | null>(null);
  const [, startActionTransition] = useTransition();

  // Update URL on state change.
  const updateUrl = useCallback(
    (
      newQuery: string,
      newFilters: InsightFilters,
      newPage: number,
      newSortBy: SortBy,
      newSortOrder: SortOrder,
      newLifecycleSet: Set<LifecycleState>,
      newCategorySet: Set<Category>,
    ) => {
      const params = buildSearchParams(
        newQuery,
        newFilters,
        newPage,
        newSortBy,
        newSortOrder,
        newLifecycleSet,
        newCategorySet,
      );
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.replace(newUrl, { scroll: false });
    },
    [router],
  );

  // Server-side: fetch evidence-backed rows. Server handles category + player
  // + priority narrowing; text + dateRange + status live client-side.
  const fetchInsights = useCallback(
    async (showLoading = true) => {
      if (showLoading) setIsLoading(true);
      try {
        const rows = await getInsightsForCoach(coachId, {
          limit: 100,
          player_id: filters.playerId,
          priorities: filters.priority ? [filters.priority] : undefined,
          categories: filters.insightType ? [filters.insightType] : undefined,
        });
        setAllInsights(rows);
        setLoadError(false);
      } catch {
        // F055: a rejected read (network / server-action transport / timeout)
        // must NOT collapse into the empty "all clear" state. Flag the error so
        // the banner renders and the stale list (if any) is cleared.
        setLoadError(true);
        setAllInsights([]);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [coachId, filters.playerId, filters.priority, filters.insightType],
  );

  const fetchStats = useCallback(async () => {
    const result = await getInsightsStats(coachId);
    if (result.success && result.stats) {
      setStats(result.stats);
    }
  }, [coachId]);

  useEffect(() => {
    void fetchInsights();
    void fetchStats();
  }, [fetchInsights, fetchStats]);

  // Client-side filter + sort + paginate. Triage chip filters AND together
  // with the existing filter pipeline.
  const { pageInsights, totalCount, totalPages } = useMemo(() => {
    const filtered = applyClientFilters(allInsights, query, filters);
    const chipFiltered = filtered.filter((row) => {
      if (lifecycleSet.size > 0 && !lifecycleSet.has(row.lifecycle_state)) return false;
      if (categorySet.size > 0) {
        if (!row.category) return false;
        if (!categorySet.has(row.category)) return false;
      }
      return true;
    });
    const sorted = applySort(chipFiltered, sortBy, sortOrder);
    const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const safePage = Math.min(page, pages);
    const startIdx = (safePage - 1) * pageSize;
    const pageRows = sorted.slice(startIdx, startIdx + pageSize);
    return {
      pageInsights: pageRows,
      totalCount: sorted.length,
      totalPages: pages,
    };
  }, [allInsights, query, filters, sortBy, sortOrder, page, pageSize, lifecycleSet, categorySet]);

  const handleSearchChange = (newQuery: string) => {
    setQuery(newQuery);
    setPage(1);
    setSelectedIds(new Set());
    updateUrl(newQuery, filters, 1, sortBy, sortOrder, lifecycleSet, categorySet);
  };

  const handleFiltersChange = (newFilters: InsightFilters) => {
    setFilters(newFilters);
    setPage(1);
    setSelectedIds(new Set());
    updateUrl(query, newFilters, 1, sortBy, sortOrder, lifecycleSet, categorySet);
  };

  const handleSortChange = (newSortBy: SortBy, newSortOrder: SortOrder) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1);
    updateUrl(query, filters, 1, newSortBy, newSortOrder, lifecycleSet, categorySet);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSelectedIds(new Set());
    updateUrl(query, filters, newPage, sortBy, sortOrder, lifecycleSet, categorySet);
  };

  // Toggle a lifecycle chip. Resets pagination so triage doesn't land on an
  // empty intermediate page.
  const handleToggleLifecycle = (value: LifecycleState) => {
    const next = new Set(lifecycleSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    if (setsEqual(next, lifecycleSet)) return;
    setLifecycleSet(next);
    setPage(1);
    setSelectedIds(new Set());
    updateUrl(query, filters, 1, sortBy, sortOrder, next, categorySet);
  };

  const handleToggleCategory = (value: Category) => {
    const next = new Set(categorySet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    if (setsEqual(next, categorySet)) return;
    setCategorySet(next);
    setPage(1);
    setSelectedIds(new Set());
    updateUrl(query, filters, 1, sortBy, sortOrder, lifecycleSet, next);
  };

  // Player dropdown change — drives `filters.playerId` (already plumbed end to
  // end through the existing filter panel).
  const handlePlayerSelect = (playerId: string | undefined) => {
    if ((filters.playerId ?? undefined) === (playerId ?? undefined)) return;
    const newFilters: InsightFilters = { ...filters };
    if (playerId) newFilters.playerId = playerId;
    else delete newFilters.playerId;
    setFilters(newFilters);
    setPage(1);
    setSelectedIds(new Set());
    updateUrl(query, newFilters, 1, sortBy, sortOrder, lifecycleSet, categorySet);
  };

  const triageActiveCount =
    lifecycleSet.size +
    categorySet.size +
    (filters.playerId ? 1 : 0);

  const handleClearTriage = () => {
    const newFilters: InsightFilters = { ...filters };
    delete newFilters.playerId;
    const emptyLifecycle: Set<LifecycleState> = new Set();
    const emptyCategory: Set<Category> = new Set();
    setFilters(newFilters);
    setLifecycleSet(emptyLifecycle);
    setCategorySet(emptyCategory);
    setPage(1);
    setSelectedIds(new Set());
    updateUrl(query, newFilters, 1, sortBy, sortOrder, emptyLifecycle, emptyCategory);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchInsights(false);
    await fetchStats();
  };

  const handleGenerateInsights = async () => {
    setIsGenerating(true);
    await generateTeamInsights();
    await fetchInsights(false);
    await fetchStats();
    setIsGenerating(false);
  };

  const handleBulkDismiss = async () => {
    await bulkDismissInsights(Array.from(selectedIds));
    setSelectedIds(new Set());
    await fetchInsights(false);
    await fetchStats();
  };

  const handleBulkAcknowledge = async () => {
    await bulkAcknowledgeInsights(Array.from(selectedIds));
    setSelectedIds(new Set());
    await fetchInsights(false);
    await fetchStats();
  };

  const handleBulkResolve = async () => {
    await bulkResolveInsights(Array.from(selectedIds));
    setSelectedIds(new Set());
    await fetchInsights(false);
    await fetchStats();
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(pageInsights.map((i) => i.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const isAllSelected = pageInsights.length > 0 && selectedIds.size === pageInsights.length;

  // Per-row actions from the unified primitive.
  const handleCoachAction = useCallback(
    (action: InsightAction, insightId: string) => {
      const prev = allInsights;
      startActionTransition(async () => {
        try {
          if (action === 'acknowledged') {
            setAllInsights((rows) => rows.filter((r) => r.id !== insightId));
            const res = await acknowledgeInsight(insightId);
            if (!res.success) setAllInsights(prev);
            else await fetchStats();
          } else if (action === 'dismissed') {
            setAllInsights((rows) => rows.filter((r) => r.id !== insightId));
            const res = await dismissInsight(insightId);
            if (!res.success) setAllInsights(prev);
            else await fetchStats();
          } else if (action === 'create_focus_area') {
            const target = allInsights.find((i) => i.id === insightId);
            if (!target) return;
            const res = await createFocusAreaFromInsight({
              insight_id: target.id,
              player_id: target.player_id,
              coach_id: coachId,
              title: target.title,
              description: target.content ?? '',
              insight_type: (target.category as string | undefined) ?? 'general',
            });
            if (res.success) {
              router.push('/golf/dashboard/development');
            }
          }
        } catch {
          setAllInsights(prev);
        }
      });
    },
    [allInsights, coachId, fetchStats, router],
  );

  return (
    <div className="relative">
      {/* Header */}
      <LargeTitleHeader
        title="AI Insights"
        subtitle="Manage and act on coaching insights"
      >
        <Button
          variant="secondary"
          onClick={handleGenerateInsights}
          isLoading={isGenerating}
          disabled={isGenerating || isRefreshing}
        >
          <IconSparkles size={16} className="mr-1.5" />
          <span className="hidden sm:inline">{isGenerating ? 'Generating...' : 'Generate'}</span>
          <span className="sm:hidden">{isGenerating ? '...' : 'New'}</span>
        </Button>

        <IconButton variant="default"
          onClick={handleRefresh}
          disabled={isRefreshing || isGenerating}
          className={cn(
            'p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-warm-500 hover:text-warm-700 hover:bg-cream-100/60 active:bg-warm-100 transition-all flex items-center justify-center',
            isRefreshing && 'animate-spin'
          )}
          title="Refresh insights"
          aria-label="Refresh insights"
        >
          <IconRefresh size={18} />
        </IconButton>

        <a
          href="/golf/dashboard/settings/coaching-intelligence"
          className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-warm-500 hover:text-warm-700 hover:bg-cream-100/60 active:bg-warm-100 transition-all flex items-center justify-center"
          title="AI Settings"
        >
          <IconSettings size={18} />
        </a>
      </LargeTitleHeader>

      {/* Main Content */}
      <div className="max-w-[1536px] mx-auto px-4 md:px-6 py-8">
        {/* Editorial hero plinth — magazine-cover framing for the
            coach insights feed beneath the sticky LargeTitleHeader. */}
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
            <PageHeader
              eyebrow="Coach Insights"
              eyebrowAccent="primary"
              title="What's happening on your team."
              subtitle={
                stats && stats.total > 0
                  ? `${stats.total} insight${stats.total === 1 ? '' : 's'} surfaced${
                      stats.active > 0 ? ` · ${stats.active} active` : ''
                    }${
                      stats.byPriority?.urgent
                        ? ` · ${stats.byPriority.urgent} urgent`
                        : ''
                    }.`
                  : 'AI-generated coaching insights will appear here as your players log rounds and patterns mature.'
              }
            />
          </div>
        </Reveal>

        {/* Stats Cards */}
        {stats && (
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
          >
            <StatCard
              label="Total Insights"
              value={stats.total}
              icon={<IconSparkles size={20} />}
            />
            {/* F111: no `trend` prop. The previous code passed the
                urgent+high COUNT as `{ direction: 'up' }`, which StatCard
                renders as a "+N%" up-arrow — a fabricated trend (there is no
                prior period to compare against). A raw count is not a
                direction, so we surface the count alone. */}
            <StatCard
              label="Active"
              value={stats.active}
              icon={<IconTrendingUp size={20} />}
            />
            <StatCard
              label="Acknowledged"
              value={stats.acknowledged}
              icon={<IconCheck size={20} />}
            />
            <StatCard
              label="Resolved"
              value={stats.resolved}
              icon={<IconCheck size={20} />}
            />
          </m.div>
        )}

        {/* Search & Filters */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.1 })}
          className="sticky top-[var(--golf-mobile-header-offset)] z-10 bg-cream-100/68 backdrop-blur-xl -mx-4 md:-mx-6 px-4 md:px-6 py-4 mb-6 lg:top-[89px]"
        >
          <div className="space-y-4">
            <InsightSearchBar
              value={query}
              onChange={handleSearchChange}
              placeholder="Search insights by title or content..."
              className="max-w-md"
            />

            <InsightFiltersPanel
              filters={filters}
              onFiltersChange={handleFiltersChange}
              players={filterOptions?.players || []}
              defaultExpanded={false}
            />

            {/* Triage chip strip — player + lifecycle + category */}
            <TriageFilterStrip
              players={filterOptions?.players || []}
              selectedPlayerId={filters.playerId}
              onSelectPlayer={handlePlayerSelect}
              lifecycleSet={lifecycleSet}
              onToggleLifecycle={handleToggleLifecycle}
              categorySet={categorySet}
              onToggleCategory={handleToggleCategory}
              activeCount={triageActiveCount}
              onClearAll={handleClearTriage}
            />
          </div>
        </m.div>

        {/* Insight List */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.2 })}
        >
          {!isLoading && loadError ? (
            <InsightsErrorState onRetry={handleRefresh} isRetrying={isRefreshing} />
          ) : !isLoading && triageActiveCount > 0 && totalCount === 0 ? (
            <TriageEmptyState onClearAll={handleClearTriage} />
          ) : (
            <InsightListView
              insights={pageInsights}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              onAction={handleCoachAction}
              isLoading={isLoading}
            />
          )}
        </m.div>
      </div>

      {/* Bulk Actions Bar */}
      <InsightBulkActions
        selectedCount={selectedIds.size}
        totalCount={pageInsights.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onBulkDismiss={handleBulkDismiss}
        onBulkAcknowledge={handleBulkAcknowledge}
        onBulkResolve={handleBulkResolve}
        onExport={() => setShowExportModal(true)}
        isAllSelected={isAllSelected}
      />

      {/* Export Modal */}
      <InsightExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        selectedIds={Array.from(selectedIds)}
        onExportComplete={() => setSelectedIds(new Set())}
      />
    </div>
  );
}

// ============================================================================
// TRIAGE FILTER STRIP — agent-12
// ============================================================================
// Horizontally-scrollable chip strip on mobile, wrapping flex on desktop.
// Player select is rendered as a `<select>` (compact for any roster size).
// Lifecycle + Category render as multi-select chips. An "X applied · Clear"
// pill is shown when any of the three filters is active.

interface TriageFilterStripProps {
  players: Array<{ id: string; name: string }>;
  selectedPlayerId: string | undefined;
  onSelectPlayer: (playerId: string | undefined) => void;
  lifecycleSet: Set<LifecycleState>;
  onToggleLifecycle: (value: LifecycleState) => void;
  categorySet: Set<Category>;
  onToggleCategory: (value: Category) => void;
  activeCount: number;
  onClearAll: () => void;
}

function TriageFilterStrip({
  players,
  selectedPlayerId,
  onSelectPlayer,
  lifecycleSet,
  onToggleLifecycle,
  categorySet,
  onToggleCategory,
  activeCount,
  onClearAll,
}: TriageFilterStripProps) {
  return (
    <div className="space-y-3">
      {/* Player select + clear pill */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-xs font-medium text-warm-600">Player</span>
          <select
            value={selectedPlayerId || ''}
            onChange={(e) => onSelectPlayer(e.target.value || undefined)}
            className={cn(
              'min-h-[36px] px-3 py-1.5 text-sm',
              'bg-cream-100/82 backdrop-blur-sm border border-warm-200 rounded-lg',
              'text-warm-900',
              'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30',
              'transition-colors duration-200',
            )}
          >
            <option value="">All players</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
        </label>

        {activeCount > 0 && (
          <Button variant="primary"
            type="button"
            onClick={onClearAll}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
              'text-xs font-medium',
              'bg-primary-50 text-primary-700 border border-primary-200',
              'hover:bg-primary-100 active:bg-primary-200 transition-colors',
            )}
            aria-label="Clear all triage filters"
          >
            <span>
              {activeCount} filter{activeCount === 1 ? '' : 's'} applied
            </span>
            <span aria-hidden="true" className="text-primary-400">·</span>
            <span className="inline-flex items-center gap-0.5">
              <IconX size={12} />
              Clear
            </span>
          </Button>
        )}
      </div>

      {/* Lifecycle chips */}
      <ChipGroup
        label="Lifecycle"
        options={LIFECYCLE_OPTIONS}
        selected={lifecycleSet}
        onToggle={onToggleLifecycle}
      />

      {/* Category chips */}
      <ChipGroup
        label="Category"
        options={CATEGORY_OPTIONS}
        selected={categorySet}
        onToggle={onToggleCategory}
      />
    </div>
  );
}

// ============================================================================
// CHIP GROUP — agent-12
// ============================================================================

interface ChipGroupProps<T extends string> {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  selected: Set<T>;
  onToggle: (value: T) => void;
}

function ChipGroup<T extends string>({ label, options, selected, onToggle }: ChipGroupProps<T>) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:inline shrink-0 text-xs font-medium text-warm-600 mr-1">
        {label}
      </span>
      <div
        className={cn(
          'flex items-center gap-2',
          // Horizontally scrollable strip on mobile; wrap on desktop.
          'overflow-x-auto sm:flex-wrap sm:overflow-visible',
          '-mx-1 px-1 pb-1 sm:pb-0',
        )}
        role="group"
        aria-label={`${label} filter chips`}
      >
        <span className="sm:hidden shrink-0 text-xs font-medium text-warm-600 pr-1">
          {label}
        </span>
        {options.map((option) => {
          const isSelected = selected.has(option.value);
          return (
            <Button variant="primary"
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              aria-pressed={isSelected}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full',
                'text-xs font-medium border transition-colors',
                'min-h-[32px]',
                isSelected
                  ? 'bg-primary-600 text-white border-primary-600 hover:bg-primary-700 active:bg-primary-800'
                  : 'bg-cream-100/75 text-warm-700 border-warm-200 hover:bg-white hover:border-warm-300 active:bg-warm-50',
              )}
            >
              {isSelected && <IconCheck size={12} />}
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// TRIAGE EMPTY STATE — agent-12
// ============================================================================

interface TriageEmptyStateProps {
  onClearAll: () => void;
}

function TriageEmptyState({ onClearAll }: TriageEmptyStateProps) {
  return (
    <div
      className={cn(
        'surface-matte rounded-2xl',
        'p-10 text-center',
      )}
    >
      <div className="mx-auto w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-4">
        <IconSparkles size={24} className="text-primary-700" />
      </div>
      <p className="text-sm font-medium text-warm-900 mb-1">
        No insights match your filters
      </p>
      <p className="text-sm text-warm-500 mb-4">
        Try adjusting the chip filters above to widen your triage view.
      </p>
      <Button variant="primary"
        type="button"
        onClick={onClearAll}
        className={cn(
          'inline-flex items-center gap-1.5 px-4 py-2 rounded-full',
          'text-sm font-medium',
          'bg-primary-600 text-white border border-primary-600',
          'hover:bg-primary-700 active:bg-primary-800 transition-colors',
        )}
      >
        Clear all filters
      </Button>
    </div>
  );
}

// ============================================================================
// INSIGHTS ERROR STATE — F055
// ============================================================================
// Shown when the insights read fails (rejected/timed-out promise) so a load
// failure is never mistaken for a genuinely empty "all clear" feed.

interface InsightsErrorStateProps {
  onRetry: () => void;
  isRetrying: boolean;
}

function InsightsErrorState({ onRetry, isRetrying }: InsightsErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'surface-matte rounded-2xl',
        'p-10 text-center',
      )}
    >
      <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-4">
        <IconWarning size={24} className="text-amber-700" />
      </div>
      <p className="text-sm font-medium text-warm-900 mb-1">
        Couldn&apos;t load insights
      </p>
      <p className="text-sm text-warm-500 mb-4">
        Something went wrong fetching your insights. This is a load error, not an
        empty feed — try again in a moment.
      </p>
      <Button variant="primary"
        type="button"
        onClick={onRetry}
        isLoading={isRetrying}
        disabled={isRetrying}
        className={cn(
          'inline-flex items-center gap-1.5 px-4 py-2 rounded-full',
          'text-sm font-medium',
          'bg-primary-600 text-white border border-primary-600',
          'hover:bg-primary-700 active:bg-primary-800 transition-colors',
        )}
      >
        <IconRefresh size={14} />
        Retry
      </Button>
    </div>
  );
}
