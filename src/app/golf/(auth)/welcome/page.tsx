'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function isSafeInternalPath(path: string | null): path is string {
  if (!path) return false;
  // Only allow internal paths under /golf/ or /baseball/ — no protocol-relative,
  // no absolute URLs, no double slashes.
  if (path.includes('//')) return false;
  return path.startsWith('/golf/') || path.startsWith('/baseball/');
}

function extractLastName(fullName: string | null): string | null {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1] ?? null;
}

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next');
  const [greeting] = useState(getGreeting);
  const [name, setName] = useState<string | null>(null);
  const [destination, setDestination] = useState<string>('/golf/dashboard');
  const [phase, setPhase] = useState<'loading' | 'animating' | 'leaving'>('loading');
  const hasStartedRef = useRef(false);

  // Fetch identity + determine destination
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        router.replace('/golf/login');
        return;
      }

      // Determine default destination based on role
      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const isAdmin = (userRow?.role as string | undefined) === 'admin';
      const nextSafe = isSafeInternalPath(nextParam) ? nextParam : null;
      const dest = nextSafe ?? (isAdmin ? '/golf/admin' : '/golf/dashboard');

      if (cancelled) return;
      setDestination(dest);

      // Try coach first
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('full_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (coach?.full_name) {
        const last = extractLastName(coach.full_name as string);
        setName(last ? `Coach ${last}` : 'Coach');
      } else {
        const { data: player } = await supabase
          .from('golf_players')
          .select('first_name')
          .eq('user_id', user.id)
          .maybeSingle();

        if (cancelled) return;

        if (player?.first_name) {
          setName(player.first_name as string);
        }
      }

      if (!cancelled) setPhase('animating');
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [nextParam, router]);

  // Hold on screen briefly after animation finishes, then hand off.
  useEffect(() => {
    if (phase !== 'animating' || hasStartedRef.current) return;
    hasStartedRef.current = true;

    const fadeOutTimer = setTimeout(() => {
      setPhase('leaving');
    }, 1900);

    const navTimer = setTimeout(() => {
      router.replace(destination);
    }, 2300);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(navTimer);
    };
  }, [phase, destination, router]);

  const showContent = phase === 'animating';
  const leaving = phase === 'leaving';

  return (
    <LazyMotion features={domAnimation}>
      <div
        className="min-h-dvh overflow-hidden relative"
        style={{
          fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
          background: 'linear-gradient(180deg, #FFFEFA 0%, #FFF7E0 55%, #FDEAC0 100%)',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Soft warm halo for brand continuity with /golf/login */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -140,
            left: '30%',
            width: 480,
            height: 480,
            background: 'radial-gradient(circle, rgba(255,214,168,0.55) 0%, transparent 70%)',
            animation: 'sunPulse 8s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />

        <m.div
          className="relative z-10 flex flex-col items-center justify-center text-center px-6"
          style={{ minHeight: '100dvh' }}
          animate={{ opacity: leaving ? 0 : 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {showContent && (
            <>
              <m.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  fontSize: 22,
                  fontWeight: 500,
                  color: '#78716c',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                }}
              >
                {greeting},
              </m.div>
              <m.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="mt-2"
                style={{
                  fontSize: 44,
                  fontWeight: 700,
                  color: '#1c1917',
                  letterSpacing: '-0.04em',
                  lineHeight: 1.05,
                  textWrap: 'balance' as const,
                  filter: 'drop-shadow(0 1px 1px rgba(60,40,20,0.08))',
                }}
              >
                {name ?? 'welcome back'}.
              </m.div>
            </>
          )}
        </m.div>

        <style jsx>{`
          @keyframes sunPulse {
            0%, 100% { opacity: 0.55; transform: scale(1); }
            50%      { opacity: 0.75; transform: scale(1.06); }
          }
          @media (prefers-reduced-motion: reduce) {
            :global(*) {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
            }
          }
        `}</style>
      </div>
    </LazyMotion>
  );
}

export default function GolfWelcomePage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-dvh flex items-center justify-center"
          style={{ background: 'linear-gradient(180deg, #FFFEFA 0%, #FFF7E0 55%, #FDEAC0 100%)' }}
        />
      }
    >
      <WelcomeContent />
    </Suspense>
  );
}
