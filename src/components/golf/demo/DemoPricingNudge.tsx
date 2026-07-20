'use client';

/**
 * DemoPricingNudge — one in-demo pricing toast, mounted once for the whole
 * golf dashboard.
 *
 * Coaches from the Coach Demo Invite email land on `/golf/dashboard?demo=1`
 * — the shared demo coach account, `?demo=1` present only on that first
 * landing navigation. This component arms two triggers on mount — a 30s
 * timer and an 8-pointerdown counter — and whichever fires first shows one
 * dismissible toast nudging toward a pricing call, then never fires again
 * this session.
 *
 * Renders null; it's a pure side-effect leaf, the same pattern as
 * DemoEnterTracker (see that file's header for why this lives in the client
 * shell rather than the server layout).
 *
 * MOUNT ORDER: this must render BEFORE <DemoEnterTracker /> in
 * FairwayDashboardShell. DemoEnterTracker strips `?demo=1` from the URL via
 * router.replace() in its own mount effect; React fires sibling effects in
 * JSX declaration order, so mounting first here guarantees
 * `window.location.search` still contains `demo=1` when this effect reads it.
 *
 * The trigger race itself (30s timer vs. 8 clicks, whichever first) is a
 * pure function — see `./arm-nudge` — so it's unit-tested without mocking
 * timers or DOM events.
 */

import { useEffect } from 'react';
import { toast } from '@/components/ui/sonner';
import {
  DEMO_PRICING_NUDGED_STORAGE_KEY,
  DEMO_PRICING_NUDGE_DELAY_MS,
  DEMO_TOUR_STORAGE_KEY,
  resolveNudgeArming,
  shouldFireNudge,
} from './arm-nudge';

/** Founder's booking page. Single exported const — keep this greppable. */
export const DEMO_PRICING_CALL_URL = 'https://calendar.app.google/s9DBb3bKD2teLLBT7';

function readSessionFlag(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    // Private-mode / storage-disabled browsers — treat as unset.
    return null;
  }
}

function writeSessionFlag(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Non-fatal: worst case the nudge can re-arm on the next render this
    // session in a browser that blocks sessionStorage entirely.
  }
}

export function DemoPricingNudge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const { shouldMarkTour, shouldArm } = resolveNudgeArming({
      locationSearch: window.location.search,
      tourFlag: readSessionFlag(DEMO_TOUR_STORAGE_KEY),
      nudgedFlag: readSessionFlag(DEMO_PRICING_NUDGED_STORAGE_KEY),
    });

    if (shouldMarkTour) {
      writeSessionFlag(DEMO_TOUR_STORAGE_KEY, '1');
    }

    if (!shouldArm) return;

    const armedAt = Date.now();
    let clicks = 0;
    let fired = false;

    const fireNudge = () => {
      if (fired) return;
      fired = true;
      clearTimeout(timer);
      window.removeEventListener('pointerdown', onPointerDown);
      writeSessionFlag(DEMO_PRICING_NUDGED_STORAGE_KEY, '1');

      toast('Interested in pricing?', {
        description: 'Grab a quick 15-minute call for your program.',
        duration: Infinity,
        action: {
          label: 'Schedule a call',
          onClick: () => window.open(DEMO_PRICING_CALL_URL, '_blank', 'noopener'),
        },
      });
    };

    const onPointerDown = () => {
      clicks += 1;
      if (shouldFireNudge(Date.now() - armedAt, clicks)) {
        fireNudge();
      }
    };

    const timer = setTimeout(fireNudge, DEMO_PRICING_NUDGE_DELAY_MS);
    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  return null;
}
