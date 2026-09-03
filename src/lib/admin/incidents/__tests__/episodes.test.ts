import { describe, it, expect } from 'vitest';
import { deriveEpisodes, hasRegressed, currentEpisode, type DeriveEpisodesInput } from '../episodes';

describe('deriveEpisodes — same episode continues', () => {
  it('occurrences with no resolution ever recorded stay one open episode', () => {
    const input: DeriveEpisodesInput = {
      firstSeen: '2026-08-25T19:08:00Z',
      occurrences: [
        { at: '2026-08-25T19:08:00Z' },
        { at: '2026-08-25T19:15:00Z' },
        { at: '2026-08-26T08:00:00Z' },
      ],
      resolutions: [],
    };
    const episodes = deriveEpisodes(input);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]!.number).toBe(1);
    expect(episodes[0]!.kind).toBe('initial');
    expect(episodes[0]!.occurrenceCount).toBe(3);
    expect(episodes[0]!.endedAt).toBeNull();
    expect(episodes[0]!.headline).toBe('Episode 1');
  });

  it('a resolution with NO occurrence after it closes episode 1 but opens no episode 2', () => {
    const input: DeriveEpisodesInput = {
      firstSeen: '2026-08-25T19:08:00Z',
      occurrences: [{ at: '2026-08-25T19:08:00Z' }],
      resolutions: [{ resolvedAt: '2026-08-25T23:45:00Z', fixedInSha: '20260825233000fix' }],
    };
    const episodes = deriveEpisodes(input);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]!.endedAt).toBe('2026-08-25T23:45:00.000Z');
    expect(currentEpisode(episodes)).toBeNull(); // closed, and nothing regressed since
    expect(hasRegressed(episodes)).toBe(false);
  });
});

describe('deriveEpisodes — regression after fix', () => {
  it('the brief\'s own worked shape: fixed in a PR, then a new occurrence after release -> episode 2, a REGRESSION', () => {
    const releaseDeployedAt = new Map([['8e4c5b7d', '2026-09-02T12:00:00Z']]);
    const input: DeriveEpisodesInput = {
      firstSeen: '2026-08-25T19:08:00Z',
      occurrences: [
        { at: '2026-08-25T19:08:00Z' }, // episode 1
        { at: '2026-08-25T19:15:00Z' }, // episode 1
        { at: '2026-09-02T12:07:00Z' }, // 7 minutes after the release -> episode 2
      ],
      resolutions: [{ resolvedAt: '2026-08-25T23:45:00Z', fixedInSha: '8e4c5b7d' }],
      releaseDeployedAt,
    };
    const episodes = deriveEpisodes(input);
    expect(episodes).toHaveLength(2);

    const ep1 = episodes[0]!;
    expect(ep1.kind).toBe('initial');
    expect(ep1.occurrenceCount).toBe(2);
    expect(ep1.endedAt).toBe('2026-08-25T23:45:00.000Z');

    const ep2 = episodes[1]!;
    expect(ep2.number).toBe(2);
    expect(ep2.kind).toBe('regression');
    expect(ep2.occurrenceCount).toBe(1);
    expect(ep2.startedAt).toBe('2026-09-02T12:07:00.000Z');
    expect(ep2.releaseAtStart).toBe('8e4c5b7d');
    expect(ep2.firstSeenAfterReleaseMs).toBe(7 * 60_000);
    expect(ep2.headline).toBe('REGRESSION — Episode 2, first seen 7m after release 8e4c5b7');
    expect(ep2.endedAt).toBeNull();

    expect(hasRegressed(episodes)).toBe(true);
    expect(currentEpisode(episodes)).toBe(ep2);
  });

  it('three episodes: fix, regress, fix again, regress again', () => {
    const input: DeriveEpisodesInput = {
      firstSeen: '2026-08-01T00:00:00Z',
      occurrences: [
        { at: '2026-08-01T00:00:00Z' },
        { at: '2026-08-10T00:00:00Z' }, // after resolution 1 -> episode 2
        { at: '2026-08-20T00:00:00Z' }, // after resolution 2 -> episode 3
      ],
      resolutions: [
        { resolvedAt: '2026-08-05T00:00:00Z', fixedInSha: 'sha-1' },
        { resolvedAt: '2026-08-15T00:00:00Z', fixedInSha: 'sha-2' },
      ],
    };
    const episodes = deriveEpisodes(input);
    expect(episodes.map((e) => e.number)).toEqual([1, 2, 3]);
    expect(episodes.map((e) => e.kind)).toEqual(['initial', 'regression', 'regression']);
    expect(episodes.map((e) => e.occurrenceCount)).toEqual([1, 1, 1]);
    expect(episodes[1]!.releaseAtStart).toBe('sha-1');
    expect(episodes[2]!.releaseAtStart).toBe('sha-2');
    expect(episodes[1]!.endedAt).toBe('2026-08-15T00:00:00.000Z');
    expect(episodes[2]!.endedAt).toBeNull();
  });

  it('a regression episode with unknown deploy time omits the duration but still says which release', () => {
    const input: DeriveEpisodesInput = {
      firstSeen: '2026-08-01T00:00:00Z',
      occurrences: [{ at: '2026-08-01T00:00:00Z' }, { at: '2026-08-10T00:00:00Z' }],
      resolutions: [{ resolvedAt: '2026-08-05T00:00:00Z', fixedInSha: 'sha-unknown-deploy-time' }],
      // No releaseDeployedAt entry for 'sha-unknown-deploy-time'.
    };
    const episodes = deriveEpisodes(input);
    expect(episodes[1]!.firstSeenAfterReleaseMs).toBeNull();
    expect(episodes[1]!.headline).toBe('REGRESSION — Episode 2 — after release sha-unk');
  });

  it('a regression whose fix carried no SHA still forms a new episode, honestly unattributed', () => {
    const input: DeriveEpisodesInput = {
      firstSeen: '2026-08-01T00:00:00Z',
      occurrences: [{ at: '2026-08-01T00:00:00Z' }, { at: '2026-08-10T00:00:00Z' }],
      resolutions: [{ resolvedAt: '2026-08-05T00:00:00Z', fixedInSha: null }],
    };
    const episodes = deriveEpisodes(input);
    expect(episodes).toHaveLength(2);
    expect(episodes[1]!.releaseAtStart).toBeNull();
    expect(episodes[1]!.headline).toBe('REGRESSION — Episode 2 — after an unknown release');
  });
});

describe('deriveEpisodes — edge cases', () => {
  it('no occurrences at all yields one empty episode anchored at firstSeen', () => {
    const episodes = deriveEpisodes({ firstSeen: '2026-08-01T00:00:00Z', occurrences: [], resolutions: [] });
    expect(episodes).toHaveLength(1);
    expect(episodes[0]!.occurrenceCount).toBe(0);
  });

  it('resolutions are sorted internally regardless of input order', () => {
    const input: DeriveEpisodesInput = {
      firstSeen: '2026-08-01T00:00:00Z',
      occurrences: [
        { at: '2026-08-01T00:00:00Z' },
        { at: '2026-08-10T00:00:00Z' },
        { at: '2026-08-20T00:00:00Z' },
      ],
      // Same shape as the "three episodes" case above, but supplied reversed.
      resolutions: [
        { resolvedAt: '2026-08-15T00:00:00Z', fixedInSha: 'sha-2' },
        { resolvedAt: '2026-08-05T00:00:00Z', fixedInSha: 'sha-1' },
      ],
    };
    const episodes = deriveEpisodes(input);
    expect(episodes.map((e) => e.releaseAtStart)).toEqual([null, 'sha-1', 'sha-2']);
  });

  it('two resolutions with no occurrence between them: the LATER one is the fix the next regression actually defied', () => {
    const input: DeriveEpisodesInput = {
      firstSeen: '2026-08-01T00:00:00Z',
      occurrences: [{ at: '2026-08-01T00:00:00Z' }, { at: '2026-08-20T00:00:00Z' }],
      resolutions: [
        { resolvedAt: '2026-08-05T00:00:00Z', fixedInSha: 'sha-1' },
        // A redundant re-confirmation between the same two occurrences.
        { resolvedAt: '2026-08-15T00:00:00Z', fixedInSha: 'sha-2' },
      ],
    };
    const episodes = deriveEpisodes(input);
    expect(episodes).toHaveLength(2);
    expect(episodes[1]!.releaseAtStart).toBe('sha-2');
    expect(episodes[0]!.endedAt).toBe('2026-08-15T00:00:00.000Z');
  });

  it('an unparseable timestamp is dropped rather than corrupting ordering', () => {
    const input: DeriveEpisodesInput = {
      firstSeen: '2026-08-01T00:00:00Z',
      occurrences: [{ at: 'not-a-date' }, { at: '2026-08-02T00:00:00Z' }],
      resolutions: [],
    };
    const episodes = deriveEpisodes(input);
    expect(episodes[0]!.occurrenceCount).toBe(1);
  });
});
