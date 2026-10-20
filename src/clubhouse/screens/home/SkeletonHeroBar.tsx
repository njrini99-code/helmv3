'use client';

import { usePathname } from 'next/navigation';
import { usePhoneHero } from '../../shell/phone-chrome';
import { useChPhone } from '../../lib/use-phone';

/**
 * While Home's skeleton is up on a phone, the top bar is already the hero's green bar, so loading never flips light to
 * dark (F-37). Only at Home's own address: the dashboard's loading boundary also stands in while another section's page
 * loads, and there the hero bar put that section's name in Home's place until the page came (owner, 2026-10-15).
 */
export function SkeletonHeroBar() {
  const atHome = (usePathname()?.replace(/\/$/, '') ?? '') === '/golf/dashboard';
  usePhoneHero(useChPhone() && atHome);
  return null;
}
