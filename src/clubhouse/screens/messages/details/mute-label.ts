import { type ChMute, untilLabel, clock } from '../model';
import type { ChMessagesApi } from '../api/types';

/** "Muted until tomorrow · 2:40 PM", or until turned back on (wave 5 #2: a week from now read "today"). */
export const muteLabel = (m: ChMute, api: Pick<ChMessagesApi, "now" | "timeZone" | "clock">) =>
  m.until ? `Muted until ${untilLabel(m.until, api.now, api.timeZone)} · ${clock(m.until, api.timeZone, api.clock)}` : "Muted until you turn it back on";
