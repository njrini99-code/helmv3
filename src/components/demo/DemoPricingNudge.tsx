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
 *
 * The toast action goes through our own tracked redirect rather than
 * straight to the calendar — see DEMO_PRICING_CALL_PATH below. Asking for a
 * call is the highest-intent thing a prospect does in the demo, and until
 * that route existed it produced no database row at all.
 */

import { useEffect } from 'react';
import { toast } from '@/components/ui/sonner';
import { isNativeApp } from '@/lib/utils/capacitor';
import {
  DEMO_PRICING_NUDGED_STORAGE_KEY,
  DEMO_PRICING_NUDGE_DELAY_MS,
  DEMO_TOUR_STORAGE_KEY,
  resolveNudgeArming,
  shouldFireNudge,
} from './arm-nudge';

/**
 * Tracked booking link — same-origin on purpose.
 *
 * The founder's actual Google Calendar URL now lives server-side, in
 * src/app/api/crm/book-call/route.ts, which is its single source of truth.
 * That route records the click (referrer, user-agent, traffic-quality
 * verdict) and then 302s on. Keeping the real URL out of the client bundle
 * means the destination can move without a redeploy of this component, and
 * that nothing shipped to the browser can be edited to retarget the link.
 *
 * The `src` token is opaque and only ever lands in a jsonb column — the
 * route takes no destination parameter of any kind, by design.
 *
 * Single exported const — keep this greppable.
 */
const DEMO_PRICING_CALL_PATH = '/api/crm/book-call?src=demo-pricing-nudge';

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

    // App Store Guideline 3.1.1 — NEVER arm this inside the native shell.
    //
    // This toast reads "Interested in pricing? … Schedule a call" and opens an
    // external booking page. That is a call to action pointing at a purchasing
    // mechanism outside of in-app purchase, and this app has already been
    // rejected once for exactly that class of surface (7933eb8be, "strip
    // membership refs from iOS surfaces").
    //
    // The exposure is not theoretical: App Review signs in with the shared
    // demo coach account, which is the ONLY account this component fires for,
    // and it arms on the golf dashboard — the screen the native app cold-starts
    // onto. It fires after 30s or 8 taps, both of which a reviewer will
    // comfortably exceed. proxy.ts blocks marketing *routes* by user agent, but
    // this is a toast mounted inside an allowed app route, so that guard never
    // saw it. Web demo behaviour is unchanged.
    if (isNativeApp()) return;

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
          // Still `_blank` + `noopener`: the tab starts same-origin but the
          // route immediately 302s it to calendar.app.google, so the opened
          // window ends up cross-origin and must not keep an opener handle
          // back to the demo session.
          onClick: () => window.open(DEMO_PRICING_CALL_PATH, '_blank', 'noopener'),
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
