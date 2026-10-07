'use client';

// REDESIGN-SCRATCH (docs/redesign/rounds): Direction A, see directions.md. Placeholder until built.
import { FairwayRoundsLibrary } from '../FairwayRoundsLibrary';
import type { DirectionProps } from './index';

export function DirectionA({ holes: _holes, ...props }: DirectionProps) {
  return <FairwayRoundsLibrary {...props} />;
}
