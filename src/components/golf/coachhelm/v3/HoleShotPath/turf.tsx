/**
 * HoleShotPath — turf layer.
 *
 * The background "course" the shot path sits on top of. Pure visual,
 * no data — every per-shot detail lives in hazards.tsx and index.tsx.
 *
 * Composition (back → front):
 *   1. Turf gradient — vertical, darker at the tee, brighter near green
 *   2. Subtle horizontal grain bands (mowing pattern)
 *   3. Fairway corridor — slightly lighter trapezoid narrowing toward green
 *   4. Green — ellipse at top, two-tone with subtle outer collar
 *   5. Tee box — small rounded rectangle at the bottom
 *   6. Pin — slim mast + animated flag triangle (Framer Motion)
 *
 * Why a real <defs>? So the entire path component renders to a single
 * <svg> with no external CSS dependencies — drops into any surface
 * (strip, card, hero) without conflicting styles.
 */

'use client';

import { m } from 'framer-motion';
import { useId } from 'react';
import { VB } from './geometry';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';

// Visual constants — calibrated to match the canonical viewBox (100×200).
const FAIRWAY_TOP_HALF = 7;
const FAIRWAY_BOTTOM_HALF = 9;
const FAIRWAY_TOP_Y = 24;
const FAIRWAY_BOTTOM_Y = 178;

const GREEN_CX = 50;
const GREEN_CY = 17;
const GREEN_RX = 22;
const GREEN_RY = 11;

const TEE_X = 44;
const TEE_Y = 184;
const TEE_W = 12;
const TEE_H = 6;

const PIN_X = 50;
const PIN_BASE_Y = 18; // base of mast
const PIN_TOP_Y = 4; // top of mast

interface TurfProps {
  /** Drawn behind the rest of the SVG — index.tsx wraps it inside
   *  the same <svg>, so we don't repeat the viewBox here. */
  showPinFlag?: boolean;
}

export function Turf({ showPinFlag = true }: TurfProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  // useId so multiple HoleShotPath instances on the same page don't
  // clash on gradient IDs (e.g. the 18-hole grid renders 18 of these).
  const rawId = useId();
  const id = rawId.replace(/:/g, '-');
  const turfGrad = `turfGrad-${id}`;
  const fairwayGrad = `fairwayGrad-${id}`;
  const greenGrad = `greenGrad-${id}`;
  const turfNoise = `turfNoise-${id}`;
  const flagShadow = `flagShadow-${id}`;

  return (
    <>
      <defs>
        {/* Vertical turf gradient — tee end darker, green end brighter. */}
        <linearGradient id={turfGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f3e33" />
          <stop offset="55%" stopColor="#234a3b" />
          <stop offset="100%" stopColor="#1a382e" />
        </linearGradient>

        {/* Fairway corridor — slightly more saturated than the rough. */}
        <linearGradient id={fairwayGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d7a60" />
          <stop offset="50%" stopColor="#4a8d6f" />
          <stop offset="100%" stopColor="#2f6650" />
        </linearGradient>

        {/* Green — radial highlight from the pin outward. */}
        <radialGradient id={greenGrad} cx="50%" cy="55%" r="65%">
          <stop offset="0%" stopColor="#86c89e" />
          <stop offset="60%" stopColor="#5fae7e" />
          <stop offset="100%" stopColor="#3f8d62" />
        </radialGradient>

        {/* Mowing-pattern grain — very low-opacity horizontal stripes. */}
        <pattern
          id={turfNoise}
          x="0"
          y="0"
          width="100"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <rect x="0" y="0" width="100" height="3" fill="#ffffff" opacity="0.018" />
          <rect x="0" y="3" width="100" height="3" fill="#000000" opacity="0.018" />
        </pattern>

        {/* Drop-shadow under the flag triangle. */}
        <filter id={flagShadow} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0.4" dy="0.6" stdDeviation="0.4" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* 1. Turf base */}
      <rect x="0" y="0" width={VB.width} height={VB.height} fill={`url(#${turfGrad})`} />
      <rect x="0" y="0" width={VB.width} height={VB.height} fill={`url(#${turfNoise})`} />

      {/* 2. Fairway corridor — narrowing trapezoid */}
      <path
        d={`
          M ${50 - FAIRWAY_BOTTOM_HALF} ${FAIRWAY_BOTTOM_Y}
          L ${50 + FAIRWAY_BOTTOM_HALF} ${FAIRWAY_BOTTOM_Y}
          L ${50 + FAIRWAY_TOP_HALF} ${FAIRWAY_TOP_Y}
          L ${50 - FAIRWAY_TOP_HALF} ${FAIRWAY_TOP_Y}
          Z
        `}
        fill={`url(#${fairwayGrad})`}
        opacity="0.92"
      />

      {/* Soft fairway edge — feathered light line down each side. */}
      <path
        d={`M ${50 - FAIRWAY_BOTTOM_HALF} ${FAIRWAY_BOTTOM_Y} L ${50 - FAIRWAY_TOP_HALF} ${FAIRWAY_TOP_Y}`}
        stroke="#ffffff"
        strokeOpacity="0.06"
        strokeWidth="0.5"
        fill="none"
      />
      <path
        d={`M ${50 + FAIRWAY_BOTTOM_HALF} ${FAIRWAY_BOTTOM_Y} L ${50 + FAIRWAY_TOP_HALF} ${FAIRWAY_TOP_Y}`}
        stroke="#ffffff"
        strokeOpacity="0.06"
        strokeWidth="0.5"
        fill="none"
      />

      {/* 3. Green — outer collar then green proper */}
      <ellipse
        cx={GREEN_CX}
        cy={GREEN_CY}
        rx={GREEN_RX + 1.8}
        ry={GREEN_RY + 1.2}
        fill="#3a6b50"
        opacity="0.65"
      />
      <ellipse
        cx={GREEN_CX}
        cy={GREEN_CY}
        rx={GREEN_RX}
        ry={GREEN_RY}
        fill={`url(#${greenGrad})`}
      />
      {/* Green highlight sheen — a brighter inner crescent */}
      <ellipse
        cx={GREEN_CX - 4}
        cy={GREEN_CY - 3}
        rx={GREEN_RX * 0.55}
        ry={GREEN_RY * 0.45}
        fill="#ffffff"
        opacity="0.08"
      />

      {/* 4. Tee box */}
      <rect
        x={TEE_X}
        y={TEE_Y}
        width={TEE_W}
        height={TEE_H}
        rx="1.2"
        fill="#8b7355"
      />
      <rect
        x={TEE_X}
        y={TEE_Y}
        width={TEE_W}
        height="1"
        rx="1.2"
        fill="#ffffff"
        opacity="0.12"
      />
      {/* Tee box surface texture — three thin "tee marker" pegs */}
      {[3, 6, 9].map((dx) => (
        <circle
          key={dx}
          cx={TEE_X + dx}
          cy={TEE_Y + TEE_H / 2}
          r="0.4"
          fill="#5a4632"
          opacity="0.6"
        />
      ))}

      {/* 5. Pin — mast + animated flag triangle */}
      {/* Hole cup */}
      <circle cx={PIN_X} cy={PIN_BASE_Y - 0.5} r="1.3" fill="#0d1f17" />
      {/* Mast */}
      <line
        x1={PIN_X}
        y1={PIN_BASE_Y - 0.5}
        x2={PIN_X}
        y2={PIN_TOP_Y}
        stroke="#f4ecd8"
        strokeWidth="0.4"
        strokeLinecap="round"
      />
      {showPinFlag && (
        <m.g
          filter={`url(#${flagShadow})`}
          animate={{
            // Subtle flag wave — the path skews left/right just a hair.
            skewX: [0, -3, 0, 3, 0],
          }}
          transition={prefersReducedMotion ? { duration: 0 } : ({
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          })}
          style={{ transformOrigin: `${PIN_X}px ${PIN_TOP_Y + 1}px` }}
        >
          <path
            d={`M ${PIN_X} ${PIN_TOP_Y} L ${PIN_X + 7} ${PIN_TOP_Y + 1.6} L ${PIN_X} ${PIN_TOP_Y + 3.2} Z`}
            fill="#e3543b"
          />
          <path
            d={`M ${PIN_X} ${PIN_TOP_Y} L ${PIN_X + 7} ${PIN_TOP_Y + 1.6} L ${PIN_X} ${PIN_TOP_Y + 1.6} Z`}
            fill="#ffffff"
            opacity="0.18"
          />
        </m.g>
      )}
    </>
  );
}
