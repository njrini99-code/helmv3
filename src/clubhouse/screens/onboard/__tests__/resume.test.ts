import { describe, expect, it } from 'vitest';
import { extractJoinCode, resolveSignInHref } from '@/lib/auth/golf-sign-in-logic';
import { codeFromEntry } from '../../auth/join-state';
import { EMPTY_DRAFT, mergeResumed, reduceFlow, type Draft, type FlowState } from '../flow';
import { joinReason } from '../join-reason';
import { accountErrorFor, lookalikeHint, resumeStep, signInHrefFor, stepSatisfied } from '../logic';

/** Signing up and joining, the pure half: every way in ends with something to do, and a resumed sign-in is never a dead end. */

const made = (over: Partial<Draft> = {}): Draft => ({ ...EMPTY_DRAFT, intent: 'code', kind: 'roster', code: 'K7PQX4MN', teamName: 'Men’s Golf', accountMade: true, email: 'a@school.test', ...over });
const state = (d: Draft, step: FlowState['hist'][number]): FlowState => ({ d, hist: ['intro', 'code', step], dir: 'fwd', n: 0 });

describe('the account question’s failures all say what to do', () => {
  it('"account created but session could not be established" is a sign-in, not a failure to create', () => {
    const e = accountErrorFor('Account created but session could not be established. Please try signing in.');
    expect(e.signIn).toBe(true);
    expect(e.notice).toMatch(/account is ready/i);
  });

  it('a duplicate email offers sign in', () => {
    expect(accountErrorFor('An account with this email already exists. Please sign in instead.')).toMatchObject({ field: 'email', signIn: true });
  });

  it('a lost access-code grant asks for the code again instead of telling the person to reload', () => {
    const e = accountErrorFor('Your access code could not be verified. Please reload this page and enter your invite code again.');
    expect(e.recheckCode).toBe(true);
    expect(e.message).not.toMatch(/reload/i);
  });

  it('the server’s waits keep their number', () => {
    expect(accountErrorFor('Please wait 57 seconds before trying again.').message).toBe('Please wait 57 seconds before trying again.');
    expect(accountErrorFor('Too many signup attempts. Please try again in 12 minutes.').message).toMatch(/12 minutes/);
    expect(accountErrorFor('rate limit exceeded').message).toMatch(/wait a moment/);
  });

  it('a weak password and a dropped connection are said in their own words', () => {
    expect(accountErrorFor('Please choose a stronger password — this one is too common.').field).toBe('pw');
    expect(accountErrorFor('Failed to fetch').message).toMatch(/internet connection/);
    expect(accountErrorFor('Load failed').message).toMatch(/internet connection/);
  });

  it('a stale deploy says to reload and that the answers are kept', () => {
    expect(accountErrorFor('An unexpected response was received from the server.').message).toMatch(/Reload this page/);
  });
});

describe('the sign-in address keeps the team', () => {
  it('a typed code returns to its join page', () => {
    expect(signInHrefFor('k7pq-x4mn', '/golf/login')).toBe('/golf/login?returnTo=%2Fgolf%2Fjoin%2FK7PQX4MN');
  });
  it('an invite link’s own returnTo is kept as it was', () => {
    const base = '/golf/login?returnTo=%2Fgolf%2Fjoin%2FZZZZ9999';
    expect(signInHrefFor('K7PQX4MN', base)).toBe(base);
  });
  it('no code, or too short a one, leaves the plain sign-in', () => {
    expect(signInHrefFor('', '/golf/login')).toBe('/golf/login');
    expect(signInHrefFor('AB', '/golf/login')).toBe('/golf/login');
  });
});

describe('a code that matched nothing', () => {
  it('an eight-character code with an O, I, 0 or 1 was misread: new codes never have them', () => {
    expect(lookalikeHint('K7PQX0MN')).toMatch(/Newer codes don’t use the letters O or I/);
    expect(lookalikeHint('K7PQXIMN')).not.toBeNull();
  });
  it('older six- and nine-character codes were not made that way, so no hint', () => {
    expect(lookalikeHint('K7PQ0N')).toBeNull();
    expect(lookalikeHint('K7PQX0MN9')).toBeNull();
  });
  it('a clean eight-character code gets no hint', () => {
    expect(lookalikeHint('K7PQX4MN')).toBeNull();
  });
});

describe('a coach on a player invite link, and the way back to a question already behind', () => {
  it('a coach with a finished program goes to the invite page, which routes them to their own home', () => {
    expect(resolveSignInHref('/golf/dashboard', '/golf/join/K7PQX4MN')).toBe('/golf/welcome?next=%2Fgolf%2Fjoin%2FK7PQX4MN');
  });
  it('a coach who still has a program to make goes to coach onboarding, not player onboarding', () => {
    expect(resolveSignInHref('/golf/coach', '/golf/join/K7PQX4MN').startsWith('/golf/coach')).toBe(true);
  });
  it('going back to the code question does not stack a second copy of it', () => {
    const s = reduceFlow({ d: made({ accountMade: false }), hist: ['intro', 'code', 'name', 'grad', 'account'], dir: 'fwd', n: 0 }, { t: 'next', patch: { kind: null, teamName: null }, to: 'code', from: 'account' });
    expect(s.hist).toEqual(['intro', 'code']);
  });
});

describe('a code as people write it', () => {
  it.each([
    ['k7pq x4mn', 'K7PQX4MN'],
    ['K7PQ-X4MN', 'K7PQX4MN'],
    ['  k7pqx4mn\n', 'K7PQX4MN'],
    ['https://golfhelm.example/golf/join/k7pqx4mn', 'K7PQX4MN'],
    ['https://golfhelm.example/golf/join/K7PQX4MN?utm=1', 'K7PQX4MN'],
    ['https://golfhelm.example/golf/player?joinCode=K7PQX4MN', 'K7PQX4MN'],
  ])('%s', (typed, code) => {
    expect(codeFromEntry(typed)).toBe(code);
  });
});

describe('a returnTo that carries a code cannot break sign-in or add parameters', () => {
  it('reads the code as written', () => {
    expect(extractJoinCode('/golf/join/K7PQX4MN?x=1')).toBe('K7PQX4MN');
  });
  it('a malformed escape does not throw', () => {
    expect(() => extractJoinCode('/golf/join/%E0%A4%A')).not.toThrow();
    expect(extractJoinCode('/golf/join/%E0%A4%A')).toBe('%E0%A4%A');
  });
  it('a code with a parameter in it stays one encoded value on the onboarding address', () => {
    const href = resolveSignInHref('/golf/player', '/golf/join/K7PQX4MN%26next%3Dhttps%3A%2F%2Fevil.test');
    const url = new URL(href, 'https://app.test');
    expect(url.pathname).toBe('/golf/player');
    expect([...url.searchParams.keys()]).toEqual(['joinCode']);
  });
});

describe('picking up after the account', () => {
  it('asks for a missing name first, then the class, and only then the game', () => {
    expect(resumeStep({ first: '', last: '', grad: null })).toBe('name');
    expect(resumeStep({ first: 'Ana', last: '', grad: 2027 })).toBe('name');
    expect(resumeStep({ first: 'Ana', last: 'Ruiz', grad: null })).toBe('grad');
    expect(resumeStep({ first: 'Ana', last: 'Ruiz', grad: 2027 })).toBe('game');
  });

  it('the account question is never asked again once the account exists; name and class only when empty', () => {
    expect(stepSatisfied('account', { accountMade: true, first: '', last: '', grad: null })).toBe(true);
    expect(stepSatisfied('account', { accountMade: false, first: '', last: '', grad: null })).toBe(false);
    expect(stepSatisfied('name', { accountMade: true, first: 'Ana', last: 'Ruiz', grad: null })).toBe(true);
    expect(stepSatisfied('name', { accountMade: true, first: 'Ana', last: ' ', grad: null })).toBe(false);
    expect(stepSatisfied('grad', { accountMade: true, first: '', last: '', grad: 2027 })).toBe(true);
  });

  it('after the name, a signed-in player goes straight to their game: no class again, no account again', () => {
    const s = reduceFlow(state(made({ first: '', last: '', grad: 2027 }), 'name'), { t: 'next', patch: { first: 'Ana', last: 'Ruiz' }, from: 'name' });
    expect(s.hist[s.hist.length - 1]).toBe('game');
  });

  it('a missing class is still asked after the name', () => {
    const s = reduceFlow(state(made({ grad: null }), 'name'), { t: 'next', patch: { first: 'Ana', last: 'Ruiz' }, from: 'name' });
    expect(s.hist[s.hist.length - 1]).toBe('grad');
  });

  it('before the account exists nothing is skipped', () => {
    const s = reduceFlow(state(made({ accountMade: false, first: 'Ana', last: 'Ruiz', grad: 2027 }), 'name'), { t: 'next', from: 'name' });
    expect(s.hist[s.hist.length - 1]).toBe('grad');
  });
});

describe('the draft this tab kept meets what the server knows', () => {
  it('a blank from the server never wipes what was typed', () => {
    const saved = made({ first: 'Ana', last: 'Ruiz', grad: 2027, hcp: 4 });
    const d = mergeResumed(saved, { first: '', last: '', grad: null, email: 'a@school.test' });
    expect(d).toMatchObject({ first: 'Ana', last: 'Ruiz', grad: 2027, hcp: 4, accountMade: true });
  });

  it('the account’s own answers win over the draft', () => {
    expect(mergeResumed(made({ first: 'Ann' }), { first: 'Ana', email: 'a@school.test' }).first).toBe('Ana');
  });

  it('the link’s team code replaces the draft’s: a player moving to the other team is not sent to the old one', () => {
    const d = mergeResumed(made({ code: 'OLDCODE1', teamName: 'Men’s Golf', joinedTeam: false, joinError: 'Invalid join code' }), { code: 'NEWCODE2', teamName: 'Women’s Golf', email: 'a@school.test' });
    expect(d).toMatchObject({ code: 'NEWCODE2', teamName: 'Women’s Golf', joinedTeam: null, joinError: null });
  });

  it('no code on the link leaves the draft’s', () => {
    expect(mergeResumed(made(), { email: 'a@school.test' }).code).toBe('K7PQX4MN');
  });

  it('a draft kept for another email on this tab is not used', () => {
    const d = mergeResumed(made({ first: 'Someone', email: 'other@school.test' }), { first: '', email: 'a@school.test', code: 'K7PQX4MN', teamName: 'Men’s Golf' });
    expect(d.first).toBe('');
    expect(d.teamName).toBe('Men’s Golf');
  });
});

describe('a kept draft is used only when both emails are present and equal', () => {
  it.each([
    ['the draft has no email', made({ first: 'Someone', email: '' }), { first: '', email: 'a@school.test' }],
    ['the account has no email', made({ first: 'Someone' }), { first: '' }],
    ['the emails differ', made({ first: 'Someone', email: 'other@school.test' }), { first: '', email: 'a@school.test' }],
  ])('%s: start empty', (_n, saved, seed) => {
    expect(mergeResumed(saved, seed).first).toBe('');
  });
  it('the same email in any case is the same person', () => {
    expect(mergeResumed(made({ first: 'Ana', email: 'A@School.test' }), { email: 'a@school.test' }).first).toBe('Ana');
  });
});

describe('a player who could not join says why, and what to do', () => {
  it('already on another team: keep that team, leave it in Settings or ask the coach', () => {
    const r = joinReason('You are already on Men’s Golf. Golf players can only be on one team at a time.');
    expect(r.onAnotherTeam).toBe(true);
    expect(r.sub).toMatch(/leave your current team in Settings|ask your coach to move you/);
  });
  it('a code that no longer matches says to ask for the new one', () => {
    expect(joinReason('Invalid join code').sub).toMatch(/made a new one/);
  });
  it('anything else keeps the earlier wording', () => {
    expect(joinReason(null).sub).toMatch(/Ask your coach to resend it/);
  });
});
