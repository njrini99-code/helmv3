'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { CoachTable } from './components/CoachTable';
import { PipelineView } from './components/PipelineView';
import { CoachFilters, type Filters } from './components/CoachFilters';
import { AddCoachModal } from './components/AddCoachModal';
import { CoachDetailPanel } from './components/CoachDetailPanel';
import { ImportModal } from './components/ImportModal';
import { BulkActionsBar } from './components/BulkActionsBar';
import { CalendarView, type CRMEvent } from './components/CalendarView';
import { QuickActionsPanel } from './components/QuickActionsPanel';
import { FAB } from './components/FAB';
import { ScheduleEventModal } from './components/ScheduleEventModal';
import { EventDetailModal } from './components/EventDetailModal';

// ============================================================================
// TYPES
// ============================================================================
export type CoachStatus = 
  | 'new_lead'
  | 'contacted'
  | 'demo_scheduled'
  | 'customer'
  | 'closed';

export type Division = 'D2' | 'D3';
export type ProgramType = 'mens' | 'womens' | 'both';

export interface Coach {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  school: string;
  conference: string;
  division: Division;
  program: ProgramType;
  status: CoachStatus;
  priority: number;
  highlight_color: string | null;
  is_starred: boolean;
  notes: string | null;
  internal_comments: string | null;
  tags: string[] | null;
  team_size: number | null;
  current_software: string | null;
  budget_range: string | null;
  decision_timeline: string | null;
  pain_points: string[] | null;
  best_contact_method: string | null;
  best_contact_time: string | null;
  timezone: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// SIDEBAR TABS
// ============================================================================
const TABS = [
  { id: 'list', label: 'Coach List', icon: '📋', shortcut: '1', description: 'All coaches in table view' },
  { id: 'pipeline', label: 'Pipeline', icon: '📊', shortcut: '2', description: 'Kanban sales pipeline' },
  { id: 'calendar', label: 'Calendar', icon: '📅', shortcut: '3', description: 'Scheduled events' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ============================================================================
// STATUS CONFIG - Updated with softer colors
// ============================================================================
export const STATUS_CONFIG: Record<CoachStatus, { 
  label: string; 
  color: string; 
  bgColor: string;
  ringColor: string;
  icon: string;
  order: number;
  gradient: string;
}> = {
  new_lead: { 
    label: 'New Lead', 
    color: 'text-slate-700', 
    bgColor: 'bg-slate-100', 
    ringColor: 'ring-slate-300',
    icon: '📋',
    order: 1,
    gradient: 'from-slate-400 to-slate-500',
  },
  contacted: { 
    label: 'Contacted', 
    color: 'text-blue-700', 
    bgColor: 'bg-blue-50', 
    ringColor: 'ring-blue-300',
    icon: '💬',
    order: 2,
    gradient: 'from-blue-400 to-blue-500',
  },
  demo_scheduled: { 
    label: 'Demo Set', 
    color: 'text-amber-700', 
    bgColor: 'bg-amber-50', 
    ringColor: 'ring-amber-300',
    icon: '📅',
    order: 3,
    gradient: 'from-amber-400 to-amber-500',
  },
  customer: { 
    label: 'Customer', 
    color: 'text-emerald-700', 
    bgColor: 'bg-emerald-50', 
    ringColor: 'ring-emerald-400',
    icon: '✅',
    order: 4,
    gradient: 'from-emerald-400 to-emerald-500',
  },
  closed: { 
    label: 'Closed', 
    color: 'text-red-700', 
    bgColor: 'bg-red-50', 
    ringColor: 'ring-red-300',
    icon: '🚫',
    order: 5,
    gradient: 'from-red-400 to-red-500',
  },
};

export const PRIORITY_CONFIG: Record<number, { label: string; color: string; bgColor: string; icon: string }> = {
  0: { label: 'Normal', color: 'text-warm-500', bgColor: 'bg-warm-50', icon: '' },
  1: { label: 'High', color: 'text-amber-600', bgColor: 'bg-amber-50', icon: '⚡' },
  2: { label: 'Hot', color: 'text-orange-600', bgColor: 'bg-orange-50', icon: '🔥' },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CRMPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // URL-driven tab state
  const urlTab = searchParams.get('tab') as TabId | null;
  const activeTab: TabId = TABS.some((t) => t.id === urlTab) ? urlTab! : 'list';
  
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
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [googleConnected, setGoogleConnected] = useState(false);

  const supabase = createClient();

  // ============================================================================
  // TAB NAVIGATION
  // ============================================================================
  function setActiveTab(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/golf/admin/crm?${params.toString()}`, { scroll: false });
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const tabIndex = parseInt(e.key) - 1;
      if (tabIndex >= 0 && tabIndex < TABS.length) {
        setActiveTab(TABS[tabIndex]!.id);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchParams]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
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

      const { data, error } = await query;
      if (error) throw error;
      setCoaches((data || []) as Coach[]);
      const uniqueConferences = [...new Set((data || []).map(c => c.conference))].sort();
      setConferences(uniqueConferences);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch coaches');
    } finally {
      setLoading(false);
    }
  }, [filters, supabase]);

  useEffect(() => { fetchCoaches(); }, [fetchCoaches]);

  useEffect(() => {
    const checkGoogleConnection = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('crm_google_calendar_tokens')
        .select('id, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();
      setGoogleConnected(!!data);
    };
    checkGoogleConnection();
  }, [supabase]);

  // ============================================================================
  // ACTIONS
  // ============================================================================
  const updateCoach = async (coachId: string, updates: Partial<Coach>) => {
    try {
      const { error } = await supabase.from('crm_coaches').update(updates).eq('id', coachId);
      if (error) throw error;
      setCoaches(prev => prev.map(c => c.id === coachId ? { ...c, ...updates } : c));
      if (selectedCoach?.id === coachId) setSelectedCoach(prev => prev ? { ...prev, ...updates } : null);
      if (quickActionsCoach?.id === coachId) setQuickActionsCoach(prev => prev ? { ...prev, ...updates } : null);
    } catch (err) {
      console.error('Failed to update coach:', err);
      fetchCoaches();
    }
  };

  const toggleStar = async (coachId: string, currentStarred: boolean) => {
    await updateCoach(coachId, { is_starred: !currentStarred });
  };

  const handleCoachClick = (coach: Coach) => setQuickActionsCoach(coach);

  const handleBulkAction = async (action: string, value?: unknown) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      if (action === 'status') await supabase.from('crm_coaches').update({ status: value as CoachStatus }).in('id', ids);
      else if (action === 'priority') await supabase.from('crm_coaches').update({ priority: value as number }).in('id', ids);
      else if (action === 'delete') await supabase.from('crm_coaches').delete().in('id', ids);
      setSelectedIds(new Set());
      fetchCoaches();
    } catch (err) { console.error('Bulk action failed:', err); }
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'School', 'Conference', 'Division', 'Status', 'Priority', 'Starred', 'Notes'];
    const rows = coaches.map(c => [
      c.name, c.email || '', c.school, c.conference, c.division,
      STATUS_CONFIG[c.status]?.label || c.status,
      PRIORITY_CONFIG[c.priority]?.label || 'Normal',
      c.is_starred ? 'Yes' : 'No',
      (c.notes || '').replace(/"/g, '""'),
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `golfhelm-crm-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleEventClick = (event: CRMEvent) => setSelectedEvent(event);
  const handleSlotClick = (date: Date) => { setScheduleModalDate(date); setScheduleModalCoach(null); setShowScheduleModal(true); };
  const handleConnectGoogle = () => alert('Google Calendar integration coming soon! Will connect to admin@helmsportslabs.com');
  const refreshCalendar = () => setCalendarRefreshKey(k => k + 1);

  // ============================================================================
  // COMPUTED
  // ============================================================================
  const stats = useMemo(() => {
    const total = coaches.length;
    const byStatus = Object.keys(STATUS_CONFIG).reduce((acc, status) => {
      acc[status as CoachStatus] = coaches.filter(c => c.status === status).length;
      return acc;
    }, {} as Record<CoachStatus, number>);
    const starred = coaches.filter(c => c.is_starred).length;
    const hot = coaches.filter(c => c.priority >= 2).length;
    const followUpsDue = coaches.filter(c => c.next_follow_up_at && new Date(c.next_follow_up_at) <= new Date()).length;
    return { total, byStatus, starred, hot, followUpsDue };
  }, [coaches]);

  // ============================================================================
  // ERROR STATE
  // ============================================================================
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-warm-50 to-warm-100 flex items-center justify-center p-8">
        <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-warm-900 mb-2">Error Loading CRM</h2>
          <p className="text-warm-600 mb-6">{error}</p>
          <button 
            onClick={fetchCoaches} 
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
    <div className="min-h-screen bg-gradient-to-br from-warm-50 via-white to-warm-50/50 relative flex">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary-100/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-violet-100/20 blur-3xl" />
      </div>

      {/* Sidebar */}
      <aside className={cn(
        'relative z-10 flex flex-col transition-all duration-300',
        'bg-white/65 backdrop-blur-[16px]',
        'border-r border-white/30',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
        sidebarCollapsed ? 'w-20' : 'w-72'
      )}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-warm-100/50">
          {/* Back to Dashboard */}
          <a
            href="/golf/admin"
            className={cn(
              'flex items-center gap-2 mb-4 px-2 py-1.5 -mx-1 rounded-xl text-sm',
              'text-warm-500 hover:text-warm-700 hover:bg-white/50 transition-all'
            )}
          >
            <span className="text-xs">←</span>
            {!sidebarCollapsed && <span className="font-medium">Dashboard</span>}
          </a>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <span className="text-xl">🎯</span>
            </div>
            {!sidebarCollapsed && (
              <div>
                <h1 className="font-bold text-warm-900">Coach CRM</h1>
                <p className="text-[11px] font-medium text-warm-400 uppercase tracking-wider">{stats.total} coaches</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 p-3 space-y-1.5">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group',
                  isActive
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                    : 'text-warm-600 hover:bg-white/60 hover:text-warm-900'
                )}
              >
                <span className="text-xl">{tab.icon}</span>
                {!sidebarCollapsed && (
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-sm">{tab.label}</div>
                    <div className={cn('text-[11px]', isActive ? 'text-white/70' : 'text-warm-400')}>
                      {tab.description}
                    </div>
                  </div>
                )}
                {!sidebarCollapsed && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-md font-mono',
                    isActive ? 'bg-white/20 text-white' : 'bg-warm-100 text-warm-500'
                  )}>
                    {tab.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Stats Cards in Sidebar */}
        {!sidebarCollapsed && (
          <div className="p-4 border-t border-warm-100/50 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className={cn(
                'bg-white/65 backdrop-blur-[16px] rounded-xl p-3',
                'border border-white/30',
                'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]'
              )}>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{stats.byStatus.customer || 0}</div>
                <div className="text-[11px] font-medium text-warm-400 uppercase tracking-wider">Customers</div>
              </div>
              <div className={cn(
                'bg-white/65 backdrop-blur-[16px] rounded-xl p-3',
                'border border-white/30',
                'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]'
              )}>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{stats.byStatus.demo_scheduled || 0}</div>
                <div className="text-[11px] font-medium text-warm-400 uppercase tracking-wider">Demos Set</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className={cn(
                'bg-white/50 rounded-xl p-2.5 text-center',
                'border border-white/30'
              )}>
                <div className="text-lg font-bold text-orange-600 tabular-nums">{stats.hot}</div>
                <div className="text-[10px] text-warm-500 font-medium">🔥 Hot</div>
              </div>
              <div className={cn(
                'bg-white/50 rounded-xl p-2.5 text-center',
                'border border-white/30'
              )}>
                <div className="text-lg font-bold text-amber-600 tabular-nums">{stats.followUpsDue}</div>
                <div className="text-[10px] text-warm-500 font-medium">⏰ Due</div>
              </div>
              <div className={cn(
                'bg-white/50 rounded-xl p-2.5 text-center',
                'border border-white/30'
              )}>
                <div className="text-lg font-bold text-yellow-600 tabular-nums">{stats.starred}</div>
                <div className="text-[10px] text-warm-500 font-medium">⭐ Starred</div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="p-4 border-t border-warm-100/50 space-y-2">
          <button
            onClick={() => setShowAddModal(true)}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold transition-all',
              'bg-primary-600 text-white shadow-lg shadow-primary-500/20',
              'hover:bg-primary-700 hover:shadow-xl active:scale-[0.98]'
            )}
          >
            <span>+</span>
            {!sidebarCollapsed && <span>Add Coach</span>}
          </button>
          {!sidebarCollapsed && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowImportModal(true)}
                className={cn(
                  'flex-1 py-2 rounded-xl text-sm font-medium transition-all',
                  'bg-white/60 hover:bg-white/80 text-warm-700',
                  'border border-white/40 shadow-sm'
                )}
              >
                📤 Import
              </button>
              <button
                onClick={exportToCSV}
                className={cn(
                  'flex-1 py-2 rounded-xl text-sm font-medium transition-all',
                  'bg-white/60 hover:bg-white/80 text-warm-700',
                  'border border-white/40 shadow-sm'
                )}
              >
                📥 Export
              </button>
            </div>
          )}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-3 border-t border-warm-100/50 text-warm-400 hover:text-warm-600 hover:bg-white/50 transition-colors"
        >
          {sidebarCollapsed ? '→' : '←'}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative z-10 flex flex-col min-h-screen overflow-hidden">
        {/* Top Bar */}
        <header className={cn(
          'px-6 py-4 border-b',
          'bg-white/65 backdrop-blur-[16px]',
          'border-white/30'
        )}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-warm-900">
                {TABS.find(t => t.id === activeTab)?.label}
              </h2>
              <p className="text-sm text-warm-500 mt-0.5">
                {TABS.find(t => t.id === activeTab)?.description}
              </p>
            </div>

            {/* Pipeline Status Chips */}
            {activeTab !== 'calendar' && (
              <div className="flex items-center gap-2">
                {(Object.keys(STATUS_CONFIG) as CoachStatus[]).map((status) => {
                  const config = STATUS_CONFIG[status];
                  const count = stats.byStatus[status] || 0;
                  const isActive = filters.status === status;
                  
                  return (
                    <button
                      key={status}
                      onClick={() => setFilters(f => ({ ...f, status: isActive ? 'all' : status }))}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all',
                        isActive 
                          ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20' 
                          : 'bg-white/60 text-warm-600 hover:bg-white/80 border border-white/40'
                      )}
                    >
                      <span>{config.icon}</span>
                      <span className="hidden lg:inline">{config.label}</span>
                      <span className={cn(
                        'px-1.5 py-0.5 rounded-lg text-xs font-bold tabular-nums',
                        isActive ? 'bg-white/20' : 'bg-warm-100'
                      )}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className={cn(
          'flex-1 overflow-auto p-6',
          detailPanelOpen && selectedCoach ? 'mr-[420px]' : ''
        )}>
          {activeTab === 'calendar' ? (
            <CalendarView
              key={calendarRefreshKey}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
              googleConnected={googleConnected}
              onConnectGoogle={handleConnectGoogle}
            />
          ) : (
            <div className="space-y-4">
              {/* Filters */}
              <div className={cn(
                'p-4 rounded-2xl',
                'bg-white/65 backdrop-blur-[16px]',
                'border border-white/30',
                'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]'
              )}>
                <CoachFilters
                  filters={filters}
                  setFilters={setFilters}
                  conferences={conferences}
                  statusConfig={STATUS_CONFIG}
                />
              </div>

              {/* Bulk Actions */}
              {selectedIds.size > 0 && (
                <BulkActionsBar
                  selectedCount={selectedIds.size}
                  onAction={handleBulkAction}
                  onClear={() => setSelectedIds(new Set())}
                  statusConfig={STATUS_CONFIG}
                />
              )}

              {/* Table or Pipeline */}
              <div className={cn(
                'rounded-2xl overflow-hidden',
                'bg-white/65 backdrop-blur-[16px]',
                'border border-white/30',
                'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]'
              )}>
                {activeTab === 'list' ? (
                  <CoachTable
                    coaches={coaches}
                    loading={loading}
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    onStatusChange={(id, status) => updateCoach(id, { status })}
                    onPriorityChange={(id, priority) => updateCoach(id, { priority })}
                    onToggleStar={toggleStar}
                    onCoachClick={handleCoachClick}
                    statusConfig={STATUS_CONFIG}
                    priorityConfig={PRIORITY_CONFIG}
                  />
                ) : (
                  <PipelineView
                    coaches={coaches}
                    onCoachClick={handleCoachClick}
                    onStatusChange={(id, status) => updateCoach(id, { status })}
                    onToggleStar={toggleStar}
                    statusConfig={STATUS_CONFIG}
                    priorityConfig={PRIORITY_CONFIG}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </main>

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
          onRefreshEvents={refreshCalendar}
          statusConfig={STATUS_CONFIG}
        />
      )}

      {/* FAB */}
      <FAB
        onSchedule={(coach) => { setScheduleModalCoach(coach); setShowScheduleModal(true); }}
        onLogContact={(coach) => setQuickActionsCoach(coach)}
        onAddCoach={() => setShowAddModal(true)}
      />

      {/* Schedule Modal */}
      {showScheduleModal && (
        <ScheduleEventModal
          coach={scheduleModalCoach}
          event={editingEvent}
          initialDate={scheduleModalDate}
          onClose={() => { setShowScheduleModal(false); setScheduleModalCoach(null); setScheduleModalDate(undefined); setEditingEvent(null); }}
          onSuccess={() => { refreshCalendar(); fetchCoaches(); }}
        />
      )}

      {/* Event Detail Modal */}
      {selectedEvent && !editingEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => { setEditingEvent(selectedEvent); setShowScheduleModal(true); setSelectedEvent(null); }}
          onRefresh={() => { refreshCalendar(); fetchCoaches(); }}
        />
      )}

      {/* Add Coach Modal */}
      {showAddModal && (
        <AddCoachModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); fetchCoaches(); }}
          statusConfig={STATUS_CONFIG}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { setShowImportModal(false); fetchCoaches(); }}
        />
      )}
    </div>
  );
}
