import { cn } from '@/lib/utils';
import type { Episode } from '@/lib/admin/incidents/episodes';

/**
 * ============================================================================
 * Bridge Premium · EpisodeTimelineStrip
 * ----------------------------------------------------------------------------
 * Renders `episodes.ts`'s `Episode[]` (brief §8: "A resolved root fingerprint
 * that returns after a proven repair becomes a new EPISODE... on the same
 * incident", §14 zone B "Incident Genome: occurrence timeline grouped by
 * release: fixed / clean / REGRESSION").
 *
 * One segment per episode, left to right, oldest first. Vocabulary from
 * brief §4: FILLED segment = a completed/proven lifecycle stage (this
 * episode has an `endedAt` — it was resolved), HOLLOW segment = still open.
 * A `'regression'` episode additionally gets the danger tone regardless of
 * fill state, because a regression is worth flagging even while its own
 * resolution is still pending — the shape (filled/hollow) answers "is this
 * episode closed", the color answers "was this episode a regression".
 *
 * NEVER TEN COPIES OF ONE STACK TRACE (brief §14). This renders episode
 * COUNT and BOUNDARIES, never per-occurrence detail — that stays on the
 * Genome's own occurrence list, one level deeper.
 * ========================================================================== */

function segmentTitle(episode: Episode): string {
  const status = episode.endedAt ? 'resolved' : 'open';
  return `${episode.headline} — ${episode.occurrenceCount} occurrence${episode.occurrenceCount === 1 ? '' : 's'}, ${status}`;
}

export interface EpisodeTimelineStripProps {
  episodes: readonly Episode[];
  /** When the reconstructed timeline is a lower bound (see
   *  `genome.ts`'s `IncidentEpisodesResult.timelineIncomplete`) — appends a
   *  trailing "+" marker and note rather than presenting the strip as
   *  complete history. */
  incomplete?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function EpisodeTimelineStrip({ episodes, incomplete = false, size = 'md', className }: EpisodeTimelineStripProps) {
  if (episodes.length === 0) return null;

  const segmentHeight = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div
      data-slot="bridge-episode-timeline-strip"
      role="list"
      aria-label={`Episode timeline, ${episodes.length} episode${episodes.length === 1 ? '' : 's'}${incomplete ? ' or more' : ''}`}
      className={cn('flex min-w-0 items-center gap-1', className)}
    >
      {episodes.map((episode) => {
        const isRegression = episode.kind === 'regression';
        const isClosed = episode.endedAt !== null;
        return (
          <span
            key={episode.number}
            role="listitem"
            title={segmentTitle(episode)}
            className={cn(
              'min-w-[10px] flex-1 rounded-sm',
              segmentHeight,
              isRegression
                ? isClosed
                  ? 'bg-fw-danger'
                  : 'border border-fw-danger bg-fw-danger/15'
                : isClosed
                  ? 'bg-fw-success'
                  : 'border border-accent-300 bg-accent-50',
            )}
          />
        );
      })}
      <span className="shrink-0 whitespace-nowrap font-fw-mono text-[11px] text-warm-500">
        {episodes.length} episode{episodes.length === 1 ? '' : 's'}
        {incomplete ? '+' : ''}
      </span>
    </div>
  );
}
