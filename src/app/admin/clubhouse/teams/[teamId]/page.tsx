import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  WINDOW_MS,
  failingCodes,
  liveHref,
  pageWallFromEvents,
  parseLiveScope,
  shortId,
  sortSessions,
  withLive,
} from '@/lib/admin/clubhouse/live-model';
import { readPipe, readSessionEvents, readSessions, readTeamName } from '@/lib/admin/clubhouse/live';
import { clubhouseHref, markdownTable, type SearchParams } from '@/lib/admin/clubhouse/screens';
import { packTargetKey } from '@/lib/admin/clubhouse/pack';
import { ClubhouseFrame, GraphUnavailable, NoSignal, PackLink, Section } from '../../_components/frame';
import { GRAPH_SOURCE, readClubhouse } from '../../_components/load';
import { Fact, LiveFailed } from '../../_components/live';

export const metadata: Metadata = { title: 'Team' };

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * B08, a team (plan §8): the people active, the page wall for this team alone, and its worst codes, for when one team
 * has a bad day that doesn't show in the totals. Hourly counters carry no team, so the wall is read from the team's
 * sessions with a failure. Held features and the season stage are not read here yet: no Bridge table carries them.
 */
export default async function ClubhouseTeamPage({ params, searchParams }: { params: Promise<{ teamId: string }>; searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const { teamId: raw } = await params;
  const teamId = decodeURIComponent(raw);
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.people.failed} title="Team" retryHref={liveHref.team(teamId)} />;
  const { graph, scope, pages } = read;
  const live = parseLiveScope(sp);
  if (!UUID.test(teamId)) {
    return (
      <div data-br={BR.people.empty}>
        <EmptyState variant="search" title="Not a team id" description="A team's page opens from a person, a session or ⌘K." />
      </div>
    );
  }
  const now = Date.now();
  const [pipe, sessions, name] = await Promise.all([
    readPipe(now),
    readSessions({ teamId, sinceIso: new Date(now - WINDOW_MS[live.w]).toISOString(), limit: 500 }),
    readTeamName(teamId),
  ]);
  const events = await readSessionEvents(sessions.data.filter((s) => s.failure_count > 0).map((s) => s.session_id));
  const people = [...new Set(sessions.data.map((s) => s.user_id).filter((u): u is string => Boolean(u)))];
  const wall = pageWallFromEvents(events.data);
  const codes = failingCodes(events.data);
  const failed = sessions.data.filter((s) => s.failure_count > 0).length;

  const report = [
    `# Clubhouse team ${shortId(teamId)}`,
    '',
    `${people.length} people active · ${sessions.data.length} sessions · ${failed} with a failure (${live.w})`,
    '',
    markdownTable(['Code', 'Page', 'Times', 'Sessions'], codes.map((c) => [c.code, c.page, String(c.count), String(c.sessions)])),
  ].join('\n');

  return (
    <ClubhouseFrame
      title={name ?? `Team ${shortId(teamId)}`}
      question="How is Clubhouse treating this team?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.people.noSignal}
      copyCode={BR.people.copy}
      report={report}
      live={{ pipe, scope: live, truncated: sessions.truncated || events.truncated }}
      sources={['clubhouse_sessions and clubhouse_session_events (this team)', 'golf_teams (the name)', GRAPH_SOURCE]}
      actions={
        <>
          <Link href={`/admin/teams/${encodeURIComponent(teamId)}`} data-br={BR.people.account} className="inline-flex min-h-9 items-center rounded-fw-sm border border-border-control px-3 text-caption font-medium text-text-secondary hover:border-border-strong hover:text-text-primary">
            Team account
          </Link>
          <PackLink code={BR.people.pack} target={packTargetKey.team(teamId)} />
        </>
      }
    >
      {sessions.state === 'no-signal' ? (
        <NoSignal code={BR.people.noSignal} what="This team's people, page wall and worst codes" />
      ) : sessions.state === 'error' ? (
        <LiveFailed code={BR.people.failed} label="The team's sessions" error={sessions.error} retryHref={withLive(liveHref.team(teamId), scope, live)} />
      ) : sessions.data.length === 0 ? (
        <div data-br={BR.people.empty}>
          <EmptyState variant="search" title="No Clubhouse session from this team" description="Nobody on this team used Clubhouse in this window. Widen the window." />
        </div>
      ) : (
        <>
          <Section title="This team">
            <dl className="grid grid-cols-3 gap-3">
              <Fact label="People active" value={people.length} />
              <Fact label="Sessions" value={sessions.data.length} />
              <Fact label="With a failure" value={failed} tone={failed ? 'danger' : undefined} />
            </dl>
          </Section>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Section title="Page wall" description="From this team's sessions with a failure.">
              {wall.length ? (
                <ul className="divide-y divide-border-subtle font-fw-mono text-caption tabular-nums">
                  {wall.map((p) => (
                    <li key={p.page}>
                      <Link href={withLive(clubhouseHref.page(p.page), scope, live)} className="flex justify-between gap-x-3 px-1 py-2 hover:bg-surface-sunken">
                        <span className="text-text-primary">{p.page} {graph.pages[p.page as keyof typeof graph.pages]?.name ?? ''}</span>
                        <span className={p.failures ? 'text-fw-danger-ink' : 'text-text-tertiary'}>{p.views} views · {p.failures} failed</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-text-secondary">No session on this team had a failure.</p>
              )}
            </Section>
            <Section title="Worst codes">
              {codes.length ? (
                <ul className="divide-y divide-border-subtle">
                  {codes.map((c) => (
                    <li key={c.code}>
                      <Link href={withLive(clubhouseHref.code(graph.chIndex[c.code] ?? c.code), scope, live)} data-br={BR.people.codeRow} className="flex justify-between gap-x-3 px-1 py-2 font-fw-mono text-caption tabular-nums hover:bg-surface-sunken">
                        <span className="text-text-primary">{c.code} <span className="text-text-tertiary">{c.page}</span></span>
                        <span className="text-text-secondary">×{c.count} in {c.sessions}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-text-secondary">None.</p>
              )}
            </Section>
          </div>
          <Section title="People and their sessions" description="Short ids (D7); open a person to see their name.">
            <ul className="divide-y divide-border-subtle">
              {sortSessions(sessions.data).slice(0, 30).map((s) => (
                <li key={s.session_id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-1 py-2">
                  {s.user_id ? (
                    <Link href={withLive(liveHref.person(s.user_id), scope, live)} className="font-fw-mono text-caption text-accent-ink hover:underline">
                      {shortId(s.user_id)} · {s.role}
                    </Link>
                  ) : (
                    <span className="text-caption text-text-tertiary">signed out</span>
                  )}
                  <Link href={withLive(liveHref.session(s.session_id), scope, live)} data-br={BR.people.sessionRow} className={`font-fw-mono text-caption tabular-nums hover:underline ${s.failure_count ? 'text-fw-danger-ink' : 'text-text-tertiary'}`}>
                    {s.session_id.slice(0, 10)} · {s.failure_count} failed
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </ClubhouseFrame>
  );
}
