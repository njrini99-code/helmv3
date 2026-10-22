import 'server-only';
import { getWhatsNewForCoach } from '@/app/golf/actions/whats-new';
import { chLogServer } from '../lib/track-server';
import { toWhatsNew, WHATS_NEW_FAILED, type ChWhatsNew } from './whats-new-shape';

/**
 * The coach's What's new: `getWhatsNewForCoach`, the Fairway feed's own read (the team's insights, patterns and focus
 * areas of the past seven days, with the product-visibility rules on insights), shaped for the page. The action already
 * resolves the coach's active team and logs each branch that fails; a failure of the whole read is one more line here.
 */
export async function loadWhatsNew(): Promise<ChWhatsNew> {
  const res = await getWhatsNewForCoach();
  if (!res.success) {
    chLogServer('whats-new', 'feed', { message: res.error ?? 'feed failed' }, 'teams');
    return WHATS_NEW_FAILED;
  }
  return toWhatsNew(res.items ?? [], { nowMs: Date.now(), zone: res.timeZone, truncated: res.truncated });
}
