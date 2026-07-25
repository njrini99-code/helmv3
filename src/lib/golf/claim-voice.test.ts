import { describe, expect, it } from 'vitest';
import { possessive, thirdPerson, toCoachVoice } from './claim-voice';

describe('thirdPerson', () => {
  it('adds -s to a regular verb', () => {
    expect(thirdPerson('escape')).toBe('escapes');
    expect(thirdPerson('lose')).toBe('loses');
  });

  it('adds -es after a sibilant or o', () => {
    expect(thirdPerson('miss')).toBe('misses');
    expect(thirdPerson('reach')).toBe('reaches');
    expect(thirdPerson('go')).toBe('goes');
  });

  it('turns consonant + y into -ies', () => {
    expect(thirdPerson('carry')).toBe('carries');
  });

  it('leaves a vowel + y alone', () => {
    expect(thirdPerson('play')).toBe('plays');
  });

  it('uses the irregular form', () => {
    expect(thirdPerson('have')).toBe('has');
    expect(thirdPerson('are')).toBe('is');
    expect(thirdPerson('do')).toBe('does');
  });

  it('leaves modals uninflected', () => {
    expect(thirdPerson('can')).toBe('can');
    expect(thirdPerson('should')).toBe('should');
  });

  it('refuses non-verbs so the caller can bail', () => {
    expect(thirdPerson('not')).toBeNull();
    expect(thirdPerson('never')).toBeNull();
  });
});

describe('possessive', () => {
  it('adds apostrophe-s', () => {
    expect(possessive('Cole')).toBe("Cole's");
  });

  it('adds a bare apostrophe after a trailing s', () => {
    expect(possessive('Chris')).toBe("Chris'");
  });
});

describe('toCoachVoice', () => {
  it('rewrites the possessive', () => {
    expect(toCoachVoice('Across your last 13 rounds, 7.6% of holes ended in double bogey.', 'Cole Bennett')).toBe(
      "Across Cole's last 13 rounds, 7.6% of holes ended in double bogey.",
    );
  });

  it('conjugates a subject pronoun and keeps emphasis casing', () => {
    expect(toCoachVoice('You ESCAPE the bunker fine — 92% of your 24 sand saves.', 'Cole Bennett')).toBe(
      "Cole ESCAPES the bunker fine — 92% of Cole's 24 sand saves.",
    );
  });

  it('handles contractions', () => {
    expect(toCoachVoice("You're leaving strokes on the green.", 'Dylan')).toBe('Dylan is leaving strokes on the green.');
    expect(toCoachVoice("You've gained 1.2 strokes off the tee.", 'Dylan')).toBe(
      'Dylan has gained 1.2 strokes off the tee.',
    );
  });

  it('leaves a pronoun in place rather than mangling a non-verb', () => {
    expect(toCoachVoice('You never miss from inside 5 feet.', 'Cole')).toBe('Cole never miss from inside 5 feet.');
  });

  it('rewrites a bare object pronoun', () => {
    expect(toCoachVoice('This drill was built for you.', 'Mason')).toBe('This drill was built for Mason.');
  });

  it('is a no-op without a name', () => {
    const claim = 'Across your last 13 rounds…';
    expect(toCoachVoice(claim, null)).toBe(claim);
    expect(toCoachVoice(claim, '   ')).toBe(claim);
  });

  it('is a no-op when there is no second person', () => {
    const claim = 'Scoring average fell 1.4 strokes over the last five rounds.';
    expect(toCoachVoice(claim, 'Cole')).toBe(claim);
  });

  it('uses only the first name', () => {
    expect(toCoachVoice('Your putting is the leak.', 'Cole Bennett')).toBe("Cole's putting is the leak.");
  });
});
