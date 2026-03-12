'use client';

import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Clock3, Route, ShieldAlert } from 'lucide-react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { timeAgo } from './admin-utils';

interface Props {
  errorDetection: AdminDashboardData['errorDetection'];
  errorLogs: AdminDashboardData['errorLogs'];
}

function formatRoute(route: string): string {
  if (route === '(no route)') return route;
  return route.replace(/\/:id/g, '/…');
}

export function ErrorSpotlight({ errorDetection, errorLogs }: Props) {
  const { errors24h, userExperienceIssues, errorsByRoute } = errorDetection;
  const { incidentCounts, recentErrors, totalErrors7d } = errorLogs;

  const liveIncidentCount = incidentCounts.open + incidentCounts.active;
  const allClear = liveIncidentCount === 0;
  const leadIncident = recentErrors.find((incident) => incident.status === 'open')
    ?? recentErrors.find((incident) => incident.status === 'active')
    ?? recentErrors[0]
    ?? null;

  const uxSignals = [
    { label: 'Chunk load', count: userExperienceIssues.chunkLoadErrors, tone: 'critical' as const },
    { label: 'Framework', count: userExperienceIssues.frameworkWarnings, tone: 'warning' as const },
    { label: 'Server', count: userExperienceIssues.serverErrors, tone: 'critical' as const },
    { label: 'Auth', count: userExperienceIssues.authErrors, tone: 'warning' as const },
  ].filter((signal) => signal.count > 0);

  const routeHotspots = errorsByRoute.slice(0, 3);

  return (
    <div className={cn(
      'bg-white/70 backdrop-blur-xl',
      'border border-white/20 rounded-2xl',
      'shadow-glass',
      'p-5 md:p-6',
      'h-full'
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-8 h-8 rounded-xl flex items-center justify-center',
            allClear ? 'bg-primary-50' : incidentCounts.open > 0 ? 'bg-red-50' : 'bg-amber-50'
          )}>
            {allClear ? (
              <CheckCircle2 size={16} className="text-primary-600" />
            ) : incidentCounts.open > 0 ? (
              <AlertTriangle size={16} className="text-red-600" />
            ) : (
              <ShieldAlert size={16} className="text-amber-600" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-warm-900">Error Spotlight</h3>
            <p className="text-xs text-warm-400">Live incident pressure plus 7-day context</p>
          </div>
        </div>

        <span className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]',
          allClear
            ? 'border-primary-200 bg-primary-50 text-primary-700'
            : incidentCounts.open > 0
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
        )}>
          {allClear ? 'Clear' : incidentCounts.open > 0 ? 'Action needed' : 'Watch'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/30 bg-white/55 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Open</p>
          <p className={cn(
            'mt-1 text-xl font-bold tabular-nums',
            incidentCounts.open > 0 ? 'text-red-600' : 'text-warm-900'
          )}>
            {incidentCounts.open}
          </p>
          <p className="mt-0.5 text-micro uppercase tracking-wider text-warm-400">unresolved queue</p>
        </div>
        <div className="rounded-xl border border-white/30 bg-white/55 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Active</p>
          <p className={cn(
            'mt-1 text-xl font-bold tabular-nums',
            incidentCounts.active > 0 ? 'text-amber-600' : 'text-warm-900'
          )}>
            {incidentCounts.active}
          </p>
          <p className="mt-0.5 text-micro uppercase tracking-wider text-warm-400">recent repeats</p>
        </div>
        <div className="rounded-xl border border-white/30 bg-white/55 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Resolved</p>
          <p className={cn(
            'mt-1 text-xl font-bold tabular-nums',
            incidentCounts.resolvedRecently > 0 ? 'text-primary-600' : 'text-warm-900'
          )}>
            {incidentCounts.resolvedRecently}
          </p>
          <p className="mt-0.5 text-micro uppercase tracking-wider text-warm-400">in 24h</p>
        </div>
        <div className="rounded-xl border border-white/30 bg-white/55 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Raw Rows</p>
          <p className={cn(
            'mt-1 text-xl font-bold tabular-nums',
            errors24h > 0 ? 'text-amber-600' : 'text-warm-900'
          )}>
            {errors24h}
          </p>
          <p className="mt-0.5 text-micro uppercase tracking-wider text-warm-400">24h of {totalErrors7d} in 7d</p>
        </div>
      </div>

      {leadIncident ? (
        <div className={cn(
          'mt-4 rounded-2xl border p-4',
          leadIncident.status === 'open'
            ? 'border-red-100 bg-red-50/45'
            : leadIncident.status === 'active'
              ? 'border-amber-100 bg-amber-50/45'
              : 'border-white/35 bg-white/55'
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-500">
                {leadIncident.status === 'open' ? 'Lead incident' : leadIncident.status === 'active' ? 'Most recent live signal' : 'Latest grouped incident'}
              </p>
              <p className="mt-1 text-sm font-semibold text-warm-900">{leadIncident.title}</p>
              <p className="mt-1 text-sm leading-6 text-warm-700">{leadIncident.summary}</p>
            </div>
            <span className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
              leadIncident.status === 'open'
                ? 'border-red-200 bg-red-100 text-red-700'
                : leadIncident.status === 'active'
                  ? 'border-amber-200 bg-amber-100 text-amber-700'
                  : 'border-slate-200 bg-slate-100 text-slate-600'
            )}>
              {leadIncident.status}
            </span>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-white/40 bg-white/70 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Diagnosis basis</p>
              <p className="mt-1 text-xs leading-5 text-warm-700">{leadIncident.diagnosisBasis}</p>
            </div>
            <div className="rounded-xl border border-white/40 bg-white/70 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Last seen</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-warm-700">
                <Clock3 size={12} className="text-warm-400" />
                <span>{timeAgo(leadIncident.lastSeen)} · {leadIncident.occurrences} occurrences</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-primary-100 bg-primary-50/50 px-6 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100">
            <CheckCircle2 size={22} className="text-primary-600" />
          </div>
          <p className="mt-3 text-sm font-medium text-primary-700">No grouped incidents to spotlight</p>
          <p className="mt-1 text-xs text-warm-400">The overview is not seeing any recent incident groups.</p>
        </div>
      )}

      {(uxSignals.length > 0 || routeHotspots.length > 0) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-micro font-medium uppercase tracking-wider text-warm-400">User-visible impact</p>
            <div className="mt-2 space-y-1.5">
              {uxSignals.length > 0 ? uxSignals.map((signal) => (
                <div
                  key={signal.label}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-2.5 py-2',
                    signal.tone === 'critical' ? 'bg-red-50/50' : 'bg-amber-50/50'
                  )}
                >
                  <span className="text-xs text-warm-600">{signal.label}</span>
                  <span className={cn(
                    'text-xs font-semibold tabular-nums',
                    signal.tone === 'critical' ? 'text-red-600' : 'text-amber-600'
                  )}>
                    {signal.count}
                  </span>
                </div>
              )) : (
                <div className="rounded-lg bg-white/55 px-2.5 py-2 text-xs text-warm-500">
                  No user-visible impact patterns were detected.
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-micro font-medium uppercase tracking-wider text-warm-400">Route hotspots</p>
            <div className="mt-2 space-y-1.5">
              {routeHotspots.length > 0 ? routeHotspots.map((route) => (
                <div key={route.route} className="flex items-center gap-2 rounded-lg bg-white/55 px-2.5 py-2">
                  <Route size={12} className="text-warm-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-warm-700">{formatRoute(route.route)}</p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-warm-500">{route.count}</span>
                </div>
              )) : (
                <div className="rounded-lg bg-white/55 px-2.5 py-2 text-xs text-warm-500">
                  No route hotspots were captured.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
