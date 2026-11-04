import 'server-only';
import { isFlagEnabled } from '@/lib/flags/is-enabled';

export const READ_FLAG = 'coachhelm_read_v1';

export function isReadEnabled(): boolean {
  return isFlagEnabled(READ_FLAG);
}
