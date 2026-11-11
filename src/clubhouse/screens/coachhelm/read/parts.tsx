'use client';

import { Check, ChevronDown, ChevronRight, Flag, Target } from 'lucide-react';
import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import type { ChDiveRound } from '../../../data/coachhelm-dive-shape';
import type { ChReadDetail, ChReadView, ChReadsRailRow } from '../../../data/coachhelm-read-view-shape';
import { PLAYER_HELM_DEVELOPMENT_HREF, type ChViewVoice } from '../../../data/coachhelm-views-shape';
import { formatFixed } from '../../../lib/format';
import { plural } from '../../../lib/plural';
import { useRefresh } from '../../../lib/use-refresh';
import { rebuiltHref } from '../../../shell/nav';
import { Icon } from '../../../ui/Icon';
import { Line } from '../../../ui/charts/Line';
import { Segmented } from '../../../ui/Segmented';
import { InlineNotice } from '../../../ui/Notices';
import { SerifText } from '../../../ui/SerifText';
import { Surface } from '../../../ui/Surface';
import { CorrectionChips, ReadLater } from '../Corrections';

/**
 * The read's parts (7 Nov design, "Component map"). Every part is one of Clubhouse's own: the Deep dive's four lines, measure, rows and
 * plan rows, the board's bars and evidence well, the design system's Surface for each section. A part with no data draws nothing.
 */

const whose = (voice: ChViewVoice) => (voice.role === 'coach' ? `${voice.first}’s` : 'your');
const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
/** A sentence without its stop, so a list of them can be joined with one. */
const bare = (t: string) => t.trim().replace(/[.!?…]+$/, '');

/** One section of the read: a Surface with its title, and a quiet figure at the right of its head. */
function Card({ sec, title, aside, control, children }: { sec: string; title: string; aside?: ReactNode; /** A control in the head's actions (the trend's window switch), in place of the quiet figure. */ control?: ReactNode; children: ReactNode }) {
  return (
    <div className="ch-hr-sec" data-ch-read-sec={sec}>
      {/* The Surface is the design system's, untouched: the section's own stack sits inside its body. */}
      <Surface id={`ch-hr-${sec}`} title={title} actions={control ?? (aside ? <span className="ch-hr-aside ch-num">{aside}</span> : undefined)}>
        <div className="ch-hr-body">{children}</div>
      </Surface>
    </div>
  );
}

interface Bar {
  key: string;
  label: string;
  note?: string | null;
  /** 0 to 100; null draws the label and the figure with no track (a figure that is not a share of anything). */
  width: number | null;
  value: ReactNode;
  weak?: boolean;
  you?: boolean;
}

/** The board's bars (`ch-hl-bars`), with a second label line. Drawn in place: nothing grows. */
function Bars({ rows }: { rows: Bar[] }) {
  return (
    <ul className="ch-hl-bars ch-hr-bars">
      {rows.map((r) => (
        <li key={r.key} className={r.you ? 'is-you' : undefined}>
          <span>
            {r.label}
            {r.note && <small className="ch-num">{r.note}</small>}
          </span>
          <span className="ch-hl-bars__t" aria-hidden="true">
            {r.width != null && <i className={r.weak ? 'is-weak' : undefined} style={{ width: `${formatFixed(r.width, 1)}%` }} />}
          </span>
          <b className="ch-num">{r.value}</b>
        </li>
      ))}
    </ul>
  );
}

/** A measure that has all it needs: a tick, said as a word to a screen reader. */
function Enough() {
  return (
    <>
      <Icon icon={Check} size={14} />
      <span className="ch-sr-only">Enough</span>
    </>
  );
}

/** The read's level, as the Deep dive marks it: counted in the shots, or only seen in the totals. */
function Level({ observed, children }: { observed: boolean; children: ReactNode }) {
  return (
    <p className="ch-hr-trace">
      <span className={'ch-hd-dx__lvl ch-hd-read__lvl ' + (observed ? 'is-observed' : 'is-hypothesis')}>{children}</span>
    </p>
  );
}

// ── The head: the green feature card ─────────────────────────────────────────

/**
 * The read's head (`ch-hd-dos__h`): the category and where the read stands, the claim, and What, Why, Next and When. A coach reads the
 * stance; a player reads only whether it is their focus or a proposal waiting on them. A read older than the newest round says so
 * under the claim (CH-13903), never as current.
 */
export function ReadHead({ d, voice }: { d: ChReadDetail; voice: ChViewVoice }) {
  const b = d.insight;
  const coach = voice.role === 'coach';
  const cause = b.engine?.cause;
  const n = d.four.next;
  const pill = coach
    ? { cls: d.stanceCls, word: d.stance }
    : b.assigned === 'active'
      ? { cls: 'ok', word: 'Your focus' }
      : b.assigned === 'proposed'
        ? { cls: 'medium', word: 'Proposed for you' }
        : null;
  return (
    <header className="ch-hd-dos__h">
      <div className="ch-hl-focus__k">
        <span>{b.category}</span>
        {pill && <span className={'ch-hl-pri is-' + pill.cls}>{pill.word}</span>}
      </div>
      <h2 id="ch-hr-title">
        <SerifText text={b.title} />
      </h2>
      {b.stale && (
        <div className="ch-hl-path is-out_of_date" role="note" data-ch-code="CH-13903">
          <p className="ch-hl-path__l ch-num">
            {d.four.through ? `${d.four.through} · ` : ''}
            <b>{d.headline.newer && d.headline.newer > 0 ? `${plural(d.headline.newer, 'newer round')} ${d.headline.newer === 1 ? 'isn’t' : 'aren’t'} counted yet` : `A round played ${b.stale.newestRound} isn’t counted yet`}</b>
          </p>
        </div>
      )}
      <dl className="ch-hd-read">
        <div>
          <dt>What</dt>
          <dd className="ch-num">{d.four.what}</dd>
        </div>
        <div>
          <dt>Why</dt>
          {cause ? (
            <dd data-ch-code="CH-13993">
              <span className={'ch-hd-dx__lvl ch-hd-read__lvl ' + (cause.state === 'counted' ? 'is-observed' : 'is-hypothesis')}>{cause.word}</span> {cause.line}
            </dd>
          ) : (
            <dd>
              {d.four.why.basis && (
                <span className={'ch-hd-dx__lvl ch-hd-read__lvl is-' + d.four.why.level} data-ch-code="CH-13982">
                  {d.four.why.basis}
                </span>
              )}
              {d.four.why.basis && ' '}
              {d.four.why.text}
            </dd>
          )}
        </div>
        <div>
          <dt>Next</dt>
          <dd>{n.drill ? `${n.drill}${n.meta ? ` · ${n.meta}` : ''}.` : n.text ? `${bare(n.text)}.` : n.none}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd className="ch-num">{d.four.through ? `${bare(d.four.through)}.` : '—'}</dd>
        </div>
      </dl>
    </header>
  );
}

// ── Measured ─────────────────────────────────────────────────────────────────

/** What was measured: the number on its label, the window, the read's own bars, and the figure against the Tour (a coach: and the team pool). */
export function Measured({ d, voice, pictures }: { d: ChReadDetail; voice: ChViewVoice; pictures: boolean }) {
  const b = d.insight;
  const ev = b.evidence;
  const ladder = pictures ? d.headline.ladder : null;
  const chips = [ev.sample, ev.window, ev.read?.word].filter((x): x is string => !!x);
  const foot = chips.length > 0 && (
    <div className="ch-hl-ev__f">
      {chips.map((c) => (
        <span key={c} className="ch-num">
          {c}
        </span>
      ))}
    </div>
  );
  // Bars are a share of the largest figure, so they only stand for figures that are all above zero.
  const figures = ladder ? [ladder.you.value, ...ladder.lines.map((l) => l.value)] : [];
  const top = Math.max(...figures, 0) * 1.15;
  const scaled = figures.length > 0 && figures.every((v) => v > 0);
  const against = ladder ? ladder.lines.map((l) => (l.source === 'team_pool' ? 'the team' : l.label)).join(' and ') : '';
  return (
    <Card sec="measured" title="What was measured">
      <div className={'ch-hd-meas ' + (b.kind === 'strength' ? 'is-good' : 'is-warn')}>
        <div className="ch-hd-meas__v">
          <b className="ch-num">{d.measured.value}</b>
          <span>{d.measured.label}</span>
        </div>
        {d.measured.span && <p className="ch-hd-meas__s ch-num">{d.measured.span}</p>}
      </div>
      {pictures && ev.bars && (
        <div className="ch-hl-ev">
          <span className="ch-hl-ev__l">{voice.role === 'coach' ? 'The gap, same distance' : 'Your gap, same distance'}</span>
          <Bars rows={ev.bars.map((x) => ({ key: x.label, label: x.label, width: x.pct, weak: x.weak, value: `${Math.round(x.pct)}%` }))} />
          {!ladder && foot}
        </div>
      )}
      {ladder ? (
        <div className="ch-hl-ev">
          <span className="ch-hl-ev__l">Against {against}</span>
          <Bars
            rows={[
              { key: 'you', label: ladder.you.label, width: scaled ? pct(ladder.you.value, top) : null, weak: b.kind !== 'strength', value: ladder.you.display, you: true },
              ...ladder.lines.map((l) => ({ key: l.source + l.label, label: l.label, note: l.note?.replace(/\s*·\s*/g, ', ') ?? null, width: scaled ? pct(l.value, top) : null, value: l.display })),
            ]}
          />
          {foot}
        </div>
      ) : (
        !(pictures && ev.bars) && foot && <div className="ch-hl-ev">{foot}</div>
      )}
      {/* The change the engine stored, as one quiet row: a before and an after are not a trend, so they get no card of their own. */}
      {d.moved && (
        <p className={'ch-hr-since ch-num is-' + d.moved.tone} data-ch-read-since="">
          <span>Since it was first seen</span>
          <b>{d.moved.text}</b>
        </p>
      )}
    </Card>
  );
}

// ── How it has moved ─────────────────────────────────────────────────────────

/**
 * How it has moved: the read's own metric round by round, oldest to newest, on the one line chart (ui/charts/Line), with the Tour's
 * figure dashed across it. Drawn in place at first paint (Q-153: no draw-in); the window switch glides the line and swaps the caption.
 * Only when the read's metric has a per-round source and three rounds carry it; a before and an after alone are the quiet row in
 * What was measured, never a card with one line in it.
 */
export function Moved({ d }: { d: ChReadDetail }) {
  const t = d.trend;
  const [win, setWin] = useState<'last' | 'season'>('last');
  if (!t) return null;
  const w = win === 'season' && t.season ? t.season : t.last;
  const vals = w.values;
  const all = t.ref ? [...vals, t.ref.value] : vals;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const first = vals[0] as number;
  const last = vals[vals.length - 1] as number;
  const tone = t.lowerBetter == null || first === last ? 'is-plain' : last < first === t.lowerBetter ? 'is-good' : 'is-warn';
  return (
    <Card
      sec="moved"
      title="How it has moved"
      control={
        t.season ? (
          <Segmented
            size="sm"
            label="Rounds shown"
            value={win}
            options={[
              { value: 'last', label: `Last ${t.last.values.length}` },
              { value: 'season', label: 'Season' },
            ]}
            onChange={setWin}
            hook="read-window"
          />
        ) : undefined
      }
    >
      <ul className="ch-hd-tr">
        <li className={'ch-hd-strip ' + tone}>
          <span className="ch-hd-tr__k">{t.label}</span>
          <Line
            className="ch-hd-strip__chart"
            interactive={false}
            label={`${t.label}. ${w.said}.`}
            points={vals.map((y, i) => ({ x: String(i + 1), y }))}
            lowerIsBetter={t.lowerBetter === true}
            domain={hi === lo ? [lo - 1, hi + 1] : [lo, hi]}
            baseline={t.ref ? { value: t.ref.value, dashed: true } : undefined}
            axis={false}
            ends={false}
            marks="trail"
            width={320}
            height={64}
          />
          <span className="ch-hd-strip__c ch-num" data-ch-read-trend={win}>
            <b>{w.said}</b>
            {t.ref && (
              <em>
                Dashed line: {t.ref.label} {t.ref.display}
              </em>
            )}
          </span>
        </li>
      </ul>
    </Card>
  );
}

// ── Cause ────────────────────────────────────────────────────────────────────

/** The observed narrowing, as bars: each step's count of its own denominator. A step with no count is its sentence. */
function Steps({ d }: { d: ChReadDetail }) {
  const steps = d.funnel?.steps ?? [];
  const counted = steps.filter((s) => s.n != null && s.of != null && s.of > 0);
  if (counted.length === 0) return null;
  return <Bars rows={counted.map((s, i) => ({ key: `${s.label}-${i}`, label: s.label, note: `${s.n} of ${s.of}`, width: pct(s.n as number, s.of as number), weak: true, value: `${Math.round(pct(s.n as number, s.of as number))}%` }))} />;
}

/**
 * Why CoachHelm thinks so (a coach), or what CoachHelm sees (a player). Counted: the path, the narrowing and the count. Likely, from
 * the totals: the two arms and the verdict, a coach's alone (Q3: the shaper never builds them for a player). Not traced: what the
 * totals show and what a trace still needs.
 */
export function Cause({ d, voice, pictures }: { d: ChReadDetail; voice: ChViewVoice; pictures: boolean }) {
  const coach = voice.role === 'coach';
  const c = d.cause;
  const legacy = d.legacy;
  const title = coach ? 'Why CoachHelm thinks so' : 'What CoachHelm sees';
  if (!c) {
    // A row stored before the engine wrote a cause state: the Deep dive's own box, the drivers and the reason.
    if (!legacy || (legacy.drivers.length === 0 && !legacy.reason)) return null;
    return (
      <Card sec="cause" title={title}>
        <div className="ch-hd-dx">
          {legacy.drivers.length > 0 && (
            <dl className="ch-hd-dx__d">
              {legacy.drivers.map((x) => (
                <div key={x.label}>
                  <dt>{x.label}</dt>
                  <dd className="ch-num">
                    {x.value}
                    {x.n != null && <em> · {x.n} counted</em>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {legacy.reason && <p className="ch-hd-dx__r">{bare(legacy.reason)}.</p>}
        </div>
      </Card>
    );
  }
  if (c.state === 'counted') {
    return (
      <Card sec="cause" title={title}>
        <Level observed>Counted in {whose(voice)} shots</Level>
        {pictures && c.path.length > 0 && (
          <ol className="ch-hr-path">
            {c.path.map((p, i) => (
              <li key={`${p}-${i}`}>{p}</li>
            ))}
          </ol>
        )}
        {pictures && <Steps d={d} />}
        {(c.split?.length || c.count || c.eventStrokes != null) && (
          <div className="ch-hd-dx">
            {c.split && c.split.length > 0 && (
              <dl className="ch-hd-dx__d">
                {c.split.map((x) => (
                  <div key={x.label}>
                    <dt>{x.label}</dt>
                    <dd className="ch-num">
                      {x.value}
                      <em> · {x.n} counted</em>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="ch-hd-dx__r ch-num">
              {c.count ? `${c.count} went this way.` : ''}
              {c.eventStrokes != null ? ` On average one cost about ${formatFixed(Math.abs(c.eventStrokes), 1)} strokes.` : ''}
            </p>
          </div>
        )}
      </Card>
    );
  }
  if (c.state === 'likely') {
    return (
      <Card sec="cause" title={title}>
        <Level observed={false}>Likely, from totals</Level>
        {pictures && c.arms.length > 0 && (
          <Bars rows={c.arms.map((a, i) => ({ key: a.label, label: a.label, note: `${a.failures} of ${a.n} missed`, width: pct(a.failures, a.n), weak: i === 0, value: `${Math.round(pct(a.failures, a.n))}%` }))} />
        )}
        <div className="ch-hd-dx">
          <p className="ch-hd-dx__r ch-num">
            {c.verdict ? `${c.verdict} ` : ''}
            {c.range ? `${c.range} ` : ''}
            Not measured shot by shot yet, so this is a likely cause, not a counted one.
          </p>
        </div>
      </Card>
    );
  }
  const g = c.gap;
  const cd = c.countDown;
  const said = g
    ? coach
      ? `${g.have} of the ${g.need} a shot-by-shot trace needs so far. ${g.text ? `${bare(g.text)}, and the cause gets counted.` : `It fills as ${voice.first} plays.`}`
      : g.text
        ? `${bare(g.text)} and CoachHelm can see this shot by shot.`
        : 'It fills as you play. Nothing new is asked.'
    : (c.text ?? (cd ? `${cd.haveEvents} of the ${cd.needEvents} it needs so far, over ${cd.haveRounds} of ${cd.needRounds} rounds.` : 'CoachHelm hasn’t traced why shot by shot yet.'));
  return (
    <Card sec="cause" title={title}>
      <Level observed={false}>{coach ? 'From the totals' : 'From your totals'}</Level>
      {pictures && <Steps d={d} />}
      {pictures && g && g.need > 0 && <Bars rows={[{ key: 'gap', label: 'Traced so far', width: pct(g.have, g.need), value: `${g.have}/${g.need}` }]} />}
      <div className="ch-hd-dx">
        <p className="ch-hd-dx__r ch-num">{said}</p>
      </div>
    </Card>
  );
}

/** Where it happened: the holes a counted path was recorded on (the Deep dive's rows), newest first. Only with a counted cause. */
export function Where({ d, failed = false }: { d: ChReadDetail; /** The rounds the holes are on did not load. */ failed?: boolean }) {
  const { refresh, refreshing } = useRefresh();
  const c = d.cause;
  if (!c || c.state !== 'counted') return null;
  // Only this part failed: the cause above is current, and the way to recover is in the card it belongs to.
  if (c.holes.length === 0 && failed) {
    return (
      <Card sec="where" title="Where it happened">
        <InlineNotice code="CH-13281" title="Couldn’t load where it happened" body="The cause above is current. The holes it was counted on didn’t come through." onRetry={refresh} retrying={refreshing} />
      </Card>
    );
  }
  if (c.holes.length === 0) return null;
  return (
    <Card sec="where" title="Where it happened" aside={c.count || undefined}>
      <ol className="ch-hd-rounds ch-hr-holes">
        {c.holes.map((h) => {
          const body = (
            <>
              <span className="ch-hd-r__d ch-num">{h.date}</span>
              <span className="ch-hd-r__c">
                {h.what}
                <em className="ch-num">
                  {h.course ?? 'Round'}, hole {h.hole}
                </em>
              </span>
              <span className={'ch-hd-r__p ch-num is-' + (!h.toPar ? 'none' : h.toPar === 'E' ? 'even' : h.toPar.startsWith('−') ? 'under' : 'over')}>{h.toPar ?? ''}</span>
            </>
          );
          return (
            <li key={h.key}>
              {h.href ? (
                <Link className="ch-hd-r is-link" href={h.href} aria-label={`Review the round on ${h.date}${h.course ? ` at ${h.course}` : ''}, hole ${h.hole}`}>
                  {body}
                  <Icon icon={ChevronRight} size={15} />
                </Link>
              ) : (
                <div className="ch-hd-r">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ── Rounds ───────────────────────────────────────────────────────────────────

function RoundRow({ r, note }: { r: ChDiveRound; note?: string | null }) {
  const tone = r.toPar == null ? 'none' : r.toPar === 'E' ? 'even' : r.toPar.startsWith('−') ? 'under' : 'over';
  const body = (
    <>
      <span className="ch-hd-r__d ch-num">{r.date}</span>
      <span className="ch-hd-r__c">
        {r.course ?? 'Round'}
        {r.nine ? ' · 9 holes' : ''}
        {note && <em className="ch-num">{note}</em>}
      </span>
      <span className="ch-hd-r__s ch-num">{r.score}</span>
      <span className={'ch-hd-r__p ch-num is-' + tone}>{r.toPar ?? '—'}</span>
    </>
  );
  return (
    <li>
      {r.href ? (
        <Link className="ch-hd-r is-link" href={r.href} aria-label={`Review the round on ${r.date}${r.course ? ` at ${r.course}` : ''}`}>
          {body}
          <Icon icon={ChevronRight} size={15} />
        </Link>
      ) : (
        <div className="ch-hd-r">{body}</div>
      )}
    </li>
  );
}

/** The rounds behind it (the Deep dive's rows). A read of the rounds that failed says so in the card, with the way to recover. */
export function Rounds({ d, failed, voice }: { d: ChReadDetail; failed: boolean; voice: ChViewVoice }) {
  const { refresh, refreshing } = useRefresh();
  const { total, list } = d.rounds;
  const aside = total > 0 ? (list.length > 0 && total > list.length ? `Newest ${list.length} of ${total}` : plural(total, 'round')) : undefined;
  const coach = voice.role === 'coach';
  return (
    <Card sec="rounds" title="The rounds behind it" aside={failed ? undefined : aside}>
      {failed ? (
        <InlineNotice code="CH-13281" title="Couldn’t load the rounds" body="The read above is current. The list of rounds didn’t come through." onRetry={refresh} retrying={refreshing} />
      ) : list.length > 0 ? (
        <ol className="ch-hd-rounds">
          {list.map((r) => (
            <RoundRow key={r.id} r={r} note={r.note} />
          ))}
        </ol>
      ) : (
        <p className="ch-hr-p" data-ch-code="CH-13382">
          {total > 0
            ? `This read was made from ${plural(total, 'round')}, but none of them can be listed here. They may be rounds ${coach ? `${voice.first} has` : 'you have'} since removed.`
            : `This read does not name the rounds it was made from. It uses ${coach ? `${voice.first}’s` : 'your'} stats over its window, so there is no list to show.`}
        </p>
      )}
    </Card>
  );
}

// ── How sure, This week, Where this goes, Is this read right ─────────────────

/**
 * How sure: the Surface is the disclosure (`ch-hl-why`). Sample, recency and the shot record for both viewers; what CoachHelm checked
 * and the rung are the coach's, and are not on a player's copy to draw.
 */
export function Sure({ d, voice, pictures }: { d: ChReadDetail; voice: ChViewVoice; pictures: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const s = d.sure;
  const coach = voice.role === 'coach';
  if (s.rows.length === 0 && s.checked.length === 0 && !s.rung) return null;
  const coachLine = coach ? [s.checked.length > 0 ? `Checked: ${s.checked.join(' · ')}` : null, s.rung ? `Rung: ${s.rung.word}${s.rung.range ? ` (${bare(s.rung.range)})` : ''}` : null].filter(Boolean).join('. ') : '';
  return (
    <div className="ch-hr-sec" data-ch-read-sec="sure">
      <Surface padded={false}>
        <div className="ch-hr-surecard">
          <button type="button" className="ch-hl-why ch-hr-surekey" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
            <span>How sure is this{s.word ? ` · ${s.word}` : ''}</span>
            <Icon icon={ChevronDown} size={15} />
          </button>
          <div id={id} className="ch-hl-why__b ch-hr-sure" hidden={!open}>
            {pictures && s.rows.length > 0 && (
              <Bars
                rows={s.rows.map((r) => ({
                  key: r.k,
                  label: r.k,
                  width: pct(r.have, r.need || 1),
                  value: r.have >= r.need ? <Enough /> : `${Math.round(pct(r.have, r.need || 1))}%`,
                }))}
              />
            )}
            {s.rows.length > 0 && <p className="ch-num">{s.rows.map((r) => bare(r.text)).join('. ')}.</p>}
            {coachLine && (
              <p className="ch-num" data-ch-read-coach="">
                {coachLine}.
              </p>
            )}
          </div>
        </div>
      </Surface>
    </div>
  );
}

/** This week: the read's drill, or the row's own next step. */
export function Week({ d }: { d: ChReadDetail }) {
  const w = d.todo.drill;
  if (!w || (!w.title && !w.text)) return null;
  return (
    <Card sec="week" title="This week" aside={w.meta ?? undefined}>
      <div className="ch-hl-week ch-hr-week">
        {w.title && (
          <p className="ch-hl-week__t">
            <b>{w.title}</b>
          </p>
        )}
        {w.text && <p>{w.text}</p>}
      </div>
    </Card>
  );
}

/**
 * Where this goes: the focus area or goal made from the read (the Deep dive's plan rows), or one line that it is in none. `proposed`:
 * a coach assigned it on this visit, so it is waiting on the player, before the page has read the new focus area back.
 */
export function Plan({ d, voice, failed, proposed, removed = false }: { d: ChReadDetail; voice: ChViewVoice; failed: boolean; proposed: boolean; /** The coach took the focus back on this visit (held behind Undo). */ removed?: boolean }) {
  const { refresh, refreshing } = useRefresh();
  const coach = voice.role === 'coach';
  const goal = d.todo.plan.goal;
  const focus = removed && d.todo.plan.focus?.fromThis ? null : d.todo.plan.focus;
  const b = d.insight;
  const now = b.value ? `Now ${b.value}${b.valueUnit ? ` ${b.valueUnit}` : ''}` : null;
  const href = coach ? rebuiltHref(`/golf/dashboard/stats?player=${encodeURIComponent(voice.playerId)}&tab=dev`, 'coach') : rebuiltHref(PLAYER_HELM_DEVELOPMENT_HREF, 'player');
  const row = (key: string, icon: typeof Target, label: string, title: string, word: string, line: string | null, live: boolean) => {
    const body = (
      <>
        <span className="ch-hd-plan__ic" aria-hidden="true">
          <Icon icon={icon} size={16} />
        </span>
        <span className="ch-hd-plan__b">
          <em>{label}</em>
          <b>{title}</b>
          {line && <span className="ch-num">{line}</span>}
        </span>
        <span className={'ch-hd-plan__w' + (live ? ' is-live' : '')}>{word}</span>
        {href && <Icon icon={ChevronRight} size={15} />}
      </>
    );
    return <li key={key}>{href ? <Link className="ch-hd-plan__i is-link" href={href}>{body}</Link> : <div className="ch-hd-plan__i">{body}</div>}</li>;
  };
  const focusLabel = coach ? (focus?.fromThis ? 'Focus made from this read' : 'Focus on the same stat') : b.assigned === 'proposed' ? 'Suggested focus' : 'Your focus';
  return (
    <Card sec="plan" title="Where this goes">
      {failed ? (
        <InlineNotice code="CH-13282" title="Couldn’t load the plan" body="Whether this read is part of a focus or a goal is missing for now. The read is not affected." onRetry={refresh} retrying={refreshing} />
      ) : focus || goal || proposed ? (
        <ul className="ch-hd-plan">
          {focus && row('focus', Flag, focusLabel, focus.title, focus.word, now, focus.live && b.assigned !== 'proposed')}
          {!focus && proposed && coach && row('proposed', Flag, 'Focus', b.assignAs.title, 'Waiting', `Proposed to ${voice.first} just now${now ? ` · ${now.toLowerCase()}` : ''}`, false)}
          {goal && row('goal', Target, goal.fromThis ? 'Goal made from this read' : 'Goal on the same stat', goal.title, goal.word, goal.line, goal.word === 'Active')}
        </ul>
      ) : (
        <p className="ch-hr-p" data-ch-code="CH-13384">
          {coach ? 'Not part of a focus or goal yet.' : 'Not part of your plan yet.'}
        </p>
      )}
    </Card>
  );
}

/** Is this read right: the correction chips, flush on the page, only when the loader put them on the read (`coachhelm_corrections_v1`). */
export function Corrections({ d }: { d: ChReadDetail }) {
  const cx = d.insight.engine?.corrections;
  const [held, setHeld] = useState<number | null>(cx?.laterRounds ?? null);
  if (!cx) return null;
  return (
    <div className="ch-hr-cx" data-ch-read-sec="right">
      {held != null && <ReadLater rounds={held} />}
      <CorrectionChips c={cx} held={held} onHeld={setHeld} />
    </div>
  );
}

// ── The player's other reads ─────────────────────────────────────────────────

const flat = (view: ChReadView): ChReadsRailRow[] => view.rail.flatMap((g) => g.rows);

/** The reads in the order the list shows them, for the stepper and J and K. */
export const readOrder = (view: ChReadView): string[] => flat(view).map((r) => r.id);

/** More on this player (phone): the board's rows in one Surface, each opening that read. */
export function NextReads({ view, current, voice, hrefOf }: { view: ChReadView; current: string; voice: ChViewVoice; hrefOf: (id: string) => string }) {
  const rows = flat(view).filter((r) => r.id !== current);
  if (rows.length === 0) return null;
  return (
    <section className="ch-hr-next" aria-labelledby="ch-hr-next-h">
      <h2 id="ch-hr-next-h" className="ch-hr-next__h">
        {voice.role === 'coach' ? `More on ${voice.first}` : 'Your other reads'}
      </h2>
      <Surface padded={false}>
        <div className="ch-hr-list">
          {rows.map((r) => (
            <Link key={r.id} className="ch-hl-row" href={hrefOf(r.id)}>
              <span className={'ch-hl-row__d is-' + r.cls} aria-hidden="true" />
              <span className="ch-hl-row__b">
                <em>{r.category}</em>
                <b>{r.title}</b>
                <span className="ch-sr-only">{r.word}</span>
              </span>
              <span className="ch-hl-row__v ch-num">
                {r.value}
                {r.unit && (
                  <>
                    {' '}
                    <small>{r.unit}</small>
                  </>
                )}
              </span>
              <Icon icon={ChevronRight} size={15} />
            </Link>
          ))}
        </div>
      </Surface>
    </section>
  );
}

/**
 * The reads rail (desktop): the Deep dive's ledger, grouped by where on the hole, with this read selected. A row replaces the address,
 * so Back leaves the read instead of walking through every one looked at. `said`: what this visit changed (Assigned, Dismissed).
 */
export function ReadsRail({ view, current, voice, hrefOf, said }: { view: ChReadView; current: string; voice: ChViewVoice; hrefOf: (id: string) => string; said: (id: string) => 'Assigned' | 'Dismissed' | null }) {
  return (
    <nav className="ch-hd-rail" aria-label={voice.role === 'coach' ? `${voice.first}’s reads` : 'Your reads'} data-ch-code="CH-13890">
      {view.rail.map((g) => (
        <section key={g.label} className="ch-hd-grp" aria-label={g.label}>
          <div className="ch-hd-grp__h">
            <h3>{g.label}</h3>
            <span className="ch-num">{g.rows.length}</span>
          </div>
          <ul>
            {g.rows.map((r) => {
              const now = said(r.id);
              return (
                <li key={r.id}>
                  <Link className={'ch-hd-it is-' + (now === 'Assigned' ? 'done' : r.cls) + (r.id === current ? ' is-on' : '')} href={hrefOf(r.id)} replace scroll={false} aria-current={r.id === current ? 'true' : undefined}>
                    <span className="ch-hd-it__d" aria-hidden="true" />
                    <span className="ch-hd-it__b">
                      <b>{r.title}</b>
                      <em>
                        <span>{now ?? r.word}</span>
                        {r.firm && <span className="ch-hd-it__f"> · {r.firm}</span>}
                      </em>
                    </span>
                    <span className="ch-hd-it__v ch-num">
                      {r.value}
                      {r.unit && (
                        <>
                          {' '}
                          <small>{r.unit}</small>
                        </>
                      )}
                    </span>
                    <Icon icon={ChevronRight} size={15} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
