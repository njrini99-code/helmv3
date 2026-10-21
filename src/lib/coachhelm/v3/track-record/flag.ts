/**
 * The Slice 6b flag (config/feature-flags.yml `coachhelm_track_record_v1`,
 * off). On: a coach's CoachHelm board links to the Track record view
 * (`?view=track-record`) and that view reads the program's precision
 * counters. Off: no link, and the address falls back to the board.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';

export const TRACK_RECORD_FLAG = 'coachhelm_track_record_v1';

export function isTrackRecordEnabled(): boolean {
  return isFlagEnabled(TRACK_RECORD_FLAG);
}
