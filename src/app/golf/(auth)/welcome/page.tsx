'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

// Animation timing constants (ms) — one source of truth.
// Measured from the moment `ready` becomes true (after identity is fetched).
const T_GREETING_IN = 0;
const T_RULE_IN = 500;
const T_NAME_IN = 950;
// Name animation finishes ~1950ms. Hold ~1050ms so the moment breathes,
// then begin the exit. Total on-screen after data load: ~3s.
const T_FADE_OUT = 3000;
const T_NAV = 3500;
// Failsafe: if router.replace hasn't committed after ~5.5s (service-worker
// edge case, middleware loop), hard-navigate via window.location.
const T_FAILSAFE = 5500;

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function isSafeInternalPath(path: string | null): path is string {
  if (!path) return false;
  if (path.includes('//')) return false;
  return path.startsWith('/golf/') || path.startsWith('/baseball/');
}

function extractLastName(fullName: string | null): string | null {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1] ?? null;
}

// ─────────────────────────────────────────────────────────────
// Shared painterly scene (simplified — subset that matches login for continuity)
// ─────────────────────────────────────────────────────────────
function BackgroundScene() {
  const P = {
    cream1: '#FFFEFA',
    cream2: '#FFF7E0',
    cream3: '#FDEAC0',
    glow: 'rgba(255, 214, 168, 0.55)',
    tree: ['#a9bf86', '#88a06d', '#5f7d45', '#3f5930'],
    trunk: '#6a503a',
    grass: '#c2c681',
    grassShadow: '#a2ad62',
    flag: '#b83a29',
  };
  const Tree = ({ x, y, scale = 1, sway = 0 }: { x: number; y: number; scale?: number; sway?: number }) => (
    <g transform={`translate(${x}, ${y})`}>
      <g
        style={{
          transformBox: 'fill-box',
          transformOrigin: '50% 100%',
          animation: `treeSway ${7 + sway}s ease-in-out infinite`,
          animationDelay: `${sway * 0.5}s`,
        }}
      >
        <path
          d={`M -2 ${18 * scale} Q -1 ${36 * scale}, -3 ${50 * scale} L 3 ${50 * scale} Q 1 ${36 * scale}, 2 ${18 * scale} Z`}
          fill={P.trunk}
          opacity="0.85"
        />
        <circle cx={0} cy={0} r={24 * scale} fill={P.tree[0]} />
        <circle cx={-16 * scale} cy={-4 * scale} r={18 * scale} fill={P.tree[1]} />
        <circle cx={14 * scale} cy={-10 * scale} r={17 * scale} fill={P.tree[0]} />
        <circle cx={-4 * scale} cy={-22 * scale} r={15 * scale} fill={P.tree[1]} />
        <circle cx={12 * scale} cy={-22 * scale} r={12 * scale} fill={P.tree[2]} />
        <circle cx={-2 * scale} cy={10 * scale} r={20 * scale} fill={P.tree[2]} />
        <circle cx={16 * scale} cy={8 * scale} r={14 * scale} fill={P.tree[3]} />
        <circle cx={-18 * scale} cy={12 * scale} r={13 * scale} fill={P.tree[3]} />
      </g>
    </g>
  );

  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${P.cream1} 0%, ${P.cream2} 55%, ${P.cream3} 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -140,
          left: '30%',
          width: 480,
          height: 480,
          background: `radial-gradient(circle, ${P.glow} 0%, transparent 70%)`,
          animation: 'sunPulse 8s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
      <svg
        style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 340, pointerEvents: 'none', display: 'block' }}
        viewBox="0 0 390 340"
        preserveAspectRatio="xMidYMax slice"
      >
        <path
          d="M -20 220 C 40 200, 90 225, 150 215 C 210 200, 260 225, 330 215 C 370 210, 400 220, 410 225 L 410 360 L -20 360 Z"
          fill={P.grass}
          opacity="0.85"
        />
        <path d="M 20 260 Q 120 248, 220 262 Q 310 255, 390 268" stroke={P.grassShadow} strokeWidth="1.5" fill="none" opacity="0.5" />
        <path d="M -10 300 Q 100 290, 200 302 Q 300 295, 400 305" stroke={P.grassShadow} strokeWidth="1.5" fill="none" opacity="0.4" />
        <ellipse cx="200" cy="260" rx="72" ry="22" fill={P.grassShadow} opacity="0.95" />
        <ellipse cx="200" cy="258" rx="66" ry="18" fill={P.grass} opacity="0.7" />
        <ellipse cx="205" cy="258" rx="4.5" ry="2.2" fill="#1a1612" />
        <g transform="translate(205, 258)">
          <line x1="0" y1="0" x2="0" y2="-52" stroke="#2d2a25" strokeWidth="2.4" strokeLinecap="round" />
          <g style={{ transformBox: 'fill-box', transformOrigin: '0% 50%', animation: 'flagFlutter 2.4s ease-in-out infinite' }}>
            <path
              d="M 0 -52 C 7 -54, 15 -50, 22 -52 L 22 -38 C 15 -36, 7 -40, 0 -38 Z"
              fill={P.flag}
              stroke="#7a2418"
              strokeWidth="0.8"
              strokeOpacity="0.5"
            />
          </g>
          <circle cx="0" cy="0" r="2" fill="#1c1917" />
        </g>
      </svg>
      <svg
        style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 340, pointerEvents: 'none', display: 'block' }}
        viewBox="0 0 390 340"
        preserveAspectRatio="xMidYMax slice"
      >
        <Tree x={42} y={258} scale={1.35} sway={0} />
        <Tree x={22} y={290} scale={1.0} sway={1} />
        <Tree x={345} y={260} scale={1.2} sway={2} />
        <Tree x={368} y={295} scale={0.95} sway={0.5} />
        <Tree x={112} y={278} scale={0.7} sway={1.5} />
        <Tree x={290} y={282} scale={0.7} sway={2.5} />
      </svg>
      <svg
        style={{
          position: 'absolute',
          inset: -20,
          width: 'calc(100% + 40px)',
          height: 'calc(100% + 40px)',
          opacity: 0.05,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
          animation: 'grainShift 1.4s steps(4) infinite',
        }}
      >
        <filter id="grain-filter-welcome">
          <feTurbulence type="fractalNoise" baseFrequency="1.8" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-filter-welcome)" />
      </svg>
    </div>
  );
}

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next');
  const [greeting] = useState(getGreeting);
  const [name, setName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Destination is held in a ref so the navigation timers always see the
  // correct value even if state hasn't flushed yet. We also latch it once the
  // timers are armed to guarantee stability.
  const destRef = useRef<string>('/golf/dashboard');
  const hasArmedRef = useRef(false);
  const hasNavigatedRef = useRef(false);

  // ── Load identity + destination ─────────────────────────────
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
      destRef.current = nextSafe ?? (isAdmin ? '/golf/admin' : '/golf/dashboard');

      // Parallel fetch identity from coach OR player profile (one of them will hit)
      const [coachRes, playerRes] = await Promise.all([
        supabase.from('golf_coaches').select('full_name').eq('user_id', user.id).maybeSingle(),
        supabase.from('golf_players').select('first_name').eq('user_id', user.id).maybeSingle(),
      ]);
      if (cancelled) return;

      const coachName = coachRes.data?.full_name as string | null | undefined;
      const playerFirst = playerRes.data?.first_name as string | null | undefined;

      if (coachName) {
        const last = extractLastName(coachName);
        setName(last ? `Coach ${last}` : 'Coach');
      } else if (playerFirst) {
        setName(playerFirst);
      } else {
        setName(null);
      }

      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [nextParam, router]);

  // ── Arm navigation timers ONCE when ready ───────────────────
  // These timers are NOT tied to effect cleanup — they persist until fired or
  // the component unmounts. This is the fix for the prior bug where the
  // fade-out state change cancelled the pending nav timer.
  useEffect(() => {
    if (!ready || hasArmedRef.current) return;
    hasArmedRef.current = true;

    const fadeId = window.setTimeout(() => {
      setLeaving(true);
    }, T_FADE_OUT);

    const navId = window.setTimeout(() => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      router.replace(destRef.current);
    }, T_NAV);

    // Failsafe: if Next router hasn't taken us anywhere in 4.5s, hard-navigate.
    // Covers pathological middleware loops / service-worker interference.
    const failsafeId = window.setTimeout(() => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      if (typeof window !== 'undefined') {
        window.location.replace(destRef.current);
      }
    }, T_FAILSAFE);

    return () => {
      // Only fires on real unmount (nav completed). Safe to clear.
      window.clearTimeout(fadeId);
      window.clearTimeout(navId);
      window.clearTimeout(failsafeId);
    };
  }, [ready, router]);

  // Prefetch destination as soon as we know it, so the onward push is instant
  useEffect(() => {
    if (!ready) return;
    try {
      router.prefetch(destRef.current);
    } catch {
      // prefetch is best-effort
    }
  }, [ready, router]);

  const displayName = name ?? 'welcome back';

  return (
    <LazyMotion features={domAnimation}>
      <div
        className="relative overflow-hidden"
        style={{
          height: '100dvh',
          fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
        }}
      >
        <BackgroundScene />

        {/* Content — editorial greeting in upper third, course stays at bottom */}
        <m.div
          className="relative z-10 h-full flex flex-col items-center px-6"
          style={{
            paddingTop: 'max(4.5rem, calc(env(safe-area-inset-top) + 3.25rem))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          }}
          initial={false}
          animate={{
            opacity: leaving ? 0 : 1,
            scale: leaving ? 1.035 : 1,
            y: leaving ? -4 : 0,
          }}
          transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="flex flex-col items-center text-center">
            {ready && (
              <>
                {/* Greeting — system serif italic for editorial contrast */}
                <m.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.75,
                    delay: T_GREETING_IN / 1000,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{
                    fontSize: 21,
                    fontWeight: 400,
                    color: '#78716c',
                    letterSpacing: '-0.015em',
                    lineHeight: 1.15,
                    fontStyle: 'italic',
                    fontFamily: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
                  }}
                >
                  {greeting},
                </m.div>

                {/* Hairline accent — draws in from the centre */}
                <m.div
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{
                    duration: 0.6,
                    delay: T_RULE_IN / 1000,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="my-5"
                  style={{
                    width: 48,
                    height: 1,
                    background: 'linear-gradient(90deg, transparent, rgba(168,162,158,0.85) 50%, transparent)',
                    transformOrigin: '50% 50%',
                  }}
                />

                {/* Display name — the hero. Subtle blur-in + rise, with a gentle breathing hold. */}
                <m.div
                  initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{
                    duration: 1.0,
                    delay: T_NAME_IN / 1000,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{
                    fontSize: 'clamp(40px, 11.5vw, 56px)',
                    fontWeight: 700,
                    color: '#1c1917',
                    letterSpacing: '-0.045em',
                    lineHeight: 1.02,
                    textWrap: 'balance' as const,
                    filter: 'drop-shadow(0 1px 1px rgba(60,40,20,0.08))',
                    fontFeatureSettings: '"ss01", "ss02"',
                    maxWidth: '90vw',
                  }}
                >
                  {displayName}.
                </m.div>
              </>
            )}
          </div>

          {/* Spacer — keeps the greeting in the upper third so the course
              illustration remains visible and uncrowded at the bottom */}
          <div className="flex-1" />
        </m.div>

        <style jsx>{`
          @keyframes sunPulse {
            0%, 100% { opacity: 0.55; transform: scale(1); }
            50%      { opacity: 0.75; transform: scale(1.06); }
          }
          @keyframes flagFlutter {
            0%, 100% { transform: rotate(-1.5deg) scaleY(1); }
            25%      { transform: rotate(0.5deg) scaleY(0.96); }
            50%      { transform: rotate(2deg) scaleY(1); }
            75%      { transform: rotate(0.5deg) scaleY(0.98); }
          }
          @keyframes treeSway {
            0%, 100% { transform: rotate(-0.6deg); }
            50%      { transform: rotate(0.6deg); }
          }
          @keyframes grainShift {
            0%, 100% { transform: translate(0, 0); }
            25%      { transform: translate(-2%, 1%); }
            50%      { transform: translate(1%, -2%); }
            75%      { transform: translate(2%, 2%); }
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
          className="flex items-center justify-center"
          style={{ height: '100dvh', background: 'linear-gradient(180deg, #FFFEFA 0%, #FFF7E0 55%, #FDEAC0 100%)' }}
        />
      }
    >
      <WelcomeContent />
    </Suspense>
  );
}

