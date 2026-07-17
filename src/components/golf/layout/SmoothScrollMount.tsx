'use client';

/**
 * SmoothScrollMount — opt-in Lenis smooth-scroll wrapper.
 *
 * Lenis hijacks the document scroll; that's incompatible with surfaces
 * that rely on native `scrollIntoView({behavior:'smooth'})` (messages
 * auto-scroll, shot-tracking step-into) or drag-and-drop with momentum
 * (calendar). Mounting globally would degrade those v2 flows.
 *
 * So instead of mounting at the layout root, we scope to a route
 * ALLOWLIST — only the v3-pure surfaces where the user benefits from
 * inertial scrolling and where no native smooth-scroll API is in play.
 *
 * The hook ALSO already opts out on coarse-pointer + reduced-motion,
 * so phones + accessibility-first users keep native behavior regardless.
 *
 * Route allowlist (extend carefully — every new entry should be a
 * v3 surface that doesn't call scrollIntoView or use HTML5 drag-drop):
 *   /dashboard/players/[playerId]/genome — radar + persona + dim grid
 *     (GOLF IA REORG — canonical location; /dashboard/coachhelm/genome/*
 *     is now a server-side redirect() shim that never mounts this client
 *     component, so it stays listed only for any lingering deep links that
 *     resolve before the redirect completes)
 *   /dashboard/coachhelm/genome/*       — legacy redirect shim (see above)
 *   /dashboard/coachhelm/qualifying/*   — qualifying workspace
 *   /dashboard/coachhelm/chat           — chat history page
 *   /dashboard/my-standing              — standing matrix
 *   /dashboard/my-game-profile          — player radar
 *   /dashboard/coachhelm                — coach + player coachhelm hub
 *   /dashboard/settings/notifications   — settings page
 *
 * Explicitly NOT applied to:
 *   /dashboard/messages         (scrollIntoView for new-message auto-scroll)
 *   /dashboard/rounds/[id]/*    (shot tracking has nested scroll + scrollIntoView)
 *   /dashboard/calendar         (drag-drop)
 *   /dashboard/admin/*          (CRM pipeline drag-drop)
 *   /dashboard/hub              (heavy v2 content; conservative default)
 */

import { usePathname } from 'next/navigation';
import { useSmoothScroll } from '@/hooks/useSmoothScroll';

const ALLOW_PATTERNS: ReadonlyArray<RegExp> = [
  /^\/golf\/dashboard\/players\/[^/]+\/genome(\/|$)/,
  /^\/golf\/dashboard\/coachhelm\/genome(\/|$)/,
  /^\/golf\/dashboard\/coachhelm\/qualifying(\/|$)/,
  /^\/golf\/dashboard\/coachhelm\/chat(\/|$)/,
  /^\/golf\/dashboard\/coachhelm(\/|$)/,
  /^\/golf\/dashboard\/my-standing(\/|$)/,
  /^\/golf\/dashboard\/my-game-profile(\/|$)/,
  /^\/golf\/dashboard\/settings\/notifications(\/|$)/,
];

function shouldMount(pathname: string | null): boolean {
  if (!pathname) return false;
  return ALLOW_PATTERNS.some((re) => re.test(pathname));
}

export function SmoothScrollMount() {
  const pathname = usePathname();
  const active = shouldMount(pathname);
  // The hook itself short-circuits to a no-op when not active; this
  // keeps the hook-call rules consistent across renders.
  useSmoothScroll(active);
  return null;
}
