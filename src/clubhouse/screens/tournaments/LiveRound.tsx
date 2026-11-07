'use client';

import { CloudRain, Flag, Pause } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { enterTournamentScore, setTournamentRoundStatus } from '@/app/golf/actions/tournaments';
import { formatClock } from '../../lib/dates';
import { haptic } from '../../lib/haptics';
import { useAction } from '../../lib/use-action';
import { useRefresh } from '../../lib/use-refresh';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Menu } from '../../ui/Menu';
import { Modal } from '../../ui/Modal';
import { InlineNotice } from '../../ui/Notices';
import { Section } from '../../ui/Section';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { EmptyState, SkelRows, Skeleton } from '../../ui/States';
import { TrustChip, type TrustState } from '../../ui/TrustChip';
import { tourDay } from './format';
import { emptyForm, formOf, STATUS_OPTIONS, STATUS_WORDS, validateScore, type ScoreErrors, type ScoreForm } from './score-entry';
import { TourChip, TourCrumb, TourFailed, TourHead, TourLoading, TourMain, TourPhoneTop, ToPar, tourGate, useTourPhone } from './parts';
import { useTourPaths } from './paths';
import type { ChTourCount, ChTourLivePlayer, ChTourLiveSnapshot, ChTourRoundStatus, LiveRoundProps } from './types';
import { useChangedWash } from './use-changed-wash';
import '../../styles/tournaments-live.css';

const TITLE_ID = 'ch-tour-live-title';
/** How often the screen re-reads while a round is in play: the tournament tables are not in the realtime publication. */
export const LIVE_REFRESH_MS = 30_000;

const COUNT_WORDS: Record<ChTourCount, string> = { counted: 'Counting', dropped: 'Not counting', tie: 'Tied at the line', individual: 'Individual', none: '' };
const STATE_OF: Record<ChTourRoundStatus, TrustState> = { upcoming: 'upcoming', live: 'live', suspended: 'suspended', final: 'final', official: 'official' };

/**
 * The live round (plan 4.33, 5L): the counting line, a lane per player (thru, to par, whether the score counts), the
 * field, and the keys a coach needs on the day: Enter score for any lane, and Start, Suspend, Resume and Finish for the
 * round. Coach only. Scores come from the entered and linked totals and from the holes a linked GolfHelm round has
 * scored so far, and the team line is the scoring engine's (`live-model.ts`), never worked out here. Values change in
 * place with the changed-wash (D-100). The screen re-reads every 30 seconds while the round is in play; the hole map,
 * moments and presence need the hole feed (held file 6) and are not drawn.
 */
export function LiveRound({ data, load, phone: forced }: LiveRoundProps) {
  const phone = useTourPhone(forced);
  return tourGate(load, {
    loading: () => (
      <TourLoading view="live" phone={phone} title={`Round ${data.round.number}`} className="ch-tour-live">
        <Skeleton width="100%" height={phone ? 120 : 132} radius={16} shape="solid" />
        <SkelRows rows={5} lead />
      </TourLoading>
    ),
    failed: () => <TourFailed view="live" phone={phone} id={TITLE_ID} eyebrow={data.event.name} title={`Round ${data.round.number}`} className="ch-tour-live" />,
    ready: () => <LivePage data={data} phone={phone} />,
  });
}

/** Re-reads the page on a timer while `active`, and when the tab comes back (a hidden tab does not poll). */
export function useLiveRefresh(active: boolean, ms: number = LIVE_REFRESH_MS): void {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const t = window.setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active, ms, router]);
}

function LivePage({ data, phone }: { data: ChTourLiveSnapshot; phone: boolean }) {
  const paths = useTourPaths();
  const router = useRouter();
  const { refresh, refreshing } = useRefresh();
  const e = data.event;
  const r = data.round;
  const playing = r.status === 'live' || r.status === 'suspended';
  useLiveRefresh(playing);
  const [entering, setEntering] = useState<ChTourLivePlayer | null>(null);
  const [finishing, setFinishing] = useState(false);
  const player = (id: string) => data.players.find((p) => p.id === id);
  const lineup = data.lanes.filter((l) => l.role === 'lineup');
  const individuals = data.lanes.filter((l) => l.role === 'individual');
  const course = data.course.name;

  const status = useAction<[ 'live' | 'suspended_weather' | 'suspended_other' | 'final' ], unknown>(
    'tournaments.roundStatus',
    async (to) => {
      const res = await setTournamentRoundStatus(r.roundEventId, to, null);
      if (res.success) router.refresh();
      return res;
    },
    (to) => ({
      done: to === 'live' ? (r.status === 'upcoming' ? `Round ${r.number} is live` : `Round ${r.number} is back on`) : to === 'final' ? `Round ${r.number} is final` : `Round ${r.number} is suspended`,
      failed: to === 'final' ? 'Couldn’t finish the round' : to === 'live' ? 'Couldn’t start the round' : 'Couldn’t suspend the round',
      hint: 'Nothing was changed. Try again.',
      code: 'CH-16071',
    }),
    (result, c) => (result.success ? c : { ...c, hint: result.error ?? c.hint }),
  );

  const primary =
    r.status === 'upcoming' ? (
      <Button variant="primary" busy={status.pending} onClick={() => void status.run('live')}>
        Start round
      </Button>
    ) : r.status === 'live' ? (
      <Button variant="primary" leftIcon={Flag} busy={status.pending} onClick={() => setFinishing(true)}>
        Finish round
      </Button>
    ) : r.status === 'suspended' ? (
      <Button variant="primary" busy={status.pending} onClick={() => void status.run('live')}>
        Resume play
      </Button>
    ) : null;

  const actions = (
    <>
      {r.status === 'live' && (
        <Menu
          label="Suspend play"
          items={[
            { label: 'Suspend for weather', icon: CloudRain, onSelect: () => void status.run('suspended_weather') },
            { label: 'Suspend, another reason', icon: Pause, onSelect: () => void status.run('suspended_other') },
          ]}
          trigger={(p) => (
            <Button variant="secondary" menu={p} disabled={status.pending}>
              Suspend play
            </Button>
          )}
        />
      )}
      {(r.status === 'final' || r.status === 'official') && (
        <Button variant="secondary" href={paths.desk(e.id)}>
          Open the event
        </Button>
      )}
      {primary}
    </>
  );

  return (
    <TourMain view="live" phone={phone} labelledBy={TITLE_ID} className="ch-tour-live">
      <TourPhoneTop phone={phone} title={`Round ${r.number}`} back={{ label: e.short, href: paths.desk(e.id) }} />
      <TourHead
        tightAlways
        id={TITLE_ID}
        phone={phone}
        crumb={phone ? undefined : <TourCrumb href={paths.desk(e.id)}>{e.name}</TourCrumb>}
        eyebrow={e.name}
        title={`Round ${r.number}`}
        line={[course, tourDay(r.date, { weekday: 'short', month: 'short', day: 'numeric' })].filter(Boolean).join(' · ')}
        meta={
          <div className="ch-tour-live-meta">
            <TrustChip state={STATE_OF[r.status]} />
            <span className="ch-tour-live-muted" data-ch-live-asof="">
              As of <span className="ch-num">{formatClock(data.now)}</span>
              {playing ? ' · updates every 30 seconds' : ''}
            </span>
          </div>
        }
        actions={actions}
      />
      {e.rounds.length > 1 && (
        <div className="ch-tour-live-rounds">
          <Segmented
            label="Round"
            size={phone ? 'sm' : 'md'}
            block={phone}
            value={String(r.number)}
            onChange={(v) => router.push(paths.live(e.id, Number(v)))}
            options={e.rounds.map((x) => ({ value: String(x.number), label: `R${x.number}` }))}
          />
        </div>
      )}
      {data.errors.holes && <InlineNotice code="CH-16271" title="Some live scores didn’t load" body="Entered totals are unaffected. Holes from GolfHelm rounds are left out for now." onRetry={refresh} retrying={refreshing} />}
      <TeamLine data={data} />
      {data.lanes.length === 0 ? (
        <EmptyState size="page" kind="first-run" code="CH-16370" title="Nobody is in this round yet" body="Set the lineup, then the lanes show here as scores come in." action={<Button href={paths.lineup(e.id)}>Open the lineup</Button>} />
      ) : (
        <div className="ch-tour-live-body">
          <Section id="ch-tour-live-lineup" title="Lineup" meta={`${e.format.counting} of ${e.format.players} count`}>
            <Lanes lanes={lineup} nameOf={(id) => player(id)?.name ?? 'Player'} phone={phone} onEnter={setEntering} editable={r.status !== 'official'} />
          </Section>
          {individuals.length > 0 && (
            <Section id="ch-tour-live-ind" title="Individuals" meta="Play for themselves; never count toward the team">
              <Lanes lanes={individuals} nameOf={(id) => player(id)?.name ?? 'Player'} phone={phone} onEnter={setEntering} editable={r.status !== 'official'} />
            </Section>
          )}
          <Field data={data} />
        </div>
      )}
      <ScoreSheet key={entering?.playerId ?? 'none'} data={data} lane={entering} name={entering ? (player(entering.playerId)?.name ?? 'Player') : ''} onClose={() => setEntering(null)} />
      <Modal
        code="CH-16570"
        open={finishing}
        onClose={() => setFinishing(false)}
        width={440}
        icon={Flag}
        title={`Finish round ${r.number}?`}
        description="Scores can still be corrected after this. The round counts as final and the next one can start."
        footer={
          <>
            <Button variant="ghost" onClick={() => setFinishing(false)}>
              Keep playing
            </Button>
            <Button
              variant="primary"
              busy={status.pending}
              onClick={() => {
                setFinishing(false);
                haptic('warning');
                void status.run('final');
              }}
            >
              Finish round
            </Button>
          </>
        }
      />
    </TourMain>
  );
}

/** The counting line: the team's to par now, and how many counting scores are in. */
function TeamLine({ data }: { data: ChTourLiveSnapshot }) {
  const t = data.team;
  const wash = useChangedWash(t.toPar);
  const need = data.event.format.counting;
  const live = t.kind === 'live';
  return (
    <section className="ch-tour-live-team" aria-label="Team score" data-ch-live-team={t.kind}>
      <div className={'ch-tour-live-team__v ch-tour-washable' + (wash ? ' ch-tour-changed' : '')}>
        {t.toPar != null ? <ToPar value={t.toPar} /> : <span className="ch-num">—</span>}
      </div>
      <div className="ch-tour-live-team__t">
        <b>{t.kind === 'complete' ? 'Team score' : live ? 'Team, so far' : 'Team'}</b>
        <span className="ch-tour-live-muted">
          {t.kind === 'none' && 'No scores yet. The line fills in as scores are entered or a linked round starts.'}
          {live && (
            <>
              <span className="ch-num">{t.counting.length}</span> of <span className="ch-num">{need}</span> counting in{t.short ? ` · ${t.short} still to come` : ''}
            </>
          )}
          {t.kind === 'complete' && <>{t.total} strokes · {need} count</>}
          {t.kind === 'incomplete' && `Fewer than ${need} valid scores, so there is no team score for this round.`}
        </span>
      </div>
    </section>
  );
}

function Lanes({ lanes, nameOf, phone, onEnter, editable }: { lanes: ChTourLivePlayer[]; nameOf: (id: string) => string; phone: boolean; onEnter: (l: ChTourLivePlayer) => void; editable: boolean }) {
  return (
    <ul className="ch-tour-live-lanes">
      {lanes.map((l) => (
        <Lane key={l.playerId} lane={l} name={nameOf(l.playerId)} phone={phone} onEnter={onEnter} editable={editable} />
      ))}
    </ul>
  );
}

function thruWords(l: ChTourLivePlayer, holes: number): string {
  if (l.status === 'wd') return 'WD';
  if (l.status === 'dq' || l.status === 'dq_pending') return 'DQ';
  if (l.thru == null) return 'Not started';
  return l.thru >= holes ? 'F' : `Thru ${l.thru}`;
}

function Lane({ lane: l, name, phone, onEnter, editable }: { lane: ChTourLivePlayer; name: string; phone: boolean; onEnter: (l: ChTourLivePlayer) => void; editable: boolean }) {
  const wash = useChangedWash(l.toPar);
  const holes = 18;
  const scored = l.thru != null || l.status !== 'ok';
  return (
    <li className={'ch-tour-live-lane' + (l.count === 'counted' ? ' is-counting' : '')} data-ch-lane={l.playerId} data-ch-count={l.count}>
      {!phone && <Avatar name={name} size="sm" />}
      <div className="ch-tour-live-lane__who">
        <span className="ch-tour-live-lane__n">
          {l.slot != null && <span className="ch-num ch-tour-live-muted">{l.slot} </span>}
          {name}
        </span>
        <span className="ch-tour-live-muted">
          {thruWords(l, holes)}
          {l.holes.length > 0 ? ' · from their GolfHelm round' : ''}
        </span>
      </div>
      <div className="ch-tour-live-lane__chips">
        {l.status !== 'ok' && <TourChip tone="warn">{STATUS_WORDS[l.status]}</TourChip>}
        {COUNT_WORDS[l.count] && <TourChip tone={l.count === 'counted' ? 'ok' : undefined}>{COUNT_WORDS[l.count]}</TourChip>}
      </div>
      <div className={'ch-tour-live-lane__v ch-tour-washable' + (wash ? ' ch-tour-changed' : '')}>{l.toPar != null ? <ToPar value={l.toPar} /> : <span className="ch-num">—</span>}</div>
      {editable && (
        <Button size="sm" variant="secondary" onClick={() => onEnter(l)} aria={{ label: `${scored ? 'Edit' : 'Enter'} score for ${name}` }}>
          {scored ? 'Edit score' : 'Enter score'}
        </Button>
      )}
    </li>
  );
}

/** How the field stands: teams with a total, in place order. Our row is marked. */
function Field({ data }: { data: ChTourLiveSnapshot }) {
  const f = data.field;
  if (!f || f.entered === 0) return null;
  const rows = f.teams.filter((t) => t.total != null).sort((a, b) => (a.placeN ?? 99) - (b.placeN ?? 99));
  return (
    <Section id="ch-tour-live-field" title="The field" meta={`${f.entered} of ${f.size} teams entered${f.asOf ? ` · as of ${formatClock(f.asOf)}` : ''}`}>
      <ul className="ch-tour-live-field">
        {rows.map((t) => (
          <li key={t.id} className={'ch-tour-live-field__row' + (t.us ? ' is-us' : '')}>
            <span className="ch-num ch-tour-live-muted">{t.place ?? '—'}</span>
            <span>{t.name}</span>
            <ToPar value={t.toPar} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Enter score: the round total (and the nines, if the card has them), how the round ended, and a note. */
function ScoreSheet({ data, lane, name, onClose }: { data: ChTourLiveSnapshot; lane: ChTourLivePlayer | null; name: string; onClose: () => void }) {
  const router = useRouter();
  const row = lane ? data.event.playerRounds.find((p) => p.roundNumber === data.round.number && p.playerId === lane.playerId) : null;
  const [form, setForm] = useState<ScoreForm>(() => (lane ? formOf(row) : emptyForm()));
  const [errors, setErrors] = useState<ScoreErrors>({});
  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<ScoreForm>) => setForm((f) => ({ ...f, ...patch }));

  const write = useAction<[boolean], unknown>(
    'tournaments.score',
    async (clear) => {
      if (!lane) return { success: false as const };
      const checked = clear ? { ok: true as const, input: { total: null, front: null, back: null, status: 'ok' as const, wdAfterHole: null, note: null }, clears: true } : validateScore(form);
      if (!checked.ok) {
        setErrors(checked.errors);
        setTouched(true);
        haptic('warning');
        return { success: false as const, error: 'busy' };
      }
      const res = await enterTournamentScore(data.round.roundEventId, lane.playerId, checked.input);
      if (res.success) {
        onClose();
        router.refresh();
      }
      return res;
    },
    (clear) => ({ done: clear ? `${name}’s score is cleared` : `${name}’s score is saved`, failed: `Couldn’t save ${name}’s score`, hint: 'Nothing was changed. Try again.', code: 'CH-16070' }),
    (result, c) => (result.success ? c : result.error === 'busy' ? { ...c, quiet: true } : { ...c, hint: result.error ?? c.hint }),
  );

  const hasScore = row?.total != null || (row && row.status !== 'ok');
  return (
    <Modal
      open={!!lane}
      onClose={onClose}
      width={460}
      title={lane ? `Score for ${name}` : 'Score'}
      description={`Round ${data.round.number} · ${data.event.format.holes} holes. The team line updates when you save.`}
      footer={
        <>
          {hasScore && (
            <Button variant="ghost" disabled={write.pending} onClick={() => void write.run(true)}>
              Clear score
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={write.pending} onClick={() => void write.run(false)}>
            Save score
          </Button>
        </>
      }
    >
      <form
        className="ch-tour-live-sheet"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          void write.run(false);
        }}
      >
        <label className="ch-field">
          <span className="ch-field__label">Round total</span>
          <input className="ch-input" inputMode="numeric" autoComplete="off" value={form.total} aria-invalid={touched && !!errors.total} onChange={(ev) => set({ total: ev.target.value })} placeholder="72" />
          {touched && errors.total && <span className="ch-field__help is-error">{errors.total}</span>}
        </label>
        <div className="ch-tour-live-sheet__nines">
          <label className="ch-field">
            <span className="ch-field__label">
              Front nine <span className="ch-field__opt">Optional</span>
            </span>
            <input className="ch-input" inputMode="numeric" autoComplete="off" value={form.front} aria-invalid={touched && !!errors.front} onChange={(ev) => set({ front: ev.target.value })} />
            {touched && errors.front && <span className="ch-field__help is-error">{errors.front}</span>}
          </label>
          <label className="ch-field">
            <span className="ch-field__label">
              Back nine <span className="ch-field__opt">Optional</span>
            </span>
            <input className="ch-input" inputMode="numeric" autoComplete="off" value={form.back} aria-invalid={touched && !!errors.back} onChange={(ev) => set({ back: ev.target.value })} />
            {touched && errors.back && <span className="ch-field__help is-error">{errors.back}</span>}
          </label>
        </div>
        <div className="ch-field">
          <label className="ch-field__label" htmlFor="ch-tour-live-status">
            How the round ended
          </label>
          <Select id="ch-tour-live-status" value={form.status} onChange={(v) => set({ status: v })} options={STATUS_OPTIONS} />
        </div>
        {form.status === 'wd' && (
          <label className="ch-field">
            <span className="ch-field__label">
              Withdrew after hole <span className="ch-field__opt">Optional</span>
            </span>
            <input className="ch-input" inputMode="numeric" autoComplete="off" value={form.wdAfterHole} aria-invalid={touched && !!errors.wdAfterHole} onChange={(ev) => set({ wdAfterHole: ev.target.value })} />
            {touched && errors.wdAfterHole && <span className="ch-field__help is-error">{errors.wdAfterHole}</span>}
          </label>
        )}
        <label className="ch-field">
          <span className="ch-field__label">
            Note <span className="ch-field__opt">Optional</span>
          </span>
          <input className="ch-input" maxLength={280} value={form.note} onChange={(ev) => set({ note: ev.target.value })} />
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
