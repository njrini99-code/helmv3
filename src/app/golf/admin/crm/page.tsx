'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import {
  IconChartBar,
  IconChevronRight,
  IconPlus,
  IconUpload,
  IconDownload,
  IconUsers,
  IconTrendingUp,
  IconClock,
  IconClock3,
  IconFlame,
  IconTarget,
  IconWarning,
  IconMail,
  IconSend,
  IconMessage,
  IconMessageSquare,
  IconGauge,
  IconActivity,
  IconLayers,
  IconSettings,
  IconClipboardList as ClipboardList,
  IconLayoutGrid as LayoutDashboard,
  IconArrowLeft as ArrowLeft,
  IconChevronLeft as ChevronLeft,
  IconBuilding as Building2,
  IconMoreHorizontal,
  IconX,
  IconUser,
  IconFileText,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  type CoachStatus,
  type Coach,
  PIPELINE_STAGES,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  AUTO_FOLLOWUP_DAYS,
  CRM_ASSIGNEES,
  type CrmAssignee,
} from './crm-config';
import { CRMDashboard } from './components/CRMDashboard';
import { TodayQueue } from './components/TodayQueue';
import { CoachTable } from './components/CoachTable';
import { PipelineView } from './components/PipelineView';
import { ConferenceGroupView } from './components/ConferenceGroupView';
import { CoachFilters, type Filters } from './components/CoachFilters';
import { AddCoachModal } from './components/AddCoachModal';
import { CoachDetailPanel } from './components/CoachDetailPanel';
import { CrmCommandPalette } from './components/CrmCommandPalette';
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
import { TemplateManager } from './components/TemplateManager';
import { InsightsDashboard } from './components/insights/InsightsDashboard';
import { AutomationsList } from './components/automations/AutomationsList';
import { SuppressionsAdminPanel } from './components/suppressions/SuppressionsAdminPanel';
import type { CRMEvent } from './components/CalendarView';
import { getCoachEngagement } from '@/app/golf/actions/crm-engagement';
import { getCoachSequenceEnrollmentStatuses, type CoachEnrollmentSummary } from '@/app/golf/actions/crm-sequences';
import { logManualGmailTouch } from '@/app/golf/actions/crm-manual-send';
import { setCoachAssignee } from '@/app/golf/actions/crm-assignee';
import { mergeTemplate, buildGmailComposeUrl } from '@/lib/crm/gmail-compose';
import type { CoachEngagement } from './types/foundations';
import { Button, IconButton } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';

// ============================================================================
// SIDEBAR TABS
// ============================================================================
// Flat list of every NAVIGABLE destination, each with a STABLE id, a fixed
// keyboard shortcut, and a section it belongs to. Shortcuts are bound to ids
// (not array position) so regrouping/reordering never silently re-points a
// key. The four legacy email surfaces (email/resend/insights/inbound) are NOT
// nav destinations anymore — they live as sub-tabs inside the single
// "outreach" destination (see OUTREACH_SUBTABS below).
const TABS = [
  // ── WORK ──
  { id: 'today', label: 'Today', Icon: IconClock3, shortcut: '1', description: "Today's ranked call & email worklist", section: 'work' },
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, shortcut: '2', description: 'Pipeline overview & quick actions', section: 'work' },
  { id: 'list', label: 'Coaches', Icon: ClipboardList, shortcut: '3', description: 'All coaches in table view', section: 'work' },
  { id: 'pipeline', label: 'Pipeline', Icon: IconLayers, shortcut: '4', description: 'Kanban sales pipeline', section: 'work' },
  { id: 'conferences', label: 'Conferences', Icon: Building2, shortcut: '5', description: 'Grouped by conference', section: 'work' },
  { id: 'outreach', label: 'Outreach', Icon: IconMail, shortcut: '6', description: 'Email tracking, deliverability, analytics & replies', section: 'work' },
  { id: 'inbox', label: 'Inbox', Icon: IconMessageSquare, shortcut: '7', description: 'Replies + tasks due today', section: 'work' },
  // ── AUTOMATE ──
  { id: 'sequences', label: 'Sequences', Icon: IconActivity, shortcut: '8', description: 'Drip campaigns & enrollments', section: 'automate' },
  { id: 'templates', label: 'Templates', Icon: IconFileText, shortcut: '9', description: 'Author, preview & test reusable emails', section: 'automate' },
  // ── ADMIN ──
  { id: 'settings', label: 'Settings', Icon: IconSettings, shortcut: 'S', description: 'Automations & suppressions', section: 'admin' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// Labeled sidebar sections, rendered in this order with an uppercase eyebrow.
const NAV_SECTIONS = [
  { id: 'work', label: 'Work' },
  { id: 'automate', label: 'Automate' },
  { id: 'admin', label: 'Admin' },
] as const;

// ── Outreach sub-tabs ──
// The four legacy email surfaces, merged behind a horizontal sub-tab switcher
// inside the Outreach panel. Each renders the exact same component as before.
const OUTREACH_SUBTABS = [
  { id: 'email', label: 'Tracking', Icon: IconSend },
  { id: 'resend', label: 'Deliverability', Icon: IconGauge },
  { id: 'insights', label: 'Analytics', Icon: IconChartBar },
  { id: 'inbound', label: 'Replies', Icon: IconMessage },
] as const;

type OutreachSubTabId = (typeof OUTREACH_SUBTABS)[number]['id'];

// ── Mobile bottom tab bar ──
// Below `lg` the dark desktop sidebar is hidden and replaced by a fixed,
// safe-area-aware bottom tab bar. It surfaces the four highest-traffic
// destinations directly, plus a "More" entry that opens a sheet listing the
// rest — so every sidebar destination stays reachable on mobile. Ids reference
// the same stable TabId values, so tapping a bar item calls setActiveTab
// exactly like the sidebar.
const MOBILE_BAR_TABS = ['today', 'list', 'outreach', 'sequences'] as const;
// Destinations that live behind the "More" sheet (everything not on the bar).
const MOBILE_MORE_TABS = ['dashboard', 'pipeline', 'conferences', 'inbox', 'settings'] as const;

// ── "Open in Gmail" manual-send ──
// The minimal shape we need from a crm_email_templates row to merge + compose.
type ManualGmailTemplate = { id: string; name: string; subject: string; body: string };
// localStorage key for the currently-armed Gmail template (survives reloads).
const MANUAL_GMAIL_TEMPLATE_KEY = 'crm_manual_gmail_template';

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
  const [activeTab, setActiveTabState] = useState<TabId>('today');

  // Active sub-tab within the merged Outreach panel. Kept in local state and
  // mirrored to the URL via ?outreach= (same history.replaceState pattern as
  // the main tab) so deep links land on the right surface.
  const [outreachSubTab, setOutreachSubTabState] = useState<OutreachSubTabId>('email');

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
    primaryOnly: false,
    queueStatus: 'all',
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [conferences, setConferences] = useState<string[]>([]);
  // Compact "Assignee" scope for the Coaches toolbar. 'all' = no filter,
  // 'unassigned' = assigned_to is null, otherwise an exact assignee-label match.
  // Held in local state only; CoachFilters' contract is unchanged.
  const [assigneeScope, setAssigneeScope] = useState<'all' | 'unassigned' | CrmAssignee>('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Mobile "More" sheet (lists the destinations not on the bottom tab bar).
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  // ⌘K / Ctrl+K command palette.
  const [cmdkOpen, setCmdkOpen] = useState(false);

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
  const [sequenceEnrollmentMap, setSequenceEnrollmentMap] = useState<Record<string, CoachEnrollmentSummary>>({});

  // ── "Open in Gmail" manual-send ──
  // The operator arms ONE email template; it's then merged per-coach and opened
  // in a Gmail compose window when they click "Gmail" on a row / in the detail
  // panel. The armed template persists across reloads via localStorage (read in
  // an effect, NOT the initializer, to avoid SSR/CSR hydration drift).
  const [activeManualTemplate, setActiveManualTemplate] = useState<ManualGmailTemplate | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<ManualGmailTemplate[]>([]);
  const manualTemplateHydrated = useRef(false);

  const supabase = createClient();

  // ============================================================================
  // TAB NAVIGATION
  // ============================================================================
  // Stable id→tab lookup so the mobile bar / More sheet can resolve a TabId to
  // its label + Icon without re-scanning TABS on every render.
  const tabsById = useMemo(
    () => new Map(TABS.map((t) => [t.id, t] as const)),
    [],
  );

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

  // Switch the active Outreach sub-tab and mirror it to ?outreach= so deep
  // links to a specific email surface still work.
  const setOutreachSubTab = useCallback((sub: OutreachSubTabId) => {
    setOutreachSubTabState(sub);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('outreach', sub);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, []);

  // Register the keyboard shortcut once, using a ref so we don't churn
  // listeners on every tab change. Shortcuts bind to STABLE tab ids via a
  // key→id lookup (not array index) so regrouping never re-points a key.
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      // Match against each tab's declared shortcut (case-insensitive for the
      // letter shortcut, e.g. "S" for Settings).
      const match = TABS.find((t) => t.shortcut.toLowerCase() === e.key.toLowerCase());
      if (match) {
        setActiveTab(match.id);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab]);

  // ⌘K / Ctrl+K toggles the command palette globally (works from any field).
  useEffect(() => {
    function handleCmdK(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', handleCmdK);
    return () => window.removeEventListener('keydown', handleCmdK);
  }, []);

  // If searchParams (deep-link) changes to a different tab — e.g. the user
  // uses back/forward — sync local state to match. This does not trigger
  // for the normal setActiveTab path since we only use history.replaceState.
  useEffect(() => {
    const urlTab = searchParams.get('tab') as TabId | null;
    if (urlTab && TABS.some((t) => t.id === urlTab) && urlTab !== activeTabRef.current) {
      setActiveTabState(urlTab);
    }
    // Promote a deep-linked Outreach sub-tab as well.
    const urlSub = searchParams.get('outreach') as OutreachSubTabId | null;
    if (urlSub && OUTREACH_SUBTABS.some((s) => s.id === urlSub)) {
      setOutreachSubTabState(urlSub);
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
    'role_level',
    'is_primary_contact',
    'assigned_to',
    'created_at',
    'updated_at',
  ].join(', ');

  const fetchAllCoaches = useCallback(async () => {
    try {
      // Paginate: PostgREST caps a single response at 1000 rows, so the old
      // unbounded .select() silently returned only the first 1000 of ~2,300
      // coaches (and the lowest-priority cold leads at that), making every
      // count/funnel/list wrong. fetchAllRowsResult pages through all rows.
      // A final .order('id') tiebreaker keeps pagination deterministic.
      const { data } = await fetchAllRowsResult((from, to) =>
        supabase
          .from('crm_coaches')
          .select(CRM_COACHES_LIST_COLUMNS)
          // Hide archived rows from the main list. NULL-safe: legacy rows with
          // is_archived = NULL must still appear, so we match NULL OR false
          // explicitly. (Do NOT use .neq('is_archived', true) — Postgres
          // three-valued logic evaluates NULL <> true as UNKNOWN and would
          // wrongly drop the NULL rows.)
          .or('is_archived.is.null,is_archived.eq.false')
          .order('is_starred', { ascending: false })
          .order('priority', { ascending: false })
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to));
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
        role_level: c.role_level ?? null,
        is_primary_contact: c.is_primary_contact ?? false,
        assigned_to: c.assigned_to ?? null,
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
      if (assigneeScope !== 'all') {
        if (assigneeScope === 'unassigned') {
          if (c.assigned_to != null) continue;
        } else if (c.assigned_to !== assigneeScope) {
          continue;
        }
      }
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
      if (filters.primaryOnly && !c.is_primary_contact) continue;
      if (filters.queueStatus && filters.queueStatus !== 'all') {
        const enr = sequenceEnrollmentMap[c.id];
        if (filters.queueStatus === 'queued' && !(enr && enr.status === 'active' && (enr.current_step ?? 0) === 0)) continue;
        if (filters.queueStatus === 'sent' && !(enr && enr.status === 'active' && (enr.current_step ?? 0) >= 1)) continue;
        if (filters.queueStatus === 'done' && !(enr && enr.status === 'completed')) continue;
      }
      result.push(c);
    }

    // Sort: starred first, then by priority desc, then by updated_at desc
    result.sort((a, b) => {
      if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return (b.updated_at || '').localeCompare(a.updated_at || '');
    });

    return result;
  }, [allCoaches, filters, sequenceEnrollmentMap, assigneeScope]);

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

  // Per-coach sequence enrollment status -> the "Queued / Step N / Done" badge on
  // the Coaches + Conferences lists, so teammates working the list by hand don't
  // double-touch anyone. Mirrors the engagement fetch above.
  useEffect(() => {
    if (!allCoaches.length) {
      setSequenceEnrollmentMap({});
      return;
    }
    let cancelled = false;
    const ids = allCoaches.map((c) => c.id);
    getCoachSequenceEnrollmentStatuses(ids)
      .then((map) => {
        if (!cancelled) setSequenceEnrollmentMap(map);
      })
      .catch((err) => {
        console.warn('[crm] enrollment fetch failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [allCoaches]);

  // ── "Open in Gmail": hydrate the armed template from localStorage on mount ──
  // Read in an effect (not the useState initializer) so server + first client
  // render agree; the ref guards the persist effect below from clobbering
  // localStorage with `null` before this hydration runs.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MANUAL_GMAIL_TEMPLATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ManualGmailTemplate>;
        if (parsed && parsed.id && typeof parsed.subject === 'string' && typeof parsed.body === 'string') {
          setActiveManualTemplate({
            id: parsed.id,
            name: parsed.name ?? 'Template',
            subject: parsed.subject,
            body: parsed.body,
          });
        }
      }
    } catch {
      /* corrupt / unavailable storage — start unarmed */
    }
    manualTemplateHydrated.current = true;
  }, []);

  // Persist the armed template whenever it changes (after hydration).
  useEffect(() => {
    if (!manualTemplateHydrated.current) return;
    try {
      if (activeManualTemplate) {
        window.localStorage.setItem(MANUAL_GMAIL_TEMPLATE_KEY, JSON.stringify(activeManualTemplate));
      } else {
        window.localStorage.removeItem(MANUAL_GMAIL_TEMPLATE_KEY);
      }
    } catch {
      /* storage unavailable — non-fatal, template just won't persist */
    }
  }, [activeManualTemplate]);

  // Fetch the email templates once (id/name/subject/body) for the Gmail-template
  // selector. Reuses the page's supabase client. text + html formats both work
  // for a Gmail compose body (the body is plain text either way).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: tplError } = await supabase
        .from('crm_email_templates')
        .select('id, name, subject, body, format')
        .order('name', { ascending: true });
      if (cancelled) return;
      if (tplError) {
        console.warn('[crm] email template fetch failed:', tplError.message);
        return;
      }
      const rows = (data ?? []) as Array<{ id: string; name: string | null; subject: string | null; body: string | null }>;
      setEmailTemplates(
        rows.map((t) => ({
          id: t.id,
          name: t.name ?? 'Untitled template',
          subject: t.subject ?? '',
          body: t.body ?? '',
        })),
      );
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // Keep the armed template in sync with the latest DB content. The armed copy is
  // hydrated from localStorage (and may be stale if the template was edited after
  // arming, now that templates are editable in the Template Manager). When the
  // fresh list loads, refresh the armed template's subject/body/name by id so
  // "Open in Gmail" always composes from the current template. The equality guard
  // prevents a render loop.
  useEffect(() => {
    if (!activeManualTemplate || emailTemplates.length === 0) return;
    const fresh = emailTemplates.find((t) => t.id === activeManualTemplate.id);
    if (!fresh) return; // template deleted — keep the last-known copy usable
    if (
      fresh.subject !== activeManualTemplate.subject ||
      fresh.body !== activeManualTemplate.body ||
      fresh.name !== activeManualTemplate.name
    ) {
      setActiveManualTemplate(fresh);
    }
  }, [emailTemplates, activeManualTemplate]);

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
      // `assigned_to` lives on the Coach type (lane A) but isn't in the
      // generated crm_coaches Update type until its migration regenerates the
      // DB types; these paths never set it, so strip it for the typed update.
      const { error: updateError } = await supabase
        .from('crm_coaches')
        .update(finalUpdates as Omit<Partial<Coach>, 'assigned_to'>)
        .eq('id', coachId);
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
      const { error: updateError } = await supabase
        .from('crm_coaches')
        .update(finalUpdates as Omit<Partial<Coach>, 'assigned_to'>)
        .in('id', ids);
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

  // ── "Open in Gmail" ──
  // Merge the armed template for this coach, open a pre-filled Gmail compose
  // window, then optimistically log the touch (last_contacted_at = now; promote
  // new_lead → contacted) and fire the server-side log so the contact-log row +
  // 7-day cap stay consistent with the automated batch.
  // Build the Gmail compose URL (subject + body merged from the armed template).
  // Returned as a real URL so the Gmail action can be a true <a href> — a link
  // navigates reliably even under browser automation (e.g. Claude for Chrome),
  // whereas a programmatic window.open() is dropped/blanked by the popup blocker
  // when the click isn't a trusted user gesture, so the personalized params
  // never reach the compose tab.
  const getGmailHref = useCallback((coach: Coach): string | null => {
    if (!activeManualTemplate || !coach.email) return null;
    const subject = mergeTemplate(activeManualTemplate.subject, coach);
    const body = mergeTemplate(activeManualTemplate.body, coach);
    return buildGmailComposeUrl({ to: coach.email, subject, body });
  }, [activeManualTemplate]);

  // Log a Gmail touch (contact-log + optimistic status flip + toast). Called on
  // click; the <a href> itself opens the compose tab. Safe to run under automation.
  const logGmailTouch = useCallback((coach: Coach) => {
    if (!activeManualTemplate || !coach.email) return;
    const subject = mergeTemplate(activeManualTemplate.subject, coach);
    logManualGmailTouch({ coach_id: coach.id, subject }).catch(() => {});

    const nowIso = new Date().toISOString();
    setAllCoaches((prev) =>
      prev.map((c) =>
        c.id === coach.id
          ? {
              ...c,
              last_contacted_at: nowIso,
              updated_at: nowIso,
              status: c.status === 'new_lead' ? ('contacted' as Coach['status']) : c.status,
            }
          : c,
      ),
    );
    if (selectedCoach?.id === coach.id) {
      setSelectedCoach((prev) =>
        prev
          ? {
              ...prev,
              last_contacted_at: nowIso,
              updated_at: nowIso,
              status: prev.status === 'new_lead' ? ('contacted' as Coach['status']) : prev.status,
            }
          : prev,
      );
    }
    toast.success(`Opened Gmail for ${coach.name} — logged as contacted`);
  }, [activeManualTemplate, selectedCoach]);

  // Button fallback for surfaces still using a <button> (CoachTable / detail
  // panel): programmatic open + log. Manual clicks carry the user gesture so the
  // popup is allowed there.
  const openInGmail = useCallback((coach: Coach) => {
    if (!activeManualTemplate) {
      toast('Arm a Gmail template first');
      return;
    }
    if (!coach.email) {
      toast('No email on file');
      return;
    }
    const href = getGmailHref(coach);
    if (href) window.open(href, '_blank', 'noopener');
    logGmailTouch(coach);
  }, [activeManualTemplate, getGmailHref, logGmailTouch]);

  // ── Assignee labels ──
  // Set (or clear) the manual work-division label on a coach. Optimistic local
  // update; the server action persists assigned_to + the frequency cap still
  // owns double-touch prevention. On failure we re-fetch to resync truth.
  const handleSetAssignee = useCallback(
    async (coachId: string, assignee: CrmAssignee | null) => {
      setAllCoaches((prev) =>
        prev.map((c) => (c.id === coachId ? { ...c, assigned_to: assignee } : c)),
      );
      // Read the open-panel guard from inside the updater so we don't close over
      // `selectedCoach` (keeps the handler ref stable, no extra dep needed).
      setSelectedCoach((prev) =>
        prev && prev.id === coachId ? { ...prev, assigned_to: assignee } : prev,
      );
      const { ok } = await setCoachAssignee({ coach_id: coachId, assignee });
      if (!ok) {
        toast.error('Failed to update assignee');
        fetchAllCoaches();
      }
    },
    [fetchAllCoaches],
  );

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
        // Soft archive (recoverable) instead of a hard delete. Admin-only
        // surface (behind admin/layout.tsx role check), so window.confirm is
        // acceptable here — no demo accounts reach this code path.
        const confirmed = window.confirm(
          `Archive ${ids.length} selected coach${ids.length === 1 ? '' : 'es'}? ` +
            `This hides them from the list but does NOT permanently delete them — ` +
            `archived coaches can be recovered.`,
        );
        if (!confirmed) return;
        await supabase.from('crm_coaches').update({ is_archived: true }).in('id', ids);
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
      <div className="min-h-dvh bg-[#FFFEF8] flex items-center justify-center p-8">
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/20 shadow-glass p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <IconWarning size={28} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-warm-900 mb-2">Error Loading CRM</h2>
          <p className="text-warm-600 mb-6">{error}</p>
          <Button variant="primary"
            onClick={() => { setError(null); fetchAllCoaches(); }}
            className="px-6 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-medium transition-all duration-200 shadow-sm"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="min-h-dvh bg-[#FFFEF8] flex">
      {/* ═══════════════════ Mobile Header ═══════════════════ */}
      {/* Below lg the dark sidebar is hidden; navigation moves to the fixed
          bottom tab bar (see below). This top header keeps only the back link,
          the active destination's label, and the Import / Export / Add actions
          so we don't double up on navigation. */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#1C1917]/95 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-2 px-3 h-12">
          <a href="/golf/admin" aria-label="Back to admin dashboard" className="flex-shrink-0 p-1.5 rounded-lg text-warm-400 hover:text-white transition-all duration-200">
            <ArrowLeft size={16} />
          </a>
          <span className="flex-1 min-w-0 truncate font-semibold text-sm text-white">
            {tabsById.get(activeTab)?.label}
          </span>
          {/* Import / Export — surfaced on mobile (desktop has them in the sidebar) */}
          <IconButton variant="default" aria-label="Import coaches"
            onClick={() => setShowImportModal(true)}
            className="flex-shrink-0 p-1.5 rounded-xl text-warm-400 hover:text-white hover:bg-white/10 transition-all duration-200"
          >
            <IconUpload size={16} />
          </IconButton>
          <IconButton variant="default" aria-label="Export CSV"
            onClick={exportToCSV}
            className="flex-shrink-0 p-1.5 rounded-xl text-warm-400 hover:text-white hover:bg-white/10 transition-all duration-200"
          >
            <IconDownload size={16} />
          </IconButton>
          <IconButton variant="primary" aria-label="Add"
            onClick={() => setShowAddModal(true)}
            className="flex-shrink-0 p-1.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition-all duration-200 shadow-sm"
          >
            <IconPlus size={16} />
          </IconButton>
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
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
            <IconTarget size={18} className="text-white" />
          </div>
          {!sidebarCollapsed && <span className="font-bold text-lg text-white tracking-tight">Coach CRM</span>}
        </div>

        {/* Back to Dashboard */}
        <div className="px-3 mb-2">
          <a href="/golf/admin" className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md',
            'text-warm-400 hover:bg-white/5 hover:text-white transition-all duration-200',
            sidebarCollapsed && 'justify-center'
          )}>
            <ArrowLeft size={16} className="flex-shrink-0" />
            {!sidebarCollapsed && <span className="text-sm font-medium">Dashboard</span>}
          </a>
        </div>

        {/* Section Divider */}
        <div className="mx-3 border-t border-white/10" />

        {/* Navigation Tabs — grouped into labeled sections (WORK / AUTOMATE /
            ADMIN). Each section renders an uppercase eyebrow above its items
            (hidden when the sidebar is collapsed, where icons stand alone). */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {NAV_SECTIONS.map((sectionDef, sectionIdx) => {
            const sectionTabs = TABS.filter((t) => t.section === sectionDef.id);
            if (sectionTabs.length === 0) return null;
            return (
              <div key={sectionDef.id} className={cn(sectionIdx > 0 && 'mt-4')}>
                {!sidebarCollapsed ? (
                  <div className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-wider text-warm-500">
                    {sectionDef.label}
                  </div>
                ) : (
                  sectionIdx > 0 && <div className="mx-1 mb-2 border-t border-white/10" />
                )}
                <div className="space-y-1">
                  {sectionTabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const TabIcon = tab.Icon;
                    return (
                      <Button variant="ghost"
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        aria-label={tab.label}
                        aria-current={isActive ? 'page' : undefined}
                        title={sidebarCollapsed ? tab.label : undefined}
                        className={cn(
                          'group relative flex items-center gap-3 w-full rounded-md transition-all duration-200',
                          sidebarCollapsed ? 'justify-center p-3' : 'px-3 py-2.5',
                          isActive ? 'bg-white/10 text-white' : 'text-warm-400 hover:bg-white/5 hover:text-white'
                        )}
                      >
                        {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-500 rounded-r-full" />}
                        <TabIcon size={20} className={cn('flex-shrink-0', isActive ? 'text-primary-400' : 'text-warm-400 group-hover:text-white')} />
                        {!sidebarCollapsed && <span className="text-sm font-medium flex-1 text-left">{tab.label}</span>}
                        {!sidebarCollapsed && (
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', isActive ? 'bg-primary-500/20 text-primary-400' : 'bg-white/5 text-warm-500')}>
                            {tab.shortcut}
                          </span>
                        )}
                        {sidebarCollapsed && (
                          <div aria-hidden className="absolute left-full ml-3 px-3 py-1.5 bg-warm-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                            {tab.label}
                          </div>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Saved segments rail (Stream C) */}
        <SavedSegmentsRail
          filters={filters}
          setFilters={setFilters}
          collapsed={sidebarCollapsed}
        />

        {/* Action Buttons */}
        <div className="p-3 border-t border-white/10 space-y-2">
          <Button variant="primary"
            onClick={() => setShowAddModal(true)}
            aria-label="Add coach"
            title={sidebarCollapsed ? 'Add coach' : undefined}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-md font-medium transition-all duration-200',
              'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700'
            )}
          >
            <IconPlus size={16} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>Add Coach</span>}
          </Button>
          {!sidebarCollapsed && (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowImportModal(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium bg-white/5 hover:bg-white/10 text-warm-400 transition-all duration-200">
                <IconUpload size={14} /> Import
              </Button>
              <Button variant="ghost" onClick={exportToCSV} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium bg-white/5 hover:bg-white/10 text-warm-400 transition-all duration-200">
                <IconDownload size={14} /> Export
              </Button>
            </div>
          )}
        </div>

        {/* Collapse Toggle */}
        <Button variant="ghost"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[#1C1917] border border-white/20 flex items-center justify-center text-warm-400 hover:text-white transition-all duration-200 shadow-lg"
        >
          {sidebarCollapsed ? <IconChevronRight size={14} /> : <ChevronLeft size={14} />}
        </Button>
      </aside>

      {/* ═══════════════════ Main Content ═══════════════════ */}
      <main className={cn(
        // min-w-0 is REQUIRED: as a flex child, <main> defaults to min-width:auto
        // and won't shrink below its content's intrinsic width, so a wide
        // descendant (tables, charts, long subjects) pushed the whole panel past
        // the mobile viewport — the right-edge clipping seen on phones.
        'flex-1 min-w-0 flex flex-col min-h-dvh transition-all duration-300',
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

        {/* Content Area — extra bottom padding below lg so the fixed mobile
            bottom tab bar (~64px + safe-area inset) never covers content. */}
        <div className="flex-1 overflow-auto p-3 sm:p-5 lg:p-6 bg-cream-100 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6">
          {/* ── Today Work Queue (DEFAULT) ── */}
          {activeTab === 'today' && (
            <div className="space-y-4">
              <ManualGmailTemplateBar
                templates={emailTemplates}
                active={activeManualTemplate}
                onChange={setActiveManualTemplate}
              />
              <TodayQueue
                coaches={allCoaches}
                onCoachClick={handleCoachClick}
                onOpenInGmail={logGmailTouch}
                getGmailHref={getGmailHref}
                onLogTouch={handleLogContact}
                onSetAssignee={handleSetAssignee}
                manualTemplateArmed={!!activeManualTemplate}
                enrollmentMap={sequenceEnrollmentMap}
              />
            </div>
          )}

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
              <div className="flex flex-wrap items-center gap-2">
                <ManualGmailTemplateBar
                  templates={emailTemplates}
                  active={activeManualTemplate}
                  onChange={setActiveManualTemplate}
                />
                <AssigneeScopeBar scope={assigneeScope} onChange={setAssigneeScope} />
              </div>
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
                  coachEnrollments={sequenceEnrollmentMap}
                  onOpenInGmail={openInGmail}
                  manualTemplateArmed={!!activeManualTemplate}
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
              <ManualGmailTemplateBar
                templates={emailTemplates}
                active={activeManualTemplate}
                onChange={setActiveManualTemplate}
              />
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
                coachEnrollments={sequenceEnrollmentMap}
              />
            </div>
          )}

          {/* ── Outreach Tab ── merges the four email surfaces (Tracking /
              Deliverability / Analytics / Replies) behind a horizontal
              sub-tab switcher. Each sub-tab renders the exact same component
              as before, with identical props. */}
          {activeTab === 'outreach' && (
            <div className="space-y-4">
              <div
                role="tablist"
                aria-label="Outreach views"
                className="flex items-center gap-1 overflow-x-auto scrollbar-hide rounded-2xl glass-standard p-1.5"
              >
                {OUTREACH_SUBTABS.map((sub) => {
                  const isActive = outreachSubTab === sub.id;
                  const SubIcon = sub.Icon;
                  return (
                    <Button variant="ghost"
                      key={sub.id}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setOutreachSubTab(sub.id)}
                      className={cn(
                        'flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200',
                        isActive
                          ? 'bg-primary-50 text-primary-700 shadow-glass-sm'
                          : 'text-warm-500 hover:text-warm-900 hover:bg-white/60'
                      )}
                    >
                      <SubIcon size={16} className={cn('flex-shrink-0', isActive ? 'text-primary-600' : 'text-warm-400')} aria-hidden />
                      {sub.label}
                    </Button>
                  );
                })}
              </div>
              {outreachSubTab === 'email' && <EmailTrackingView />}
              {outreachSubTab === 'resend' && <ResendActivityView onSendFollowup={handleSendFollowup} />}
              {outreachSubTab === 'insights' && <InsightsDashboard />}
              {outreachSubTab === 'inbound' && <InboundLeadsView />}
            </div>
          )}

          {/* ── Inbox Tab (NEW — Phase 3 P3-A) ── */}
          {activeTab === 'inbox' && <InboxView />}

          {/* ── Sequences Tab (NEW — Phase 2) ── */}
          {activeTab === 'sequences' && <SequencesTabWrapper />}

          {/* ── Templates Tab — in-app email template lifecycle ── */}
          {activeTab === 'templates' && <TemplateManager />}

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

      {/* ═══════════════════ Mobile Bottom Tab Bar ═══════════════════ */}
      {/* Hidden at lg+ (desktop uses the sidebar). Fixed to the bottom, glass,
          safe-area-inset aware. Surfaces the four core destinations plus a
          "More" entry that opens a sheet for the rest. Tapping a bar item calls
          setActiveTab exactly like the sidebar. */}
      <nav
        aria-label="Primary"
        className={cn(
          'lg:hidden fixed bottom-0 left-0 right-0 z-40',
          'bg-white/80 backdrop-blur-xl border-t border-white/30 shadow-glass',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <div className="flex items-stretch justify-around h-16 px-1">
          {MOBILE_BAR_TABS.map((id) => {
            const tab = tabsById.get(id);
            if (!tab) return null;
            const isActive = activeTab === id;
            const TabIcon = tab.Icon;
            return (
              <Button
                variant="ghost"
                key={id}
                onClick={() => setActiveTab(id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl px-1 transition-colors duration-200',
                  isActive ? 'text-primary-600' : 'text-warm-500 hover:text-warm-900',
                )}
              >
                <TabIcon size={22} className="flex-shrink-0" />
                <span className="text-[10px] font-medium leading-none">{tab.label}</span>
              </Button>
            );
          })}
          {/* More — opens the sheet listing the remaining destinations. Active
              when any "More" destination is the current tab. */}
          {(() => {
            const moreActive = (MOBILE_MORE_TABS as readonly string[]).includes(activeTab);
            return (
              <Button
                variant="ghost"
                onClick={() => setMoreSheetOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={moreSheetOpen}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl px-1 transition-colors duration-200',
                  moreActive || moreSheetOpen ? 'text-primary-600' : 'text-warm-500 hover:text-warm-900',
                )}
              >
                <IconMoreHorizontal size={22} className="flex-shrink-0" />
                <span className="text-[10px] font-medium leading-none">More</span>
              </Button>
            );
          })()}
        </div>
      </nav>

      {/* Mobile "More" sheet — lists the destinations not on the bottom bar so
          every sidebar destination stays reachable on mobile. */}
      {moreSheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More destinations">
          <IconButton
            variant="default"
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreSheetOpen(false)}
            className="absolute inset-0 bg-warm-900/40 backdrop-blur-sm cursor-default"
          >
            <span className="sr-only">Close menu</span>
          </IconButton>
          <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-white/30 rounded-t-2xl shadow-glass pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold text-warm-900">More</h2>
              <IconButton
                variant="default"
                aria-label="Close menu"
                onClick={() => setMoreSheetOpen(false)}
                className="p-1.5 rounded-xl text-warm-500 hover:text-warm-900 hover:bg-warm-100/60 transition-colors duration-200"
              >
                <IconX size={18} />
              </IconButton>
            </div>
            <div className="px-3 pb-4 grid grid-cols-2 gap-2">
              {MOBILE_MORE_TABS.map((id) => {
                const tab = tabsById.get(id);
                if (!tab) return null;
                const isActive = activeTab === id;
                const TabIcon = tab.Icon;
                return (
                  <Button
                    variant="ghost"
                    key={id}
                    onClick={() => { setActiveTab(id); setMoreSheetOpen(false); }}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors duration-200',
                      isActive
                        ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200'
                        : 'text-warm-700 hover:bg-warm-100/60',
                    )}
                  >
                    <TabIcon size={20} className={cn('flex-shrink-0', isActive ? 'text-primary-600' : 'text-warm-400')} />
                    <span className="flex-1 min-w-0 truncate">{tab.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ Overlays ═══════════════════ */}

      {/* ⌘K / Ctrl+K command palette */}
      <CrmCommandPalette
        open={cmdkOpen}
        onOpenChange={setCmdkOpen}
        destinations={TABS.map((t) => ({ id: t.id, label: t.label }))}
        onNavigate={(id) => setActiveTab(id as TabId)}
        onNewCoach={() => setShowAddModal(true)}
        onCompose={() => {
          // Mirror the bulk "email" action: seed the composer with all coaches
          // (BulkEmailModal only renders when it has recipients), then open it.
          setBulkEmailCoaches(allCoaches);
          setShowBulkEmailModal(true);
        }}
        onImport={() => setShowImportModal(true)}
        coaches={allCoaches.map((c) => ({ id: c.id, name: c.name, school: c.school, email: c.email }))}
        onSelectCoach={(id) => {
          const c = allCoaches.find((x) => x.id === id);
          if (c) handleCoachClick(c);
        }}
      />

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
          onOpenInGmail={openInGmail}
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

// ============================================================================
// ManualGmailTemplateBar — arm ONE template for the "Open in Gmail" flow
// ============================================================================
// Compact glass toolbar shown above the Coaches / Conferences lists. Picking a
// template arms it (merged per-coach on "Gmail" click in the row / detail
// panel); the active name is shown with a clear (×) affordance. Selecting and
// clearing both 44px-tall for touch. Persistence is handled by the parent.
// ============================================================================
function ManualGmailTemplateBar({
  templates,
  active,
  onChange,
}: {
  templates: ManualGmailTemplate[];
  active: ManualGmailTemplate | null;
  onChange: (tpl: ManualGmailTemplate | null) => void;
}) {
  const handleSelect = (id: string) => {
    if (!id) { onChange(null); return; }
    const found = templates.find((t) => t.id === id);
    onChange(found ?? null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl glass-standard px-3 py-2">
      <span className="flex items-center gap-1.5 text-sm font-medium text-warm-700">
        <IconMail size={15} className="text-primary-500" />
        Gmail template:
      </span>
      <div className="relative inline-flex items-center">
        <select
          aria-label="Armed Gmail template"
          value={active?.id ?? ''}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={templates.length === 0}
          className={cn(
            'appearance-none cursor-pointer min-h-[44px] rounded-xl border pl-3 pr-9 py-2 text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed',
            active
              ? 'bg-primary-50 border-primary-200 text-primary-700'
              : 'bg-white/60 border-warm-200/60 text-warm-600 hover:bg-white/80',
          )}
        >
          <option value="">
            {templates.length === 0 ? 'No templates' : 'Select a template…'}
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <IconChevronRight size={14} className="pointer-events-none absolute right-3 rotate-90 text-warm-400" />
      </div>
      {active && (
        <>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-primary-50 border border-primary-200/60 px-2.5 py-1 text-xs font-semibold text-primary-700">
            Armed: <span className="max-w-[160px] truncate">{active.name}</span>
          </span>
          <Button
            variant="ghost"
            type="button"
            onClick={() => onChange(null)}
            aria-label="Clear armed Gmail template"
            className="inline-flex items-center gap-1 min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-medium text-warm-500 hover:text-warm-800 hover:bg-warm-100/60 transition-colors"
          >
            <IconX size={14} /> Clear
          </Button>
        </>
      )}
    </div>
  );
}

// ============================================================================
// AssigneeScopeBar — compact "Assignee" scope filter for the Coaches toolbar
// ============================================================================
// Splits the prospect book by manual work-division label (Nick/Ben/Leah) plus
// All / Unassigned. Local-state only — applied inside filteredCoaches; nothing
// new is passed to CoachFilters. 44px-tall select for touch.
// ============================================================================
function AssigneeScopeBar({
  scope,
  onChange,
}: {
  scope: 'all' | 'unassigned' | CrmAssignee;
  onChange: (next: 'all' | 'unassigned' | CrmAssignee) => void;
}) {
  const active = scope !== 'all';
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl glass-standard px-3 py-2">
      <span className="flex items-center gap-1.5 text-sm font-medium text-warm-700">
        <IconUser size={15} className="text-primary-500" />
        Assignee:
      </span>
      <div className="relative inline-flex items-center">
        <select
          aria-label="Filter coaches by assignee"
          value={scope}
          onChange={(e) => onChange(e.target.value as 'all' | 'unassigned' | CrmAssignee)}
          className={cn(
            'appearance-none cursor-pointer min-h-[44px] rounded-xl border pl-3 pr-9 py-2 text-sm font-medium transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/30',
            active
              ? 'bg-primary-50 border-primary-200 text-primary-700'
              : 'bg-white/60 border-warm-200/60 text-warm-600 hover:bg-white/80',
          )}
        >
          <option value="all">All</option>
          {CRM_ASSIGNEES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
          <option value="unassigned">Unassigned</option>
        </select>
        <IconChevronRight size={14} className="pointer-events-none absolute right-3 rotate-90 text-warm-400" />
      </div>
    </div>
  );
}
