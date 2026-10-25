// Comparison desk: two independent scopes, one aligned grid, draggable divider, history timeline, evidence.
(function () {
const { Button, IconButton, Icon, Select, Segmented, Avatar } = window.FairwayClubhouseEdition_9c4f4d;
const T = window.TOUR;
const hap = (k) => window.GH && GH.haptic && GH.haptic(k);
const CTX = [{ value: 'tournament', label: 'Tournaments' }, { value: 'qualifier', label: 'Qualifiers' }, { value: 'practice', label: 'Practice' }];
const CTXW = { tournament: 'Tournaments', qualifier: 'Qualifiers', practice: 'Practice rounds' };
const SUBJ = [{ value: 'team', label: 'Team · pooled' }, { value: 'matched', label: 'Returning players' }, ...T.PLAYERS.filter((p) => !p.alumni).map((p) => ({ value: p.id, label: p.name }))];
const SAMP = [{ value: 'season', label: 'This season' }, { value: 'last', label: 'Last season' }, { value: 'l10', label: 'Last 10 rounds' }, { value: 'event', label: 'One event' }, { value: 'range', label: 'Custom range' }];
const subjName = (s) => s === 'team' ? 'Team' : s === 'matched' ? 'Returning players' : T.P[s].name;
const EV = (id) => T.EVENTS.find((e) => e.id === id);
const scopeTitle = (sc) => `${subjName(sc.subject)} · ${sc.sample === 'event' ? EV(sc.event).name + (sc.rounds ? ' · R' + sc.rounds.join(', R') : '') : CTXW[sc.ctx] + ' · ' + (sc.sample === 'range' && sc.range ? T.fmtD(sc.range[0]) + ' – ' + T.fmtD(sc.range[1]) : T.SAMPLE_LABEL[sc.sample])}`;
const PRESETS = [
  ['tq', 'Jonah · tournaments vs qualifiers', { subject: 'jonah', ctx: 'tournament', sample: 'season' }, { subject: 'jonah', ctx: 'qualifier', sample: 'season' }],
  ['tp', 'Jonah · tournaments vs practice', { subject: 'jonah', ctx: 'tournament', sample: 'season' }, { subject: 'jonah', ctx: 'practice', sample: 'last' }],
  ['ee', 'Oakmont vs Dogwood', { subject: 'team', ctx: 'tournament', sample: 'event', event: 'e33' }, { subject: 'team', ctx: 'tournament', sample: 'event', event: 'e32' }],
  ['rr', 'Oakmont · R1 vs R3', { subject: 'team', ctx: 'tournament', sample: 'event', event: 'e33', rounds: [1] }, { subject: 'team', ctx: 'tournament', sample: 'event', event: 'e33', rounds: [3] }],
  ['pp', 'Theo vs Jonah · this season', { subject: 'theo', ctx: 'tournament', sample: 'season' }, { subject: 'jonah', ctx: 'tournament', sample: 'season' }],
  ['ss', 'Returning players · this season vs last', { subject: 'matched', ctx: 'tournament', sample: 'season' }, { subject: 'matched', ctx: 'tournament', sample: 'last' }],
];
const key = (sc) => JSON.stringify(sc);
function Sel({ value, options, onChange, label }) { const cur = options.find((o) => o.value === value) || options[0]; return <div className="fw-input fw-select cd-sel"><span className="cd-sel__v" aria-hidden="true">{cur.label}</span><select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select><Icon name="chevrons-up-down" size={14} /></div>; }
const CTXS = { tournament: 'Tournaments', qualifier: 'Qualifiers', practice: 'Practice' };
const lab = (sc, o) => sc.subject !== o.subject ? (sc.subject === 'team' ? 'Team' : sc.subject === 'matched' ? 'Returning players' : T.P[sc.subject].name.split(' ')[0]) : sc.sample === 'event' ? (sc.event !== o.event ? EV(sc.event).name.split(' ')[0] : sc.rounds ? 'Round ' + sc.rounds[0] : 'All rounds') : sc.ctx !== o.ctx ? CTXS[sc.ctx] : T.SAMPLE_LABEL[sc.sample];
function Face({ sc, side, size = 40 }) {
  const ids = sc.subject === 'team' ? ['theo', 'sofia', 'ava'] : sc.subject === 'matched' ? ['theo', 'sofia', 'jonah'] : [sc.subject];
  return <span className={'cd-face' + (ids.length > 1 ? ' is-stack' : '')} style={{ '--s': size + 'px' }}>{ids.map((id) => <Avatar key={id} name={T.P[id].name} size={ids.length > 1 ? Math.round(size * .72) : size} />)}{side && <i className={'cd-face__tag' + (side === 'b' ? ' is-b' : '')}>{side.toUpperCase()}</i>}</span>;
}

// ── dot strip: every round on one shared scale, mean tick, other side's mean as a ghost ──
function Strip({ pts, lo, hi, mean, other, onPick, lower }) {
  if (!pts || !pts.length) return <div className="cd-strip" aria-hidden="true" style={{ position: 'relative' }}><span style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 1, background: 'repeating-linear-gradient(90deg,#D6D0C2 0 3px,transparent 3px 7px)' }}></span></div>;
  const x = (v) => hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100;
  return (
    <div className="cd-strip" style={{ position: 'relative' }} aria-hidden="true">
      <span style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 1, background: 'rgb(28 25 18/.1)' }}></span>
      {other != null && <span title="Other side’s average" style={{ position: 'absolute', left: x(other) + '%', top: 3, width: 0, height: 20, borderLeft: '1.5px dashed #A8A294' }}></span>}
      {pts.map(([r, v], i) => <span key={r.id} onClick={(e) => { e.stopPropagation(); onPick && onPick(r); }} title={`${T.fmtD(r.date)} · ${r.event ? EV(r.event).name + ' R' + r.rnd : r.courseName}`} style={{ position: 'absolute', left: `calc(${x(v)}% - 4px)`, top: 8 + ((i * 7) % 3) * 1.5, width: 8, height: 8, borderRadius: '50%', background: 'rgb(11 58 37/.32)', boxShadow: '0 0 0 1.5px #FDFCF8', cursor: 'pointer' }}></span>)}
      {mean != null && <span style={{ position: 'absolute', left: `calc(${x(mean)}% - 1.5px)`, top: 1, width: 3, height: 24, borderRadius: 2, background: '#0B3A25' }}></span>}
    </div>
  );
}

function ScopeCard({ side, sc, set, target, onTarget, rs, err }) {
  const s = T.summary(rs), tourEvents = T.EVENTS.filter((e) => !e.upcoming);
  const upd = (p) => { hap('selection'); set({ ...sc, ...p, ...(p.ctx && p.ctx !== 'tournament' && sc.sample === 'event' ? { sample: 'season', event: undefined, rounds: undefined } : {}), ...(p.sample === 'event' ? { ctx: 'tournament', event: sc.event || 'e33' } : {}), ...(p.sample && p.sample !== 'event' ? { rounds: undefined } : {}) }); };
  return (
    <section className={'cd-scope' + (target ? ' is-target' : '')} aria-label={`Scope ${side.toUpperCase()}`} onClick={onTarget}>
      <div className="cd-scope__top"><Face sc={sc} side={side} /><span style={{ minWidth: 0 }}><span className="cd-scope__n">{subjName(sc.subject)}</span><span className="cd-scope__t">{sc.sample === 'event' ? EV(sc.event).name + (sc.rounds ? ' · Round ' + sc.rounds[0] : ' · all rounds') : CTXW[sc.ctx] + ' · ' + (sc.sample === 'range' && sc.range ? T.fmtD(sc.range[0]) + ' – ' + T.fmtD(sc.range[1]) : T.SAMPLE_LABEL[sc.sample].toLowerCase())}</span></span></div>
      <div className="cd-ctls">
        <Sel label={`Player ${side}`} value={sc.subject} options={SUBJ} onChange={(v) => upd({ subject: v })} />
        <Sel label={`Period ${side}`} value={sc.sample} options={SAMP.filter((o) => o.value !== 'event' || sc.ctx === 'tournament')} onChange={(v) => upd({ sample: v, ...(v === 'range' && !sc.range ? { range: [s.from || '2026-08-01', s.to || '2026-10-14'] } : {}) })} />
      </div>
      <div className="cd-ctx"><Segmented size="sm" label={`Context ${side}`} value={sc.ctx} options={CTX} onChange={(v) => upd({ ctx: v })} /></div>
      {sc.sample === 'event' && <div className="cd-ctls" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)' }}>
        <Sel label="Event" value={sc.event} options={tourEvents.map((e) => ({ value: e.id, label: `${e.name} · ${T.fmtD(e.dates[0], { month: 'short', year: 'numeric' })}` }))} onChange={(v) => upd({ event: v, rounds: undefined })} />
        <Segmented size="sm" label="Rounds" value={sc.rounds ? 'r' + sc.rounds[0] : 'all'} options={[{ value: 'all', label: 'All' }, ...EV(sc.event).rounds.map((_, i) => ({ value: 'r' + (i + 1), label: 'R' + (i + 1) }))]} onChange={(v) => upd({ rounds: v === 'all' ? undefined : [+v.slice(1)] })} />
      </div>}
      {target && <span className="tr-chip is-ok" style={{ alignSelf: 'flex-start' }}><Icon name="move-horizontal" size={12} />Timeline edits {side.toUpperCase()}</span>}
      <div className="cd-sum">
        {err ? <span className="is-warn">Couldn’t load this side</span> : !s.n ? <span className="is-warn">No rounds in this sample</span> : <>
          <span><b>{s.full}</b> {s.full === 1 ? 'round' : 'rounds'}{s.nine ? ` + ${s.nine} nine-hole` : ''}</span>
          <span>{T.fmtD(s.from)} – {T.fmtD(s.to, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span>{s.courses} {s.courses === 1 ? 'course' : 'courses'}</span>
          {s.players > 1 && <span>{s.players} players</span>}
          <span className={s.shot < s.full ? 'is-warn' : ''}>{s.shot} of {s.full} with shot data</span>
        </>}
      </div>
    </section>
  );
}

// ── timeline: two-thumb range for the targeted scope, or pick an event marker ──
const D0 = Date.parse('2025-08-15'), D1 = Date.parse('2026-11-10');
const pct = (iso) => ((Date.parse(iso) - D0) / (D1 - D0)) * 100;
const isoAt = (p) => new Date(D0 + Math.max(0, Math.min(1, p)) * (D1 - D0)).toISOString().slice(0, 10);
function rangeOf(sc) { if (sc.sample === 'range' && sc.range) return sc.range; const s = T.summary(T.select(sc)); return s.n ? [s.from, s.to] : null; }
function Timeline({ A, B, target, setTarget, setScope }) {
  const tr = React.useRef(null);
  const tsc = target === 'a' ? A : B, osc = target === 'a' ? B : A;
  const [prev, setPrev] = React.useState(null);
  const cur = prev || rangeOf(tsc) || ['2026-08-01', '2026-10-14'];
  const other = rangeOf(osc);
  const drag = (which) => (e) => {
    e.preventDefault(); const box = tr.current.getBoundingClientRect(); let r = [...cur]; const start = e.clientX, r0 = [...cur];
    const mv = (ev) => { const p = (ev.clientX - box.left) / box.width; if (which === 'mid') { const dd = (ev.clientX - start) / box.width * (D1 - D0); const a = Date.parse(r0[0]) + dd, b = Date.parse(r0[1]) + dd; if (a < D0 || b > D1) return; r = [new Date(a).toISOString().slice(0, 10), new Date(b).toISOString().slice(0, 10)]; } else { const v = isoAt(p); r = which === 0 ? [v < r[1] ? v : r[1], r[1]] : [r[0], v > r[0] ? v : r[0]]; } setPrev(r); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); setPrev(null); setScope(target, { ...tsc, sample: 'range', range: r, rounds: undefined, event: undefined }); hap('selection'); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
  const key = (which) => (e) => { const step = e.shiftKey ? 30 : 7; const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0; if (!dir) return; e.preventDefault(); const r = [...cur]; const t = Date.parse(r[which]) + dir * step * 86400000; r[which] = new Date(Math.max(D0, Math.min(D1, t))).toISOString().slice(0, 10); if (r[0] > r[1]) return; setScope(target, { ...tsc, sample: 'range', range: r, rounds: undefined, event: undefined }); };
  const sel = T.select(tsc.sample === 'range' ? tsc : { ...tsc, sample: 'range', range: cur });
  const ss = T.summary(prev ? T.select({ ...tsc, sample: 'range', range: prev }) : sel);
  const months = []; for (let d = new Date(D0); d.getTime() < D1; d.setMonth(d.getMonth() + 2)) months.push(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
  const quals = [...new Set(T.ROUNDS.filter((r) => r.ctx === 'qualifier').map((r) => r.date))], pr = [...new Set(T.ROUNDS.filter((r) => r.ctx === 'practice').map((r) => r.date))];
  const subj = tsc.subject, byDate = {};
  T.ROUNDS.filter((x) => x.holes === 18 && (subj === 'team' || subj === 'matched' ? !x.ind && (subj === 'team' || T.MATCHED.includes(x.player)) : x.player === subj)).forEach((x) => { (byDate[x.date + x.ctx] = byDate[x.date + x.ctx] || { d: x.date, ctx: x.ctx, v: [] }).v.push(x.score - T.COURSES[x.course][3]); });
  const dots = Object.values(byDate).map((o) => ({ ...o, m: o.v.reduce((a, b) => a + b, 0) / o.v.length })), vlo = Math.min(...dots.map((o) => o.m)), vhi = Math.max(...dots.map((o) => o.m));
  const ext = Math.max(Math.abs(vlo), Math.abs(vhi), 1), yy = (v) => 38 + (v / ext) * 30;
  return (
    <section className="tl" aria-label="History timeline">
      <div className="tl-top">
        <div className="tl-top__l">
          <Segmented size="sm" label="Timeline edits" value={target} onChange={(v) => { hap('selection'); setTarget(v); }} options={[{ value: 'a', label: 'Adjust A' }, { value: 'b', label: 'Adjust B' }]} />
          <span className="tl-dates">
            <input type="date" aria-label="Range start" value={cur[0]} onChange={(e) => e.target.value && setScope(target, { ...tsc, sample: 'range', range: [e.target.value, cur[1]] })} />
            <span style={{ color: 'var(--text-tertiary)' }}>to</span>
            <input type="date" aria-label="Range end" value={cur[1]} onChange={(e) => e.target.value && setScope(target, { ...tsc, sample: 'range', range: [cur[0], e.target.value] })} />
          </span>
        </div>
        <div className="tl-legend" style={{ font: '400 12px/1 var(--font-sans)', color: 'var(--text-tertiary)' }}><span><i className="f" style={{ display: 'inline-block', width: 9, height: 9, background: '#0B3A25', transform: 'rotate(45deg)', borderRadius: 2 }}></i>Tournament · click to pick</span><span><i style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#8B9C8F' }}></i>Qualifier</span><span><i style={{ display: 'inline-block', width: 2, height: 8, background: '#C9C3B4' }}></i>Practice</span></div>
      </div>
      <div className="tl-track" ref={tr}>
        <div className="tl-plot" aria-hidden="true">
          <span className="tl-season" style={{ left: pct('2025-08-15') + '%', width: pct('2026-06-30') - pct('2025-08-15') + '%' }}><em>2025–26</em></span>
          <span className="tl-season is-now" style={{ left: pct('2026-08-01') + '%', width: 100 - pct('2026-08-01') + '%' }}><em>2026–27</em></span>
          <span className="tl-col" style={{ left: pct(cur[0]) + '%', width: Math.max(.4, pct(cur[1]) - pct(cur[0])) + '%' }}></span>
          <span className="tl-zero"></span><span className="tl-yk is-up">Better than rating</span><span className="tl-yk is-dn">Worse</span>
          <span className="tl-plot__k">{subjName(subj)} · every 18-hole round</span>{dots.map((o) => { const inR = o.d >= cur[0] && o.d <= cur[1]; return <i key={o.d + o.ctx} className={'tl-dot is-' + o.ctx + (inR ? ' is-in' : '')} style={{ left: pct(o.d) + '%', top: yy(o.m) }} title={`${T.fmtD(o.d)} · ${CTXS[o.ctx]} · ${o.m > 0 ? '+' : '−'}${Math.abs(o.m).toFixed(1)}`}></i>; })}</div>
        <div className="tl-axis"></div>
        {other && <div className={'tl-sel is-other' + (target === 'a' ? ' is-b' : '')} style={{ left: pct(other[0]) + '%', width: Math.max(.6, pct(other[1]) - pct(other[0])) + '%' }}></div>}
        <div className={'tl-sel' + (target === 'b' ? ' is-b' : '')} style={{ left: pct(cur[0]) + '%', width: Math.max(.6, pct(cur[1]) - pct(cur[0])) + '%' }} onPointerDown={drag('mid')}><span className="tl-sel__tag">{target.toUpperCase()} · {lab(tsc, osc)}</span></div>
        {T.EVENTS.filter((e) => !e.upcoming).map((e) => <span key={e.id} className="tl-mk is-t" style={{ left: pct(e.dates[0]) + '%' }}><button type="button" aria-label={`Use ${e.name}`} title={`${e.name} · ${T.fmtD(e.dates[0])}`} onClick={() => { hap('selection'); setScope(target, { ...tsc, ctx: 'tournament', sample: 'event', event: e.id, rounds: undefined, range: undefined }); }}><i className={'f' + (tsc.sample === 'event' && tsc.event === e.id ? ' is-on' : '')} style={{ display: 'block' }}></i></button></span>)}
        <button type="button" className="tl-thumb" role="slider" aria-label="Range start" aria-valuetext={T.fmtD(cur[0], { month: 'long', day: 'numeric', year: 'numeric' })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct(cur[0]))} style={{ left: pct(cur[0]) + '%' }} onPointerDown={drag(0)} onKeyDown={key(0)}></button>
        <button type="button" className="tl-thumb" role="slider" aria-label="Range end" aria-valuetext={T.fmtD(cur[1], { month: 'long', day: 'numeric', year: 'numeric' })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct(cur[1]))} style={{ left: pct(cur[1]) + '%' }} onPointerDown={drag(1)} onKeyDown={key(1)}></button>
        {months.map((m) => <span key={m} className="tl-lab" style={{ left: pct(m) + '%' }}>{T.fmtD(m, { month: 'short', year: '2-digit' })}</span>)}
      </div>
      <div className="tl-bot"><span>{prev ? 'Previewing · release to apply' : `Scope ${target.toUpperCase()}`} · {ss.n ? `${tsc.ctx === 'tournament' ? `${ss.events} ${ss.events === 1 ? 'event' : 'events'} · ` : ''}${ss.full} rounds` : 'no rounds in this range'} · {CTXW[tsc.ctx]}</span><span>Arrow keys move a thumb by a week · Shift for a month</span></div>
    </section>
  );
}

function CompareDesk({ initial = 'tq', scenario = 'ok', openEvidence, compact }) {
  const p0 = PRESETS.find((p) => p[0] === initial) || PRESETS[0];
  const [pre, setPre] = React.useState(p0[0]);
  const [A, setA] = React.useState(p0[2]), [B, setB] = React.useState(p0[3]);
  const [shown, setShown] = React.useState({ a: p0[2], b: p0[3] });
  const [target, setTarget] = React.useState('b');
  const [group, setGroup] = React.useState('scoring');
  const [split, setSplit] = React.useState(.5);
  const [drag, setDrag] = React.useState(false);
  const [hover, setHover] = React.useState(null);
  const [retry, setRetry] = React.useState(0);
  const body = React.useRef(null);
  // simulated fetch: new scope keeps the old figures, labelled, until its data arrives; stale responses are dropped
  const req = React.useRef({ a: 0, b: 0 });
  const commit = (side, sc) => { const id = ++req.current[side]; setTimeout(() => { if (req.current[side] === id) setShown((s) => ({ ...s, [side]: sc })); }, scenario === 'slow' ? 1600 : 420); };
  const setScope = (side, sc) => { setPre(null); side === 'a' ? setA(sc) : setB(sc); commit(side, sc); };
  React.useEffect(() => { setShown({ a: A, b: B }); }, [scenario]);
  const applyPreset = (p) => { hap('selection'); setPre(p[0]); setA(p[2]); setB(p[3]); commit('a', p[2]); commit('b', p[3]); };
  const swap = () => { hap('selection'); setPre(null); setA(B); setB(A); setShown({ a: shown.b, b: shown.a }); };
  const bFail = scenario === 'bfail' && retry === 0;
  const scB = scenario === 'thin' ? { ...shown.b, sample: 'range', range: ['2026-09-20', '2026-09-24'] } : scenario === 'none' ? { ...shown.b, sample: 'range', range: ['2026-07-01', '2026-07-20'] } : shown.b;
  const ra = T.select(shown.a), rb = bFail ? [] : T.select(scB);
  const staleA = key(A) !== key(shown.a), staleB = key(B) !== key(shown.b) && scenario !== 'thin' && scenario !== 'none';
  const G = T.GROUPS.find((g) => g[0] === group);
  // divider
  const cols = () => { const cs = getComputedStyle(body.current); return [parseFloat(cs.getPropertyValue('--mcol')) || 200, parseFloat(cs.getPropertyValue('--dcol')) || 150]; };
  const onDown = (e) => { e.preventDefault(); setDrag(true); const box = body.current.getBoundingClientRect(); const [mc, dc] = cols(); const L = box.left + mc, W = box.width - mc - dc - 14;
    const mv = (ev) => setSplit(Math.max(.35, Math.min(.65, (ev.clientX - L) / W)));
    const up = () => { setDrag(false); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); };
  const onKey = (e) => { if (e.key === 'ArrowLeft') setSplit((s) => Math.max(.35, s - .02)); else if (e.key === 'ArrowRight') setSplit((s) => Math.min(.65, s + .02)); else if (e.key === 'Home' || e.key === 'Enter') setSplit(.5); else return; e.preventDefault(); };
  const ev = (side, mkey, round) => openEvidence && openEvidence({ side, scope: side === 'a' ? shown.a : scB, rounds: side === 'a' ? ra : rb, mkey, round });
  return (
    <div className="cd">
      <div className="cd-presets" role="group" aria-label="Comparison presets">
        {PRESETS.map((p) => <button key={p[0]} type="button" className="cd-pre" aria-pressed={pre === p[0]} onClick={() => applyPreset(p)}>{p[1]}</button>)}
      </div>
      <div className="cd-scopes">
        <ScopeCard side="a" sc={A} set={(sc) => setScope('a', sc)} target={target === 'a'} onTarget={() => setTarget('a')} rs={ra} />
        <div className="cd-swap"><IconButton icon="arrow-left-right" label="Swap sides" onClick={swap} /><IconButton icon="rotate-ccw" label="Reset to preset" onClick={() => applyPreset(p0)} /></div>
        <ScopeCard side="b" sc={B} set={(sc) => setScope('b', sc)} target={target === 'b'} onTarget={() => setTarget('b')} rs={rb} err={bFail} />
      </div>
      <Timeline A={A} B={B} target={target} setTarget={setTarget} setScope={setScope} />
      <nav className="cd-groups" role="tablist" aria-label="Metric group">
        {T.GROUPS.map(([id, l]) => <button key={id} type="button" role="tab" className="cd-g" aria-selected={group === id} onClick={() => { hap('selection'); setGroup(id); }}>{l}</button>)}
      </nav>
      <div className="cd-body" ref={body} style={{ '--a': split + 'fr', '--b': (1 - split) + 'fr', gridTemplateColumns: `var(--mcol) minmax(0,${split}fr) 14px minmax(0,${1 - split}fr) var(--dcol)` }}>
        <div className="cd-hd">
          <div>Metric</div>
          <div className="cd-hd__ab"><span className="cd-tag" style={{ width: 20, height: 20, fontSize: 11, borderRadius: 6 }}>A</span><span><b className="cd-hd__l">{lab(shown.a, scB)}</b>{staleA ? 'Updating · showing previous' : subjName(shown.a.subject)}</span></div>
          <div className="cd-gap"></div>
          <div className="cd-hd__ab"><span className="cd-tag is-b" style={{ width: 20, height: 20, fontSize: 11, borderRadius: 6 }}>B</span><span><b className="cd-hd__l">{lab(scB, shown.a)}</b>{staleB ? 'Updating · showing previous' : subjName(scB.subject)}</span></div>
          <div><b className="cd-hd__l">Difference</b>{lab(shown.a, scB)} vs {lab(scB, shown.a)}</div>
        </div>
        {G[2].map((mk) => {
          const m = T.M[mk], c = T.compare(mk, ra, rb);
          const all = [...(c.a.pts || []), ...(c.b.pts || [])].map((p) => p[1]);
          const lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1;
          const Cell = ({ side, st, stale }) => {
            if (side === 'b' && bFail) return <div className="cd-pane-err">{mk === G[2][0] ? <><b>B didn’t load</b><span>A is still accurate. No difference is shown against missing data.</span><Button size="sm" leftIcon="refresh-cw" onClick={() => { setRetry(1); hap('light'); }}>Retry B</Button></> : <span className="cd-sk" style={{ animation: 'none', opacity: .5 }}></span>}</div>;
            const empty = st.state === 'none' || st.state === 'noshot', thin = st.state === 'thin';
            return (
              <button type="button" className={'cd-v' + (empty ? ' is-empty' : '') + (thin ? ' is-thin' : '') + (stale ? ' cd-stale' : '')} onClick={() => ev(side, mk)} aria-label={`${m.label}, ${side.toUpperCase()}: ${empty ? 'no data' : m.fmt(st.v)}. Open evidence.`}>
                <span className="cd-v__top"><span className="cd-v__n">{empty ? '—' : m.fmt(st.v)}</span><span className="cd-v__d">{m.info ? (st.v === st.n ? 'all 18 holes' : `${st.n - st.v} nine-hole excluded`) : empty ? (m.shot ? 'No shot data in sample' : 'No rounds') : thin ? `Only ${st.n} · need ${T.MIN}` : `${st.hit != null ? st.hit + ' of ' : ''}${st.n} ${st.unit}${st.of != null && st.of !== st.n ? ` · ${st.of - st.n} without` : ''}`}</span></span>
                {!m.info && <Strip pts={st.pts} lo={lo} hi={hi} mean={st.state === 'ok' ? st.v : null} other={side === 'a' ? (c.b.state === 'ok' ? c.b.v : null) : (c.a.state === 'ok' ? c.a.v : null)} onPick={(r) => ev(side, mk, r)} />}
              </button>
            );
          };
          const why = m.info ? '' : bFail ? 'Waiting for B' : c.a.state !== 'ok' || c.b.state !== 'ok' ? (c.a.state === 'thin' || c.b.state === 'thin' ? `Too few rounds to compare (under ${T.MIN})` : m.shot ? 'Needs shot data on both sides' : 'No rounds on one side') : m.note || (m.bench ? `${m.bench} · ${m.per}` : m.pp ? 'Percentage points' : 'Per 18 holes');
          return (
            <div key={mk} className={'cd-row' + (hover === mk ? ' is-hover' : '')} onMouseEnter={() => setHover(mk)} onMouseLeave={() => setHover(null)}>
              <div className="cd-m"><b>{m.label}</b><span>{m.lower ? 'Lower is better' : m.info ? 'Sample size' : 'Higher is better'}</span></div>
              <div><Cell side="a" st={c.a} stale={staleA} /></div>
              <div className="cd-gap"></div>
              <div><Cell side="b" st={c.b} stale={staleB} /></div>
              <div className="cd-dl">{c.d == null ? <><b className="is-flat">{m.info ? 'Different samples' : '—'}</b><span>{why}</span></> : <><b className={c.better == null ? 'is-flat' : c.better ? 'is-good' : 'is-bad'}><Icon name={c.better == null ? 'equal' : c.better ? 'trending-up' : 'trending-down'} size={14} />{c.word}</b><span title={why}>{c.better == null ? 'No real gap' : <>{lab(shown.a, scB)} {c.better ? 'better' : 'worse'} than {lab(scB, shown.a)}</>}{mk === 'avg' ? ' · courses differ' : ''}</span></>}</div>
            </div>
          );
        })}
        <div className={'cd-div' + (drag ? ' is-drag' : '')} role="separator" aria-orientation="vertical" aria-label="Resize A and B columns" aria-valuemin={35} aria-valuemax={65} aria-valuenow={Math.round(split * 100)} aria-valuetext={`A ${Math.round(split * 100)} percent, B ${Math.round((1 - split) * 100)} percent`} tabIndex={0} onPointerDown={onDown} onDoubleClick={() => setSplit(.5)} onKeyDown={onKey} style={{ left: `calc(var(--mcol) + (100% - var(--mcol) - var(--dcol) - 14px) * ${split} + 7px)` }}><span className="cd-div__grip"><Icon name="grip-vertical" size={14} /></span></div>
        <div className="cd-foot"><span>Dots are rounds on one shared scale · bar is the average · dashed line is the other side’s average. Click any value for the rounds behind it.</span><span className="cd-split"><Icon name="columns-2" size={14} />{Math.round(split * 100)} / {Math.round((1 - split) * 100)}{split !== .5 && <button type="button" className="tr-link" style={{ marginTop: 0 }} onClick={() => setSplit(.5)}>Reset</button>}</span></div>
      </div>
    </div>
  );
}

// ── evidence drawer ──
function Evidence({ ev, onClose }) {
  const [open, setOpen] = React.useState(ev && ev.round ? ev.round.id : null);
  React.useEffect(() => { setOpen(ev && ev.round ? ev.round.id : null); const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [ev]);
  if (!ev) return null;
  const m = ev.mkey ? T.M[ev.mkey] : null, st = m ? T.stat(ev.mkey, ev.rounds) : null;
  const inc = m ? new Set((st.pts || []).map((p) => p[0].id)) : null;
  const list = [...ev.rounds].sort((a, b) => b.date.localeCompare(a.date));
  const val = (r) => { if (!m) return T.toPar(r.toPar); const p = (st.pts || []).find((x) => x[0].id === r.id); return p ? m.fmt(p[1]) : '—'; };
  const R = list.find((r) => r.id === open);
  return (<>
    <div className="ev-scrim" onClick={onClose}></div>
    <aside className="ev" role="dialog" aria-label="Evidence">
      <div className="ev-h">
        <div style={{ minWidth: 0 }}>
          <span className="tr-chip"><span className={'cd-tag' + (ev.side === 'b' ? ' is-b' : '')} style={{ width: 16, height: 16, fontSize: 10, borderRadius: 4 }}>{(ev.side || 'a').toUpperCase()}</span>{scopeTitle(ev.scope)}</span>
          <h3>{m ? m.label : 'Rounds in this sample'}</h3>
          {m && <p>{st.state === 'ok' || st.state === 'thin' ? <>{m.fmt(st.v)} from {st.hit != null ? `${st.hit} of ` : ''}{st.n} {st.unit}.</> : 'Not enough data for this metric.'} {m.note || (m.bench ? `Strokes gained against the ${m.bench}.` : '')}</p>}
        </div>
        <IconButton icon="x" label="Close evidence" onClick={onClose} />
      </div>
      <div className="ev-b">
        {m && <div className="ev-fig"><div><span>Value</span><b>{st.v == null ? '—' : m.fmt(st.v)}</b></div><div><span>Denominator</span><b>{st.n}</b></div><div><span>Rounds used</span><b>{inc.size} / {list.length}</b></div></div>}
        <div className="ev-list" role="list">
          {list.map((r) => { const used = !inc || inc.has(r.id); return (
            <button key={r.id} role="listitem" type="button" className={'ev-r' + (open === r.id ? ' is-on' : '')} style={used ? null : { opacity: .55 }} onClick={() => setOpen(open === r.id ? null : r.id)}>
              <span className="ev-r__d">{T.fmtD(r.date)}<br />{T.fmtD(r.date, { weekday: 'short' })}</span>
              <span style={{ minWidth: 0 }}><span className="tr-t1" style={{ display: 'block' }}>{r.event ? `${EV(r.event).name} · R${r.rnd}` : r.ctx === 'qualifier' ? 'Qualifier round' : r.holes === 9 ? 'Practice · 9 holes' : 'Practice round'}</span><span className="tr-t2" style={{ display: 'block' }}>{T.P[r.player].name.split(' ')[0]} · {r.courseName} · {r.score} ({T.toPar(r.toPar)}){r.nc ? ' · not counted' : ''}{!used ? (r.holes === 9 ? ' · excluded: nine holes' : ' · excluded: no shot data') : ''}</span></span>
              <span className="ev-r__v">{val(r)}<em>{r.shot ? 'Shot data' : 'Scorecard'}</em></span>
            </button>); })}
        </div>
        {R && <div className="ev-card" aria-label="Scorecard">
          <div className="tr-t1" style={{ marginBottom: 8 }}>{T.P[R.player].name} · {R.courseName} · {R.tees}</div>
          {R.holes === 18 ? [0, 9].map((o) => { const hs = T.holeScores(R).slice(o, o + 9); return <div key={o} className="ev-nine"><span>{o ? 'In' : 'Out'}</span>{hs.map((h) => <span key={h.n}>{h.n}</span>)}<span>Tot</span><span>Par</span>{hs.map((h) => <span key={h.n}>{h.par}</span>)}<span>{hs.reduce((s, h) => s + h.par, 0)}</span><span></span>{hs.map((h) => { const { ScoreMark } = window.FairwayClubhouseEdition_9c4f4d; return <span key={h.n}><ScoreMark score={h.score} par={h.par} size="sm" /></span>; })}<span className="t">{hs.reduce((s, h) => s + h.score, 0)}</span></div>; }) : <p className="tr-t2">Nine-hole scorecard · {R.score} on par {R.par}. Kept out of 18-hole scoring averages.</p>}
          <div className="tr-t2" style={{ marginTop: 10 }}>GIR {R.gir}/{R.holes} · Fairways {R.fw}/{R.fwOpp} · Putts {R.putts} · Penalties {R.pen}{R.sg ? ` · SG putting ${R.sg.putt > 0 ? '+' : '−'}${Math.abs(R.sg.putt).toFixed(1)}` : ' · no shot data'}</div>
        </div>}
      </div>
    </aside>
  </>);
}
Object.assign(window, { CompareDesk, Evidence, TOUR_PRESETS: PRESETS, tourScopeTitle: scopeTitle });
})();
