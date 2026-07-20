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
// key. The four legacy email surfaces (email/resend/insights/inbound) are NOT
// nav destinations anymore — they live as sub-tabs inside the single
// "outreach" destination (see OUTREACH_SUBTABS below).
export const TABS = [
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

export type TabId = (typeof TABS)[number]['id'];

// ── Outreach sub-tabs ──
// The four legacy email surfaces, merged behind a horizontal sub-tab switcher
// inside the Outreach panel. Each renders the exact same component as before.
export const OUTREACH_SUBTABS = [
  { id: 'email', label: 'Tracking', Icon: IconSend },
  { id: 'resend', label: 'Deliverability', Icon: IconGauge },
  { id: 'insights', label: 'Analytics', Icon: IconChartBar },
  // NOTE: this renders InboundLeadsView, which is backed by `demo_requests`
  // (landing-page "request a demo" submissions) — a different object from
  // coach replies to outreach emails (crm_replies, surfaced under the
  // top-level "Inbox" tab). Label must stay accurate to that data source;
  // do not relabel this "Replies".
  { id: 'inbound', label: 'Demo Requests', Icon: IconMessage },
] as const;

export type OutreachSubTabId = (typeof OUTREACH_SUBTABS)[number]['id'];

// ── Mobile bottom tab bar ──
// Below `lg` the dark desktop sidebar is hidden and replaced by a fixed,
// safe-area-aware bottom tab bar. It surfaces the four highest-traffic
// destinations directly, plus a "More" entry that opens a sheet listing the
// rest — so every sidebar destination stays reachable on mobile. Ids reference
// the same stable TabId values, so tapping a bar item calls setActiveTab
// exactly like the sidebar.
export const MOBILE_BAR_TABS = ['today', 'list', 'outreach', 'sequences'] as const;
// Destinations that live behind the "More" sheet (everything not on the bar).
// Must cover every TABS id not already on the bar — 'templates' was missing
// here (present in neither array), making it unreachable on mobile touch.
export const MOBILE_MORE_TABS = ['dashboard', 'pipeline', 'conferences', 'inbox', 'templates', 'settings'] as const;

// Email statuses that must never receive a manual Gmail send. Mirrors the
// email_status/suppression gate that already exists server-side for the
// direct-send path (crm-gmail-send.ts's sendCoachViaGmail/sendNextBatchViaGmail
// skip non-'valid' status), extended to the compose-tab path — the only
// channel reachable while direct-send is unconfigured (the current default).
export function isSuppressedEmailStatus(status: Coach['email_status'] | null | undefined): boolean {
  return status === 'bounced' || status === 'complained' || status === 'unsubscribed';
}
