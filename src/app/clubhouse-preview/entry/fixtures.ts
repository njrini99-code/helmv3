import { QUALIFIER_CLOSED_REASON } from '@/clubhouse/screens/rounds/entry/SaveAsPracticeSheet';

/**
 * Round entry's dialogs and banners from the legacy flow (docs/clubhouse/catalog/rounds.md,
 * CH-11008 to CH-11013, CH-11512 to CH-11517, CH-11902): Finley GC, on hole 4 of 18,
 * with a fixed clock so "5 min ago" reads the same every time.
 */
export const PREVIEW_ENTRY_NOW = Date.UTC(2026, 9, 14, 19, 0, 0);
const MIN = 60_000;

/** A saved copy on this device: three holes done, written five minutes ago. */
export const PREVIEW_RECOVERY = { course: 'Finley GC', holesDone: 3, holesTotal: 18, savedAt: PREVIEW_ENTRY_NOW - 5 * MIN };

/** A round already in progress for this course and date: four holes scored, saved two hours ago. */
export const PREVIEW_CONFLICT = { course: 'Finley GC', scoredHoles: 4, updatedAt: new Date(PREVIEW_ENTRY_NOW - 120 * MIN).toISOString() };

/** The server's refusal when the coach closed the qualifier. */
export const PREVIEW_PRACTICE_REASON = QUALIFIER_CLOSED_REASON;

/** A bare signal key, as the round actions return it: the dialogs turn it into a sentence. */
export const PREVIEW_FAILURE_KEY = 'retry';
