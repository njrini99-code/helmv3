/**
 * CoverHero — the Command Center magazine cover line (spec §6 #3, north-star).
 *
 * The dashboard's one dominant hero: an `<Eyebrow>` kicker (`NEXT · SUN 4:30`),
 * this week's opponent set as a big `font-annual` cover line (`vs COASTAL
 * STATE`), and the record ruled beneath on a GREEN `<HairlineRule>`. When there
 * is no next opponent it renders an honest `STANDING BY` editor's letter instead
 * of broken zeros — the empty-state doctrine, never a yellow box.
 *
 * No hooks / handlers — safe in a server component.
 */
import { cn } from '@/lib/utils';
import { Eyebrow, HairlineRule, EditorsLetter } from '..';

export interface CoverHeroProps {
  /** Next opponent, e.g. `Coastal State`. Empty → the standing-by variant. */
  opponent: string;
  /** Date / time kicker, e.g. `SUN 4:30`. */
  dateLabel?: string;
  /** Team record, e.g. `12-4`. */
  record?: string;
  /** `home` → `vs`, `away` → `at` (default home). */
  homeAway?: 'home' | 'away';
  /** Eyebrow lead word (default `NEXT`). */
  kicker?: string;
  className?: string;
}

export function CoverHero({ opponent, dateLabel, record, homeAway = 'home', kicker = 'NEXT', className }: CoverHeroProps) {
  if (opponent.trim().length === 0) {
    return (
      <EditorsLetter
        className={className}
        ink="team"
        live
        title="Standing by — awaiting first pitch."
        body="This week’s cover goes up here the moment your next game lands on the schedule."
      />
    );
  }

  const prefix = homeAway === 'away' ? 'at' : 'vs';

  return (
    <div className={cn('flex flex-col', className)}>
      <Eyebrow items={[kicker, dateLabel]} ink="team" />

      <h2 className="mt-2 font-annual text-display font-semibold uppercase leading-none text-text-primary md:text-ink">
        <span className="font-normal lowercase text-text-tertiary">{prefix} </span>
        <span style={{ fontVariant: 'small-caps' }}>{opponent}</span>
      </h2>

      {record ? (
        <div className="mt-4">
          <HairlineRule ink="team" weight={3} className="w-24 rounded-full" />
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">Record</span>
            <span className="font-annual text-h3 font-semibold tabular-nums text-text-primary">{record}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
