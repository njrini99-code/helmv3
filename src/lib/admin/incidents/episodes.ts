/**
 * Episodes / regression model (brief §8, last paragraph).
 *
 * "A resolved root fingerprint that returns after a proven repair becomes a
 * new EPISODE... on the same incident." An episode is created by a
 * REGRESSION, never pre-emptively by a resolution: most fixes never
 * regress, and an incident whose fix has simply never recurred stays one
 * episode, not two. So a resolution only opens episode N+1 when at least
 * one occurrence exists after it — a resolution with nothing after it yet
 * leaves the incident in its current episode, "resolved, clean so far".
 *
 * PURE. `occurrences` and `resolutions` are the complete history the caller
 * already has (from `IncidentResolution`'s `reopenedCount` lineage and the
 * incident's own occurrence timestamps); this module never reads a clock or
 * a database.
 */

export type EpisodeKind = 'initial' | 'regression';

export interface EpisodeOccurrence {
  at: string;
}

export interface EpisodeResolutionEvent {
  resolvedAt: string;
  /** The commit the resolution attributed the fix to, when known. */
  fixedInSha: string | null;
}

export interface Episode {
  /** 1-based, in chronological order. */
  number: number;
  kind: EpisodeKind;
  /** First occurrence in this episode. */
  startedAt: string;
  /** The resolution that closed this episode, or null while it is still open. */
  endedAt: string | null;
  /** Occurrences counted strictly within [startedAt, next episode's startedAt). */
  occurrenceCount: number;
  /** The release this episode began under — the SHA of the fix that regressed,
   *  for a `'regression'` episode; null for `'initial'`, which has no prior fix
   *  to be measured against. */
  releaseAtStart: string | null;
  /** Time between `releaseAtStart`'s deploy and `startedAt`, when both are
   *  known. Null whenever the deploy time for `releaseAtStart` is unknown. */
  firstSeenAfterReleaseMs: number | null;
  /** One line for the Incident Genome — e.g. "REGRESSION — Episode 3, first
   *  seen 7m after release 8e4c5b7". */
  headline: string;
}

export interface DeriveEpisodesInput {
  firstSeen: string;
  occurrences: readonly EpisodeOccurrence[];
  /** Chronological resolve/reopen history for this incident. Order in the
   *  array does not matter — this module sorts by `resolvedAt`. */
  resolutions: readonly EpisodeResolutionEvent[];
  /** Deploy time per release SHA, when known — powers `firstSeenAfterReleaseMs`.
   *  A SHA absent from this map is not an error; the duration is simply null. */
  releaseDeployedAt?: ReadonlyMap<string, string>;
}

function toMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function formatDuration(ms: number): string {
  const abs = Math.max(ms, 0);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(abs / 3_600_000);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function buildHeadline(
  number: number,
  kind: EpisodeKind,
  releaseAtStart: string | null,
  firstSeenAfterReleaseMs: number | null,
): string {
  if (kind === 'initial') return `Episode ${number}`;
  const shaClause = releaseAtStart ? ` release ${releaseAtStart.slice(0, 7)}` : ' an unknown release';
  const timingClause =
    firstSeenAfterReleaseMs !== null ? `, first seen ${formatDuration(firstSeenAfterReleaseMs)} after${shaClause}` : ` — after${shaClause}`;
  return `REGRESSION — Episode ${number}${timingClause}`;
}

/**
 * Derive the episode timeline for one incident.
 *
 * Algorithm: walk resolutions in chronological order. Each resolution can
 * only close the CURRENTLY OPEN episode — this method never opens more than
 * one new episode per resolution, and a resolution with no occurrence after
 * it produces no new episode at all. Occurrences before the first
 * resolution (or between two resolutions, before the regression that
 * follows) belong to the still-open episode that precedes them.
 */
export function deriveEpisodes(input: DeriveEpisodesInput): Episode[] {
  const occurrencesMs = input.occurrences
    .map((o) => toMs(o.at))
    .filter((ms): ms is number => ms !== null)
    .sort((a, b) => a - b);

  const resolutions = input.resolutions
    .map((r) => ({ resolvedAtMs: toMs(r.resolvedAt), fixedInSha: r.fixedInSha }))
    .filter((r): r is { resolvedAtMs: number; fixedInSha: string | null } => r.resolvedAtMs !== null)
    .sort((a, b) => a.resolvedAtMs - b.resolvedAtMs);

  const firstSeenMs = toMs(input.firstSeen) ?? occurrencesMs[0] ?? 0;

  interface Draft {
    startMs: number;
    kind: EpisodeKind;
    releaseAtStart: string | null;
    endedAtMs: number | null;
  }

  const drafts: Draft[] = [];
  let cursorStart = firstSeenMs;
  let cursorKind: EpisodeKind = 'initial';
  let cursorRelease: string | null = null;
  /** Resolutions strictly before this index have already been consumed by a
   *  prior episode boundary and can never apply again — advancing it is what
   *  keeps a later, out-of-array-order-but-earlier-in-time resolution from
   *  being reconsidered once its window has passed. */
  let nextResolutionIdx = 0;

  for (const occMs of occurrencesMs) {
    if (occMs <= cursorStart) continue; // the anchor occurrence, or one already inside the open episode

    // The resolution that was ACTUALLY in effect when this occurrence fired
    // is the LATEST one strictly between the open episode's start and this
    // occurrence — not the first one found. Two resolutions can land between
    // the same pair of occurrences (a redundant re-confirmation), and only
    // the most recent one is the fix this regression actually defied.
    let closing: { resolvedAtMs: number; fixedInSha: string | null } | null = null;
    let k = nextResolutionIdx;
    for (; k < resolutions.length; k++) {
      const r = resolutions[k]!;
      if (r.resolvedAtMs >= occMs) break; // sorted ascending — nothing further can qualify
      if (r.resolvedAtMs > cursorStart) closing = r;
    }
    if (closing) nextResolutionIdx = k;

    if (!closing) continue; // no fix was in effect before this occurrence — still the same episode

    drafts.push({ startMs: cursorStart, kind: cursorKind, releaseAtStart: cursorRelease, endedAtMs: closing.resolvedAtMs });
    cursorStart = occMs;
    cursorKind = 'regression';
    cursorRelease = closing.fixedInSha;
  }
  drafts.push({ startMs: cursorStart, kind: cursorKind, releaseAtStart: cursorRelease, endedAtMs: null });

  // A resolution that never got an occurrence after it opened no new
  // episode above — but it still marks the FINAL episode resolved. "Fixed,
  // nothing has recurred yet" and "still open, never touched" are different
  // facts; endedAt must say which one is true. Latest such resolution wins.
  const finalDraft = drafts[drafts.length - 1]!;
  for (let k = nextResolutionIdx; k < resolutions.length; k++) {
    const r = resolutions[k]!;
    if (r.resolvedAtMs > cursorStart) finalDraft.endedAtMs = r.resolvedAtMs;
  }

  return drafts.map((draft, index) => {
    const number = index + 1;
    const nextStartMs = drafts[index + 1]?.startMs ?? null;
    const occurrenceCount = occurrencesMs.filter(
      (ms) => ms >= draft.startMs && (nextStartMs === null || ms < nextStartMs),
    ).length;

    const deployedAtIso = draft.releaseAtStart ? input.releaseDeployedAt?.get(draft.releaseAtStart) : undefined;
    const deployedAtMs = deployedAtIso ? toMs(deployedAtIso) : null;
    const firstSeenAfterReleaseMs = deployedAtMs !== null ? draft.startMs - deployedAtMs : null;

    return {
      number,
      kind: draft.kind,
      startedAt: new Date(draft.startMs).toISOString(),
      endedAt: draft.endedAtMs !== null ? new Date(draft.endedAtMs).toISOString() : null,
      occurrenceCount,
      releaseAtStart: draft.releaseAtStart,
      firstSeenAfterReleaseMs,
      headline: buildHeadline(number, draft.kind, draft.releaseAtStart, firstSeenAfterReleaseMs),
    } satisfies Episode;
  });
}

/** True once any regression episode exists — i.e. this is not the incident's first time. */
export function hasRegressed(episodes: readonly Episode[]): boolean {
  return episodes.some((e) => e.kind === 'regression');
}

/** The currently open (unresolved) episode, or null when every episode has an `endedAt`. */
export function currentEpisode(episodes: readonly Episode[]): Episode | null {
  return episodes.find((e) => e.endedAt === null) ?? null;
}
