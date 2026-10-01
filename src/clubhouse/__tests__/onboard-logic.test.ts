import { describe, expect, it } from 'vitest';
import {
  PLAN,
  accountErrorFor,
  classOf,
  cleanCode,
  cleanState,
  codeAutoChecks,
  codeCanSubmit,
  codeFromSearch,
  fmtHcp,
  gradYears,
  hometownProblem,
  needsGuardianConsent,
  passwordProblem,
  passwordRules,
  pathOf,
  photoProblem,
  railOf,
  requestMessage,
  requestProblem,
  slotCount,
} from '../screens/onboard/logic';

const FALL_2026 = new Date(2026, 8, 30);
const SPRING_2027 = new Date(2027, 2, 10);

describe('onboarding paths (Q-96)', () => {
  it('a roster code is a player, a staff code an assistant, and there is no role or head-coach step', () => {
    expect(pathOf('code', 'roster')).toBe('player');
    expect(pathOf('code', 'staff')).toBe('staff');
    expect(pathOf('code', null)).toBe('pre');
    expect(pathOf('request', null)).toBe('request');
    for (const plan of Object.values(PLAN)) {
      expect(plan).not.toContain('role');
      expect(plan).not.toContain('pending');
      expect(plan).not.toContain('program');
    }
    expect(PLAN.staff).toEqual(['intro', 'code', 'name', 'account', 'staffdone']);
  });

  it('the rail shows where a code path goes before the code is known', () => {
    expect(railOf('pre', 'code')).toEqual({ sections: ['Team', 'You', 'Account'], current: 0 });
    expect(railOf('player', 'game').sections).toEqual(['Team', 'You', 'Account', 'Your game', 'Photo']);
    expect(railOf('player', 'intro').current).toBe(-1);
  });
});

describe('team code', () => {
  it('takes letters and numbers, upper-cased, up to 10 (production has 6-, 8- and 9-character codes)', () => {
    expect(cleanCode(' k7pq-x4mn ')).toBe('K7PQX4MN');
    expect(cleanCode('ABCDEFGHIJKL')).toBe('ABCDEFGHIJ');
    expect(slotCount('ABC')).toBe(8);
    expect(slotCount('ABCDEFGHI')).toBe(9);
  });

  it('checks itself only at eight; any other length is checked on Continue', () => {
    expect(codeAutoChecks('K7PQX4MN')).toBe(true);
    expect(codeAutoChecks('AB12CD')).toBe(false);
    expect(codeCanSubmit('AB12CD')).toBe(true);
    expect(codeCanSubmit('AB1')).toBe(false);
  });

  it('reads an invite link the way today’s sign-up does', () => {
    expect(codeFromSearch('?returnTo=%2Fgolf%2Fjoin%2Fk7pqx4mn')).toBe('K7PQX4MN');
    expect(codeFromSearch('?joinCode=ab12cd')).toBe('AB12CD');
    expect(codeFromSearch('?returnTo=%2Fgolf%2Fdashboard')).toBeNull();
  });
});

describe('graduation year', () => {
  it('never offers a year that makes the player under 13', () => {
    const years = gradYears(FALL_2026);
    expect(years[0]).toBe(2027);
    expect(years).not.toContain(2032);
    expect(Math.max(...years)).toBe(2031);
  });

  it('asks for a guardian’s consent from 13 to 17, as today’s form does', () => {
    expect(needsGuardianConsent(2031, FALL_2026)).toBe(true);
    // Today's estimate (this year − (grad − 18)) puts a 2027 senior at 17, so every tile this fall shows the line.
    expect(needsGuardianConsent(2027, FALL_2026)).toBe(true);
    expect(needsGuardianConsent(2026, FALL_2026)).toBe(false);
  });

  it('names the class from the seasons left, so it rolls over with the calendar', () => {
    expect(classOf(2027, FALL_2026)).toBe('Senior');
    expect(classOf(2030, FALL_2026)).toBe('Freshman');
    expect(classOf(2031, FALL_2026)).toBe('Recruit');
    expect(classOf(2027, SPRING_2027)).toBe('Senior');
  });
});

describe('account', () => {
  it('draws the server’s rules, so a password that ticks every line is not refused for a hidden one', () => {
    expect(passwordRules('fairway#26').find((r) => r.label === 'Upper and lower case')?.ok).toBe(false);
    expect(passwordProblem('fairway#26')).toBe('Add upper and lower case letters.');
    expect(passwordProblem('Fairway#26')).toBeNull();
    expect(passwordProblem('Fairway26')).toBe('Add a symbol, like ! or #.');
  });

  it('turns an existing account into the sign-in offer and passes the server’s own sentences through', () => {
    expect(accountErrorFor('User already registered')).toMatchObject({ field: 'email', signIn: true });
    const breached = 'Please choose a stronger password — this one is too common or has appeared in a data breach';
    expect(accountErrorFor(breached)).toEqual({ field: 'pw', message: breached });
    expect(accountErrorFor('Failed to fetch').field).toBeNull();
  });
});

describe('your game and photo', () => {
  it('shows a plus handicap with a plus and stores it negative', () => {
    expect(fmtHcp(-1.8)).toBe('+1.8');
    expect(fmtHcp(4)).toBe('4.0');
    expect(fmtHcp(null)).toBe('');
  });

  it('keeps the state to two letters and asks for it when a city is given', () => {
    expect(cleanState('t3x')).toBe('TX');
    expect(hometownProblem('Austin', 'T')).toBe('Use the two-letter code, like TX.');
    expect(hometownProblem('Austin', '')).toBe('Add the state.');
    expect(hometownProblem('', '')).toBeNull();
  });

  it('takes only what the avatars bucket stores (JPEG, PNG, GIF, WebP) up to 2 MB', () => {
    expect(photoProblem({ type: 'application/pdf', size: 10 })).toBe('Choose a JPG, PNG or WebP image.');
    expect(photoProblem({ type: 'image/heic', size: 1024 })).toBe('Choose a JPG, PNG or WebP image.');
    expect(photoProblem({ type: 'image/png', size: 3 * 1024 * 1024 })).toMatch(/over 2 MB/);
    expect(photoProblem({ type: 'image/webp', size: 1024 })).toBeNull();
  });
});

describe('request access', () => {
  const base = { who: 'player' as const, first: 'Jordan', last: 'Ellis', school: 'Oakmont', coach: 'Coach Reyes', email: 'j@oakmont.edu', note: '' };

  it('asks for each required field in order', () => {
    expect(requestProblem({ ...base, first: ' ' })?.field).toBe('first');
    expect(requestProblem({ ...base, email: 'nope' })?.message).toBe('Please enter a valid email address.');
    expect(requestProblem(base)).toBeNull();
  });

  it('carries who they are and their coach to the owner', () => {
    expect(requestMessage(base)).toBe('Requested access as: Player\nCoach: Coach Reyes');
  });
});
