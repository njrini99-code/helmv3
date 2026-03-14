'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  IconMail,
  IconCheckCircle2,
  IconWarning,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconSend,
  IconEye,
  IconTarget as MousePointerClick,
  IconShieldAlert as ShieldAlert,
  IconXCircle as Ban,
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

type FilterTab = 'all' | 'delivered' | 'opened' | 'bounced';
type SortField = 'date' | 'status';

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

function getEmailStatus(events: EmailEvent[]): string {
  const types = new Set(events.map(e => e.event_type));
  if (types.has('email.bounced') || types.has('email.complained')) return 'bounced';
  if (types.has('email.clicked')) return 'clicked';
  if (types.has('email.opened')) return 'opened';
  if (types.has('email.delivered')) return 'delivered';
  if (types.has('email.sent')) return 'sent';
  return 'sent';
}

const STATUS_BADGE_DEFAULT = { label: 'Sent', color: 'text-warm-600', bgColor: 'bg-warm-50', icon: <IconSend size={12} /> };

const STATUS_BADGE_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  sent:      { label: 'Sent',      color: 'text-warm-600',    bgColor: 'bg-warm-50',    icon: <IconSend size={12} /> },
  delivered: { label: 'Delivered', color: 'text-blue-600',    bgColor: 'bg-blue-50',    icon: <IconCheckCircle2 size={12} /> },
  opened:    { label: 'Opened',   color: 'text-emerald-600', bgColor: 'bg-emerald-50', icon: <IconEye size={12} /> },
  clicked:   { label: 'Clicked',  color: 'text-violet-600',  bgColor: 'bg-violet-50',  icon: <MousePointerClick size={12} /> },
  bounced:   { label: 'Bounced',  color: 'text-red-600',     bgColor: 'bg-red-50',     icon: <IconWarning size={12} /> },
};

const EVENT_TIMELINE_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  'email.sent':      { label: 'Sent',      color: 'text-warm-600',    dotColor: 'bg-warm-400' },
  'email.delivered': { label: 'Delivered', color: 'text-blue-600',    dotColor: 'bg-blue-500' },
  'email.opened':    { label: 'Opened',   color: 'text-emerald-600', dotColor: 'bg-emerald-500' },
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
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [suppressingIds, setSuppressingIds] = useState<Set<string>>(new Set());

  const supabase = createClient();

  // ── Data Fetching ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch stats and emails in parallel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [statsRes, emailsRes] = await Promise.all([
        (supabase as any).rpc('get_crm_email_stats'),
        supabase
          .from('crm_contact_log')
          .select('*, crm_coaches!coach_id(id, name, school, email, email_status), crm_email_events(event_type, occurred_at)')
          .not('resend_message_id', 'is', null)
          .order('contact_date', { ascending: false }),
      ]);

      if (statsRes.data) {
        setStats(statsRes.data as EmailStats);
      }

      if (emailsRes.data) {
        setEmails(emailsRes.data as unknown as EmailRecord[]);
      }
    } catch (err) {
      // Silently handle — stats/emails will show empty state
      void err;
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Suppress Coach Email ──
  const handleSuppress = async (coachId: string) => {
    setSuppressingIds(prev => new Set(prev).add(coachId));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('crm_coaches')
        .update({ email_status: 'bounced' })
        .eq('id', coachId);

      // Update local state
      setEmails(prev =>
        prev.map(e =>
          e.crm_coaches?.id === coachId
            ? { ...e, crm_coaches: { ...e.crm_coaches!, email_status: 'bounced' } }
            : e
        )
      );
    } finally {
      setSuppressingIds(prev => {
        const next = new Set(prev);
        next.delete(coachId);
        return next;
      });
    }
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
    // Default is already sorted by date from the query

    return result;
  }, [emails, filterTab, sortField]);

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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-4 lg:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-20 bg-warm-100 rounded animate-pulse" />
                  <div className="h-8 w-16 bg-warm-100 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-warm-50 rounded animate-pulse" />
                </div>
                <div className="w-10 h-10 rounded-xl bg-warm-50 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        {/* Table Skeleton */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-5">
          <div className="h-5 w-40 bg-warm-100 rounded animate-pulse mb-6" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-10 flex-1 bg-warm-50 rounded-xl animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Empty State ──
  if (!stats || stats.total_sent === 0) {
    return (
      <div className="max-w-[1400px] mx-auto">
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-5">
            <IconMail size={28} className="text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-warm-900 mb-2">No emails sent yet</h3>
          <p className="text-sm text-warm-500 max-w-md mx-auto leading-relaxed">
            When you send emails to coaches through the CRM, delivery tracking, open rates, and click
            analytics will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* ══════════════ A. KPI Cards ══════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          icon={<IconSend size={20} />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label="Total Sent"
          value={stats.total_sent.toString()}
          detail="All time"
        />
        <KPICard
          icon={<IconCheckCircle2 size={20} />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          label="Delivered"
          value={`${stats.total_sent > 0 ? Math.round((stats.delivered / stats.total_sent) * 100) : 0}%`}
          detail={`${stats.delivered} delivered`}
        />
        <KPICard
          icon={<IconEye size={20} />}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
          label="Opened"
          value={`${stats.total_sent > 0 ? Math.round((stats.opened / stats.total_sent) * 100) : 0}%`}
          detail={`${stats.opened} opened`}
        />
        <KPICard
          icon={<MousePointerClick size={20} />}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
          label="Clicked"
          value={`${stats.total_sent > 0 ? Math.round((stats.clicked / stats.total_sent) * 100) : 0}%`}
          detail={`${stats.clicked} clicked`}
        />
        <KPICard
          icon={<IconWarning size={20} />}
          iconBg="bg-red-50"
          iconColor="text-red-600"
          label="Bounced"
          value={`${stats.total_sent > 0 ? Math.round((stats.bounced / stats.total_sent) * 100) : 0}%`}
          detail={`${stats.bounced} bounced`}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* ══════════════ C. Bounced Coaches Alert ══════════════ */}
      {bouncedCoaches.length > 0 && (
        <div className="bg-red-50/70 backdrop-blur-xl border border-red-200/40 rounded-2xl shadow-glass p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center">
              <ShieldAlert size={16} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-red-900">Bounced Email Addresses</h3>
              <p className="text-xs text-red-600/70">
                {bouncedCoaches.length} coach{bouncedCoaches.length !== 1 ? 'es' : ''} with delivery failures — suppress to prevent future sends
              </p>
            </div>
          </div>
          <p className="text-xs text-red-700/60 mb-4 leading-relaxed">
            Suppressing a coach marks their email as invalid and prevents future email sends to protect your sender reputation.
            You can update their email address later to re-enable sending.
          </p>
          <div className="space-y-2">
            {bouncedCoaches.map(coach => (
              <div
                key={coach.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white/60 border border-red-100/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-warm-900 truncate">{coach.name}</p>
                  <p className="text-xs text-warm-500 truncate">{coach.school} &middot; {coach.email}</p>
                </div>
                <button
                  onClick={() => handleSuppress(coach.id)}
                  disabled={suppressingIds.has(coach.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    'bg-red-100 text-red-700 hover:bg-red-200',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <Ban size={12} />
                  {suppressingIds.has(coach.id) ? 'Suppressing...' : 'Suppress'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════ B. Email Activity Table ══════════════ */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass">
        {/* Header + Filter Tabs */}
        <div className="px-5 pt-5 pb-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                <IconMail size={16} className="text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-warm-900">Email Activity</h3>
                <p className="text-xs text-warm-500">{filteredEmails.length} email{filteredEmails.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-warm-400">Sort:</span>
              <button
                onClick={() => setSortField(sortField === 'date' ? 'status' : 'date')}
                className="text-xs font-medium text-warm-600 hover:text-warm-900 px-2.5 py-1 rounded-lg bg-warm-50 hover:bg-warm-100 transition-colors"
              >
                {sortField === 'date' ? 'Date' : 'Status'}
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1 border-b border-warm-100">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition-colors relative',
                  filterTab === tab.id
                    ? 'text-warm-900'
                    : 'text-warm-400 hover:text-warm-600'
                )}
              >
                {tab.label}
                {filterTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="px-5 pb-5">
          {filteredEmails.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mx-auto mb-2">
                <IconMail size={18} className="text-warm-300" />
              </div>
              <p className="text-sm font-medium text-warm-500">No emails match this filter</p>
              <p className="text-xs text-warm-400 mt-0.5">Try a different filter tab above</p>
            </div>
          ) : (
            <div className="divide-y divide-warm-100/50">
              {/* Desktop Header */}
              <div className="hidden lg:grid lg:grid-cols-12 gap-4 py-3 text-xs font-semibold text-warm-400 uppercase tracking-wider">
                <div className="col-span-3">Recipient</div>
                <div className="col-span-4">Subject</div>
                <div className="col-span-2">Sent</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-1" />
              </div>

              {filteredEmails.map(email => {
                const status = getEmailStatus(email.crm_email_events || []);
                const badge = STATUS_BADGE_CONFIG[status] ?? STATUS_BADGE_DEFAULT;
                const isExpanded = expandedIds.has(email.id);
                const sortedEvents = [...(email.crm_email_events || [])].sort(
                  (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
                );

                return (
                  <div key={email.id}>
                    {/* Row */}
                    <button
                      onClick={() => toggleExpanded(email.id)}
                      className="w-full text-left grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-4 py-3 hover:bg-warm-50/50 transition-colors rounded-lg px-1 -mx-1"
                    >
                      {/* Recipient */}
                      <div className="lg:col-span-3 flex items-center gap-2 min-w-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-warm-900 truncate">
                            {email.crm_coaches?.name || 'Unknown'}
                          </p>
                          <p className="text-xs text-warm-400 truncate">
                            {email.crm_coaches?.school || ''}
                          </p>
                        </div>
                      </div>

                      {/* Subject */}
                      <div className="lg:col-span-4 flex items-center min-w-0">
                        <p className="text-sm text-warm-700 truncate">
                          {email.subject || '(no subject)'}
                        </p>
                      </div>

                      {/* Sent Date */}
                      <div className="lg:col-span-2 flex items-center">
                        <div className="flex items-center gap-1.5 text-xs text-warm-500">
                          <IconClock size={12} />
                          <span className="tabular-nums">{formatRelative(email.contact_date)}</span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="lg:col-span-2 flex items-center">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                          badge.bgColor, badge.color
                        )}>
                          {badge.icon}
                          {badge.label}
                        </span>
                      </div>

                      {/* Expand Icon */}
                      <div className="lg:col-span-1 flex items-center justify-end">
                        {isExpanded
                          ? <IconChevronDown size={14} className="text-warm-400" />
                          : <IconChevronRight size={14} className="text-warm-300" />
                        }
                      </div>
                    </button>

                    {/* Expanded Timeline */}
                    {isExpanded && sortedEvents.length > 0 && (
                      <div className="pl-4 lg:pl-8 pb-3 pt-1">
                        <div className="relative pl-4 border-l-2 border-warm-100 space-y-2.5">
                          {sortedEvents.map((event, i) => {
                            const config = EVENT_TIMELINE_CONFIG[event.event_type] || {
                              label: event.event_type,
                              color: 'text-warm-500',
                              dotColor: 'bg-warm-300',
                            };
                            return (
                              <div key={`${event.event_type}-${i}`} className="relative flex items-center gap-3">
                                <div className={cn(
                                  'absolute -left-[21px] w-2.5 h-2.5 rounded-full ring-2 ring-white',
                                  config.dotColor
                                )} />
                                <span className={cn('text-xs font-medium w-20', config.color)}>
                                  {config.label}
                                </span>
                                <span className="text-xs text-warm-400 tabular-nums">
                                  {formatTimestamp(event.occurred_at)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {isExpanded && sortedEvents.length === 0 && (
                      <div className="pl-4 lg:pl-8 pb-3 pt-1">
                        <p className="text-xs text-warm-400">No tracking events recorded</p>
                      </div>
                    )}
                  </div>
                );
              })}
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
function KPICard({
  icon, iconBg, iconColor, label, value, detail, className,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  detail: string;
  className?: string;
}) {
  return (
    <div className={cn(
      'relative overflow-hidden',
      'bg-white/70 backdrop-blur-xl',
      'border border-white/20 rounded-2xl',
      'shadow-glass',
      'p-4 lg:p-5',
      'transition-[transform,box-shadow] duration-200 group',
      'hover:-translate-y-0.5 hover:shadow-lg',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-label font-semibold text-warm-500 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-warm-900 tabular-nums tracking-tight mt-1">{value}</p>
          <p className="text-xs text-warm-400 mt-1">{detail}</p>
        </div>
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]',
          'transition-transform duration-200 group-hover:scale-105',
          iconBg, iconColor
        )}>
          {icon}
        </div>
      </div>
    </div>
  );
}
