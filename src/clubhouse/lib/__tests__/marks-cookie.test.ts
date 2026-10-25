import { describe, expect, it } from 'vitest';
import { MARKS_CAP, entriesFromRecord, markKey, marksRecord, parseMarks, serializeMarks, showAgain, withMark } from '../marks-cookie';

const id = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;

describe('marks cookie', () => {
  it('keys a change by the first eight hex characters of its session id', () => {
    expect(markKey('6F1C2A90-aaaa-4bbb-8ccc-000000000001')).toBe('6f1c2a90');
  });

  it('reads and writes id:flag entries, newest first', () => {
    const entries = parseMarks('6f1c2a90:s,0a0b0c0d:g');
    expect(entries).toEqual([
      ['6f1c2a90', 's'],
      ['0a0b0c0d', 'g'],
    ]);
    expect(serializeMarks(entries)).toBe('6f1c2a90:s,0a0b0c0d:g');
    expect(marksRecord(entries)).toEqual({ '6f1c2a90': 's', '0a0b0c0d': 'g' });
    expect(entriesFromRecord({ '6f1c2a90': 's' })).toEqual([['6f1c2a90', 's']]);
  });

  it('keeps an all-digit key as written, in order (an object would reorder it)', () => {
    expect(serializeMarks(parseMarks('99999999:s,11111111:s'))).toBe('99999999:s,11111111:s');
  });

  it.each([[''], [null], [undefined], ['garbage'], ['6f1c2a9:s'], ['6f1c2a90:x'], ['6f1c2a90s']])('reads %j as nothing', (v) => {
    expect(parseMarks(v)).toEqual([]);
  });

  it('skips a malformed entry and a repeat', () => {
    expect(parseMarks('6f1c2a90:s,nope,6f1c2a90:g,0a0b0c0d:g')).toEqual([
      ['6f1c2a90', 's'],
      ['0a0b0c0d', 'g'],
    ]);
  });

  it('puts the newest at the front, and a seen flag never replaces Got it', () => {
    let e = withMark([], id(1), 's');
    e = withMark(e, id(2), 's');
    expect(e.map(([k]) => k)).toEqual(['00000002', '00000001']);
    e = withMark(e, id(1), 'g');
    expect(e[0]).toEqual(['00000001', 'g']);
    e = withMark(e, id(1), 's');
    expect(e[0]).toEqual(['00000001', 'g']);
  });

  it('Show it again leaves the seen flag, so the strike does not draw twice', () => {
    const e = showAgain(withMark([], id(1), 'g'), id(1));
    expect(e).toEqual([['00000001', 's']]);
  });

  it('caps at 64 entries, dropping the oldest seen entries before any Got it', () => {
    let e = withMark([], id(0), 'g');
    for (let n = 1; n <= MARKS_CAP + 5; n++) e = withMark(e, id(n), 's');
    expect(e).toHaveLength(MARKS_CAP);
    expect(e.some(([k, f]) => k === '00000000' && f === 'g')).toBe(true);
    expect(e[0]![0]).toBe((MARKS_CAP + 5).toString(16).padStart(8, '0'));
    expect(serializeMarks(e).length).toBeLessThan(1000);
  });

  it('drops the oldest Got it only when nothing seen is left to drop', () => {
    let e: ReturnType<typeof parseMarks> = [];
    for (let n = 1; n <= MARKS_CAP + 1; n++) e = withMark(e, id(n), 'g');
    expect(e).toHaveLength(MARKS_CAP);
    expect(e.some(([k]) => k === '00000001')).toBe(false);
  });
});
