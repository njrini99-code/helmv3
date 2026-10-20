import { describe, expect, it, vi } from 'vitest';

const flagMock = vi.fn(() => false);
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flagMock() }));

import { evidenceRevisionKey, revisionKeyFor } from '../revision-key';
import { resolveLifecycleOnWrite } from '../lifecycle-policy';

const base = { sample_n: 30, window_start: '2026-08-01', window_end: '2026-10-01', newest_round_id: 'r7' };

describe('revisionKeyFor', () => {
  it('keeps the legacy sample_n|window_end key when the flag is off', () => {
    expect(revisionKeyFor(base, false)).toBe('30|2026-10-01');
  });

  it('keys on the newest round and the window start when on', () => {
    expect(revisionKeyFor(base, true)).toBe('r:r7|2026-08-01');
  });

  it('a sample count that moves without a new round is NOT a new revision', () => {
    expect(revisionKeyFor({ ...base, sample_n: 31 }, true)).toBe(revisionKeyFor(base, true));
  });

  it('a new newest round, or a moved window, is a new revision', () => {
    expect(revisionKeyFor({ ...base, newest_round_id: 'r8' }, true)).not.toBe(revisionKeyFor(base, true));
    expect(revisionKeyFor({ ...base, window_start: '2026-08-05' }, true)).not.toBe(revisionKeyFor(base, true));
  });

  it('falls back to the legacy key for an unstamped row', () => {
    expect(revisionKeyFor({ sample_n: 12, window_start: '', window_end: '' }, true)).toBe('12|');
  });

  it('reads the flag', () => {
    flagMock.mockReturnValue(true);
    expect(evidenceRevisionKey(base)).toBe('r:r7|2026-08-01');
    flagMock.mockReturnValue(false);
    expect(evidenceRevisionKey(base)).toBe('30|2026-10-01');
  });

  it('three looks at the same rounds can no longer mature a read', () => {
    let keys: readonly string[] = [];
    for (const n of [30, 31, 32]) {
      const d = resolveLifecycleOnWrite({
        existing: 'detected',
        confidence: 0.9,
        movedThisWrite: true,
        evidenceRevisionKey: revisionKeyFor({ ...base, sample_n: n }, true),
        priorMaturationKeys: keys,
        promotionEnabled: true,
      });
      keys = d.maturationKeys ?? keys;
      expect(d.next).toBe('detected');
    }
    expect(keys).toEqual(['r:r7|2026-08-01']);
  });
});
