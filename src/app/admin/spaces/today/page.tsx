import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { fetchPulseGrid } from '@/lib/admin/data/pulse-grid';
import { fetchReleaseLedger } from '@/lib/admin/data/release-ledger';
import { fetchGolfActivity, type ActivityItem } from '@/lib/admin/data/activity';
import { fetchHeldMigrations } from '@/lib/admin/command-deck/held-migrations';
import { readHourly, readPipe } from '@/lib/admin/clubhouse/live';
import {
  fetchFeatureUseToday,
  fetchJobsHealth,
  fetchRoundTimestamps,
  servedReleaseSha,
  settleRead,
} from '@/lib/admin/data/today-space';
import { CopyReportButton } from '../../_components/CopyReportButton';
import { AreaChart } from '../_ui/AreaChart';
import { Panel, Pill, SpaceHeader, SpaceRoot, toneClass, type Tone } from '../_ui/ui';
import { AskList, Chevron, FailedInline, PulseTile } from '../_landing/parts';
import {
  RELEASE_WORD,
  assembleNeeds,
  bucketWeeks,
  clubhouseToday,
  heldCount,
  plural,
  pulseGridIncomplete,
  releaseHealth,
  shortSha,
  summarizeJobs,
  teamActivity,
  todayHeadline,
  todayReport,
  utcClock,
  utcDateLine,
  utcMidnight,
  weekTicks,
} from '../_landing/model';

export const metadata: Metadata = { title: 'Today' };

export const dynamic = 'force-dynamic';

const HREF = '/admin/spaces/today';

/**
 * Today space, B16 (plan: docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md).
 * "What is happening with Helm right now?" Eight reads in parallel, each settled on its own so one failure shows as
 * that section's failed state and never blanks the page or turns into a zero.
 */
export default async function TodaySpacePage() {
  await requireSuperAdmin();
  const now = Date.now();
  const midnight = utcMidnight(now);
  const servedSha = servedReleaseSha();

  const [teams, rounds, features, release, jobs, held, clubhouse, activity] = await Promise.all([
    settleRead('today.teams', async () => {
      const grid = await fetchPulseGrid();
      if (pulseGridIncomplete(grid.degradedNote)) throw new Error('team pulse grid read incomplete');
      return teamActivity(grid.teams);
    }),
    settleRead('today.rounds', async () => bucketWeeks(await fetchRoundTimestamps(now), now)),
    settleRead('today.features', () => fetchFeatureUseToday(now)),
    settleRead('today.release', async () => {
      const ledger = await fetchReleaseLedger();
      if (ledger.status !== 'ok' || !ledger.data) throw new Error(ledger.error ?? 'release ledger unavailable');
      return releaseHealth(servedSha, ledger.data.cards);
    }),
    settleRead('today.jobs', async () => {
      const j = await fetchJobsHealth(new Date(now));
      return summarizeJobs(j.board, j.integrity);
    }),
    settleRead('today.held', async () => {
      const rows = await fetchHeldMigrations();
      if (rows === null) throw new Error('supabase/migrations/HELD.md could not be read');
      return heldCount(rows);
    }),
    settleRead('today.clubhouse', async () => {
      const [hourly, pipe] = await Promise.all([readHourly({ sinceIso: new Date(midnight).toISOString() }), readPipe(now)]);
      if (hourly.state === 'error') throw new Error(hourly.error ?? 'clubhouse_signal_hourly read failed');
      return clubhouseToday(hourly.data, pipe);
    }),
    settleRead('today.activity', async () => {
      const page = await fetchGolfActivity({ limit: 12 });
      return {
        items: page.items.filter((it) => Date.parse(it.ts) >= midnight).slice(0, 7),
        partial: page.degradedKinds.length > 0,
      };
    }),
  ]);

  const reads = [teams, rounds, features, release, jobs, held, clubhouse, activity];
  const reading = { ok: reads.filter((r) => r.ok).length, total: reads.length };
  const needs = assembleNeeds({ jobs, held, teams, release, clubhouse });
  const headline = todayHeadline({ teams, rounds, release, needs, reading });

  const t = teams.ok ? teams.data : null;
  const teamTone: Tone = t && t.total > 0 && t.activeNow / t.total >= 1 / 3 ? 'good' : 'watch';
  const rel = release.ok ? release.data : null;
  const relWord = rel ? RELEASE_WORD[rel.state] : null;
  const f = features.ok ? features.data : null;
  const readingTone: Tone = reading.ok === reading.total ? 'good' : reading.ok * 2 < reading.total ? 'bad' : 'watch';

  const tiles = [
    {
      label: 'Teams active',
      value: t ? `${t.activeNow}/${t.total}` : null,
      sub: 'did something in the last 2 days, counted as on People',
      tone: teamTone,
      meter: t ? { value: t.activeNow, max: t.total, label: `${t.activeNow} of ${t.total} teams active` } : undefined,
    },
    {
      label: 'Features used today',
      value: f ? `${f.used}/${f.total}` : null,
      sub: 'touched since 00:00 UTC',
      tone: (f && f.used > 0 ? 'good' : 'watch') as Tone,
      meter: f ? { value: f.used, max: f.total, label: `${f.used} of ${f.total} features used today` } : undefined,
    },
    {
      label: 'Live release',
      value: relWord ? relWord.word : null,
      sub: rel?.sha ? `${shortSha(rel.sha)} · ${rel.state === 'clean' ? 'no new errors' : rel.state === 'gathering' ? 'under 2 hours old' : rel.state === 'outside-ledger' ? 'older than 7 days' : 'see Ship'}` : 'no release stamp on this deployment',
      tone: relWord?.tone ?? 'muted',
    },
    {
      label: 'Systems reading',
      value: `${reading.ok}/${reading.total}`,
      sub: 'sources on this page answered',
      tone: readingTone,
      meter: { value: reading.ok, max: reading.total, label: `${reading.ok} of ${reading.total} sources answered` },
    },
  ];

  const roundWeeks = rounds.ok ? rounds.data : null;
  const thisWeek = roundWeeks?.at(-1) ?? null;
  const lastWeek = roundWeeks?.at(-2) ?? null;
  const report = todayReport({
    now,
    headline,
    tiles: tiles.map((x) => ({ label: x.label, value: x.value, sub: x.sub })),
    needs,
    rounds: roundWeeks,
  });
  const anyFailed = reads.some((r) => !r.ok);
  const ch = clubhouse.ok ? clubhouse.data : null;

  const spaces: Array<{ name: string; href: string; q: string; value: string | null; tone: Tone }> = [
    { name: 'Today', href: HREF, q: 'What is happening with Helm right now?', value: 'You are here', tone: 'muted' },
    { name: 'People', href: '/admin/spaces/people', q: 'Who uses Helm, and who is slipping?', value: t ? `${t.activeThisWeek} of ${plural(t.total, 'team')} active this week` : null, tone: teamTone },
    { name: 'Product', href: '/admin/spaces/product', q: 'Which parts of the app are alive?', value: f ? `${f.used} of ${plural(f.total, 'feature')} used today` : null, tone: 'ink' },
    {
      name: 'Reliability',
      href: '/admin/spaces/reliability',
      q: 'What is breaking, for whom, and why?',
      value: ch ? (ch.causes > 0 ? `${plural(ch.causes, 'Clubhouse failure cause')} today` : ch.trusted ? 'No Clubhouse failures today' : ch.pipeLabel) : null,
      tone: ch ? (ch.causes > 0 ? 'bad' : ch.trusted ? 'good' : 'muted') : 'muted',
    },
    { name: 'Ship', href: '/admin/spaces/ship', q: 'What is live, what is next, is the platform OK?', value: relWord ? `Release: ${relWord.word.toLowerCase()}` : null, tone: relWord?.tone ?? 'muted' },
    { name: 'Desk', href: '/admin/spaces/desk', q: 'What is waiting on you?', value: held.ok ? plural(held.data, 'held migration') : null, tone: held.ok && held.data > 0 ? 'watch' : 'muted' },
  ];

  return (
    <SpaceRoot br={anyFailed ? BR.today.failed : ''}>
      <SpaceHeader
        eyebrow={`${utcDateLine(now)} · ${utcClock(now)} UTC`}
        title={headline.title}
        second={headline.second}
        secondTone={headline.secondTone}
        lede={headline.lede}
        badges={
          <Pill tone={servedSha ? 'good' : 'muted'} dot>
            {servedSha ? `Production · ${shortSha(servedSha)}` : 'No release stamp'}
          </Pill>
        }
        aside={
          <span data-br={BR.today.copy}>
            <CopyReportButton report={report} variant="labeled" label="Copy report" className="bs-copy" />
          </span>
        }
      />

      <section aria-label="Pulse" className="bs-tiles">
        {tiles.map((x) => (
          <PulseTile key={x.label} label={x.label} value={x.value} sub={x.sub} tone={x.tone} meter={x.meter} />
        ))}
      </section>

      <section className="bs-split">
        <Panel className="bs-split-main" title="GolfHelm · rounds logged per week" note="rolling 7-day windows · test rounds left out">
          <div style={{ padding: '0 22px 20px' }}>
            {roundWeeks ? (
              <>
                <div className="bs-chart-head">
                  <span className="bs-big">{thisWeek}</span>
                  <span className={toneClass(thisWeek !== null && lastWeek !== null && thisWeek < lastWeek ? 'watch' : 'muted')} style={{ fontSize: 15, fontWeight: 600 }}>
                    in the last 7 days · {lastWeek} the 7 before
                  </span>
                </div>
                <AreaChart
                  values={roundWeeks}
                  tone="good"
                  height={180}
                  label={`Rounds logged per week over 12 weeks, oldest first: ${roundWeeks.join(', ')}.`}
                  ticks={weekTicks(now)}
                />
              </>
            ) : (
              <FailedInline br={BR.today.failed} what="Rounds" retryHref={HREF} />
            )}
          </div>
        </Panel>

        <Panel
          className={`bs-split-side bs-split-first-on-phone ${needs.total > 0 ? 'bs-wash-watch' : ''}`}
          title="Waiting on you"
          note={
            <Link href="/admin/spaces/desk" className="bs-link">
              Desk
            </Link>
          }
        >
          <div style={{ padding: '0 22px 14px' }}>
            <span className="bs-big">{needs.unread > 0 ? `${needs.total}+` : needs.total}</span>
            <div className="bs-panel-note" style={{ marginTop: 6 }}>
              {needs.unread > 0
                ? `at least; ${plural(needs.unread, 'source')} could not be read`
                : needs.total === 0
                  ? 'Nothing needs you right now.'
                  : 'jobs, migrations, teams and causes, each counted once'}
            </div>
          </div>
          {needs.rows.length ? <AskList needs={needs} br={BR.today.needsRow} /> : null}
          {ch && !ch.trusted ? (
            <div className="bs-inline-state" data-br={BR.today.noSignal} role="status">
              Clubhouse {ch.pipeLabel.replace(/^pipe: /, 'signal pipe: ')}, so a zero there is not an all-clear.
            </div>
          ) : null}
        </Panel>
      </section>

      <section className="bs-split">
        <Panel className="bs-split-side" title="Since midnight" note="UTC, newest first">
          {activity.ok ? (
            activity.data.items.length ? (
              <ul className="bs-since">
                {activity.data.items.map((it) => (
                  <li key={it.id}>
                    <SinceRow item={it} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="bs-inline-state" data-br={BR.today.empty}>
                Nothing has happened in GolfHelm since 00:00 UTC.
              </div>
            )
          ) : (
            <FailedInline br={BR.today.failed} what="Activity" retryHref={HREF} />
          )}
          {activity.ok && activity.data.partial ? <p className="bs-note" style={{ padding: '0 22px 16px', margin: 0 }}>Some activity sources did not answer; the list may be short.</p> : null}
          <div style={{ padding: '0 22px 18px' }}>
            <Link href="/admin/activity" className="bs-link">
              All activity
            </Link>
          </div>
        </Panel>

        <nav aria-label="Spaces" className="bs-split-main bs-cards">
          {spaces.map((s) =>
            s.href === HREF ? (
              <div key={s.name} className="bs-panel bs-card" aria-current="page">
                <span className="bs-card-title">{s.name}</span>
                <span className="bs-card-q">{s.q}</span>
                <span className="bs-card-value bs-tone-muted">{s.value}</span>
              </div>
            ) : (
              <Link key={s.name} href={s.href} className="bs-panel bs-card bs-card-link" data-br={BR.today.spaceCard}>
                <span className="bs-card-title">
                  {s.name}
                  <Chevron />
                </span>
                <span className="bs-card-q">{s.q}</span>
                <span className={`bs-card-value ${s.value === null ? 'bs-tone-muted' : toneClass(s.tone)}`}>{s.value ?? 'not measured yet'}</span>
              </Link>
            ),
          )}
        </nav>
      </section>
    </SpaceRoot>
  );
}

const KIND_TONE: Partial<Record<ActivityItem['kind'], Tone>> = { error: 'bad', signup: 'good', round_submitted: 'good' };

function SinceRow({ item }: { item: ActivityItem }) {
  const body = (
    <>
      <span className="bs-since-time">{utcClock(item.ts)}</span>
      <span className={`bs-dot ${toneClass(KIND_TONE[item.kind] ?? 'muted')}`} aria-hidden="true" />
      <span className="bs-since-text">{item.title}</span>
    </>
  );
  return item.href ? (
    <Link href={item.href} className="bs-since-row" data-br={BR.today.sinceRow}>
      {body}
    </Link>
  ) : (
    <div className="bs-since-row">{body}</div>
  );
}
