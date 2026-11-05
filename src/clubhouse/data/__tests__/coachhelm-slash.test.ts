import { describe, expect, it } from 'vitest';
import { askSlashCommands, matchSlash, slashQuery } from '../coachhelm-slash';

const names = (o: Parameters<typeof askSlashCommands>[0]) => askSlashCommands(o).map((c) => c.command);

describe('Ask slash commands', () => {
  it('lists all four for a coach with both flags on', () => {
    expect(names({ player: false, plans: true, lineup: true })).toEqual(['/plan', '/lineup', '/recap', '/compare']);
  });
  it('drops /plan and /lineup with their flags off (CP-36, CP-38)', () => {
    expect(names({ player: false, plans: false, lineup: false })).toEqual(['/recap', '/compare']);
  });
  it('gives a player /recap alone, whatever the flags (CP-55)', () => {
    expect(names({ player: true, plans: true, lineup: true })).toEqual(['/recap']);
  });
  it('reads a command only when it is the whole text', () => {
    expect(slashQuery('/')).toBe('');
    expect(slashQuery('/Pl')).toBe('pl');
    expect(slashQuery('and/or')).toBeNull();
    expect(slashQuery('/plan for Tuesday')).toBeNull();
  });
  it('narrows by what is typed', () => {
    const all = askSlashCommands({ player: false, plans: true, lineup: true });
    expect(matchSlash(all, 'l').map((c) => c.command)).toEqual(['/lineup']);
    expect(matchSlash(all, 'zzz')).toEqual([]);
  });
});
