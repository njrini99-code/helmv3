import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { programCodeLabel, programCodePhrase, splitProgramCodes } from '../screens/settings/model';
import { programCodesFrom } from '../data/settings';

const mens = { teamId: 'm', name: 'Example College Golf', gender: 'mens', code: 'M8TEST2K' };
const womens = { teamId: 'w', name: "Example College Women's Golf", gender: 'womens', code: 'W8TEST3P' };

describe('program codes (a men’s and women’s coach)', () => {
  it('names each team by its side, or by its own name', () => {
    expect(programCodeLabel(mens)).toBe('Men’s team');
    expect(programCodeLabel(womens)).toBe('Women’s team');
    expect(programCodeLabel({ gender: null, name: 'JV' })).toBe('JV');
    expect(programCodePhrase(womens)).toBe('the women’s team');
    expect(programCodePhrase({ gender: null, name: 'JV' })).toBe('JV');
  });

  it('puts the active team first and the rest after', () => {
    expect(splitProgramCodes([mens, womens], 'w')).toEqual({ active: womens, others: [mens] });
    expect(splitProgramCodes([womens, mens], 'm')).toEqual({ active: mens, others: [womens] });
  });

  it('shows nothing extra for one team, no team, or no codes', () => {
    expect(splitProgramCodes([mens], 'm')).toBeNull();
    expect(splitProgramCodes(null, 'm')).toBeNull();
    expect(splitProgramCodes([mens, womens], null)).toBeNull();
  });

  it('reads each staffed team once, skipping rows without a code', () => {
    expect(programCodesFrom([{ team: { id: 'm', name: mens.name, gender: 'mens', join_code: 'M8TEST2K' } }, { team: { id: 'w', name: womens.name, gender: 'womens', join_code: 'W8TEST3P' } }, { team: { id: 'm', name: mens.name, gender: 'mens', join_code: 'M8TEST2K' } }])).toEqual([mens, womens]);
    expect(programCodesFrom([{ team: { id: 'm', name: mens.name, gender: 'mens', join_code: 'M8TEST2K' } }, { team: { id: 'x', name: 'X', gender: null, join_code: null } }])).toBeNull();
    expect(programCodesFrom(null)).toBeNull();
  });
});
