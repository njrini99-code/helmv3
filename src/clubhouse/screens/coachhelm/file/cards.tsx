'use client';
import { AVATAR_SIZES, type AvatarSize } from '../../../ui/Avatar';
import { pluralWord } from '../../../lib/plural';

import Link from 'next/link';
import { Check, Eye, Flag, Lock, MessageSquare, Target, Users, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChDeepInsight } from '../../../data/coachhelm-dive-shape';
import { FILE_SIGN, fileAimLabel, fileAlertLabel, fileAreaLabel, playerKicker, type ChFileCards, type ChFileField, type ChFileIntent, type ChFilePlan, type ChFileSg, type ChFileStage, type ChFileTrack } from '../../../data/coachhelm-file-shape';
import { stanceOf, type ChInsight } from '../../../data/coachhelm-shape';
import { formatFixed } from '../../../lib/format';
import { initials } from '../../../lib/names';
import { Icon } from '../../../ui/Icon';
import type { ChFocusActions } from '../parts';

export type FileLens = 'coach' | 'player';

const AREA: Record<string, string> = { tee: 'Off the tee', approach: 'Approach', around: 'Around the green', putting: 'Putting', scoring: 'Course and scoring' };

export function CardHead({ title, meta, lock = false, id }: { title: string; meta?: ReactNode; lock?: boolean; id?: string }) {
  return (
    <div className="card__h">
      <h4 id={id}>
        {lock && <Icon icon={Lock} size={16} />}
        {title}
      </h4>
      {meta != null && <small>{meta}</small>}
    </div>
  );
}

export function Avatar({ name, size }: { name: string; size: AvatarSize }) {
  return (
    <span className="av" style={{ ['--s' as string]: `${AVATAR_SIZES[size]}px` }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function cmpCells(i: ChInsight, team: number | null) {
  const c = i.compare;
  const fmt = (v: number | null | undefined) => (v == null ? '—' : `${formatFixed(v, c?.unit === '%' ? 0 : Math.abs(v) < 10 ? 1 : 0)}${c?.unit ?? ''}`);
  const you = c?.own ?? null;
  const tour = c?.tour ?? null;
  const youLoses = you != null && tour != null && (c?.higherBetter ? you < tour : you > tour);
  return { you: c ? fmt(you) : (i.evidence.gauge?.you ?? i.value), team: fmt(team), tour: fmt(tour), youLoses };
}

/** The one green card: the top read, its comparison, its evidence (none hideable), and what can be done from here. The whole card opens the read. */
export function FeatureCard({
  d,
  lens,
  first,
  name,
  team,
  stage,
  coach,
  actions,
  onOpen,
}: {
  d: ChDeepInsight;
  lens: FileLens;
  first: string;
  name: string;
  team: number | null;
  stage: ChFileStage;
  coach: string;
  actions: ReactNode;
  onOpen: () => void;
}) {
  const b = d.base;
  const cells = cmpCells(b, team);
  const mine = lens === 'coach';
  const anchor = d.closes?.anchor === 'team' && team != null ? 'the team’s average' : 'the Tour';
  return (
    <section
      className="feat tap"
      data-ch-hf-read="top"
      data-ch="file-feature"
      role="button"
      tabIndex={0}
      aria-label={`Open the read: ${b.title}`}
      onClick={(e) => {
        if ((e.target as Element).closest?.('button, a')) return;
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onOpen();
      }}
    >
      {mine ? (
        <div className="feat__who">
          <Avatar name={name} size="sm" />
          <span>
            <b>{first}’s top read</b> · {AREA[d.area] ?? 'Course and scoring'}
          </span>
        </div>
      ) : (
        <div className="feat__k">{playerKicker(stage, coach)}</div>
      )}
      <h3 className="feat__t">{b.title}</h3>
      <div className="feat__cmp">
        <div>
          <b className={'ch-num' + (cells.youLoses ? ' loss' : '')}>{cells.you}</b>
          <span>{mine ? first : 'You'}</span>
        </div>
        <div>
          <b className="ch-num">{cells.team}</b>
          <span>Team</span>
        </div>
        <div>
          <b className="ch-num">{cells.tour}</b>
          <span>Tour</span>
        </div>
      </div>
      <p className="feat__p">
        {b.lede}
        {d.closes && (
          <>
            {' '}
            Closing it to {anchor} is worth <b>{d.closes.strokes} strokes a round</b>.
          </>
        )}
      </p>
      <div className="feat__ev">
        {b.evidence.sample && <span>{b.evidence.sample}</span>}
        {b.evidence.window && <span>{b.evidence.window}</span>}
        {d.firmness && <span>{d.firmness}</span>}
      </div>
      <div className="feat__acts">{actions}</div>
    </section>
  );
}

export function EarlyFeature({ lens, first, rounds, toGo }: { lens: FileLens; first: string; rounds: number | null; toGo: number | null }) {
  const floor = 4;
  const done = toGo == null ? 0 : Math.max(0, floor - toGo);
  return (
    <section className="feat" data-ch="file-feature">
      {lens === 'coach' ? (
        <div className="feat__who">
          <span>
            <b>{first}</b>
          </span>
        </div>
      ) : (
        <div className="feat__k">CoachHelm</div>
      )}
      <h3 className="feat__t">{lens === 'coach' ? 'No reads yet' : 'Your reads start after 4 full rounds'}</h3>
      <div className="prog" role="img" aria-label={`${done} of ${floor} rounds that count`}>
        {Array.from({ length: floor }, (_, i) => (
          <i key={i} className={i < done ? 'on' : ''} />
        ))}
        <span>
          {done} of {floor} rounds that count
        </span>
      </div>
      <div className="feat__ev">
        {rounds != null && <span>{rounds} rounds</span>}
        <span>Last 90 days</span>
      </div>
    </section>
  );
}

/** A coach's feature actions, by stage (06 §6). */
export function CoachActions({ stage, first, assigning, disabled, messageHref, canAssign, onAssign }: { stage: ChFileStage; first: string; assigning: boolean; disabled: boolean; messageHref: string; canAssign: boolean; onAssign: () => void }) {
  const message = (
    <a className="btn ghost" href={messageHref}>
      <Icon icon={MessageSquare} size={18} />
      Message {first}
    </a>
  );
  if (stage === 'suggested' || stage === 'shown')
    return (
      <>
        <span className="btn is-done" role="status">
          <Icon icon={Check} size={18} />
          Sent to {first}
        </span>
        {message}
      </>
    );
  if (stage === 'accepted')
    return (
      <span className="btn is-done" role="status">
        <Icon icon={Check} size={18} />
        {first} accepted it
      </span>
    );
  return (
    <>
      {canAssign && (
        <button type="button" className="btn light" data-ch-hf-assign="" data-ch-press="" disabled={assigning || disabled} aria-busy={assigning || undefined} onClick={onAssign}>
          <Icon icon={Flag} size={18} />
          {assigning ? 'Assigning' : 'Assign as focus'}
        </button>
      )}
      {message}
    </>
  );
}

export function PlanCard({ plan, lens, first, onDrawn }: { plan: ChFilePlan | null; lens: FileLens; first: string; onDrawn?: string }) {
  const mine = lens === 'coach';
  const stage = plan?.stage ?? 'none';
  const meta = stage === 'accepted' ? `Focus since ${plan?.since ?? ''}` : stage === 'declined' ? `Declined ${plan?.handshake.declined ?? ''}` : stage === 'none' ? 'No focus yet' : 'Waiting on an answer';
  const shown = plan?.handshake.shown;
  const shownReached = !!shown && shown !== 'unknown';
  const accepted = !!plan?.handshake.accepted;
  const declined = !!plan?.handshake.declined;
  const line = !plan ? 'No focus yet' : stage === 'accepted' ? `Accepted ${plan.since ?? ''}` : stage === 'declined' ? `You declined this on ${plan.handshake.declined ?? ''}` : stage === 'none' ? 'No focus yet' : 'Waiting for your answer';
  return (
    <section className="card" aria-labelledby="ch-hf-plan" data-ch-anchor="plan">
      <CardHead id="ch-hf-plan" title={mine ? `${first}’s plan` : 'Your plan'} meta={meta} />
      <div className="card__b">
        {mine ? (
          <div className="hs" data-ch-hs={onDrawn}>
            <Step on={stage !== 'none'} label="Suggested" date={plan?.handshake.suggested ?? 'Not yet'} next={shownReached || accepted || declined} />
            <Step on={shownReached || accepted} label={`Shown to ${first}`} date={shown === 'unknown' ? '—' : shownReached ? (shown as string) : accepted ? '—' : 'Not yet'} next={accepted} />
            {declined ? <Step on={false} label="Declined" date={plan?.handshake.declined ?? ''} tone="loss" /> : <Step on={accepted} label="Accepted" date={plan?.handshake.accepted ?? 'Not yet'} />}
          </div>
        ) : (
          <div className="rows ch-hf-coachline">
            <div className="r static">
              <span className="r__ic">
                <Icon icon={Users} size={16} />
              </span>
              <span className="r__t">
                <b>{stage === 'none' ? 'CoachHelm' : `From ${plan?.coach ?? 'Your coach'}`}</b>
                <small>{line}</small>
              </span>
            </div>
          </div>
        )}
        {plan?.goal && <GoalBlock goal={plan.goal} />}
        {plan?.practice && (
          <div className="drill">
            <span className="r__ic">
              <Icon icon={Target} size={16} />
            </span>
            <span>
              <b>{plan.practice.drill}</b>
              <small>
                {plan.practice.count} {pluralWord(plan.practice.count, 'session', 'sessions')} logged this week
              </small>
            </span>
          </div>
        )}
      </div>
      {stage === 'none' && mine && <p className="card__n">Assign a focus from any read. {first} sees it as yours, by name.</p>}
    </section>
  );
}

function Step({ on, label, date, next = false, tone }: { on: boolean; label: string; date: string; next?: boolean; tone?: 'loss' }) {
  return (
    <div className={'hs__s' + (on ? ' on' : '') + (next ? ' next' : '') + (tone ? ' is-loss' : '')}>
      <span className="fill" />
      <i>
        {on && (
          <svg viewBox="0 0 12 12" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 6.5 5 9l4.5-5.5" />
          </svg>
        )}
      </i>
      <b>{label}</b>
      <small>{date}</small>
    </div>
  );
}

function GoalBlock({ goal }: { goal: NonNullable<ChFilePlan['goal']> }) {
  const W = 320;
  const H = 72;
  const vals = [...goal.points.map((p) => p.value), ...(goal.target != null ? [goal.target] : [])];
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 1;
  const pad = (hi - lo || 1) * 0.1;
  const x = (i: number) => (goal.points.length < 2 ? W / 2 : 6 + (i * (W - 12)) / (goal.points.length - 1));
  const y = (v: number) => 8 + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - 26);
  const chip = goal.word === 'Improved' ? 'gain' : goal.word === 'Worse' ? 'loss' : 'plain';
  return (
    <div className="goal">
      <div className="goal__t">
        <b>{goal.title}</b>
        <small>{goal.line}</small>
      </div>
      {goal.word && <span className={`chip ${chip}`}>{goal.word}</span>}
      {goal.points.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${goal.title}: ${goal.points.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
          {goal.target != null && (
            <>
              <line x1="0" x2={W} y1={y(goal.target)} y2={y(goal.target)} className="gl" />
              <text x={W} y={y(goal.target) - 4} textAnchor="end" className="gt">
                Goal {goal.target}
              </text>
            </>
          )}
          <polyline points={goal.points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} className="pl" />
          {goal.points.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={i === goal.points.length - 1 && goal.worse ? 4.5 : 3} className={i === goal.points.length - 1 && goal.worse ? 'pt hi' : 'pt'} />
          ))}
          <text x="0" y={H - 2} className="gd">
            {goal.points[0]?.label}
          </text>
          <text x={W} y={H - 2} textAnchor="end" className="gd">
            {goal.points[goal.points.length - 1]?.label}
          </text>
        </svg>
      )}
    </div>
  );
}

export function FieldCard({ field }: { field: ChFileField }) {
  const [lo, hi] = field.scale;
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <section className="card" aria-labelledby="ch-hf-field" data-ch-anchor="field">
      <CardHead id="ch-hf-field" title="Last round in context" meta={field.meta} />
      <div className="card__b">
        <div className="field">
          <div className="field__t">
            <b>{field.head}</b>
            <small>{field.sentence}</small>
          </div>
          <div className={'field__fig' + (field.band === 'level' ? ' is-level' : field.band === 'behind' ? ' is-behind' : '')}>
            {field.figure}
            <small>vs the field</small>
          </div>
        </div>
        <div className="dots" role="img" aria-label={`${field.caption}. ${field.label}.`}>
          {field.dots?.map((v, i) => (
            <i key={i} style={{ left: at(v) }} />
          ))}
          <i className="mean" style={{ left: at(field.mean) }} />
          <i className="me" style={{ left: at(field.me) }} />
        </div>
        <div className="dots__lab ch-num">
          <span>{FILE_SIGN(lo)}</span>
          <span>{field.caption}</span>
          <span>{FILE_SIGN(hi)}</span>
        </div>
      </div>
    </section>
  );
}

export function SgCard({ sg, who, standingHref }: { sg: ChFileSg; who: string; standingHref: string | null }) {
  return (
    <section className="card" aria-labelledby="ch-hf-sg" data-ch-anchor="sg">
      <CardHead id="ch-hf-sg" title="Where the strokes go" meta={`${who} vs Tour and team`} />
      <div className="card__b">
        <div className="sg">
          {sg.rows.map((r) => {
            const width = r.strokes == null ? 0 : Math.min(1, Math.abs(r.strokes)) * 50;
            return (
              <div className="sg__row" key={r.id}>
                <span>{r.label}</span>
                <div className="sg__trk">
                  {r.strokes != null && <i className={`sg__bar ${toneOfStrokes(r.strokes)}`} style={{ width: `${width}%` }} />}
                  {r.team != null && <i className="sg__team" style={{ left: `${50 + Math.max(-1, Math.min(1, r.team)) * 50}%` }} />}
                </div>
                <b className={r.tone === 'none' ? 'none' : r.tone}>{r.figure}</b>
              </div>
            );
          })}
          <div className="sg__axis">
            <span />
            <div>
              <span>−1.0</span>
              <span>Tour</span>
              <span>+1.0</span>
            </div>
            <span />
          </div>
          {sg.hasTeam && (
            <div className="sg__key">
              <i className="sg__team" />
              Team average
            </div>
          )}
        </div>
      </div>
      <p className="card__n">
        {sg.needsHoles ? 'Strokes gained needs hole-by-hole scores. ' : sg.note ? `${sg.note} ` : ''}
        {sg.source}.
        {standingHref && (
          <>
            {' '}
            <Link className="lnk" href={standingHref}>
              Full standing
            </Link>
          </>
        )}
      </p>
    </section>
  );
}

function readRow(d: ChDeepInsight, lens: FileLens, assigned: boolean, onOpen: (id: string) => void) {
  const stance = stanceOf(d.base, assigned ? 'proposed' : d.base.assigned);
  const tone = assigned || d.base.assigned ? 'acc' : d.base.strength ? 'gain' : d.base.priority === 'high' ? 'loss' : 'plain';
  const area = AREA[d.area] ?? 'Course and scoring';
  const firm = lens === 'player' ? d.base.evidence.read?.word : d.firmness;
  return (
    <button type="button" className="r" key={d.base.id} data-ch-hf-read={d.base.id} onClick={() => onOpen(d.base.id)}>
      <span className={`chip ${tone}`}>{stance.word}</span>
      <span className="r__t">
        <b className="l2">{d.base.title}</b>
        <small>{[area, d.base.value, firm].filter(Boolean).join(' · ')}</small>
      </span>
      <span className="r__e">
        <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">
          <path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}

export function ReadsCard({ cards, lens, fa, onOpen, moreLine }: { cards: ChFileCards; lens: FileLens; fa?: ChFocusActions; onOpen: (id: string) => void; moreLine?: string }) {
  const mine = lens === 'coach';
  const gone = fa?.dismissed ?? {};
  const open = cards.reads.filter((d) => !gone[d.base.id]);
  const justGone = cards.reads.filter((d) => gone[d.base.id]);
  const dismissed = [...justGone.map((d) => ({ id: d.base.id, title: d.base.title, lifecycle: d.base.lifecycle, ins: d.base })), ...cards.dismissed.filter((x) => !cards.reads.some((d) => d.base.id === x.id)).map((x) => ({ ...x, ins: null as ChInsight | null }))];
  if (!mine && open.length === 0) return null;
  return (
    <section className="card" aria-labelledby="ch-hf-reads" data-ch-anchor="reads">
      <CardHead
        id="ch-hf-reads"
        title={mine ? 'All reads' : 'Also worth knowing'}
        meta={
          mine ? (
            <span className="ch-num">
              {open.length} open{dismissed.length ? ` · ${dismissed.length} dismissed` : ''}
            </span>
          ) : undefined
        }
      />
      {open.length === 0 && dismissed.length === 0 ? (
        <p className="card__n ch-hf-none">No reads yet</p>
      ) : (
        <div className="rows">
          {open.map((d) => readRow(d, lens, !!fa?.assigned[d.base.id], onOpen))}
          {mine &&
            dismissed.map((x) => (
              <div className="r static undo" key={x.id}>
                <span className="r__ic">
                  <Icon icon={X} size={16} />
                </span>
                <span className="r__t">
                  <b>Dismissed: {x.title}</b>
                </span>
                <button
                  type="button"
                  className="lnk"
                  data-ch-hf-undo=""
                  disabled={fa?.busy}
                  onClick={() => {
                    const ins = x.ins ?? ({ id: x.id, lifecycle: x.lifecycle } as unknown as ChInsight);
                    void fa?.undo.run({ playerId: '', first: '', ins });
                  }}
                >
                  {fa?.here('undo', x.id) ? 'Undoing' : 'Undo'}
                </button>
              </div>
            ))}
        </div>
      )}
      {moreLine && <p className="card__n">{moreLine}</p>}
    </section>
  );
}

export function WorkingCard({ list, onOpen }: { list: ChDeepInsight[]; onOpen: (id: string) => void }) {
  const d = list[0];
  if (!d) return null;
  return (
    <section className="card" aria-labelledby="ch-hf-working">
      <CardHead id="ch-hf-working" title="What’s working" meta="Top strength" />
      <div className="rows">
        <button type="button" className="r" data-ch-hf-read={d.base.id} onClick={() => onOpen(d.base.id)}>
          <span className="chip gain">Working</span>
          <span className="r__t">
            <b className="l2">{d.base.title}</b>
            <small>{d.base.value}</small>
          </span>
        </button>
      </div>
    </section>
  );
}

export function IntentCard({ intent, first, onEdit }: { intent: ChFileIntent | null; first: string; onEdit: () => void }) {
  const only = (
    <span className="vis">
      <Icon icon={Eye} size={14} />
      Only you
    </span>
  );
  return (
    <section className="card" aria-labelledby="ch-hf-intent" data-ch-anchor="intent">
      <CardHead id="ch-hf-intent" lock title={`Your plan for ${first}`} meta={only} />
      {intent ? (
        <>
          <div className="card__b">
            <dl className="kv">
              <dt>Aim</dt>
              <dd>{fileAimLabel(intent.aim)}</dd>
              <dt>Alerts</dt>
              <dd>{fileAlertLabel(intent.alerts)}</dd>
              <dt>Watching</dt>
              <dd>{intent.watching.length ? intent.watching.map(fileAreaLabel).join(', ') : 'Nothing in particular'}</dd>
              {intent.note && (
                <>
                  <dt>Note</dt>
                  <dd className="is-note">{intent.note}</dd>
                </>
              )}
            </dl>
          </div>
          <p className="card__n">
            <button type="button" className="lnk ch-hf-44" data-ch-hf-intent-edit="" onClick={onEdit}>
              Edit plan
            </button>
          </p>
        </>
      ) : (
        <div className="card__b">
          <p className="cb-p">
            Not set yet. Until you set one, CoachHelm treats {first} as <b>Develop</b> with <b>Balanced</b> alerts.
          </p>
          <button type="button" className="btn sec" data-ch-hf-intent-edit="" data-ch-press="" onClick={onEdit}>
            Set a plan
          </button>
        </div>
      )}
    </section>
  );
}

export function TrackCard({ track, first }: { track: ChFileTrack; first: string }) {
  const measured = track.rows.length > 0;
  return (
    <section className="card" aria-labelledby="ch-hf-track" data-ch-anchor="track">
      <CardHead id="ch-hf-track" lock title={`Track record with ${first}`} meta="This season" />
      {track.assigned === 0 ? (
        <div className="card__b">
          <p className="cb-p">No focus assigned to {first} yet this season. Each one you assign lands here with how it went.</p>
        </div>
      ) : (
        <div className="card__b">
          <div className="tr3">
            <div>
              <b>{track.assigned}</b>
              <span>Focuses assigned</span>
            </div>
            <div>
              <b className={measured ? 'gain' : ''}>{measured ? track.improved : '—'}</b>
              <span>Improved</span>
            </div>
            <div>
              <b>{measured ? track.noChange : '—'}</b>
              <span>No change</span>
            </div>
          </div>
          {!measured && <p className="cb-p">Not measured yet. {track.open} open.</p>}
          {measured && (
            <div className="rows ch-hf-trackrows">
              {track.rows.map((r) => (
                <div className="r static" key={r.id}>
                  <span className={`chip ${r.word === 'Improved' ? 'gain' : 'plain'}`}>{r.word}</span>
                  <span className="r__t">
                    <b>{r.title}</b>
                    {r.meta && <small className="ch-num">{r.meta}</small>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** A bar's side on the strokes rail: which way it's drawn. */
function toneOfStrokes(v: number): 'loss' | 'gain' {
  return v >= 0 ? ('gain' as const) : ('loss' as const);
}
