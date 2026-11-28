import Link from 'next/link';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { OWNER_TONE } from '@/lib/admin/clubhouse/explain';
import { STATE_WORDS, feedHref, type FeedScope } from '@/lib/admin/clubhouse/feed';
import { whoWords, type Issue, type SparkFrame } from '@/lib/admin/clubhouse/issues';
import { KIND_WORDS, rateWords, screenWords, type Coverage, type PageHealth } from '@/lib/admin/clubhouse/page-health';
import { LocalTime } from '@/app/admin/_components/LocalTime';
import { Pill } from '../../_ui/ui';

/**
 * The Issues and Pages views of the error feed (B19). Server components: each row is a link, so Back works and the
 * server renders the view the URL names.
 */

const STATE_TONE = { expected: 'muted', watching: 'watch', new: 'bad' } as const;
const KIND_WORD = new Map(KIND_WORDS);

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "in the last hour" / "today": the last bar's span, for the sparkline's label. */
function lastBucketWords(frame: Pick<SparkFrame, 'unit'>): string {
  return frame.unit === 'hour' ? 'in the current hour' : 'today';
}

/**
 * Failures per bucket as bars: a hairline where a bucket had none, so a quiet stretch reads as quiet rather than
 * missing. The scale is the issue's own busiest bucket; the label carries the numbers for a screen reader.
 */
function FailureBars({ counts, frame, label }: { counts: readonly number[]; frame: Pick<SparkFrame, 'unit'>; label: string }) {
  const n = counts.length;
  const max = Math.max(1, ...counts);
  const w = 112;
  const hgt = 28;
  const gap = n > 12 ? 1 : 2;
  const bw = Math.max(1, (w - gap * (n - 1)) / n);
  const total = counts.reduce((a, b) => a + b, 0);
  const last = counts[n - 1] ?? 0;
  return (
    <svg
      className="rl-spark"
      viewBox={`0 0 ${w} ${hgt}`}
      width={w}
      height={hgt}
      role="img"
      aria-label={`${label}: ${plural(total, 'failure')}, ${last} ${lastBucketWords(frame)}`}
    >
      {counts.map((c, i) => {
        const x = i * (bw + gap);
        if (c === 0) return <rect key={i} className="rl-spark-zero" x={x} y={hgt - 1} width={bw} height={1} />;
        const bh = Math.max(3, (c / max) * (hgt - 2));
        return <rect key={i} className={i === n - 1 ? 'rl-spark-bar rl-spark-now' : 'rl-spark-bar'} x={x} y={hgt - bh} width={bw} height={bh} rx={Math.min(1.5, bw / 2)} />;
      })}
    </svg>
  );
}

function issueHref(issue: Issue, scope: FeedScope): string {
  // A coded issue opens all its failures; one with no code has nothing to filter on, so it opens its newest failure.
  return issue.catalogCode
    ? feedHref(scope, { code: issue.catalogCode, v: null, e: null })
    : feedHref(scope, { v: null, e: { sessionId: issue.newest.sessionId, seq: issue.newest.seq } }, 'detail');
}

export function IssueRow({ issue, scope, frame }: { issue: Issue; scope: FeedScope; frame: SparkFrame }) {
  const cause = issue.cause;
  return (
    <Link href={issueHref(issue, scope)} className="rl-row rl-issue" data-br={BR.feed.issueRow} data-feed-row="">
      <span className="rl-issue-people">
        <b>{issue.people}</b>
        <span>{issue.people === 1 ? 'person' : 'people'}</span>
      </span>
      <span className="rl-main">
        <span className="rl-saw">
          {issue.quoted ? <q>{issue.headline}</q> : <span>{issue.headline}</span>}
          {issue.code ? <span className="bs-chip">{issue.code}</span> : null}
          {cause ? <span className={`rl-cause bs-tone-${OWNER_TONE[cause.owner]}`}>{cause.label}</span> : null}
        </span>
        <span className="rl-where">
          {issue.pageName ?? `${issue.pages} pages`}
          <span className="rl-team">
            {' '}
            · {plural(issue.count, 'failure')} · {whoWords(issue)}
          </span>
        </span>
        {issue.state || issue.rising || issue.mostly.length ? (
          <span className="rl-flags">
            {issue.state ? (
              <Pill tone={STATE_TONE[issue.state]} dot={issue.state === 'new'}>
                {STATE_WORDS[issue.state]}
              </Pill>
            ) : null}
            {issue.rising ? (
              <Pill tone="watch" dot>
                Rising
              </Pill>
            ) : null}
            {issue.mostly.map((m) => (
              <span key={m.dim} className="rl-mostly">
                {m.text}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      <span className="rl-issue-trend">
        <FailureBars counts={issue.spark} frame={frame} label={issue.headline} />
        <span>
          last <LocalTime iso={issue.lastAt} variant={frame.unit === 'day' ? 'datetime' : 'time'} />
        </span>
      </span>
    </Link>
  );
}

export function IssueList({ issues, scope, frame }: { issues: readonly Issue[]; scope: FeedScope; frame: SparkFrame }) {
  return (
    <section className="bs-panel rl-list" aria-label="Issues, most people first">
      <div className="rl-list-head" aria-hidden="true">
        <span>Who</span>
        <span>What went wrong</span>
        <span>{frame.unit === 'hour' ? 'By hour' : 'By day'}</span>
      </div>
      {issues.map((i) => (
        <IssueRow key={i.key} issue={i} scope={scope} frame={frame} />
      ))}
    </section>
  );
}

/** "views, taps and actions": which kinds of signal a page sent, so a page that never sends actions shows it. */
function kindsWords(kinds: readonly string[]): string {
  const w = kinds.map((k) => KIND_WORD.get(k) ?? k);
  return w.length < 2 ? (w[0] ?? 'nothing') : `${w.slice(0, -1).join(', ')} and ${w.at(-1)}`;
}

export function PageRow({ page, scope, frame }: { page: PageHealth; scope: FeedScope; frame: SparkFrame }) {
  const broken = page.failures > 0;
  const screens = screenWords(page.screens);
  return (
    <Link href={feedHref(scope, { page: page.page, v: 'errors', e: null, code: null })} className="rl-row rl-page" data-br={BR.feed.pageRow} data-feed-row="">
      <span className="rl-main">
        <span className="rl-saw">
          <span>{page.name}</span>
          <span className="bs-chip">{page.page}</span>
        </span>
        <span className="rl-where">
          {plural(page.people, 'person', 'people')} · {plural(page.views, 'view')}
          {screens ? (
            <span className="rl-screens">
              {' · '}
              {screens}
            </span>
          ) : null}
          <span className="rl-team"> · sent {kindsWords(page.kinds)}</span>
        </span>
      </span>
      <span className="rl-page-fail">
        {broken ? (
          <>
            <b className="bs-tone-bad">{plural(page.failures, 'failure')}</b>
            <span>
              {plural(page.failPeople, 'person', 'people')} hit · {rateWords(page.rate)} of views
            </span>
          </>
        ) : (
          <>
            <b className="bs-tone-good">No failures</b>
            <span>{page.views ? `in ${plural(page.views, 'view')}` : 'and no views'}</span>
          </>
        )}
      </span>
      <span className="rl-issue-trend">
        <FailureBars counts={page.spark} frame={frame} label={`${page.name} failures`} />
        {page.lastAt ? (
          <span>
            heard <LocalTime iso={page.lastAt} variant={frame.unit === 'day' ? 'datetime' : 'time'} />
          </span>
        ) : (
          <span>not heard from</span>
        )}
      </span>
    </Link>
  );
}

export function PageList({ pages, scope, frame }: { pages: readonly PageHealth[]; scope: FeedScope; frame: SparkFrame }) {
  return (
    <section className="bs-panel rl-list" aria-label="Pages, most people hit first">
      {pages.map((p) => (
        <PageRow key={p.page} page={p} scope={scope} frame={frame} />
      ))}
    </section>
  );
}

/**
 * The screens that sent nothing, grouped by page, so their zero is never read as a zero. A page that sent nothing at
 * all is marked; a screen two pages share is listed once.
 */
export function SilentScreens({ coverage, windowWords }: { coverage: Coverage; windowWords: string }) {
  const groups = coverage.silentScreens;
  if (!groups.length) return null;
  const silentCount = coverage.screensTotal - coverage.screensHeard;
  const label = coverage.screensTotal > 0 ? `${silentCount} of ${plural(coverage.screensTotal, 'screen')} not heard from` : `${plural(coverage.silent.length, 'page')} not heard from`;
  return (
    <section className="bs-panel bs-panel-pad rl-silent" aria-label="Screens not heard from">
      <div className="rl-silent-head">
        <Pill tone="watch" dot>
          {label}
        </Pill>
        <span className="bs-panel-note">
          They sent no signal at all {windowWords}, so no errors there is not a zero: nobody may have opened them, or their
          tracking may not be reaching the Bridge.
        </span>
      </div>
      <ul className="rl-silent-list">
        {groups.map((g) => (
          <li key={g.page} className="rl-silent-group">
            <span className="rl-silent-page">
              {g.name}
              {g.total > 1 ? <span className="rl-silent-count">{g.screens.length === g.total ? `all ${g.total}` : `${g.screens.length} of ${g.total}`}</span> : null}
            </span>
            {g.screens.length && !(g.screens.length === 1 && g.screens[0] === g.name) ? <span className="rl-silent-names">{g.screens.join(' · ')}</span> : null}
          </li>
        ))}
      </ul>
      {coverage.untold.length ? (
        <p className="bs-panel-note rl-silent-untold">
          {listWords(coverage.untold)} sent signals that do not say which screen, so a screen listed under {coverage.untold.length === 1 ? 'it' : 'them'} may
          still have been opened. Each screen says so itself once the route update is applied.
        </p>
      ) : null}
    </section>
  );
}

/** "Rounds, Settings and Practice". */
function listWords(names: readonly string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
