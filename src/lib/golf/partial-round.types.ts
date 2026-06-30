/**
 * Partial round auto-save payload shape.
 *
 * Lives in src/lib so offline helpers can type draft data without
 * importing golf server actions.
 */

import type { HoleStats, ShotRecord } from '@/lib/types/golf';

export interface PartialRoundData {
  courseName: string;
  courseCity?: string;
  courseState?: string;
  courseRating?: number;
  courseSlope?: number;
  teesPlayed?: string;
  courseId?: string;
  teeId?: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
  qualifierId?: string;
  qualifierRoundNumber?: number;
  currentHole: number;
  holesToPlay: number;
  holes: HoleStats[];
  inProgressShots?: Array<{
    holeNumber: number;
    shots: ShotRecord[];
  }>;
  holeConfigs?: Array<{
    holeNumber: number;
    par: number;
    yardage?: number | null;
  }>;
  expectedUpdatedAt?: string;
}
