import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { logServerError } from '@/lib/server-error-logger';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { loadBridgeGraph } from '@/lib/admin/clubhouse/graph-server';
import {
  FEED_DEVICES,
  FEED_WINDOWS,
  STATE_WORDS,
  WINDOW_LABEL,
  buildFeed,
  codeCount,
  currentRelease,
  eventKey,
  feedHref,
  feedReport,
  filterFeed,
  hourlyKeyOf,
  howItCounts,
  itemHeadline,
  newCodes,
  ordinal,
  parseFeedScope,
  roleSummary,
  trailLines,
  whereOf,
  windowStart,
  windowTail,
  windowWords,
  type FeedItem,
  type FeedScope,
  type RoleCard,
} from '@/lib/admin/clubhouse/feed';
import { readErrorLogForSession, readEventByKey, readFailureCodeReleases, readFailures, readSessionsByIds, readTeamNames } from '@/lib/admin/clubhouse/feed-server';
import { readNotes, readPipe, readSessionEvents } from '@/lib/admin/clubhouse/live';
import { PLATFORM_WORDS, type LiveState } from '@/lib/admin/clubhouse/live-model';
import { EMPTY_NOTES } from '@/lib/admin/clubhouse/notes';
import { RULE_LINES } from '@/lib/admin/clubhouse/rule-book';
import { liveRef } from '@/lib/admin/clubhouse/screens';
import { CopyReportButton } from '@/app/admin/_components/CopyReportButton';
import { LocalTime } from '@/app/admin/_components/LocalTime';
import { Pill, RoleBadge, SpaceHeader, SpaceRoot, SpaceState } from '../_ui/ui';
import { ExpectedNote, WatchControl } from '@/app/admin/clubhouse/_components/CodeNotes';
import { ErrorDetail, noteBlocker } from './_components/ErrorDetail';
import { LinkGroup, ReliabilityTabs, PipeTruth } from './_components/shared';

export const metadata: Metadata = { title: 'Reliability · Error feed' };

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 3_600_000;
const DEVICE_LABEL: Record<(typeof FEED_DEVICES)[number], string> = { all: 'Every device', 'ios-app': 'iOS app', 'ios-safari': 'iPhone Safari', desktop: 'Desktop', other: 'Other' };
const STATE_TONE = { expected: 'muted', watching: 'watch', new: 'bad' } as const;

type SearchParams = Record<string, string | string[] | undefined>;

function RoleCardLink({ card, scope }: { card: RoleCard; scope: FeedScope }) {
  const on = scope.role === card.role;
  const word = card.role === 'coach' ? 'Coaches' : 'Players';
  return (
    <Link
      href={feedHref(scope, { role: on ? 'all' : card.role, e: null })}
      className={`bs-panel rl-role bs-wash-${card.role}`}
      aria-current={on ? 'true' : undefined}
      data-br={BR.feed.roleCard}
    >
      <div className="rl-role-head">
        <RoleBadge role={card.role} />
        <span>{on ? 'showing only these · tap for both' : `tap to show only ${word.toLowerCase()}`}</span>
      </div>
      <div className="rl-role-nums">
        <div>
          <div className="rl-role-n">{card.errors}</div>
          <div className="rl-role-l">errors</div>
        </div>
        <div>
          <div className="rl-role-n">{card.people}</div>
          <div className="rl-role-l">{card.role === 'coach' ? 'coaches hit' : 'players hit'}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="rl-role-top">{card.top ? card.top.text : 'None'}</div>
          <div className="rl-role-l">{card.top ? `most common · ${card.top.count}×` : 'no errors'}</div>
        </div>
      </div>
    </Link>
  );
}

function FeedRow({ item, scope, selected }: { item: FeedItem; scope: FeedScope; selected: boolean }) {
  return (
    <Link
      href={feedHref(scope, { e: { sessionId: item.sessionId, seq: item.seq } }, 'detail')}
      className="rl-row"
      aria-current={selected ? 'true' : undefined}
      data-br={BR.feed.row}
    >
      <span className="rl-time bs-mono">
        <LocalTime iso={item.at} variant="time" />
      </span>
      <span className="rl-badge">{item.role ? <RoleBadge role={item.role} /> : <Pill tone="muted">Role not read</Pill>}</span>
      <span className="rl-main" style={{ minWidth: 0 }}>
        <span className="rl-saw">
          <q>{itemHeadline(item)}</q>
          {item.code ? <span className="bs-chip">{item.code}</span> : null}
        </span>
        <span className="rl-where" style={{ display: 'block' }}>
          {item.pageName}
          {item.controlLabel || item.actionLabel ? (
            <>
              <span className="rl-sep" aria-hidden="true">›</span>
              {item.controlLabel ?? item.actionLabel}
            </>
          ) : null}
          <span className="rl-team"> · {item.teamName ?? 'no team name'}</span>
        </span>
      </span>
      <span className="rl-state">
        {item.state ? <b className={`bs-tone-${STATE_TONE[item.state]}`}>{STATE_WORDS[item.state]}</b> : null}
        <span>
          {ordinal(item.nth)} {windowTail(scope.w)}
        </span>
      </span>
    </Link>
  );
}

/**
 * B19 Error feed (plan 2026-11-26-bridge-spaces-build.md): every error a person saw, where, on which button, for a coach
 * or a player. Read from the session store's failures (complete), never from the capped error log.
 */
export default async function ReliabilitySpacePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const scope = parseFeedScope(sp);
  const graph = loadBridgeGraph();
  const header = <ReliabilityTabs current="feed" />;
  if (!graph) {
    return (
      <SpaceRoot br={BR.feed.failed}>
        {header}
        <SpaceHeader eyebrow="Reliability · error feed" title="Every error a person saw," second="where, on which button." secondTone="ink" />
        <SpaceState br={BR.feed.failed} title="The Bridge map could not be read.">
          docs/clubhouse/generated/bridge-graph.json is missing from this deploy, so codes, pages and buttons cannot be named.
        </SpaceState>
      </SpaceRoot>
    );
  }

  const now = Date.now();
  const since = new Date(windowStart(scope.w, now)).toISOString();
  const [pipe, failures, notes, releaseRows] = await Promise.all([
    readPipe(now),
    readFailures(since),
    readNotes(),
    readFailureCodeReleases(new Date(now - 8 * DAY_MS).toISOString()),
  ]);
  if (failures.state === 'error') {
    await logServerError('Reliability feed: failures could not be read', { action: 'admin.spaces.reliability.feed', route: '/admin/spaces/reliability', feature: 'admin_dashboard' });
  }
  const notesIndex = notes.state === 'ok' ? notes.data : EMPTY_NOTES;
  const release = currentRelease(liveRef(), failures.sessions);
  // "New in this release" needs the whole 8-day baseline: a truncated read (newest first) can drop the older releases a
  // code already fired in, so newness is then unknown and nothing is called new.
  const baselineComplete = releaseRows.state === 'ok' && !(releaseRows as { truncated?: boolean }).truncated;
  const fresh = baselineComplete ? newCodes(releaseRows.data, release) : new Set<string>();
  const all = buildFeed({ graph, events: failures.events, sessions: failures.sessions, teamNames: failures.teamNames, notes: notesIndex, fresh, release });
  const unscopedRole = filterFeed(all, { ...scope, role: 'all' });
  const summary = roleSummary(unscopedRole);
  const items = filterFeed(all, scope);

  // The selected failure: the URL's, else the newest in view. An older stored link is read on its own.
  let selected: FeedItem | null = scope.e ? (all.find((i) => i.key === eventKey(scope.e!)) ?? null) : (items[0] ?? null);
  let outsideWindow = false;
  if (scope.e && !selected) {
    const one = await readEventByKey(scope.e.sessionId, scope.e.seq);
    if (one.state === 'ok' && one.data) {
      const sess = await readSessionsByIds([one.data.session_id]);
      const teams = await readTeamNames(sess.data.map((s) => s.team_id ?? '').filter(Boolean));
      selected = buildFeed({ graph, events: [one.data], sessions: sess.data, teamNames: teams.data, notes: notesIndex, fresh, release })[0] ?? null;
      outsideWindow = selected !== null;
    }
  }

  let detail: ReactNode = null;
  if (selected) {
    const [events, errorLog] = await Promise.all([readSessionEvents([selected.sessionId], 400), readErrorLogForSession(selected.sessionId)]);
    const session = failures.sessions.find((s) => s.session_id === selected!.sessionId) ?? null;
    const event = events.data.find((e) => e.seq === selected!.seq) ?? failures.events.find((e) => e.session_id === selected!.sessionId && e.seq === selected!.seq);
    const scopeItems = outsideWindow ? [selected] : all;
    const code = codeCount(scopeItems, selected.catalogCode);
    const expected = selected.catalogCode ? (notesIndex.expected.get(selected.catalogCode) ?? null) : null;
    const watching = selected.catalogCode ? (notesIndex.watched.get(selected.catalogCode) ?? null) : null;
    const key = hourlyKeyOf(
      event ?? { sent_at: selected.at, code: selected.code, bridge_id: selected.bridgeId, kind: selected.kind, outcome: selected.outcome, act: selected.act, action_id: selected.action, control_id: selected.control, page_id: selected.page },
      session ?? (selected.role ? { role: selected.role, platform: selected.platform ?? 'unknown', release: selected.release ?? 'unknown' } : null),
    );
    const counts = howItCounts(selected, key, {
      window: scope.w,
      release,
      code,
      expected,
      watched: Boolean(watching),
      isNew: selected.state === 'new' || (release !== null && selected.release === release && Boolean(selected.catalogCode && fresh.has(selected.catalogCode))),
      errorLog: errorLog.state === 'ok' ? { state: 'ok', rows: errorLog.data } : { state: errorLog.state === 'no-signal' ? 'no-signal' : 'error' },
      r02People: RULE_LINES.newAfterReleasePeople,
    });
    const sameCode = scopeItems.filter((i) => i.catalogCode === selected!.catalogCode);
    const lines = trailLines(events.data, graph, { sessionId: selected.sessionId, seq: selected.seq }, selected.role);
    const why = noteBlocker(graph, selected.bridgeId);
    const notesState: LiveState = why ? 'no-signal' : notes.state;
    const noteId = selected.bridgeId ?? 0;
    detail = (
      <ErrorDetail
        item={selected}
        graph={graph}
        scope={scope}
        where={whereOf(selected, graph)}
        trail={{ state: events.state, lines, truncated: lines.length < events.data.length }}
        counts={counts}
        sameServer={selected.serverCode ? { same: sameCode.filter((i) => i.serverCode === selected!.serverCode).length, of: sameCode.length } : null}
        notes={{ state: notesState, expected, watching }}
        outsideWindow={outsideWindow}
        noteControls={{
          watch: <WatchControl id={noteId} watching={watching} state={notesState} why={why} />,
          expected: <ExpectedNote id={noteId} note={expected} by={null} state={notesState} why={why} />,
        }}
      />
    );
  }

  const stateCode =
    failures.state === 'error' ? BR.feed.failed : failures.state === 'no-signal' ? BR.feed.noSignal : !items.length ? (pipe.untrusted ? BR.feed.noSignal : BR.feed.empty) : BR.feed.row;
  const filters = (
    <div className="rl-bar">
      <LinkGroup
        label="Window"
        br={BR.feed.filter}
        options={FEED_WINDOWS.map((w) => ({ key: w, label: WINDOW_LABEL[w], href: feedHref(scope, { w, e: null }), active: scope.w === w }))}
      />
      <LinkGroup
        label="Device"
        br={BR.feed.filter}
        options={FEED_DEVICES.filter((d) => d !== 'other').map((d) => ({ key: d, label: DEVICE_LABEL[d], href: feedHref(scope, { pf: d, e: null }), active: scope.pf === d }))}
      />
      {scope.page ? (
        <Link className="bs-pill" href={feedHref(scope, { page: null, e: null })} data-br={BR.feed.filter}>
          Page {graph.pages[scope.page as keyof typeof graph.pages]?.name ?? scope.page} · clear
        </Link>
      ) : null}
      {scope.sc ? (
        <Link className="bs-pill" href={feedHref(scope, { sc: null, e: null })} data-br={BR.feed.filter}>
          Server code {scope.sc} · clear
        </Link>
      ) : null}
    </div>
  );

  return (
    <SpaceRoot br={stateCode}>
      {header}
      <div className="rl-top">
        <SpaceHeader
          eyebrow={`Reliability · error feed · ${WINDOW_LABEL[scope.w].toLowerCase()}`}
          title="Every error a person saw,"
          second="where, on which button."
          secondTone="ink"
        />
        <div className="rl-cards">
          <RoleCardLink card={summary.coach} scope={scope} />
          <RoleCardLink card={summary.player} scope={scope} />
          <p className="rl-signed-out" style={{ margin: 0 }}>
            {summary.signedOut
              ? (
                <Link className="bs-link" href={feedHref(scope, { role: scope.role === 'signed-out' ? 'all' : 'signed-out', e: null })} data-br={BR.feed.roleCard}>
                  Signed out: {summary.signedOut} {summary.signedOut === 1 ? 'error' : 'errors'}, counted apart
                </Link>
              )
              : 'Signed out: none'}
            {summary.unknownRole ? ` · ${summary.unknownRole} whose session row could not be read` : ''}
          </p>
        </div>
      </div>

      {filters}
      <PipeTruth pipe={pipe}>
        <span>
          {all.length} {all.length === 1 ? 'failure' : 'failures'} {windowWords(scope.w)} · {scope.pf === 'all' ? 'every device' : PLATFORM_WORDS[scope.pf]} · from the session store (clubhouse_session_events), every failure kept
        </span>
        {failures.truncated ? <Pill tone="watch">More failures than one read keeps: the oldest are not shown</Pill> : null}
        {notes.state === 'error' ? <p className="bs-panel-note bs-tone-watch" style={{ margin: 0 }}>The Bridge notes could not be read: nothing shows as Expected or Watching.</p> : null}
        <span data-br={BR.feed.copy}>
          <CopyReportButton report={feedReport(items, summary, scope.w, pipe.label)} variant="labeled" size="sm" label="Copy report" className="bs-copy" />
        </span>
      </PipeTruth>

      {failures.state === 'error' ? (
        <SpaceState br={BR.feed.failed} title="The failures could not be read.">
          Nothing here is an all clear. {failures.errors[0] ?? ''} Reload to try again.
        </SpaceState>
      ) : failures.state === 'no-signal' ? (
        <SpaceState br={BR.feed.noSignal} title="No signal yet.">
          The session store is not there yet, so no error can be listed and nothing here is an all clear. {pipe.label}.
        </SpaceState>
      ) : !items.length ? (
        pipe.untrusted ? (
          <SpaceState br={BR.feed.noSignal} title={`No errors arrived ${windowWords(scope.w)}, but the pipe cannot vouch for it.`}>
            {pipe.label}. Until signals arrive, an empty feed is not an all clear.
          </SpaceState>
        ) : (
          <SpaceState br={BR.feed.empty} title={`No one saw an error ${windowWords(scope.w)}${scope.role !== 'all' || scope.pf !== 'all' || scope.page || scope.sc ? ' in this filter' : ''}.`}>
            The pipe is live, so this is a real zero. Widen the window or clear a filter to see older errors.
          </SpaceState>
        )
      ) : (
        <>
          {pipe.untrusted ? (
            <div className="bs-panel bs-panel-pad bs-wash-watch" role="status">
              <span className="bs-tone-watch" style={{ fontWeight: 600 }}>The pipe is not live ({pipe.label}).</span> These errors are real, but newer ones may be missing.
            </div>
          ) : null}
          <div className="rl-split">
            <section className="bs-panel rl-list" aria-label="Errors">
              {items.map((i) => (
                <FeedRow key={i.key} item={i} scope={scope} selected={selected?.key === i.key} />
              ))}
            </section>
            {detail ? <div className="rl-detail">{detail}</div> : null}
          </div>
        </>
      )}
      {items.length === 0 && detail ? <div className="rl-detail">{detail}</div> : null}
    </SpaceRoot>
  );
}
