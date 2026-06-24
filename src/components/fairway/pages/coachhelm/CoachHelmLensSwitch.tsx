'use client';

import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Segmented } from '@/components/fairway/controls/segmented';

import { coachHelmRoutes } from '@/lib/coachhelm/fairway-routes';

export type CoachHelmLens = 'team' | 'players';

export const COACHHELM_TEAM_HREF = coachHelmRoutes.teamBrief;
export const COACHHELM_PLAYERS_HREF = coachHelmRoutes.playersRoster;

export function resolveCoachHelmLens(pathname: string | null): CoachHelmLens {
  if (!pathname) return 'team';
  if (
    pathname.startsWith('/golf/dashboard/coachhelm/players') ||
    pathname.startsWith('/golf/dashboard/coachhelm/genome') ||
    pathname.startsWith('/golf/dashboard/development') ||
    pathname.startsWith('/golf/dashboard/players/')
  ) {
    return 'players';
  }
  return 'team';
}

export interface CoachHelmLensSwitchProps {
  className?: string;
}

/** Team vs Players primary lens — sits above the tab strip in CoachHelmShell. */
export function CoachHelmLensSwitch({ className }: CoachHelmLensSwitchProps) {
  const pathname = usePathname();
  const router = useRouter();
  const lens = resolveCoachHelmLens(pathname);

  return (
    <Segmented<CoachHelmLens>
      className={cn('w-fit', className)}
      size="sm"
      aria-label="CoachHelm lens"
      options={[
        { value: 'team', label: 'Team' },
        { value: 'players', label: 'Players' },
      ]}
      value={lens}
      onValueChange={(next) => {
        router.push(next === 'team' ? COACHHELM_TEAM_HREF : COACHHELM_PLAYERS_HREF);
      }}
    />
  );
}
