import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { getValidTimezone } from '@/lib/calendar/timezone';
import { getCurrentDecimalHourInTz } from '@/lib/utils/timezone';
import { getGreeting, timeOfDayForHour } from '@/lib/utils/time-of-day';
import { chLogServer } from '../lib/track-server';
import { isoDay } from '../lib/dates';

/**
 * The team's clock for Home (and the pages that read the day the way Home does: Team Hub, Classes, Rounds). A leaf
 * module, so a loader that Home itself reads (Team Hub's pure counts, for the coach's "Waiting on you") can share it
 * without an import cycle. `data/home.ts` re-exports `homeClock`.
 */

/** YYYY-MM-DD for an instant in a timezone. */
export function ymd(d: Date, tz: string): string {
  return isoDay(d, tz);
}

/**
 * The team's timezone (CH-2210: Eastern, the product default, when it doesn't
 * load or isn't a real zone), the time-of-day greeting in it, today's long
 * date, and today's date (YYYY-MM-DD) in it.
 */
export async function homeClock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  now: Date,
): Promise<{ tz: string; greeting: string; todayLabel: string; day: string }> {
  const { data: settings, error: settingsError } = await supabase.from('golf_team_settings').select('timezone').eq('team_id', teamId).maybeSingle();
  if (settingsError) chLogServer('home', 'timezone', settingsError);
  // A stored value that isn't a real IANA zone would throw in every Intl call below; read it as missing instead.
  const tz = getValidTimezone(settings?.timezone);
  if (settings?.timezone && tz !== settings.timezone) chLogServer('home', 'timezone', new Error(`"${settings.timezone}" is not a timezone`));
  let greeting = 'Welcome back';
  try {
    greeting = getGreeting(timeOfDayForHour(getCurrentDecimalHourInTz(tz)));
  } catch {
    /* unknown zone: the time-neutral phrase is never wrong */
  }
  const todayLabel = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  return { tz, greeting, todayLabel, day: ymd(now, tz) };
}
