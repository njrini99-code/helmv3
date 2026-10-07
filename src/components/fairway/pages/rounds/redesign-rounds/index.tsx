// REDESIGN-SCRATCH (docs/redesign/rounds): direction switch for Step 5. Deleted at Step 7.
import type { FairwayRoundsLibraryProps } from '../FairwayRoundsLibrary';
import { DirectionA } from './DirectionA';
import { DirectionB } from './DirectionB';
import { DirectionC } from './DirectionC';

export interface RedesignHole {
  round_id: string;
  hole_number: number;
  par: number | null;
  score: number | null;
}

export interface DirectionProps extends FairwayRoundsLibraryProps {
  holes: RedesignHole[];
}

export function RedesignDirection({ direction, ...props }: DirectionProps & { direction: 'A' | 'B' | 'C' }) {
  if (direction === 'A') return <DirectionA {...props} />;
  if (direction === 'B') return <DirectionB {...props} />;
  return <DirectionC {...props} />;
}
