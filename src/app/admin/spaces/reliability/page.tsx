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
  feedView,
  filterFeed,
  fixStatus,
  hourlyCodeOf,
  isCatchAll,
  itemExplanation,
  itemHeadlineQuoted,
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
  type FeedView,
  type RoleCard,
} from '@/lib/admin/clubhouse/feed';
import { groupIssues, issuesReport, sparkFrame } from '@/lib/admin/clubhouse/issues';
import { coverageOf, coverageWords, pageHealth, pagesReport } from '@/lib/admin/clubhouse/page-health';
import { readErrorLogForSession, readEventByKey, readFailureCodeReleases, readFailures, readSessionsByIds, readTeamNames } from '@/lib/admin/clubhouse/feed-server';
import { readHourly, readNotes, readPipe, readSessionEvents } from '@/lib/admin/clubhouse/live';
import { OWNER_TONE } from '@/lib/admin/clubhouse/explain';
import { PLATFORM_WORDS, type LiveState } from '@/lib/admin/clubhouse/live-model';
import { EMPTY_NOTES } from '@/lib/admin/clubhouse/notes';
import { RULE_LINES } from '@/lib/admin/clubhouse/rule-book';
import { liveRef } from '@/lib/admin/clubhouse/screens';
import { CopyReportButton } from '@/app/admin/_components/CopyReportButton';
import { LocalTime } from '@/app/admin/_components/LocalTime';
import { LinkTabs, Pill, RoleBadge, SpaceHeader, SpaceRoot, SpaceState } from '../_ui/ui';
import { SignalNotThere, ReadFailed } from '../_ui/states';
import { ExpectedNote, WatchControl } from '@/app/admin/clubhouse/_components/CodeNotes';
import { ErrorDetail, noteBlocker } from './_components/ErrorDetail';
import { LinkGroup, ReliabilityTabs, PipeTruth } from './_components/shared';
import { IssueList, PageList, SilentPages } from './_components/Issues';
import { FeedKeys } from './_components/FeedKeys';

export const metadata: Metadata = { title: 'Reliability · Error feed' };

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 3_600_000;
const DEVICE_LABEL: Record<(typeof FEED_DEVICES)[number], string> = { all: 'Every device', 'ios-app': 'iOS app', 'ios-safari': 'iPhone Safari', desktop: 'Desktop', other: 'Other' };
const STATE_TONE = { expected: 'muted', watching: 'watch', new: 'bad' } as const;
const VIEW_LABEL: Record<FeedView, string> = { issues: 'Issues', pages: 'Pages', errors: 'Every error' };

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

/** The likely cause in two words, so the list explains itself before a row is opened. */
function CauseChip({ item }: { item: FeedItem }) {
  const e = itemExplanation(item);
  if (e.basis === 'nothing') return null;
  return <span className={`rl-cause bs-tone-${OWNER_TONE[e.owner]}`}>{e.label}</span>;
}

function FeedRow({ item, scope, selected }: { item: FeedItem; scope: FeedScope; selected: boolean }) {
  return (
    <Link
      href={feedHref(scope, { e: { sessionId: item.sessionId, seq: item.seq } }, 'detail')}
      className="rl-row"
      aria-current={selected ? 'true' : undefined}
      data-br={BR.feed.row}
      data-feed-row=""
    >
      <span className="rl-time bs-mono">
        <LocalTime iso={item.at} variant="time" />
      </span>
      <span className="rl-badge">{item.role ? <RoleBadge role={item.role} /> : <Pill tone="muted">Role unknown</Pill>}</span>
      <span className="rl-main" style={{ minWidth: 0 }}>
        <span className="rl-saw">
          {itemHeadlineQuoted(item) ? <q>{itemHeadline(item)}</q> : <span>{itemHeadline(item)}</span>}
          {item.code ? <span className="bs-chip">{item.code}</span> : null}
          <CauseChip item={item} />
        </span>
        <span className="rl-where" style={{ display: 'block' }}>
          {item.pageName}
          {item.controlLabel || item.actionLabel || item.act ? (
            <>
              <span className="rl-sep" aria-hidden="true">›</span>
              {item.controlLabel ?? item.actionLabel ?? <span className="bs-mono">{item.act}</span>}
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
  const view = feedView(scope);
  const graph = loadBridgeGraph();
  const header = <ReliabilityTabs current="feed" />;
  if (!graph) {
    return (
      <SpaceRoot br={BR.feed.failed}>
        {header}
        <SpaceHeader eyebrow="Reliability · error feed" title="Every error a person saw," second="where, on which button." secondTone="ink" />
        <ReadFailed br={BR.feed.failed} what="The Bridge map" why="docs/clubhouse/generated/bridge-graph.json is missing from this deploy, so codes, pages and buttons cannot be named" />
      </SpaceRoot>
    );
  }

  const now = Date.now();
  const since = new Date(windowStart(scope.w, now)).toISOString();
  const [pipe, failures, notes, releaseRows, hourly] = await Promise.all([
    readPipe(now),
    readFailures(since),
    readNotes(),
    readFailureCodeReleases(new Date(now - 8 * DAY_MS).toISOString()),
    // Every kind, for the Pages view and the coverage line on all three: which pages reported at all.
    readHourly({ sinceIso: since }),
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
  // Issues group the failures in the role, device and page filter (an issue's own code filter is Every error's).
  const issueItems = filterFeed(all, { ...scope, code: null });
  const frame = sparkFrame(scope.w, now);
  const issues = groupIssues(issueItems, { w: scope.w, now });
  const health = hourly.state === 'ok' ? pageHealth(hourly.data, graph, { w: scope.w, now }) : [];
  const coverage = hourly.state === 'ok' ? coverageOf(health, graph) : null;
  const heardPages = health.filter((p) => p.lastAt !== null);

  // The selected failure (Every error only): the URL's, else the newest in view. An older stored link is read on its own.
  let selected: FeedItem | null = view !== 'errors' ? null : scope.e ? (all.find((i) => i.key === eventKey(scope.e!)) ?? null) : (items[0] ?? null);
  let outsideWindow = false;
  if (view === 'errors' && scope.e && !selected) {
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
      isNew: selected.state === 'new' || (release !== null && selected.release === release && Boolean(hourlyCodeOf(selected) && fresh.has(hourlyCodeOf(selected)!))),
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
        where={whereOf(selected, graph, events.data)}
        trail={{ state: events.state, lines, truncated: lines.length < events.data.length }}
        counts={counts}
        sameServer={selected.serverCode ? { same: sameCode.filter((i) => i.serverCode === selected!.serverCode).length, of: sameCode.length } : null}
        notes={{ state: notesState, expected, watching }}
        outsideWindow={outsideWindow}
        fix={fixStatus(
          baselineComplete ? releaseRows.data : null,
          hourlyCodeOf(selected),
          release,
          { release: selected.release, at: selected.at, page: selected.page },
          isCatchAll(graph, selected) ? selected.page : undefined,
        )}
        noteControls={{
          watch: <WatchControl id={noteId} watching={watching} state={notesState} why={why} />,
          expected: <ExpectedNote id={noteId} note={expected} by={null} state={notesState} why={why} />,
        }}
      />
    );
  }

  const listed = view === 'issues' ? issues.length : items.length;
  const stateCode =
    view === 'pages'
      ? hourly.state === 'error'
        ? BR.feed.failed
        : hourly.state === 'no-signal'
          ? BR.feed.noSignal
          : !heardPages.length
            ? pipe.untrusted
              ? BR.feed.noSignal
              : BR.feed.empty
            : BR.feed.pageRow
      : failures.state === 'error'
        ? BR.feed.failed
        : failures.state === 'no-signal'
          ? BR.feed.noSignal
          : !listed
            ? pipe.untrusted
              ? BR.feed.noSignal
              : BR.feed.empty
            : view === 'issues'
              ? BR.feed.issueRow
              : BR.feed.row;
  const filtered = scope.role !== 'all' || scope.pf !== 'all' || Boolean(scope.page) || Boolean(scope.sc) || Boolean(scope.code);
  // What a "no errors" covers: the pages that reported at all. Named on every empty state, never left to be assumed.
  const silentNote =
    coverage && coverage.silent.length ? (
      <>
        {' '}
        {coverage.heard} of {coverage.total} pages sent any signal; the other {coverage.silent.length} sent nothing, so this zero does not cover them.{' '}
        <Link className="bs-link" href={feedHref(scope, { v: 'pages', e: null, code: null })} data-br={BR.feed.view}>
          See the pages
        </Link>
      </>
    ) : null;
  const viewTabs = (
    <LinkTabs
      label="View"
      current={view}
      tabs={(['issues', 'pages', 'errors'] as const).map((v) => ({
        key: v,
        label: VIEW_LABEL[v],
        href: feedHref(scope, { v, e: null, code: null }),
        br: BR.feed.view,
        count: v === 'issues' ? (failures.state === 'ok' ? issues.length : undefined) : v === 'pages' ? (coverage ? `${coverage.heard}/${coverage.total}` : undefined) : failures.state === 'ok' ? issueItems.length : undefined,
      }))}
    />
  );
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
      {scope.code ? (
        <Link className="bs-pill" href={feedHref(scope, { code: null, e: null, v: 'issues' })} data-br={BR.feed.filter}>
          Issue {scope.code} · back to issues
        </Link>
      ) : null}
    </div>
  );

  return (
    <SpaceRoot br={stateCode}>
      {header}
      <div className="rl-top">
        <SpaceHeader
          eyebrow={`Reliability · ${VIEW_LABEL[view].toLowerCase()} · ${WINDOW_LABEL[scope.w].toLowerCase()}`}
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
            {summary.unknownRole ? ` · ${summary.unknownRole} with the role unknown (no session row was found)` : ''}
          </p>
        </div>
      </div>

      {viewTabs}
      {filters}
      <PipeTruth pipe={pipe}>
        {view === 'pages' ? (
          <span>
            {coverage ? coverageWords(coverage) : 'Pages not read'} {windowWords(scope.w)} · from the hourly store (clubhouse_signal_hourly), every signal counted
          </span>
        ) : (
          <span>
            {all.length} {all.length === 1 ? 'failure' : 'failures'} {windowWords(scope.w)} · {scope.pf === 'all' ? 'every device' : PLATFORM_WORDS[scope.pf]} · from the session store (clubhouse_session_events), every failure kept
            {coverage ? (
              <>
                {' · '}
                <Link className="bs-link" href={feedHref(scope, { v: 'pages', e: null, code: null })} data-br={BR.feed.view}>
                  {coverageWords(coverage).toLowerCase()}
                </Link>
              </>
            ) : null}
          </span>
        )}
        {view === 'pages' && 'truncated' in hourly && hourly.truncated ? <Pill tone="watch">More signals than one read keeps: the oldest hours are not counted</Pill> : null}
        {view !== 'pages' && hourly.state === 'error' ? <Pill tone="watch">Which pages reported could not be read</Pill> : null}
        {failures.truncated ? <Pill tone="watch">More failures than one read keeps: the oldest are not shown</Pill> : null}
        {!baselineComplete ? <Pill tone="watch">New in this release: unknown (the 8-day history could not be read whole), so nothing is marked new</Pill> : null}
        {notes.state === 'error' ? <p className="bs-panel-note bs-tone-watch" style={{ margin: 0 }}>The Bridge notes could not be read: nothing shows as Expected or Watching.</p> : null}
        <span data-br={BR.feed.copy}>
          <CopyReportButton
            report={
              view === 'issues'
                ? issuesReport(issues, { windowLabel: WINDOW_LABEL[scope.w], pipeLabel: pipe.label })
                : view === 'pages'
                  ? pagesReport(health, { windowLabel: WINDOW_LABEL[scope.w], pipeLabel: pipe.label })
                  : feedReport(items, summary, scope.w, pipe.label)
            }
            variant="labeled"
            size="sm"
            label="Copy report"
            className="bs-copy"
          />
        </span>
        <span className="rl-keys-hint" aria-hidden="true">
          <kbd>j</kbd> <kbd>k</kbd> to move · <kbd>Enter</kbd> to open
        </span>
      </PipeTruth>
      <FeedKeys />

      {view === 'pages' ? (
        hourly.state === 'error' ? (
          <ReadFailed br={BR.feed.failed} what="The pages" why={hourly.error} action="admin.spaces.reliability.feed" />
        ) : hourly.state === 'no-signal' ? (
          <SignalNotThere br={BR.feed.noSignal} why={`The hourly store is not there yet, so no page can be read (${pipe.label}).`} />
        ) : (
          <>
            {heardPages.length ? (
              <PageList pages={heardPages} scope={scope} frame={frame} />
            ) : (
              <SpaceState br={pipe.untrusted ? BR.feed.noSignal : BR.feed.empty} title={`No page sent a signal ${windowWords(scope.w)}.`}>
                {pipe.label}. With nothing arriving, no page can be called healthy.
              </SpaceState>
            )}
            <SilentPages names={coverage?.silent ?? []} windowWords={windowWords(scope.w)} />
          </>
        )
      ) : failures.state === 'error' ? (
        <ReadFailed br={BR.feed.failed} what="The failures" why={failures.errors[0]} action="admin.spaces.reliability.feed" />
      ) : failures.state === 'no-signal' ? (
        <SignalNotThere br={BR.feed.noSignal} why={`The session store is not there yet, so no error can be listed (${pipe.label}).`} />
      ) : !listed ? (
        pipe.untrusted ? (
          <SpaceState br={BR.feed.noSignal} title={`No errors arrived ${windowWords(scope.w)}, but the pipe cannot vouch for it.`}>
            {pipe.label}. Until signals arrive, an empty feed is not an all clear.{silentNote}
          </SpaceState>
        ) : (
          <SpaceState br={BR.feed.empty} title={`No one saw an error ${windowWords(scope.w)}${filtered ? ' in this filter' : ''}.`}>
            The pipe is live, so this is a real zero for the pages that reported. Widen the window or clear a filter to see older errors.{silentNote}
          </SpaceState>
        )
      ) : view === 'issues' ? (
        <>
          {pipe.untrusted ? (
            <div className="bs-panel bs-panel-pad bs-wash-watch" role="status">
              <span className="bs-tone-watch" style={{ fontWeight: 600 }}>The pipe is not live ({pipe.label}).</span> These issues are real, but newer failures may be missing.
            </div>
          ) : null}
          <IssueList issues={issues} scope={scope} frame={frame} />
        </>
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
