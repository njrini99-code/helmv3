'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { createClient } from '@/lib/supabase/client';
import { isSafeInternalPath } from '@/lib/utils/safe-redirect';
import { resolveAdminPostLoginPath } from '@/lib/golf/admin-redirect';
import { getGreeting, getTimeOfDay, type TimeOfDay } from '@/lib/utils/time-of-day';
import { extractFirstName, extractLastName } from '@/lib/utils/names';
import { useSequencedNavigation } from '@/hooks/use-sequenced-navigation';
import { Button } from '@/components/ui/button';

// Animation timing (ms), measured from the moment `ready` becomes true.
// Full motion: name fades in, holds ~1.5s legible, fades out, navigates.
// Reduced motion: much shorter so the user isn't stranded on a static screen.
const T_NAME_IN = 120;
const T_FADE_OUT_FULL = 2600;
const T_NAV_FULL = 3100;
const T_FADE_OUT_REDUCED = 900;
const T_NAV_REDUCED = 1200;
// Failsafe: hard-navigate via window.location if router.replace never commits.
const T_FAILSAFE = 6000;

type Role = 'coach' | 'player' | 'other';

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next');
  const [timeOfDay] = useState<TimeOfDay>(() => getTimeOfDay());
  const greeting = getGreeting(timeOfDay);

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('other');
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const prefersReducedMotion = useReducedMotion() ?? false;
  const h1Ref = useRef<HTMLHeadingElement | null>(null);

  // Destination + armed flags travel via refs so navigation timers persist
  // across state changes (e.g. when `leaving` flips true mid-sequence).
  const destRef = useRef<string>('/golf/dashboard');

  // Load identity + destination
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        router.replace('/golf/login');
        return;
      }

      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const isAdmin = (userRow?.role as string | undefined) === 'admin';
      const nextSafe = isSafeInternalPath(nextParam) ? nextParam : null;
      destRef.current = nextSafe ?? resolveAdminPostLoginPath(isAdmin);

      const [coachRes, playerRes] = await Promise.all([
        supabase.from('golf_coaches').select('full_name').eq('user_id', user.id).maybeSingle(),
        supabase.from('golf_players').select('first_name').eq('user_id', user.id).maybeSingle(),
      ]);
      if (cancelled) return;

      const coachFull = coachRes.data?.full_name as string | null | undefined;
      const playerFirst = playerRes.data?.first_name as string | null | undefined;

      if (coachFull) {
        const last = extractLastName(coachFull);
        // Avoid "Coach Coach" when the stored full_name is something like
        // "Demo Coach" (the literal title is the last word).
        const lastIsTitle = last && /^coach$/i.test(last);
        const first = extractFirstName(coachFull);
        const suffix = !last || lastIsTitle ? first : last;
        setDisplayName(suffix ? `Coach ${suffix}` : 'Coach');
        setRole('coach');
      } else if (playerFirst) {
        setDisplayName(extractFirstName(playerFirst));
        setRole('player');
      } else {
        const metaFullName = (user.user_metadata?.full_name ?? user.user_metadata?.name) as
          | string
          | undefined;
        setDisplayName(extractFirstName(metaFullName));
      }

      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [nextParam, router]);

  // Focus the h1 once rendered so keyboard users have a target and screen
  // readers reliably announce the greeting.
  useEffect(() => {
    if (ready) h1Ref.current?.focus();
  }, [ready]);

  const onFade = useCallback(() => setLeaving(true), []);

  // Arm the fade + navigate + failsafe chain. Timers are shorter under
  // reduced-motion so the user isn't stranded on a static screen.
  useSequencedNavigation({
    armed: ready,
    destinationRef: destRef,
    fadeAtMs: prefersReducedMotion ? T_FADE_OUT_REDUCED : T_FADE_OUT_FULL,
    navigateAtMs: prefersReducedMotion ? T_NAV_REDUCED : T_NAV_FULL,
    failsafeAtMs: T_FAILSAFE,
    onFade,
  });

  // Skip button → navigate immediately (WCAG 2.2.1 escape hatch).
  const onSkip = useCallback(() => {
    setLeaving(true);
    // small delay so the fade feels intentional rather than abrupt
    window.setTimeout(() => router.replace(destRef.current), 180);
  }, [router]);

  const heroText = displayName ? `${greeting}, ${displayName}.` : `${greeting}.`;
  const roleLabel = role === 'coach' ? 'coach' : role === 'player' ? 'player' : 'user';

  return (
    <LazyMotion features={loadFeatures}>
      <main
        className="relative overflow-hidden"
        aria-label={`Welcome back, ${roleLabel}`}
        style={{
          height: '100svh',
          fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
          // Plain warm-cream background — no scene illustration. Keeps the
          // greeting animation the only focal point.
          background: 'linear-gradient(180deg, #FFFEFA 0%, #FFF7E0 55%, #FDEAC0 100%)',
        }}
      >

        {/* Accessibility live-region — guarantees the greeting is announced */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            whiteSpace: 'nowrap',
          }}
        >
          {ready ? heroText : ''}
        </div>

        {/* Centred greeting column */}
        <m.div
          className="relative z-10 h-full flex flex-col items-center justify-center px-6"
          style={{
            paddingTop: 'max(3rem, calc(env(safe-area-inset-top) + 2rem))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          }}
          initial={false}
          animate={{
            opacity: leaving ? 0 : 1,
            y: leaving ? -4 : 0,
          }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.55, ease: [0.32, 0.72, 0, 1] }}
        >
          {ready && (
            <m.h1
              ref={h1Ref}
              tabIndex={-1}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14, filter: 'blur(5px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.95,
                delay: prefersReducedMotion ? 0 : T_NAME_IN / 1000,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{
                fontSize: 'clamp(36px, 6.5vw, 68px)',
                fontWeight: 700,
                color: '#1c1917',
                letterSpacing: '-0.04em',
                lineHeight: 1.05,
                textAlign: 'center',
                textWrap: 'balance' as const,
                filter: 'drop-shadow(0 1px 1px rgba(60,40,20,0.08))',
                fontFeatureSettings: '"ss01", "ss02"',
                maxWidth: '90vw',
                margin: 0,
                outline: 'none', // focus provided by page context; no ring on the hero
              }}
            >
              {heroText}
            </m.h1>
          )}
        </m.div>

        {/* Skip button — WCAG 2.2.1 Timing Adjustable escape hatch.
            Only shown once ready; positioned low-contrast so it doesn't
            distract from the hero line. */}
        {ready && (
          <Button variant="ghost"
            type="button"
            onClick={onSkip}
            aria-label="Skip welcome animation and continue to dashboard"
            className="absolute z-20 bottom-6 right-6 px-4 py-2 rounded-full text-sm font-medium
                       bg-cream-100/75 backdrop-blur-md border border-black/5
                       text-stone-700 hover:text-stone-900 hover:bg-cream-50/92
                       transition-colors duration-150
                       focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2"
            style={{ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
          >
            Skip →
          </Button>
        )}
      </main>
    </LazyMotion>
  );
}

export default function GolfWelcomePage() {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-label="Loading greeting"
          className="flex items-center justify-center"
          style={{ height: '100svh', background: 'linear-gradient(180deg, #FFFEFA 0%, #FFF7E0 55%, #FDEAC0 100%)' }}
        />
      }
    >
      <WelcomeContent />
    </Suspense>
  );
}
