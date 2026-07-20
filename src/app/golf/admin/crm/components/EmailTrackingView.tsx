'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { addSuppression } from '@/app/golf/actions/crm-foundations';
import { logError } from '@/lib/error-logging';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  IconMail,
  IconCheckCircle2,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconEye,
  IconActivity,
  IconTarget as MousePointerClick,
  IconXCircle as Ban,
  IconUsers,
  IconExternalLink,
  IconWarning,
} from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================
interface EmailEvent {
  event_type: string;
  occurred_at: string;
}

interface EmailCoach {
  id: string;
  name: string;
  school: string;
  email: string | null;
  email_status: string | null;
}

interface EmailRecord {
  id: string;
  coach_id: string;
  contact_type: string;
  contact_date: string;
  subject: string | null;
  body: string | null;
  resend_message_id: string | null;
  crm_coaches: EmailCoach | null;
  crm_email_events: EmailEvent[];
}

interface EmailStats {
  total_sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
}

interface Campaign {
  key: string;
  subject: string;
  date: string;
  emails: EmailRecord[];
}

type FilterTab = 'all' | 'delivered' | 'opened' | 'bounced';
type SortField = 'date' | 'status';

const EMPTY_STATS: EmailStats = { total_sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };

// ============================================================================
// HELPERS
// ============================================================================
function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getEmailStatus(events: EmailEvent[]): string {
  const types = new Set(events.map(e => e.event_type));
  if (types.has('email.bounced') || types.has('email.complained')) return 'bounced';
  if (types.has('email.clicked')) return 'clicked';
  if (types.has('email.opened')) return 'opened';
  if (types.has('email.delivered')) return 'delivered';
  if (types.has('email.sent')) return 'sent';
  return 'sent';
}

/** Pure helper: derive aggregate stats from a list of emails (fallback when RPC missing). */
function computeEmailStats(emailList: EmailRecord[]): EmailStats {
  const stats: EmailStats = { total_sent: emailList.length, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
  for (const email of emailList) {
    const status = getEmailStatus(email.crm_email_events || []);
    if (status === 'delivered' || status === 'opened' || status === 'clicked') stats.delivered++;
    if (status === 'opened' || status === 'clicked') stats.opened++;
    if (status === 'clicked') stats.clicked++;
    if (status === 'bounced') stats.bounced++;
  }
  return stats;
}

/** Group emails into campaigns: same subject + send time within 1 hour */
function groupIntoCampaigns(emails: EmailRecord[]): Campaign[] {
  const campaigns: Campaign[] = [];

  for (const email of emails) {
    const subject = email.subject || '(no subject)';
    const sendTime = new Date(email.contact_date).getTime();

    // Try to find an existing campaign with matching subject and close send time
    let matched = false;
    for (const campaign of campaigns) {
      if (campaign.subject === subject) {
        const campaignTime = new Date(campaign.date).getTime();
        if (Math.abs(sendTime - campaignTime) <= 60 * 60 * 1000) {
          campaign.emails.push(email);
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      campaigns.push({
        key: `${subject}-${email.contact_date}`,
        subject,
        date: email.contact_date,
        emails: [email],
      });
    }
  }

  return campaigns;
}

const STATUS_ICON_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  sent:      { icon: <IconClock size={14} />,          color: 'text-warm-400',    label: 'Sent' },
  delivered: { icon: <IconCheckCircle2 size={14} />,   color: 'text-primary-500', label: 'Delivered' },
  opened:    { icon: <IconEye size={14} />,            color: 'text-blue-500',    label: 'Opened' },
  clicked:   { icon: <MousePointerClick size={14} />,  color: 'text-violet-500',  label: 'Clicked' },
  bounced:   { icon: <Ban size={14} />,                color: 'text-red-500',     label: 'Bounced' },
};

const EVENT_TIMELINE_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  'email.sent':      { label: 'Sent',      color: 'text-warm-600',    dotColor: 'bg-warm-400' },
  'email.delivered': { label: 'Delivered', color: 'text-blue-600',    dotColor: 'bg-blue-500' },
  'email.opened':    { label: 'Opened',   color: 'text-primary-600', dotColor: 'bg-primary-500' },
  'email.clicked':   { label: 'Clicked',  color: 'text-violet-600',  dotColor: 'bg-violet-500' },
  'email.bounced':   { label: 'Bounced',  color: 'text-red-600',     dotColor: 'bg-red-500' },
  'email.complained':{ label: 'Complained', color: 'text-red-600',   dotColor: 'bg-red-500' },
};

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'opened', label: 'Opened' },
  { id: 'bounced', label: 'Bounced' },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function EmailTrackingView() {
  const prefersReducedMotion = useReducedMotion();
  const [stats, setStats] = useState<EmailStats>(EMPTY_STATS);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [allOutreach, setAllOutreach] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [suppressingIds, setSuppressingIds] = useState<Set<string>>(new Set());
  const [subTab, setSubTab] = useState<'overview' | 'contacted' | 'campaigns' | 'bounced'>('overview');

  const supabase = createClient();

  // ── Data Fetching ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      // Fetch Helm-sent emails (with Resend tracking events). PAGINATED past the
      // 1000-row PostgREST cap — an unpaginated fetch silently truncated at 1000,
      // which capped "Total Outreach" at exactly 1,000 and corrupted the derived
      // counts. Stable order (contact_date desc, then id) keeps page boundaries firm.
      const emailsRes = await fetchAllRowsResult<EmailRecord>((from, to) =>
        supabase
          .from('crm_contact_log')
          .select('*, crm_coaches!coach_id(id, name, school, email, email_status), crm_email_events(event_type, occurred_at)')
          .not('resend_message_id', 'is', null)
          .order('contact_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: EmailRecord[] | null; error: { message: string } | null }>
      );

      if (emailsRes.error) {
        throw new Error(emailsRes.error.message);
      }

      const helmEmails = emailsRes.data ?? [];
      setEmails(helmEmails);

      // Also fetch ALL email contacts (including Gmail BCC / manual log entries) — paginated.
      const allEmailsRes = await fetchAllRowsResult<EmailRecord>((from, to) =>
        supabase
          .from('crm_contact_log')
          .select('*, crm_coaches!coach_id(id, name, school, email, email_status)')
          .eq('contact_type', 'email')
          .order('contact_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: EmailRecord[] | null; error: { message: string } | null }>
      );

      if (allEmailsRes.error) {
        throw new Error(allEmailsRes.error.message);
      }

      setAllOutreach(allEmailsRes.data ?? []);

      // Fetch stats via RPC — may not exist, so fall back to client-side compute
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_crm_email_stats');
        if (!rpcError && rpcData) {
          setStats(rpcData as unknown as EmailStats);
        } else {
          setStats(computeEmailStats(helmEmails));
        }
      } catch {
        setStats(computeEmailStats(helmEmails));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load email outreach data';
      setFetchError(message);
      logError(
        err instanceof Error ? err : new Error(message),
        { component: 'EmailTrackingView', action: 'fetch-email-outreach', sport: 'golf' },
        'high'
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Suppress Coach Email ──
  // Writes to BOTH mechanisms: crm_coaches.email_status (drives this UI's
  // filtering/display) and the canonical crm_email_suppressions table via
  // addSuppression() (the table Settings > Suppressions and
  // crm-gmail-send.ts's isSuppressed() gate actually read). Without the
  // latter, a coach suppressed here never appears in the Settings
  // suppression list/count and carries no reason/source/suppressed_by audit
  // trail.
  const handleSuppress = async (coach: EmailCoach) => {
    setSuppressingIds(prev => new Set(prev).add(coach.id));
    try {
      await supabase
        .from('crm_coaches')
        .update({ email_status: 'bounced' })
        .eq('id', coach.id);

      if (coach.email) {
        try {
          await addSuppression({ email: coach.email, reason: 'hard_bounce' });
        } catch {
          // crm_coaches.email_status update above already blocks future
          // sends via the UI's own gating; surfacing this failure silently
          // is acceptable — the operator can retry from Settings.
        }
      }

      // Update local state
      setEmails(prev =>
        prev.map(e =>
          e.crm_coaches?.id === coach.id
            ? { ...e, crm_coaches: { ...e.crm_coaches!, email_status: 'bounced' } }
            : e
        )
      );
    } finally {
      setSuppressingIds(prev => {
        const next = new Set(prev);
        next.delete(coach.id);
        return next;
      });
    }
  };

  // ── Toggle Campaign Expansion ──
  const toggleCampaign = (key: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Toggle Row Expansion ──
  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Filtered + Sorted Emails ──
  const filteredEmails = useMemo(() => {
    let result = [...emails];

    // Filter
    if (filterTab !== 'all') {
      result = result.filter(email => {
        const status = getEmailStatus(email.crm_email_events || []);
        if (filterTab === 'delivered') return ['delivered', 'opened', 'clicked'].includes(status);
        if (filterTab === 'opened') return ['opened', 'clicked'].includes(status);
        if (filterTab === 'bounced') return status === 'bounced';
        return true;
      });
    }

    // Sort
    if (sortField === 'status') {
      const statusOrder: Record<string, number> = { bounced: 0, clicked: 1, opened: 2, delivered: 3, sent: 4 };
      result.sort((a, b) => {
        const sa = statusOrder[getEmailStatus(a.crm_email_events || [])] ?? 5;
        const sb = statusOrder[getEmailStatus(b.crm_email_events || [])] ?? 5;
        return sa - sb;
      });
    }

    return result;
  }, [emails, filterTab, sortField]);

  // ── Campaigns ──
  const campaigns = useMemo(() => groupIntoCampaigns(filteredEmails), [filteredEmails]);

  // ── Bounced Coaches (unique, not yet suppressed) ──
  const bouncedCoaches = useMemo(() => {
    const seen = new Set<string>();
    const result: EmailCoach[] = [];

    for (const email of emails) {
      const status = getEmailStatus(email.crm_email_events || []);
      if (status === 'bounced' && email.crm_coaches && !seen.has(email.crm_coaches.id)) {
        if (email.crm_coaches.email_status !== 'bounced') {
          seen.add(email.crm_coaches.id);
          result.push(email.crm_coaches);
        }
      }
    }
    return result;
  }, [emails]);

  // ── Skeleton Loading ──
  if (loading) {
    return (
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* KPI Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-standard rounded-2xl shadow-glass p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-20 bg-warm-100 rounded animate-pulse" />
                  <div className="h-8 w-16 bg-warm-100 rounded animate-pulse" />
                </div>
                <div className="w-10 h-10 rounded-full bg-warm-50 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        {/* Campaign Skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-standard rounded-2xl shadow-glass p-5">
              <div className="flex items-center gap-4">
                <div className="h-5 flex-1 bg-warm-50 rounded-xl animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error State ──
  // Distinguishes a genuine fetch/permission failure from "no emails sent
  // yet" — without this, a failed load rendered the identical empty-state
  // copy as a CRM with zero outreach, with no signal anything was broken.
  if (fetchError) {
    return (
      <div className="max-w-[1400px] mx-auto">
        <div className="glass-standard rounded-2xl shadow-glass p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6">
            <IconWarning size={28} className="text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-warm-900 mb-2">Couldn&apos;t load email outreach</h3>
          <p className="text-sm text-warm-500 max-w-md mx-auto leading-relaxed mb-6">{fetchError}</p>
          <Button variant="primary"
            onClick={() => fetchData()}
            className="px-6 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-medium transition-all duration-200 shadow-sm"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // ── Empty State ──
  if (stats.total_sent === 0 && emails.length === 0 && allOutreach.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto">
        <div className="glass-standard rounded-2xl shadow-glass p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-6">
            <IconMail size={28} className="text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-warm-900 mb-2">No emails sent yet</h3>
          <p className="text-sm text-warm-500 max-w-md mx-auto leading-relaxed mb-6">
            When you send emails to coaches through the CRM, delivery tracking, open rates, and click
            analytics will appear here automatically.
          </p>
          <p className="text-xs text-warm-400 max-w-sm mx-auto">
            Select coaches from the Pipeline tab and use Bulk Email to send your first campaign.
          </p>
        </div>
      </div>
    );
  }

  // Rates use the RPC's CRM-scoped counts for BOTH numerator and denominator and
  // are clamped to 100% — delivered can't exceed sent (the RPC was fixed to scope
  // delivered/opened to CRM contact-log emails; the clamp is a belt-and-suspenders
  // guard so a transient over-count never renders an impossible "110%").
  const deliveryRate = stats.total_sent > 0 ? Math.min(100, Math.round((stats.delivered / stats.total_sent) * 100)) : 0;
  const openRate = stats.total_sent > 0 ? Math.min(100, Math.round((stats.opened / stats.total_sent) * 100)) : 0;

  // Compute outreach summary from ALL contacts (Gmail + Helm)
  const totalOutreach = allOutreach.length;
  const gmailOutreach = allOutreach.filter(e => !e.resend_message_id).length;
  const helmOutreach = allOutreach.filter(e => e.resend_message_id).length;

  // Unique coaches contacted
  const contactedCoachMap = new Map<string, { name: string; school: string; email: string | null; lastDate: string; method: string; subject: string | null }>();
  for (const entry of allOutreach) {
    const coach = entry.crm_coaches;
    if (!coach) continue;
    const existing = contactedCoachMap.get(coach.id);
    if (!existing || new Date(entry.contact_date) > new Date(existing.lastDate)) {
      contactedCoachMap.set(coach.id, {
        name: coach.name,
        school: coach.school,
        email: coach.email,
        lastDate: entry.contact_date,
        method: entry.resend_message_id ? 'Helm' : 'Gmail',
        subject: entry.subject,
      });
    }
  }
  const contactedCoaches = Array.from(contactedCoachMap.values()).sort(
    (a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
  );

  const SUB_TABS = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'contacted' as const, label: `Contacted (${contactedCoaches.length})` },
    { id: 'campaigns' as const, label: `Campaigns (${campaigns.length})` },
    { id: 'bounced' as const, label: bouncedCoaches.length > 0 ? `Bounced (${bouncedCoaches.length})` : 'Bounced' },
  ];

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* ══════════════ Header ══════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-warm-900 tracking-tight">Email outreach</h2>
          <p className="text-sm text-warm-500 mt-1">
            Coach-level contact history across Helm and Gmail. For full deliverability analytics, see{' '}
            <a
              href="/golf/admin/crm?tab=outreach&outreach=resend"
              className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium underline-offset-2 hover:underline transition-colors"
            >
              Resend activity
              <IconExternalLink size={11} aria-hidden="true" />
            </a>
            .
          </p>
        </div>
      </div>

      {/* ══════════════ Stats Header Cards ══════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<IconMail size={20} />}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          label="Total Outreach"
          value={totalOutreach.toLocaleString()}
          subtitle={`${helmOutreach} via Helm \u00B7 ${gmailOutreach} via Gmail`}
        />
        <StatCard
          icon={<IconUsers size={20} />}
          iconBg="bg-indigo-100"
          iconColor="text-indigo-600"
          label="Coaches Contacted"
          value={contactedCoaches.length.toLocaleString()}
        />
        <StatCard
          icon={<IconEye size={20} />}
          iconBg="bg-violet-100"
          iconColor="text-violet-600"
          label="Open Rate"
          value={stats.total_sent > 0 ? `${openRate}%` : '\u2014'}
          subtitle={stats.total_sent > 0 ? `${stats.opened} of ${stats.total_sent} Helm emails` : 'Helm emails only'}
        />
        <StatCard
          icon={<IconCheckCircle2 size={20} />}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
          label="Delivery Rate"
          value={stats.total_sent > 0 ? `${deliveryRate}%` : '\u2014'}
          subtitle={stats.total_sent > 0 ? `${stats.delivered} of ${stats.total_sent} Helm emails` : 'Helm emails only'}
        />
      </div>

      {/* ══════════════ Sub-Tab Navigation ══════════════ */}
      <div className="glass-standard rounded-2xl shadow-glass overflow-hidden">
        <div
          role="tablist"
          aria-label="Email outreach views"
          className="flex gap-0 border-b border-warm-100 overflow-x-auto scrollbar-hide"
        >
          {SUB_TABS.map(tab => {
            const isActive = subTab === tab.id;
            return (
              <Button variant="ghost"
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`email-panel-${tab.id}`}
                onClick={() => setSubTab(tab.id)}
                className={cn(
                  'px-5 py-3 text-sm font-medium transition-colors relative whitespace-nowrap',
                  isActive ? 'text-warm-900' : 'text-warm-400 hover:text-warm-600'
                )}
              >
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="email-tab-underline"
                    className="absolute bottom-0 left-1 right-1 h-[2px] bg-primary-500 rounded-full"
                    transition={prefersReducedMotion ? { duration: 0 } : ({ type: 'spring', stiffness: 500, damping: 30 })}
                  />
                )}
              </Button>
            );
          })}
        </div>

        <div className="p-5">
          {/* ── Overview Tab ── */}
          {subTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Recent Outreach */}
                <div>
                  <h4 className="text-sm font-semibold text-warm-800 mb-3">Recent Outreach</h4>
                  <div className="space-y-2">
                    {allOutreach.slice(0, 8).map(entry => {
                      const coach = entry.crm_coaches;
                      if (!coach) return null;
                      return (
                        <div key={entry.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-warm-50/50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-warm-800 truncate">{coach.name}</p>
                            <p className="text-xs text-warm-400 truncate">{coach.school} · {entry.subject || '(no subject)'}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            <span className={cn(
                              'px-2 py-0.5 rounded-full text-eyebrow font-bold uppercase',
                              entry.resend_message_id ? 'bg-primary-50 text-primary-700' : 'bg-blue-50 text-blue-700'
                            )}>
                              {entry.resend_message_id ? 'Helm' : 'Gmail'}
                            </span>
                            <span className="text-xs text-warm-400 tabular-nums">{formatRelative(entry.contact_date)}</span>
                          </div>
                        </div>
                      );
                    })}
                    {allOutreach.length === 0 && (
                      <p className="text-sm text-warm-400 text-center py-4">No outreach yet</p>
                    )}
                  </div>
                </div>

                {/* Quick Stats */}
                <div>
                  <h4 className="text-sm font-semibold text-warm-800 mb-3">Breakdown</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-warm-600">Sent via Helm</span>
                      <span className="text-sm font-semibold text-warm-900 tabular-nums">{helmOutreach}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-warm-600">Sent via Gmail</span>
                      <span className="text-sm font-semibold text-warm-900 tabular-nums">{gmailOutreach}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-warm-100 pt-3">
                      <span className="text-sm text-warm-600">Unique Coaches</span>
                      <span className="text-sm font-semibold text-warm-900 tabular-nums">{contactedCoaches.length}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-warm-600">Bounced Emails (Helm)</span>
                      <span className={cn('text-sm font-semibold tabular-nums', bouncedCoaches.length > 0 ? 'text-red-600' : 'text-warm-900')}>{bouncedCoaches.length}</span>
                    </div>
                    {helmOutreach > 0 && (
                      <>
                        <div className="flex items-center justify-between py-2 border-t border-warm-100 pt-3">
                          <span className="text-sm text-warm-600">Delivered (Helm)</span>
                          <span className="text-sm font-semibold text-warm-900 tabular-nums">{stats.delivered}</span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <span className="text-sm text-warm-600">Opened (Helm)</span>
                          <span className="text-sm font-semibold text-warm-900 tabular-nums">{stats.opened}</span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <span className="text-sm text-warm-600">Clicked (Helm)</span>
                          <span className="text-sm font-semibold text-warm-900 tabular-nums">{stats.clicked}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Contacted Tab ── */}
          {subTab === 'contacted' && (
            <div>
              <div className="space-y-1 max-h-[600px] overflow-y-auto">
                {contactedCoaches.map((coach, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-warm-50/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-warm-800 truncate">{coach.name}</p>
                      <p className="text-xs text-warm-400 truncate">{coach.school}{coach.email ? ` \u00B7 ${coach.email}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {coach.subject && (
                        <span className="text-xs text-warm-400 truncate max-w-[200px] hidden lg:block">“{coach.subject}”</span>
                      )}
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-eyebrow font-bold uppercase tracking-wider',
                        coach.method === 'Helm' ? 'bg-primary-50 text-primary-700' : 'bg-blue-50 text-blue-700'
                      )}>
                        {coach.method}
                      </span>
                      <span className="text-xs text-warm-400 tabular-nums whitespace-nowrap">{formatRelative(coach.lastDate)}</span>
                    </div>
                  </div>
                ))}
                {contactedCoaches.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-sm text-warm-400">No coaches contacted yet</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Campaigns Tab ── */}
          {subTab === 'campaigns' && (
            <div>
              <CrossRefBanner
                icon={<IconActivity size={14} />}
                text="This view groups Helm-sent emails by subject. For per-email events, domain breakdowns, and live activity, open"
                linkLabel="Resend activity"
              />
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-1" role="group" aria-label="Filter campaigns by status">
                  {FILTER_TABS.map(tab => (
                    <Button variant="ghost"
                      key={tab.id}
                      onClick={() => setFilterTab(tab.id)}
                      aria-pressed={filterTab === tab.id}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        filterTab === tab.id
                          ? 'bg-warm-100 text-warm-800'
                          : 'text-warm-400 hover:text-warm-600 hover:bg-warm-50'
                      )}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>
                <Button variant="ghost"
                  onClick={() => setSortField(sortField === 'date' ? 'status' : 'date')}
                  aria-label={`Sort campaigns by ${sortField === 'date' ? 'status' : 'date'}`}
                  className="text-xs font-medium text-warm-500 hover:text-warm-700 px-2.5 py-1.5 rounded-lg hover:bg-warm-50 transition-colors"
                >
                  Sort: {sortField === 'date' ? 'Date' : 'Status'}
                </Button>
              </div>

              {campaigns.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mx-auto mb-2">
                    <IconMail size={18} className="text-warm-300" />
                  </div>
                  <p className="text-sm font-medium text-warm-500">No Helm email campaigns yet</p>
                  <p className="text-xs text-warm-400 mt-0.5">Send emails via Helm to see campaign tracking here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {campaigns.map(campaign => {
                    const isExpanded = expandedCampaigns.has(campaign.key);
                    const recipientCount = campaign.emails.length;
                    const statuses = campaign.emails.map(e => getEmailStatus(e.crm_email_events || []));
                    const deliveredCount = statuses.filter(s => ['delivered', 'opened', 'clicked'].includes(s)).length;
                    const openedCount = statuses.filter(s => ['opened', 'clicked'].includes(s)).length;
                    const bouncedCount = statuses.filter(s => s === 'bounced').length;

                    return (
                      <div key={campaign.key} className="rounded-xl border border-warm-100/60 bg-cream-50 overflow-hidden">
                        <Button variant="ghost"
                          onClick={() => toggleCampaign(campaign.key)}
                          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-warm-50/50 transition-colors"
                        >
                          <div className="flex-shrink-0">
                            {isExpanded
                              ? <IconChevronDown size={14} className="text-warm-400" />
                              : <IconChevronRight size={14} className="text-warm-300" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-warm-900 truncate">{campaign.subject}</p>
                            <p className="text-xs text-warm-400 mt-0.5">{formatDate(campaign.date)}</p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="flex items-center gap-1 text-xs text-warm-500">
                              <IconUsers size={12} />
                              <span className="tabular-nums">{recipientCount}</span>
                            </div>
                            <div className="hidden sm:flex items-center gap-2 text-xs">
                              {deliveredCount > 0 && (
                                <span className="flex items-center gap-0.5 text-primary-500">
                                  <IconCheckCircle2 size={12} />
                                  <span className="tabular-nums">{deliveredCount}</span>
                                </span>
                              )}
                              {openedCount > 0 && (
                                <span className="flex items-center gap-0.5 text-blue-500">
                                  <IconEye size={12} />
                                  <span className="tabular-nums">{openedCount}</span>
                                </span>
                              )}
                              {bouncedCount > 0 && (
                                <span className="flex items-center gap-0.5 text-red-500">
                                  <Ban size={12} />
                                  <span className="tabular-nums">{bouncedCount}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </Button>

                        {isExpanded && (
                          <div className="border-t border-warm-100/60 px-4 py-2 space-y-1 bg-warm-50/30">
                            {campaign.emails.map(email => {
                              const status = getEmailStatus(email.crm_email_events || []);
                              const statusConfig = STATUS_ICON_CONFIG[status] ?? STATUS_ICON_CONFIG.sent!;
                              const isEmailExpanded = expandedIds.has(email.id);
                              const sortedEvents = [...(email.crm_email_events || [])].sort(
                                (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
                              );

                              return (
                                <div key={email.id}>
                                  <Button variant="ghost"
                                    onClick={() => toggleExpanded(email.id)}
                                    className="w-full text-left flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-cream-100 transition-colors"
                                  >
                                    <div className={cn('flex-shrink-0', statusConfig?.color)} title={statusConfig?.label}>
                                      {statusConfig?.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-warm-800 truncate">{email.crm_coaches?.name || 'Unknown'}</p>
                                      <p className="text-xs text-warm-400 truncate">
                                        {email.crm_coaches?.school || ''}
                                        {email.crm_coaches?.email ? ` \u00B7 ${email.crm_coaches.email}` : ''}
                                      </p>
                                    </div>
                                    <span className="text-xs text-warm-400 tabular-nums flex-shrink-0">{formatRelative(email.contact_date)}</span>
                                    <div className="flex-shrink-0">
                                      {isEmailExpanded
                                        ? <IconChevronDown size={12} className="text-warm-300" />
                                        : <IconChevronRight size={12} className="text-warm-300" />
                                      }
                                    </div>
                                  </Button>

                                  {isEmailExpanded && sortedEvents.length > 0 && (
                                    <div className="pl-10 pb-2 pt-1">
                                      <div className="relative pl-4 border-l-2 border-warm-100 space-y-2">
                                        {sortedEvents.map((event, i) => {
                                          const config = EVENT_TIMELINE_CONFIG[event.event_type] || {
                                            label: event.event_type,
                                            color: 'text-warm-500',
                                            dotColor: 'bg-warm-300',
                                          };
                                          return (
                                            <div key={`${event.event_type}-${i}`} className="relative flex items-center gap-3">
                                              <div className={cn('absolute -left-[21px] w-2.5 h-2.5 rounded-full ring-2 ring-white', config.dotColor)} />
                                              <span className={cn('text-xs font-medium w-20', config.color)}>{config.label}</span>
                                              <span className="text-xs text-warm-400 tabular-nums">{formatTimestamp(event.occurred_at)}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {isEmailExpanded && sortedEvents.length === 0 && (
                                    <div className="pl-10 pb-2 pt-1">
                                      <p className="text-xs text-warm-400">No tracking events recorded</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Bounced Tab ── */}
          {subTab === 'bounced' && (
            <div>
              <CrossRefBanner
                icon={<IconActivity size={14} />}
                text="This list shows coaches whose Helm sends bounced. For the full bounces and complaints feed from Resend, see"
                linkLabel="Resend activity"
              />
              {bouncedCoaches.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center mx-auto mb-2">
                    <IconCheckCircle2 size={18} className="text-primary-400" />
                  </div>
                  <p className="text-sm font-medium text-warm-500">No bounced emails</p>
                  <p className="text-xs text-warm-400 mt-0.5">All email addresses are healthy</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-warm-500 mb-3">
                    {bouncedCoaches.length} coach{bouncedCoaches.length !== 1 ? 'es' : ''} with delivery failures. Suppress to prevent future sends and protect your sender reputation.
                  </p>
                  {bouncedCoaches.map(coach => (
                    <div
                      key={coach.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-red-50/50 border border-red-100/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-warm-900 truncate">{coach.name}</p>
                        <p className="text-xs text-warm-500 truncate">{coach.school} · {coach.email}</p>
                      </div>
                      <Button variant="danger"
                        onClick={() => handleSuppress(coach)}
                        disabled={suppressingIds.has(coach.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                          'bg-red-100 text-red-700 hover:bg-red-200',
                          'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        <Ban size={12} />
                        {suppressingIds.has(coach.id) ? 'Suppressing...' : 'Suppress'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Small inline banner that points users toward the Resend tab for deeper
 * deliverability analytics (domain breakdowns, live feed, full event timeline).
 */
function CrossRefBanner({
  icon,
  text,
  linkLabel,
}: {
  icon: React.ReactNode;
  text: string;
  linkLabel: string;
}) {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 px-3.5 py-2.5 mb-4 rounded-xl bg-primary-50/60 border border-primary-100/60 text-xs text-warm-700"
    >
      <span className="text-primary-600 flex-shrink-0 mt-0.5" aria-hidden="true">
        {icon}
      </span>
      <p className="leading-relaxed">
        {text}{' '}
        <a
          href="/golf/admin/crm?tab=outreach&outreach=resend"
          className="inline-flex items-center gap-1 text-primary-700 hover:text-primary-800 font-semibold underline-offset-2 hover:underline transition-colors"
        >
          {linkLabel}
          <IconExternalLink size={10} aria-hidden="true" />
        </a>
        .
      </p>
    </div>
  );
}

function StatCard({
  icon, iconBg, iconColor, label, value, subtitle,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className={cn(
      'glass-standard rounded-2xl p-5',
      'shadow-glass',
      'transition-[transform,box-shadow] duration-200 group',
      'hover:-translate-y-0.5 hover:shadow-lg',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-warm-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-warm-900 tabular-nums tracking-tight mt-1">{value}</p>
          {subtitle && <p className="text-eyebrow text-warm-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          'transition-transform duration-200 group-hover:scale-105',
          iconBg, iconColor
        )}>
          {icon}
        </div>
      </div>
    </div>
  );
}
