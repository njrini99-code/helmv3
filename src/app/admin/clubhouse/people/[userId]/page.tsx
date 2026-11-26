import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { EmptyState } from '@/components/fairway';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  PLATFORM_WORDS,
  bridgeFieldsOf,
  failedActions,
  failingCodes,
  liveHref,
  parseLiveScope,
  sessionMinutes,
  shortId,
  withLive,
} from '@/lib/admin/clubhouse/live-model';
import { readAdminBridgeRows, readPeopleNames, readPipe, readSessionEvents, readSessions, readTeamName } from '@/lib/admin/clubhouse/live';
import { actionIdFor } from '@/lib/admin/clubhouse/pulse';
import { clubhouseHref, markdownTable, type SearchParams } from '@/lib/admin/clubhouse/screens';
import { ClubhouseFrame, GraphUnavailable, NoSignal, PendingControl, Section } from '../../_components/frame';
import { GRAPH_SOURCE, readClubhouse } from '../../_components/load';
import { Fact, LiveFailed } from '../../_components/live';
import { LocalTime } from '../../../_components/LocalTime';

export const metadata: Metadata = { title: 'Person' };

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_MS = 30 * 24 * 3_600_000;

const linkButton =
  'inline-flex min-h-9 items-center rounded-fw-sm border border-border-control px-3 text-caption font-medium text-text-secondary hover:border-border-strong hover:text-text-primary';

/**
 * B08, a person (plan §8): how Clubhouse is treating this coach or player. Their name is read live, for the super
 * admin who opened the page (D7); the Copy report stays pseudonymous.
 */
export default async function ClubhousePersonPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const { userId: raw } = await params;
  const userId = decodeURIComponent(raw);
  const sp = (await searchParams) ?? {};
  const read = readClubhouse(sp);
  if (!read) return <GraphUnavailable code={BR.people.failed} title="Person" retryHref={liveHref.person(userId)} />;
  const { graph, scope, pages } = read;
  const live = parseLiveScope(sp);
  if (!UUID.test(userId)) {
    return (
      <div data-br={BR.people.empty}>
        <EmptyState variant="search" title="Not a user id" description="A person's page opens from a session, an incident or ⌘K." />
      </div>
    );
  }

  const [pipe, sessions, names, incidents] = await Promise.all([
    readPipe(),
    readSessions({ userId, limit: 20 }),
    readPeopleNames([userId]),
    readAdminBridgeRows({ userId, sinceIso: new Date(Date.now() - MONTH_MS).toISOString(), limit: 100 }),
  ]);
  const events = await readSessionEvents(sessions.data.filter((s) => s.failure_count > 0).map((s) => s.session_id));
  const person = names.get(userId);
  const latest = sessions.data[0];
  const teamName = latest?.team_id ? await readTeamName(latest.team_id) : null;
  const codes = failingCodes(events.data);
  const actions = failedActions(events.data);
  const open = [...new Map(incidents.data.filter((r) => r.resolved !== true && typeof r.fingerprint === 'string').map((r) => [r.fingerprint as string, r])).values()].slice(0, 10);
  const devices = [...new Set(sessions.data.map((s) => PLATFORM_WORDS[s.platform] ?? s.platform))];
  const releases = [...new Set(sessions.data.map((s) => s.release.slice(0, 7)))];

  const report = [
    `# Clubhouse person ${shortId(userId)}`,
    '',
    `${latest?.role ?? 'unknown role'} · ${devices.join(', ') || 'no device yet'} · ${sessions.data.length} recent sessions`,
    '',
    markdownTable(['Code', 'Page', 'Times', 'Sessions'], codes.map((c) => [c.code, c.page, String(c.count), String(c.sessions)])),
  ].join('\n');

  return (
    <ClubhouseFrame
      title={person?.name ?? person?.email ?? shortId(userId)}
      question="How is Clubhouse treating this person?"
      graph={graph}
      scope={scope}
      pages={pages}
      noSignalCode={BR.people.noSignal}
      copyCode={BR.people.copy}
      report={report}
      showScope={false}
      live={{ pipe, scope: live, truncated: events.truncated }}
      sources={['clubhouse_sessions and clubhouse_session_events', 'admin_events (their incidents, 30 days)', 'users, golf_coaches, golf_players (the name, read live)', GRAPH_SOURCE]}
      actions={
        <>
          <Link href={`/admin/users/${encodeURIComponent(userId)}`} data-br={BR.people.account} className={linkButton}>
            Account
          </Link>
          <Link href={`/admin/users/${encodeURIComponent(userId)}/view-as`} data-br={BR.people.viewAs} className={linkButton}>
            View as (read-only)
          </Link>
          <PendingControl code={BR.people.pack} label="Context pack" arrives="Context packs arrive with the Duet desk (B13, PR 4)." />
        </>
      }
    >
      {sessions.state === 'no-signal' ? (
        <NoSignal code={BR.people.noSignal} what="Their sessions, the codes they hit and the actions that failed for them" />
      ) : sessions.state === 'error' ? (
        <LiveFailed code={BR.people.failed} label="Their sessions" error={sessions.error} retryHref={withLive(liveHref.person(userId), scope, live)} />
      ) : (
        <>
          <Section title="Who" description={person?.email && person.name ? person.email : undefined}>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fact label="Role" value={latest?.role ?? '—'} />
              <Fact
                label="Team"
                value={
                  latest?.team_id ? (
                    <Link href={withLive(liveHref.team(latest.team_id), scope, live)} className="text-accent-ink hover:underline">
                      {teamName ?? shortId(latest.team_id)}
                    </Link>
                  ) : (
                    '—'
                  )
                }
              />
              <Fact label="Devices" value={devices.join(', ') || '—'} />
              <Fact label="Releases" value={releases.join(', ') || '—'} />
            </dl>
          </Section>

          <Section title="Last 20 sessions">
            {sessions.data.length ? (
              <ul className="divide-y divide-border-subtle">
                {sessions.data.map((s) => (
                  <li key={s.session_id}>
                    <Link href={withLive(liveHref.session(s.session_id), scope, live)} data-br={BR.people.sessionRow} className="flex flex-wrap justify-between gap-x-3 px-1 py-2 hover:bg-surface-sunken">
                      <span className="font-fw-mono text-caption text-text-primary">
                        <LocalTime iso={s.last_at} /> · {PLATFORM_WORDS[s.platform] ?? s.platform}
                      </span>
                      <span className={`font-fw-mono text-caption tabular-nums ${s.failure_count ? 'font-semibold text-fw-danger-ink' : 'text-text-tertiary'}`}>
                        {sessionMinutes(s)} min · {s.failure_count} failed
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p data-br={BR.people.empty} className="text-body-sm text-text-secondary">No Clubhouse session from this person in the last 30 days.</p>
            )}
          </Section>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Section title="Codes they hit most">
              {codes.length ? (
                <ul className="divide-y divide-border-subtle">
                  {codes.map((c) => (
                    <li key={c.code}>
                      <Link href={withLive(clubhouseHref.code(graph.chIndex[c.code] ?? c.code), scope, live)} data-br={BR.people.codeRow} className="flex justify-between gap-x-3 px-1 py-2 font-fw-mono text-caption tabular-nums hover:bg-surface-sunken">
                        <span className="text-text-primary">{c.code} <span className="text-text-tertiary">{c.page}</span></span>
                        <span className="text-text-secondary">×{c.count} in {c.sessions} session{c.sessions === 1 ? '' : 's'}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-text-secondary">No failure in their recent sessions.</p>
              )}
            </Section>
            <Section title="Actions that failed for them">
              {actions.length ? (
                <ul className="divide-y divide-border-subtle">
                  {actions.map((a) => (
                    <li key={a.act}>
                      <Link href={withLive(clubhouseHref.action(actionIdFor(graph, a.act)), scope, live)} className="flex justify-between gap-x-3 px-1 py-2 font-fw-mono text-caption tabular-nums hover:bg-surface-sunken">
                        <span className="break-all text-text-primary">{a.act}</span>
                        <span className="text-text-secondary">×{a.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-text-secondary">None.</p>
              )}
            </Section>
          </div>

          <Section title="Their open incidents" description="Unresolved admin_events rows for this person in the last 30 days.">
            {incidents.state !== 'ok' ? (
              <p className="text-body-sm text-text-secondary">Their incidents could not be read.</p>
            ) : open.length ? (
              <ul className="divide-y divide-border-subtle">
                {open.map((r) => {
                  const b = bridgeFieldsOf(r);
                  return (
                    <li key={r.fingerprint as string}>
                      <Link href={liveHref.incident(r.fingerprint as string)} className="block px-1 py-2 hover:bg-surface-sunken">
                        <span className="block break-words text-body-sm text-text-primary">{String(r.title ?? 'Incident')}</span>
                        <span className="font-fw-mono text-caption text-text-tertiary">
                          {[b?.code, b?.page, b?.platform].filter(Boolean).join(' · ') || 'no Bridge fields'}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-body-sm text-text-secondary">No open incident for this person.</p>
            )}
          </Section>
        </>
      )}
    </ClubhouseFrame>
  );
}
