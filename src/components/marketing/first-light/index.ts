/**
 * Barrel — the First Light landing scaffold. See CONTRACTS.md for the
 * ownership map, prop contracts, and glass/photo/screenshot asset
 * conventions every lane building on this scaffold should follow.
 */

// Fonts
export { flFraunces } from './fonts';

// Nav
export { GlassNav } from './nav/GlassNav';
export type { GlassNavProps } from './nav/GlassNav';

// Scroll primitives
export { LenisRoot } from './scroll/LenisRoot';
export { usePrefersReducedMotion } from './scroll/usePrefersReducedMotion';
export { useScrollProgress } from './scroll/useScrollProgress';
export type { ScrollProgressOptions, ScrollProgressOffset, ScrollProgressResult } from './scroll/useScrollProgress';
export { PinnedScrub } from './scroll/PinnedScrub';
export type { PinnedScrubProps } from './scroll/PinnedScrub';
export { MaskedReveal } from './scroll/MaskedReveal';
export type { MaskedRevealProps } from './scroll/MaskedReveal';

// Shared lib
export { photoLayerStyle } from './lib/photoBg';
export type { PhotoLayerOptions } from './lib/photoBg';

// Brand — Helm mark line-art (Amendment 3 §A/§B). See CONTRACTS.md "Brand
// components" for the consumer map.
export { HelmMark, HelmRosette, SportGlyph } from './brand';
export type { HelmMarkProps, HelmRosetteProps, SportGlyphProps, SportGlyphSport } from './brand';

// Moments — M1..M9 (each lane replaces its own file in place; see
// CONTRACTS.md for the ownership map)
export { M1Hero } from './moments/M1Hero';
export type { M1HeroProps } from './moments/M1Hero';
export { M2Clarity } from './moments/M2Clarity';
export type { M2ClarityProps } from './moments/M2Clarity';
export { M3ProductCinema } from './moments/M3ProductCinema';
export type { M3ProductCinemaProps } from './moments/M3ProductCinema';
export { M4TwoFields } from './moments/M4TwoFields';
export type { M4TwoFieldsProps } from './moments/M4TwoFields';
export { M5Intelligence } from './moments/M5Intelligence';
export type { M5IntelligenceProps } from './moments/M5Intelligence';
export { M6ForThePlayer } from './moments/M6ForThePlayer';
export type { M6ForThePlayerProps } from './moments/M6ForThePlayer';
export { M7Honesty } from './moments/M7Honesty';
export type { M7HonestyProps } from './moments/M7Honesty';
export { M8FinalCTA } from './moments/M8FinalCTA';
export type { M8FinalCTAProps } from './moments/M8FinalCTA';
export { M9Footer } from './moments/M9Footer';
export type { M9FooterProps } from './moments/M9Footer';
