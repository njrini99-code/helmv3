'use client';

/**
 * HubInsightSignalCard — the single high-impact insight rendered on the
 * player Hub home screen. The "engagement multiplier" that turns 100% of
 * daily Hub visits into engine-aware visits.
 *
 * Design contract:
 *   docs/superpowers/plans/2026-04-22-insight-delivery/00-design-contract.md
 *
 * Behavior:
 *   - If `insight` is null → renders nothing. Hub stays clean.
 *   - If present → renders the HeroInsightCard at `density='default'` inside a
 *     section header ("From your CoachHelm"). Hub layout has limited vertical
 *     space, so we intentionally pick `default` density over full hero — the
 *     metric + Fraunces title already give the card enough visual weight.
 *   - A small "Dismiss for today" affordance sets `hub_signal_dismissed_{YYYY-MM-DD}`
 *     in localStorage. The flag resets at midnight.
 *
 * Ownership: wired to `getTopInsightForPlayer(playerId)` server-side via the
 * parent (`page.tsx`). This component receives the already-fetched insight so
 * it can stay purely presentational + handle the client-only dismiss state.
 */
import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { InsightCard, type InsightAction } from '@/components/golf/coachhelm/insight-card';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';
import { IconSparkles } from '@/components/icons';

export interface HubInsightSignalCardProps {
  insight: EvidenceInsight | null;
}

/** Format a local (not UTC) YYYY-MM-DD key so a player who dismisses at 11pm
 *  local time doesn't see the card come back at midnight UTC. */
function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `hub_signal_dismissed_${y}-${m}-${d}`;
}

/** Removes any `hub_signal_dismissed_*` keys that aren't for today. Keeps
 *  localStorage tidy so old keys don't accumulate across weeks of use. */
function pruneStaleDismissKeys(currentKey: string): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('hub_signal_dismissed_') && key !== currentKey) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable (private mode, quota exceeded) — safe to skip.
  }
}

export function HubInsightSignalCard({ insight }: HubInsightSignalCardProps) {
  const router = useRouter();
  const [dismissedToday, setDismissedToday] = useState<boolean | null>(null);
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();

  // Hydrate dismiss state from localStorage. `dismissedToday === null` on the
  // first render prevents a flash of the card before we know if the player has
  // already dismissed it today.
  useEffect(() => {
    try {
      const key = todayKey();
      pruneStaleDismissKeys(key);
      setDismissedToday(localStorage.getItem(key) === '1');
    } catch {
      setDismissedToday(false);
    }
  }, []);

  const handleDismissForToday = useCallback(() => {
    try {
      localStorage.setItem(todayKey(), '1');
    } catch {
      // Non-fatal — card still hides for this session.
    }
    setHidden(true);
  }, []);

  const handleAction = useCallback(
    async (action: InsightAction, insightId: string) => {
      switch (action) {
        case 'rate_helpful':
        case 'rate_not_helpful':
        case 'acknowledged':
        case 'dismissed': {
          const rating =
            action === 'rate_helpful'
              ? 'helpful'
              : action === 'rate_not_helpful'
                ? 'not_helpful'
                : action === 'acknowledged'
                  ? 'acknowledged'
                  : 'dismissed';
          try {
            await rateInsightAsPlayer({ insightId, rating });
          } catch {
            // Server-side action logs via logServerError already. Swallow so a
            // failing rating doesn't crash the Hub.
          }
          if (action === 'dismissed') {
            setHidden(true);
          }
          startTransition(() => {
            router.refresh();
          });
          return;
        }
        case 'open_details':
          router.push(`/golf/dashboard/coachhelm?focus=${insightId}`);
          return;
        case 'view_drill':
        case 'create_focus_area':
          // view_drill is handled inside DrillChips' bottom sheet; create_focus_area
          // is a coach-only action — no-op here.
          return;
      }
    },
    [router],
  );

  if (!insight) return null;
  if (hidden) return null;
  // Suppress until we've hydrated the dismiss state to avoid a flash.
  if (dismissedToday === null) return null;
  if (dismissedToday) return null;

  return (
    <section
      data-testid="hub-insight-signal-card"
      aria-label="Top insight from your CoachHelm"
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconSparkles size={14} className="text-primary-600" aria-hidden />
          <h2 className="text-[11px] font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 border-b border-primary-200/40 pb-0.5">
            From your CoachHelm
          </h2>
        </div>
        <button
          type="button"
          onClick={handleDismissForToday}
          data-testid="hub-insight-dismiss-today"
          className="text-xs font-medium text-warm-400 hover:text-warm-700 transition-colors"
        >
          Dismiss for today
        </button>
      </div>

      <InsightCard
        insight={insight}
        density="default"
        audience="player"
        onAction={handleAction}
        onClick={(id) => router.push(`/golf/dashboard/coachhelm?focus=${id}`)}
      />
    </section>
  );
}
