/**
 * HoleShotPath — hazards layer.
 *
 * Each hazard is rendered AT the (x,y) where the player's ball
 * actually came to rest. This is the user's correction made literal:
 * "If they say miss-bunker 112 yards away… we know the distance, we
 * place the bunker there." The hole map is reconstructed FROM the
 * player's data, never imagined.
 *
 * The three hazard kinds:
 *   - sand:  amber organic blob with a subtle rim shadow
 *   - rough: darker green tuft cluster (3 overlapping blobs)
 *   - water: blue-teal pool with a soft white surface highlight
 *
 * Stagger reveals via Framer Motion so when a round loads the hazards
 * "land" with the shot path rather than popping in all at once.
 */

'use client';

import { m } from 'framer-motion';
import { useId } from 'react';
import type { PlottedHazard } from './geometry';
import { EASE_CINEMATIC } from '@/lib/coachhelm/v3/motion';

interface HazardsProps {
  hazards: PlottedHazard[];
  /** Skip entrance animation (e.g. when rendered in a static thumbnail strip). */
  staticRender?: boolean;
}

export function Hazards({ hazards, staticRender = false }: HazardsProps) {
  const rawId = useId();
  const id = rawId.replace(/:/g, '-');
  const sandGrad = `sandGrad-${id}`;
  const waterGrad = `waterGrad-${id}`;
  const roughGrad = `roughGrad-${id}`;

  if (hazards.length === 0) return null;

  return (
    <g>
      <defs>
        <radialGradient id={sandGrad} cx="40%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#f0dca4" />
          <stop offset="55%" stopColor="#d4b97a" />
          <stop offset="100%" stopColor="#a8915a" />
        </radialGradient>
        <radialGradient id={waterGrad} cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#6cc3e2" />
          <stop offset="55%" stopColor="#3a8fb8" />
          <stop offset="100%" stopColor="#1f5d80" />
        </radialGradient>
        <radialGradient id={roughGrad} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#3a6b50" />
          <stop offset="100%" stopColor="#1d3a2d" />
        </radialGradient>
      </defs>

      {hazards.map((h, i) => {
        const key = `${h.kind}-${h.origin_shot}-${i}`;
        const delay = staticRender ? 0 : 0.25 + i * 0.07;
        const initial = staticRender
          ? { opacity: 1, scale: 1 }
          : { opacity: 0, scale: 0.6 };
        const animate = { opacity: 1, scale: 1 };
        const transition = staticRender
          ? { duration: 0 }
          : { duration: 0.6, delay, ease: EASE_CINEMATIC };

        if (h.kind === 'sand') {
          return (
            <m.g
              key={key}
              initial={initial}
              animate={animate}
              transition={transition}
              style={{ transformOrigin: `${h.x}px ${h.y}px` }}
            >
              {/* Subtle dark rim for depth */}
              <ellipse
                cx={h.x}
                cy={h.y + 0.4}
                rx={h.r * 1.05}
                ry={h.r * 0.78}
                fill="#5e4c2a"
                opacity="0.35"
              />
              {/* The sand blob — slightly squashed ellipse */}
              <ellipse
                cx={h.x}
                cy={h.y}
                rx={h.r}
                ry={h.r * 0.72}
                fill={`url(#${sandGrad})`}
              />
              {/* Inner highlight — top-left curve */}
              <ellipse
                cx={h.x - h.r * 0.3}
                cy={h.y - h.r * 0.25}
                rx={h.r * 0.45}
                ry={h.r * 0.28}
                fill="#ffffff"
                opacity="0.22"
              />
            </m.g>
          );
        }

        if (h.kind === 'water') {
          return (
            <m.g
              key={key}
              initial={initial}
              animate={animate}
              transition={transition}
              style={{ transformOrigin: `${h.x}px ${h.y}px` }}
            >
              {/* Bank / shoreline */}
              <ellipse
                cx={h.x}
                cy={h.y + 0.3}
                rx={h.r * 1.1}
                ry={h.r * 0.82}
                fill="#2a4a3a"
                opacity="0.55"
              />
              <ellipse
                cx={h.x}
                cy={h.y}
                rx={h.r}
                ry={h.r * 0.75}
                fill={`url(#${waterGrad})`}
              />
              {/* Surface highlight — a thin lit crescent */}
              <ellipse
                cx={h.x - h.r * 0.2}
                cy={h.y - h.r * 0.3}
                rx={h.r * 0.55}
                ry={h.r * 0.12}
                fill="#ffffff"
                opacity="0.35"
              />
              {/* A second smaller ripple for surface texture */}
              <ellipse
                cx={h.x + h.r * 0.2}
                cy={h.y + h.r * 0.05}
                rx={h.r * 0.3}
                ry={h.r * 0.06}
                fill="#ffffff"
                opacity="0.18"
              />
            </m.g>
          );
        }

        // rough — cluster of 3 small organic blobs for tuft texture
        return (
          <m.g
            key={key}
            initial={initial}
            animate={animate}
            transition={transition}
            style={{ transformOrigin: `${h.x}px ${h.y}px` }}
          >
            <ellipse
              cx={h.x - h.r * 0.25}
              cy={h.y + h.r * 0.15}
              rx={h.r * 0.7}
              ry={h.r * 0.55}
              fill={`url(#${roughGrad})`}
              opacity="0.85"
            />
            <ellipse
              cx={h.x + h.r * 0.3}
              cy={h.y - h.r * 0.1}
              rx={h.r * 0.65}
              ry={h.r * 0.5}
              fill={`url(#${roughGrad})`}
              opacity="0.85"
            />
            <ellipse
              cx={h.x}
              cy={h.y + h.r * 0.35}
              rx={h.r * 0.6}
              ry={h.r * 0.45}
              fill={`url(#${roughGrad})`}
              opacity="0.85"
            />
            {/* Sparse light specks for grass blades catching the sun */}
            <circle cx={h.x - h.r * 0.4} cy={h.y - h.r * 0.2} r="0.25" fill="#a8c89a" opacity="0.5" />
            <circle cx={h.x + h.r * 0.1} cy={h.y - h.r * 0.35} r="0.22" fill="#a8c89a" opacity="0.5" />
            <circle cx={h.x + h.r * 0.4} cy={h.y + h.r * 0.2} r="0.2" fill="#a8c89a" opacity="0.5" />
          </m.g>
        );
      })}
    </g>
  );
}
