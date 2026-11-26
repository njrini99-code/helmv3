import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { logServerError } from '@/lib/server-error-logger';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { loadBridgeGraph } from '@/lib/admin/clubhouse/graph-server';
import { buildFeed, feedHref, DEFAULT_FEED, type FeedWindow } from '@/lib/admin/clubhouse/feed';
import { readFailures } from '@/lib/admin/clubhouse/feed-server';
import { readHourly, readPipe } from '@/lib/admin/clubhouse/live';
import { msText } from '@/lib/admin/clubhouse/live-model';
import { EMPTY_NOTES } from '@/lib/admin/clubhouse/notes';
import { INP_LINE_MS, LCP_LINE_MS, SLOW_SAVE_LINE_MS } from '@/lib/admin/clubhouse/rules';
import { clubhouseHref, markdownTable } from '@/lib/admin/clubhouse/screens';
import {
  SPEED_DEVICES,
  SPEED_DEVICE_LABEL,
  SPEED_ROLES,
  SPEED_ROLE_LABEL,
  SPEED_WINDOWS,
  SPEED_WINDOW_LABEL,
  SPEED_WINDOW_MS,
  buttonSpeed,
  dbErrors,
  pageSpeed,
  parseSpeedScope,
  slowestPage,
  speedHref,
  speedItems,
  speedRows,
  switchMeasured,
  type SpeedWindow,
  slowQueries,
} from '@/lib/admin/clubhouse/speed';
import { CopyReportButton } from '@/app/admin/_components/CopyReportButton';
import { fetchQueryPerformance } from '@/lib/admin/database/performance';
import { Meter, Panel, Pill, SpaceHeader, SpaceRoot, SpaceState, Stat, type Tone } from '../../_ui/ui';
import { LinkGroup, ReliabilityTabs, PipeTruth } from '../_components/shared';

export const metadata: Metadata = { title: 'Reliability · Speed' };

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

const FEED_WINDOW_FOR: Record<SpeedWindow, FeedWindow> = { '24h': '24h', '7d': '7d', '30d': '7d' };

function lineTone(ms: number | null, line: number): Tone {
  if (ms === null) return 'muted';
  return ms > line ? 'bad' : ms > line * 0.8 ? 'watch' : 'good';
}

function MeterCell({ ms, line, label }: { ms: number | null; line: number; label: string }) {
  if (ms === null) return <span className="rl-none">not measured yet</span>;
  const tone = lineTone(ms, line);
  return (
    <span className="rl-meter">
      <Meter value={ms} max={line * 2} line={line} tone={tone} label={`${label} ${msText(ms)}, line ${msText(line)}`} />
      <span className={`rl-meter-v bs-tone-${tone}`}>{msText(ms)}</span>
    </span>
  );
}

/**
 * B21 Speed (plan 2026-11-26-bridge-spaces-build.md): how fast it feels for a coach and for a player. Load and tap from
 * the phones' own vitals (p75), switch to first paint from view durations, save time from every button press, and the
 * database errors that came back with failed saves. Field data, not the lab tiers.
 */
export default async function ReliabilitySpeedPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const scope = parseSpeedScope(sp);
  const graph = loadBridgeGraph();
  const now = Date.now();
  const since = new Date(now - SPEED_WINDOW_MS[scope.w]).toISOString();
  const [pipe, hourly, failures, queryPerf] = await Promise.all([
    readPipe(now),
    readHourly({ sinceIso: since, kinds: ['view', 'vital', 'action'] }),
    readFailures(since),
    // Per-query time is the database's own (helm_debug.db_stat_deltas, every 15 minutes), not a Clubhouse signal, so it
    // shows whatever the pipe says. A thrown read is a failed panel, never an empty one.
    fetchQueryPerformance().catch((e: unknown) => ({ status: 'failed' as const, data: null, error: e instanceof Error ? e.message : String(e) })),
  ]);
  const queries = queryPerf.status === 'ok' && queryPerf.data ? slowQueries(queryPerf.data.latest) : null;
  const queriesAt = queryPerf.status === 'ok' && queryPerf.data ? queryPerf.data.latestSampledAt : null;
  if (hourly.state === 'error' || failures.state === 'error') {
    await logServerError('Reliability speed: a read failed', { action: 'admin.spaces.reliability.speed', route: '/admin/spaces/reliability/speed', feature: 'admin_dashboard' });
  }

  const rows = speedRows(hourly.data, scope);
  const pages = graph ? pageSpeed(rows, graph) : [];
  const buttons = graph ? buttonSpeed(rows, graph) : [];
  const items = graph ? speedItems(buildFeed({ graph, events: failures.events, sessions: failures.sessions, teamNames: failures.teamNames, notes: EMPTY_NOTES, fresh: new Set(), release: null }), scope) : [];
  const db = graph ? dbErrors(items, graph) : [];
  const worstLcp = slowestPage(pages, 'lcp');
  const worstInp = slowestPage(pages, 'inp');
  const slowButtons = buttons.filter((b) => b.pastLine).length;
  const dbTotal = failures.state === 'ok' ? db.reduce((a, d) => a + d.total, 0) : null;
  const measuredSwitch = switchMeasured(pages);
  const who = scope.role === 'coach' ? 'coaches' : scope.role === 'player' ? 'players' : 'everyone';

  const report = [
    `# Speed, last ${SPEED_WINDOW_LABEL[scope.w]} · ${SPEED_ROLE_LABEL[scope.role]} · ${SPEED_DEVICE_LABEL[scope.device]}`,
    '',
    `- ${pipe.label}`,
    '',
    markdownTable(
      ['Page', 'Load (LCP p75)', 'Tap (INP p75)', 'Switch to first paint p75', 'Views'],
      pages.map((p) => [`${p.name} (${p.page})`, msText(p.lcp), msText(p.inp), p.switchP75 === null ? 'not measured yet' : msText(p.switchP75), p.views]),
    ),
    '',
    markdownTable(['Button', 'p50', 'p95', 'Tries'], buttons.map((b) => [b.label, msText(b.p50), msText(b.p95), b.tries])),
    '',
    markdownTable(['Server code', 'Words', 'Coach', 'Player', 'Signed out', 'Tables (from the Bridge map)'], db.map((d) => [d.code, d.words, d.coach, d.player, d.signedOut, d.tables.join(', ') || '—'])),
  ].join('\n');

  const stateCode = !graph || hourly.state === 'error' ? BR.speed.failed : hourly.state === 'no-signal' ? BR.speed.noSignal : !rows.length ? (pipe.untrusted ? BR.speed.noSignal : BR.speed.empty) : BR.speed.pageRow;

  return (
    <SpaceRoot br={stateCode}>
      <ReliabilityTabs current="speed" />
      <SpaceHeader
        eyebrow="Reliability · speed and the database"
        title="How fast it feels,"
        second="for a coach and for a player."
        secondTone="ink"
        lede="Load and tap times come from the phones themselves, 75th percentile, split by role and device. Save times come from every button press. Database failures come from the error each failed save carried back."
      />
      <div className="rl-bar">
        <LinkGroup label="Role" br={BR.speed.role} options={SPEED_ROLES.map((r) => ({ key: r, label: SPEED_ROLE_LABEL[r], href: speedHref(scope, { role: r }), active: scope.role === r }))} />
        <LinkGroup label="Device" br={BR.speed.device} options={SPEED_DEVICES.map((d) => ({ key: d, label: SPEED_DEVICE_LABEL[d], href: speedHref(scope, { device: d }), active: scope.device === d }))} />
        <LinkGroup label="Window" br={BR.speed.window} options={SPEED_WINDOWS.map((w) => ({ key: w, label: SPEED_WINDOW_LABEL[w], href: speedHref(scope, { w }), active: scope.w === w }))} />
      </div>
      <PipeTruth pipe={pipe}>
        <span>Field data from real users, last {SPEED_WINDOW_LABEL[scope.w]}; not the W, S and D lab tiers. A p75 reads the upper edge of its bucket, so it can read high.</span>
        {hourly.truncated ? <Pill tone="watch">More hourly rows than one read keeps: the oldest hours are left out</Pill> : null}
        {failures.truncated ? <Pill tone="watch">More failures than one read keeps</Pill> : null}
        <span data-br={BR.speed.copy}>
          <CopyReportButton report={report} variant="labeled" size="sm" label="Copy report" className="bs-copy" />
        </span>
      </PipeTruth>

      {!graph ? (
        <SpaceState br={BR.speed.failed} title="The Bridge map could not be read.">Pages and buttons cannot be named without it.</SpaceState>
      ) : hourly.state === 'error' ? (
        <SpaceState br={BR.speed.failed} title="The speed counters could not be read.">
          Nothing here is an all clear. {hourly.error ?? ''} Reload to try again.
        </SpaceState>
      ) : hourly.state === 'no-signal' ? (
        <SpaceState br={BR.speed.noSignal} title="No signal yet.">
          The hourly counters are not there yet, so nothing can be timed. {pipe.label}.
        </SpaceState>
      ) : !rows.length && pipe.untrusted ? (
        <SpaceState br={BR.speed.noSignal} title={`Nothing was timed for ${who} in this window, and the pipe cannot vouch for it.`}>
          {pipe.label}.
        </SpaceState>
      ) : !rows.length ? (
        <SpaceState br={BR.speed.empty} title={`Nothing was timed for ${who} on ${SPEED_DEVICE_LABEL[scope.device].toLowerCase()} in the last ${SPEED_WINDOW_LABEL[scope.w]}.`}>
          Try another device or a longer window.
        </SpaceState>
      ) : (
        <>
          <div className="bs-grid bs-grid-stats">
            <Stat label="Slowest page to open" value={worstLcp ? msText(worstLcp.lcp) : null} sub={worstLcp ? `${worstLcp.name} · load p75` : undefined} tone={lineTone(worstLcp?.lcp ?? null, LCP_LINE_MS)} />
            <Stat label="Slowest tap response" value={worstInp ? msText(worstInp.inp) : null} sub={worstInp ? `${worstInp.name} · tap p75` : undefined} tone={lineTone(worstInp?.inp ?? null, INP_LINE_MS)} />
            <Stat
              label={`Buttons past ${msText(SLOW_SAVE_LINE_MS)}`}
              value={buttons.length ? slowButtons : null}
              sub={slowButtons ? `p95 past the slow-save line, of ${buttons.length} timed` : `none of ${buttons.length} timed`}
              tone={slowButtons ? 'watch' : 'good'}
            />
            <Stat
              label="Database errors"
              value={dbTotal}
              sub={dbTotal === null ? undefined : `failed saves that carried a server code, ${who}`}
              tone={dbTotal ? 'bad' : 'good'}
            />
          </div>

          <Panel
            title={`Every page · ${who}`}
            note={`Load = opening the page cold (LCP). Tap = the slowest response to a tap (INP). The line is where R-12 raises it on iPhone. Switch to first paint = from an in-app link or Back to the new page's first paint.`}
          >
            <div className="bs-scroll-x">
              <table className="bs-table bs-table-stack rl-speed-table">
                <thead>
                  <tr>
                    <th scope="col">Page</th>
                    <th scope="col">Load · line {msText(LCP_LINE_MS)}</th>
                    <th scope="col">Tap · line {msText(INP_LINE_MS)}</th>
                    <th scope="col">Switch to first paint</th>
                    <th scope="col" className="bs-num">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => (
                    <tr key={p.page}>
                      <td className="bs-cell-head rl-c-page">
                        <Link href={clubhouseHref.page(p.page)} className="bs-link" data-br={BR.speed.pageRow}>
                          {p.name}
                        </Link>{' '}
                        <span className="bs-mono bs-tone-muted">{p.page}</span>
                      </td>
                      <td className="bs-cell-wide rl-c-meter">
                        <span className="bs-cell-label">Load · line {msText(LCP_LINE_MS)}</span>
                        <MeterCell ms={p.lcp} line={LCP_LINE_MS} label="Load p75" />
                      </td>
                      <td className="bs-cell-wide rl-c-meter">
                        <span className="bs-cell-label">Tap · line {msText(INP_LINE_MS)}</span>
                        <MeterCell ms={p.inp} line={INP_LINE_MS} label="Tap p75" />
                      </td>
                      <td className="bs-cell-half rl-c-switch">
                        <span className="bs-cell-label">Switch to first paint</span>
                        {p.switchP75 === null ? (
                          <span className="rl-none">not measured yet</span>
                        ) : (
                          <span>
                            <b>{msText(p.switchP75)}</b> <span className="bs-tone-muted" style={{ fontSize: 12 }}>p75 of {p.switchSamples}</span>
                          </span>
                        )}
                      </td>
                      <td className="bs-cell-half bs-num">
                        <span className="bs-cell-label">Views</span>
                        {p.views}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="bs-panel-note" style={{ padding: '12px 22px 18px', margin: 0 }}>
              {measuredSwitch
                ? 'Switch times come from views that carried one; the first page of a session and a page opened from code carry none.'
                : 'No view has carried a switch time yet, so it reads "not measured yet" (never 0). It starts once the app release that sends it is live.'}{' '}
              Everyone merges every view and vital, coaches, players and signed out together; it is not the slower of two roles.
            </p>
          </Panel>

          <div className="bs-grid bs-grid-wide">
            <Panel title={`Save time per button · ${who}`} note={`From press to done: typical (p50) and slow (p95, 1 in 20). The line is the slow-save line, ${msText(SLOW_SAVE_LINE_MS)}.`}>
              {buttons.length ? (
                <div>
                  {buttons.map((b) => (
                    <div key={b.act} className="bs-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px' }}>
                      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                        {b.actionId ? (
                          <Link href={clubhouseHref.action(b.actionId)} className="bs-link" data-br={BR.speed.actionRow}>
                            {b.label}
                          </Link>
                        ) : (
                          <span style={{ fontWeight: 600 }} data-br={BR.speed.actionRow}>
                            {b.label}
                          </span>
                        )}
                        <div className="bs-panel-note">
                          {graph.pages[b.page as keyof typeof graph.pages]?.name ?? b.page} · {b.tries} {b.tries === 1 ? 'press' : 'presses'}
                        </div>
                      </div>
                      <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <MeterCell ms={b.p50} line={SLOW_SAVE_LINE_MS} label="p50" />
                        <MeterCell ms={b.p95} line={SLOW_SAVE_LINE_MS} label="p95" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="bs-panel-note" style={{ padding: '0 22px 20px' }}>No button finished with a time in this window.</p>
              )}
            </Panel>

            <Panel title={`Database errors · ${who}`} note="The Postgres or PostgREST code inside each failed save, in plain words. Tables are from the Bridge map: the error does not store them.">
              {failures.state !== 'ok' ? (
                <p className="bs-panel-note" style={{ padding: '0 22px 20px' }} data-br={failures.state === 'error' ? BR.speed.failed : BR.speed.noSignal}>
                  {failures.state === 'error' ? 'The failures could not be read, so database errors are not counted here.' : 'The session store is not there yet.'}
                </p>
              ) : db.length ? (
                <div>
                  {db.map((d) => (
                    <Link
                      key={d.code}
                      href={feedHref({ ...DEFAULT_FEED, w: FEED_WINDOW_FOR[scope.w], role: scope.role, pf: scope.device }, { sc: d.code })}
                      className="rl-db"
                      data-br={BR.speed.dbRow}
                    >
                      <span className="bs-chip" style={{ justifySelf: 'start' }}>
                        {d.code}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <b>{d.words}</b>
                        <span className="bs-panel-note" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                          {d.tables.length ? `${d.tables.join(', ')} · ` : ''}
                          {d.actions.length ? d.actions.join(', ') : d.pages.join(', ')}
                        </span>
                      </span>
                      <span>
                        <span className="rl-db-n bs-tone-bad" style={{ display: 'block' }}>{d.total}</span>
                        <span className="rl-db-split">
                          <span className="bs-tone-coach">coach {d.coach}</span>
                          <span className="bs-tone-player">player {d.player}</span>
                          {d.signedOut ? <span className="bs-tone-muted">signed out {d.signedOut}</span> : null}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="bs-panel-note" style={{ padding: '0 22px 20px' }}>
                  {pipe.untrusted ? `No failed save carried a server code, but the pipe cannot vouch for it (${pipe.label}).` : 'No failed save carried a server code in this window.'}
                </p>
              )}
            </Panel>
          </div>
        </>
      )}

      <Panel
        title="Slowest database queries"
        note={`The app's own requests in the latest 15-minute window, by mean time per call. The collector never keeps query text, so each query is named by its Postgres id; open the Database tab's performance view to see it beside its history${queriesAt ? ` · sampled ${new Date(queriesAt).toISOString().slice(11, 16)} UTC` : ''}. Not split by coach and player: the database does not know who asked.`}
      >
        {queryPerf.status === 'unconfigured' ? (
          <p className="bs-panel-note" style={{ padding: '0 22px 20px' }} data-br={BR.speed.noSignal}>
            Not measured: the per-query collector is not set up on this database.
          </p>
        ) : queryPerf.status !== 'ok' ? (
          <p className="bs-panel-note" style={{ padding: '0 22px 20px' }} data-br={BR.speed.failed}>
            The query timings could not be read, so no query is shown as fast or slow.
          </p>
        ) : queries && queries.length ? (
          <div>
            {queries.map((q) => (
              <Link key={q.queryid} href="/admin/database?view=performance" className="rl-db" data-br={BR.speed.queryRow}>
                <span className="bs-chip" style={{ justifySelf: 'start' }}>
                  {q.regressed ? 'slower' : 'query'}
                </span>
                <span style={{ minWidth: 0 }}>
                  <b className="bs-mono">{q.label}</b>
                  <span className="bs-panel-note" style={{ display: 'block' }}>
                    app request · {q.calls !== null ? `${q.calls} calls` : 'calls not counted'}
                    {q.maxMs !== null ? ` · slowest ${msText(q.maxMs)}` : ''}
                  </span>
                </span>
                <span className={`rl-db-n ${q.meanMs > 500 ? 'bs-tone-bad' : q.meanMs > 100 ? 'bs-tone-watch' : 'bs-tone-good'}`}>{msText(q.meanMs)}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="bs-panel-note" style={{ padding: '0 22px 20px' }}>No timed app query in the latest window yet.</p>
        )}
      </Panel>
    </SpaceRoot>
  );
}
