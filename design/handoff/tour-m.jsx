// Tournaments · iPhone. Same engine (tour-data.js), phone layout: paired A/B blocks, sheets for editing and evidence.
(function () {
const { Button, Icon, Segmented, Avatar, ScoreMark, Select } = window.FairwayClubhouseEdition_9c4f4d;
const T = window.TOUR;
const hap = (k) => window.GH && GH.haptic && GH.haptic(k);
const EV = (id) => T.EVENTS.find((e) => e.id === id);
const done = T.EVENTS.filter((e) => !e.upcoming);
const P = window.TOUR_PRESETS;
const CTXW = { tournament: 'Tournaments', qualifier: 'Qualifiers', practice: 'Practice' };
const who = (s) => s === 'team' ? 'Team' : s === 'matched' ? 'Returning' : T.P[s].name.split(' ')[0];
const short = (sc) => `${who(sc.subject)} · ${sc.sample === 'event' ? EV(sc.event).name.split(' ')[0] + (sc.rounds ? ' R' + sc.rounds[0] : '') : CTXW[sc.ctx] + (sc.sample === 'last' ? ' · last season' : sc.sample === 'l10' ? ' · last 10' : '')}`;

function MEvents({ go }) {
  const n = T.EVENTS.find((e) => e.upcoming);
  return (<div className="tm">
    <div className="tm-h"><span>Varsity · Fall 2026</span><h1>Tournaments</h1></div>
    <div className="tm-seg"><Segmented size="sm" label="View" value="events" onChange={(v) => go(v)} options={[{ value: 'events', label: 'Events' }, { value: 'compare', label: 'Compare' }, { value: 'history', label: 'History' }]} /></div>
    <div className="tm-up"><div className="tm-up__k"><span>Oct 20 – 21 · {T.COURSES[n.course][0]}</span><span>In 6 days</span></div><b>{n.name}</b><p>{n.lineupNote}</p></div>
    <div className="tm-sec">This season</div>
    <div className="tm-list">{done.filter((e) => e.season === '2026–27').reverse().map((e) => { const r = T.eventRows(e.id), d = r.total - r.par; return (
      <button key={e.id} type="button" className="tm-row" onClick={() => go('event', e.id)}><span className="tm-row__m"><b>{e.name}</b><em>{T.fmtD(e.dates[0])} · {T.COURSES[e.course][0]}</em></span><span className="tm-row__v"><b className="tr-num">{e.finish[0]}<small> of {e.finish[1]}</small></b><em className={d < 0 ? 'tr-under' : ''}>{r.total} · {T.toPar(d)}</em></span><Icon name="chevron-right" size={15} /></button>); })}</div>
    <div className="tm-sec">Last season</div>
    <div className="tm-list">{done.filter((e) => e.season === '2025–26').reverse().map((e) => { const r = T.eventRows(e.id), d = r.total - r.par; return (
      <button key={e.id} type="button" className="tm-row" onClick={() => go('event', e.id)}><span className="tm-row__m"><b>{e.name}</b><em>{T.fmtD(e.dates[0], { month: 'short', year: 'numeric' })}{e.missing ? ' · scorecards only' : ''}</em></span><span className="tm-row__v"><b className="tr-num">{e.finish[0]}<small> of {e.finish[1]}</small></b><em className={d < 0 ? 'tr-under' : ''}>{T.toPar(d)}</em></span><Icon name="chevron-right" size={15} /></button>); })}</div>
  </div>);
}

function MEvent({ eid, go, tab: t0 = 'who', openEv }) {
  const r = T.eventRows(eid), e = r.e, d = r.total - r.par;
  const [tab, setTab] = React.useState(t0), [rd, setRd] = React.useState(3);
  return (<div className="tm">
    <button type="button" className="tr-crumb" onClick={() => go('events')}><Icon name="chevron-left" size={15} />Tournaments</button>
    <div className="tm-h" style={{ marginTop: 6 }}><span>{T.fmtD(e.dates[0])} – {T.fmtD(e.dates[e.dates.length - 1], { day: 'numeric' })} · {T.COURSES[e.course][0]}</span><h1 style={{ fontSize: 28 }}>{e.name}</h1></div>
    <div className="tm-res"><b className="tr-num">{r.total}</b><span className={d < 0 ? 'tr-under' : ''}>{T.toPar(d)}</span><em>{e.finish[0]} of {e.finish[1]}</em><span className="tr-chip is-warn" style={{ marginLeft: 'auto' }}>11 of 15 shot data</span></div>
    <div className="tm-seg"><Segmented size="sm" label="Section" value={tab} onChange={(v) => { hap('selection'); setTab(v); }} options={[{ value: 'who', label: 'Who counted' }, { value: 'holes', label: 'Holes' }, { value: 'cmp', label: 'Compare' }]} /></div>
    {tab === 'who' && <>
      <div className="tm-ct">
        <div className="tm-ct__h"><span>Player</span>{e.rounds.map((_, i) => <span key={i}>R{i + 1}</span>)}<span>Tot</span></div>
        {r.rows.map((x) => <div key={x.id} className={'tm-ct__r' + (x.ind ? ' is-ind' : '')}><span className="tm-ct__p"><b>{x.p.name.split(' ')[0]}</b><em>{x.ind ? 'Individual' : `${x.counted}/${e.rounds.length} counted`}</em></span>{x.rounds.map((q) => <button key={q.id} type="button" className={'tm-sc tr-num' + (q.nc ? ' is-nc' : '')} onClick={() => openEv({ scope: { subject: x.id, ctx: 'tournament', sample: 'event', event: eid }, rounds: x.rounds, round: q })}>{q.score}{q.nc && <em>NC</em>}</button>)}<span className="tm-ct__t tr-num">{x.total}</span></div>)}
        <div className="tm-ct__r is-team"><span className="tm-ct__p"><b>Team</b><em>Lowest {e.count[1]}</em></span>{r.team.map((v, i) => <span key={i} className="tm-sc tr-num" style={{ fontWeight: 700 }}>{v}</span>)}<span className="tm-ct__t tr-num">{r.total}</span></div>
      </div>
      <p className="tm-note">NC means not counted that round. Jonah’s 69 in round 3 was the team’s best final-round score.</p>
    </>}
    {tab === 'holes' && <>
      <div className="tm-seg"><Segmented size="sm" label="Round" value={'r' + rd} onChange={(v) => setRd(+v.slice(1))} options={e.rounds.map((_, i) => ({ value: 'r' + (i + 1), label: 'R' + (i + 1) }))} /></div>
      <div className="tm-hg" role="region" aria-label="Hole-by-hole scores, scrolls sideways" tabIndex={0}>
        <div className="tm-hg__in">
          <div className="tm-hg__r is-h"><span>Hole</span>{T.PARS.map((_, i) => <span key={i}>{i + 1}</span>)}</div>
          <div className="tm-hg__r is-par"><span>Par</span>{T.PARS.map((p, i) => <span key={i}>{p}</span>)}</div>
          {r.rows.filter((x) => !x.ind).map((x) => { const q = x.rounds.find((z) => z.rnd === rd); const hs = T.holeScores(q); return <div key={x.id} className="tm-hg__r"><span>{x.p.name.split(' ')[0]}{q.nc ? ' NC' : ''}</span>{hs.map((h) => <span key={h.n}><ScoreMark score={h.score} par={h.par} size="sm" /></span>)}</div>; })}
        </div>
      </div>
      <p className="tm-note">Swipe the grid sideways. The page itself doesn’t scroll sideways.</p>
    </>}
    {tab === 'cmp' && <MCompare initial="rr" embedded openEv={openEv} />}
  </div>);
}

function MStrip({ pts, lo, hi, mean }) {
  const x = (v) => hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100;
  return <div className="tm-strip" aria-hidden="true">{(pts || []).map(([r, v]) => <i key={r.id} style={{ left: `calc(${x(v)}% - 3px)` }}></i>)}{mean != null && <b style={{ left: `calc(${x(mean)}% - 1px)` }}></b>}</div>;
}
function MCompare({ initial = 'tq', embedded, scenario = 'ok', openEv, editing, go }) {
  const p0 = P.find((p) => p[0] === initial) || P[0];
  const [A, setA] = React.useState(p0[2]), [B, setB] = React.useState(p0[3]);
  const [group, setGroup] = React.useState('scoring');
  const [edit, setEdit] = React.useState(!!editing);
  const [retry, setRetry] = React.useState(false);
  const bFail = scenario === 'bfail' && !retry;
  const scB = scenario === 'thin' ? { ...B, sample: 'range', range: ['2026-09-20', '2026-09-24'] } : B;
  const ra = T.select(A), rb = bFail ? [] : T.select(scB), sa = T.summary(ra), sb = T.summary(rb);
  const G = T.GROUPS.find((g) => g[0] === group);
  return (<div className={embedded ? '' : 'tm'}>
    {!embedded && <><div className="tm-h"><span>Varsity · Fall 2026</span><h1>Tournaments</h1></div><div className="tm-seg"><Segmented size="sm" label="View" value="compare" onChange={(v) => go && go(v)} options={[{ value: 'events', label: 'Events' }, { value: 'compare', label: 'Compare' }, { value: 'history', label: 'History' }]} /></div></>}
    <div className="tm-scopes">
      <div className="tm-scope"><span className="cd-tag" style={{ width: 20, height: 20, fontSize: 11, borderRadius: 6 }}>A</span><b>{short(A)}</b><em>{sa.full} rounds · {sa.shot} with shot data</em></div>
      <div className="tm-scope"><span className="cd-tag is-b" style={{ width: 20, height: 20, fontSize: 11, borderRadius: 6 }}>B</span><b>{short(scB)}</b><em>{bFail ? 'Didn’t load' : `${sb.full} rounds · ${sb.shot} with shot data`}</em></div>
    </div>
    <button type="button" className="tm-edit" onClick={() => { hap('light'); setEdit(true); }}><Icon name="sliders-horizontal" size={15} />Edit comparison</button>
    <nav className="tm-groups" role="tablist">{T.GROUPS.map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={group === id} onClick={() => { hap('selection'); setGroup(id); }}>{l}</button>)}</nav>
    {bFail && <div className="tm-err"><Icon name="wifi-off" size={16} /><span><b>B didn’t load</b>A is still accurate. No differences are shown until B loads.</span><Button size="sm" onClick={() => setRetry(true)}>Retry</Button></div>}
    <div className="tm-blocks">{G[2].map((mk) => {
      const m = T.M[mk], c = T.compare(mk, ra, rb);
      const all = [...(c.a.pts || []), ...(c.b.pts || [])].map((p) => p[1]), lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1;
      const V = ({ st, side }) => { const empty = st.state !== 'ok' && st.state !== 'thin'; return <button type="button" className="tm-v" onClick={() => openEv({ side, scope: side === 'a' ? A : scB, rounds: side === 'a' ? ra : rb, mkey: mk })} disabled={side === 'b' && bFail}><b className={'tr-num' + (empty ? ' is-e' : st.state === 'thin' ? ' is-t' : '')}>{side === 'b' && bFail ? '—' : empty ? '—' : m.fmt(st.v)}</b><em>{side === 'b' && bFail ? 'Not loaded' : m.info ? 'rounds' : empty ? (m.shot ? 'No shot data' : 'No rounds') : st.state === 'thin' ? `Only ${st.n}` : `${st.n} ${st.unit.replace('rounds with shot data', 'shot rounds')}`}</em>{!m.info && !(side === 'b' && bFail) && <MStrip pts={st.pts} lo={lo} hi={hi} mean={st.state === 'ok' ? st.v : null} />}</button>; };
      return <div key={mk} className="tm-block"><div className="tm-block__h"><b>{m.label}</b><span>{m.lower ? 'Lower is better' : m.info ? '' : 'Higher is better'}</span></div><div className="tm-block__ab"><V st={c.a} side="a" /><V st={c.b} side="b" /></div>{!m.info && <div className="tm-block__d">{c.d == null ? <span>{bFail ? 'Waiting for B' : c.a.state === 'thin' || c.b.state === 'thin' ? `Too few rounds to compare (under ${T.MIN})` : m.shot ? 'Needs shot data on both sides' : 'No rounds on one side'}</span> : <><b className={c.better == null ? '' : c.better ? 'is-good' : 'is-bad'}>A {c.word}</b><span>{mk === 'avg' ? 'Courses differ' : m.pp ? 'Percentage points' : m.shot ? 'Shot rounds only' : 'Per 18'}</span></>}</div>}</div>;
    })}</div>
    {edit && <MSheet title="Edit comparison" sub="A and B are set separately" onClose={() => setEdit(false)} foot={<Button variant="primary" fullWidth onClick={() => { hap('success'); setEdit(false); }}>Show comparison</Button>}>
      <div className="tm-ed">
        <div className="tm-ed__k">Presets</div>
        <div className="tm-ed__pre">{P.slice(0, 4).map((p) => <button key={p[0]} type="button" className="cd-pre" onClick={() => { setA(p[2]); setB(p[3]); hap('selection'); }}>{p[1]}</button>)}</div>
        {[['A', A, setA], ['B', B, setB]].map(([l, sc, set]) => <div key={l} className="tm-ed__side">
          <div className="tm-ed__k"><span className={'cd-tag' + (l === 'B' ? ' is-b' : '')} style={{ width: 18, height: 18, fontSize: 10, borderRadius: 5 }}>{l}</span>Scope {l}</div>
          <Select value={sc.subject} options={[{ value: 'team', label: 'Team · pooled' }, ...T.PLAYERS.filter((p) => !p.alumni).map((p) => ({ value: p.id, label: p.name }))]} onChange={(v) => set({ ...sc, subject: v })} />
          <Segmented size="sm" label={'Context ' + l} value={sc.ctx} onChange={(v) => set({ ...sc, ctx: v, ...(sc.sample === 'event' ? { sample: 'season' } : {}) })} options={[{ value: 'tournament', label: 'Tournaments' }, { value: 'qualifier', label: 'Qualifiers' }, { value: 'practice', label: 'Practice' }]} />
          <Select value={sc.sample} options={[{ value: 'season', label: 'This season' }, { value: 'last', label: 'Last season' }, { value: 'l10', label: 'Last 10 rounds' }, { value: 'range', label: 'Date range' }]} onChange={(v) => set({ ...sc, sample: v, range: v === 'range' ? ['2026-08-01', '2026-10-14'] : undefined })} />
          {sc.sample === 'range' && <div className="tm-ed__dates"><label><span>From</span><input type="date" value={sc.range[0]} onChange={(e) => set({ ...sc, range: [e.target.value, sc.range[1]] })} /></label><label><span>To</span><input type="date" value={sc.range[1]} onChange={(e) => set({ ...sc, range: [sc.range[0], e.target.value] })} /></label></div>}
        </div>)}
      </div>
    </MSheet>}
  </div>);
}

function MHistory({ go }) {
  const pts = done.map((e) => { const rs = T.ROUNDS.filter((r) => r.event === e.id && !r.ind); return { e, v: rs.reduce((s, r) => s + (r.score - T.COURSES[r.course][3]), 0) / rs.length }; });
  const lo = Math.min(...pts.map((p) => p.v)) - .5, hi = Math.max(...pts.map((p) => p.v)) + .5;
  return (<div className="tm">
    <div className="tm-h"><span>Varsity · Fall 2026</span><h1>Tournaments</h1></div>
    <div className="tm-seg"><Segmented size="sm" label="View" value="history" onChange={(v) => go(v)} options={[{ value: 'events', label: 'Events' }, { value: 'compare', label: 'Compare' }, { value: 'history', label: 'History' }]} /></div>
    <div className="tm-trend"><div className="tr-t1">Team vs course rating</div><div className="tr-t2">Per round · lower is better · actual lineups</div>
      <div className="tm-bars">{pts.map((p, i) => <button key={p.e.id} type="button" onClick={() => go('event', p.e.id)} className={'tm-bar' + (p.e.season === '2026–27' ? ' is-now' : '')} aria-label={`${p.e.name} ${p.v.toFixed(1)}`}><b className="tr-num">{p.v > 0 ? '+' : '−'}{Math.abs(p.v).toFixed(1)}</b><i style={{ height: 14 + ((hi - p.v) / (hi - lo)) * 70 + 'px' }}></i><span>{p.e.name.split(' ')[0]}</span></button>)}</div>
      <p className="tr-trend__note">This season’s lineup is 0.9 strokes a round closer to the rating. Will graduated and Eli and Priya joined, so it isn’t the same players.</p>
    </div>
  </div>);
}

function MEvidence({ ev, onClose }) {
  if (!ev) return null;
  const m = ev.mkey ? T.M[ev.mkey] : null, st = m ? T.stat(ev.mkey, ev.rounds) : null;
  const R = ev.round;
  return <MSheet title={m ? m.label : `${T.P[R.player].name.split(' ')[0]} · R${R.rnd}`} sub={window.tourScopeTitle(ev.scope)} onClose={onClose} tall>
    {m && <div className="ev-fig" style={{ marginBottom: 12 }}><div><span>Value</span><b>{st.v == null ? '—' : m.fmt(st.v)}</b></div><div><span>Of</span><b>{st.n}</b></div><div><span>Rounds</span><b>{(st.pts || []).length}</b></div></div>}
    {R && <div className="ev-card" style={{ marginBottom: 12 }}><div className="tr-t1" style={{ marginBottom: 8 }}>{R.courseName} · {R.score} ({T.toPar(R.toPar)}){R.nc ? ' · not counted' : ''}</div>{[0, 9].map((o) => { const hs = T.holeScores(R).slice(o, o + 9); return <div key={o} className="ev-nine" style={{ minWidth: 0 }}><span>{o ? 'In' : 'Out'}</span>{hs.map((h) => <span key={h.n}>{h.n}</span>)}<span>Tot</span><span></span>{hs.map((h) => <span key={h.n}><ScoreMark score={h.score} par={h.par} size="sm" /></span>)}<span className="t">{hs.reduce((s, h) => s + h.score, 0)}</span></div>; })}<div className="tr-t2" style={{ marginTop: 8 }}>GIR {R.gir}/18 · Putts {R.putts} · Penalties {R.pen}{R.shot ? '' : ' · scorecard only'}</div></div>}
    <div className="ev-list">{[...ev.rounds].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((r) => <div key={r.id} className="ev-r" style={{ cursor: 'default', gridTemplateColumns: '44px minmax(0,1fr) auto' }}><span className="ev-r__d">{T.fmtD(r.date)}</span><span className="tr-t1" style={{ fontSize: 13.5 }}>{r.event ? `${EV(r.event).name.split(' ')[0]} R${r.rnd}` : r.ctx === 'qualifier' ? 'Qualifier' : 'Practice'}<span className="tr-t2" style={{ display: 'block' }}>{r.courseName}</span></span><span className="ev-r__v">{r.score}<em>{r.shot ? 'Shot data' : 'Scorecard'}</em></span></div>)}</div>
  </MSheet>;
}

function TourM({ initial = {} }) {
  const [v, setV] = React.useState(initial.view || 'events');
  const [eid, setEid] = React.useState(initial.eid || 'e33');
  const [ev, setEv] = React.useState(initial.ev ? (() => { const x = T.eventRows('e33').rows.find((r) => r.id === 'jonah'); return { scope: { subject: 'jonah', ctx: 'tournament', sample: 'event', event: 'e33' }, rounds: x.rounds, round: x.rounds[2] }; })() : null);
  const go = (to, id) => { hap('selection'); if (id) setEid(id); setV(to); };
  const open = (x) => { hap('light'); setEv(x); };
  let body;
  if (v === 'events') body = <MEvents go={go} />;
  else if (v === 'event') body = <MEvent key={eid + (initial.tab || '')} eid={eid} go={go} tab={initial.tab} openEv={open} />;
  else if (v === 'compare') body = <MCompare initial={initial.preset} scenario={initial.scenario} editing={initial.edit} openEv={open} go={go} />;
  else body = <MHistory go={go} />;
  return <MApp tab="more" top={<MTop back="More" title="" onBack={() => {}} />} sheet={<MEvidence ev={ev} onClose={() => setEv(null)} />}>{body}</MApp>;
}
Object.assign(window, { TourM });
})();
