'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconActivity,
  IconMail,
  IconGlobe,
  IconWarning,
  IconChartBar,
  IconExternalLink,
} from '@/components/icons';
import type {
  ActivityWindow,
  ResendActivityStats,
  EmailRow,
} from '@/app/golf/actions/resend-activity';
import {
  getResendActivityStats,
  getFailedEmails,
} from '@/app/golf/actions/resend-activity';
import { WINDOW_OPTIONS, deriveStatus, STATUS_CONFIG, formatRelative } from './shared';
import { KPIGrid, DailyTrendChart } from './KPIGrid';
import { LiveActivityFeed } from './LiveActivityFeed';
import { EmailsTable } from './EmailsTable';
import { EmailDetailPanel } from './EmailDetailPanel';
import { DomainBreakdown } from './DomainBreakdown';

type FollowupRecipient = {
  email: string;
  name?: string | null;
  coach_id?: string | null;
};

interface ResendActivityViewProps {
  onSendFollowup?: (recipients: FollowupRecipient[]) => void;
}

type SubTab = 'overview' | 'activity' | 'emails' | 'failed' | 'domains';

const SUB_TABS: {
  id: SubTab;
  label: string;
  Icon: typeof IconChartBar;
  description: string;
}[] = [
  {
    id: 'overview',
    label: 'Overview',
    Icon: IconChartBar,
    description: 'KPIs and daily trends',
  },
  {
    id: 'activity',
    label: 'Activity',
    Icon: IconActivity,
    description: 'Live event feed',
  },
  {
    id: 'emails',
    label: 'All emails',
    Icon: IconMail,
    description: 'Searchable history',
  },
  {
    id: 'failed',
    label: 'Failed',
    Icon: IconWarning,
    description: 'Bounces and complaints',
  },
  {
    id: 'domains',
    label: 'Domains',
    Icon: IconGlobe,
    description: 'Deliverability by domain',
  },
];

export function ResendActivityView({ onSendFollowup }: ResendActivityViewProps = {}) {
  const [activeTab, setActiveTab] = useState<SubTab>('overview');
  const [windowSel, setWindowSel] = useState<ActivityWindow>('7d');
  const [stats, setStats] = useState<ResendActivityStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const data = await getResendActivityStats(windowSel);
    setStats(data);
    setStatsLoading(false);
  }, [windowSel]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Poll stats every 60s for freshness (cheap — single RPC)
  useEffect(() => {
    const iv = setInterval(loadStats, 60_000);
    return () => clearInterval(iv);
  }, [loadStats]);

  return (
    <div className="space-y-5">
      {/* ── Header: title + window selector + sub-tabs ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-warm-900 tracking-tight">
              Resend activity
            </h2>
            <a
              href="https://resend.com/emails"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-warm-500 hover:text-primary-600 transition-colors"
              title="Open Resend dashboard"
            >
              <IconExternalLink size={12} />
              Resend
            </a>
          </div>
          <p className="text-sm text-warm-500 mt-1">
            Email deliverability mirrored from the Resend dashboard, in real time.
          </p>
        </div>

        {/* Window selector */}
        <WindowSelector value={windowSel} onChange={setWindowSel} />
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-warm-200/60 -mx-1 px-1 overflow-x-auto scrollbar-hide">
        {SUB_TABS.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'group relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                isActive
                  ? 'text-warm-900'
                  : 'text-warm-500 hover:text-warm-800'
              )}
            >
              <t.Icon size={15} />
              {t.label}
              {isActive && (
                <motion.div
                  layoutId="resend-tab-underline"
                  className="absolute bottom-0 left-1 right-1 h-[2px] bg-primary-500 rounded-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <div>
        {activeTab === 'overview' && (
          <div className="space-y-5">
            <KPIGrid stats={stats} loading={statsLoading} />
            <DailyTrendChart data={stats?.by_day ?? null} />
            <SourceBreakdown bySource={stats?.by_source ?? null} />
          </div>
        )}

        {activeTab === 'activity' && (
          <LiveActivityFeed
            initialLimit={100}
            onSelectMessage={setSelectedMessageId}
          />
        )}

        {activeTab === 'emails' && (
          <EmailsTable
            onSelectEmail={setSelectedMessageId}
            selectedMessageId={selectedMessageId}
            since={stats?.since}
          />
        )}

        {activeTab === 'failed' && <FailedEmailsView onSelect={setSelectedMessageId} />}

        {activeTab === 'domains' && <DomainBreakdown window={windowSel} />}
      </div>

      {/* Shared detail panel */}
      <EmailDetailPanel
        resendMessageId={selectedMessageId}
        onClose={() => setSelectedMessageId(null)}
        onSendFollowup={onSendFollowup}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Window selector
// ---------------------------------------------------------------------------
function WindowSelector({
  value,
  onChange,
}: {
  value: ActivityWindow;
  onChange: (w: ActivityWindow) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-white/60 border border-warm-200/60 rounded-xl">
      {WINDOW_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
            value === opt.id
              ? 'bg-warm-900 text-white shadow-sm'
              : 'text-warm-600 hover:text-warm-900'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source breakdown (CRM vs transactional) — a thin summary row
// ---------------------------------------------------------------------------
function SourceBreakdown({
  bySource,
}: {
  bySource: Record<string, number> | null;
}) {
  if (!bySource || Object.keys(bySource).length === 0) return null;

  const total = Object.values(bySource).reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;

  const entries = Object.entries(bySource).sort((a, b) => b[1] - a[1]);

  const COLORS: Record<string, string> = {
    crm: 'bg-blue-500',
    transactional: 'bg-primary-500',
    unknown: 'bg-warm-400',
  };

  return (
    <div className="glass-standard rounded-2xl p-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-warm-900">By source</p>
        <p className="text-xs text-warm-500">{total.toLocaleString()} emails</p>
      </div>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-warm-100 mb-4">
        {entries.map(([source, count]) => {
          const pct = (count / total) * 100;
          return (
            <div
              key={source}
              className={cn('h-full', COLORS[source] ?? 'bg-warm-300')}
              style={{ width: `${pct}%` }}
              title={`${source}: ${count} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-5 flex-wrap text-xs">
        {entries.map(([source, count]) => {
          const pct = (count / total) * 100;
          return (
            <div key={source} className="flex items-center gap-2">
              <span
                className={cn(
                  'w-2 h-2 rounded-sm',
                  COLORS[source] ?? 'bg-warm-300'
                )}
              />
              <span className="font-medium text-warm-900 capitalize">
                {source}
              </span>
              <span className="text-warm-500 tabular-nums">
                {count.toLocaleString()} · {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Failed emails view — bounces / complaints that need attention
// ---------------------------------------------------------------------------
function FailedEmailsView({ onSelect }: { onSelect: (id: string) => void }) {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await getFailedEmails(150);
      if (cancelled) return;
      setRows(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="glass-standard rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-warm-100/60">
          <div className="h-4 w-40 bg-warm-100 rounded animate-pulse" />
        </div>
        <div className="divide-y divide-warm-100/60">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="px-6 py-3 flex items-center gap-4 animate-pulse"
            >
              <div className="h-5 w-24 bg-warm-100 rounded-full" />
              <div className="h-4 w-52 bg-warm-100 rounded" />
              <div className="h-4 flex-1 bg-warm-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="glass-standard rounded-2xl p-10 text-center">
        <div className="p-3 rounded-full bg-emerald-50 text-emerald-600 inline-flex mb-3">
          <IconWarning size={20} />
        </div>
        <p className="text-sm font-semibold text-warm-900">
          No failed emails — nice
        </p>
        <p className="text-xs text-warm-500 mt-1 max-w-sm mx-auto">
          Nothing has bounced or been marked as spam. Future issues will appear
          here automatically.
        </p>
      </div>
    );
  }

  const bounceCount = rows.filter((r) => r.bounced_at).length;
  const complaintCount = rows.filter((r) => r.complained_at).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-standard rounded-xl p-4 border-l-[4px] border-l-red-500">
          <p className="text-xs font-medium text-warm-500 uppercase tracking-wide">
            Bounces
          </p>
          <p className="text-2xl font-bold text-warm-900 mt-1 tabular-nums">
            {bounceCount}
          </p>
        </div>
        <div className="glass-standard rounded-xl p-4 border-l-[4px] border-l-red-700">
          <p className="text-xs font-medium text-warm-500 uppercase tracking-wide">
            Complaints
          </p>
          <p className="text-2xl font-bold text-warm-900 mt-1 tabular-nums">
            {complaintCount}
          </p>
        </div>
      </div>

      {/* List */}
      <div className="glass-standard rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-warm-100/60">
          <p className="text-sm font-semibold text-warm-900">
            Emails requiring attention
          </p>
          <p className="text-xs text-warm-500 mt-0.5">
            Click any row to view the full event timeline.
          </p>
        </div>
        <ul className="divide-y divide-warm-100/60">
          {rows.map((row) => {
            const status = deriveStatus(row);
            const cfg = STATUS_CONFIG[status];
            const primaryTo = row.to_addresses?.[0] ?? '—';
            const failedAt = row.complained_at ?? row.bounced_at;

            return (
              <li
                key={row.resend_message_id}
                onClick={() => onSelect(row.resend_message_id)}
                className="px-6 py-3 cursor-pointer hover:bg-white/70 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0',
                      cfg.bgColor,
                      cfg.color
                    )}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-warm-900 truncate">
                      {primaryTo}
                    </p>
                    <p className="text-xs text-warm-500 truncate">
                      {row.subject || (
                        <span className="italic">(no subject)</span>
                      )}
                    </p>
                  </div>
                  <span
                    className="text-xs text-warm-500 tabular-nums shrink-0"
                    title={failedAt ?? undefined}
                  >
                    {formatRelative(failedAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
