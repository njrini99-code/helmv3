import { fairwayScope } from '@/lib/redesign/flag';
import { PlayerDetailSkeleton } from '@/components/fairway/pages/player-detail/PlayerDetailSkeleton';

/**
 * Route Suspense fallback for /golf/dashboard/roster/[id]. Shape-matches the
 * player detail first paint (PlayerDetailScreen): back link, masthead, verdict,
 * the round-strip stage, the key-stats ledger and the entry rows.
 */
export default function PlayerProfileLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <PlayerDetailSkeleton />
    </div>
  );
}
