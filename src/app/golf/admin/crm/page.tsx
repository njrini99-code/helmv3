'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  IconChartBar,
  IconChevronRight,
  IconPlus,
  IconUpload,
  IconDownload,
  IconUsers,
  IconTrendingUp,
  IconClock,
  IconFlame,
  IconTarget,
  IconWarning,
  IconMail,
  IconActivity,
  IconClipboardList as ClipboardList,
  IconLayoutGrid as LayoutDashboard,
  IconArrowLeft as ArrowLeft,
  IconChevronLeft as ChevronLeft,
  IconBuilding as Building2,
  IconBolt,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  type CoachStatus,
  type Coach,
  PIPELINE_STAGES,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  AUTO_FOLLOWUP_DAYS,
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
import { BulkEmailModal } from './components/BulkEmailModal';
import { EmailTrackingView } from './components/EmailTrackingView';
import { InboundLeadsView } from './components/InboundLeadsView';
import { ResendActivityView } from './components/resend/ResendActivityView';
// FAB removed — actions available via sidebar buttons
import { QuickActionsPanel } from './components/QuickActionsPanel';
import { ScheduleEventModal } from './components/ScheduleEventModal';
import { EventDetailModal } from './components/EventDetailModal';
import { SavedSegmentsRail } from './components/segments/SavedSegmentsRail';
import { InboxView } from './components/replies/InboxView';
import { SequencesList } from './components/sequences/SequencesList';
import { SequenceBuilder } from './components/sequences/SequenceBuilder';
import { InsightsDashboard } from './components/insights/InsightsDashboard';
import { AutomationsList } from './components/automations/AutomationsList';
import { SuppressionsAdminPanel } from './components/suppressions/SuppressionsAdminPanel';
import type { CRMEvent } from './components/CalendarView';
import { getCoachEngagement } from '@/app/golf/actions/crm-engagement';
import type { CoachEngagement } from './types/foundations';

// ============================================================================
// SIDEBAR TABS
// ============================================================================
const TABS = [
  { id: 'inbox', label: 'Inbox', Icon: IconMail, shortcut: '1', description: 'Replies + tasks due today' },
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, shortcut: '2', description: 'Pipeline overview & quick actions' },
  { id: 'list', label: 'Coaches', Icon: ClipboardList, shortcut: '3', description: 'All coaches in table view' },
  { id: 'pipeline', label: 'Pipeline', Icon: IconChartBar, shortcut: '4', description: 'Kanban sales pipeline' },
  { id: 'sequences', label: 'Sequences', Icon: IconActivity, shortcut: '5', description: 'Drip campaigns & enrollments' },
  { id: 'insights', label: 'Insights', Icon: IconChartBar, shortcut: '6', description: 'Deliverability + per-template performance' },
  { id: 'conferences', label: 'Conferences', Icon: Building2, shortcut: '7', description: 'Grouped by conference' },
  { id: 'email', label: 'Email', Icon: IconMail, shortcut: '8', description: 'Email tracking & analytics' },
  { id: 'resend', label: 'Resend', Icon: IconActivity, shortcut: '9', description: 'Live email deliverability from Resend' },
  { id: 'inbound', label: 'Inbound', Icon: IconMail, shortcut: '0', description: 'Demo requests & inbound leads' },
  { id: 'settings', label: 'Settings', Icon: IconBolt, shortcut: 'S', description: 'Automations & suppressions' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CRMPage() {
  const searchParams = useSearchParams();

  // coaches state removed — using filteredCoaches (client-side) from allCoaches instead
  const [allCoaches, setAllCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  // loading is set to false after first fetchAllCoaches completes
  const [error, setError] = useState<string | null>(null);

  // Tab state lives in local React state. URL is kept in sync via
  // history.replaceState so deep links still work, but we don't pay the
  // cost of a router.replace() soft navigation on every tab click.
  //
  // IMPORTANT: useState initializer must NOT read window.location — doing so
  // produced SSR/CSR drift (React error #418) when the URL had `?tab=X`:
  // server rendered 'dashboard', client initial render wanted X. The
  // searchParams sync effect below runs on mount and promotes the URL tab
  // post-hydration, so deep links still work.
  const [activeTab, setActiveTabState] = useState<TabId>('dashboard');

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
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false);
  const [bulkEmailCoaches, setBulkEmailCoaches] = useState<Coach[]>([]);
  const [followupRecipients, setFollowupRecipients] = useState<
    Array<{ email: string; name?: string | null; coach_id?: string | null }>
  >([]);

  // Engagement map (coach_id -> CoachEngagement), populated by a one-shot
  // post-load effect. Surfaced as Hot/Warm/Cold pills in CoachTable. Stream B.
  const [engagementMap, setEngagementMap] = useState<Record<string, CoachEngagement>>({});

  const supabase = createClient();

  // ============================================================================
  // TAB NAVIGATION
  // ============================================================================
  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
    // Keep URL in sync for bookmarkability WITHOUT triggering a Next.js
    // soft navigation / server re-eval.
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('tab', tab);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, []);

  // Register the 1-7 number keyboard shortcut once, using a ref so we
  // don't churn listeners on every tab change.
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

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
  }, [setActiveTab]);

  // If searchParams (deep-link) changes to a different tab — e.g. the user
  // uses back/forward — sync local state to match. This does not trigger
  // for the normal setActiveTab path since we only use history.replaceState.
  useEffect(() => {
    const urlTab = searchParams.get('tab') as TabId | null;
    if (urlTab && TABS.some((t) => t.id === urlTab) && urlTab !== activeTabRef.current) {
      setActiveTabState(urlTab);
    }
  }, [searchParams]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  // Narrowed column list for the list/pipeline/conferences/dashboard views.
  // Heavy/rarely-used columns (internal_comments, highlight_color,
  // best_contact_method, best_contact_time, budget_range, timezone, source,
  // archived_*, created_by, athletics_url) are dropped from the list payload
  // and fetched on-demand by CoachDetailPanel / BulkEmailModal on open.
  //
  // Columns kept because they're used by: CoachTable, filteredCoaches,
  // stats, CSV export, CoachDetailPanel (via prop), BulkEmailModal (via prop).
  const CRM_COACHES_LIST_COLUMNS = [
    'id',
    'name',
    'title',
    'email',
    'phone',
    'school',
    'conference',
    'division',
    'program',
    'status',
    'priority',
    'is_starred',
    'notes',
    'tags',
    'team_size',
    'current_software',
    'decision_timeline',
    'pain_points',
    'last_contacted_at',
    'next_follow_up_at',
    'email_status',
    'last_email_event_type',
    'last_email_event_at',
    'created_at',
    'updated_at',
  ].join(', ');

  const fetchAllCoaches = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('crm_coaches')
        .select(CRM_COACHES_LIST_COLUMNS)
        .order('is_starred', { ascending: false })
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false });
      // Precompute a lowercased search blob once at fetch time so we don't
      // call toLowerCase() 4x per row per keystroke in filteredCoaches.
      // The dropped columns (internal_comments, highlight_color, etc.) are
      // filled with nulls / defaults so callers still match the Coach shape.
      const rows = (data || []) as Partial<Coach>[];
      const coachData: Array<Coach & { _searchBlob: string }> = rows.map(c => ({
        // fields we fetched
        id: c.id!,
        name: c.name ?? '',
        title: c.title ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        school: c.school ?? '',
        conference: c.conference ?? '',
        division: (c.division ?? 'D3') as Coach['division'],
        program: (c.program ?? 'mens') as Coach['program'],
        status: (c.status ?? 'new_lead') as Coach['status'],
        priority: c.priority ?? 0,
        is_starred: c.is_starred ?? false,
        notes: c.notes ?? null,
        tags: c.tags ?? null,
        team_size: c.team_size ?? null,
        current_software: c.current_software ?? null,
        decision_timeline: c.decision_timeline ?? null,
        pain_points: c.pain_points ?? null,
        last_contacted_at: c.last_contacted_at ?? null,
        next_follow_up_at: c.next_follow_up_at ?? null,
        email_status: (c.email_status ?? 'unknown') as Coach['email_status'],
        created_at: c.created_at ?? '',
        updated_at: c.updated_at ?? '',
        // fields we deliberately didn't fetch — null/default them.
        // CoachDetailPanel and BulkEmailModal lazy-load these when needed.
        highlight_color: null,
        internal_comments: null,
        budget_range: null,
        best_contact_method: null,
        best_contact_time: null,
        timezone: null,
        source: null,
        is_archived: false,
        archived_at: null,
        archived_by: null,
        athletics_url: null,
        _searchBlob: `${c.name ?? ''} ${c.school ?? ''} ${c.email ?? ''} ${c.conference ?? ''}`.toLowerCase(),
      }));
      setAllCoaches(coachData);
      const uniqueConferences = [...new Set(coachData.map(c => c.conference))].sort();
      setConferences(uniqueConferences);
    } catch (err) {
      console.error('Failed to fetch all coaches:', err);
    } finally {
      setLoading(false);
    }
    // CRM_COACHES_LIST_COLUMNS is a stable string literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // Client-side filtering from allCoaches — eliminates server round-trips on every keystroke
  // and fixes the search bar flicker/reset bug caused by the fetch→re-render→state-reset loop.
  // Single-pass loop over allCoaches to avoid 10 intermediate array allocations per recompute.
  const filteredCoaches = useMemo(() => {
    const now = new Date().toISOString();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString();

    const q = filters.search ? filters.search.toLowerCase() : null;
    const priorityNum = filters.priority !== 'all' ? parseInt(filters.priority) : null;
    const hasStatus = filters.status !== 'all';
    const hasDivision = filters.division !== 'all';
    const hasConference = filters.conference !== 'all';
    const hasProgram = filters.program !== 'all';

    const result: Coach[] = [];
    for (const c of allCoaches) {
      if (hasStatus && c.status !== filters.status) continue;
      if (hasDivision && c.division !== filters.division) continue;
      if (hasConference && c.conference !== filters.conference) continue;
      if (hasProgram && c.program !== filters.program) continue;
      if (priorityNum !== null && c.priority !== priorityNum) continue;
      if (q) {
        const blob = (c as Coach & { _searchBlob?: string })._searchBlob;
        if (blob !== undefined) {
          if (!blob.includes(q)) continue;
        } else if (
          !(
            c.name?.toLowerCase().includes(q) ||
            c.school?.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            c.conference?.toLowerCase().includes(q)
          )
        ) {
          continue;
        }
      }
      if (filters.followUpDue && !(c.next_follow_up_at && c.next_follow_up_at <= now)) continue;
      if (filters.starred && !c.is_starred) continue;
      if (filters.hasNotes && !c.notes) continue;
      if (filters.noContact30Days && c.last_contacted_at && c.last_contacted_at >= cutoff) continue;
      result.push(c);
    }

    // Sort: starred first, then by priority desc, then by updated_at desc
    result.sort((a, b) => {
      if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return (b.updated_at || '').localeCompare(a.updated_at || '');
    });

    return result;
  }, [allCoaches, filters]);

  useEffect(() => { fetchAllCoaches(); }, [fetchAllCoaches]);

  // After coaches load, fetch their engagement scores from the
  // crm_coach_engagement materialized view. One round-trip per coach-list
  // load — refreshed in the background by /api/cron/refresh-engagement.
  // Stream B owns this block; Stream C edits a different region (sidebar).
  useEffect(() => {
    if (!allCoaches.length) {
      setEngagementMap({});
      return;
    }
    let cancelled = false;
    const ids = allCoaches.map((c) => c.id);
    getCoachEngagement(ids)
      .then((map) => {
        if (!cancelled) setEngagementMap(map);
      })
      .catch((err) => {
        // Non-fatal: badges fall back to "—" placeholder when the map is empty.
        console.warn('[crm] engagement fetch failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [allCoaches]);

  // ============================================================================
  // ACTIONS
  // ============================================================================
  const updateCoach = async (coachId: string, updates: Partial<Coach>) => {
    let finalUpdates = updates.status
      ? { ...updates, updated_at: new Date().toISOString() }
      : updates;

    // Auto follow-up: if status changed and new status has an auto follow-up rule, set next_follow_up_at
    if (updates.status && !updates.next_follow_up_at) {
      const followUpDays = AUTO_FOLLOWUP_DAYS[updates.status];
      if (followUpDays) {
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + followUpDays);
        finalUpdates = { ...finalUpdates, next_follow_up_at: followUpDate.toISOString() };
      }
    }

    try {
      const { error: updateError } = await supabase.from('crm_coaches').update(finalUpdates).eq('id', coachId);
      if (updateError) throw updateError;
      setAllCoaches(prev => prev.map(c => {
        if (c.id !== coachId) return c;
        const merged = { ...c, ...finalUpdates } as Coach & { _searchBlob?: string };
        // If a searchable field changed, recompute the search blob
        if (
          'name' in finalUpdates ||
          'school' in finalUpdates ||
          'email' in finalUpdates ||
          'conference' in finalUpdates
        ) {
          merged._searchBlob =
            `${merged.name ?? ''} ${merged.school ?? ''} ${merged.email ?? ''} ${merged.conference ?? ''}`.toLowerCase();
        }
        return merged;
      }));
      if (selectedCoach?.id === coachId) setSelectedCoach(prev => prev ? { ...prev, ...finalUpdates } : null);
    } catch (err) {
      console.error('Failed to update coach:', err);
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
      const touchesSearchable =
        'name' in finalUpdates ||
        'school' in finalUpdates ||
        'email' in finalUpdates ||
        'conference' in finalUpdates;
      setAllCoaches(prev => prev.map(c => {
        if (!idSet.has(c.id)) return c;
        const merged = { ...c, ...finalUpdates } as Coach & { _searchBlob?: string };
        if (touchesSearchable) {
          merged._searchBlob =
            `${merged.name ?? ''} ${merged.school ?? ''} ${merged.email ?? ''} ${merged.conference ?? ''}`.toLowerCase();
        }
        return merged;
      }));
    } catch (err) {
      console.error('Failed to bulk update:', err);
      fetchAllCoaches();
    }
  };

  const toggleStar = useCallback(async (coachId: string, currentStarred: boolean) => {
    await updateCoach(coachId, { is_starred: !currentStarred });
    // updateCoach captures current state via closures but its signature is
    // stable; intentionally omitting from deps for a stable function ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCoachClick = useCallback((coach: Coach) => {
    setSelectedCoach(coach);
    setDetailPanelOpen(true);
  }, []);

  // Stable handlers for list/pipeline/conferences views — avoid creating
  // new function refs on every CRMPage render (which would defeat the
  // React.memo on CoachTableRow).
  const handleStatusChange = useCallback((id: string, status: CoachStatus) => {
    updateCoach(id, { status });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleLogContact = useCallback((coach: Coach) => {
    setQuickActionsCoach(coach);
  }, []);

  const handleSendFollowup = (
    recipients: Array<{ email: string; name?: string | null; coach_id?: string | null }>,
  ) => {
    if (recipients.length === 0) return;
    // Hydrate any matching CRM coach rows so merge-tag data is available.
    const matched: Coach[] = [];
    const seen = new Set<string>();
    for (const r of recipients) {
      const hit =
        (r.coach_id && allCoaches.find(c => c.id === r.coach_id)) ||
        (r.email && allCoaches.find(c => c.email?.toLowerCase() === r.email.toLowerCase())) ||
        null;
      if (hit && !seen.has(hit.id)) {
        seen.add(hit.id);
        matched.push(hit);
      }
    }
    setBulkEmailCoaches(matched);
    setFollowupRecipients(recipients);
    setShowBulkEmailModal(true);
  };

  const handleBulkAction = async (action: string, value?: unknown) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (action === 'email') {
      const selected = allCoaches.filter(c => ids.includes(c.id));
      setBulkEmailCoaches(selected);
      setShowBulkEmailModal(true);
      return;
    }

    try {
      if (action === 'status') await bulkUpdateCoaches(ids, { status: value as CoachStatus });
      else if (action === 'priority') await bulkUpdateCoaches(ids, { priority: value as number });
      else if (action === 'star') await bulkUpdateCoaches(ids, { is_starred: true });
      else if (action === 'unstar') await bulkUpdateCoaches(ids, { is_starred: false });
      else if (action === 'delete') {
        await supabase.from('crm_coaches').delete().in('id', ids);
        fetchAllCoaches();
      }
      setSelectedIds(new Set());
    } catch (err) { console.error('Bulk action failed:', err); }
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'School', 'Conference', 'Division', 'Program', 'Status', 'Priority', 'Starred', 'Last Contact', 'Notes'];
    const rows = filteredCoaches.map((c: Coach) => [
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

  const refreshData = () => { fetchAllCoaches(); };

  // ============================================================================
  // COMPUTED
  // ============================================================================
  const stats = useMemo(() => {
    const byStatus = Object.fromEntries(
      Object.keys(STATUS_CONFIG).map(k => [k, 0]),
    ) as Record<CoachStatus, number>;
    const byStage = Object.fromEntries(
      PIPELINE_STAGES.map(s => [s.id, 0]),
    ) as Record<string, number>;

    const s = {
      total: allCoaches.length,
      byStatus,
      byStage,
      starred: 0,
      hot: 0,
      followUpsDue: 0,
      contacted: 0,
      inPipeline: 0,
    };

    const now = Date.now();
    const notInPipeline = new Set<CoachStatus>(['new_lead', 'won', 'lost', 'nurture']);

    for (const c of allCoaches) {
      s.byStatus[c.status] = (s.byStatus[c.status] ?? 0) + 1;
      for (const stage of PIPELINE_STAGES) {
        if (stage.statuses.includes(c.status)) {
          s.byStage[stage.id] = (s.byStage[stage.id] ?? 0) + 1;
          break;
        }
      }
      if (c.is_starred) s.starred++;
      if (c.priority >= 2) s.hot++;
      if (c.next_follow_up_at && Date.parse(c.next_follow_up_at) <= now) s.followUpsDue++;
      if (c.status !== 'new_lead') s.contacted++;
      if (!notInPipeline.has(c.status)) s.inPipeline++;
    }

    return s;
  }, [allCoaches]);

  // ============================================================================
  // ERROR STATE
  // ============================================================================
  if (error) {
    return (
      <div className="min-h-screen bg-[#FFFEF8] flex items-center justify-center p-8">
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/20 shadow-glass p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <IconWarning size={28} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-warm-900 mb-2">Error Loading CRM</h2>
          <p className="text-warm-600 mb-6">{error}</p>
          <button
            onClick={() => { setError(null); fetchAllCoaches(); }}
            className="px-6 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-medium transition-all duration-200 shadow-sm"
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
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#1C1917]/95 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-2 px-3 h-12">
          <a href="/golf/admin" className="flex-shrink-0 p-1.5 rounded-lg text-warm-400 hover:text-white transition-all duration-200">
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
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0',
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
            className="flex-shrink-0 p-1.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition-all duration-200 shadow-sm"
          >
            <IconPlus size={16} />
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
            <IconTarget size={18} className="text-white" />
          </div>
          {!sidebarCollapsed && <span className="font-bold text-lg text-white tracking-tight">Coach CRM</span>}
        </div>

        {/* Back to Dashboard */}
        <div className="px-3 mb-2">
          <a href="/golf/admin" className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-[10px]',
            'text-warm-400 hover:bg-white/5 hover:text-white transition-all duration-200',
            sidebarCollapsed && 'justify-center'
          )}>
            <ArrowLeft size={16} className="flex-shrink-0" />
            {!sidebarCollapsed && <span className="text-sm font-medium">Dashboard</span>}
          </a>
        </div>

        {/* Section Divider */}
        <div className="mx-3 border-t border-white/10" />

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
                    'group relative flex items-center gap-3 w-full rounded-[10px] transition-all duration-200',
                    sidebarCollapsed ? 'justify-center p-3' : 'px-3 py-2.5',
                    isActive ? 'bg-white/10 text-white' : 'text-warm-400 hover:bg-white/5 hover:text-white'
                  )}
                >
                  {isActive && <div className="absolute left-0 top-1/2 -tranwarm-y-1/2 w-[3px] h-5 bg-primary-500 rounded-r-full" />}
                  <TabIcon size={20} className={cn('flex-shrink-0', isActive ? 'text-primary-400' : 'text-warm-400 group-hover:text-white')} />
                  {!sidebarCollapsed && <span className="text-sm font-medium flex-1 text-left">{tab.label}</span>}
                  {!sidebarCollapsed && (
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', isActive ? 'bg-primary-500/20 text-primary-400' : 'bg-white/5 text-warm-500')}>
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

        {/* Saved segments rail (Stream C) */}
        <SavedSegmentsRail
          filters={filters}
          setFilters={setFilters}
          collapsed={sidebarCollapsed}
        />

        {/* Action Buttons */}
        <div className="p-3 border-t border-white/10 space-y-2">
          <button
            onClick={() => setShowAddModal(true)}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] font-medium transition-all duration-200',
              'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700'
            )}
          >
            <IconPlus size={16} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>Add Coach</span>}
          </button>
          {!sidebarCollapsed && (
            <div className="flex gap-2">
              <button onClick={() => setShowImportModal(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-sm font-medium bg-white/5 hover:bg-white/10 text-warm-400 transition-all duration-200">
                <IconUpload size={14} /> Import
              </button>
              <button onClick={exportToCSV} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-sm font-medium bg-white/5 hover:bg-white/10 text-warm-400 transition-all duration-200">
                <IconDownload size={14} /> Export
              </button>
            </div>
          )}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[#1C1917] border border-white/20 flex items-center justify-center text-warm-400 hover:text-white transition-all duration-200 shadow-lg"
        >
          {sidebarCollapsed ? <IconChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* ═══════════════════ Main Content ═══════════════════ */}
      <main className={cn(
        'flex-1 flex flex-col min-h-screen transition-all duration-300',
        'pt-12 lg:pt-0',
        sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]'
      )}>
        {/* Top Bar */}
        <header className="sticky top-12 lg:top-0 z-30 bg-white/70 backdrop-blur-xl border-b border-white/20 px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-warm-900">{TABS.find(t => t.id === activeTab)?.label}</h2>
              <p className="text-sm text-warm-500 mt-0.5 hidden sm:block">{TABS.find(t => t.id === activeTab)?.description}</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 border border-white/30 shadow-glass-sm">
                <IconUsers size={14} className="text-warm-500" />
                <span className="text-sm font-bold text-warm-800 tabular-nums">{stats.total}</span>
                <span className="text-xs text-warm-500 hidden sm:inline">coaches</span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 border border-white/30 shadow-glass-sm">
                <IconTrendingUp size={14} className="text-primary-500" />
                <span className="text-sm font-bold text-warm-800 tabular-nums">{stats.inPipeline}</span>
                <span className="text-xs text-warm-500">in pipeline</span>
              </div>
              {stats.followUpsDue > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200/50">
                  <IconClock size={14} className="text-amber-600" />
                  <span className="text-sm font-bold text-amber-700 tabular-nums">{stats.followUpsDue}</span>
                  <span className="text-xs text-amber-600 hidden sm:inline">due</span>
                </div>
              )}
              {stats.hot > 0 && (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200/50">
                  <IconFlame size={14} className="text-orange-600" />
                  <span className="text-sm font-bold text-orange-700 tabular-nums">{stats.hot}</span>
                  <span className="text-xs text-orange-600">hot</span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6 bg-[#FFFEFA]">
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
              <div className="rounded-2xl overflow-clip glass-standard">
                <CoachTable
                  coaches={filteredCoaches}
                  loading={loading}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  onStatusChange={handleStatusChange}
                  onToggleStar={toggleStar}
                  onCoachClick={handleCoachClick}
                  onLogContact={handleLogContact}
                  statusConfig={STATUS_CONFIG}
                  priorityConfig={PRIORITY_CONFIG}
                  coachEngagement={engagementMap}
                />
              </div>
            </div>
          )}

          {/* ── Pipeline Tab ── */}
          {activeTab === 'pipeline' && (
            <PipelineView
              coaches={allCoaches}
              onCoachClick={handleCoachClick}
              onStatusChange={handleStatusChange}
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
                coaches={filteredCoaches}
                loading={loading}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onCoachClick={handleCoachClick}
                onStatusChange={handleStatusChange}
                onToggleStar={toggleStar}
                onLogContact={handleLogContact}
                statusConfig={STATUS_CONFIG}
                priorityConfig={PRIORITY_CONFIG}
              />
            </div>
          )}

          {/* ── Email Tab ── */}
          {activeTab === 'email' && <EmailTrackingView />}

          {/* ── Resend Tab ── */}
          {activeTab === 'resend' && <ResendActivityView onSendFollowup={handleSendFollowup} />}

          {/* ── Inbound Tab ── */}
          {activeTab === 'inbound' && <InboundLeadsView />}

          {/* ── Inbox Tab (NEW — Phase 3 P3-A) ── */}
          {activeTab === 'inbox' && <InboxView />}

          {/* ── Sequences Tab (NEW — Phase 2) ── */}
          {activeTab === 'sequences' && <SequencesTabWrapper />}

          {/* ── Insights Tab (NEW — Phase 3 P3-B) ── */}
          {activeTab === 'insights' && <InsightsDashboard />}

          {/* ── Settings Tab (NEW — Phase 1.5 + Phase 4) ──
              Two-section settings page: automations rules + suppression list. */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <AutomationsList />
              <SuppressionsAdminPanel />
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

      {/* FAB removed — actions available via sidebar + toolbar */}

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
      {showBulkEmailModal && (bulkEmailCoaches.length > 0 || followupRecipients.length > 0) && (
        <BulkEmailModal
          coaches={bulkEmailCoaches}
          prefilledRecipients={followupRecipients}
          onClose={() => {
            setShowBulkEmailModal(false);
            setBulkEmailCoaches([]);
            setFollowupRecipients([]);
          }}
          onSuccess={() => { setSelectedIds(new Set()); refreshData(); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// SequencesTabWrapper — local state holder for the Sequences tab. Mirrors the
// layout of /golf/admin/crm/sequences/page.tsx (selectable list + inline
// builder) without forcing a separate route. The dedicated /sequences route
// stays as a deep-link target.
// ============================================================================
function SequencesTabWrapper() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-6">
      <SequencesList
        selectedId={selectedId}
        onSelect={setSelectedId}
        refreshKey={refreshKey}
      />
      {selectedId && (
        <SequenceBuilder
          sequenceId={selectedId}
          onChange={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
