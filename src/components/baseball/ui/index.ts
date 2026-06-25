/**
 * src/components/baseball/ui/index.ts
 *
 * Barrel export for the BaseballHelm premium design-system primitives.
 * Import from this file so consumers have a single, stable import path:
 *
 *   import { CommandCard, EvidencePill, PlayerTile } from '@/components/baseball/ui';
 *
 * Phase B (B1–B5) components are all present; this file wires them together.
 */

// ── CommandCard (B1) ──────────────────────────────────────────────────────────
export { CommandCard } from './CommandCard';
export type { CommandCardTone, CardAction, CommandCardProps } from './CommandCard';

// ── EvidencePill (B2) ─────────────────────────────────────────────────────────
export { EvidencePill } from './EvidencePill';
export type { EvidenceSource, EvidencePillProps } from './EvidencePill';

// ── PlayerTile (B3) ───────────────────────────────────────────────────────────
export { PlayerTile } from './PlayerTile';
export type { PlayerTileVariant, PlayerTileProps } from './PlayerTile';

// ── StatusRibbon (B4) ─────────────────────────────────────────────────────────
export { StatusRibbon } from './StatusRibbon';
export type { RibbonStatus, StatusRibbonProps } from './StatusRibbon';

// ── ActionRail (B5) ───────────────────────────────────────────────────────────
export { ActionRail } from './ActionRail';
export type { ActionRailAction, ActionRailProps } from './ActionRail';

// ── GroupAvailabilityGrid (Wave 4) ────────────────────────────────────────────
export { GroupAvailabilityGrid } from './GroupAvailabilityGrid';
export type { GroupAvailabilityGridProps } from './GroupAvailabilityGrid';
