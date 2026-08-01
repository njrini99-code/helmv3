'use client';

/**
 * IntentRankingPanel — the "Demo & reply intent" ranked list. Surfaces the
 * 158 coaches who toured the demo (and everyone else showing real buying
 * signal) who are otherwise invisible everywhere else in the CRM.
 *
 * Fetches getIntentRanking() on mount and tracks a 3-state machine
 * ('loading' | 'ready' | 'error') rather than the neighboring
 * SignalsPanel/InboxView "degrade to []" pattern — getIntentRanking()
 * deliberately does NOT swallow query failures, so an honest error state has
 * to be distinguishable from an honest "no hot leads" empty state (never
 * render an empty list that looks like "nothing to see").
 *
 * demo_visits and replies render as bold, accent-tinted chips — the real
 * signals. Opens render small and muted, only when >0. Clicks are NEVER
 * rendered: `v_crm_coach_signal_summary` doesn't even expose a clicks
 * column — 1,073 of 1,219 all-time clicks fired in one 10-minute window on
 * 2026-06-11 (a 511-email send), which is email-security-gateway link
 * scanning, not human engagement.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { IconMonitor, IconMessageSquare, IconEye } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { InlineNotice, EmptyState, SkeletonList } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  getIntentRanking,
  type IntentCoach,
  type IntentRankingResult,
} from '@/app/golf/actions/crm-intent';
import { STATUS_CONFIG, STATUS_COLORS, type CoachStatus } from '../crm-config';
import { CRM_SECONDARY_ACTION_CLASS } from '../page-contracts';

interface IntentRankingPanelProps {
  onCoachClick: (coachId: string) => void;
}

type LoadState = 'loading' | 'ready' | 'error';

export function IntentRankingPanel({ onCoachClick }: IntentRankingPanelProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [result, setResult] = useState<IntentRankingResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    (async () => {
      try {
        const data = await getIntentRanking();
        if (cancelled) return;
        setResult(data);
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load intent ranking');
        setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [reloadToken]);

  return (
    <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-fw-sm bg-accent-50">
          <IconMonitor size={16} className="text-accent-700" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-text-primary">Demo &amp; reply intent</h3>
          {state === 'ready' && result && (
            <p className="text-micro text-text-tertiary">
              {result.coaches.length === 0
                ? 'No coaches showing real intent right now'
                : result.totalQualifying > result.coaches.length
                  ? `Showing top ${result.coaches.length} of ${result.totalQualifying} coaches with real signal`
                  : `${result.coaches.length} coach${result.coaches.length === 1 ? '' : 'es'} showing real signal`}
            </p>
          )}
        </div>
      </div>

      {state === 'loading' && <SkeletonList rows={5} label="Loading intent ranking" />}

      {state === 'error' && (
        <InlineNotice
          tone="danger"
          title="Couldn't load intent ranking"
          action={
            <Button
              variant="ghost"
              type="button"
              onClick={() => setReloadToken((t) => t + 1)}
              className={CRM_SECONDARY_ACTION_CLASS}
            >
              Try again
            </Button>
          }
        >
          {errorMessage}
        </InlineNotice>
      )}

      {state === 'ready' && result && result.coaches.length === 0 && (
        <EmptyState
          variant="subtle"
          icon={<IconMonitor size={20} />}
          title="No real intent signal yet"
          description="Demo visits, replies, and email opens will surface coaches here as they come in."
        />
      )}

      {state === 'ready' && result && result.coaches.length > 0 && (
        <ul className="space-y-1.5">
          {result.coaches.map((coach) => (
            <IntentRow key={coach.coach_id} coach={coach} onCoachClick={onCoachClick} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// IntentRow — one coach. demo_visits + replies render as bold accent-tinted
// chips (the dominant signals); opens renders only when >0, small and muted;
// stage is the same STATUS_COLORS/STATUS_CONFIG pill used everywhere else in
// the CRM (read-only here — no dropdown, this is a ranked list not an editor).
// Mirrors SignalRow's shape (rank+identity as a ghost <Button>, not a
// role="button" wrapper) from components/today/SignalsPanel.tsx.
// ----------------------------------------------------------------------------
function IntentRow({ coach, onCoachClick }: { coach: IntentCoach; onCoachClick: (id: string) => void }) {
  const stage = (coach.stage as CoachStatus) in STATUS_CONFIG ? (coach.stage as CoachStatus) : 'new_lead';
  const stageCfg = STATUS_CONFIG[stage];
  const stageColors = STATUS_COLORS[stage];

  return (
    <li className="rounded-fw-md border border-border-subtle/60 bg-canvas transition-colors hover:bg-surface-tint">
      <Button
        variant="ghost"
        type="button"
        haptic="none"
        onClick={() => onCoachClick(coach.coach_id)}
        className="flex min-h-[44px] w-full flex-col items-stretch gap-2 rounded-fw-md px-3 py-2.5 text-left"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <span className="min-w-0">
            <span className="block truncate font-semibold text-text-primary">{coach.name || 'Unnamed coach'}</span>
            <span className="block truncate text-micro text-text-tertiary">{coach.school ?? '—'}</span>
          </span>
          <span
            className={cn(
              'inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-micro font-medium',
              stageColors?.bg, stageColors?.text, stageColors?.border,
            )}
          >
            {stageCfg?.label ?? coach.stage}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <IntentStat icon={<IconMonitor size={13} aria-hidden />} value={coach.demo_visits} label="demo visit" dominant />
          <IntentStat icon={<IconMessageSquare size={13} aria-hidden />} value={coach.replies} label="reply" dominant />
          {coach.opens > 0 && (
            <IntentStat icon={<IconEye size={13} aria-hidden />} value={coach.opens} label="open" dominant={false} />
          )}
          <span className="ml-auto whitespace-nowrap text-micro tabular-nums text-text-tertiary">
            {formatIntentTime(coach.last_intent_at)}
          </span>
        </div>
      </Button>
    </li>
  );
}

function IntentStat({ icon, value, label, dominant }: { icon: ReactNode; value: number; label: string; dominant: boolean }) {
  const hasValue = value > 0;
  const pluralLabel = value === 1 ? label : `${label}s`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full tabular-nums',
        dominant
          ? cn('px-2 py-1 text-body-sm font-bold', hasValue ? 'bg-accent-50 text-accent-800' : 'bg-surface-sunken text-text-tertiary')
          : 'px-2 py-0.5 text-micro font-medium text-text-tertiary',
      )}
    >
      {icon}
      {value} {pluralLabel}
    </span>
  );
}

// ----------------------------------------------------------------------------
// formatIntentTime — compact relative-time label. Self-contained rather than
// importing components/today/signals-format.ts's relativeCompact — that
// file's own header comment explains why: keeps each leaf component's
// formatting independently tunable rather than coupling two unrelated
// features through a shared import.
// ----------------------------------------------------------------------------
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function formatIntentTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';
  const diffMs = Math.max(0, now.getTime() - then);
  if (diffMs < MINUTE_MS) return 'just now';
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)}m ago`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)}h ago`;
  const days = Math.floor(diffMs / DAY_MS);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
