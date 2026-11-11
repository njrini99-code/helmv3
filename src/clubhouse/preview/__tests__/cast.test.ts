import { describe, expect, it } from 'vitest';
import { CAST, CAST_ASSISTANT, CAST_COACH, CAST_COUNTS, CAST_FOCUS_PLAYER_ID, CAST_PLAYERS, CAST_TEAM, CAST_TOP_READS, CAST_VIEWER_PLAYER_ID } from '../cast';

/** The shared preview cast agrees with itself, so a lane fixture that reads it cannot print two answers. */
describe('the preview cast', () => {
  it('names one team and one squad', () => {
    expect(CAST_TEAM.name).toBe('Demo University Golf');
    expect(CAST_TEAM.squad).toBe('Varsity');
  });

  it('gives every player one id, one name and one set of initials', () => {
    for (const key of ['id', 'name', 'first', 'initials'] as const) {
      expect(new Set(CAST_PLAYERS.map((p) => p[key])).size).toBe(CAST_PLAYERS.length);
    }
    for (const p of CAST_PLAYERS) {
      expect(p.name.startsWith(`${p.first} `)).toBe(true);
      expect(p.initials).toBe(p.name.split(' ').map((w) => w[0]).join(''));
      expect(p.short).toBe(`${p.first} ${p.name.split(' ')[1]![0]}.`);
      expect(CAST[p.id as keyof typeof CAST]).toBe(p);
    }
    // A coach and a player never share a first name, so "Maya" on a row is one person.
    expect(CAST_PLAYERS.map((p) => p.first)).not.toContain(CAST_COACH.first);
    expect(CAST_PLAYERS.map((p) => p.first)).not.toContain(CAST_ASSISTANT.first);
  });

  it('keeps class year, year key and graduation year in step', () => {
    const years = { Senior: ['sr', 2027], Junior: ['jr', 2028], Sophomore: ['so', 2029], Freshman: ['fr', 2030] } as const;
    for (const p of CAST_PLAYERS) expect([p.yearKey, p.gradYear]).toEqual(years[p.classYear]);
  });

  it('adds up', () => {
    expect(CAST_COUNTS.players).toBe(CAST_PLAYERS.length);
    expect(CAST_COUNTS.injured).toBe(CAST_PLAYERS.filter((p) => p.status === 'injured').length);
    expect(CAST_COUNTS.active).toBe(CAST_PLAYERS.filter((p) => p.status === 'active').length);
    expect(CAST_COUNTS.rounds).toBe(CAST_PLAYERS.reduce((sum, p) => sum + p.rounds, 0));
    for (const p of CAST_PLAYERS) expect(p.early).toBe(p.rounds < 5);
  });

  it('gives a read one owner and that owner’s round count', () => {
    expect(new Set(CAST_TOP_READS.map((r) => r.id)).size).toBe(CAST_TOP_READS.length);
    expect(new Set(CAST_TOP_READS.map((r) => r.playerId)).size).toBe(CAST_TOP_READS.length);
    for (const r of CAST_TOP_READS) {
      const owner = CAST_PLAYERS.find((p) => p.id === r.playerId);
      expect(owner?.rounds).toBe(r.rounds);
      // A player is read from 4 full rounds.
      expect(r.rounds).toBeGreaterThanOrEqual(4);
    }
    expect(CAST_TOP_READS.find((r) => r.id === 'in-pen')?.playerId).toBe('eli');
  });

  it('points the two viewers at players on the team', () => {
    expect(CAST[CAST_VIEWER_PLAYER_ID as keyof typeof CAST]?.name).toBe('Jonah Okafor');
    expect(CAST[CAST_FOCUS_PLAYER_ID as keyof typeof CAST]?.name).toBe('Eli Brandt');
  });
});
