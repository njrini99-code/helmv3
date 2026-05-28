'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  IconMail,
  IconClock,
  IconCheckCircle2,
  IconUserPlus,
  IconRefresh,
  IconExternalLink,
} from '@/components/icons';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EmailStatusBadge } from './EmailStatusBadge';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CoachEmailRow {
  id: string;
  email: string | null;
  email_status: string | null;
  last_email_event_type: string | null;
  last_email_event_at: string | null;
}

interface DemoRequest {
  id: string;
  email: string;
  name: string | null;
  organization: string | null;
  phone: string | null;
  message: string | null;
  interest_type: string | null;
  status: string | null;
  notes: string | null;
  contacted_at: string | null;
  contacted_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

type FilterStatus = 'all' | 'new' | 'contacted' | 'converted';

const FILTER_LABELS: Record<FilterStatus, string> = {
  all: 'All',
  new: 'New',
  contacted: 'Contacted',
  converted: 'Added',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function InboundLeadsView() {
  const [allRequests, setAllRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [processing, setProcessing] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch once — filter client-side so we get stats + filtered view from one query.
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('demo_requests')
      .select('*')
      .order('created_at', { ascending: false });
    setAllRequests((data || []) as DemoRequest[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const markContacted = async (id: string) => {
    setProcessing(id);
    await supabase.from('demo_requests').update({
      status: 'contacted',
      contacted_at: new Date().toISOString(),
    }).eq('id', id);
    await fetchRequests();
    setProcessing(null);
  };

  const addToCRM = async (request: DemoRequest) => {
    setProcessing(request.id);

    const { data: existing } = await supabase
      .from('crm_coaches')
      .select('id')
      .eq('email', request.email)
      .maybeSingle();

    if (!existing) {
      await supabase.from('crm_coaches').insert({
        name: request.name || request.email.split('@')[0] || 'Unknown',
        email: request.email,
        school: request.organization || request.email.split('@')[1]?.split('.')[0] || 'Unknown',
        conference: '',
        division: 'D3',
        program: 'both',
        status: 'new_lead',
        source: 'website',
        notes: request.message
          ? `Demo request: ${request.message}`
          : 'Submitted demo request from landing page',
      });
    }

    await supabase.from('demo_requests').update({
      status: 'converted',
    }).eq('id', request.id);

    await fetchRequests();
    setProcessing(null);
  };

  const allStats = useMemo(() => ({
    total: allRequests.length,
    new: allRequests.filter(r => !r.status || r.status === 'new').length,
    contacted: allRequests.filter(r => r.status === 'contacted').length,
    converted: allRequests.filter(r => r.status === 'converted').length,
  }), [allRequests]);

  const requests = useMemo(() => {
    if (filter === 'all') return allRequests;
    if (filter === 'new') {
      return allRequests.filter(r => !r.status || r.status === 'new');
    }
    return allRequests.filter(r => r.status === filter);
  }, [allRequests, filter]);

  // Batch-fetch CRM coach email status for the currently visible leads so we
  // can render the EmailStatusBadge inline. One query, one map lookup per row.
  const leadEmails = useMemo(() => {
    const set = new Set<string>();
    for (const r of requests) {
      if (r.email) set.add(r.email.toLowerCase());
    }
    return Array.from(set);
  }, [requests]);

  const [coachByEmail, setCoachByEmail] = useState<Map<string, CoachEmailRow>>(new Map());
  useEffect(() => {
    let cancelled = false;
    async function fetchCoaches() {
      if (leadEmails.length === 0) {
        if (!cancelled) setCoachByEmail(new Map());
        return;
      }
      // Stream 1's migration adds `last_email_event_type` and
      // `last_email_event_at`; the generated Database types may not yet
      // include them, so we widen the client here and narrow via the local
      // CoachEmailRow type below.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const { data } = await client
        .from('crm_coaches')
        .select('id, email, email_status, last_email_event_type, last_email_event_at')
        .in('email', leadEmails);
      if (cancelled) return;
      const next = new Map<string, CoachEmailRow>();
      const rows = (data ?? []) as CoachEmailRow[];
      for (const row of rows) {
        if (row.email) next.set(row.email.toLowerCase(), row);
      }
      setCoachByEmail(next);
    }
    fetchCoaches();
    return () => { cancelled = true; };
  }, [supabase, leadEmails]);

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-warm-900 tracking-tight">
            Inbound leads
          </h2>
          <p className="text-sm text-warm-500 mt-1">
            Demo requests from the landing page. Triage, contact, then promote into the CRM.
          </p>
        </div>
        <Button variant="ghost"
          type="button"
          onClick={fetchRequests}
          aria-label="Refresh inbound leads"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/60 border border-warm-200/60 text-warm-600 hover:text-warm-900 hover:bg-white transition-colors self-start sm:self-auto"
        >
          <IconRefresh size={13} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<IconMail size={20} />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label="Total Requests"
          value={allStats.total}
        />
        <StatCard
          icon={<IconMail size={20} />}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          label="New / Uncontacted"
          value={allStats.new}
          highlight={allStats.new > 0}
        />
        <StatCard
          icon={<IconCheckCircle2 size={20} />}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
          label="Contacted"
          value={allStats.contacted}
        />
        <StatCard
          icon={<IconUserPlus size={20} />}
          iconBg="bg-primary-50"
          iconColor="text-primary-600"
          label="Added to CRM"
          value={allStats.converted}
        />
      </div>

      {/* Filter — segmented control on the inbound-leads list */}
      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(v) => {
          if (v) setFilter(v as FilterStatus);
        }}
        aria-label="Filter inbound leads by status"
      >
        {(Object.keys(FILTER_LABELS) as FilterStatus[]).map((f) => {
          const count =
            f === 'all' ? allStats.total :
            f === 'new' ? allStats.new :
            f === 'contacted' ? allStats.contacted :
            allStats.converted;
          return (
            <ToggleGroupItem
              key={f}
              value={f}
              aria-controls="inbound-leads-list"
              className="flex items-center gap-1.5"
            >
              {FILTER_LABELS[f]}
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-eyebrow font-semibold tabular-nums',
                  f === 'new' && count > 0
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-warm-100 text-warm-600',
                )}
              >
                {count}
              </span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      {/* Request List */}
      <div
        id="inbound-leads-list"
        role="tabpanel"
        aria-live="polite"
        className="glass-standard rounded-2xl overflow-hidden"
      >
        {loading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-warm-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-warm-100 rounded" />
                  <div className="h-3 w-32 bg-warm-50 rounded" />
                </div>
                <div className="h-8 w-24 bg-warm-100 rounded-lg" />
              </div>
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-warm-50 flex items-center justify-center mx-auto mb-4">
              <IconMail size={24} className="text-warm-300" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-warm-900">
              {filter === 'all'
                ? 'No demo requests yet'
                : `No ${FILTER_LABELS[filter].toLowerCase()} leads`}
            </p>
            <p className="text-xs text-warm-500 mt-1 max-w-sm mx-auto">
              {filter === 'all'
                ? 'Requests submitted from the landing page will appear here in real time.'
                : 'Adjust the filter above to see other leads.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-warm-100/60">
            {requests.map((request) => {
              const isNew = !request.status || request.status === 'new';
              const isContacted = request.status === 'contacted';
              const isConverted = request.status === 'converted';
              const isProcessing = processing === request.id;
              const coachRow = request.email
                ? coachByEmail.get(request.email.toLowerCase())
                : undefined;

              return (
                <li
                  key={request.id}
                  className={cn(
                    'flex items-center gap-4 px-6 py-4 transition-colors',
                    isNew && 'bg-amber-50/30',
                  )}
                >
                  {/* Status indicator */}
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                      isNew && 'bg-amber-100',
                      isContacted && 'bg-violet-100',
                      isConverted && 'bg-primary-100',
                    )}
                    aria-hidden="true"
                  >
                    {isNew && <IconMail size={18} className="text-amber-600" />}
                    {isContacted && <IconCheckCircle2 size={18} className="text-violet-600" />}
                    {isConverted && <IconUserPlus size={18} className="text-primary-600" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-warm-900 truncate">
                        {request.email}
                      </p>
                      {isNew && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-eyebrow font-semibold uppercase tracking-wide">
                          New
                        </span>
                      )}
                      {coachRow ? (
                        <EmailStatusBadge
                          email_status={coachRow.email_status}
                          last_email_event_type={coachRow.last_email_event_type}
                          last_email_event_at={coachRow.last_email_event_at}
                          compact
                        />
                      ) : (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded-full border border-warm-200/80 bg-warm-50 text-warm-500 text-eyebrow font-medium"
                          title="This lead is not yet in the CRM"
                        >
                          Not in CRM
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-x-3 gap-y-0.5 mt-1 flex-wrap text-xs text-warm-500">
                      {request.name && (
                        <span className="text-warm-600">{request.name}</span>
                      )}
                      {request.organization && (
                        <span>{request.organization}</span>
                      )}
                      <span className="flex items-center gap-1 tabular-nums" title={request.created_at ?? undefined}>
                        <IconClock size={10} aria-hidden="true" />
                        {request.created_at ? formatRelative(request.created_at) : 'Unknown'}
                      </span>
                      {request.interest_type && (
                        <span className="capitalize">{request.interest_type.replace(/_/g, ' ')}</span>
                      )}
                    </div>
                    {request.message && (
                      <p className="text-xs text-warm-500 mt-1 truncate max-w-md italic">
                        &ldquo;{request.message}&rdquo;
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isNew && (
                      <Button variant="ghost"
                        type="button"
                        onClick={() => markContacted(request.id)}
                        disabled={isProcessing}
                        aria-label={`Mark ${request.email} as contacted`}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/60 border border-warm-200/60 text-warm-700 hover:bg-white hover:text-warm-900 transition-colors disabled:opacity-50"
                      >
                        Mark Contacted
                      </Button>
                    )}
                    {(isNew || isContacted) && (
                      <Button variant="primary"
                        type="button"
                        onClick={() => addToCRM(request)}
                        disabled={isProcessing}
                        aria-label={`Add ${request.email} to CRM`}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <IconUserPlus size={12} aria-hidden="true" />
                        Add to CRM
                      </Button>
                    )}
                    {isConverted && (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-primary-600 font-medium"
                        aria-label="Already in CRM"
                      >
                        <IconCheckCircle2 size={12} aria-hidden="true" />
                        In CRM
                      </span>
                    )}
                    <a
                      href={`mailto:${request.email}`}
                      aria-label={`Compose email to ${request.email}`}
                      className="p-1.5 rounded-lg hover:bg-white text-warm-400 hover:text-warm-700 transition-colors"
                    >
                      <IconExternalLink size={14} aria-hidden="true" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------
function StatCard({
  icon, iconBg, iconColor, label, value, highlight,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      'bg-white/70 backdrop-blur-xl border rounded-2xl shadow-glass p-4 lg:p-5 transition-all',
      highlight ? 'border-amber-200/60 ring-1 ring-amber-200/40' : 'border-white/20',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-warm-900 tabular-nums tracking-tight mt-1">{value}</p>
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', iconBg, iconColor)} aria-hidden="true">
          {icon}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
