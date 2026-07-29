'use client';

/**
 * ============================================================================
 * /golf/welcome — the post-sign-in interstitial
 * ----------------------------------------------------------------------------
 * The one screen between "Sign in" and the dashboard. It exists to name the
 * person and hand them over. That is all it has to do, and everything below is
 * about doing it without ever trapping, stalling, or visually contradicting the
 * app on the other side of it.
 *
 * WHAT WAS WRONG (all reproduced live, not inferred)
 * --------------------------------------------------
 * 1. IT COULD HANG FOREVER. The identity load was an un-caught async IIFE:
 *
 *        const { data: { user } } = await supabase.auth.getUser();  // throws
 *        ...
 *        setReady(true);                                            // never runs
 *
 *    `AuthRetryableFetchError: signal timed out` on a slow or flaky connection
 *    rejected that promise, so `ready` stayed false — and BOTH the greeting and
 *    the Skip button were gated on `ready`, as was `useSequencedNavigation`'s
 *    `armed`. Since every timer in that hook (including the 6s "failsafe" that
 *    exists precisely for this) is created inside `if (!armed) return`, the
 *    failsafe could not fire either. A rejected promise is not a render error,
 *    so `error.tsx` never caught it. Result: stranded on an empty gradient with
 *    no text, no button, and no way out but editing the URL.
 *
 * 2. IT SHOWED NOTHING WHILE IT WAITED. The greeting rendered only after three
 *    Supabase round-trips (getUser → users.role → coaches+players). The
 *    time-of-day word needs no network at all — it comes off the local clock —
 *    so the screen was blank for no reason.
 *
 * 3. IT WAS A DESIGN ORPHAN. A hardcoded `#FFFEFA → #FFF7E0 → #FDEAC0`
 *    gradient, an inline `"DM Sans"` stack for a font this repo no longer
 *    loads, `#1c1917` ink, and a Skip button on retired `cream-100` /
 *    `stone-700` / `primary-600` tokens using the legacy `ui/button`. None of
 *    it responds to the dark theme, so a dark-mode user got a full-screen
 *    LIGHT ORANGE flash on every sign-in before landing on espresso.
 *
 * HOW THIS VERSION CANNOT HANG
 * ----------------------------
 * The navigation deadline is anchored to MOUNT, not to identity resolution.
 * That is safe because the destination is already known at mount in every real
 * flow: `golf-sign-in-form.tsx` always passes `?next=`, and the sign-in action
 * has already resolved the role to build it. The identity fetch only supplies
 * the NAME (cosmetic) and, in the no-`next` fallback, an admin destination —
 * and even that is belt-and-braces, because `(dashboard)/layout.tsx` redirects
 * admins itself. So the fetch can fail, time out, or never return and the user
 * still lands on time. It is also wrapped in try/catch/finally regardless.
 *
 * THE HAND-OFF
 * ------------
 * The page wash is `bg-canvas bg-canvas-gradient` — byte-identical to what
 * AppShell and FairwayShellSkeleton paint on the other side. Crossing from here
 * to the dashboard no longer changes the background at all; only the content on
 * top of it changes. The greeting also uses the SAME `font-fw-display`
 * treatment as the dashboard's plinth opener, so the sentence read here is the
 * sentence waiting at the top of the dashboard.
 *
 * LAYOUT IS LEFT-ANCHORED, DELIBERATELY. The name arrives after the greeting
 * does. Centred text would re-centre — and visibly slide — the instant it
 * lands. Left-anchored, "Good morning," never moves; the name simply appears on
 * the line below it. The second line's height is reserved from first paint so
 * the block does not grow either.
 * ========================================================================== */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { createClient } from '@/lib/supabase/client';
import { isSafeInternalPath } from '@/lib/utils/safe-redirect';
import { resolveAdminPostLoginPath } from '@/lib/golf/admin-redirect';
import { getGreeting, getTimeOfDay } from '@/lib/utils/time-of-day';
import { extractFirstName, extractLastName } from '@/lib/utils/names';
import { useSequencedNavigation } from '@/hooks/use-sequenced-navigation';
import { fairwayScope } from '@/lib/redesign/flag';
// DIRECT-FILE imports, not the `@/components/fairway` barrel. This is a
// pre-dashboard auth interstitial: it must stay featherweight, because whatever
// it imports is on the critical path of the one screen standing between the
// user and their dashboard. Importing `{ Button }` from the barrel pulls the
// entire Fairway component graph — which reaches into the CoachHelm tree — into
// this route's bundle, and in dev that surfaced immediately as a Turbopack
// "module factory is not available" crash originating in PlayerFocusAreas.tsx,
// a component this page has no business knowing about. `controls/button` costs
// react + radix Slot + cn + haptics and nothing else.
import { Button } from '@/components/fairway/controls/button';

/**
 * Timings, in ms, ALL measured from mount.
 *
 * The old constants were measured from `ready` — i.e. from the end of three
 * network round-trips — so the real wait was "3.1s plus however long Supabase
 * took", unbounded. Anchoring to mount makes the whole screen a fixed cost.
 *
 * 1900ms is long enough to read a short sentence (~1.4s is the usual figure for
 * a 3-4 word line) with a beat either side, and short enough that nobody
 * reaches for Skip. The old 3100ms was roughly double what the content needs.
 */
/**
 * Entrance delay + duration for the greeting.
 *
 * These are deliberately quick for a screen this short-lived. The budget is
 * unforgiving: with a 140ms delay and a 700ms fade the line was not fully
 * opaque until 840ms, and the exit begins at 1650ms — leaving barely 800ms of
 * fully-legible text on a screen whose entire job is to be read. At 60/450 the
 * line settles by ~510ms and holds legible for ~1.1s, which is comfortably past
 * the ~350ms it takes to read three words.
 */
const T_NAME_IN = 60;
const D_ENTER = 0.45;
const T_FADE_OUT = 1650;
const T_NAVIGATE = 1900;
/**
 * Reduced motion still leaves early — there is no animation to watch, so the
 * screen has nothing to offer once it has been read — but not as early as it
 * used to. The previous 900ms handed the users most likely to need the escape
 * hatch the SHORTEST window in which to find and press it, which is backwards.
 * At 1400ms the text is legible from the first frame (no fade to wait through)
 * and there is still over a second in which to reach Skip.
 */
const T_FADE_OUT_REDUCED = 1150;
const T_NAVIGATE_REDUCED = 1400;
/** Hard escape if router.replace never commits. Also armed from mount. */
const T_FAILSAFE = 4500;

type NameState =
  | { status: 'pending' }
  | { status: 'named'; display: string }
  | { status: 'anonymous' };

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next');

  // Local clock only — no network, so this is correct on the very first frame.
  const greeting = useMemo(() => getGreeting(getTimeOfDay()), []);

  const [name, setName] = useState<NameState>({ status: 'pending' });
  const [leaving, setLeaving] = useState(false);
  // `?? false` is exactly what the shared guard in src/lib/coachhelm/v3/motion.ts
  // does (it is a one-line wrapper). Inlining it keeps this route off the
  // CoachHelm module graph — see the import note above — while giving the same
  // pre-hydration-safe value: framer-motion returns `null` before hydration, and
  // `null` would make an `initial` prop truthy-check misbehave. Every consumer
  // below also gates its `initial` prop on this, which is the half of the
  // contract that actually prevents the React #418 hydration mismatch.
  const prefersReducedMotion = useReducedMotion() ?? false;

  // Destination resolved SYNCHRONOUSLY at mount from the query param the
  // sign-in form always supplies. The identity effect may upgrade it (admin
  // with no `next`), but nothing waits on that — see the file doc.
  const destRef = useRef<string>(
    isSafeInternalPath(nextParam) ? (nextParam as string) : '/golf/dashboard',
  );

  const onFade = useCallback(() => setLeaving(true), []);

  // ARMED UNCONDITIONALLY. This is the whole fix for the hang: the sequence no
  // longer waits on anything that can fail.
  //
  // DECLARED HERE, above the identity effect, ON PURPOSE. It used to live below
  // that effect, which meant the effect could not reference `cancelSequence` —
  // and so the signed-out exit below never stood the sequence down. See the
  // comment on that branch for what that cost.
  const { cancel: cancelSequence } = useSequencedNavigation({
    armed: true,
    destinationRef: destRef,
    fadeAtMs: prefersReducedMotion ? T_FADE_OUT_REDUCED : T_FADE_OUT,
    navigateAtMs: prefersReducedMotion ? T_NAVIGATE_REDUCED : T_NAVIGATE,
    failsafeAtMs: T_FAILSAFE,
    onFade,
  });

  // ── Identity: cosmetic. Never gates the greeting, the Skip button, or the
  //    navigation. Any failure degrades to the bare time-of-day greeting. ────
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;

        // Signed out — bounce immediately rather than greeting a stranger.
        if (!user) {
          // Stand the automatic sequence down BEFORE leaving. It is armed
          // unconditionally, its navigate step is a `router.replace` to the
          // dashboard, and its 4.5s failsafe is a hard `window.location.replace`
          // — neither of which cares that we have since left the page.
          //
          // Left armed (it was), a signed-out visitor to /golf/welcome got
          // bounced here to /golf/login, started typing their password, and was
          // then yanked onto /golf/dashboard and HARD-RELOADED a few seconds
          // later — which, having no session, bounced them back to /golf/login
          // with the form cleared. The identical hazard is already documented on
          // the Skip handler below; this exit simply never got the same
          // treatment, because `cancelSequence` used to be declared after this
          // effect and so was unreachable from here.
          cancelSequence();

          // ThemeScript now boots the golf theme on THIS path (it has to: the
          // page paints on the same canvas tokens as the dashboard). But
          // `router.replace` is a soft navigation, so the `.dark` class it set
          // on <html> would survive onto /golf/login — which is only partly
          // dark-capable, and renders dark form fields on its light illustrated
          // scene. The dashboard is the only destination that wants the class;
          // this is the one exit that does not, so it cleans up after itself.
          try {
            document.documentElement.classList.remove('dark');
            document.documentElement.setAttribute('data-fw-theme', 'light');
          } catch {
            /* non-DOM environment — nothing to clean up */
          }
          router.replace('/golf/login');
          return;
        }

        // Only consulted when there is no `next` to honour. An admin who slips
        // through to /golf/dashboard is still redirected by that route's own
        // layout, so this is an optimisation, not a correctness requirement.
        if (!isSafeInternalPath(nextParam)) {
          const { data: userRow } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          if (cancelled) return;
          destRef.current = resolveAdminPostLoginPath(
            (userRow?.role as string | undefined) === 'admin',
          );
        }

        const [coachRes, playerRes] = await Promise.all([
          supabase.from('golf_coaches').select('full_name').eq('user_id', user.id).maybeSingle(),
          supabase.from('golf_players').select('first_name').eq('user_id', user.id).maybeSingle(),
        ]);
        if (cancelled) return;

        const coachFull = coachRes.data?.full_name as string | null | undefined;
        const playerFirst = playerRes.data?.first_name as string | null | undefined;

        if (coachFull) {
          const isTitle = (s: string | null) => !!s && /^coach$/i.test(s);
          const last = extractLastName(coachFull);
          const first = extractFirstName(coachFull);
          // Avoid "Coach Coach" when the stored full_name is something like
          // "Demo Coach" (the literal title is the last word) — fall back to the
          // first name in that case. The old guard checked only `last`, so a
          // SINGLE-WORD full_name of exactly "Coach" (last === first === "Coach")
          // produced the very "Coach Coach" the comment claimed to prevent.
          // Re-testing the chosen suffix catches both shapes.
          const picked = !last || isTitle(last) ? first : last;
          const suffix = isTitle(picked) ? null : picked;
          // A coach row whose full_name sanitises to nothing rendered the bare
          // word "Coach" — the literal "Coach blank" in the bug report. Falling
          // through to `anonymous` shows a complete sentence instead of a title
          // with a missing name after it.
          setName(suffix ? { status: 'named', display: `Coach ${suffix}` } : { status: 'anonymous' });
          return;
        }

        if (playerFirst) {
          const first = extractFirstName(playerFirst);
          setName(first ? { status: 'named', display: first } : { status: 'anonymous' });
          return;
        }

        const metaFullName = (user.user_metadata?.full_name ?? user.user_metadata?.name) as
          | string
          | undefined;
        const first = extractFirstName(metaFullName);
        setName(first ? { status: 'named', display: first } : { status: 'anonymous' });
      } catch {
        // Network/auth failure — the greeting still stands on its own and the
        // navigation deadline is already running. Never leave `pending`, or the
        // reserved second line would hold an empty row open until we leave.
        if (!cancelled) setName({ status: 'anonymous' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nextParam, router, cancelSequence]);

  // Skip's own exit timer, tracked so it cannot fire after unmount. Previously
  // this was a bare `window.setTimeout` with no handle: skip, navigate onward
  // fast, and 180ms later it called `router.replace` again from a component
  // that no longer existed, yanking the user off whatever they had reached.
  const skipTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (skipTimerRef.current !== null) window.clearTimeout(skipTimerRef.current);
    },
    [],
  );

  /**
   * Idempotent by design. Someone dismissing an animation they have seen before
   * taps Skip two or three times in quick succession — that is the whole
   * interaction — and each extra tap used to arm ANOTHER exit timer while
   * overwriting `skipTimerRef` with the newest handle. The orphaned earlier
   * timers were then unreachable: the unmount cleanup could only clear the last
   * one, so the rest still fired `router.replace` from a component that no
   * longer existed. That is precisely the failure the comment above says was
   * fixed — tracking one handle addressed a single timer, not the unbounded set
   * a repeat tap creates.
   */
  const skippedRef = useRef(false);
  const onSkip = useCallback(() => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    // Stand the automatic sequence down FIRST. Its failsafe is a hard
    // `window.location.replace`; left armed, it would fire ~4.5s later on
    // whatever page the user had since reached and reload the browser there.
    cancelSequence();
    setLeaving(true);
    // A short beat so the exit reads as intentional rather than abrupt.
    skipTimerRef.current = window.setTimeout(() => router.replace(destRef.current), 160);
  }, [cancelSequence, router]);

  const hasName = name.status === 'named';
  // The comma only appears once a name is on the way. It is appended to the end
  // of a left-anchored line, so nothing reflows when it does.
  const line1 = hasName ? `${greeting},` : name.status === 'anonymous' ? `${greeting}.` : greeting;
  const spoken = hasName ? `${greeting}, ${name.display}.` : `${greeting}.`;
  const holdMs = prefersReducedMotion ? T_NAVIGATE_REDUCED : T_NAVIGATE;

  return (
    <LazyMotion features={loadFeatures}>
      <main
        className={fairwayScope(
          'relative flex min-h-[100svh] flex-col overflow-hidden',
          'bg-canvas bg-canvas-gradient font-fw-sans text-text-primary antialiased',
        )}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Announced once, when the sentence is final. Announcing the partial
            greeting first would read the user two half-sentences. */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {name.status === 'pending' ? '' : spoken}
        </div>

        <m.div
          className="flex flex-1 flex-col justify-center px-8 sm:px-12 lg:px-20"
          initial={false}
          animate={{ opacity: leaving ? 0 : 1, y: leaving ? -6 : 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.5,
            ease: [0.32, 0.72, 0, 1],
          }}
        >
          {/* Width in rem, NOT ch. `ch` resolves against the element's OWN
              font-size, and this wrapper inherits the 16px body size — so a
              `max-w-[22ch]` here computed to roughly 180px and wrapped the
              4rem greeting after its first word ("Good / morning"). The h1
              below carries its own ch-based measure, where the unit means what
              it looks like it means. */}
          <div className="w-full max-w-[44rem]">
            {/* Brand — quiet, and the same mark that is about to appear at the
                top of the rail. Ties the two screens together. */}
            <m.div
              className="mb-9 flex items-center gap-2.5"
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: prefersReducedMotion ? 0 : D_ENTER, ease: [0.22, 1, 0.36, 1] }}
            >
              <Image
                src="/helm-golf-logo-transparent.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 object-contain"
                priority
                unoptimized
              />
              <span className="font-fw-display text-body-lg font-medium leading-none tracking-[-0.012em] text-text-primary">
                Golf<span className="text-accent-700">Helm</span>
              </span>
            </m.div>

            <h1
              className="max-w-[18ch] font-fw-display font-medium tracking-[-0.03em] text-text-primary"
              style={{ fontSize: 'clamp(2.25rem, 6vw, 4rem)', lineHeight: 1.08 }}
            >
              {/* Line 1 is present on the first painted frame — no network. */}
              <m.span
                className="block"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: prefersReducedMotion ? 0 : D_ENTER,
                  delay: prefersReducedMotion ? 0 : T_NAME_IN / 1000,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {line1}
              </m.span>

              {/* Line 2's box is reserved from first paint (min-height of one
                  line) so the name landing never grows the block. */}
              <span className="block" style={{ minHeight: '1.08em' }}>
                {hasName && (
                  <m.span
                    className="block text-accent-700"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: prefersReducedMotion ? 0 : D_ENTER,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    {name.display}.
                  </m.span>
                )}
              </span>
            </h1>

            {/* A real deadline, drawn. The wait is short but it is not nothing,
                and an unexplained pause is what made the old screen feel broken.
                This is the actual navigate time, not a decorative loop — it
                reaches the end exactly when the page leaves. */}
            <div
              aria-hidden
              className="mt-10 h-px w-full max-w-[12rem] overflow-hidden bg-border-subtle"
            >
              <m.div
                className="h-full w-full origin-left bg-accent-600"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: prefersReducedMotion ? 0 : holdMs / 1000,
                  ease: 'linear',
                }}
              />
            </div>
          </div>
        </m.div>

        {/* Skip — rendered from the FIRST frame, not gated on identity. The old
            one only appeared once `ready` flipped, which meant it was missing
            in exactly the failure where it was the only way out. */}
        <div className="flex justify-end px-8 pb-8 sm:px-12 lg:px-20">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onSkip}
            aria-label="Skip the welcome screen and continue"
          >
            Skip
          </Button>
        </div>
      </main>
    </LazyMotion>
  );
}

export default function GolfWelcomePage() {
  return (
    <Suspense
      fallback={
        // Same wash as the resolved page, so the Suspense hand-off is invisible.
        <div
          role="status"
          aria-label="Loading"
          className={fairwayScope('min-h-[100svh] bg-canvas bg-canvas-gradient')}
        />
      }
    >
      <WelcomeContent />
    </Suspense>
  );
}
