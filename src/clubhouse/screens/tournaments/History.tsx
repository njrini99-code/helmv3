'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../../ui/Button';
import { InlineNotice } from '../../ui/Notices';
import { Section } from '../../ui/Section';
import { Segmented } from '../../ui/Segmented';
import { EmptyState, SkelRows, Skeleton } from '../../ui/States';
import { useRefresh } from '../../lib/use-refresh';
import { formatSigned, NO_DATA, tourDay } from './format';
import { seasonRuns, trendNote, trendPoints, trendScale, trendX, trendY, type TrendPoint } from './history-model';
import { TourFailed, TourHead, TourLoading, TourMain, TourPhoneTop, TourViewSwitch, tourGate, useTourPhone } from './parts';
import { useTourPaths } from './paths';
import { SeasonLedger } from './SeasonLedger';
import type { ChTourHistoryData, ChTourHistorySearch, HistoryProps } from './types';
import '../../styles/tournaments-review.css';

const TITLE_ID = 'ch-tour-hist-title';
const LINE = 'What happened at each event, who counted, and how it compares with qualifying, practice and last season.';
/** The chart's drawing units; the plot is stretched to its box, so the stroke stays one width (non-scaling). */
const W = 1000;
const H = 220;
const TOP = 18;
const SPAN = H - 50;

/**
 * History (board `History`; phone `MHistory`): the team's scoring against the course rating at every finished event, one
 * line a season, then the ledger of every event. Actual lineups or returning players, against the rating or against the
 * field; each point opens its event. Head-to-head, the splits and the middle-50% band have no board and are not drawn.
 */
export function History({ data, search, load, phone: forced }: HistoryProps) {
  const phone = useTourPhone(forced);
  return tourGate(load, {
    loading: () => (
      <TourLoading view="history" phone={phone} title="Tournaments" className="ch-tour-rev-hist">
        <Skeleton width="100%" height={phone ? 44 : 40} radius={12} />
        <Skeleton width="100%" height={phone ? 230 : 300} radius={16} shape="solid" />
        {!phone && <SkelRows rows={5} trail />}
      </TourLoading>
    ),
    failed: () => <TourFailed view="history" phone={phone} id={TITLE_ID} eyebrow={data.seasons[0] ? `Varsity · ${data.seasons[0].label}` : 'Tournaments'} title="Tournaments" className="ch-tour-rev-hist" />,
    ready: () => <HistoryReady data={data} search={search} phone={phone} />,
  });
}

const historyHref = (base: string, s: ChTourHistorySearch) => {
  const q = new URLSearchParams();
  if (s.mode !== 'actual') q.set('mode', s.mode);
  if (s.adjust !== 'raw') q.set('adjust', s.adjust);
  const rest = q.toString();
  return rest ? `${base}${base.includes('?') ? '&' : '?'}${rest}` : base;
};

function HistoryReady({ data, search, phone }: { data: ChTourHistoryData; search: ChTourHistorySearch; phone: boolean }) {
  const paths = useTourPaths();
  const router = useRouter();
  const { refresh, refreshing } = useRefresh();
  // The URL’s state, kept here so a press answers at once; it follows the URL when the URL changes under it.
  const key = `${search.mode}|${search.adjust}`;
  const [seen, setSeen] = useState(key);
  const [state, setState] = useState<ChTourHistorySearch>(search);
  if (seen !== key) {
    setSeen(key);
    setState(search);
  }
  const move = (next: Partial<ChTourHistorySearch>) => {
    const s = { ...state, ...next };
    setState(s);
    router.replace(historyHref(paths.history(), s), { scroll: false });
  };
  const empty = data.events.length === 0 && !data.errors.trend;
  const current = data.seasons[0]?.id ?? '';
  const courseName = (id: string | undefined) => (id ? (data.courses[id]?.name ?? NO_DATA) : NO_DATA);
  const points = trendPoints(data, state);
  const note = trendNote(data, state);

  return (
    <TourMain view="history" phone={phone} labelledBy={TITLE_ID} className="ch-tour-rev-hist">
      <TourPhoneTop phone={phone} title="Tournaments" />
      <TourHead
        id={TITLE_ID}
        phone={phone}
        eyebrow={data.seasons[0] ? `Varsity · ${data.seasons[0].label}` : 'Tournaments'}
        title="Tournaments"
        line={LINE}
        actions={
          <>
            <TourViewSwitch current="history" phone={phone} />
            {!empty && (
              <Button variant="primary" leftIcon={Plus} href={paths.newEvent()}>
                Add event
              </Button>
            )}
          </>
        }
      />
      {empty ? (
        <EmptyState
          size="page"
          code="CH-16340"
          icon={Plus}
          title="No results to compare yet"
          body="Once events are finished, the team’s scoring against the course rating shows here, season by season."
          action={
            <Button variant="primary" leftIcon={Plus} href={paths.newEvent()}>
              Add event
            </Button>
          }
        />
      ) : (
        <>
          <Section
            id="ch-tour-hist-across"
            title="Across seasons"
            actions={
              <div className="ch-tour-rev-tools">
                <Segmented size="sm" label="Lineup mode" value={state.adjust === 'field' ? 'actual' : state.mode} onChange={(v) => move({ mode: v })} options={[{ value: 'actual', label: 'Actual lineups' }, { value: 'matched', label: 'Returning players', disabled: state.adjust === 'field' }]} />
                <Segmented size="sm" label="Measured against" value={state.adjust} onChange={(v) => move({ adjust: v })} options={[{ value: 'raw', label: 'Course rating' }, { value: 'field', label: 'The field' }]} />
              </div>
            }
          >
            {data.errors.trend ? (
              <InlineNotice code="CH-16236" title="The trend didn’t load" body="The events below are unaffected. Try again; the error has been reported." onRetry={refresh} retrying={refreshing} />
            ) : phone ? (
              <TrendBars points={points} data={data} state={state} note={note} />
            ) : (
              <Trend points={points} state={state} note={note} />
            )}
          </Section>
          {!phone && (
            <Section id="ch-tour-hist-every" title="Every event" meta="Graduated players stay with the events they played">
              <SeasonLedger events={data.events} seasons={data.seasons} players={data.players} courseName={courseName} currentSeasonId={current} phone={false} />
            </Section>
          )}
        </>
      )}
    </TourMain>
  );
}

const WHAT: Record<ChTourHistorySearch['adjust'], { title: string; line: string }> = {
  raw: { title: 'Team scoring against course rating', line: 'Average of every team round, minus the rating of the tees played · lower is better' },
  field: { title: 'Team scoring against the field', line: 'Our average per round, minus the field’s where the field is entered · lower is better' },
};
const lineup = (s: ChTourHistorySearch) => (s.adjust === 'field' || s.mode === 'actual' ? 'actual lineups' : 'returning players only');
const label = (p: TrendPoint) => `${p.event.name}: ${p.value == null ? 'no figure' : `${formatSigned(p.value, 1)} a round`}${p.scorecardsOnly ? ', scorecards only' : ''}`;
const when = (p: TrendPoint) => `${p.event.short} · ${tourDay(p.event.startDate, { month: 'short', year: '2-digit' })}`;

/** The desktop chart (board `Trend`): a line a season, a dashed mean, a point per event that opens it, the figure under it. */
function Trend({ points, state, note }: { points: TrendPoint[]; state: ChTourHistorySearch; note: string | null }) {
  const paths = useTourPaths();
  const n = points.length;
  const { lo, hi, mean } = trendScale(points);
  const px = (i: number) => trendX(i, n) * W;
  const py = (v: number) => TOP + trendY(v, lo, hi) * SPAN;
  const runs = seasonRuns(points);
  return (
    <div className="ch-tour-rev-trend">
      <div className="ch-tour-rev-trend__top">
        <p className="ch-tour-rev-trend__t">{WHAT[state.adjust].title}</p>
        <p className="ch-tour-rev-trend__s">
          {WHAT[state.adjust].line} · {lineup(state)}
        </p>
      </div>
      <div className="ch-tour-rev-trend__plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {mean != null && <line className="ch-tour-rev-trend__mean" x1={0} x2={W} y1={py(mean)} y2={py(mean)} vectorEffect="non-scaling-stroke" />}
          {runs.slice(1).map((r) => {
            const x = (px(r.from - 1) + px(r.from)) / 2;
            return <line key={`d${r.from}`} className="ch-tour-rev-trend__div" x1={x} x2={x} y1={8} y2={H - 26} vectorEffect="non-scaling-stroke" />;
          })}
          {runs.map((r) => {
            // A line breaks where a point has no figure; a single point is a dot and no line.
            const parts: string[] = [];
            let pen = false;
            for (let i = r.from; i <= r.to; i += 1) {
              const v = points[i]?.value;
              if (v == null) pen = false;
              else {
                parts.push(`${pen ? 'L' : 'M'}${px(i)},${py(v)}`);
                pen = true;
              }
            }
            return parts.length > 1 ? <path key={r.from} className="ch-tour-rev-trend__line" d={parts.join('')} vectorEffect="non-scaling-stroke" /> : null;
          })}
        </svg>
        {points.map((p, i) =>
          p.value == null ? null : (
            <Link key={p.event.id} href={paths.desk(p.event.id)} className={'ch-tour-rev-dot' + (p.scorecardsOnly ? ' is-cards' : '')} style={{ left: `${trendX(i, n) * 100}%`, top: `${((TOP + trendY(p.value, lo, hi) * SPAN) / H) * 100}%` }} aria-label={label(p)} title={`${p.event.name} · ${p.rounds} rounds · ${p.players} players`}>
              <i />
            </Link>
          ),
        )}
      </div>
      <ol className="ch-tour-rev-trend__labels" style={{ gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(0, 1fr))` }}>
        {points.map((p) => (
          <li key={p.event.id}>
            <b className="ch-num">{p.value == null ? NO_DATA : formatSigned(p.value, 1)}</b>
            {when(p)}
          </li>
        ))}
      </ol>
      <p className="ch-tour-rev-trend__key">A point opens its event. A grey ring means scorecards only.</p>
      {note && <p className="ch-tour-rev-trend__note">{note}</p>}
    </div>
  );
}

/** The phone's History (board `MHistory`): one bar a finished event, taller the closer to the mark, this season in green. */
function TrendBars({ points, data, state, note }: { points: TrendPoint[]; data: ChTourHistoryData; state: ChTourHistorySearch; note: string | null }) {
  const paths = useTourPaths();
  const { lo, hi } = trendScale(points, 0.5);
  const current = data.seasons[0]?.id;
  return (
    <div className="ch-tour-rev-trend is-phone">
      <p className="ch-tour-rev-trend__t">{WHAT[state.adjust].title}</p>
      <p className="ch-tour-rev-trend__s">Per round · lower is better · {lineup(state)}</p>
      <ol className="ch-tour-rev-bars" style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` }}>
        {points.map((p) => (
          <li key={p.event.id}>
            <Link href={paths.desk(p.event.id)} className={'ch-tour-rev-bar' + (p.event.seasonId === current ? ' is-now' : '')} aria-label={label(p)}>
              <b className="ch-num">{p.value == null ? NO_DATA : formatSigned(p.value, 1)}</b>
              <i style={{ height: p.value == null ? 14 : 14 + (1 - trendY(p.value, lo, hi)) * 70 }} />
              <span>{p.event.short}</span>
            </Link>
          </li>
        ))}
      </ol>
      {note && <p className="ch-tour-rev-trend__note">{note}</p>}
    </div>
  );
}
