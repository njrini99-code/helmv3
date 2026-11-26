import Link from 'next/link';
import { bridgePseudonym } from '@/lib/admin/clubhouse/pseudonym';
import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  PLATFORM_WORDS,
  WINDOW_MS,
  filterSessions,
  liveHref,
  parseLiveScope,
  sessionMinutes,
  shortId,
  sortSessions,
  withLive,
  type LiveScope,
  type SessionRow,
} from '@/lib/admin/clubhouse/live-model';
import { readPipe, readSessionIdsForAction, readSessions } from '@/lib/admin/clubhouse/live';
import { markdownTable, type ClubhouseScope, type SearchParams } from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, LinkChips, NoSignal } from '../_components/frame';
import { GRAPH_SOURCE, readClubhouse } from '../_components/load';
import { LiveFailed } from '../_components/live';
import { LocalTime } from '../../_components/LocalTime';

export const metadata: Metadata = { title: 'Sessions' };

export const dynamic = 'force-dynamic';

function one(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v ? v : null;
}

/**
 * B07 Sessions, the index (plan §8): sessions in the window, the ones with a failure first. People show as short ids
 * (D7): a name is read only when a session or a person is opened. `?act=ACT-…` (B04's "Sessions", BR-0406) keeps the
 * sessions whose events ran that action; only sessions with a failure keep events, so those are the ones it finds.
 */
export default async function ClubhouseSessionsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.sessions.failed} title="Sessions" retryHref={liveHref.sessions()} />;
  const { graph, scope, pages } = read;
  const live = parseLiveScope(sp);
  const failed = one(sp.failed) === '1';
  const release = one(sp.rel);
  const user = one(sp.user);
  const rawAct = one(sp.act)?.toUpperCase() ?? null;
  // Only an action the contract knows: anything else is dropped, never echoed into a query.
  const act = rawAct && graph.actions[rawAct] ? rawAct : null;
  const now = Date.now();
  const sinceIso = new Date(now - WINDOW_MS[live.w]).toISOString();

  const [pipe, sessions, actSessions] = await Promise.all([
    readPipe(now),
    readSessions({ sinceIso, failedOnly: failed || act !== null, release: release ?? undefined, userId: user ?? undefined, limit: 500 }),
    act ? readSessionIdsForAction(act, { sinceIso }) : Promise.resolve(null),
  ]);
  const rows = sortSessions(
    filterSessions(sessions.data, {
      failed,
      role: scope.role === 'all' ? null : scope.role,
      platform: live.pf === 'all' ? null : live.pf,
      page: scope.page,
      release,
      user,
      only: actSessions ? new Set(actSessions.data) : null,
    }),
  );
  const readState = actSessions && actSessions.state !== 'ok' && sessions.state === 'ok' ? actSessions : sessions;
  const keep = { failed: failed ? 1 : null, rel: release, user, act };
  const report = [
    '# Clubhouse sessions',
    '',
    `${rows.length} session${rows.length === 1 ? '' : 's'} (${live.w}${failed ? ', with a failure' : ''}${act ? `, that ran ${act}` : ''}). People and sessions are pseudonyms.`,
    '',
    markdownTable(
      ['Session', 'Person', 'Role', 'Platform', 'Release', 'Minutes', 'Pages', 'Failures'],
      rows.slice(0, 100).map((s) => [bridgePseudonym('session', s.session_id) ?? '', bridgePseudonym('person', s.user_id) ?? 'signed out', s.role, s.platform, s.release.slice(0, 7), String(sessionMinutes(s)), s.pages.join(' '), String(s.failure_count)]),
    ),
  ].join('\n');

  return (
    <ClubhouseFrame
      title="Sessions"
      question="What exactly did this person see, in order?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.sessions.noSignal}
      copyCode={BR.sessions.copy}
      report={report}
      live={{ pipe, scope: live, truncated: sessions.truncated || Boolean(actSessions?.truncated) }}
      sources={['clubhouse_sessions (30 days kept)', GRAPH_SOURCE]}
    >
      <LinkChips
        label="Show"
        code={BR.sessions.filters}
        options={[
          { key: 'all', label: 'All sessions', href: withLive(liveHref.sessions(), scope, live, { ...keep, failed: null }), active: !failed },
          { key: 'failed', label: 'With a failure', href: withLive(liveHref.sessions(), scope, live, { ...keep, failed: 1 }), active: failed },
          ...(release ? [{ key: 'rel', label: `Release ${release.slice(0, 7)} ×`, href: withLive(liveHref.sessions(), scope, live, { ...keep, rel: null }), active: true }] : []),
          ...(user ? [{ key: 'user', label: `Person ${shortId(user)} ×`, href: withLive(liveHref.sessions(), scope, live, { ...keep, user: null }), active: true }] : []),
          ...(act ? [{ key: 'act', label: `Ran ${graph.actions[act]?.label ?? act} ×`, href: withLive(liveHref.sessions(), scope, live, { ...keep, act: null }), active: true }] : []),
        ]}
      />
      {act ? (
        <p className="text-caption text-text-secondary">
          Sessions with a failure whose events ran <span className="font-fw-mono">{act}</span>. Only sessions with a failure keep their events, so a
          session where it simply worked is not listed.
        </p>
      ) : null}
      {readState.state === 'no-signal' ? (
        <NoSignal code={BR.sessions.noSignal} what="Sessions, with their pages, failures and timelines," />
      ) : readState.state === 'error' ? (
        <LiveFailed code={BR.sessions.failed} label="Clubhouse sessions" error={readState.error} retryHref={withLive(liveHref.sessions(), scope, live, keep)} />
      ) : rows.length === 0 ? (
        <div data-br={BR.sessions.empty}>
          <EmptyState
            variant="search"
            title={act ? 'No session with a failure ran it' : failed ? 'No session with a failure' : 'No sessions in this window'}
            description={act ? 'Nobody whose session failed ran this action in this scope and window.' : failed ? 'Nobody hit a failure in this scope and window.' : 'Widen the window or clear the scope.'}
          />
        </div>
      ) : (
        <>
          <SessionsTable rows={rows} scope={scope} live={live} />
          <SessionsCards rows={rows} scope={scope} live={live} />
        </>
      )}
    </ClubhouseFrame>
  );
}

const cell = 'px-3 py-2';

function SessionsTable({ rows, scope, live }: { rows: SessionRow[]; scope: ClubhouseScope; live: LiveScope }) {
  return (
    <div className="hidden overflow-x-auto rounded-fw-md border border-border-subtle bg-surface md:block">
      <table className="w-full min-w-[56rem] text-left text-body-sm">
        <caption className="sr-only">Clubhouse sessions, failures first</caption>
        <thead className="border-b border-border-subtle bg-surface-sunken text-caption uppercase tracking-wide text-text-tertiary">
          <tr>
            <th scope="col" className={`${cell} font-semibold`}>Session</th>
            <th scope="col" className={`${cell} font-semibold`}>Person</th>
            <th scope="col" className={`${cell} font-semibold`}>Role</th>
            <th scope="col" className={`${cell} font-semibold`}>Platform</th>
            <th scope="col" className={`${cell} font-semibold`}>Release</th>
            <th scope="col" className={`${cell} font-semibold`}>Last seen</th>
            <th scope="col" className={`${cell} text-right font-semibold`}>Min</th>
            <th scope="col" className={`${cell} font-semibold`}>Pages</th>
            <th scope="col" className={`${cell} text-right font-semibold`}>Failures</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((s) => (
            <tr key={s.session_id} className="align-top hover:bg-surface-sunken">
              <th scope="row" className={`${cell} font-normal`}>
                <Link href={withLive(liveHref.session(s.session_id), scope, live)} data-br={BR.sessions.row} className="font-fw-mono text-caption text-accent-ink hover:underline">
                  {s.session_id.slice(0, 12)}
                </Link>
              </th>
              <td className={cell}>
                {s.user_id ? (
                  <Link href={withLive(liveHref.person(s.user_id), scope, live)} data-br={BR.sessions.person} className="font-fw-mono text-caption text-accent-ink hover:underline">
                    {shortId(s.user_id)}
                  </Link>
                ) : (
                  <span className="text-caption text-text-tertiary">signed out</span>
                )}
              </td>
              <td className={`${cell} text-text-secondary`}>{s.role}</td>
              <td className={`${cell} text-text-secondary`}>{PLATFORM_WORDS[s.platform] ?? s.platform}</td>
              <td className={`${cell} font-fw-mono text-caption tabular-nums text-text-secondary`}>{s.release.slice(0, 7)}</td>
              <td className={`${cell} text-caption text-text-secondary`}>
                <LocalTime iso={s.last_at} />
              </td>
              <td className={`${cell} text-right font-fw-mono tabular-nums text-text-secondary`}>{sessionMinutes(s)}</td>
              <td className={`${cell} max-w-[14rem] break-words font-fw-mono text-caption text-text-tertiary`}>{s.pages.join(' ')}</td>
              <td className={`${cell} text-right font-fw-mono tabular-nums ${s.failure_count ? 'font-semibold text-fw-danger-ink' : 'text-text-tertiary'}`}>{s.failure_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionsCards({ rows, scope, live }: { rows: SessionRow[]; scope: ClubhouseScope; live: LiveScope }) {
  return (
    <ul className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface md:hidden">
      {rows.map((s) => (
        <li key={s.session_id}>
          <Link
            href={withLive(liveHref.session(s.session_id), scope, live)}
            data-br={BR.sessions.row}
            className="block min-w-0 px-3 py-2.5 active:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500"
          >
            <span className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="font-fw-mono text-caption font-semibold text-text-primary">
                {shortId(s.user_id)} · {s.role}
              </span>
              <span className={`font-fw-mono text-caption tabular-nums ${s.failure_count ? 'font-semibold text-fw-danger-ink' : 'text-text-tertiary'}`}>
                {s.failure_count} failed
              </span>
            </span>
            <span className="mt-0.5 block font-fw-mono text-caption text-text-tertiary">
              {PLATFORM_WORDS[s.platform] ?? s.platform} · {s.release.slice(0, 7)} · {sessionMinutes(s)} min · {s.pages.join(' ')}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
