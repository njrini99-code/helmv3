import type { WhatsNewItem } from '@/app/golf/actions/whats-new';
import { toWhatsNew, WHATS_NEW_FAILED, type ChWhatsNew } from '../data/whats-new-shape';

/** What's new sample data: a week of the fixture team’s CoachHelm activity, read at 4 pm Eastern on 14 October 2026. */
const NOW = Date.UTC(2026, 9, 14, 20, 0);
const ZONE = 'America/New_York';
const at = (day: number, h: number, m: number) => new Date(Date.UTC(2026, 9, day, h, m)).toISOString();

const ITEMS: WhatsNewItem[] = [
  { type: 'insight_resolved', occurredAt: at(14, 17, 42), playerId: 'jonah', playerName: 'Jonah Okafor', title: 'Short putts inside six feet', description: 'Jonah has made 9 of his last 10 putts inside six feet over four rounds, up from 6 of 10. The pattern behind this insight has not shown up since October 5.', insightId: 'i1' },
  { type: 'insight_detected', occurredAt: at(14, 14, 5), playerId: 'priya', playerName: 'Priya Nair', title: 'Approach shots from 150 to 175 yards', description: 'Priya has missed the green short on 7 of her last 11 approaches from this range.', insightId: 'i2' },
  { type: 'focus_area_created', occurredAt: at(14, 13, 20), playerId: 'theo', playerName: 'Theo Marchetti', title: 'Tee shots on par 4s', focusAreaId: 'f1' },
  { type: 'pattern_validated', occurredAt: at(13, 22, 10), playerId: 'eli', playerName: 'Eli Brooks', title: 'Back-nine scoring slips', description: 'Eli has scored 2.4 strokes worse on the back nine in five of his last six rounds.', patternId: 'p1' },
  { type: 'insight_matured', occurredAt: at(13, 15, 30), playerId: 'sam', playerName: 'Sam Whitfield', title: 'Bunker saves', insightId: 'i3', description: 'Sam got up and down from 2 of 9 greenside bunkers this month. It has now held for three weeks and moves to the coach’s list.' },
  { type: 'focus_area_completed', occurredAt: at(11, 19, 0), playerId: 'priya', playerName: 'Priya Nair', title: 'Three-putt avoidance', focusAreaId: 'f2' },
  { type: 'insight_detected', occurredAt: at(9, 16, 45), playerId: 'jonah', playerName: 'Jonah Okafor', title: 'Pace on long lag putts', insightId: 'i4', description: 'Jonah leaves lag putts from 30 feet or more an average of 4 feet short.' },
];

export const PREVIEW_WHATS_NEW: ChWhatsNew = toWhatsNew(ITEMS, { nowMs: NOW, zone: ZONE });
export const PREVIEW_WHATS_NEW_TRUNCATED: ChWhatsNew = toWhatsNew(ITEMS, { nowMs: NOW, zone: ZONE, truncated: true });
export const PREVIEW_WHATS_NEW_EMPTY: ChWhatsNew = toWhatsNew([], { nowMs: NOW, zone: ZONE });
export const PREVIEW_WHATS_NEW_FAILED: ChWhatsNew = WHATS_NEW_FAILED;
