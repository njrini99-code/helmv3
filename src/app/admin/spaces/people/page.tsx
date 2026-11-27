import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { readTeamsActivity, type TeamsActivityResult } from '@/lib/admin/data/people-space';
import {
  STATE_WORDS,
  ago,
  filterTeams,
  needsCards,
  parseTeamsParams,
  sortTeams,
  stateCounts,
  teamsHeadline,
  teamsHref,
  type NeedsCard,
  type TeamActivityRow,
  type TeamState,
  type TeamsParams,
} from '@/lib/admin/data/people-space-model';
import { CopyReportButton } from '../../_components/CopyReportButton';
import { Panel, SpaceHeader, SpaceRoot, SpaceState, toneClass } from '../_ui/ui';
import { Incomplete, ReadFailed, listWords } from '../_ui/states';
import { Ring, SignedIn, Spark, SportChip, StatePill, STATE_TONE, TestChip } from './_parts';

export const metadata: Metadata = { title: 'People' };

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

const SORT_LABEL: Record<TeamsParams['sort'], string> = { active: 'Most active', seen: 'Last seen', attention: 'Needs attention', errors: 'Errors' };
const STATE_SUB: Record<TeamState, string> = { active: 'last 2 days', slipping: '3 to 14 days', dormant: '14+ days', never: 'nothing recorded' };

/**
 * B17 People: every team by activity (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md).
 * State, the 30-day line and errors come from Teams pulse (pulse-grid.ts); who is active this week, by role, and who
 * signed in last are rebuilt per person by people-space.ts.
 */
export default async function PeopleSpacePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin();
  const params = parseTeamsParams((await searchParams) ?? {});
  const now = new Date();

  let result: TeamsActivityResult;
  try {
    result = await readTeamsActivity();
  } catch (e) {
    return (
      <SpaceRoot br={BR.teams.failed}>
        <SpaceHeader eyebrow="People · teams by activity" title="Teams could not be read." />
        <ReadFailed br={BR.teams.failed} what="The teams" why={e instanceof Error ? e.message : String(e)} action="admin.people-space" />
      </SpaceRoot>
    );
  }

  if (result.rows.length === 0) {
    const failed = result.degraded.length > 0;
    return (
      <SpaceRoot br={failed ? BR.teams.failed : BR.teams.empty}>
        <SpaceHeader eyebrow="People · teams by activity" title={failed ? 'Teams could not be read.' : 'No teams yet.'} />
        {failed ? (
          <ReadFailed br={BR.teams.failed} what="The teams" why={`${listWords(result.degraded)} failed`} action="admin.people-space" />
        ) : (
          <SpaceState br={BR.teams.empty} title="No golf or baseball team exists yet.">
            A team appears here as soon as a coach creates one.
          </SpaceState>
        )}
      </SpaceRoot>
    );
  }

  const all = result.rows;
  const shown = sortTeams(filterTeams(all, params), params.sort);
  const rosterDown = rosterDownSports(result.degraded);
  const headline = teamsHeadline(shown);
  const counts = stateCounts(shown);
  const cards = needsCards(shown);
  const bySport = (s: 'golf' | 'baseball') => filterTeams(all, { sport: s, hideTest: params.hideTest }).length;
  const dateWord = now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <SpaceRoot br={shown.length === 0 ? BR.teams.empty : ''}>
      <SpaceHeader
        eyebrow={`People · teams by activity · ${dateWord}`}
        title={headline.title}
        second={headline.second}
        secondTone="watch"
        lede={headline.lede}
        aside={<StateStrip counts={counts} rows={shown} />}
      />

      <Incomplete br={BR.teams.failed} sources={result.degraded} action="admin.people-space" />

      {cards.length > 0 ? (
        <section className="bp-needs" aria-label="Teams that need you">
          {cards.map((c) => (
            <NeedsCardView key={c.kind} card={c} now={now} />
          ))}
        </section>
      ) : null}

      <Panel
        title="Every team · ranked"
        note={`Showing ${shown.length} of ${all.length} teams · ${bySport('golf')} GolfHelm, ${bySport('baseball')} BaseballHelm · open a team for its people`}
      >
        <div className="bp-controls">
          <nav aria-label="Sport" className="bs-tabs">
            {(['all', 'golf', 'baseball'] as const).map((s) => (
              <Link key={s} href={teamsHref(params, { sport: s })} className="bs-tab" aria-current={params.sport === s ? 'page' : undefined} data-br={BR.teams.sport}>
                {s === 'all' ? 'All' : s === 'golf' ? 'GolfHelm' : 'BaseballHelm'}
              </Link>
            ))}
          </nav>
          <nav aria-label="Sort" className="bs-tabs">
            {(['active', 'seen', 'attention', 'errors'] as const).map((s) => (
              <Link key={s} href={teamsHref(params, { sort: s })} className="bs-tab" aria-current={params.sort === s ? 'page' : undefined} data-br={BR.teams.sort}>
                {SORT_LABEL[s]}
              </Link>
            ))}
          </nav>
          <Link href={teamsHref(params, { hideTest: !params.hideTest })} className="bp-toggle" aria-pressed={params.hideTest} data-br={BR.teams.hideTest}>
            {params.hideTest ? 'Show test and demo' : 'Hide test and demo'}
          </Link>
          <span data-br={BR.teams.copy} className="bp-copy-slot">
            <CopyReportButton report={teamsReport(shown, now)} variant="labeled" size="sm" label="Copy team list" className="bs-copy" />
          </span>
        </div>

        {shown.length === 0 ? (
          <div style={{ padding: '0 22px 22px' }}>
            <SpaceState br={BR.teams.empty} title="No team matches these filters.">
              <Link className="bs-link" href={teamsHref(params, { sport: 'all', hideTest: false })}>
                Show every team
              </Link>
            </SpaceState>
          </div>
        ) : (
          <div className="bs-stack-scope">
            <div className="bp-list-head" aria-hidden="true">
              <span>#</span>
              <span>Team</span>
              <span>Active this week</span>
              <span>Last sign-in</span>
              <span>Activity · 30 days</span>
              <span className="bp-num">Rounds · 30d</span>
              <span className="bp-num">Errors</span>
              <span>State</span>
            </div>
            {shown.map((row, i) => (
              <TeamRow key={row.teamId} row={row} rank={i + 1} now={now} rosterFailed={rosterDown.has(row.sport)} />
            ))}
          </div>
        )}
        <p className="bs-panel-note" style={{ margin: 0, padding: '14px 22px 20px', borderTop: '1px solid var(--bs-line)', lineHeight: 1.5 }}>
          State follows Teams pulse: <strong>active</strong> means the team did something in the last 2 days, <strong>slipping</strong> 3 to 14 days,{' '}
          <strong>dormant</strong> silent 14 days or more after some activity, <strong>never started</strong> nothing ever recorded. Active this week counts
          people (coaches and players) with a recorded sign-in, round, game, event, message or Clubhouse session in the last 7 days, rebuilt from those
          timestamps. Sign-ins are the ones Helm records (admin_events), so older ones may be missing. Errors are Teams pulse&rsquo;s 30-day count.
        </p>
      </Panel>
    </SpaceRoot>
  );
}

function StateStrip({ counts, rows }: { counts: Record<TeamState, number>; rows: readonly TeamActivityRow[] }) {
  const order: TeamState[] = ['active', 'slipping', 'dormant', 'never'];
  const blocks = [...rows].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
  return (
    <div className="bs-panel bp-strip-panel">
      <div className="bp-states">
        {order.map((s) => (
          <div key={s} className="bp-state">
            <span className={`bs-eyebrow ${toneClass(STATE_TONE[s])}`}>{STATE_WORDS[s].charAt(0).toUpperCase() + STATE_WORDS[s].slice(1)}</span>
            <span className={`bp-state-n ${toneClass(s === 'never' || s === 'dormant' ? 'ink' : STATE_TONE[s])}`}>{counts[s]}</span>
            <span className="bp-state-sub">{STATE_SUB[s]}</span>
          </div>
        ))}
      </div>
      <div className="bp-blocks" role="img" aria-label={`One block per team: ${counts.active} active, ${counts.slipping} slipping, ${counts.dormant} dormant, ${counts.never} never started`}>
        {blocks.map((r) => (
          <span key={r.teamId} className={`bp-block ${toneClass(STATE_TONE[r.state])}`} data-state={r.state} />
        ))}
      </div>
    </div>
  );
}

function NeedsCardView({ card, now }: { card: NeedsCard; now: Date }) {
  const { row } = card;
  const view = (() => {
    switch (card.kind) {
      case 'errors-slipping':
        return {
          title: 'Errors and slipping',
          tone: 'bad' as const,
          n: String(row.errors30d),
          unit: 'errors in 30 days',
          body: `No activity for ${row.daysSinceActivity ?? 'over 14'} days. ${row.active30d} of ${row.people} people were active this month; last sign-in ${ago(row.lastSignIn?.at ?? null, now) ?? 'not recorded'}${row.lastSignIn ? ` by ${row.lastSignIn.role === 'coach' ? 'a coach' : 'a player'}` : ''}.`,
        };
      case 'went-quiet':
        return {
          title: 'Went quiet',
          tone: 'watch' as const,
          n: row.daysSinceActivity === null ? '30+' : String(row.daysSinceActivity),
          unit: 'days since the team did anything',
          body: `The biggest quiet roster: ${row.players} ${row.players === 1 ? 'player' : 'players'} and ${row.coaches} ${row.coaches === 1 ? 'coach' : 'coaches'}. ${row.rounds30d} ${row.sport === 'golf' ? 'rounds' : 'games'} in 30 days; last sign-in ${ago(row.lastSignIn?.at ?? null, now) ?? 'not recorded'}.`,
        };
      case 'staff-only':
      default:
        return {
          title: `${row.isTest ? 'Test team · ' : ''}Staff only`,
          tone: 'watch' as const,
          n: `0 / ${row.players}`,
          unit: 'players active this week',
          body: `It reads as active only because ${row.coachesActive7d} ${row.coachesActive7d === 1 ? 'coach' : 'coaches'} signed in or did something this week. ${row.active30d === row.coachesActive7d ? 'No player was active in 30 days either.' : ''}`.trim(),
        };
    }
  })();
  return (
    <Link href={row.href} className={`bs-panel bs-card-link bp-need bs-wash-${view.tone}`} data-br={BR.teams.needsCard}>
      <span className={`bs-eyebrow ${toneClass(view.tone)}`}>{view.title}</span>
      <span className="bp-need-team">{row.name}</span>
      <span className="bp-need-n">
        <strong className={toneClass(view.tone === 'bad' ? 'bad' : 'ink')}>{view.n}</strong>
        <span>{view.unit}</span>
      </span>
      <p>{view.body}</p>
    </Link>
  );
}

/** Sports whose roster or staff read failed: their teams' empty rosters are unknown, not empty. */
function rosterDownSports(degraded: readonly string[]): Set<string> {
  return new Set(degraded.filter((d) => / (roster|staff)$/.test(d)).map((d) => d.slice(0, d.indexOf(' '))));
}

function TeamRow({ row, rank, now, rosterFailed }: { row: TeamActivityRow; rank: number; now: Date; rosterFailed: boolean }) {
  const roundWord = row.sport === 'golf' ? 'rounds' : 'games';
  return (
    <Link href={row.href} className="bp-team" data-br={BR.teams.row}>
      <span className="bp-rank">{rank}</span>
      <span className="bp-c-name">
        <span className="bp-name">{row.name}</span>
        <span className="bp-meta">
          <SportChip sport={row.sport} />
          <span>
            {row.players} {row.players === 1 ? 'player' : 'players'} · {row.coaches} staff
          </span>
          {row.isTest ? <TestChip /> : null}
        </span>
      </span>
      <span className="bp-cell-active bp-c-active">
        <Ring value={row.active7d} max={row.people} tone={row.active7d > 0 ? 'good' : 'muted'} label={`${row.active7d} of ${row.people} people active this week`} />
        <span>
          <span className="bp-big">{row.people === 0 ? '—' : `${row.active7d} / ${row.people}`}</span>
          <span className="bp-sub" style={{ display: 'block' }}>
            {row.people === 0 ? (rosterFailed ? 'roster not read' : 'nobody on the team') : `${row.active30d} in 30 days`}
          </span>
        </span>
      </span>
      <span className="bp-c-seen">
        <SignedIn at={row.lastSignIn?.at ?? null} role={row.lastSignIn?.role ?? null} now={now} empty={row.people === 0 ? (rosterFailed ? 'roster not read' : 'nobody to sign in') : 'no sign-in recorded'} />
      </span>
      <span className="bp-c-spark">
        <Spark values={row.activity} tone={STATE_TONE[row.state] === 'muted' ? 'muted' : STATE_TONE[row.state]} label={`${row.name}: ${row.activity.reduce((s, v) => s + v, 0)} activity ticks in 30 days`} />
      </span>
      <span className="bp-num bp-c-rounds">
        <span className="bp-big">
          {row.rounds30d}
          <span className="bp-label bp-sub"> {roundWord} in 30 days</span>
        </span>
        <span className="bp-sub" style={{ display: 'block' }}>
          {row.rounds7d} this week
        </span>
      </span>
      <span className={`bp-num bp-big bp-c-errors ${row.errors30d > 0 ? 'bs-tone-bad' : 'bs-tone-muted'}`}>
        {row.errors30d}
        <span className="bp-label bp-sub"> errors</span>
      </span>
      <span className="bp-c-state">
        <StatePill state={row.state} />
      </span>
    </Link>
  );
}

/** Team names, counts and roles only: a report leaves the screen, so it never names a person. */
function teamsReport(rows: readonly TeamActivityRow[], now: Date): string {
  const lines = [
    `# Helm teams by activity (${now.toISOString().slice(0, 16)}Z)`,
    '',
    '| Team | Sport | Test | State | Active this week | Last sign-in | Rounds/games 30d | Errors 30d |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) =>
      [
        r.name,
        r.sport,
        r.isTest ? 'yes' : '',
        STATE_WORDS[r.state],
        `${r.active7d}/${r.people} (coaches ${r.coachesActive7d}/${r.coaches}, players ${r.playersActive7d}/${r.players})`,
        r.lastSignIn ? `${ago(r.lastSignIn.at, now)} (${r.lastSignIn.role})` : 'none recorded',
        String(r.rounds30d),
        String(r.errors30d),
      ]
        .map((c) => c.replace(/\|/g, '\\|'))
        .join(' | ')
        .replace(/^/, '| ')
        .concat(' |'),
    ),
  ];
  return lines.join('\n');
}
