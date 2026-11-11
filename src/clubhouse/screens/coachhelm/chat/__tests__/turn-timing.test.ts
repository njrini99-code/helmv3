import { describe, expect, it } from 'vitest';
import { nextReadChange, nextWaitingChange, readRowState, sentencesSince, settledText, TURN_TIMING, waitingWords } from '../turn-timing';
import { couldNot, pastOf } from '../parts/Work';

describe('what the work line says while it waits (SPEC Moment 4)', () => {
  it('says nothing before 1.2 s: a fast answer never shows a word that would be gone at once', () => {
    expect(waitingWords(0, false)).toBeNull();
    expect(waitingWords(TURN_TIMING.words - 1, true)).toBeNull();
  });
  it('claims only what is known: Sending until the server opens the turn, then what is being done (never a bare Thinking)', () => {
    expect(waitingWords(TURN_TIMING.words, false)).toBe('Sending');
    expect(waitingWords(TURN_TIMING.words, true)).toBe('Reading your question');
  });
  it('explains a long wait at 6 s and offers the way out at 20 s', () => {
    expect(waitingWords(TURN_TIMING.slow, true)).toBe('Still working on it. Long questions take a little longer.');
    expect(waitingWords(TURN_TIMING.slow, false)).toBe('Still sending. Check your connection.');
    expect(waitingWords(TURN_TIMING.stuck, true)).toBe('No answer yet. You can stop and ask again.');
  });
  it('knows when it next changes, and that it stops changing', () => {
    expect(nextWaitingChange(0)).toBe(TURN_TIMING.present);
    expect(nextWaitingChange(TURN_TIMING.present)).toBe(TURN_TIMING.words);
    expect(nextWaitingChange(TURN_TIMING.words)).toBe(TURN_TIMING.slow);
    expect(nextWaitingChange(TURN_TIMING.stuck)).toBeNull();
  });
});

describe('a read row in time: nothing that will be gone in under 300 ms is shown, and what is shown stays long enough to be read', () => {
  const seen = 1000;
  it('is held back 300 ms', () => {
    expect(readRowState(seen + TURN_TIMING.readHold - 1, seen, null, false)).toBe('hidden');
    expect(readRowState(seen + TURN_TIMING.readHold, seen, null, false)).toBe('running');
  });
  it('a read that finishes inside the hold never shows as running: it appears finished', () => {
    const done = seen + 80;
    expect(readRowState(seen + 200, seen, done, false)).toBe('hidden');
    expect(readRowState(seen + TURN_TIMING.readHold, seen, done, false)).toBe('done');
    expect(nextReadChange(seen + 200, seen, done)).toBe(seen + TURN_TIMING.readHold);
  });
  it('a row shown running stays running for its minimum life, then takes its check', () => {
    const done = seen + TURN_TIMING.readHold + 50;
    expect(readRowState(done, seen, done, false)).toBe('running');
    expect(readRowState(seen + TURN_TIMING.readHold + TURN_TIMING.readLife, seen, done, false)).toBe('done');
    expect(nextReadChange(done, seen, done)).toBe(seen + TURN_TIMING.readHold + TURN_TIMING.readLife);
  });
  it('a failed read is said as failed, in the server\'s own words turned', () => {
    expect(readRowState(seen + 5000, seen, seen + 2000, true)).toBe('failed');
    expect(couldNot('Reading practice reviews')).toBe('Couldn’t read practice reviews');
    expect(couldNot('Working')).toBe('Working: didn’t come back');
  });
  it('a finished read is in the past tense', () => {
    expect(pastOf('Reading Jonah’s strokes gained')).toBe('Read Jonah’s strokes gained');
    expect(pastOf('Checking the CoachHelm board')).toBe('Checked the CoachHelm board');
    expect(pastOf('Found who the misses come from')).toBe('Found who the misses come from');
  });
});

describe('half-written syntax is never shown while an answer streams', () => {
  it('closes bold that is still being written, so the words draw bold with no asterisks', () => {
    expect(settledText('He loses **0.9')).toBe('He loses **0.9**');
    expect(settledText('He loses **')).toBe('He loses');
    expect(settledText('He loses *')).toBe('He loses');
    expect(settledText('He loses **0.9** a round')).toBe('He loses **0.9** a round');
  });
  it('holds back a read marker until it is whole', () => {
    expect(settledText('the right way [')).toBe('the right way');
    expect(settledText('the right way [e')).toBe('the right way');
    expect(settledText('the right way [e12')).toBe('the right way');
    expect(settledText('the right way [e2]')).toBe('the right way [e2]');
  });
  it('holds back a list marker with no text and a table row with no closing pipe', () => {
    expect(settledText('Three things.\n\n1.')).toBe('Three things.');
    expect(settledText('Three things.\n\n- ')).toBe('Three things.');
    expect(settledText('Three things.\n\n1. Put a ladder')).toBe('Three things.\n\n1. Put a ladder');
    expect(settledText('Rounds:\n\n| Player | Score')).toBe('Rounds:');
    expect(settledText('Rounds:\n\n| Player | Score |')).toBe('Rounds:\n\n| Player | Score |');
  });
});

describe('what a screen reader is told of a streaming answer', () => {
  it('whole sentences only, without the markers', () => {
    expect(sentencesSince('Approach. He loses **0.9** a round [e1]. And the', 0)).toEqual({ say: 'Approach. He loses 0.9 a round .', upTo: 40 });
    expect(sentencesSince('Approach is', 0)).toBeNull();
  });
});
