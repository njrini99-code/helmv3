import type { RosterPlayerInsight } from '@/lib/admin/data/users';

/** Sport-agnostic row tone for a roster player — errors or a missing profile
 *  read as danger; quiet activity or a partial profile as warning; otherwise
 *  clean. Shared by TeamCommandCard and PlayerWatchlist (both golf and
 *  baseball feed the same `RosterPlayerInsight` shape from fetchUsersTab). */
export function playerTone(player: RosterPlayerInsight): 'success' | 'warning' | 'danger' | 'neutral' {
  if (player.errors7d > 0 || player.profileQuality === 'missing') return 'danger';
  if (player.activity30d === 0 || player.profileQuality === 'partial') return 'warning';
  return 'success';
}
