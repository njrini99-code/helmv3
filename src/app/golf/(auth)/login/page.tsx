'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { GolfSignInForm } from '@/components/auth/golf-sign-in-form';
import { createClient } from '@/lib/supabase/client';
import { isNativeApp } from '@/lib/utils/capacitor';

// ─────────────────────────────────────────────────────────────
// Painterly "golf course at dusk" scene — pure background decoration.
// Ported from the Scenic Chooser design (Helm design file).
// ─────────────────────────────────────────────────────────────
function CourseScene() {
  const P = {
    cream1: '#FFFEFA',
    cream2: '#FFF7E0',
    cream3: '#FDEAC0',
    glow: 'rgba(255, 214, 168, 0.55)',
    tree: ['#a9bf86', '#88a06d', '#5f7d45', '#3f5930'],
    trunk: '#6a503a',
    grass: '#c2c681',
    grassShadow: '#a2ad62',
    sand: '#f2e0bc',
    sandShadow: '#d6bb90',
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
        <circle cx={6 * scale} cy={-16 * scale} r={6 * scale} fill="#e8eec8" opacity="0.35" />
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
        <path
          d="M 30 240 C 10 238, -5 252, 5 268 C 15 285, 55 288, 95 280 C 130 275, 145 260, 125 248 C 95 240, 60 238, 30 240 Z"
          fill={P.sand}
        />
        <path d="M 10 270 C 35 282, 75 284, 115 276" stroke={P.sandShadow} strokeWidth="1.2" fill="none" opacity="0.6" />
        <path
          d="M 290 260 C 315 254, 365 258, 395 268 C 405 285, 375 295, 340 292 C 305 288, 275 278, 285 266 Z"
          fill={P.sand}
        />
        <path d="M 300 280 C 335 290, 375 288, 395 280" stroke={P.sandShadow} strokeWidth="1.2" fill="none" opacity="0.6" />
        <ellipse cx="200" cy="260" rx="72" ry="22" fill={P.grassShadow} opacity="0.95" />
        <ellipse cx="200" cy="258" rx="66" ry="18" fill={P.grass} opacity="0.7" />
        <ellipse cx="205" cy="258" rx="4.5" ry="2.2" fill="#1a1612" />
        <ellipse cx="205" cy="257.5" rx="3.5" ry="1.5" fill="#000" />
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
        <filter id="grain-filter-login">
          <feTurbulence type="fractalNoise" baseFrequency="1.8" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-filter-login)" />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 220,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.45) 40%, rgba(255,255,255,0) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const LOGIN_MESSAGES: Record<string, string> = {
    session_expired: 'Session expired. Please sign in again.',
    password_reset: 'Password reset successfully. Please sign in with your new password.',
    account_created: 'Account created successfully. Please sign in.',
    signed_out: 'You have been signed out.',
  };
  const messageKey = searchParams.get('message');
  const successMessage = messageKey ? LOGIN_MESSAGES[messageKey] ?? null : null;
  const returnTo = searchParams.get('returnTo');
  const signupHref = returnTo ? `/golf/signup?returnTo=${encodeURIComponent(returnTo)}` : '/golf/signup';

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
        const admin = (data?.role as string) === 'admin';
        setIsAdmin(admin);
        setIsLoggedIn(true);
        const dest = returnTo && (returnTo.startsWith('/golf/') || returnTo.startsWith('/baseball/'))
          ? returnTo
          : admin
          ? '/golf/admin'
          : '/golf/dashboard';
        router.replace(`/golf/welcome?next=${encodeURIComponent(dest)}`);
        return;
      }
      setIsLoggedIn(false);
      setCheckingAuth(false);
    }
    checkAuth();
  }, [supabase, supabase.auth, returnTo, router]);

  async function handleSignOut() {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setIsLoggingOut(false);
    router.refresh();
  }

  return (
    <LazyMotion features={domAnimation}>
      <div
        className="relative overflow-hidden"
        style={{
          height: '100dvh',
          fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
        }}
      >
        <a
          href="#login-form"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-4 focus:left-4 bg-primary-600 text-white px-4 py-2 rounded-lg font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Skip to login form
        </a>

        <CourseScene />

        {/* Content — flex column that fits any iPhone without scroll */}
        <div
          className="relative z-10 h-full flex flex-col items-center px-5"
          style={{
            paddingTop: 'max(2.5rem, calc(env(safe-area-inset-top) + 1.75rem))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          }}
        >
          {/* Brand lockup */}
          <m.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-2.5 shrink-0"
          >
            <div style={{ animation: 'logoFloat 5s ease-in-out infinite' }}>
              <Image
                src="/helm-golf-logo-transparent.png"
                alt=""
                width={64}
                height={64}
                className="object-contain"
                priority
                unoptimized
                style={{ filter: 'drop-shadow(0 2px 6px rgba(60,40,20,0.22)) drop-shadow(0 1px 2px rgba(60,40,20,0.18))' }}
              />
            </div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 600,
                letterSpacing: '-0.033em',
                lineHeight: 1,
                filter: 'drop-shadow(0 1px 1px rgba(60,40,20,0.12))',
              }}
            >
              <span style={{ color: '#1c1917' }}>Golf</span>
              <span style={{ color: '#15803D' }}>Helm</span>
            </h1>
          </m.div>

          {/* Form card */}
          <m.div
            id="login-form"
            role="region"
            aria-label="Login form"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[420px] mt-5 shrink-0"
            style={{
              padding: '22px 20px 18px',
              background: 'rgba(255,253,245,0.82)',
              backdropFilter: 'blur(28px) saturate(180%)',
              WebkitBackdropFilter: 'blur(28px) saturate(180%)',
              borderRadius: 24,
              border: '0.5px solid rgba(255,255,255,0.9)',
              boxShadow:
                '0 20px 50px rgba(60, 40, 20, 0.18), 0 4px 12px rgba(60, 40, 20, 0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
            }}
          >
            <div className="text-center">
              <h2
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#1c1917',
                  letterSpacing: '-0.03em',
                  lineHeight: 1.1,
                }}
              >
                Log in to GolfHelm
              </h2>
            </div>

            {successMessage && (
              <m.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 bg-primary-400/10 border border-primary-400/30 text-primary-700 px-4 py-3 rounded-xl text-sm"
              >
                {successMessage}
              </m.div>
            )}

            <div className="mt-4">
              {checkingAuth ? (
                <div className="flex justify-center py-6">
                  <span className="flex items-center gap-1.5" aria-label="Loading">
                    <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              ) : isLoggedIn ? (
                <div className="space-y-3">
                  <div className="bg-primary-400/10 border border-primary-400/30 text-primary-700 px-4 py-3 rounded-xl text-sm text-center">
                    You&apos;re already signed in
                  </div>
                  <button
                    onClick={() => router.push(returnTo || (isAdmin ? '/golf/admin' : '/golf/dashboard'))}
                    className="w-full min-h-[50px] py-3 bg-primary-600 text-white font-semibold text-[15px] tracking-[-0.01em] rounded-xl shadow-lg shadow-primary-600/25 transition-all duration-200 ease-ios hover:bg-primary-700 hover:shadow-primary-600/30 active:scale-[0.97] active:duration-75"
                    aria-label="Continue to dashboard"
                  >
                    {returnTo ? 'Continue' : isAdmin ? 'Continue to Admin Dashboard' : 'Continue to Dashboard'}
                  </button>
                  <button
                    onClick={handleSignOut}
                    disabled={isLoggingOut}
                    className="w-full min-h-[50px] py-3 bg-warm-100 text-warm-700 font-semibold text-[15px] tracking-[-0.01em] rounded-xl transition-all duration-200 ease-ios hover:bg-warm-200 active:scale-[0.97] active:duration-75 disabled:opacity-50 disabled:active:scale-100"
                    aria-label="Sign out and use a different account"
                  >
                    {isLoggingOut ? 'Signing out…' : 'Sign out & use a different account'}
                  </button>
                </div>
              ) : (
                <GolfSignInForm />
              )}
            </div>

            {/* Tiny caption below form: signup link (web) + legal (all) */}
            {!isLoggedIn && !checkingAuth && (
              <div
                className="mt-4 pt-3 text-center"
                style={{ borderTop: '0.5px solid rgba(120,113,108,0.14)' }}
              >
                {!isNative && (
                  <p className="text-warm-600 text-[12px]">
                    New to GolfHelm?{' '}
                    <Link href={signupHref} className="text-primary-700 font-semibold hover:text-primary-600 transition-colors">
                      Create an account
                    </Link>
                  </p>
                )}
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-warm-500 mt-1.5 tracking-[0.02em]">
                  <Link href="/privacy" className="hover:text-warm-700 transition-colors">Privacy</Link>
                  <span className="text-warm-400" aria-hidden="true">·</span>
                  <Link href="/terms" className="hover:text-warm-700 transition-colors">Terms</Link>
                </div>
              </div>
            )}
          </m.div>

          {/* Course scene decorates the remaining space below naturally — nothing else here */}
          <div className="flex-1" />
        </div>

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
          @keyframes logoFloat {
            0%, 100% { transform: translateY(0); }
            50%      { transform: translateY(-2px); }
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

export default function GolfLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center" style={{ height: '100dvh', background: '#FFFEFA' }}>
          <span className="flex items-center gap-1.5" aria-label="Loading">
            <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
