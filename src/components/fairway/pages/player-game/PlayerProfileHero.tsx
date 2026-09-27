/**
 * PlayerProfileHero — the coach deep-dive's identity header (owner direction
 * 2026-09-26: "the player's avatar in the top left like an actual profile").
 *
 * Layout A from the owner's pick (2026-09-26): a large avatar over a plain
 * accent band, the composite rating opposite it, the name as the page's h1
 * and one line of facts (team · class · handicap). Nothing else: the
 * page's two destinations sit at the bottom of the screen.
 *
 * Presentational only: every value comes from rows the route already loads.
 * A missing fact is left out rather than shown as a placeholder.
 */

import { Avatar } from '@/components/fairway';

export interface PlayerProfileHeroProps {
  name: string;
  avatarUrl: string | null;
  teamName: string | null;
  graduationYear: number | null;
  handicap: number | null;
  /** The composite 0-100 rating; null renders an em dash. */
  rating: number | null;
}

function formatHandicap(value: number): string {
  // A plus handicap is written "+1.2"; everything else is the plain index.
  if (value < 0) return `+${Math.abs(value).toFixed(1)}`;
  return value.toFixed(1);
}

export function PlayerProfileHero({
  name,
  avatarUrl,
  teamName,
  graduationYear,
  handicap,
  rating,
}: PlayerProfileHeroProps) {
  const facts = [
    teamName ?? 'No team',
    graduationYear != null ? String(graduationYear) : null,
    handicap != null && Number.isFinite(handicap) ? `HCP ${formatHandicap(handicap)}` : null,
  ].filter((f): f is string => f != null);

  return (
    <section
      aria-label="Player profile"
      data-slot="player-profile-hero"
      className="overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-card"
    >
      <div aria-hidden="true" className="h-[76px] bg-accent-50" />
      <div className="flex flex-col gap-3.5 px-5 pb-5 md:px-6 md:pb-6">
        <div className="-mt-10 flex items-end justify-between gap-4">
          {/* Avatar's className styles its inner circle only, so the hero size
              lives on this frame and the avatar fills it. */}
          <div className="h-[88px] w-[88px] shrink-0 rounded-full bg-surface p-1 [&>[data-slot=fw-avatar]]:h-full [&>[data-slot=fw-avatar]]:w-full">
            <Avatar decorative src={avatarUrl} name={name} size="xl" tone="accent" className="text-h1" />
          </div>
          <div className="flex flex-col items-end">
            <span className="font-fw-mono text-display font-semibold leading-none tabular-nums text-text-primary">
              {rating != null ? Math.round(rating) : '—'}
            </span>
            <span className="text-caption text-text-secondary">Rating</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="m-0 truncate text-h1 font-bold tracking-tight text-text-primary">{name}</h1>
          <p className="m-0 truncate text-body text-text-secondary">{facts.join(' · ')}</p>
        </div>
      </div>
    </section>
  );
}

export default PlayerProfileHero;
