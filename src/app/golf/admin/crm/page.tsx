'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Upload,
  Download,
  Users,
  TrendingUp,
  Clock,
  Flame,
  Building2,
  Target,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type CoachStatus,
  type Coach,
  PIPELINE_STAGES,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
} from './crm-config';
import { CRMDashboard } from './components/CRMDashboard';
import { CoachTable } from './components/CoachTable';
import { PipelineView } from './components/PipelineView';
import { ConferenceGroupView } from './components/ConferenceGroupView';
import { CoachFilters, type Filters } from './components/CoachFilters';
import { AddCoachModal } from './components/AddCoachModal';
import { CoachDetailPanel } from './components/CoachDetailPanel';
import { ImportModal } from './components/ImportModal';
import { BulkActionsBar } from './components/BulkActionsBar';
import { FAB } from './components/FAB';
import { QuickActionsPanel } from './components/QuickActionsPanel';
import { ScheduleEventModal } from './components/ScheduleEventModal';
import { EventDetailModal } from './components/EventDetailModal';
import type { CRMEvent } from './components/CalendarView';

// ============================================================================
// SIDEBAR TABS
// ============================================================================
const TABS = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, shortcut: '1', description: 'Pipeline overview & quick actions' },
  { id: 'list', label: 'Coaches', Icon: ClipboardList, shortcut: '2', description: 'All coaches in table view' },
  { id: 'pipeline', label: 'Pipeline', Icon: BarChart3, shortcut: '3', description: 'Kanban sales pipeline' },
  { id: 'conferences', label: 'Conferences', Icon: Building2, shortcut: '4', description: 'Grouped by conference' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CRMPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [allCoaches, setAllCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const urlTab = searchParams.get('tab') as TabId | null;
  const activeTab: TabId = TABS.some((t) => t.id === urlTab) ? urlTab! : 'dashboard';

  const [filters, setFilters] = useState<Filters>({
    status: 'all',
    division: 'all',
    conference: 'all',
    program: 'all',
    priority: 'all',
    search: '',
    followUpDue: false,
    starred: false,
    hasNotes: false,
    noContact30Days: false,
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [conferences, setConferences] = useState<string[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Modals & Panels
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [quickActionsCoach, setQuickActionsCoach] = useState<Coach | null>(null);
  const [scheduleModalCoach, setScheduleModalCoach] = useState<Coach | null>(null);
  const [scheduleModalDate, setScheduleModalDate] = useState<Date | undefined>(undefined);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CRMEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CRMEvent | null>(null);

  const supabase = createClient();

  // ============================================================================
  // TAB NAVIGATION
  // ============================================================================
  function setActiveTab(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/golf/admin/crm?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const tabIndex = parseInt(e.key) - 1;
      if (tabIndex >= 0 && tabIndex < TABS.length) {
        setActiveTab(TABS[tabIndex]!.id);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  const fetchAllCoaches = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('crm_coaches')
        .select('*')
        .order('is_starred', { ascending: false })
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false });
      const coachData = (data || []) as Coach[];
      setAllCoaches(coachData);
      const uniqueConferences = [...new Set(coachData.map(c => c.conference))].sort();
      setConferences(uniqueConferences);
    } catch (err) {
      console.error('Failed to fetch all coaches:', err);
    }
  }, [supabase]);

  const fetchCoaches = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('crm_coaches')
        .select('*')
        .order('is_starred', { ascending: false })
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false });

      if (filters.status !== 'all') query = query.eq('status', filters.status);
      if (filters.division !== 'all') query = query.eq('division', filters.division);
      if (filters.conference !== 'all') query = query.eq('conference', filters.conference);
      if (filters.program !== 'all') query = query.eq('program', filters.program);
      if (filters.priority !== 'all') query = query.eq('priority', parseInt(filters.priority));
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,school.ilike.%${filters.search}%,email.ilike.%${filters.search}%,conference.ilike.%${filters.search}%`);
      }
      if (filters.followUpDue) query = query.lte('next_follow_up_at', new Date().toISOString());
      if (filters.starred) query = query.eq('is_starred', true);
      if (filters.hasNotes) query = query.not('notes', 'is', null);
      if (filters.noContact30Days) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query = query.or(`last_contacted_at.is.null,last_contacted_at.lt.${thirtyDaysAgo.toISOString()}`);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setCoaches((data || []) as Coach[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch coaches');
    } finally {
      setLoading(false);
    }
  }, [filters, supabase]);

  useEffect(() => { fetchCoaches(); }, [fetchCoaches]);
  useEffect(() => { fetchAllCoaches(); }, [fetchAllCoaches]);

  // ============================================================================
  // ACTIONS
  // ============================================================================
  const updateCoach = async (coachId: string, updates: Partial<Coach>) => {
    const finalUpdates = updates.status
      ? { ...updates, updated_at: new Date().toISOString() }
      : updates;

    try {
      const { error: updateError } = await supabase.from('crm_coaches').update(finalUpdates).eq('id', coachId);
      if (updateError) throw updateError;
      setCoaches(prev => prev.map(c => c.id === coachId ? { ...c, ...finalUpdates } : c));
      setAllCoaches(prev => prev.map(c => c.id === coachId ? { ...c, ...finalUpdates } : c));
      if (selectedCoach?.id === coachId) setSelectedCoach(prev => prev ? { ...prev, ...finalUpdates } : null);
    } catch (err) {
      console.error('Failed to update coach:', err);
      fetchCoaches();
      fetchAllCoaches();
    }
  };

  const bulkUpdateCoaches = async (ids: string[], updates: Partial<Coach>) => {
    const finalUpdates = updates.status
      ? { ...updates, updated_at: new Date().toISOString() }
      : updates;

    try {
      const { error: updateError } = await supabase.from('crm_coaches').update(finalUpdates).in('id', ids);
      if (updateError) throw updateError;
      const idSet = new Set(ids);
      setCoaches(prev => prev.map(c => idSet.has(c.id) ? { ...c, ...finalUpdates } : c));
      setAllCoaches(prev => prev.map(c => idSet.has(c.id) ? { ...c, ...finalUpdates } : c));
    } catch (err) {
      console.error('Failed to bulk update:', err);
      fetchCoaches();
      fetchAllCoaches();
    }
  };

  const toggleStar = async (coachId: string, currentStarred: boolean) => {
    await updateCoach(coachId, { is_starred: !currentStarred });
  };

  const handleCoachClick = (coach: Coach) => {
    setSelectedCoach(coach);
    setDetailPanelOpen(true);
  };

  const handleBulkAction = async (action: string, value?: unknown) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      if (action === 'status') await bulkUpdateCoaches(ids, { status: value as CoachStatus });
      else if (action === 'priority') await bulkUpdateCoaches(ids, { priority: value as number });
      else if (action === 'star') await bulkUpdateCoaches(ids, { is_starred: true });
      else if (action === 'unstar') await bulkUpdateCoaches(ids, { is_starred: false });
      else if (action === 'delete') {
        await supabase.from('crm_coaches').delete().in('id', ids);
        fetchCoaches();
        fetchAllCoaches();
      }
      setSelectedIds(new Set());
    } catch (err) { console.error('Bulk action failed:', err); }
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'School', 'Conference', 'Division', 'Program', 'Status', 'Priority', 'Starred', 'Last Contact', 'Notes'];
    const rows = coaches.map(c => [
      c.name, c.email || '', c.school, c.conference, c.division, c.program,
      STATUS_CONFIG[c.status]?.label || c.status,
      PRIORITY_CONFIG[c.priority]?.label || 'Normal',
      c.is_starred ? 'Yes' : 'No',
      c.last_contacted_at || '',
      (c.notes || '').replace(/"/g, '""'),
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `golfhelm-crm-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const refreshData = () => { fetchCoaches(); fetchAllCoaches(); };

  // ============================================================================
  // COMPUTED
  // ============================================================================
  const stats = useMemo(() => {
    const total = allCoaches.length;
    const byStatus = Object.keys(STATUS_CONFIG).reduce((acc, status) => {
      acc[status as CoachStatus] = allCoaches.filter(c => c.status === status).length;
      return acc;
    }, {} as Record<CoachStatus, number>);

    const byStage = PIPELINE_STAGES.reduce((acc, stage) => {
      acc[stage.id] = allCoaches.filter(c => stage.statuses.includes(c.status)).length;
      return acc;
    }, {} as Record<string, number>);

    const starred = allCoaches.filter(c => c.is_starred).length;
    const hot = allCoaches.filter(c => c.priority >= 2).length;
    const followUpsDue = allCoaches.filter(c => c.next_follow_up_at && new Date(c.next_follow_up_at) <= new Date()).length;
    const contacted = allCoaches.filter(c => c.last_contacted_at).length;
    const inPipeline = allCoaches.filter(c => !['new_lead', 'closed_won', 'closed_lost', 'not_interested', 'bad_timing'].includes(c.status)).length;

    return { total, byStatus, byStage, starred, hot, followUpsDue, contacted, inPipeline };
  }, [allCoaches]);

  // ============================================================================
  // ERROR STATE
  // ============================================================================
  if (error) {
    return (
      <div className="min-h-screen bg-[#FFFEF8] flex items-center justify-center p-8">
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/20 shadow-glass p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={28} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-warm-900 mb-2">Error Loading CRM</h2>
          <p className="text-warm-600 mb-6">{error}</p>
          <button
            onClick={() => { setError(null); fetchCoaches(); }}
            className="px-6 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-medium transition-colors shadow-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="min-h-screen bg-[#FFFEF8] flex">
      {/* ═══════════════════ Mobile Header ═══════════════════ */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#1C1917] border-b border-white/10">
        <div className="flex items-center gap-2 px-3 h-12">
          <a href="/golf/admin" className="flex-shrink-0 p-1.5 rounded-lg text-warm-400 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </a>
          <div className="flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const TabIcon = tab.Icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0',
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-warm-400 hover:text-white'
                  )}
                >
                  <TabIcon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-shrink-0 p-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* ═══════════════════ Desktop Sidebar ═══════════════════ */}
      <aside className={cn(
        'fixed left-0 top-0 bottom-0 z-50 flex flex-col',
        'bg-[#1C1917] border-r border-white/5',
        'transition-all duration-300 ease-in-out',
        sidebarCollapsed ? 'w-[72px]' : 'w-[260px]',
        'hidden lg:flex'
      )}>
        {/* Logo */}
        <div className={cn('flex items-center gap-3 px-4 h-16', sidebarCollapsed && 'justify-center px-0')}>
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
            <Target size={18} className="text-white" />
          </div>
          {!sidebarCollapsed && <span className="font-bold text-lg text-white tracking-tight">Coach CRM</span>}
        </div>

        {/* Back to Dashboard */}
        <div className="px-3 mb-2">
          <a href="/golf/admin" className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-[10px]',
            'text-warm-400 hover:bg-white/5 hover:text-white transition-colors',
            sidebarCollapsed && 'justify-center'
          )}>
            <ArrowLeft size={16} className="flex-shrink-0" />
            {!sidebarCollapsed && <span className="text-sm font-medium">Dashboard</span>}
          </a>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <div className="space-y-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const TabIcon = tab.Icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'group relative flex items-center gap-3 w-full rounded-[10px] transition-colors duration-200',
                    sidebarCollapsed ? 'justify-center p-3' : 'px-3 py-2.5',
                    isActive ? 'bg-white/10 text-white' : 'text-warm-400 hover:bg-white/5 hover:text-white'
                  )}
                >
                  {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-500 rounded-r-full" />}
                  <TabIcon size={20} className={cn('flex-shrink-0', isActive ? 'text-primary-400' : 'text-warm-400 group-hover:text-white')} />
                  {!sidebarCollapsed && <span className="text-sm font-medium flex-1 text-left">{tab.label}</span>}
                  {!sidebarCollapsed && (
                    <span className={cn('text-micro px-1.5 py-0.5 rounded font-mono', isActive ? 'bg-white/10 text-warm-300' : 'bg-white/5 text-warm-500')}>
                      {tab.shortcut}
                    </span>
                  )}
                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-3 px-3 py-1.5 bg-warm-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                      {tab.label}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Action Buttons */}
        <div className="p-3 border-t border-white/10 space-y-2">
          <button
            onClick={() => setShowAddModal(true)}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] font-medium transition-colors',
              'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700'
            )}
          >
            <Plus size={16} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>Add Coach</span>}
          </button>
          {!sidebarCollapsed && (
            <div className="flex gap-2">
              <button onClick={() => setShowImportModal(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-sm font-medium bg-white/5 hover:bg-white/10 text-warm-400 transition-colors">
                <Upload size={14} /> Import
              </button>
              <button onClick={exportToCSV} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-sm font-medium bg-white/5 hover:bg-white/10 text-warm-400 transition-colors">
                <Download size={14} /> Export
              </button>
            </div>
          )}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[#1C1917] border border-white/20 flex items-center justify-center text-warm-400 hover:text-white transition-colors shadow-lg"
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* ═══════════════════ Main Content ═══════════════════ */}
      <main className={cn(
        'flex-1 flex flex-col min-h-screen transition-all duration-300',
        'pt-12 lg:pt-0',
        sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]'
      )}>
        {/* Top Bar */}
        <header className="sticky top-12 lg:top-0 z-30 bg-[#FFFEF8]/95 backdrop-blur-sm border-b border-warm-200/50 px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-warm-900">{TABS.find(t => t.id === activeTab)?.label}</h2>
              <p className="text-sm text-warm-500 mt-0.5 hidden sm:block">{TABS.find(t => t.id === activeTab)?.description}</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 border border-white/30 shadow-glass-sm">
                <Users size={14} className="text-warm-500" />
                <span className="text-sm font-bold text-warm-800 tabular-nums">{stats.total}</span>
                <span className="text-xs text-warm-500 hidden sm:inline">coaches</span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 border border-white/30 shadow-glass-sm">
                <TrendingUp size={14} className="text-primary-500" />
                <span className="text-sm font-bold text-warm-800 tabular-nums">{stats.inPipeline}</span>
                <span className="text-xs text-warm-500">in pipeline</span>
              </div>
              {stats.followUpsDue > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200/50">
                  <Clock size={14} className="text-amber-600" />
                  <span className="text-sm font-bold text-amber-700 tabular-nums">{stats.followUpsDue}</span>
                  <span className="text-xs text-amber-600 hidden sm:inline">due</span>
                </div>
              )}
              {stats.hot > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200/50">
                  <Flame size={14} className="text-orange-600" />
                  <span className="text-sm font-bold text-orange-700 tabular-nums">{stats.hot}</span>
                  <span className="text-xs text-orange-600">hot</span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {/* ── Dashboard Tab ── */}
          {activeTab === 'dashboard' && (
            <CRMDashboard
              allCoaches={allCoaches}
              stats={stats}
              pipelineStages={PIPELINE_STAGES}
              statusConfig={STATUS_CONFIG}
              onBulkUpdate={bulkUpdateCoaches}
              onRefresh={refreshData}
              onNavigate={setActiveTab}
              {...({ onCoachClick: handleCoachClick } as Record<string, unknown>)}
            />
          )}

          {/* ── Coaches List Tab ── */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              <CoachFilters
                filters={filters}
                setFilters={setFilters}
                conferences={conferences}
                statusConfig={STATUS_CONFIG}
              />
              <div className="rounded-2xl overflow-hidden glass-standard">
                <CoachTable
                  coaches={coaches}
                  loading={loading}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  onStatusChange={(id, status) => updateCoach(id, { status })}
                  onToggleStar={toggleStar}
                  onCoachClick={handleCoachClick}
                  onLogContact={(coach) => setQuickActionsCoach(coach)}
                  statusConfig={STATUS_CONFIG}
                  priorityConfig={PRIORITY_CONFIG}
                />
              </div>
            </div>
          )}

          {/* ── Pipeline Tab ── */}
          {activeTab === 'pipeline' && (
            <PipelineView
              coaches={allCoaches}
              onCoachClick={handleCoachClick}
              onStatusChange={(id, status) => updateCoach(id, { status })}
              onToggleStar={toggleStar}
              statusConfig={STATUS_CONFIG}
              priorityConfig={PRIORITY_CONFIG}
              pipelineStages={PIPELINE_STAGES}
              stats={stats}
              onBulkUpdate={bulkUpdateCoaches}
              onRefresh={refreshData}
            />
          )}

          {/* ── Conferences Tab ── */}
          {activeTab === 'conferences' && (
            <div className="space-y-4">
              <CoachFilters
                filters={filters}
                setFilters={setFilters}
                conferences={conferences}
                statusConfig={STATUS_CONFIG}
              />
              <ConferenceGroupView
                coaches={coaches}
                loading={loading}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onCoachClick={handleCoachClick}
                onStatusChange={(id, status) => updateCoach(id, { status })}
                onToggleStar={toggleStar}
                onLogContact={(coach) => setQuickActionsCoach(coach)}
                statusConfig={STATUS_CONFIG}
                priorityConfig={PRIORITY_CONFIG}
              />
            </div>
          )}
        </div>
      </main>

      {/* ═══════════════════ Overlays ═══════════════════ */}

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          onAction={handleBulkAction}
          onClear={() => setSelectedIds(new Set())}
          statusConfig={STATUS_CONFIG}
        />
      )}

      {/* Detail Panel */}
      {detailPanelOpen && selectedCoach && (
        <CoachDetailPanel
          coach={selectedCoach}
          onClose={() => { setDetailPanelOpen(false); setSelectedCoach(null); }}
          onUpdate={(updates) => updateCoach(selectedCoach.id, updates)}
          statusConfig={STATUS_CONFIG}
          priorityConfig={PRIORITY_CONFIG}
        />
      )}

      {/* Quick Actions Panel */}
      {quickActionsCoach && (
        <QuickActionsPanel
          coach={quickActionsCoach}
          onClose={() => setQuickActionsCoach(null)}
          onUpdate={(updates) => updateCoach(quickActionsCoach.id, updates)}
          onRefreshEvents={refreshData}
          statusConfig={STATUS_CONFIG}
        />
      )}

      {/* FAB */}
      <FAB
        onSchedule={(coach) => { setScheduleModalCoach(coach); setShowScheduleModal(true); }}
        onLogContact={(coach) => setQuickActionsCoach(coach)}
        onAddCoach={() => setShowAddModal(true)}
      />

      {/* Modals */}
      {showScheduleModal && (
        <ScheduleEventModal
          coach={scheduleModalCoach}
          event={editingEvent}
          initialDate={scheduleModalDate}
          onClose={() => { setShowScheduleModal(false); setScheduleModalCoach(null); setScheduleModalDate(undefined); setEditingEvent(null); }}
          onSuccess={refreshData}
        />
      )}
      {selectedEvent && !editingEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => { setEditingEvent(selectedEvent); setShowScheduleModal(true); setSelectedEvent(null); }}
          onRefresh={refreshData}
        />
      )}
      {showAddModal && (
        <AddCoachModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); refreshData(); }}
          statusConfig={STATUS_CONFIG}
        />
      )}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { setShowImportModal(false); refreshData(); }}
        />
      )}
    </div>
  );
}
