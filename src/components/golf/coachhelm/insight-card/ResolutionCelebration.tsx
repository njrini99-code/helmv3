'use client';

/**
 * ResolutionCelebration — wraps a resolved `<InsightCard>` with confetti + a
 * special header treatment for the player's first view.
 *
 * Rule 7 + Rule 10 of the design contract:
 *   - Tone for `lifecycle_state === 'resolved'` is already celebratory (the
 *     `deriveTone` helper returns `'celebratory'`); the primitive paints
 *     purple/celebratory accent. We add the confetti + "Resolved N days ago"
 *     framing around it on FIRST VIEW only.
 *   - Idempotency: the first time this mounts we call `markCelebrationShown`
 *     which stamps `metadata.celebration_shown_at` on the insight row.
 *     Subsequent views render the resolved-tone card without confetti.
 *
 * Confetti implementation: CSS-only. We render ~32 absolutely-positioned
 * particles with randomized hue / delay / horizontal drift, tween them down
 * the card for ~1.8s, then unmount. Tiny (<1KB gzipped), zero deps, no
 * cross-origin canvas, plays nicely with iOS Capacitor.
 *
 * Wave 1D owns this wrapper exclusively; the primitive mounts it when
 * `lifecycle_state === 'resolved'` AND `audience === 'player'`.
 */
import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconSparkles } from '@/components/icons';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { markCelebrationShown as defaultMarkCelebrationShown } from '@/app/golf/actions/insight-celebration';

export interface ResolutionCelebrationProps {
  insight: EvidenceInsight;
  children: React.ReactNode;
  /**
   * Injected for tests. Defaults to the real server action. Can be replaced
   * with a no-op to disable the side-effect in Storybook previews.
   */
  onMarkShown?: (insightId: string) => Promise<unknown> | void;
  /** Disable the confetti layer (accessibility / prefers-reduced-motion). */
  disableConfetti?: boolean;
}

const CONFETTI_COUNT = 32;
const CONFETTI_DURATION_MS = 1800;
const CELEBRATION_COLORS = [
  'var(--color-primary-600)', // primary kelly green
  '#8B5CF6', // purple accent (celebratory tone)
  '#F59E0B', // warm amber
  '#EC4899', // playful pink
  '#22D3EE', // cyan pop
];

interface ConfettiParticle {
  id: number;
  color: string;
  leftPct: number;
  delayMs: number;
  durationMs: number;
  driftPx: number;
  rotation: number;
}

function buildParticles(): ConfettiParticle[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: i,
    color: CELEBRATION_COLORS[i % CELEBRATION_COLORS.length]!,
    leftPct: Math.random() * 100,
    delayMs: Math.floor(Math.random() * 400),
    durationMs: 1200 + Math.floor(Math.random() * 600),
    driftPx: Math.round((Math.random() - 0.5) * 180),
    rotation: Math.round((Math.random() - 0.5) * 540),
  }));
}

function formatDaysAgo(resolvedAt: string | null | undefined): string {
  if (!resolvedAt) return 'Resolved';
  const resolved = new Date(resolvedAt).getTime();
  if (Number.isNaN(resolved)) return 'Resolved';
  const days = Math.floor((Date.now() - resolved) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Resolved today';
  if (days === 1) return 'Resolved 1 day ago';
  return `Resolved ${days} days ago`;
}

export function ResolutionCelebration({
  insight,
  children,
  onMarkShown = defaultMarkCelebrationShown,
  disableConfetti = false,
}: ResolutionCelebrationProps) {
  const alreadyShown = useMemo(() => {
    const shown = insight.metadata?.celebration_shown_at;
    return typeof shown === 'string' && shown.length > 0;
  }, [insight.metadata]);

  const reduce = useReducedMotion() ?? false;

  // Initialize to `false` so the first SSR render and the first client render
  // produce identical markup (no confetti). We then enable confetti in an
  // effect once we know we're on the client AND the user hasn't asked for
  // reduced motion. This guarantees:
  //   1. No hydration mismatch (`Math.random()` only runs after mount).
  //   2. Reduced-motion users never see the particle layer.
  const [showConfetti, setShowConfetti] = useState(false);

  // Build particles once per mount so re-renders don't re-randomize positions.
  // Gated on `showConfetti` — when the layer is off, this stays an empty list
  // and `Math.random()` is never invoked (so SSR + initial CSR match exactly).
  const particles = useMemo(
    () => (showConfetti ? buildParticles() : []),
    [showConfetti],
  );

  // First-view side effects: fire the server marker + schedule unmount of
  // the confetti layer. We do NOT block render on the server roundtrip —
  // the UI celebrates immediately and the flag lands asynchronously.
  useEffect(() => {
    if (alreadyShown || disableConfetti || reduce) return;

    setShowConfetti(true);

    let cancelled = false;
    void Promise.resolve(onMarkShown(insight.id)).catch(() => {
      // Swallow — a failed mark only means the confetti fires again on the
      // next view; it's not a blocker and the server action logs its own
      // error trail via `logServerError`.
    });

    const timer = window.setTimeout(() => {
      if (!cancelled) setShowConfetti(false);
    }, CONFETTI_DURATION_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [alreadyShown, disableConfetti, reduce, insight.id, onMarkShown]);

  return (
    <div
      data-testid="resolution-celebration"
      data-celebration-first-view={!alreadyShown && !disableConfetti && !reduce}
      className="relative"
    >
      {/* Celebration header — replaces the "Last updated" framing on the
          resolved card without modifying the primitive. */}
      <div
        data-testid="resolution-header"
        className={cn(
          'flex items-center gap-2 mb-2 px-1',
          'text-xs font-medium text-purple-700',
        )}
      >
        <IconSparkles size={14} className="text-purple-500" aria-hidden />
        <span>{formatDaysAgo(insight.resolved_at)}</span>
      </div>

      {/* Confetti overlay — absolute-positioned inside this wrapper so it
          never leaks outside the card's bounding box. Pointer-events-none
          so it doesn't block taps on the underlying actions. */}
      {showConfetti && (
        <div
          data-testid="resolution-confetti"
          className="pointer-events-none absolute inset-0 overflow-hidden z-10"
          aria-hidden
        >
          {particles.map((p) => (
            <span
              key={p.id}
              className="resolution-confetti-particle absolute top-0 block rounded-sm"
              style={{
                left: `${p.leftPct}%`,
                width: 6,
                height: 10,
                backgroundColor: p.color,
                animation: `resolution-confetti-fall ${p.durationMs}ms cubic-bezier(0.22, 0.61, 0.36, 1) ${p.delayMs}ms both`,
                // Custom properties consumed by the keyframe for per-particle drift / rotation.
                // CSSProperties doesn't type CSS custom properties — safe cast.
                ['--drift' as string]: `${p.driftPx}px`,
                ['--rot' as string]: `${p.rotation}deg`,
              }}
            />
          ))}

          {/* Keyframes live with the component so we don't add a global CSS file
              for a 1.8-second animation. Single declaration, no build-time
              dependency. */}
          <style>{`
            @keyframes resolution-confetti-fall {
              0%   { transform: translate3d(0, -20%, 0) rotate(0deg); opacity: 0; }
              10%  { opacity: 1; }
              80%  { opacity: 1; }
              100% { transform: translate3d(var(--drift, 0px), 120%, 0) rotate(var(--rot, 0deg)); opacity: 0; }
            }
          `}</style>
        </div>
      )}

      {children}
    </div>
  );
}
