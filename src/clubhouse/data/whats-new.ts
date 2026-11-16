import 'server-only';
import { getWhatsNewForCoach } from '@/app/golf/actions/whats-new';
import { chLogServer } from '../lib/track-server';
import { toWhatsNew, WHATS_NEW_FAILED, WHATS_NEW_NO_TEAM, type ChWhatsNew } from './whats-new-shape';

/**
 * The coach's What's new: `getWhatsNewForCoach`, the Fairway feed's own read (the team's insights, patterns and focus
 * areas of the past seven days, with the product-visibility rules on insights), shaped for the page. The action already
 * resolves the coach's active team and logs each branch that fails; a failure of the whole read is one more line here. A coach with no team gets NoTeam and
 * a feed where some kinds failed carries them in `failed`, so neither is drawn as an empty week (GAP-S-02, GAP-S-36).
 */
export async function loadWhatsNew(): Promise<ChWhatsNew> {
  const res = await getWhatsNewForCoach();
  if (!res.success) {
    chLogServer('whats-new', 'feed', { message: res.error ?? 'feed failed' }, 'teams');
    return WHATS_NEW_FAILED;
  }
  if (res.noTeam) return WHATS_NEW_NO_TEAM;
  if (res.failed?.length) chLogServer('whats-new', 'feed', { message: `part of the feed failed: ${res.failed.join(', ')}` }, 'teams');
  return toWhatsNew(res.items ?? [], { nowMs: Date.now(), zone: res.timeZone, truncated: res.truncated, failed: res.failed });
}
