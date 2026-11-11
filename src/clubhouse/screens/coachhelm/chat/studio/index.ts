/**
 * The studio: the fixed component set of CoachHelm chat (CAPABILITIES.md, "The studio"). One renderer, one registry.
 *
 *   <Studio part={fromBlock(block)} size="full" read={ref} onAsk={fillComposer} />
 */
export { Studio, STUDIO_COMPONENTS, isStudioKind, type StudioRenderProps } from './registry';
export { fromBlock, fromEvidence, fromRead, sampleSaid, tableOf } from './from';
export { askRef, fillComposer } from './ask';
export type { StudioAsk, StudioBoardRow, StudioData, StudioDay, StudioEvent, StudioFigure, StudioHole, StudioLeg, StudioPart, StudioProps, StudioSize } from './types';
