'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function WheelMark({ size = 24, color = '#15803D' }: { size?: number; color?: string }) {
  const cx = 32;
  const cy = 32;
  const inner = 10;
  const outer = 28;
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx={cx} cy={cy} r="22" stroke={color} strokeWidth="2.6" fill="none" />
      {angles.map((a) => {
        const rad = ((a - 90) * Math.PI) / 180;
        return (
          <line
            key={a}
            x1={cx + Math.cos(rad) * inner}
            y1={cy + Math.sin(rad) * inner}
            x2={cx + Math.cos(rad) * outer}
            y2={cy + Math.sin(rad) * outer}
            stroke={color}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={cx} cy={cy} r="5" fill={color} />
    </svg>
  );
}

export default function GolfWelcomePage() {
  const router = useRouter();
  const [greeting, setGreeting] = useState('Good day');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        const { data } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        const role = (data?.role as string) ?? null;
        router.replace(role === 'admin' ? '/golf/admin' : '/golf/dashboard');
      } else {
        setCheckingAuth(false);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  if (checkingAuth) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#1c1917]">
        <span className="flex items-center gap-1.5" aria-label="Loading">
          <span className="w-2 h-2 rounded-full bg-primary-400 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-primary-400 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-primary-400 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
        </span>
      </div>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <div
        className="relative min-h-dvh overflow-hidden text-white"
        style={{
          fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Sunset gradient sky */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, #f8c979 0%, #f4a259 22%, #ec7e4a 44%, #c96b4f 62%, #7a6d4d 80%, #3d5d3a 95%, #1f3b22 100%)',
          }}
        />

        {/* Warm sun halo */}
        <div
          aria-hidden="true"
          className="absolute pointer-events-none motion-reduce:animate-none"
          style={{
            top: -120,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 520,
            height: 520,
            background: 'radial-gradient(circle, rgba(255,231,180,0.55) 0%, rgba(255,200,140,0.25) 35%, transparent 70%)',
            animation: 'sunPulse 9s ease-in-out infinite',
          }}
        />

        {/* Soft cloud band */}
        <div
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{
            top: '18%',
            left: '-20%',
            right: '-20%',
            height: 90,
            background:
              'radial-gradient(ellipse 400px 50px at 30% 50%, rgba(255,255,255,0.35) 0%, transparent 70%), radial-gradient(ellipse 300px 40px at 70% 60%, rgba(255,255,255,0.28) 0%, transparent 70%)',
            filter: 'blur(2px)',
          }}
        />

        {/* Painterly tree silhouette at horizon */}
        <svg
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          viewBox="0 0 390 280"
          preserveAspectRatio="none"
          style={{ height: 320, width: '100%' }}
        >
          <path
            d="M0 280 L0 210 Q 30 198 55 205 Q 90 172 125 195 Q 160 158 200 185 Q 240 152 285 188 Q 325 162 360 190 Q 380 175 390 182 L390 280 Z"
            fill="#1a3d25"
            opacity="0.78"
          />
          <path
            d="M0 280 L0 240 Q 40 228 80 240 Q 140 218 200 238 Q 270 220 340 240 Q 375 232 390 240 L390 280 Z"
            fill="#0d2717"
            opacity="0.92"
          />
        </svg>

        {/* Bottom warmth fade for card contrast */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: 260,
            background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.32) 100%)',
          }}
        />

        {/* Film grain — subtle, non-animated */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none mix-blend-overlay"
          style={{
            opacity: 0.08,
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.7'/></svg>\")",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col min-h-dvh px-5 pt-6 pb-6" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
          {/* Brand pill */}
          <m.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="self-center flex items-center gap-2.5 px-3.5 py-2 rounded-full"
            style={{
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.28)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{ width: 26, height: 26, background: 'rgba(255,255,255,0.92)' }}
            >
              <WheelMark size={18} color="#15803D" />
            </span>
            <span
              className="text-[11px] font-bold tracking-[0.14em] uppercase"
              style={{ color: '#fff' }}
            >
              Helm Sports Labs
            </span>
          </m.div>

          {/* Hero */}
          <m.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 text-center"
          >
            <div
              className="text-[11px] font-semibold tracking-[0.22em] uppercase"
              style={{ color: 'rgba(255,255,255,0.82)' }}
            >
              {greeting}, coach
            </div>
            <h1
              className="mt-3 font-bold text-white"
              style={{
                fontSize: 44,
                lineHeight: 1.05,
                letterSpacing: '-0.035em',
                textShadow: '0 2px 24px rgba(0,0,0,0.28)',
                textWrap: 'balance' as const,
              }}
            >
              A good day<br />
              to be on the<br />
              course.
            </h1>
          </m.div>

          {/* Spacer pushes cards to bottom */}
          <div className="flex-1" />

          {/* GolfHelm card */}
          <m.button
            type="button"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/golf/login')}
            aria-label="Continue to GolfHelm"
            className="w-full text-left rounded-[22px] p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{
              background: 'rgba(255,255,255,0.20)',
              border: '1px solid rgba(255,255,255,0.32)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              boxShadow: '0 14px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.38)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-[14px] shrink-0"
                style={{ width: 46, height: 46, background: 'rgba(255,255,255,0.95)' }}
              >
                <Image
                  src="/helm-golf-logo-transparent.png"
                  alt=""
                  width={34}
                  height={34}
                  className="object-contain"
                  priority
                  unoptimized
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[19px] font-bold text-white tracking-[-0.02em] leading-none">
                    GolfHelm
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase"
                    style={{ background: '#15803D', color: '#fff' }}
                  >
                    <span
                      className="inline-block rounded-full"
                      style={{
                        width: 5,
                        height: 5,
                        background: '#86efac',
                        boxShadow: '0 0 0 2px rgba(134,239,172,0.35)',
                      }}
                    />
                    Live
                  </span>
                </div>
                <div className="mt-1 text-[12px]" style={{ color: 'rgba(255,255,255,0.82)' }}>
                  Team management &amp; analytics
                </div>
              </div>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </m.button>

          {/* BaseballHelm card (not yet live) */}
          <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-3 w-full rounded-[18px] p-3.5"
            style={{
              background: 'rgba(180,83,9,0.28)',
              border: '1px solid rgba(254,215,170,0.32)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-[12px] shrink-0"
                style={{ width: 38, height: 38, background: 'rgba(254,215,170,0.92)' }}
              >
                <WheelMark size={26} color="#9a3412" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold text-white tracking-[-0.02em] leading-tight">
                  BaseballHelm
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'rgba(254,215,170,0.92)' }}>
                  Recruiting · Summer 2026
                </div>
              </div>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                style={{
                  background: 'rgba(0,0,0,0.28)',
                  border: '1px solid rgba(254,215,170,0.32)',
                  color: '#fed7aa',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                Coming soon
              </span>
            </div>
          </m.div>

          {/* Footer */}
          <div
            className="mt-6 text-center text-[10px] font-medium tracking-[0.18em] uppercase"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            Made for coaches
          </div>
        </div>

        <style jsx>{`
          @keyframes sunPulse {
            0%, 100% { opacity: 0.55; transform: translateX(-50%) scale(1); }
            50%      { opacity: 0.75; transform: translateX(-50%) scale(1.06); }
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
