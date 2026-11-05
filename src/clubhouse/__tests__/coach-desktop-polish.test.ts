import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardPlayerCount, boardPlayerWords } from '../data/coachhelm-team-shape';
import { ROOT } from './_scan';

const css = (name: string) => readFileSync(join(ROOT, 'styles', name), 'utf8');

describe('coach desktop polish (owner, 2026-11-05: "it looks sloppy")', () => {
  it('the listed pages take the tight head, with no double rule above the title', () => {
    const shell = css('shell.css');
    expect(shell).toMatch(/\[data-canopy-head='tight'\]::before \{\s*content: none;/);
    for (const file of ['calendar/Calendar', 'calendar/CalendarSkeleton', 'hub/TeamHub', 'hub/HubSkeleton', 'rounds/TeamRounds', 'rounds/TeamRoundsSkeleton', 'qualifiers/QualifiersList', 'qualifiers/QualifiersSkeleton', 'settings/SettingsView', 'settings/SettingsSkeleton', 'stats/StatsSkeleton', 'tournaments/parts']) {
      const src = readFileSync(join(ROOT, 'screens', `${file}.tsx`), 'utf8');
      expect(src, file).toMatch(/data-canopy-head=(?:"tight"|\{phone \? undefined : 'tight'\})/);
      expect(src, file).not.toMatch(/data-canopy-head=(?:""|\{phone \? undefined : ''\})/);
    }
    expect(readFileSync(join(ROOT, 'screens/stats/StatsTeam.tsx'), 'utf8')).toMatch(/<PageHero\s+tight/);
  });

  it('the Helm key on the desktop bar takes the ghost icon button’s ink, not the green bar’s ivory', () => {
    const src = css('quick-chat.css');
    expect(src).toMatch(/\.ch-qck\.is-desk \.hkey \{[^}]*color: var\(--ch-text-secondary\);/);
    expect(src).toMatch(/\.ch-qck\.is-desk \.hkey \{[^}]*width: 36px;/);
  });

  it('the Team board says whose average its hole figures are', () => {
    const at = (n: number) => ({ team: 1, n });
    expect(boardPlayerCount({ tee: at(1), approach: at(3), short_game: at(2), putting: at(0) } as never)).toBe(3);
    expect(boardPlayerWords(1)).toBe('average of 1 player');
    expect(boardPlayerWords(4)).toBe('average of 4 players');
  });
});
