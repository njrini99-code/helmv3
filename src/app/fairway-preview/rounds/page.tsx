/**
 * ============================================================================
 * Fairway · Rounds — mobile render harness (DEV-ONLY, ADDITIVE)
 * ----------------------------------------------------------------------------
 * Renders ONE round surface per request, filling the viewport, so a 390px-wide
 * client renders exactly what a phone renders — no nested frame, no transform
 * scaling, no page chrome competing for width.
 *
 *   /fairway-preview/rounds?screen=track-mid
 *   /fairway-preview/rounds?screen=track-first
 *   /fairway-preview/rounds?screen=setup
 *   /fairway-preview/rounds?screen=picker-courses
 *   /fairway-preview/rounds?screen=picker-tees
 *
 * Why this exists: every one of these screens sits behind auth and behind a
 * multi-step state machine, so the only way to review them was to play a round.
 * Design review then happened against hand-drawn approximations of the
 * components instead of the components themselves — which is how a "redesign"
 * drifts off-system. What renders here is the shipped component, the shipped
 * tokens, the shipped CSS.
 *
 * Not linked into nav, imports no route module, mutates nothing — every
 * callback is a no-op. Sibling of `/fairway-preview`, which does the same job
 * for the Wave-1 primitives.
 * ========================================================================== */

import { RoundScreens, type RoundScreen } from './RoundScreens';

/* Declared here, not imported from the client module: a `'use client'` module's
 * non-component exports cross the boundary as client-reference proxies, so
 * `ROUND_SCREENS.map` on the server threw "is not a function". */
const KEYS = new Set<RoundScreen>([
  'track-mid',
  'track-first',
  'setup',
  'picker-courses',
  'picker-tees',
]);

export default async function FairwayRoundsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).screen;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const screen: RoundScreen =
    value && KEYS.has(value as RoundScreen) ? (value as RoundScreen) : 'track-mid';

  return <RoundScreens screen={screen} />;
}
