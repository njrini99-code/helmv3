'use client';

import { useState, useEffect, useCallback } from 'react';
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

export function InboundLeadsView() {
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [processing, setProcessing] = useState<string | null>(null);

  const supabase = createClient();

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('demo_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data } = await query;
    setRequests((data || []) as DemoRequest[]);
    setLoading(false);
  }, [supabase, filter]);

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

    // Check if coach already exists
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

  // Refetch all for stats regardless of filter
  const [allRequests, setAllRequests] = useState<DemoRequest[]>([]);
  useEffect(() => {
    async function fetchAll() {
      const { data } = await supabase.from('demo_requests').select('*');
      setAllRequests((data || []) as DemoRequest[]);
    }
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests]);

  const allStats = {
    total: allRequests.length,
    new: allRequests.filter(r => !r.status || r.status === 'new').length,
    contacted: allRequests.filter(r => r.status === 'contacted').length,
    converted: allRequests.filter(r => r.status === 'converted').length,
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
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

      {/* Filter Tabs + Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/60 backdrop-blur-sm border border-white/20">
          {(['all', 'new', 'contacted', 'converted'] as FilterStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 capitalize',
                filter === f
                  ? 'bg-white shadow-sm text-warm-900'
                  : 'text-warm-500 hover:text-warm-700 hover:bg-white/40'
              )}
            >
              {f === 'all' ? 'All' : f}
              {f === 'new' && allStats.new > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                  {allStats.new}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={fetchRequests}
          aria-label="Refresh leads"
          className="p-2 rounded-lg hover:bg-warm-50 text-warm-400 hover:text-warm-600 transition-colors"
        >
          <IconRefresh size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Request List */}
      <div className="glass-standard rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
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
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-warm-50 flex items-center justify-center mx-auto mb-4">
              <IconMail size={24} className="text-warm-300" />
            </div>
            <p className="text-sm font-medium text-warm-500">No demo requests yet</p>
            <p className="text-xs text-warm-400 mt-1">Requests from the landing page will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-warm-100/50">
            {requests.map((request) => {
              const isNew = !request.status || request.status === 'new';
              const isContacted = request.status === 'contacted';
              const isConverted = request.status === 'converted';
              const isProcessing = processing === request.id;

              return (
                <div
                  key={request.id}
                  className={cn(
                    'flex items-center gap-4 px-6 py-4 transition-colors',
                    isNew && 'bg-amber-50/30',
                  )}
                >
                  {/* Status indicator */}
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                    isNew && 'bg-amber-100',
                    isContacted && 'bg-violet-100',
                    isConverted && 'bg-primary-100',
                  )}>
                    {isNew && <IconMail size={18} className="text-amber-600" />}
                    {isContacted && <IconCheckCircle2 size={18} className="text-violet-600" />}
                    {isConverted && <IconUserPlus size={18} className="text-primary-600" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-warm-900 truncate">
                        {request.email}
                      </p>
                      {isNew && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700">
                          New
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {request.name && (
                        <span className="text-xs text-warm-500">{request.name}</span>
                      )}
                      {request.organization && (
                        <span className="text-xs text-warm-400">{request.organization}</span>
                      )}
                      <span className="text-xs text-warm-400 flex items-center gap-1">
                        <IconClock size={10} />
                        {request.created_at ? formatRelative(request.created_at) : 'Unknown'}
                      </span>
                      {request.interest_type && (
                        <span className="text-xs text-warm-400 capitalize">{request.interest_type.replace('_', ' ')}</span>
                      )}
                    </div>
                    {request.message && (
                      <p className="text-xs text-warm-500 mt-1 truncate max-w-md">&ldquo;{request.message}&rdquo;</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isNew && (
                      <>
                        <button
                          onClick={() => markContacted(request.id)}
                          disabled={isProcessing}
                          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/60 border border-warm-200 text-warm-700 hover:bg-warm-50 transition-colors disabled:opacity-50"
                        >
                          Mark Contacted
                        </button>
                        <button
                          onClick={() => addToCRM(request)}
                          disabled={isProcessing}
                          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          <IconUserPlus size={12} />
                          Add to CRM
                        </button>
                      </>
                    )}
                    {isContacted && (
                      <button
                        onClick={() => addToCRM(request)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        <IconUserPlus size={12} />
                        Add to CRM
                      </button>
                    )}
                    {isConverted && (
                      <span className="text-xs text-primary-600 font-medium flex items-center gap-1">
                        <IconCheckCircle2 size={12} />
                        In CRM
                      </span>
                    )}
                    <a
                      href={`mailto:${request.email}`}
                      className="p-1.5 rounded-lg hover:bg-warm-50 text-warm-400 hover:text-warm-600 transition-colors"
                    >
                      <IconExternalLink size={14} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

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
      highlight ? 'border-amber-200/50 ring-1 ring-amber-200/30' : 'border-white/20',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-label font-semibold text-warm-500 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-warm-900 tabular-nums tracking-tight mt-1">{value}</p>
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', iconBg, iconColor)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

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
