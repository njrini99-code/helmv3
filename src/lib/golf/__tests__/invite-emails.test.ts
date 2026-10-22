import { describe, expect, it } from 'vitest';
import { isInviteEmail, MAX_INVITE_EMAILS, normalizeInviteEmail, parseInviteEmails } from '../invite-emails';

describe('isInviteEmail', () => {
  it('accepts a plain address and ignores case and padding', () => {
    expect(isInviteEmail('eli@school.edu')).toBe(true);
    expect(isInviteEmail('  Eli.Park+golf@School.EDU ')).toBe(true);
  });

  it('refuses what is not an address', () => {
    for (const bad of ['', 'eli', 'eli@', '@school.edu', 'eli@school', 'eli@@school.edu', 'eli @school.edu', 'eli@school.e', 'a,b@school.edu', `${'a'.repeat(250)}@school.edu`]) {
      expect(isInviteEmail(bad), bad).toBe(false);
    }
  });
});

describe('normalizeInviteEmail', () => {
  it('lowercases and trims, the form a duplicate is judged on', () => {
    expect(normalizeInviteEmail('  Eli@School.edu\n')).toBe('eli@school.edu');
  });
});

describe('parseInviteEmails', () => {
  it('reads commas, semicolons, spaces and new lines, in the order given', () => {
    expect(parseInviteEmails('eli@x.edu, mia@x.edu;noah@x.edu\nava@x.edu  zed@x.edu').valid).toEqual(['eli@x.edu', 'mia@x.edu', 'noah@x.edu', 'ava@x.edu', 'zed@x.edu']);
  });

  it('de-duplicates by normalised address', () => {
    expect(parseInviteEmails('Eli@x.edu eli@x.edu ELI@X.EDU').valid).toEqual(['eli@x.edu']);
  });

  it('reads the address out of a pasted contact', () => {
    expect(parseInviteEmails('Eli Park <eli@x.edu>, "Mia" <mia@x.edu>').valid).toEqual(['eli@x.edu', 'mia@x.edu']);
  });

  it('keeps what it could not read, once each, for the sheet to flag', () => {
    expect(parseInviteEmails('eli@x.edu nope nope mia@x').invalid).toEqual(['nope', 'mia@x']);
    expect(parseInviteEmails('').valid).toEqual([]);
    expect(parseInviteEmails(' , ; ').invalid).toEqual([]);
  });

  it('caps a request at ten, which the action enforces too', () => {
    expect(MAX_INVITE_EMAILS).toBe(10);
  });
});
