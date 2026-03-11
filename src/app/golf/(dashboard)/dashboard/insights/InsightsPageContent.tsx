'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { MobileMenuButton } from '@/components/golf/MobileMenuButton';
import { InsightSearchBar } from '@/components/golf/coachhelm/insights/InsightSearchBar';
import { InsightFiltersPanel, type InsightFilters } from '@/components/golf/coachhelm/insights/InsightFiltersPanel';
import { InsightListView } from '@/components/golf/coachhelm/insights/InsightListView';
import { InsightBulkActions } from '@/components/golf/coachhelm/insights/InsightBulkActions';
import { InsightExportModal } from '@/components/golf/coachhelm/insights/InsightExportModal';
import {
  searchInsights,
  bulkDismissInsights,
  bulkAcknowledgeInsights,
  bulkResolveInsights,
  getInsightsStats,
  type FilterOptions,
  type InsightsStats,
} from '@/app/golf/actions/insight-management';
import { generateTeamInsights } from '@/app/golf/actions/insights';
import type { InsightWithPlayer, InsightType, InsightPriority, InsightStatus } from '@/lib/coachhelm/insight-types';

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
// HELPER FUNCTIONS
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function InsightsPageContent({
  coachId,
  initialSearchParams,
  filterOptions,
}: InsightsPageContentProps) {
  const router = useRouter();

  // Parse initial state from URL
  const initialState = parseSearchParams(initialSearchParams);

  // State
  const [query, setQuery] = useState(initialState.query);
  const [filters, setFilters] = useState<InsightFilters>(initialState.filters);
  const [page, setPage] = useState(initialState.page);
  const [sortBy, setSortBy] = useState<SortBy>(initialState.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialState.sortOrder);
  const [pageSize] = useState(20);

  const [insights, setInsights] = useState<InsightWithPlayer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showExportModal, setShowExportModal] = useState(false);

  const [stats, setStats] = useState<InsightsStats | null>(null);

  // Update URL when search state changes
  const updateUrl = useCallback((
    newQuery: string,
    newFilters: InsightFilters,
    newPage: number,
    newSortBy: SortBy,
    newSortOrder: SortOrder
  ) => {
    const params = buildSearchParams(newQuery, newFilters, newPage, newSortBy, newSortOrder);
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [router]);

  // Fetch insights
  const fetchInsights = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);

    const result = await searchInsights({
      coachId,
      query: query || undefined,
      filters,
      page,
      pageSize,
      sortBy,
      sortOrder,
    });

    if (result.success) {
      setInsights(result.insights);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [coachId, query, filters, page, pageSize, sortBy, sortOrder]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    const result = await getInsightsStats(coachId);
    if (result.success && result.stats) {
      setStats(result.stats);
    }
  }, [coachId]);

  // Initial fetch
  useEffect(() => {
    fetchInsights();
    fetchStats();
  }, [fetchInsights, fetchStats]);

  // Handle search change
  const handleSearchChange = (newQuery: string) => {
    setQuery(newQuery);
    setPage(1);
    setSelectedIds(new Set());
    updateUrl(newQuery, filters, 1, sortBy, sortOrder);
  };

  // Handle filter change
  const handleFiltersChange = (newFilters: InsightFilters) => {
    setFilters(newFilters);
    setPage(1);
    setSelectedIds(new Set());
    updateUrl(query, newFilters, 1, sortBy, sortOrder);
  };

  // Handle sort change
  const handleSortChange = (newSortBy: SortBy, newSortOrder: SortOrder) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1);
    updateUrl(query, filters, 1, newSortBy, newSortOrder);
  };

  // Handle page change
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSelectedIds(new Set());
    updateUrl(query, filters, newPage, sortBy, sortOrder);
  };

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchInsights(false);
    await fetchStats();
  };

  // Handle generate new insights
  const handleGenerateInsights = async () => {
    setIsGenerating(true);
    await generateTeamInsights();
    await fetchInsights(false);
    await fetchStats();
    setIsGenerating(false);
  };

  // Bulk actions
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

  // Selection helpers
  const handleSelectAll = () => {
    setSelectedIds(new Set(insights.map((i) => i.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const isAllSelected = insights.length > 0 && selectedIds.size === insights.length;

  return (
    <div className="relative">
      {/* Header */}
      <div className="golf-mobile-page-header">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <MobileMenuButton />
              <m.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20"
              >
                <IconSparkles size={24} className="text-white" />
              </m.div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-warm-900">
                  AI Insights
                </h1>
                <p className="text-warm-500 text-sm">
                  Manage and act on coaching insights
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Generate Button */}
              <Button
                variant="secondary"
                onClick={handleGenerateInsights}
                isLoading={isGenerating}
                disabled={isGenerating || isRefreshing}
              >
                <IconSparkles size={16} className="mr-1.5" />
                {isGenerating ? 'Generating...' : 'Generate'}
              </Button>

              {/* Refresh Button */}
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

              {/* Settings Link */}
              <a
                href="/golf/dashboard/settings/coaching-intelligence"
                className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 active:bg-warm-100 transition-all flex items-center justify-center"
                title="AI Settings"
              >
                <IconSettings size={18} />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
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
          className="sticky top-[var(--golf-mobile-header-offset)] z-10 bg-white/60 backdrop-blur-xl -mx-6 px-6 py-4 mb-6 lg:top-[89px]"
        >
          <div className="space-y-4">
            {/* Search Bar */}
            <InsightSearchBar
              value={query}
              onChange={handleSearchChange}
              placeholder="Search insights by title or description..."
              className="max-w-md"
            />

            {/* Filters */}
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
            insights={insights}
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
            onRefresh={handleRefresh}
            isLoading={isLoading}
            coachId={coachId}
          />
        </m.div>
      </div>

      {/* Bulk Actions Bar */}
      <InsightBulkActions
        selectedCount={selectedIds.size}
        totalCount={insights.length}
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
