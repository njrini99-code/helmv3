import {
  IconChartBar,
  IconClock3,
  IconMail,
  IconSend,
  IconMessage,
  IconMessageSquare,
  IconGauge,
  IconActivity,
  IconLayers,
  IconSettings,
  IconCalendar,
  IconClipboardList as ClipboardList,
  IconLayoutGrid as LayoutDashboard,
  IconBuilding as Building2,
  IconFileText,
} from '@/components/icons';
import type { Coach } from './crm-config';

// ============================================================================
// CRM SHELL PAGE CONTRACTS
// ============================================================================
// Module-level contracts for the CRM shell (`./page.tsx`): sidebar tab
// definitions, outreach sub-tabs, the mobile bar/more split, and the
// suppression gate. They live in this leaf module — NOT in page.tsx — because
// a Next.js App Router page may only export the page component plus reserved
// fields; any other named export fails `next build`'s page type validation.
// Colocated tests (`./page.test.ts`) import these directly without rendering
// the full client page.

// ── Sidebar tabs ──
// Flat list of every NAVIGABLE destination, each with a STABLE id, a fixed
// keyboard shortcut, and a section it belongs to. Shortcuts are bound to ids
// (not array position) so regrouping/reordering never silently re-points a
// key.
//
// 2026-07-20 consolidation: the CRM had three top-level tabs rendering the
// SAME coach list (list/pipeline/conferences) and inbound demo requests
// hidden under Outreach while replies lived in Inbox. Now: 'list' is the one
// coach destination with an internal view switcher (see COACH_VIEWS), and
// Inbox owns everything incoming (replies, demo requests, tasks). Legacy ids
// keep working via LEGACY_TAB_ALIASES below.
export const TABS = [
  // ── WORK ──
  { id: 'today', label: 'Today', Icon: IconClock3, shortcut: '1', description: 'Signals + ranked call & email worklist', section: 'work' },
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, shortcut: '2', description: 'KPIs, trends & pipeline overview', section: 'work' },
  { id: 'list', label: 'Coaches', Icon: ClipboardList, shortcut: '3', description: 'Every coach — table, board or by conference', section: 'work' },
  { id: 'inbox', label: 'Inbox', Icon: IconMessageSquare, shortcut: '4', description: 'Replies, demo requests & tasks due', section: 'work' },
  { id: 'outreach', label: 'Outreach', Icon: IconMail, shortcut: '5', description: 'Email tracking, deliverability & analytics', section: 'work' },
  // 2026-07-29: the CRM had no calendar. CalendarView, the only surface that
  // renders crm_events as a schedule, was never mounted, and the two event modals
  // had no external opener (see the Calendar block in page.tsx). Events were
  // creatable via QuickActionsPanel and readable per-coach via getCoachTimeline —
  // what was missing was the schedule itself and any way to open an event.
  // Shortcut is the mnemonic 'C' rather than '6' on purpose: the digits are bound
  // to existing ids, and renumbering Sequences 6→7 would silently re-point a key
  // someone already has in muscle memory — exactly what the id-bound-shortcut
  // rule above exists to prevent.
  { id: 'calendar', label: 'Calendar', Icon: IconCalendar, shortcut: 'C', description: 'Demos, calls & follow-ups on a month/week/day grid', section: 'work' },
  // ── AUTOMATE ──
  { id: 'sequences', label: 'Sequences', Icon: IconActivity, shortcut: '6', description: 'Drip campaigns & enrollments', section: 'automate' },
  { id: 'templates', label: 'Templates', Icon: IconFileText, shortcut: '7', description: 'Author, preview & test reusable emails', section: 'automate' },
  // ── ADMIN ──
  { id: 'settings', label: 'Settings', Icon: IconSettings, shortcut: 'S', description: 'Automations & suppressions', section: 'admin' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

// ── Coach views ──
// The three ways to look at the one coach list, switched INSIDE the 'list'
// destination (segmented control). Same filters, same selection, same data —
// only the presentation changes. These were previously separate top-level
// tabs, which fragmented filter state and tripled the nav surface.
export const COACH_VIEWS = [
  { id: 'table', label: 'Table', Icon: ClipboardList },
  { id: 'board', label: 'Board', Icon: IconLayers },
  { id: 'conferences', label: 'Conferences', Icon: Building2 },
] as const;

export type CoachViewId = (typeof COACH_VIEWS)[number]['id'];

// ── Legacy deep-link aliases ──
// Old bookmarkable ids (?tab=pipeline etc.) from before the consolidation.
// Every alias maps to a live destination plus the state that recreates the
// old surface. Applied in page.tsx's URL-sync effect.
export const LEGACY_TAB_ALIASES: Record<
  string,
  { tab: TabId; view?: CoachViewId; outreach?: OutreachSubTabId }
> = {
  pipeline: { tab: 'list', view: 'board' },
  conferences: { tab: 'list', view: 'conferences' },
  email: { tab: 'outreach', outreach: 'email' },
  resend: { tab: 'outreach', outreach: 'resend' },
  insights: { tab: 'outreach', outreach: 'insights' },
  // Demo requests moved from an Outreach sub-tab into Inbox.
  inbound: { tab: 'inbox' },
};

// ── Outreach sub-tabs ──
// The four legacy email surfaces, merged behind a horizontal sub-tab switcher
// inside the Outreach panel. Each renders the exact same component as before.
export const OUTREACH_SUBTABS = [
  { id: 'email', label: 'Tracking', Icon: IconSend },
  { id: 'resend', label: 'Deliverability', Icon: IconGauge },
  { id: 'insights', label: 'Analytics', Icon: IconChartBar },
  // Demo requests (demo_requests-backed InboundLeadsView) moved to the Inbox
  // destination — everything INCOMING (replies, demo requests, tasks) lives
  // in one place now. ?tab=inbound deep links alias there.
] as const;

export type OutreachSubTabId = (typeof OUTREACH_SUBTABS)[number]['id'];

// ── Inbox sections ──
// Inbox owns everything incoming: coach replies + tasks due (the original
// feed) and landing-page demo requests (moved from an Outreach sub-tab).
export const INBOX_SECTIONS = [
  { id: 'replies', label: 'Replies & tasks', Icon: IconMessageSquare },
  { id: 'demos', label: 'Demo requests', Icon: IconMessage },
] as const;

export type InboxSectionId = (typeof INBOX_SECTIONS)[number]['id'];

// ── Mobile bottom tab bar ──
// Below `lg` the dark desktop sidebar is hidden and replaced by a fixed,
// safe-area-aware bottom tab bar. It surfaces the four highest-traffic
// destinations directly, plus a "More" entry that opens a sheet listing the
// rest — so every sidebar destination stays reachable on mobile. Ids reference
// the same stable TabId values, so tapping a bar item calls setActiveTab
// exactly like the sidebar.
// 2026-07-20: Inbox swapped onto the bar in place of Sequences — mobile
// doctrine is "the bar surfaces the daily loop"; Inbox (replies, demo
// requests, tasks due) is the daily incoming hub, while Sequences is a
// set-up-once-and-check-occasionally automation surface that belongs in More.
export const MOBILE_BAR_TABS = ['today', 'list', 'outreach', 'inbox'] as const;
// Destinations that live behind the "More" sheet (everything not on the bar).
// Must cover every TABS id not already on the bar.
export const MOBILE_MORE_TABS = ['dashboard', 'calendar', 'sequences', 'templates', 'settings'] as const;

// ── Segmented-control spec ──
// ONE visual spec for every horizontal switcher in the CRM shell (Outreach
// sub-tabs, Coach views, Inbox sections). Drift between these controls was a
// cohesion bug — change them together or not at all.
export const SEGMENTED_TABLIST_CLASS =
  'inline-flex max-w-full items-center gap-1 overflow-x-auto scrollbar-hide rounded-fw-md border border-border-subtle bg-surface-tint/70 p-1';

export function segmentedTabClass(isActive: boolean): string {
  return [
    'flex items-center gap-1.5 min-h-11 px-3 py-1.5 rounded-fw-sm border text-sm font-medium whitespace-nowrap transition-[background-color,color,border-color,box-shadow,transform] duration-200 active:scale-[0.98]',
    isActive
      ? 'border-accent-200 bg-accent-50 text-accent-800 shadow-flat'
      : 'border-transparent text-text-tertiary hover:bg-elevated hover:text-text-primary',
  ].join(' ');
}

export function segmentedTabIconClass(isActive: boolean): string {
  return `flex-shrink-0 ${isActive ? 'text-accent-700' : 'text-text-tertiary'}`;
}

export const CRM_RADIX_TAB_CLASS =
  'min-h-11 rounded-fw-sm border px-3 py-1.5 text-sm font-medium whitespace-nowrap before:hidden data-[state=active]:border-accent-200 data-[state=active]:bg-accent-50 data-[state=active]:text-accent-800 data-[state=active]:shadow-flat data-[state=inactive]:border-transparent data-[state=inactive]:text-text-tertiary data-[state=inactive]:hover:bg-elevated data-[state=inactive]:hover:text-text-primary';

export const CRM_PRIMARY_ACTION_CLASS =
  'min-h-11 rounded-fw-md bg-accent-650 px-4 text-sm font-semibold text-text-on-accent shadow-soft hover:bg-accent-700 hover:shadow-raise focus-visible:ring-border-focus';

export const CRM_SECONDARY_ACTION_CLASS =
  'min-h-11 rounded-fw-md border border-border-subtle bg-elevated px-4 text-sm font-medium text-text-secondary shadow-flat hover:border-border-strong hover:bg-surface-tint hover:text-text-primary';

export const CRM_TERTIARY_ACTION_CLASS =
  'min-h-11 rounded-fw-md px-3 text-sm font-medium text-text-secondary hover:bg-surface-tint hover:text-text-primary';

export const CRM_DANGER_ACTION_CLASS =
  'min-h-11 rounded-fw-md border border-fw-danger/30 bg-fw-danger-bg px-4 text-sm font-semibold text-fw-danger-ink hover:border-fw-danger/50';

export const CRM_ICON_ACTION_CLASS =
  'min-h-11 min-w-11 rounded-fw-md text-text-tertiary hover:bg-surface-tint hover:text-text-primary';

export const CRM_CHOICE_GROUP_CLASS =
  'inline-flex max-w-full items-center gap-1 overflow-x-auto scrollbar-hide rounded-fw-md border border-border-subtle bg-surface-tint/70 p-1';

export function crmChoiceClass(isActive: boolean): string {
  return [
    'min-h-10 rounded-fw-sm border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-[background-color,color,border-color,transform] duration-200 active:scale-[0.98]',
    isActive
      ? 'border-accent-200 bg-accent-50 text-accent-800'
      : 'border-transparent text-text-tertiary hover:bg-elevated hover:text-text-primary',
  ].join(' ');
}

export const CRM_RADIX_CHOICE_CLASS =
  'min-h-10 rounded-fw-sm border px-3 py-1.5 text-xs font-medium whitespace-nowrap data-[state=on]:border-accent-200 data-[state=on]:bg-accent-50 data-[state=on]:text-accent-800 data-[state=off]:border-transparent data-[state=off]:text-text-tertiary data-[state=off]:hover:bg-elevated data-[state=off]:hover:text-text-primary';

// Email statuses that must never receive a manual Gmail send. Mirrors the
// email_status/suppression gate that already exists server-side for the
// direct-send path (crm-gmail-send.ts's sendCoachViaGmail/sendNextBatchViaGmail
// skip non-'valid' status), extended to the compose-tab path — the only
// channel reachable while direct-send is unconfigured (the current default).
export function isSuppressedEmailStatus(status: Coach['email_status'] | null | undefined): boolean {
  return status === 'bounced' || status === 'complained' || status === 'unsubscribed';
}
