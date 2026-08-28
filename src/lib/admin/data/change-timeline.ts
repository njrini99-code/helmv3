import 'server-only';

/**
 * Helm Bridge — the Change Timeline.
 *
 * WHY THIS EXISTS. The Bridge already shows what is broken (Incidents), what
 * shipped (the Release Ledger), and what was fixed (the Archive) — but never
 * as one ordered sequence. Reconstructing "did the fix land before or after
 * the error stopped?" today means opening three tabs and lining up
 * timestamps by hand, every morning, by every operator. This module is that
 * reconstruction done once, from readers that already exist: a deploy from
 * `vercel-api.ts`, an incident sighting or a diagnosis from the unified
 * incident model, a repair PR from `github-pr-timeline.ts`, a resolution or
 * a regression from `resolutions.ts`. Nothing here is a new store — see
 * `memory/features/admin-platform.md` on why a second authority is worse
 * than no authority.
 *
 * THE ONE RULE THAT MATTERS MOST: A DEPLOY NEXT TO AN INCIDENT IS A
 * TEMPORAL NEIGHBOUR, NOT A CAUSE. This strip exists precisely because
 * humans are good at inferring causation from adjacency and bad at
 * resisting it — an operator glancing at "deploy 9m before incident" will
 * draw the causal line themselves, and that is exactly the judgement this
 * module must never make FOR them. No string built here says "caused by" or
 * "because of", and `change-timeline.test.ts` asserts it stays that way.
 *
 * THE SECOND RULE: A SOURCE THAT COULD NOT BE READ IS ABSENT, NOT SILENT.
 * `buildChangeTimeline`'s three optional arrays are `null` when their
 * source failed, and `null` MUST NOT be rendered as "nothing happened" — a
 * timeline missing its deploys because Vercel was unreachable, with no sign
 * of the gap, is a worse lie than showing no timeline at all. `unknown` as
 * its own state is the same invariant `types.ts` already states for every
 * incident source; this module is that invariant applied to one more
 * surface.
 */

import type { StateTone, UnifiedIncident } from '@/lib/admin/incidents/types';
import type { VercelDeployment, VercelDeployState } from '@/lib/admin/vercel-api';
import { fetchVercelDeployments } from '@/lib/admin/vercel-api';
import type { WorkLogEntry } from '@/lib/admin/github-pr-timeline';
import { fetchWorkLog } from '@/lib/admin/github-pr-timeline';
import type { ArchivedResolution } from '@/lib/admin/data/resolutions';
import { fetchResolutionArchive } from '@/lib/admin/data/resolutions';
import { RCA_CATEGORY_LABEL } from '@/lib/admin/rca-category';
import type { AdminFetchResult, AdminFetchStatus } from '@/lib/admin/fetch-result';
import { ok } from '@/lib/admin/fetch-result';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export type ChangeEventKind =
  | 'deploy'
  | 'incident-first-seen'
  | 'analysis'
  | 'pr-opened'
  | 'pr-merged'
  | 'resolved'
  | 'regressed';

export interface ChangeEvent {
  kind: ChangeEventKind;
  at: string; // ISO
  title: string; // one short line
  detail: string | null; // the specifics, never a category restatement
  href: string | null; // where to go to see it
  tone: StateTone;
  /** Short mono token shown on the rail — a SHA, a PR number, a fingerprint. */
  ref: string | null;
}

export interface ChangeTimelineInput {
  deployments: readonly VercelDeployment[] | null;
  pullRequests: readonly WorkLogEntry[] | null;
  incidents: readonly UnifiedIncident[];
  resolutions: readonly ArchivedResolution[] | null;
  windowMs: number;
  now: number;
}

export interface ChangeTimelineSnapshot {
  events: ChangeEvent[];
  windowMs: number;
  /**
   * Reasons this strip may be INCOMPLETE, so it can say so rather than
   * rendering a false all-clear. Two distinct cases share this one array,
   * deliberately: a source that could not be read at all (rejected or
   * returned a non-`ok` envelope), and a source that WAS read but only
   * partially (`AdminFetchResult.truncated`, or the deploy page having
   * possibly been clipped before reaching the window edge — see
   * `deploymentWindowMayBeIncomplete`). Both mean the same thing to an
   * operator — "do not trust this strip as the full story" — even though
   * only the first is literally "unreadable". Each entry is
   * `"<source label>: <reason>"`, so the reason travels with the label
   * rather than being dropped, per the fail-soft contract below.
   */
  unreadable: string[];
  /**
   * True when more incidents fell inside the window than
   * `INCIDENT_EVENT_CAP` allows onto the rail. NOT part of the
   * `buildChangeTimeline` stub this module was specced against — added
   * because "cap the events, and when capped, the snapshot must record it"
   * has nowhere else to live: `buildChangeTimeline` stays pure and returns
   * only `ChangeEvent[]`, so a caller cannot recover "was this list
   * truncated?" by inspecting its length alone (a genuinely quiet 72 hours
   * and a capped storm both end up with *some* array). See
   * `incidentEventsCapped`, the one function both this flag and the
   * builder's own capping logic read from — one source of truth for the
   * cap arithmetic, not two copies that can drift apart.
   */
  incidentsCapped: boolean;
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** How far back the strip looks by default. An operator's question is
 *  "what changed recently", and 72 hours is the same horizon
 *  `reliability.ts`'s `HISTORY_LIMIT` comment reasons from (12 runs at a
 *  3-hour cadence = 36h of collector history) doubled to comfortably span a
 *  weekend gap between two weekday check-ins. */
export const DEFAULT_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * The most incident-first-seen events the rail will ever show at once.
 *
 * WHY 10. A single misbehaving qualifier or a flapping integration can throw
 * dozens of app-origin fingerprints into `admin_events` inside the window,
 * and every one of them would otherwise queue up as its own rail entry,
 * pushing every deploy, PR and resolution off the bottom of a 72-hour view —
 * the exact "confetti" failure `Row.tsx`'s doc comment describes for
 * severity chips, here applied to volume instead of colour. 10 is generous
 * enough to show a genuine cluster's SHAPE (first-seen times close together,
 * same route) without one storm crowding out the other four event kinds
 * this strip exists to interleave. It is deliberately not tied to
 * `HISTORY_LIMIT` or any other module's cap — those bound unrelated pages at
 * unrelated cadences, and reusing a number for an unrelated reason is how a
 * future change to one silently breaks the other.
 */
export const INCIDENT_EVENT_CAP = 10;

// ---------------------------------------------------------------------------
// Ordering — every derivation below feeds this one comparator.
// ---------------------------------------------------------------------------

/**
 * Break a same-instant tie by narrative importance, most important first.
 * `regressed` leads because a regression at the same instant as anything
 * else is the fact an operator most needs to see immediately — a resolution
 * and a regression that land in the same recorded second are, definitionally,
 * the regression winning.
 */
const KIND_PRIORITY: readonly ChangeEventKind[] = [
  'regressed',
  'resolved',
  'deploy',
  'pr-merged',
  'pr-opened',
  'analysis',
  'incident-first-seen',
];

function kindRank(kind: ChangeEventKind): number {
  const idx = KIND_PRIORITY.indexOf(kind);
  return idx === -1 ? KIND_PRIORITY.length : idx;
}

/**
 * Newest first; ties broken by kind priority, then by `ref`, then by
 * `title` — fully deterministic so two renders of identical input never
 * disagree on order (`change-timeline.test.ts` calls this twice and asserts
 * deep equality).
 */
function compareEvents(a: ChangeEvent, b: ChangeEvent): number {
  const byTime = Date.parse(b.at) - Date.parse(a.at);
  if (byTime !== 0) return byTime;
  const byKind = kindRank(a.kind) - kindRank(b.kind);
  if (byKind !== 0) return byKind;
  const aRef = a.ref ?? '';
  const bRef = b.ref ?? '';
  if (aRef !== bRef) return aRef < bRef ? -1 : 1;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------

function inWindow(iso: string, now: number, windowMs: number): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t >= now - windowMs;
}

// ---------------------------------------------------------------------------
// Deploys
// ---------------------------------------------------------------------------

const DEPLOY_STATE_WORD: Readonly<Record<VercelDeployState, string>> = {
  READY: 'ready',
  ERROR: 'failed',
  CANCELED: 'canceled',
  BUILDING: 'building',
  QUEUED: 'queued',
  INITIALIZING: 'initializing',
};

function deployTone(state: VercelDeployState): StateTone {
  switch (state) {
    case 'READY':
      return 'success';
    case 'ERROR':
      return 'danger';
    case 'CANCELED':
      return 'neutral';
    case 'BUILDING':
    case 'QUEUED':
    case 'INITIALIZING':
      // In progress at read time — an operator should notice it, but it has
      // neither succeeded nor failed yet, so neither success nor danger is
      // honest.
      return 'accent';
  }
}

function buildDeployEvents(
  deployments: readonly VercelDeployment[] | null,
  now: number,
  windowMs: number,
): ChangeEvent[] {
  if (deployments === null) return [];
  const events: ChangeEvent[] = [];
  for (const d of deployments) {
    if (d.target !== 'production') continue;
    const at = new Date(d.createdAt).toISOString();
    if (!inWindow(at, now, windowMs)) continue;
    events.push({
      kind: 'deploy',
      at,
      title: `Deploy ${DEPLOY_STATE_WORD[d.state]}`,
      detail: d.commitMessage?.split('\n')[0]?.trim() || null,
      href: '/admin/deploys',
      tone: deployTone(d.state),
      ref: d.commitSha ? d.commitSha.slice(0, 7) : null,
    });
  }
  return events;
}

// ---------------------------------------------------------------------------
// Incidents — first-seen (capped) and analysis (uncapped)
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Readonly<Record<UnifiedIncident['severity'], number>> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

function severityTone(severity: UnifiedIncident['severity']): StateTone {
  switch (severity) {
    case 'critical':
    case 'error':
      return 'danger';
    case 'warning':
      return 'warning';
    case 'info':
      return 'neutral';
  }
}

function incidentsFirstSeenInWindow(
  incidents: readonly UnifiedIncident[],
  now: number,
  windowMs: number,
): UnifiedIncident[] {
  return incidents.filter((i) => inWindow(i.firstSeen, now, windowMs));
}

/**
 * Whether `buildChangeTimeline` would cap the `incident-first-seen` events
 * for this input.
 *
 * Exported so `fetchChangeTimeline` can set `ChangeTimelineSnapshot.
 * incidentsCapped` WITHOUT `buildChangeTimeline` giving up its pure
 * `ChangeEvent[]` return type, and without a second, independently-drifting
 * copy of the window-and-cap arithmetic — both call sites read this one
 * function, so a change to the cap or the window rule cannot update one
 * without the other.
 */
export function incidentEventsCapped(
  incidents: readonly UnifiedIncident[],
  windowMs: number,
  now: number,
): boolean {
  return incidentsFirstSeenInWindow(incidents, now, windowMs).length > INCIDENT_EVENT_CAP;
}

/** Most severe first, most recent first within a severity — the ordering an
 *  operator would triage by if the cap forces a choice about what to drop. */
function severityThenRecency(a: UnifiedIncident, b: UnifiedIncident): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) return bySeverity;
  return Date.parse(b.firstSeen) - Date.parse(a.firstSeen);
}

function buildIncidentFirstSeenEvents(
  incidents: readonly UnifiedIncident[],
  now: number,
  windowMs: number,
): ChangeEvent[] {
  const windowed = incidentsFirstSeenInWindow(incidents, now, windowMs);
  const selected =
    windowed.length > INCIDENT_EVENT_CAP
      ? [...windowed].sort(severityThenRecency).slice(0, INCIDENT_EVENT_CAP)
      : windowed;

  return selected.map((incident) => ({
    kind: 'incident-first-seen',
    at: incident.firstSeen,
    title: incident.title,
    detail: incident.description,
    href: incident.linkTarget,
    tone: severityTone(incident.severity),
    ref: incident.id,
  }));
}

/**
 * Analysis events are DELIBERATELY not subject to the incident cap above.
 * An analysis only exists once a diagnosis actually ran, so the count is
 * bounded by how much repair work happened, not by how many times a
 * fingerprint fired — a dimension an error storm cannot inflate the way it
 * inflates raw sightings. Capping it too would mean a genuinely rare,
 * high-value event (a completed diagnosis) could be silently dropped by the
 * same storm that already dropped its sighting.
 */
function buildAnalysisEvents(
  incidents: readonly UnifiedIncident[],
  now: number,
  windowMs: number,
): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  for (const incident of incidents) {
    const analysis = incident.analysis;
    if (!analysis) continue;
    if (!inWindow(analysis.generatedAt, now, windowMs)) continue;
    events.push({
      kind: 'analysis',
      at: analysis.generatedAt,
      title: `Analyzed: ${incident.title}`,
      detail: `${RCA_CATEGORY_LABEL[analysis.category]} · ${analysis.confidence} confidence`,
      href: incident.linkTarget,
      tone: 'accent',
      ref: incident.id,
    });
  }
  return events;
}

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

/**
 * A PR conventionally opens with `fix(...)`/`fix:` in this repo's own commit
 * history (see recent `main` log — `fix(bridge): …`, `fix(stop): …`,
 * `fix(selfheal): …`), which is the closest thing to a declared "this
 * changed behaviour to correct a fault" signal a title carries on its own.
 */
const REPAIR_TITLE = /^fix(\(|:)/i;

/**
 * The PR-selection rule for this strip: a `fix(...)` title OR a non-empty
 * `repairIncidentIds` (the self-healing loop's own repair-contract markers,
 * see `repair-link.ts`).
 *
 * WHY NOT `parsed.area === 'bridge'`. That would also admit ordinary Bridge
 * feature work — a new panel, a new column — which changed the PRODUCT, not
 * production BEHAVIOUR, and is exactly the noise this strip exists to keep
 * out. `repairIncidentIds` alone would miss every human-authored fix that
 * never linked back to a Bridge incident id (most of them, historically —
 * the repair-contract markers are new). The union of the two catches both
 * the self-healing loop's own repairs and the ordinary human bug-fix
 * commits this repo already names consistently, while still excluding
 * `feat`/`refactor`/`docs`/`chore` work.
 */
function isRepairWork(entry: WorkLogEntry): boolean {
  return entry.repairIncidentIds.length > 0 || REPAIR_TITLE.test(entry.title.trim());
}

function buildPrEvents(
  pullRequests: readonly WorkLogEntry[] | null,
  now: number,
  windowMs: number,
): ChangeEvent[] {
  if (pullRequests === null) return [];
  const events: ChangeEvent[] = [];
  for (const entry of pullRequests) {
    if (!isRepairWork(entry)) continue;
    const ref = `#${entry.number}`;

    if (inWindow(entry.created_at, now, windowMs)) {
      events.push({
        kind: 'pr-opened',
        at: entry.created_at,
        title: `PR ${ref} opened`,
        detail: entry.title,
        href: entry.html_url,
        tone: 'accent',
        ref,
      });
    }

    if (entry.merged_at && inWindow(entry.merged_at, now, windowMs)) {
      events.push({
        kind: 'pr-merged',
        at: entry.merged_at,
        title: `PR ${ref} merged`,
        detail: entry.title,
        href: entry.html_url,
        // Matches `LIFECYCLE_TONE.merged` in types.ts: green is reserved for
        // VERIFIED success, and a merge only expects to work — it has not
        // yet deployed, let alone been proven in production.
        tone: 'warning',
        ref,
      });
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Resolutions / regressions
// ---------------------------------------------------------------------------

/** fingerprint (or incident id) -> the incident it belongs to, so a
 *  resolution row (which only carries a bare fingerprint) can be enriched
 *  with the incident's own title and link. */
function indexIncidentsByFingerprint(
  incidents: readonly UnifiedIncident[],
): ReadonlyMap<string, UnifiedIncident> {
  const map = new Map<string, UnifiedIncident>();
  for (const incident of incidents) {
    if (!map.has(incident.id)) map.set(incident.id, incident);
    for (const fp of incident.appFingerprints) {
      if (!map.has(fp)) map.set(fp, incident);
    }
  }
  return map;
}

function buildResolutionEvents(
  resolutions: readonly ArchivedResolution[] | null,
  incidentsByFingerprint: ReadonlyMap<string, UnifiedIncident>,
  now: number,
  windowMs: number,
): ChangeEvent[] {
  if (resolutions === null) return [];
  const events: ChangeEvent[] = [];

  for (const row of resolutions) {
    const incident = incidentsByFingerprint.get(row.fingerprint) ?? null;
    const label = incident?.title ?? `Fingerprint ${row.fingerprint}`;
    const href = incident?.linkTarget ?? null;
    const sourceWord = row.resolutionSource === 'auto' ? 'automatically' : 'manually';

    if (inWindow(row.resolvedAt, now, windowMs)) {
      events.push({
        kind: 'resolved',
        at: row.resolvedAt,
        title: `Resolved: ${label}`,
        detail: `Resolved ${sourceWord}`,
        href,
        tone: 'success',
        ref: row.fingerprint,
      });
    }

    // `reopenedAt` non-null is a regression, and it outranks everything at
    // the same instant — see KIND_PRIORITY above.
    if (row.reopenedAt && inWindow(row.reopenedAt, now, windowMs)) {
      events.push({
        kind: 'regressed',
        at: row.reopenedAt,
        title: `Regressed: ${label}`,
        detail:
          row.reopenedCount > 1
            ? `Regressed after being resolved ${sourceWord} (reopened ${row.reopenedCount}× total)`
            : `Regressed after being resolved ${sourceWord}`,
        href,
        tone: 'danger',
        ref: row.fingerprint,
      });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// The pure builder
// ---------------------------------------------------------------------------

/**
 * Assemble one ordered strip from four already-fetched sources.
 *
 * PURE. No I/O, no `Date.now()`, no environment — every timestamp this
 * function reasons about comes from `input.now`, so it produces byte-
 * identical output for byte-identical input every time it is called
 * (`change-timeline.test.ts` calls it twice on the same input and asserts
 * deep equality).
 *
 * `null` on `deployments` / `pullRequests` / `resolutions` means that
 * source could not be read this refresh, and contributes NO events — the
 * exact same outcome as passing `[]`. That is deliberate: the difference
 * between "nothing happened" and "we could not check" is real and matters,
 * but it is NOT a difference this function is in a position to report,
 * because it returns only a flat event list with no per-source health
 * alongside it. The difference is carried one level up, in
 * `ChangeTimelineSnapshot.unreadable` — `fetchChangeTimeline` is what turns
 * a failed read into an entry there. A reader of this function's output
 * alone cannot distinguish an empty window from an unreadable one, and is
 * not meant to try.
 */
export function buildChangeTimeline(input: ChangeTimelineInput): ChangeEvent[] {
  const { deployments, pullRequests, incidents, resolutions, windowMs, now } = input;

  const incidentsByFingerprint = indexIncidentsByFingerprint(incidents);

  const events: ChangeEvent[] = [
    ...buildDeployEvents(deployments, now, windowMs),
    ...buildIncidentFirstSeenEvents(incidents, now, windowMs),
    ...buildAnalysisEvents(incidents, now, windowMs),
    ...buildPrEvents(pullRequests, now, windowMs),
    ...buildResolutionEvents(resolutions, incidentsByFingerprint, now, windowMs),
  ];

  return events.sort(compareEvents);
}

// ---------------------------------------------------------------------------
// The fetch wrapper
// ---------------------------------------------------------------------------

/** Read one source, and turn EITHER a rejection or a non-`ok` envelope into
 *  `{ data: null, note }` — never a discarded reason. A caught rejection
 *  here is defense in depth: every reader this module calls already catches
 *  internally and returns a `failed()` envelope, but a second boundary costs
 *  nothing and this module's whole reason for existing is to not be the
 *  place a silent gap gets introduced.
 *
 *  A successful-but-`truncated` envelope (`fetchWorkLog` past
 *  `GITHUB_PR_FETCH_LIMIT`, `fetchResolutionArchive` past
 *  `RESOLUTION_ROW_CEILING`) is NOT treated as a full read either: `data` is
 *  still returned and used, but a note is recorded too, because "the most
 *  recent page" quietly stops covering the strip's `windowMs` the moment the
 *  source has more history than one page holds — the same honesty gap a
 *  dropped rejection reason would leave, just from the other end of a
 *  paginated read. */
async function readSource<T>(
  label: string,
  run: () => Promise<AdminFetchResult<T>>,
): Promise<{ data: T | null; note: string | null }> {
  try {
    const res = await run();
    if (res.status === 'ok') {
      const note = res.truncated
        ? `${label}: only the most recent page was read — older history in the window may be missing`
        : null;
      return { data: res.data, note };
    }
    const status: AdminFetchStatus = res.status;
    return { data: null, note: `${label}: ${res.error ?? status}` };
  } catch (err) {
    return { data: null, note: `${label}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * How many deployments to request per refresh.
 *
 * `fetchVercelDeployments` has no server-side `target` filter — it returns
 * the N most recent deployments of ANY target, and `buildDeployEvents`
 * filters to `target === 'production'` afterward, same as every other
 * consumer of this reader (`release-ledger.ts`, `ben-leah-issue-tracker.ts`).
 * At the OLD default of 20, a burst of preview deploys (every open PR's
 * Vercel preview counts) can fill the whole page and push every production
 * deploy in a 72-hour window out of it entirely — the request still comes
 * back `ok`, `deployments` is non-empty, nothing lands in `unreadable`, and
 * the strip would render an honest-LOOKING "no deploys" that is actually
 * "no deploys in the 20 most recent PREVIEWS". 100 does not eliminate that
 * risk, only lowers it; `deploymentWindowMayBeIncomplete` below is the
 * mechanical check that catches it regardless of how high this number is.
 */
const DEPLOY_FETCH_LIMIT = 100;

/**
 * Whether the fetched deployment page might have been cut off before
 * reaching back to `now - windowMs` — the same "hit our own ceiling, not a
 * drained source" reasoning `resolutions.ts`'s `isTruncated` uses, applied
 * here because `fetchVercelDeployments` exposes no total count to compare
 * against.
 *
 * The page filled (`length === requestedLimit`) AND the OLDEST row we got
 * is still inside the window: both must hold, because a full page whose
 * oldest row already falls outside the window proves the window is fully
 * covered regardless of how many more (older, out-of-window) deployments
 * exist beyond it.
 */
function deploymentWindowMayBeIncomplete(
  deployments: readonly VercelDeployment[],
  requestedLimit: number,
  now: number,
  windowMs: number,
): boolean {
  if (deployments.length < requestedLimit) return false;
  const oldestCreatedAt = Math.min(...deployments.map((d) => d.createdAt));
  return oldestCreatedAt >= now - windowMs;
}

/**
 * Fetch the three optional sources in parallel, fail-soft, and build the
 * strip.
 *
 * `incidents` is not fetched here — it is the caller's already-assembled
 * unified incident board (see `fetchIncidentBoard`), passed in so this
 * module never re-derives it and cannot disagree with what the Incidents
 * tab is showing at the same moment. WIRING REQUIREMENT ON THE CALLER: that
 * board must itself already cover at least `windowMs` (e.g. built with a
 * `windowHours` at or above this strip's window). If the caller's board is
 * narrower, `incident-first-seen` and `analysis` events silently stop as of
 * the CALLER's shorter horizon while this strip's own copy still claims
 * `windowMs` — this function has no way to detect that mismatch from
 * `incidents` alone, because a short list is indistinguishable from a
 * genuinely quiet one.
 */
export async function fetchChangeTimeline(
  incidents: readonly UnifiedIncident[],
  windowMs: number = DEFAULT_WINDOW_MS,
  now: number = Date.now(),
): Promise<AdminFetchResult<ChangeTimelineSnapshot>> {
  const [deployRes, prRes, resolutionRes] = await Promise.all([
    readSource('Vercel deployments', () => fetchVercelDeployments(DEPLOY_FETCH_LIMIT)),
    readSource('GitHub pull requests', () => fetchWorkLog()),
    readSource('resolution archive', () => fetchResolutionArchive()),
  ]);

  const unreadable = [deployRes.note, prRes.note, resolutionRes.note].filter(
    (n): n is string => n !== null,
  );

  if (
    deployRes.data &&
    deploymentWindowMayBeIncomplete(deployRes.data, DEPLOY_FETCH_LIMIT, now, windowMs)
  ) {
    unreadable.push(
      `Vercel deployments: the ${DEPLOY_FETCH_LIMIT} most recent deployments (any target) were all still inside the window — older production deploys in this window may be missing`,
    );
  }

  const events = buildChangeTimeline({
    deployments: deployRes.data,
    pullRequests: prRes.data?.entries ?? null,
    incidents,
    resolutions: resolutionRes.data?.resolutions ?? null,
    windowMs,
    now,
  });

  const snapshot: ChangeTimelineSnapshot = {
    events,
    windowMs,
    unreadable,
    incidentsCapped: incidentEventsCapped(incidents, windowMs, now),
    computedAt: new Date(now).toISOString(),
  };

  return ok(snapshot);
}
