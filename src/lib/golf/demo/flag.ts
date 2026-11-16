/**
 * The daily demo refresh's off switch (config/feature-flags.yml
 * `golf_demo_refresh_v1`, off everywhere until the owner turns it on). Its
 * own module so the cron route checks it without loading the generator, and
 * so the generator stays importable from scripts (this file is server-only).
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';

export const DEMO_REFRESH_FLAG = 'golf_demo_refresh_v1';

export function isDemoRefreshEnabled(): boolean {
  return isFlagEnabled(DEMO_REFRESH_FLAG);
}
