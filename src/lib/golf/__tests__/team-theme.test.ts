import { describe, it, expect } from 'vitest';
import { normalizeTeamGender, teamGenderLabel, teamAccentVar } from '../team-theme';

describe('team-theme', () => {
  describe('normalizeTeamGender', () => {
    it('maps men variants to "mens"', () => {
      for (const g of ['mens', 'men', 'male', 'MENS', 'Men']) {
        expect(normalizeTeamGender(g)).toBe('mens');
      }
    });
    it('maps women variants to "womens"', () => {
      for (const g of ['womens', 'women', 'female', 'WOMENS', 'Women']) {
        expect(normalizeTeamGender(g)).toBe('womens');
      }
    });
    it('returns null for unknown / empty / nullish', () => {
      for (const g of ['', 'coed', null, undefined]) {
        expect(normalizeTeamGender(g)).toBeNull();
      }
    });
  });

  describe('teamGenderLabel', () => {
    it('labels mens / womens', () => {
      expect(teamGenderLabel('mens')).toBe("Men's");
      expect(teamGenderLabel('womens')).toBe("Women's");
    });
  });

  describe('teamAccentVar', () => {
    it('men\'s = the helm-green team var', () => {
      expect(teamAccentVar('mens')).toBe('var(--fw-color-team-mens)');
    });
    it('women\'s = the violet team var', () => {
      expect(teamAccentVar('womens')).toBe('var(--fw-color-team-womens)');
    });
    it('returns undefined when there is no gender to theme', () => {
      expect(teamAccentVar(null)).toBeUndefined();
      expect(teamAccentVar(undefined)).toBeUndefined();
    });
  });
});
