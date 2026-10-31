'use client';

import { ArrowLeftRight, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { haptic } from '../../lib/haptics';
import { tabListKeys } from '../../lib/tabs';
import { useRefresh } from '../../lib/use-refresh';
import { Button, IconButton } from '../../ui/Button';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { EmptyState, SkelRows, Skeleton } from '../../ui/States';
import { CompareBlocks, CompareGrid } from './compare/CompareGrid';
import { figureEvidence, groupOf, GROUPS, sideFigures, toMetricRound, dayWords } from './compare/model';
import { Face, ScopeControls, ScopeTitle, SummaryLine } from './compare/ScopeControls';
import { parseScope, presetsFor, printScope, selectRounds, sameScope, sideLabel, subjectName, summarize, contextWords, type ScopeEnv, type ScopeNames } from './compare/scope';
import { axisOf, Timeline } from './compare/Timeline';
import { EvidenceDrawer, type DeskEvidence } from './EvidenceDrawer';
import { METRICS, type TourMetricKey } from './metrics';
import { TourFailed, TourHead, TourLoading, TourMain, TourPhoneTop, TourViewSwitch, tourGate, useTourPhone } from './parts';
import { useTourPaths } from './paths';
import type { ChTourCompareData, ChTourCompareSearch, ChTourScope, CompareProps } from './types';
import '../../styles/tournaments-compare.css';

const TITLE_ID = 'ch-tour-cmp-title';
const LINE = 'What happened at each event, who counted, and how it compares with qualifying, practice and last season.';
const clampSplit = (n: number) => Math.max(0.35, Math.min(0.65, n));

/**
 * The comparison (board `CompareDesk`; phone `MCompare`): two sides set separately, one aligned grid of figures with the
 * difference between them, a history timeline to set a side's period, presets for the usual questions, and the rounds behind
 * every figure in the evidence drawer. The figures are the metrics engine's (`metrics.ts`) over the rounds each side selects;
 * a difference is toned only when it is larger than its standard error. The question bar, tiered verdicts and benchmarks of
 * the plan are not on the boards and are not drawn. `embedded` is the desk’s Compare tab: no page head, A preset to the event.
 */
export function Compare({ data, search, load, phone: forced, embedded = false }: CompareProps) {
  const phone = useTourPhone(forced);
  return tourGate(load, {
    loading: () =>
      embedded ? (
        <div className="ch-tour-cmp" data-ch-tour-view="compare" role="status" aria-busy="true" aria-label="Loading the comparison" data-ch-code="CH-16401">
          <Skeleton width="100%" height={220} radius={16} shape="solid" />
        </div>
      ) : (
        <TourLoading view="compare" phone={phone} title="Tournaments" className="ch-tour-cmp">
          <Skeleton width="100%" height={phone ? 44 : 40} radius={12} />
          <Skeleton width="100%" height={phone ? 120 : 190} radius={16} shape="solid" />
          <SkelRows rows={phone ? 4 : 6} trail />
        </TourLoading>
      ),
    failed: () =>
      embedded ? (
        <div className="ch-tour-cmp" data-ch-tour-view="compare">
          <EmptyState size="page" tone="danger" code="CH-16201" title="Tournaments didn’t load" body="Nothing is lost. Your events and scores are still saved; try again in a moment." />
        </div>
      ) : (
        <TourFailed view="compare" phone={phone} id={TITLE_ID} eyebrow={data.team.label} title="Tournaments" className="ch-tour-cmp" />
      ),
    ready: () => <CompareReady data={data} search={search} phone={phone} embedded={embedded} />,
  });
}

function CompareReady({ data, search, phone, embedded }: { data: ChTourCompareData; search: ChTourCompareSearch; phone: boolean; embedded: boolean }) {
  const paths = useTourPaths();
  const router = useRouter();
  const { refresh, refreshing } = useRefresh();

  const env: ScopeEnv = useMemo(() => ({ rounds: data.rounds, seasons: data.seasons, events: data.events, matchedPlayers: data.matchedPlayers }), [data]);
  const names: ScopeNames = useMemo(() => ({ players: data.players, events: data.events, seasons: data.seasons, courses: data.courses }), [data]);
  const presets = useMemo(() => presetsFor(env, names), [env, names]);
  const finished = useMemo(() => data.events.filter((e) => e.status === 'complete').sort((a, b) => b.startDate.localeCompare(a.startDate)), [data.events]);

  // The sides: the URL's, else this event against the season (the desk’s tab), else the first preset the data can answer.
  const base = (): { a: ChTourScope; b: ChTourScope } => {
    const season = { kind: 'season' } as const;
    if (data.eventId) return { a: { subject: { kind: 'team' }, context: { kind: 'event', id: data.eventId, rounds: null }, period: season, refine: [] }, b: { subject: { kind: 'team' }, context: { kind: 'events' }, period: season, refine: [] } };
    const p = presets[0];
    return p ? { a: p.a, b: p.b } : { a: { subject: { kind: 'team' }, context: { kind: 'events' }, period: season, refine: [] }, b: { subject: { kind: 'team' }, context: { kind: 'events' }, period: { kind: 'last-season' }, refine: [] } };
  };
  const key = `${search.a}|${search.b}|${search.m}|${search.split}`;
  const start = () => {
    const d = base();
    return { A: parseScope(search.a) ?? d.a, B: parseScope(search.b) ?? d.b, group: groupOf(search.m).id, split: clampSplit((search.split ?? 50) / 100) };
  };
  const [seen, setSeen] = useState(key);
  const [state, setState] = useState(start);
  if (seen !== key) {
    setSeen(key);
    setState(start());
  }
  const { A, B, group, split } = state;
  const [target, setTarget] = useState<'a' | 'b'>('b');
  const [evidence, setEvidence] = useState<DeskEvidence | null>(null);
  const [editing, setEditing] = useState(false);

  const commit = (next: Partial<typeof state>) => {
    const s = { ...state, ...next };
    setState(s);
    if (embedded) return;
    const q = new URLSearchParams();
    q.set('a', printScope(s.A));
    q.set('b', printScope(s.B));
    q.set('m', s.group);
    if (Math.round(s.split * 100) !== 50) q.set('split', String(Math.round(s.split * 100)));
    const href = paths.compare(data.eventId);
    router.replace(`${href}${href.includes('?') ? '&' : '?'}${q.toString()}`, { scroll: false });
  };
  const setSide = (side: 'a' | 'b', next: ChTourScope) => commit(side === 'a' ? { A: next } : { B: next });
  const preset = presets.find((p) => sameScope(p.a, A) && sameScope(p.b, B));

  const roundsA = useMemo(() => selectRounds(A, env), [A, env]);
  const roundsB = useMemo(() => selectRounds(B, env), [B, env]);
  const failed = { field: !!data.errors.field, holes: !!data.errors.holes };
  const metA = useMemo(() => roundsA.map((r) => toMetricRound(r, data.events, failed)), [roundsA, data.events, failed.field, failed.holes]); // eslint-disable-line react-hooks/exhaustive-deps
  const metB = useMemo(() => roundsB.map((r) => toMetricRound(r, data.events, failed)), [roundsB, data.events, failed.field, failed.holes]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = groupOf(group).keys;
  const figA = sideFigures(keys, metA, A.subject);
  const figB = sideFigures(keys, metB, B.subject);
  const labA = sideLabel(A, B, names, dayWords);
  const labB = sideLabel(B, A, names, dayWords);
  const sumA = summarize(roundsA);
  const sumB = summarize(roundsB);
  const axis = axisOf(env, data.now);
  const range = { from: data.seasons[0]?.start ?? axis.from, to: data.now.slice(0, 10) };

  const open = (side: 'a' | 'b', k: TourMetricKey) => {
    haptic('press');
    const sc = side === 'a' ? A : B;
    const rs = side === 'a' ? roundsA : roundsB;
    const fig = (side === 'a' ? figA : figB)[k]!;
    setEvidence({
      ref: figureEvidence({
        def: METRICS[k],
        figure: fig,
        side,
        title: `${subjectName(sc.subject, names)} · ${contextWords(sc, names, dayWords)}`,
        rounds: rs,
        events: data.events,
        firstName: (id) => data.players.find((p) => p.id === id)?.first ?? 'Player',
        courseName: (id) => data.courses[id]?.name ?? 'Course',
      }),
      card: null,
    });
  };

  const swap = () => {
    haptic('select');
    commit({ A: B, B: A });
  };
  const reset = () => {
    haptic('select');
    const d = base();
    commit({ A: d.a, B: d.b });
  };
  const pickGroup = (id: string) => {
    if (id !== group) haptic('select');
    commit({ group: id });
  };
  const ids = GROUPS.map((g) => g.id);
  const groupKeys = tabListKeys(ids, group, pickGroup, (id) => `ch-tour-cmp-tab-${id}`);

  const noRounds = data.rounds.length === 0;
  const body = data.errors.rounds ? (
    <InlineNotice code="CH-16250" title="The rounds didn’t load" body="Nothing has changed. Try again." onRetry={refresh} retrying={refreshing} />
  ) : noRounds ? (
    <EmptyState size="page" code="CH-16351" title="No rounds to compare yet" body="Rounds from events, qualifiers and practice show here once they are in, and you can set any two samples side by side." />
  ) : (
    <>
      {data.errors.field && <InlineNotice code="CH-16251" title="The field didn’t load" body="Versus field needs it, so it is left blank. The other figures are unaffected. Try again." onRetry={refresh} retrying={refreshing} />}
      {data.errors.holes && <InlineNotice code="CH-16252" title="The hole figures didn’t load" body="Birdies, greens, fairways and putts are left blank. Scores and strokes gained are unaffected. Try again." onRetry={refresh} retrying={refreshing} />}
      {!phone && (
        <div className="ch-tour-cmp-presets" role="group" aria-label="Comparison presets">
          {presets.map((p) => (
            <button key={p.key} type="button" className="ch-tour-cmp-pre" aria-pressed={preset?.key === p.key} onClick={() => (haptic('select'), commit({ A: p.a, B: p.b }))}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      {phone ? (
        <>
          <div className="ch-tour-cmp-scopes is-phone">
            {([['a', A, sumA, labA], ['b', B, sumB, labB]] as const).map(([side, sc, sum, lab]) => (
              <section key={side} className="ch-tour-cmp-scope is-phone" aria-label={`Scope ${side.toUpperCase()}`}>
                <span className={'ch-tour-cmp-tag' + (side === 'b' ? ' is-b' : '')}>{side.toUpperCase()}</span>
                <b>{lab}</b>
                <span className="ch-tour-cmp-scope__sub">{contextWords(sc, names, dayWords)}</span>
                <em data-ch-code={sum.n ? undefined : 'CH-16350'}>{sum.n ? `${sum.full} rounds · ${sum.shot} with shot data` : 'No rounds in this sample'}</em>
              </section>
            ))}
          </div>
          <Button variant="primary" leftIcon={SlidersHorizontal} onClick={() => (haptic('press'), setEditing(true))}>
            Edit comparison
          </Button>
        </>
      ) : (
        <>
          <div className="ch-tour-cmp-scopes">
            <ScopeCard side="a" scope={A} summary={sumA} target={target === 'a'} names={names} players={data.players} finished={finished} range={range} onChange={(n) => setSide('a', n)} />
            <div className="ch-tour-cmp-swap">
              <IconButton icon={ArrowLeftRight} label="Swap sides" onClick={swap} />
              <IconButton icon={RotateCcw} label="Reset to preset" onClick={reset} />
            </div>
            <ScopeCard side="b" scope={B} summary={sumB} target={target === 'b'} names={names} players={data.players} finished={finished} range={range} onChange={(n) => setSide('b', n)} />
          </div>
          <Timeline A={A} B={B} target={target} onTarget={setTarget} onChange={setSide} env={env} finished={finished} from={axis.from} to={axis.to} />
        </>
      )}
      <div className="ch-tour-cmp-groups ch-hscroll" role="tablist" aria-label="Metric group">
        {GROUPS.map((g) => (
          <button key={g.id} type="button" role="tab" id={`ch-tour-cmp-tab-${g.id}`} aria-selected={group === g.id} aria-controls="ch-tour-cmp-panel" tabIndex={group === g.id ? 0 : -1} onClick={() => pickGroup(g.id)} onKeyDown={(e: KeyboardEvent<HTMLElement>) => groupKeys(e)}>
            {g.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="ch-tour-cmp-panel" aria-labelledby={`ch-tour-cmp-tab-${group}`}>
        {phone ? (
          <CompareBlocks keys={keys} a={figA} b={figB} labA={labA} labB={labB} onOpen={open} />
        ) : (
          <CompareGrid keys={keys} a={figA} b={figB} labA={labA} labB={labB} onOpen={open} split={split} onSplit={(s) => commit({ split: s })} />
        )}
      </div>
    </>
  );

  return (
    <>
      {embedded ? (
        <div className={'ch-tour-cmp' + (phone ? ' is-phone' : '')} data-ch-tour-view="compare">
          {body}
        </div>
      ) : (
        <TourMain view="compare" phone={phone} labelledBy={TITLE_ID} className="ch-tour-cmp">
          <TourPhoneTop phone={phone} title="Tournaments" />
          <TourHead
            id={TITLE_ID}
            phone={phone}
            eyebrow={data.team.label}
            title="Tournaments"
            line={LINE}
            actions={
              <>
                <TourViewSwitch current="compare" phone={phone} />
                <Button variant={phone ? 'secondary' : 'primary'} leftIcon={Plus} href={paths.newEvent()}>
                  Add event
                </Button>
              </>
            }
          />
          {body}
        </TourMain>
      )}
      <EvidenceDrawer evidence={evidence} onClose={() => setEvidence(null)} />
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit comparison"
        description="A and B are set separately"
        footer={
          <Button variant="primary" onClick={() => (haptic('success'), setEditing(false))}>
            Show comparison
          </Button>
        }
      >
        <div className="ch-tour-cmp-edit">
          <div className="ch-tour-cmp-pres" role="group" aria-label="Presets">
            {presets.map((p) => (
              <button key={p.key} type="button" className="ch-tour-cmp-pre" aria-pressed={preset?.key === p.key} onClick={() => (haptic('select'), commit({ A: p.a, B: p.b }))}>
                {p.label}
              </button>
            ))}
          </div>
          {([['a', A], ['b', B]] as const).map(([side, sc]) => (
            <section key={side} className="ch-tour-cmp-edit__side" aria-label={`Scope ${side.toUpperCase()}`}>
              <div className="ch-tour-cmp-edit__k">
                <span className={'ch-tour-cmp-tag' + (side === 'b' ? ' is-b' : '')}>{side.toUpperCase()}</span>Scope {side.toUpperCase()}
              </div>
              <ScopeControls side={side} scope={sc} onChange={(n) => setSide(side, n)} players={data.players} finished={finished} range={range} phone />
            </section>
          ))}
        </div>
      </Modal>
    </>
  );
}

/** One side as a card (board `ScopeCard`): who and what it is, its controls, and how many rounds it holds. */
function ScopeCard({
  side,
  scope,
  summary,
  target,
  names,
  players,
  finished,
  range,
  onChange,
}: {
  side: 'a' | 'b';
  scope: ChTourScope;
  summary: ReturnType<typeof summarize>;
  target: boolean;
  names: ScopeNames;
  players: ChTourCompareData['players'];
  finished: ChTourCompareData['events'];
  range: { from: string; to: string };
  onChange: (next: ChTourScope) => void;
}) {
  return (
    <section className={'ch-tour-cmp-scope' + (target ? ' is-target' : '')} aria-label={`Scope ${side.toUpperCase()}`}>
      <div className="ch-tour-cmp-scope__top">
        <Face scope={scope} side={side} names={names} />
        <ScopeTitle scope={scope} names={names} />
      </div>
      <ScopeControls side={side} scope={scope} onChange={onChange} players={players} finished={finished} range={range} phone={false} />
      {target && <span className="ch-tour-chip is-ok">Timeline edits {side.toUpperCase()}</span>}
      <SummaryLine summary={summary} side={side} />
    </section>
  );
}
