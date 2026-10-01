'use client';

import { usePhoneHero } from '../../shell/phone-chrome';
import { useChPhone } from '../../lib/use-phone';

/** While Home's skeleton is up on a phone, the top bar is already the hero's green bar, so loading never flips light to dark (F-37). */
export function SkeletonHeroBar() {
  usePhoneHero(useChPhone());
  return null;
}
