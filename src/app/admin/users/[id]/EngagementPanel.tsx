import { Surface, StatusPill, type FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { fetchUserEngagement, type EngagementBand } from '@/lib/admin/data/user-engagement';
import { PanelNoData } from '../../_components/PanelStates';
import { LocalTime } from '../../_components/LocalTime';

const BAND_TONE: Record<EngagementBand, FwStatusTone> = {
  strong: 'success',
  steady: 'accent',
  fading: 'warning',
  dormant: 'danger',
};

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * GREEN CONTRACT: the ring's progress stroke is the ONE green element here —
 * the score itself renders in heavy graphite (warm-900, bold, tabular) in
 * the center, never as a green numeral.
 */
function EngagementRing({ score }: { score: number }) {
  const offset = RING_CIRCUMFERENCE * (1 - score / 100);
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        <circle cx={50} cy={50} r={RING_RADIUS} strokeWidth={8} className="fill-none stroke-warm-200" />
        <circle
          cx={50}
          cy={50}
          r={RING_RADIUS}
          strokeWidth={8}
          strokeLinecap="round"
          className="fill-none stroke-accent-500"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-fw-mono text-2xl font-bold tabular-nums text-warm-900">{score}</span>
        <span className="text-eyebrow uppercase tracking-widest text-warm-500">/ 100</span>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { round: 'Round', insight: 'Insight', review: 'Review' };

/**
 * New panel for /admin/users/[id] — touches nothing else on that page. A
 * self-contained fetch (fetchUserEngagement) so the rest of the page's data
 * flow is untouched.
 */
export async function EngagementPanel({ userId }: { userId: string }) {
  const engagement = await fetchUserEngagement(userId);

  return (
    <Surface padding="sm">
      {/* Dateline rule — replaces the retired border-l-2 "key panel" stripe. */}
      <span aria-hidden className="mb-3 block h-[2px] w-7 rounded-full bg-accent-500" />
      <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Engagement</h2>
      <div className="mt-3">
        {engagement === null ? (
          <PanelNoData
            label="Not applicable"
            description="Engagement scoring covers golf players and coaches only — this account has neither role."
          />
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <EngagementRing score={engagement.score} />
              <div>
                <StatusPill tone={BAND_TONE[engagement.band]} dot size="sm">
                  {engagement.band}
                </StatusPill>
                <p className="mt-1 text-xs text-warm-500">
                  last active{' '}
                  {engagement.lastActivity ? <LocalTime iso={engagement.lastActivity} variant="datetime" /> : 'never'}
                </p>
              </div>
            </div>

            <div className="grid flex-1 grid-cols-3 gap-3">
              <div className="rounded-fw-md bg-surface-sunken p-3">
                <span className="block font-fw-mono text-lg font-bold tabular-nums text-warm-900">
                  {engagement.rounds30d}
                </span>
                <span className="text-eyebrow uppercase tracking-widest text-warm-500">Rounds 30d</span>
              </div>
              <div className="rounded-fw-md bg-surface-sunken p-3">
                <span className="block font-fw-mono text-lg font-bold tabular-nums text-warm-900">
                  {engagement.insightsEngaged30d}
                </span>
                <span className="text-eyebrow uppercase tracking-widest text-warm-500">Insights 30d</span>
              </div>
              <div className="rounded-fw-md bg-surface-sunken p-3">
                <span className="block font-fw-mono text-lg font-bold tabular-nums text-warm-900">
                  {engagement.reviewsViewed30d}
                </span>
                <span className="text-eyebrow uppercase tracking-widest text-warm-500">Reviews 30d</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {engagement !== null && engagement.recentActivity.length > 0 ? (
        <ul className={cn('mt-4 divide-y divide-warm-200/60 border-t border-accent-600/25 pt-2')}>
          {engagement.recentActivity.map((item) => (
            <li key={`${item.kind}:${item.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
              <span className="text-eyebrow uppercase tracking-widest text-warm-500">
                {KIND_LABEL[item.kind] ?? item.kind}
              </span>
              <span className="min-w-0 flex-1 basis-full truncate text-warm-800 sm:basis-auto">{item.label}</span>
              <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                {item.at ? <LocalTime iso={item.at} variant="datetime" /> : '—'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}
