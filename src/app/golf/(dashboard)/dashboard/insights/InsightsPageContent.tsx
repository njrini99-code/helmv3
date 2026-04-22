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
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassStatCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import {
  IconSparkles,
  IconRefresh,
  IconSettings,
  IconTrendingUp,
  IconCheck,
} from '@/components/icons';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
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
  };
  filterOptions: FilterOptions | null;
}

type SortBy = 'priority' | 'created_at' | 'player_name';
type SortOrder = 'asc' | 'desc';

// ============================================================================
// HELPERS
// ============================================================================

function parseSearchParams(params: InsightsPageContentProps['initialSearchParams']): {
  query: string;
  filters: InsightFilters;
  page: number;
  sortBy: SortBy;
  sortOrder: SortOrder;
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
  };
}

function buildSearchParams(
  query: string,
  filters: InsightFilters,
  page: number,
  sortBy: SortBy,
  sortOrder: SortOrder
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
  const router = useRouter();
  const initialState = parseSearchParams(initialSearchParams);

  const [query, setQuery] = useState(initialState.query);
  const [filters, setFilters] = useState<InsightFilters>(initialState.filters);
  const [page, setPage] = useState(initialState.page);
  const [sortBy, setSortBy] = useState<SortBy>(initialState.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialState.sortOrder);
  const [pageSize] = useState(20);

  const [allInsights, setAllInsights] = useState<EvidenceInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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
    ) => {
      const params = buildSearchParams(newQuery, newFilters, newPage, newSortBy, newSortOrder);
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

  // Client-side filter + sort + paginate.
  const { pageInsights, totalCount, totalPages } = useMemo(() => {
    const filtered = applyClientFilters(allInsights, query, filters);
    const sorted = applySort(filtered, sortBy, sortOrder);
    const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const safePage = Math.min(page, pages);
    const startIdx = (safePage - 1) * pageSize;
    const pageRows = sorted.slice(startIdx, startIdx + pageSize);
    return {
      pageInsights: pageRows,
      totalCount: sorted.length,
      totalPages: pages,
    };
  }, [allInsights, query, filters, sortBy, sortOrder, page, pageSize]);

  const handleSearchChange = (newQuery: string) => {
    setQuery(newQuery);
    setPage(1);
    setSelectedIds(new Set());
    updateUrl(newQuery, filters, 1, sortBy, sortOrder);
  };

  const handleFiltersChange = (newFilters: InsightFilters) => {
    setFilters(newFilters);
    setPage(1);
    setSelectedIds(new Set());
    updateUrl(query, newFilters, 1, sortBy, sortOrder);
  };

  const handleSortChange = (newSortBy: SortBy, newSortOrder: SortOrder) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1);
    updateUrl(query, filters, 1, newSortBy, newSortOrder);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSelectedIds(new Set());
    updateUrl(query, filters, newPage, sortBy, sortOrder);
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

        <button
          onClick={handleRefresh}
          disabled={isRefreshing || isGenerating}
          className={cn(
            'p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 active:bg-warm-100 transition-all flex items-center justify-center',
            isRefreshing && 'animate-spin'
          )}
          title="Refresh insights"
          aria-label="Refresh insights"
        >
          <IconRefresh size={18} />
        </button>

        <a
          href="/golf/dashboard/settings/coaching-intelligence"
          className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 active:bg-warm-100 transition-all flex items-center justify-center"
          title="AI Settings"
        >
          <IconSettings size={18} />
        </a>
      </LargeTitleHeader>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {/* Stats Cards */}
        {stats && (
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
          >
            <GlassStatCard
              label="Total Insights"
              value={stats.total}
              icon={<IconSparkles size={20} />}
            />
            <GlassStatCard
              label="Active"
              value={stats.active}
              icon={<IconTrendingUp size={20} />}
              trend={
                stats.active > 0
                  ? { value: stats.byPriority.urgent + stats.byPriority.high, direction: 'up' }
                  : undefined
              }
            />
            <GlassStatCard
              label="Acknowledged"
              value={stats.acknowledged}
              icon={<IconCheck size={20} />}
            />
            <GlassStatCard
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
          transition={{ delay: 0.1 }}
          className="sticky top-[var(--golf-mobile-header-offset)] z-10 bg-white/60 backdrop-blur-xl -mx-4 md:-mx-6 px-4 md:px-6 py-4 mb-6 lg:top-[89px]"
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
          </div>
        </m.div>

        {/* Insight List */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
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
