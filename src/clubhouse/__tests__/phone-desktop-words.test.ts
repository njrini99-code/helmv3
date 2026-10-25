import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TERMS } from '../lib/glossary';

// CONS-37: a phone screen and its desktop twin say the same golf words. Each pair takes the shared words from
// lib/glossary's TERMS, and neither spells one out on its own.
const ROOT = join(__dirname, '..');
type Key = keyof typeof TERMS;
const PAIRS: { what: string; files: string[]; keys: Key[] }[] = [
  { what: 'the roster sorts', files: ['screens/roster/Roster.tsx', 'screens/roster/RosterPhone.tsx', 'screens/roster/TeamRoster.tsx', 'screens/roster/TeamRosterPhone.tsx'], keys: ['handicap'] },
  { what: 'the scoring and SG sorts', files: ['screens/roster/RosterPhone.tsx', 'screens/stats/StatsTeamPhone.tsx', 'screens/roster/Roster.tsx'], keys: ['strokesGained', 'scoringAvg'] },
  { what: "a player's figures", files: ['screens/stats/StatsPlayer.tsx', 'screens/stats/StatsPlayerPhone.tsx'], keys: ['handicap'] },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('phone and desktop say the same words (CONS-37)', () => {
  for (const pair of PAIRS) {
    it(`${pair.what} take ${pair.keys.join(' and ')} from TERMS`, () => {
      for (const file of pair.files) {
        const src = readFileSync(join(ROOT, file), 'utf8');
        for (const key of pair.keys) {
          expect(src, `${file} uses TERMS.${key}`).toMatch(new RegExp(`\\bTERMS\\.${key}\\b`));
          for (const form of [TERMS[key].long, TERMS[key].short]) {
            expect(src, `${file} spells out "${form}"`).not.toMatch(new RegExp(`['"\`]${escape(form)}['"\`]`));
          }
        }
      }
    });
  }
});
