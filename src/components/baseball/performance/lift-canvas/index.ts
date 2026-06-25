/**
 * src/components/baseball/performance/lift-canvas/index.ts
 *
 * Barrel for the LiftCanvas drag-drop session builder (Wave 4).
 *
 * Usage:
 *   import { LiftCanvas } from '@/components/baseball/performance/lift-canvas';
 *   import type { LiftCanvasProps } from '@/components/baseball/performance/lift-canvas';
 */

// ── Primary surface ────────────────────────────────────────────────────────────
export { LiftCanvas } from './LiftCanvas';
export type { LiftCanvasProps } from './LiftCanvas';

// ── Sub-components (exported for page-level composition if needed) ─────────────
export { ExerciseBin } from './ExerciseBin';
export type { ExerciseBinProps } from './ExerciseBin';

export { SessionBlock } from './SessionBlock';
export type { SessionBlockProps } from './SessionBlock';

export { PrescriptionChip } from './PrescriptionChip';
export type { PrescriptionChipProps } from './PrescriptionChip';
