/**
 * Round draft types for offline sync and auto-save.
 *
 * Lives in src/lib so sync-engine can type draft payloads without
 * importing round-drafts server actions.
 */

import type { HoleStats, ShotRecord, RoundHole } from '@/lib/types/golf';

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

interface RoundSetupForm {
  courseName: string;
  courseCity: string;
  courseState: string;
  courseRating: string;
  courseSlope: string;
  teesPlayed: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
}

export interface RoundDraftData {
  step: 'setup' | 'holes' | 'tracking' | 'submitting';
  setupData: RoundSetupForm;
  holes: RoundHole[];
  completedHoleStats: HoleStats[];
  currentHoleIndex: number;
  selectedQualifierId?: string | null;
  selectedRoundNumber?: number | null;
  inProgressShots?: Record<number, ShotRecord[]>;
  holesPerRound?: 9 | 18;
}

export interface DraftInfo {
  roundId: string;
  courseName: string | null;
  courseCity: string | null;
  courseState: string | null;
  roundDate: string;
  roundType: string | null;
  currentHole: number | null;
  holesCompleted: number;
  totalHoles: number;
  lastAutoSave: string | null;
  createdAt: string | null;
  draftData: RoundDraftData | null;
}

export type SaveRoundDraftFn = (
  data: RoundDraftData,
  existingRoundId?: string,
) => Promise<ActionResult<{ roundId: string; lastAutoSave: string }>>;
