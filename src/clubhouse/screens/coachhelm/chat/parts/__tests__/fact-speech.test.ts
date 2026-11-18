import { describe, expect, it } from 'vitest';
import { calendarNote, confirmSentence, spokenLine, speakFact, speakSpan } from '../fact-speech';

describe('spoken action facts', () => {
  it('says a shared afternoon once, and drops the date the tile already shows', () => {
    expect(speakFact('When', '2026-11-13, 16:00 to 16:30', true)).toBe('4:00 to 4:30 PM');
    expect(speakFact('When', '2026-11-10, 15:00 to 17:30', true)).toBe('3:00 to 5:30 PM');
  });
  it('keeps both periods when a meeting crosses noon', () => {
    expect(speakSpan('11:30', '13:00')).toBe('11:30 AM to 1:00 PM');
  });
  it('says all day and nobody without inventing a clock', () => {
    expect(speakFact('When', '2026-11-13, all day', true)).toBe('All day');
    expect(speakFact('Invited', 'Not set', true)).toBe('Nobody');
    expect(speakFact('Where', 'Clubhouse', true)).toBe('Clubhouse');
    expect(speakFact('Type', 'meeting', true)).toBe('Meeting');
    expect(calendarNote('Not set', 'Not asked for')).toBe('Nobody invited · No RSVP');
    expect(calendarNote('Cole Bennett', 'Asked for')).toBe('Cole Bennett · RSVP on');
  });
  it('says an announcement without field names', () => {
    expect(spokenLine('Urgency', 'normal')).toBe('Normal · it pushes when they are free');
    expect(spokenLine('Urgency', 'urgent')).toBe('Urgent · it pushes right away, even in class');
    expect(spokenLine('Acknowledgement', 'Not required')).toBe('No Got it');
    expect(spokenLine('Acknowledgement', 'Required')).toBe('Asks for Got it');
    expect(spokenLine('To', 'Everyone on Demo University Golf (8)')).toBe('To 8 players');
    expect(spokenLine('How', 'bus')).toBe('By bus');
    expect(spokenLine('Leaves', '2026-11-20 07:00')).toBe('Leaves Nov 20, 7:00 AM');
    expect(spokenLine('Back', '2026-11-22 18:00')).toBe('Back Nov 22, 6:00 PM');
    expect(confirmSentence('create_team_announcement', ['8 players notified in-app'])).toBe('It posts to 8 players once Undo closes. No Got it.');
  });
});
