import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * F-0057 (audit 2026-10-29): a double click on an event set the inspector to a new object each time, so everything keyed
 * on it ran again. Opening the event already open keeps the same state (one read, one navigation).
 */
describe('Calendar opens an event once (F-0057)', () => {
  it('open keeps the current inspector when it already shows that event', () => {
    const src = readFileSync(join(process.cwd(), 'src/clubhouse/screens/calendar/Calendar.tsx'), 'utf8');
    expect(src).toMatch(/setInsp\(\(cur\) => \(cur\?\.kind === 'event' && cur\.id === e\.id && cur\.date === e\.date \? cur : \{ kind: 'event', id: e\.id, date: e\.date \}\)\)/);
  });
});
