'use client';
import { CH_DUR } from '../../../lib/motion';

import { Badge } from '../../../ui/Badge';
import { CorrectionChips } from '../Corrections';
import { formatFixed } from '../../../lib/format';
import { plural } from '../../../lib/plural';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronRight, Flag, MessageSquare, Target, Check } from 'lucide-react';
import Link from 'next/link';
import type { ChReadDetail, ChReadView } from '../../../data/coachhelm-read-view-shape';
import { assignStateOf } from '../../../data/coachhelm-read-view-shape';
import type { ChBoardMissing } from '../../../data/coachhelm-shape';
import type { ChViewVoice } from '../../../data/coachhelm-views-shape';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import type { ChFocusActions } from '../parts';
import { ReadLadder } from './ReadLadder';

function Card({ id, title, meta, obs, children }: { id: string; title: string; meta?: string | null; obs?: string; children: React.ReactNode }) {
  return (
    <section className="card" id={id} data-ch-hr-card={id === 'cfun' ? 'where' : id.slice(1)} aria-label={title}>
      <div className="ch">
        <h4>{title}</h4>
        {obs ? <span className="obs">{obs}</span> : meta ? <span className="meta">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function ReadHeadline({ d, view, coach, assigned }: { d: ChReadDetail; view: ChReadView; coach: boolean; assigned: boolean }) {
  const h = d.headline;
  const stale = !!h.stale;
  return (
    <article className={'feat ch-hr-feat' + (stale ? ' is-out' : '')} id="rfeat">
      <div className="k">
        <span>
          {coach ? `${view.head.first} · ` : ''}
          {view.area}
        </span>
        <span className={'st' + (stale ? ' plain' : '')}>{stale ? 'Out of date' : assigned && coach ? 'Assigned' : d.stance}</span>
      </div>
      <h3>{h.title}</h3>
      <p className="lede">{h.lede}</p>
      <div className="hero">
        <b>{h.value}</b>
        {h.valueNote && <span>{h.valueNote}</span>}
      </div>
      {h.ladder && <ReadLadder ladder={h.ladder} onGreen />}
      {h.worth && (
        <div className="ffoot">
          <span className="worth">
            Worth about {h.worth.strokes} a round{h.worth.to === 'team' ? ', closed to the team average' : h.worth.to === 'tour' ? ', closed to Tour' : ''}
          </span>
          {h.worth.estimated && <span>estimated</span>}
        </div>
      )}
      <div className="ffoot ch-hr-foot2">
        <span className="num">{[h.foot.sample, h.foot.firm, coach ? h.foot.rung : null].filter(Boolean).join(' · ')}</span>
        {h.foot.through && <span className="num">{h.foot.through}</span>}
      </div>
      {h.stale && (
        <p className="stale" data-ch-code="CH-13903">
          {h.stale}
        </p>
      )}
    </article>
  );
}

/** The bars scale from the left, once, the first time the card shows (02-PLAN 7.2). */
export function WhereCard({ funnel, pictures }: { funnel: NonNullable<ChReadDetail['funnel']>; pictures: boolean }) {
  const first = funnel.steps.find((s) => s.n != null)?.n ?? 0;
  const lastBar = funnel.steps.reduce((acc, s, i) => (s.n != null ? i : acc), -1);
  return (
    <Card id="cfun" title="Where it shows up" obs="Observed, not a cause">
      <div className="cb">
        <div className="fun">
          {funnel.steps.map((s, i) => (
            <div className="fstep" key={`${s.label}-${i}`}>
              <div className="fhead">
                <span>{s.label}</span>
                {s.n != null && <span className="n">{s.n}</span>}
              </div>
              {pictures && s.n != null && first > 0 && (
                <div className="ftrack">
                  <div className={'fbar' + (i === lastBar ? ' last' : '')} style={{ ['--ch-hr-s' as string]: s.n / first }} />
                </div>
              )}
              {i > 0 && <div className="why">{s.statement}</div>}
            </div>
          ))}
        </div>
        {!funnel.stopped && <div className="cn">Each step only shows when its count clears the engine’s floor. Here all {funnel.steps.length} passed.</div>}
      </div>
    </Card>
  );
}

export function WhyCard({ d, voice, pictures }: { d: ChReadDetail; voice: ChViewVoice; pictures: boolean }) {
  const coach = voice.role === 'coach';
  const first = coach ? voice.first : 'you';
  const c = d.cause;
  const legacy = d.legacy;
  if (!c && !legacy) return null;
  if (!c && legacy)
    return (
      <Card id="cwhy" title="Why CoachHelm thinks so">
        <div className="cb">
          <div className="verdict">
            <b>{legacy.cause}</b>
            {legacy.reason && <span className="q">{legacy.reason}</span>}
          </div>
        </div>
      </Card>
    );
  const cause = c!;
  const labels = coach ? ['Not traced', 'Likely, from totals', 'Counted in shots'] : ['Not traced yet', 'Seen in your shots'];
  const idx = coach ? cause.track : cause.state === 'counted' ? 1 : 0;
  const last = labels.length - 1;
  return (
    <Card id="cwhy" title="Why CoachHelm thinks so" meta={cause.state === 'counted' ? 'Counted' : cause.state === 'likely' ? 'Likely' : 'Not traced yet'}>
      <div className="cb">
        <div className="stepper" style={{ ['--ch-hr-n' as string]: labels.length }} aria-hidden="true">
          {labels.map((l, i) => (
            <i key={l} className={(i <= idx ? 'on' : '') + (idx === last ? ' counted' : '')} />
          ))}
        </div>
        <div className="slab" style={{ ['--ch-hr-n' as string]: labels.length }}>
          {labels.map((l, i) => (
            <span key={l} className={i === idx ? 'on' : ''}>
              {l}
            </span>
          ))}
        </div>
        {cause.state === 'likely' && (
          <>
            {pictures && (
              <div className="arms">
                {cause.arms.map((a) => (
                  <div className="arm" key={a.label}>
                    <div className="ah">
                      <span>{a.label}</span>
                      <span className="n">
                        {a.failures} of {a.n} missed · {Math.round((a.failures / a.n) * 100)}%
                      </span>
                    </div>
                    {a.n > 30 ? (
                      // Too many holes to count by eye: their share, on one track (RC-5).
                      <div className="dotsbar" aria-hidden="true">
                        <i style={{ transform: `scaleX(${a.failures / a.n})` }} />
                      </div>
                    ) : (
                      <div className="dots" aria-hidden="true">
                        {Array.from({ length: a.n }, (_, i) => (
                          <i key={i} className={i < a.failures ? 'f' : ''} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="verdict">
              <b>Likely, from the totals.</b> {cause.verdict}
              <span className="q">
                {cause.range ? `${cause.range} ` : ''}No shot path is counted yet, so this is not a measured cause.
              </span>
            </div>
          </>
        )}
        {cause.state === 'counted' && (
          <>
            {pictures && cause.path.length > 0 && (
              <div className="path">
                {cause.path.map((p, i) => (
                  <div className={'pn' + (i === cause.path.length - 1 ? ' hit' : '')} key={`${p}-${i}`}>
                    <span className="nd">
                      <Icon icon={i === cause.path.length - 1 ? Flag : Target} size={16} />
                    </span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="verdict">
              <b>{cause.count}.</b> {cause.eventStrokes != null ? `On average one cost about ${formatFixed(Math.abs(cause.eventStrokes), 1)} strokes.` : ''}
              <span className="q">Counted in {coach ? `${first}’s` : 'your'} recorded shots on these holes.</span>
            </div>
            {cause.holes.length > 0 && (
              <div className="holes">
                {cause.holes.slice(0, 5).map((h) =>
                  h.href ? (
                    <Link className="hole" key={h.key} href={h.href}>
                      {h.date} · hole {h.hole}
                    </Link>
                  ) : (
                    <span className="hole" key={h.key}>
                      {h.date} · hole {h.hole}
                    </span>
                  ),
                )}
                {cause.holes.length > 5 && <span className="holes__more ch-num">+{cause.holes.length - 5} more</span>}
              </div>
            )}
          </>
        )}
        {cause.state === 'not_traced' && (
          <>
            {pictures && cause.gap && (
              <div className="meter" aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} className={i < Math.round((cause.gap!.have / cause.gap!.need) * 10) ? 'f' : ''} />
                ))}
              </div>
            )}
            <div className="verdict">
              <b>{cause.gap ? `Not traced yet: ${cause.gap.have} of ${cause.gap.need}.` : 'Not traced yet.'}</b> {cause.gap?.text ?? cause.text ?? (cause.countDown ? `${cause.countDown.haveEvents} of the ${cause.countDown.needEvents} it needs, over ${cause.countDown.haveRounds} of ${cause.countDown.needRounds} rounds.` : 'CoachHelm says why once one repeats in the shots.')}
              {cause.gap && <span className="q">Nothing new is asked. It fills as {voice.role === 'coach' ? voice.first : 'you'} play{voice.role === 'coach' ? 's' : ''}.</span>}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export function SureCard({ d, voice, pictures }: { d: ChReadDetail; voice: ChViewVoice; pictures: boolean }) {
  const s = d.sure;
  if (!s.rows.length && !s.checked.length && !s.rung) return null;
  return (
    <Card id="csure" title="How sure" meta={s.word}>
      <div className="cb">
        <div className="sure">
          {s.rows.map((r) => {
            const w = Math.min(1, r.have / (r.need || 1));
            return (
              <div className="sr2" key={r.k}>
                <b>{r.k}</b>
                <span className="n">{r.text}</span>
                {pictures && (
                  <span className="tr">
                    <i className={w < 0.8 ? 'mid' : ''} style={{ width: '100%', transform: `scaleX(${w})`, transformOrigin: '0 50%' }} />
                  </span>
                )}
              </div>
            );
          })}
          {s.checked.length > 0 && (
            <div>
              <div className="ch-hr-checkedh">What CoachHelm checked</div>
              <ul className="checked">
                {s.checked.map((c) => (
                  <li key={c}>
                    <Icon icon={Check} size={14} />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.insight.engine?.corrections && (
            <div className="ch-hr-correct">
              <b>Is this read right?</b>
              <CorrectionChips c={d.insight.engine.corrections} />
            </div>
          )}
          {voice.role === 'coach' && s.rung && (
            <div className="verdict ch-hr-rung">
              <b>{s.rung.word}</b>
              <span className="coach">Coach only</span>
              {s.rung.range && <span className="q">{s.rung.range}</span>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function MovedCard({ d, failed, pictures }: { d: ChReadDetail; failed: boolean; pictures: boolean }) {
  const m = d.moved;
  if (!m)
    return (
      <Card id="cmoved" title="How it has moved">
        <div className="cb">
          <p className="ch-hr-plainp" data-ch-code="CH-13383">
            No trend yet. This read has one check so far, so there is nothing to compare it with.
          </p>
        </div>
      </Card>
    );
  const W = 300;
  const H = 118;
  const l = 40;
  const r = W - 40;
  const vals = [m.from, m.to, ...(m.ref ? [m.ref.value] : [])];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const y = (v: number) => 24 + (1 - (v - min) / (max - min || 1)) * (H - 54);
  const f = (v: number) => formatFixed(v);
  const stroke = m.tone === 'good' || m.tone === 'gain' ? 'var(--ch-hr-gain-fill)' : m.tone === 'warn' || m.tone === 'loss' ? 'var(--ch-hr-loss-fill)' : 'var(--ch-hr-neutral-fill)';
  // The lower figure sits under its point, so the two never meet on a flat line.
  const below = (a: number, b: number) => a < b && y(a) - y(b) < 24;
  return (
    <Card id="cmoved" title="How it has moved" meta="Last change">
      <div className="cb">
        {pictures && (
          <svg className="moved" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={m.text}>
            {m.ref && <line x1={l - 10} x2={r + 10} y1={y(m.ref.value)} y2={y(m.ref.value)} stroke="var(--ch-hr-zero)" strokeWidth="1.2" strokeDasharray="3 4" />}
            {m.ref && (
              <text x={r + 10} y={y(m.ref.value) - 6} textAnchor="end" fontSize="12" fill="var(--ch-hr-ink-2)">
                {m.ref.label}
              </text>
            )}
            <line x1={l} x2={r} y1={y(m.from)} y2={y(m.to)} stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
            <circle cx={l} cy={y(m.from)} r="5" fill="var(--ch-hr-card)" stroke="var(--ch-hr-neutral-fill)" strokeWidth="2.5" />
            <circle cx={r} cy={y(m.to)} r="6" fill={stroke} />
            <text x={l} y={below(m.from, m.to) ? y(m.from) + 20 : y(m.from) - 12} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--ch-hr-ink)">
              {f(m.from)}
            </text>
            <text x={r} y={below(m.to, m.from) ? y(m.to) + 20 : y(m.to) - 12} textAnchor="end" fontSize="13" fontWeight="600" fill="var(--ch-hr-ink)">
              {f(m.to)}
            </text>
            <text x={l} y={H - 4} textAnchor="middle" fontSize="12" fill="var(--ch-hr-ink-3)">
              Before
            </text>
            <text x={r} y={H - 4} textAnchor="end" fontSize="12" fill="var(--ch-hr-ink-3)">
              Now
            </text>
          </svg>
        )}
        <p className={'ch-hr-plainp is-' + m.tone}>{m.text}</p>
        {failed ? (
          <p className="ch-hr-plainp" role="status" data-ch-code="CH-13283">
            The category read didn’t load.
          </p>
        ) : m.theme?.sg ? (
          <span className="ch-hr-chip"><Badge>
            {m.theme.label} strokes gained {m.theme.sg} a round{m.theme.trend ? ` · ${m.theme.trend.word}` : ''}
          </Badge></span>
        ) : null}
      </div>
    </Card>
  );
}

export function RoundsCard({ d, failed, voice }: { d: ChReadDetail; failed: boolean; voice: ChViewVoice }) {
  const [all, setAll] = useState(false);
  if (failed)
    return (
      <Card id="crounds" title="The rounds behind it">
        <div className="ntc" role="note" data-ch-code="CH-13281">
          <div className="c">
            <span>
              <b>The rounds behind this read didn’t load.</b> The read itself is complete. Try again at the top of the read.
            </span>
          </div>
        </div>
      </Card>
    );
  const list = d.rounds.list;
  const coach = voice.role === 'coach';
  if (!list.length)
    return (
      <Card id="crounds" title="The rounds behind it">
        <div className="cb">
          <p className="ch-hr-plainp" data-ch-code="CH-13382">
            {d.rounds.total > 0
              ? `This read was made from ${plural(d.rounds.total, 'round')}, but none of them can be listed here. They may be rounds ${coach ? `${voice.first} has` : 'you have'} since removed.`
              : `This read does not name the rounds it was made from. It uses ${coach ? `${voice.first}’s` : 'your'} stats over its window, so there is no list to show.`}
          </p>
        </div>
      </Card>
    );
  const shown = all ? list.slice(0, 8) : list.slice(0, 4);
  return (
    <Card id="crounds" title="The rounds behind it" meta={plural(d.rounds.total, 'round')}>
      {shown.map((r) => {
        const body = (
          <>
            <div className="c">
            <b>
              {r.date}
              {r.course ? ` · ${r.course}` : ''}
            </b>
            <span>
              {r.counted > 0 && (
                <span className="cdots" aria-hidden="true">
                  {Array.from({ length: Math.min(r.counted, 9) }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
              )}
              {r.counted ? `${r.counted} counted ${r.counted > 1 ? 'holes' : 'hole'}` : 'Counted in the read'}
            </span>
          </div>
          <span className="v">
            {r.score} {r.toPar && <span className="ch-hr-topar">{r.toPar}</span>}
          </span>
            {r.href && (
              <span className="chev">
                <Icon icon={ChevronRight} size={14} />
              </span>
            )}
          </>
        );
        return r.href ? (
          <Link className="row tap" key={r.id} href={r.href} aria-label={`Review the round on ${r.date}${r.course ? ` at ${r.course}` : ''}`}>
            {body}
          </Link>
        ) : (
          <div className="row" key={r.id}>
            {body}
          </div>
        );
      })}
      {list.length > 4 && (
        <button type="button" className="row tap ch-hr-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          <span className="c">
            <b>{all ? 'Show fewer' : list.length > 8 ? `Show newest 8 of ${list.length}` : `Show all ${list.length}`}</b>
          </span>
        </button>
      )}
    </Card>
  );
}

export function DoCard({ d, voice, fa, missing, messageHref, askHref, practiceHref }: { d: ChReadDetail; voice: ChViewVoice; fa: ChFocusActions; missing?: ChBoardMissing; messageHref: string | null; askHref: string | null; practiceHref: string | null }) {
  const coach = voice.role === 'coach';
  const first = coach ? voice.first : '';
  const ins = d.insight;
  const target = { playerId: coach ? voice.playerId : ins.playerId, first, ins };
  const mine = fa.assigned[ins.id] ?? ins.assigned;
  const state = assignStateOf(ins, { dismissed: !!fa.dismissed[ins.id], assigned: !!mine, missing });
  const flash = useRef<HTMLDivElement | null>(null);
  const wasAssigned = useRef(!!mine);
  useEffect(() => {
    if (mine && !wasAssigned.current) flash.current?.animate([{ opacity: 0.7 }, { opacity: 1 }], { duration: CH_DUR.release * 1000 });
    wasAssigned.current = !!mine;
  }, [mine]);
  return (
    <Card id="cdo" title="What to do" meta="This week">
      <div className="cb" ref={flash}>
        <div className="drill">
          <span className="dicon">
            <Icon icon={Target} size={20} />
          </span>
          <div>
            <b>{d.todo.drill?.title ?? d.todo.drill?.text ?? 'No drill assigned.'}</b>
            {d.todo.drill?.meta && <span className="m">{d.todo.drill.meta}</span>}
            {d.todo.drill?.title && d.todo.drill.text && <p>{d.todo.drill.text}</p>}
          </div>
        </div>
        {(d.todo.worth || d.todo.startsFrom) && (
          <div className="targets">
            {d.todo.worth && (
              <div className="tg">
                <span>Worth</span>
                <b>{d.todo.worth} a round</b>
              </div>
            )}
            {d.todo.verdict ? (
              <div className="tg">
                <span>Focus verdict</span>
                <b>{d.todo.verdict.word}</b>
              </div>
            ) : (
              d.todo.startsFrom && (
                <div className="tg">
                  <span>Starts from</span>
                  <b>{d.todo.startsFrom}</b>
                </div>
              )
            )}
          </div>
        )}
        {coach && (
          <div className="ch-hr-acts">
            {state === 'dismissed' && (
              <div className="ntc" role="status" data-ch-code="CH-13901">
                <div className="c">
                  <span>
                    <b>Insight dismissed.</b> It no longer shows on your board or on {first}’s. Undo brings it back.
                  </span>
                  <Button variant="ghost" size="sm" busy={fa.here('undo', ins.id)} onClick={() => void fa.undo.run(target)}>
                    Undo
                  </Button>
                </div>
              </div>
            )}
            {state === 'assigned' && (
              <>
                <div className="assigned" role="status" data-ch-code="CH-13601">
                  <svg className="check" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m4 10.5 4 3.8L16 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Assigned as {first}’s focus
                </div>
                <p className="am">{first} sees it as a proposal and accepts it to start.</p>
              </>
            )}
            {state === 'unknown' && (
              <div className="ntc" role="note" data-ch-code="CH-13207">
                <div className="c">
                  <span>
                    <b>Assign as focus isn’t offered right now.</b> Whether this read was already assigned couldn’t be checked. Try again in a moment.
                  </span>
                </div>
              </div>
            )}
            {state === 'stale' && (
              <p className="am" data-ch-code="CH-13906">
                This read is older than {first}’s newest round, so it can’t be assigned as a focus yet.
              </p>
            )}
            {(state === 'open' || state === 'declined') && (
              <>
                <Button variant="primary" leftIcon={Flag} busy={fa.here('assign', ins.id)} disabled={fa.busy && !fa.here('assign', ins.id)} onClick={() => void fa.assign.run(target)}>
                  {fa.here('assign', ins.id) ? 'Assigning…' : state === 'declined' ? 'Propose again' : 'Assign as focus'}
                </Button>
                {state === 'declined' && (
                  <p className="am" data-ch-code="CH-13907">
                    {first} declined this as a focus. Propose again sends it back as a new proposal.
                  </p>
                )}
              </>
            )}
          </div>
        )}
        <div className="linkrow">
          {coach && messageHref && (
            <Link className="lk" href={messageHref}>
              <Icon icon={MessageSquare} size={16} />
              Message {first}
            </Link>
          )}
          {askHref && (
            <Link className="lk" href={askHref}>
              Ask CoachHelm about this
            </Link>
          )}
          {practiceHref && (
            <Link className="lk" href={practiceHref}>
              <Icon icon={CalendarDays} size={16} />
              Add to practice plan
            </Link>
          )}
        </div>
        <div className="plan">
          <span className={'sdot ' + (d.todo.plan.focus ? 'good' : 'plain')} />
          {d.todo.plan.focus ? `Focus area · ${d.todo.plan.focus.word} · ${d.todo.plan.focus.fromThis ? 'from this read' : d.todo.plan.focus.title}.` : d.todo.plan.goal ? `Goal · ${d.todo.plan.goal.word} · ${d.todo.plan.goal.title}.` : coach ? 'Not part of a focus area or goal yet.' : 'Not part of a focus area or goal yet. Your coach can make it one.'}
        </div>
      </div>
    </Card>
  );
}
