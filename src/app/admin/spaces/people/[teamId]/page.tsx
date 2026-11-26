import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { clubhouseHref } from '@/lib/admin/clubhouse/screens';
import { enterViewAs } from '@/app/admin/actions/view-as';
import { ViewAsButton } from '@/app/admin/users/[id]/ViewAsButton';
import { readTeamPeople, type TeamPeopleResult } from '@/lib/admin/data/people-space';
import {
  STATE_WORDS,
  TOUCH_WORDS,
  ago,
  parseTeamParams,
  sortPeople,
  type PeopleSort,
  type PersonSummary,
  type TeamTab,
} from '@/lib/admin/data/people-space-model';
import { CopyReportButton } from '../../../_components/CopyReportButton';
import { AreaChart } from '../../_ui/AreaChart';
import { LinkTabs, Panel, RoleBadge, SpaceHeader, SpaceRoot, SpaceState, toneClass } from '../../_ui/ui';
import { ActiveRings, DayStrip, StatePill, TestChip, initials } from '../_parts';

export const metadata: Metadata = { title: 'Team' };

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

const SIGNALS_ON = 'since Clubhouse signals went on (26 Nov 2026)';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayKeyWord = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * B18 One team (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md): who on the team is
 * active, coach and player apart, with their people, the team's timeline and the Clubhouse codes it hit.
 */
export default async function TeamPeoplePage({ params, searchParams }: { params: Promise<{ teamId: string }>; searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const { teamId: raw } = await params;
  // A malformed escape is a missing team, not a 500; ids are stored lowercase, so lookups match whatever case was typed.
  let teamId: string;
  try {
    teamId = decodeURIComponent(raw).toLowerCase();
  } catch {
    notFound();
  }
  const { tab, sort } = parseTeamParams((await searchParams) ?? {});
  const now = new Date();
  const base = `/admin/spaces/people/${encodeURIComponent(teamId)}`;

  let data: TeamPeopleResult | null;
  try {
    data = await readTeamPeople(teamId);
  } catch (e) {
    return (
      <SpaceRoot br={BR.team.failed}>
        <BackLink />
        <SpaceHeader eyebrow="People · one team" title="This team could not be read." />
        <SpaceState br={BR.team.failed} title="The read failed, so nothing here is all clear.">
          {e instanceof Error ? e.message : String(e)}. Reload; if it persists, check error_logs for admin.people-space.
        </SpaceState>
      </SpaceRoot>
    );
  }
  if (!data) notFound();

  const { team, summary, facts } = data;
  const coachWord = team.sport === 'golf' ? 'GolfHelm' : 'BaseballHelm';
  const primary = data.people.find((p) => p.userId === data.viewAsUserId) ?? null;
  const quiet = sortPeople(data.people, 'signin').filter((p) => !p.active7d);
  const busiest = data.chart.values.reduce((best, v, i) => (v > (data.chart.values[best] ?? 0) ? i : best), 0);
  const busiestValue = data.chart.values[busiest] ?? 0;

  const tabs: Array<{ key: TeamTab; label: string; count: number | string }> = [
    { key: 'people', label: 'People', count: summary.people },
    { key: 'activity', label: 'Activity', count: data.timeline.length },
    { key: 'errors', label: 'Errors', count: data.codes.state === 'ok' ? data.codes.rows.length : '—' },
  ];

  return (
    <SpaceRoot br={summary.people === 0 ? BR.team.empty : ''}>
      <nav aria-label="Breadcrumb" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <BackLink />
        <span className="bs-panel-note">
          People / Teams / <span style={{ color: 'var(--bs-ink)' }}>{team.name}</span>
        </span>
      </nav>

      <section className="bp-hero">
        <div style={{ minWidth: 0 }}>
          <SpaceHeader
            eyebrow={`${coachWord}${primary?.name ? ` · coach ${primary.name}` : ''}`}
            badges={
              <>
                {team.isTest ? <TestChip /> : null}
                {data.state ? <StatePill state={data.state} /> : null}
              </>
            }
            title={`${team.name}.`}
            second={summary.people === 0 ? 'Nobody is on this team yet.' : `${summary.active7d} of ${summary.people} active this week.`}
            secondTone={summary.active7d > 0 ? 'good' : 'watch'}
          />
          {summary.people > 0 ? (
            <div className="bp-split">
              <span className="bs-pill bs-wash-coach bs-tone-coach">
                <span className="bs-dot" aria-hidden="true" />
                Coaches {summary.coaches.active7d} of {summary.coaches.total} active
                {summary.coaches.lastSignInAt ? ` · last in ${ago(summary.coaches.lastSignInAt, now)}` : ' · no sign-in recorded'}
              </span>
              <span className="bs-pill bs-wash-player bs-tone-player">
                <span className="bs-dot" aria-hidden="true" />
                Players {summary.players.active7d} of {summary.players.total} active
                {summary.players.noSignIn > 0 ? ` · ${summary.players.noSignIn} with no sign-in recorded` : ''}
              </span>
            </div>
          ) : null}
          <p className="bs-lede">{lede(data, quiet, now)}</p>
          <div className="bp-actions">
            {data.viewAsUserId && process.env.ADMIN_IMPERSONATION_SECRET ? (
              <ViewAsButton onEnter={enterViewAs.bind(null, data.viewAsUserId)} br={BR.team.viewAs} />
            ) : (
              <button type="button" className="bs-button" disabled data-br={BR.team.viewAs} title={data.viewAsUserId ? 'ADMIN_IMPERSONATION_SECRET is not set' : 'This team has no coach to view as'}>
                {data.viewAsUserId ? 'View as: not configured' : 'View as: no coach on the team'}
              </button>
            )}
            <span data-br={BR.team.copy}>
              <CopyReportButton report={teamReport(data, now)} variant="labeled" size="sm" label="Copy team report" />
            </span>
          </div>
        </div>
        {summary.people > 0 ? (
          <div className="bp-rings">
            <ActiveRings today={summary.activeToday} week={summary.active7d} month={summary.active30d} of={summary.people} />
            <div className="bp-ring-legend">
              <span className="bs-eyebrow">Active people</span>
              <div>
                <strong className="bs-tone-watch">
                  {summary.activeToday} / {summary.people}
                </strong>
                <span>today</span>
              </div>
              <div>
                <strong className="bs-tone-good">
                  {summary.active7d} / {summary.people}
                </strong>
                <span>this week</span>
              </div>
              <div>
                <strong className="bs-tone-good">
                  {summary.active30d} / {summary.people}
                </strong>
                <span>in 30 days</span>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {data.degraded.length > 0 ? (
        <Panel tone="watch" br={BR.team.failed} title="Incomplete this load">
          <p className="bs-panel-note" style={{ padding: '0 22px 18px', margin: 0 }}>
            {data.degraded.join(', ')} could not be read, so the numbers below understate what happened. Reload; if it persists, check error_logs for
            admin.people-space.
          </p>
        </Panel>
      ) : null}

      <div className="bp-two">
        <Panel
          title="People active per day · last 30 days"
          note={
            <span style={{ display: 'inline-flex', gap: 14, flexWrap: 'wrap' }}>
              <span className="bs-tone-good">― people active</span>
              <span className="bs-tone-watch">● a {team.sport === 'golf' ? 'round' : 'game'} logged</span>
            </span>
          }
        >
          <div className="bp-chart">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
              <span className="bs-stat-value" style={{ marginTop: 0 }}>
                {busiestValue}
              </span>
              <span className="bs-panel-note">{busiestValue > 0 ? `the busiest day · ${dayKeyWord(data.chart.days[busiest] ?? '')}` : 'nobody active in 30 days'}</span>
            </div>
            <AreaChart
              values={data.chart.values}
              tone="good"
              height={180}
              max={Math.max(2, busiestValue)}
              label={`People active per day over 30 days; busiest ${busiestValue}. Rounds or games on ${data.chart.roundDays.length} days.`}
            />
            <div className="bp-markers" aria-hidden="true">
              {data.chart.roundDays.map((i) => (
                <span key={i} className="bp-marker" style={{ left: `${(i / Math.max(1, data.chart.values.length - 1)) * 100}%` }} />
              ))}
            </div>
            <div className="bs-panel-note" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span>{dayKeyWord(data.chart.days[0] ?? '')}</span>
              <span>{dayKeyWord(data.chart.days[14] ?? '')}</span>
              <span>today</span>
            </div>
          </div>
        </Panel>

        <Panel title="This team · last 30 days">
          <ul className="bp-facts">
            <Fact label={team.sport === 'golf' ? 'Rounds logged' : 'Games logged'} value={facts.rounds30d} sub={`${facts.rounds7d} this week`} />
            <Fact label="Messages sent" value={facts.messages30d} sub={`${facts.messages7d} this week · by this team's people`} />
            <Fact label="Events created" value={facts.events30d} sub={facts.nextEventAt ? `next ${day(facts.nextEventAt)}` : 'none upcoming'} />
            <Fact
              label="CoachHelm insights"
              value={facts.insights30d}
              sub={facts.insights30d === null ? (team.sport === 'golf' ? 'not measured: read failed' : 'golf only') : `${facts.insightsRead ?? 0} read`}
            />
            <Fact label="Errors seen" value={facts.errors30d} sub={facts.errorsToday === null ? 'not measured' : `${facts.errorsToday} today`} bad />
            <Fact
              label="Clubhouse sessions"
              value={facts.clubhouseSessionsToday}
              sub={facts.clubhouseSessionsToday === null ? (team.sport === 'golf' ? 'not measured: read failed' : 'BaseballHelm sends no Clubhouse signals') : `last 24 hours · ${SIGNALS_ON.replace('since ', 'recorded since ')}`}
            />
          </ul>
        </Panel>
      </div>

      <section className="bs-panel">
        <div className="bp-tabsbar">
          <LinkTabs label="Team views" current={tab} tabs={tabs.map((t) => ({ ...t, href: `${base}?tab=${t.key}`, br: BR.team.tab }))} />
          <span className="bs-panel-note">
            {tab === 'people'
              ? `Sorted by ${sort === 'signin' ? 'last sign-in' : sort === 'active' ? 'days active' : 'name'}. Quiet people read in grey.`
              : tab === 'activity'
                ? 'Newest first, each row with the table it came from.'
                : 'Clubhouse codes from failed sessions, 30 days.'}
          </span>
        </div>
        {tab === 'people' ? <PeopleTab data={data} sort={sort} base={base} now={now} /> : null}
        {tab === 'activity' ? <ActivityTab data={data} now={now} /> : null}
        {tab === 'errors' ? <ErrorsTab data={data} /> : null}
      </section>
    </SpaceRoot>
  );
}

function BackLink() {
  return (
    <Link href="/admin/spaces/people" className="bp-back" data-br={BR.team.back}>
      <span aria-hidden="true">‹</span> All teams
    </Link>
  );
}

function Fact({ label, value, sub, bad = false }: { label: string; value: number | null; sub: string; bad?: boolean }) {
  return (
    <li>
      <span>{label}</span>
      <span>
        <strong className={value === null ? 'bs-tone-muted' : bad && value > 0 ? 'bs-tone-bad' : undefined}>{value === null ? '—' : value}</strong>
        <em>{sub}</em>
      </span>
    </li>
  );
}

function lede(data: TeamPeopleResult, quiet: readonly PersonSummary[], now: Date): string {
  const parts: string[] = [];
  const last = data.summary.lastSignIn;
  if (last) parts.push(`Last sign-in ${ago(last.at, now)} by ${last.name ?? (last.role === 'coach' ? 'a coach' : 'a player')} (${last.role}).`);
  else if (data.summary.people > 0) parts.push('No sign-in is recorded for anyone on this team.');
  const roundWord = data.team.sport === 'golf' ? 'round' : 'game';
  parts.push(
    data.facts.rounds7d > 0
      ? `${data.facts.rounds7d} ${roundWord}${data.facts.rounds7d === 1 ? '' : 's'} logged this week.`
      : data.facts.rounds30d > 0
        ? `No ${roundWord} logged this week; ${data.facts.rounds30d} in 30 days.`
        : `No ${roundWord} logged in 30 days.`,
  );
  const named = quiet.slice(0, 3).map((p) => {
    const who = p.name ?? (p.role === 'coach' ? 'a coach' : 'a player');
    if (p.quietDays !== null) return `${who} ${p.quietDays} days`;
    return p.lastSignInAt ? `${who} over 30 days` : `${who} has no sign-in recorded`;
  });
  if (named.length > 0) parts.push(`Quiet this week: ${named.join(', ')}${quiet.length > 3 ? `, and ${quiet.length - 3} more` : ''}.`);
  return parts.join(' ');
}

function SortHead({ label, k, sort, base }: { label: string; k: PeopleSort; sort: PeopleSort; base: string }) {
  return (
    <Link href={`${base}?tab=people&sort=${k}`} className="bp-th-link" aria-current={sort === k ? 'true' : undefined} data-br={BR.team.sortPeople}>
      {label}
      {sort === k ? <span aria-hidden="true"> ↓</span> : null}
    </Link>
  );
}

function PeopleTab({ data, sort, base, now }: { data: TeamPeopleResult; sort: PeopleSort; base: string; now: Date }) {
  if (data.people.length === 0) {
    return (
      <div style={{ padding: '0 22px 22px' }}>
        <SpaceState br={BR.team.empty} title="Nobody is on this team yet.">
          Coaches appear when they are added to the staff, players when they join with the team code.
        </SpaceState>
      </div>
    );
  }
  const people = sortPeople(data.people, sort);
  const golf = data.team.sport === 'golf';
  return (
    <>
      <div className="bs-scroll-x">
        <table className="bs-table bp-people">
          <thead>
            <tr>
              <th scope="col">
                <SortHead label="Person" k="name" sort={sort} base={base} />
              </th>
              <th scope="col">
                <SortHead label="Last sign-in" k="signin" sort={sort} base={base} />
              </th>
              <th scope="col">Last active</th>
              <th scope="col">
                <SortHead label="Days active · 30" k="active" sort={sort} base={base} />
              </th>
              <th scope="col" style={{ textAlign: 'right' }}>
                Rounds
              </th>
              <th scope="col" style={{ textAlign: 'right' }}>
                Messages
              </th>
              <th scope="col" style={{ textAlign: 'right' }}>
                Errors
              </th>
              <th scope="col">Device</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const tone = p.role === 'coach' ? 'coach' : 'player';
              return (
                <tr key={p.userId} className={p.active7d ? undefined : 'bp-quiet'}>
                  <td>
                    <div className="bp-person">
                      <span className={`bp-initials ${toneClass(tone)}`} aria-hidden="true">
                        {initials(p.name)}
                      </span>
                      <div>
                        <Link href={`/admin/users/${p.userId}`} className="bp-pname" style={{ textDecoration: 'none' }} data-br={BR.team.personRow}>
                          {p.name ?? (p.role === 'coach' ? 'Unnamed coach' : 'Unnamed player')}
                        </Link>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                          <RoleBadge role={p.role} />
                          {p.title && p.role === 'coach' ? <span className="bp-sub">{p.title}</span> : null}
                          {!p.active7d ? (
                            <span className="bp-chip-test">{p.quietDays !== null ? `quiet ${p.quietDays} days` : p.lastSignInAt ? 'quiet 30+ days' : 'no sign-in recorded'}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="bp-dimmable" style={{ fontWeight: 600 }}>
                    {p.lastSignInAt ? <time dateTime={p.lastSignInAt}>{ago(p.lastSignInAt, now)}</time> : 'none recorded'}
                  </td>
                  <td className="bp-dimmable">
                    {p.lastActive ? (
                      <>
                        <div>{p.role === 'player' && p.lastActive.kind === 'message' ? 'Active in the app' : TOUCH_WORDS[p.lastActive.kind]}</div>
                        <div className="bp-sub">{ago(p.lastActive.at, now)}</div>
                      </>
                    ) : (
                      <span className="bp-sub">nothing in 30 days</span>
                    )}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <DayStrip days={p.days} label={`${p.daysActive30} of 30 days active`} />
                      <span className="bp-big">{p.daysActive30}</span>
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }} className="bp-dimmable">
                    {p.rounds30d === null ? <span className="bp-sub">team-level</span> : p.rounds30d}
                  </td>
                  <td style={{ textAlign: 'right' }} className="bp-dimmable">
                    {/* Privacy: a player's message count is team-level only (players may be minors). */}
                    {p.role === 'coach' ? p.messages30d : <span className="bp-sub">team only</span>}
                  </td>
                  <td style={{ textAlign: 'right' }} className={p.errors30d === null ? 'bs-tone-muted' : p.errors30d > 0 ? 'bs-tone-bad' : 'bp-dimmable'}>
                    {p.errors30d === null ? '—' : p.errors30d}
                  </td>
                  <td className="bp-dimmable">{p.device ?? <span className="bp-sub">{golf ? 'none yet' : 'not measured'}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="bp-legend bs-panel-note">
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <DayStrip days={['active']} label="" /> signed in or did something that day
        </span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <DayStrip days={['round']} label="" /> logged a {golf ? 'round' : 'game'}
        </span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <DayStrip days={['none']} label="" /> nothing
        </span>
        <span style={{ marginLeft: 'auto' }}>
          {golf
            ? `Device comes from Clubhouse sessions, recorded only ${SIGNALS_ON}.`
            : 'BaseballHelm sends no Clubhouse signals, so device and per-player games are not measured.'}
        </span>
      </div>
    </>
  );
}

function ActivityTab({ data, now }: { data: TeamPeopleResult; now: Date }) {
  if (data.timeline.length === 0) {
    return (
      <div style={{ padding: '0 22px 22px' }}>
        <SpaceState br={BR.team.empty} title="Nothing recorded for this team in 30 days.">
          Sign-ins, {data.team.sport === 'golf' ? 'rounds' : 'games'}, messages, events and Clubhouse sessions all show here as they happen.
        </SpaceState>
      </div>
    );
  }
  return (
    <ul className="bp-timeline">
      {data.timeline.map((item, i) => (
        <li key={`${item.at}-${i}`}>
          <time dateTime={item.at} className="bp-sub">
            {ago(item.at, now)}
          </time>
          <span>
            <span style={{ fontWeight: 600 }}>{item.what}</span>
            {item.who ? (
              <>
                {' · '}
                <span className={item.role ? toneClass(item.role === 'coach' ? 'coach' : 'player') : undefined}>{item.who}</span>
              </>
            ) : null}
          </span>
          <span className="bs-chip">{item.source}</span>
        </li>
      ))}
    </ul>
  );
}

function ErrorsTab({ data }: { data: TeamPeopleResult }) {
  const { codes } = data;
  const pad = { padding: '0 22px 22px' };
  if (codes.state === 'not-golf') {
    return (
      <div style={pad}>
        <SpaceState br={BR.team.noSignal} title="BaseballHelm sends no Clubhouse signals.">
          Clubhouse codes exist only for GolfHelm. This team&rsquo;s {data.facts.errors30d ?? 'unknown number of'} server errors in 30 days are on the error feed.
        </SpaceState>
      </div>
    );
  }
  if (codes.state === 'no-signal') {
    return (
      <div style={pad}>
        <SpaceState br={BR.team.noSignal} title="No Clubhouse signal yet.">
          The session tables are not readable yet, so no code can be shown. This is not all clear.
        </SpaceState>
      </div>
    );
  }
  if (codes.state === 'error') {
    return (
      <div style={pad}>
        <SpaceState br={BR.team.failed} title="Clubhouse sessions could not be read.">
          {codes.error ?? 'The read failed'}. Nothing here means all clear.
        </SpaceState>
      </div>
    );
  }
  if (codes.rows.length === 0) {
    return (
      <div style={pad}>
        <SpaceState br={BR.team.empty} title="No Clubhouse code failed for this team in 30 days.">
          Counted from Clubhouse sessions {SIGNALS_ON}; only sessions with a failure keep their events.
        </SpaceState>
      </div>
    );
  }
  return (
    <>
      <ul className="bp-timeline bp-codes">
        {codes.rows.map((c) => (
          <li key={c.code}>
            <Link href={clubhouseHref.code(c.code)} className="bs-chip" style={{ textDecoration: 'none', justifySelf: 'start' }} data-br={BR.team.errorRow}>
              {c.code}
            </Link>
            <span>
              <span style={{ fontWeight: 600 }}>{c.page || 'page not recorded'}</span>
              <span className="bp-sub">
                {' '}
                · in {c.sessions} {c.sessions === 1 ? 'session' : 'sessions'}
              </span>
            </span>
            <span className="bs-tone-bad" style={{ fontWeight: 600 }}>
              {c.count}×
            </span>
          </li>
        ))}
      </ul>
      <p className="bs-panel-note" style={{ margin: 0, padding: '14px 22px 18px', borderTop: '1px solid var(--bs-line)' }}>
        From {codes.failedSessions} failed {codes.failedSessions === 1 ? 'session' : 'sessions'} {SIGNALS_ON}
        {codes.truncated ? '; the newest 200 sessions only' : ''}. Server errors outside Clubhouse are counted under Errors seen.
      </p>
    </>
  );
}

/** Counts and roles only. A report leaves the screen, so it never names a person (Clubhouse D7). */
function teamReport(data: TeamPeopleResult, now: Date): string {
  const { team, summary, facts } = data;
  const roundWord = team.sport === 'golf' ? 'Rounds' : 'Games';
  return [
    `# ${team.name} (${team.sport}${team.isTest ? ', test/demo' : ''}) · ${now.toISOString().slice(0, 16)}Z`,
    '',
    `State: ${data.state ? STATE_WORDS[data.state] : 'not measured'}. Active this week: ${summary.active7d} of ${summary.people} (today ${summary.activeToday}, 30 days ${summary.active30d}).`,
    `Coaches: ${summary.coaches.active7d} of ${summary.coaches.total} active this week. Players: ${summary.players.active7d} of ${summary.players.total}; ${summary.players.noSignIn} with no sign-in recorded.`,
    `Last sign-in: ${summary.lastSignIn ? `${ago(summary.lastSignIn.at, now)} (${summary.lastSignIn.role})` : 'none recorded'}.`,
    '',
    '| 30 days | Count |',
    '| --- | --- |',
    `| ${roundWord} | ${facts.rounds30d} (${facts.rounds7d} this week) |`,
    `| Messages by the team's people | ${facts.messages30d} |`,
    `| Events created | ${facts.events30d} |`,
    `| CoachHelm insights | ${facts.insights30d ?? 'not measured'} |`,
    `| Errors | ${facts.errors30d ?? 'not measured'} |`,
    '',
    data.codes.state === 'ok' && data.codes.rows.length > 0
      ? ['Clubhouse codes:', ...data.codes.rows.map((c) => `- ${c.code} on ${c.page || 'unknown page'}: ${c.count}x in ${c.sessions} sessions`)].join('\n')
      : `Clubhouse codes: ${data.codes.state === 'ok' ? 'none failed' : data.codes.state}.`,
    data.degraded.length > 0 ? `\nIncomplete: ${data.degraded.join(', ')} could not be read.` : '',
  ].join('\n');
}
