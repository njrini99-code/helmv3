import type { NotificationTeam, UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';

/**
 * Which team a bell item is for, against the team on screen (coach audit 13 Nov 2026, §2: with Guilford active, every item
 * was Demo University's, unlabelled, and opening one landed on Guilford's Messages with nothing open).
 */

/** The item's team when it is another team's; null for this team's item and one that names no team (a direct message). */
export function otherTeamOf(item: Pick<UnifiedNotificationItem, 'team'>, activeTeamId: string | null | undefined): NotificationTeam | null {
  const team = item.team;
  return team && activeTeamId && team.id !== activeTeamId ? team : null;
}

/**
 * What opening an item does: this team's (or no team's) opens at once; another team's switches to it first when the
 * coach can switch to that team, and otherwise is refused on the spot (an assistant can't switch, so its screen would
 * open on the wrong team with nothing in it).
 */
export type ChBellOpen = { kind: 'here' } | { kind: 'switch'; team: NotificationTeam } | { kind: 'refused'; team: NotificationTeam };

export function bellOpenPlan(
  item: Pick<UnifiedNotificationItem, 'team'>,
  activeTeamId: string | null | undefined,
  switchable: readonly string[],
): ChBellOpen {
  const team = otherTeamOf(item, activeTeamId);
  if (!team) return { kind: 'here' };
  return switchable.includes(team.id) ? { kind: 'switch', team } : { kind: 'refused', team };
}
