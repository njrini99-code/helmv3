// Tournaments tab: home (upcoming + season ledger + trend), event desk, comparison, history.
(function () {
const { Button, IconButton, Icon, Segmented, Tabs, Avatar, ScoreMark, InlineNotice } = window.FairwayClubhouseEdition_9c4f4d;
const T = window.TOUR;
const hap = (k) => window.GH && GH.haptic && GH.haptic(k);
const EV = (id) => T.EVENTS.find((e) => e.id === id);
const done = T.EVENTS.filter((e) => !e.upcoming);
const rel = (e) => { const r = T.eventRows(e.id); return r.total - r.par; };
const covOf = (e) => { const r = T.eventRows(e.id), team = r.rs.filter((x) => !x.ind); return [team.filter((x) => x.shot).length, team.length]; };
const dates = (e) => { const a = e.dates[0], b = e.dates[e.dates.length - 1]; return T.fmtD(a) + (a !== b ? ' – ' + T.fmtD(b, a.slice(5, 7) === b.slice(5, 7) ? { day: 'numeric' } : { month: 'short', day: 'numeric' }) : ''); };

function Upcoming({ go }) {
  const up = T.EVENTS.filter((e) => e.upcoming), n = up[0];
  return (
    <section className="tr-sec" aria-label="Upcoming">
      <div className="tr-sec__h"><h2>Up next</h2><span>{up.length} events on the calendar</span></div>
      <div className="tr-up">
        <div className="tr-upc">
          <div className="tr-upc__k"><span>{dates(n)} · {T.COURSES[n.course][0]}</span><span>In 6 days</span></div>
          <h3>{n.name}</h3>
          <p>{n.rounds.length * 18} holes · stroke play · {n.count[0]} count {n.count[1]} each round. {n.lineupNote}.</p>
          <div className="tr-upc__f"><Button size="sm" variant="primary" leftIcon="medal" href="Coach - Qualifiers.html">Open qualifier</Button><Button size="sm" leftIcon="git-compare" onClick={() => go('compare', { preset: 'tq' })}>Compare lineup options</Button></div>
        </div>
        <div className="tr-sheet tr-upn">
          {up.slice(1).concat([{ id: 'x', name: 'Conference Championship', dates: ['2027-04-18', '2027-04-20'], course: 'dog', rounds: [1, 2, 3], count: [5, 4], lineupNote: 'Spring · field announced in March' }]).map((e) => (
            <div key={e.id} className="tr-upn__r"><span className="tr-date"><b>{T.fmtD(e.dates[0], { day: 'numeric' })}</b><span>{T.fmtD(e.dates[0], { month: 'short' })}</span></span><div><div className="tr-t1">{e.name}</div><div className="tr-t2">{T.COURSES[e.course][0]} · {e.rounds.length * 18} holes · {e.lineupNote}</div></div><span className="tr-chip">Upcoming</span></div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Ledger({ go, seasons = ['2026–27', '2025–26'] }) {
  return (
    <div className="tr-sheet tr-led" role="table" aria-label="Season ledger">
      <div className="tr-led__row tr-led__h" role="row"><span>Event</span><span>Dates</span><span>Format</span><span className="tr-r">Team</span><span className="tr-r">Finish</span><span>Shot data</span><span></span></div>
      {seasons.map((sn) => <React.Fragment key={sn}>
        <div className="tr-led__season">{sn === '2026–27' ? 'This season · 2026–27' : 'Last season · 2025–26'}</div>
        {done.filter((e) => e.season === sn).slice().reverse().map((e) => { const r = T.eventRows(e.id), d = r.total - r.par, [s, n] = covOf(e); return (
          <button key={e.id} type="button" role="row" className="tr-led__row" onClick={() => go('event', { eid: e.id })}>
            <span><span className="tr-t1" style={{ display: 'block' }}>{e.name}</span><span className="tr-t2" style={{ display: 'block' }}>{T.COURSES[e.course][0]} · {r.rows.filter((x) => !x.ind).map((x) => x.p.name.split(' ')[0]).join(', ')}</span></span>
            <span className="tr-t2" style={{ marginTop: 0 }}>{dates(e)}</span>
            <span className="tr-t2" style={{ marginTop: 0 }}>{e.rounds.length * 18} holes · {e.count[0]}-count-{e.count[1]}</span>
            <span className="tr-r tr-num tr-fin">{r.total} <em className={d < 0 ? 'tr-under' : ''}>{T.toPar(d)}</em></span>
            <span className="tr-r tr-fin tr-num">{e.finish[0]}<em> of {e.finish[1]}</em></span>
            <span className="tr-cov"><span className="tr-cov__bar"><i style={{ width: (s / n) * 100 + '%' }}></i></span>{s ? `${s} of ${n}` : 'Scorecards only'}</span>
            <Icon name="chevron-right" size={15} style={{ color: 'var(--text-tertiary)' }} />
          </button>); })}
      </React.Fragment>)}
    </div>
  );
}

// team score vs course rating per event; matched mode keeps only players in both seasons
function Trend({ go, mode }) {
  const pts = done.map((e) => { const rs = T.ROUNDS.filter((r) => r.event === e.id && !r.ind && (mode === 'actual' || T.MATCHED.includes(r.player))); const v = rs.reduce((s, r) => s + (r.score - T.COURSES[r.course][3]), 0) / rs.length; return { e, v, n: rs.length, players: new Set(rs.map((r) => r.player)).size }; });
  const W = 1000, H = 220, pad = 36, lo = Math.min(...pts.map((p) => p.v)) - .6, hi = Math.max(...pts.map((p) => p.v)) + .6;
  const x = (i) => pad + (i * (W - pad * 2)) / (pts.length - 1), y = (v) => 18 + ((v - lo) / (hi - lo)) * (H - 50);
  const segs = [[0, 3], [4, 6]]; // seasons are separate lines; no line across the summer gap
  const mean = pts.reduce((s, p) => s + p.v, 0) / pts.length;
  return (
    <div className="tr-sheet tr-trend">
      <div className="tr-trend__top"><div><div className="tr-t1">Team scoring against course rating</div><div className="tr-t2">Average of every team round, minus the rating of the tees played · lower is better · {mode === 'actual' ? 'actual lineups' : `returning players only (${T.MATCHED.length})`}</div></div></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Team scoring trend by event">
        <line x1={pad} x2={W - pad} y1={y(mean)} y2={y(mean)} stroke="#CFC9BA" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        <line x1={(x(3) + x(4)) / 2} x2={(x(3) + x(4)) / 2} y1={8} y2={H - 26} stroke="#E4DFD2" vectorEffect="non-scaling-stroke" />
        {segs.map(([a, b]) => <path key={a} d={pts.slice(a, b + 1).map((p, i) => `${i ? 'L' : 'M'}${x(a + i)},${y(p.v)}`).join('')} fill="none" stroke="#155A39" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div style={{ position: 'relative', height: 0 }}>
        {pts.map((p, i) => <button key={p.e.id} type="button" className="tr-pt" onClick={() => go('event', { eid: p.e.id })} title={`${p.e.name} · ${p.n} rounds · ${p.players} players`} style={{ all: 'unset', cursor: 'pointer', position: 'absolute', left: `calc(${(x(i) / W) * 100}% - 7px)`, top: -(H - y(p.v)) - 7 - 26, width: 14, height: 14, borderRadius: '50%', background: '#FDFCF8', boxShadow: `inset 0 0 0 3px ${p.e.missing ? '#A8A294' : '#155A39'}` }} aria-label={`${p.e.name}: ${p.v > 0 ? '+' : '−'}${Math.abs(p.v).toFixed(1)} per round`}></button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${pts.length},minmax(0,1fr))`, marginTop: -18 }}>{pts.map((p) => <span key={p.e.id} className="tr-t2" style={{ textAlign: 'center', marginTop: 0 }}><b className="tr-num" style={{ display: 'block', color: 'var(--text-primary)', fontWeight: 600 }}>{p.v > 0 ? '+' : '−'}{Math.abs(p.v).toFixed(1)}</b>{p.e.name.split(' ')[0]} · {T.fmtD(p.e.dates[0], { month: 'short', year: '2-digit' })}</span>)}</div>
      <p className="tr-trend__note">{mode === 'actual' ? 'This season’s three events average 0.9 strokes a round closer to the rating than last season. Will Harper graduated and Eli and Priya joined the lineup, so this is the team you fielded, not the same players improving.' : 'The four returning players are 0.6 strokes a round closer to the rating this season, a smaller gain than the full lineup shows.'}</p>
    </div>
  );
}

function Home({ go }) {
  return (<>
    <Upcoming go={go} />
    <section className="tr-sec"><div className="tr-sec__h"><h2>Season ledger</h2><span>Official finish and counting totals · open an event for rounds and players</span></div><Ledger go={go} /></section>
  </>);
}
function History({ go }) {
  const [mode, setMode] = React.useState('actual');
  return (<>
    <section className="tr-sec">
      <div className="tr-sec__h"><h2>Across seasons</h2><Segmented size="sm" label="Lineup mode" value={mode} onChange={(v) => { hap('selection'); setMode(v); }} options={[{ value: 'actual', label: 'Actual lineups' }, { value: 'matched', label: 'Returning players' }]} /></div>
      <Trend go={go} mode={mode} />
    </section>
    <section className="tr-sec"><div className="tr-sec__h"><h2>Every event</h2><span>Graduated players stay with the events they played</span></div><Ledger go={go} /></section>
  </>);
}

// ── event desk ──
function Contribution({ eid, openEvidence }) {
  const r = T.eventRows(eid), e = r.e, nr = e.rounds.length;
  const team = r.rows.filter((x) => !x.ind), ind = r.rows.filter((x) => x.ind);
  const Row = ({ x }) => (
    <div className={'tr-ct__row' + (x.ind ? ' tr-ct__ind' : '')} role="row">
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><Avatar name={x.p.name} size={30} /><span><span className="tr-t1" style={{ display: 'block' }}>{x.p.name}</span><span className="tr-t2" style={{ display: 'block' }}>{x.ind ? 'Individual entry · not in team score' : x.p.year}</span></span></span>
      {x.rounds.map((rd) => <button key={rd.id} type="button" className={'tr-sc tr-num' + (rd.nc ? ' is-nc' : '') + (rd.boundaryTie ? ' is-tie' : '') + (rd.shot ? '' : ' no-shot')} onClick={() => openEvidence({ side: 'a', scope: { subject: x.id, ctx: 'tournament', sample: 'event', event: eid }, rounds: x.rounds, round: rd })} aria-label={`${x.p.name} round ${rd.rnd}: ${rd.score}${rd.nc ? ', not counted' : x.ind ? '' : ', counted'}`}><i className="tr-dot"></i>{rd.score}{rd.nc && <em>NC</em>}</button>)}
      <span className="tr-r tr-num tr-fin">{x.total}</span>
      <span className="tr-r tr-t2" style={{ marginTop: 0 }}>{x.ind ? '—' : `${x.counted}/${nr}`}</span>
    </div>
  );
  return (
    <div className="tr-sheet tr-ct" role="table" aria-label="Team contribution" style={{ '--nr': nr }}>
      <div className="tr-ct__row tr-ct__h" role="row"><span>Player</span>{e.rounds.map((_, i) => <span key={i} className="tr-r">R{i + 1}</span>)}<span className="tr-r">Total</span><span className="tr-r">Rounds counted</span></div>
      {team.map((x) => <Row key={x.id} x={x} />)}
      <div className="tr-ct__row tr-ct__team" role="row"><span className="tr-t1">Team · lowest {e.count[1]} each round</span>{r.team.map((v, i) => <span key={i} className="tr-r tr-num tr-fin" style={{ paddingRight: 10 }}>{v}</span>)}<span className="tr-r tr-num tr-fin">{r.total} <em className={r.total - r.par < 0 ? 'tr-under' : ''}>{T.toPar(r.total - r.par)}</em></span><span className="tr-r tr-t2" style={{ marginTop: 0 }}>Par {r.par}</span></div>
      {ind.map((x) => <Row key={x.id} x={x} />)}
      <div className="tr-key"><span><span className="tr-sc is-nc" style={{ minWidth: 0, height: 22, padding: '0 6px', fontSize: 12 }}>74 <em>NC</em></span>Not counted that round</span><span><i className="tr-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green-600)' }}></i>Shot data</span><span><i style={{ width: 6, height: 6, borderRadius: '50%', boxShadow: 'inset 0 0 0 1px #A8A294' }}></i>Scorecard only</span><span>Team totals use whole-round scores, never best holes</span></div>
    </div>
  );
}

function Holes({ eid, openEvidence }) {
  const e = EV(eid), [rd, setRd] = React.useState(1), [view, setView] = React.useState('score');
  const rows = T.eventRows(eid).rows.map((x) => ({ ...x, r: x.rounds.find((q) => q.rnd === rd) })).filter((x) => x.r);
  const grid = rows.map((x) => ({ ...x, hs: T.holeScores(x.r) }));
  const team = grid.filter((x) => !x.ind);
  const avg = T.PARS.map((p, i) => team.reduce((s, x) => s + (x.hs[i].score - p), 0) / team.length);
  const worst = [...avg].map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
  const Part = (hs, a, b) => hs.slice(a, b).reduce((s, h) => s + h.score, 0);
  return (
    <section className="tr-sec">
      <div className="tr-sec__h"><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Segmented size="sm" label="Round" value={'r' + rd} onChange={(v) => { hap('selection'); setRd(+v.slice(1)); }} options={e.rounds.map((_, i) => ({ value: 'r' + (i + 1), label: `Round ${i + 1}` }))} /><Segmented size="sm" label="View" value={view} onChange={setView} options={[{ value: 'score', label: 'Scores' }, { value: 'par', label: 'To par' }]} /></div><span>{T.COURSES[e.course][0]} · {T.COURSES[e.course][1]} · tap a hole for the scorecard</span></div>
      <div className="tr-sheet tr-hg">
        <div className="tr-hg__row tr-hg__h"><span>Hole</span>{T.PARS.slice(0, 9).map((_, i) => <span key={i}>{i + 1}</span>)}<span>Out</span>{T.PARS.slice(9).map((_, i) => <span key={i}>{i + 10}</span>)}<span>In</span><span>Tot</span></div>
        <div className="tr-hg__row tr-hg__par"><span>Par</span>{T.PARS.slice(0, 9).map((p, i) => <span key={i}>{p}</span>)}<span>36</span>{T.PARS.slice(9).map((p, i) => <span key={i}>{p}</span>)}<span>36</span><span>72</span></div>
        {grid.map((x) => (
          <div key={x.id} className="tr-hg__row" style={x.ind ? { opacity: .82 } : null}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}><Avatar name={x.p.name} size={22} /><span className="tr-t1" style={{ fontSize: 13.5 }}>{x.p.name.split(' ')[0]}{x.r.nc ? ' · NC' : x.ind ? ' · Ind.' : ''}</span></span>
            {x.hs.map((h, i) => <React.Fragment key={i}><span><button type="button" className="tr-hg__cell" onClick={() => openEvidence({ side: 'a', scope: { subject: x.id, ctx: 'tournament', sample: 'event', event: eid, rounds: [rd] }, rounds: [x.r], round: x.r })} aria-label={`${x.p.name} hole ${h.n}: ${h.score}`}>{view === 'score' ? <ScoreMark score={h.score} par={h.par} size="sm" /> : <span className="tr-num" style={{ font: '500 13px/1 var(--font-sans)', color: h.score < h.par ? 'var(--score-under,#B3261E)' : h.score > h.par ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{h.score === h.par ? 'E' : T.toPar(h.score - h.par)}</span>}</button></span>{i === 8 && <span className="tr-hg__tot">{Part(x.hs, 0, 9)}</span>}</React.Fragment>)}
            <span className="tr-hg__tot">{Part(x.hs, 9, 18)}</span><span className="tr-hg__tot">{x.r.score}</span>
          </div>
        ))}
        <div className="tr-hg__row tr-hg__cost" style={{ marginTop: 4, boxShadow: 'inset 0 1px 0 var(--border-hairline)', paddingTop: 8 }}><span className="tr-t2" style={{ marginTop: 0 }}>Team vs par</span>{avg.map((v, i) => <React.Fragment key={i}><span><i className={'tr-heat' + (worst.includes(i) ? ' is-worst' : v > .5 ? ' is-bad' : v < -.1 ? ' is-good' : '')}>{v === 0 ? 'E' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1)}</i></span>{i === 8 && <span></span>}</React.Fragment>)}<span></span><span></span></div>
      </div>
      <p className="tr-t2" style={{ margin: 0 }}>Highlighted: the three holes that cost the team most in round {rd}, averaged over the {team.length} team players. Starting holes differed, so read these as holes, not as opening or closing stretches.</p>
    </section>
  );
}

function Review({ eid, toast }) {
  const r = T.eventRows(eid);
  const pen = r.rs.filter((x) => !x.ind).reduce((s, x) => s + x.pen, 0);
  const jp = r.rs.filter((x) => x.player === 'jonah').sort((a, b) => a.rnd - b.rnd).map((x) => x.pen);
  const layers = [
    { t: 'Jonah’s 69 in the final round was the team’s best score of the event and counted, after two rounds that did not.', ev: 'R1 75 and R2 76, both dropped · R3 69 counted · 2 of 3 rounds with shot data', hyp: `Penalty strokes went ${jp.join(' → ')} across the three rounds. Worth asking what changed in his strategy before assuming it will repeat.` },
    { t: `The team took ${pen} penalty strokes across ${r.rs.filter((x) => !x.ind).length} team rounds, recorded hole by hole.`, ev: 'All 15 team scorecards · penalties recorded per hole', hyp: 'All three holes have water short of the green. A club-down rule on those approaches is one option to discuss.' },
    { t: 'Sofia’s R3 74 was her highest round and didn’t count. The data can’t say why.', ev: 'R3 scorecard only · no shot data for that round', hyp: 'Unknown. Ask Sofia for her reflection before drawing a conclusion.' },
  ];
  return (
    <section className="tr-rev">
      <div className="tr-sec">
        <div className="tr-sec__h"><h2>What the rounds show</h2><span>Observation, evidence, then a possible explanation</span></div>
        {layers.map((l, i) => <div key={i} className="tr-sheet">
          <div className="tr-layer"><span>Observation</span><p>{l.t}</p></div>
          <div className="tr-layer"><span>Evidence</span><p className="tr-t2" style={{ margin: 0, fontSize: 13.5 }}>{l.ev}</p></div>
          <div className="tr-layer is-hyp"><span>Possible reason</span><p>{l.hyp}</p></div>
          <div className="tr-layer" style={{ gridTemplateColumns: '1fr', paddingTop: 10, paddingBottom: 12, background: '#F4F2EA', borderRadius: '0 0 16px 16px' }}><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Button size="sm" leftIcon="clipboard-check" onClick={() => { hap('success'); toast && toast('Practice assignment drafted. Nothing sent yet.', 'clipboard-check'); }}>Draft practice assignment</Button><Button size="sm" variant="ghost" leftIcon="message-square" onClick={() => toast && toast('Added to your 1:1 notes', 'message-square')}>Discuss in 1:1</Button></div></div>
        </div>)}
      </div>
      <div className="tr-sec">
        <div className="tr-sec__h"><h2>Notes and reflections</h2><span>Private to coaches until you share</span></div>
        <div className="tr-sheet">
          {[['Maya Reyes', 'Coach note', 'Course played firm. We under-clubbed into 13 all week.'], ['Jonah Okafor', 'Player reflection', 'Stopped aiming at flags on the par 3s on day two. Felt calmer.'], ['Theo Marchetti', 'Player reflection', 'Putter felt good. Left a few short on fast greens in R2.']].map(([n, k, t]) => <div key={n} className="tr-note"><div className="tr-note__w"><Avatar name={n} size={28} /><div><div className="tr-t1">{n}</div><div className="tr-t2">{k}</div></div></div><p>{t}</p></div>)}
          <div className="tr-note" style={{ background: '#F4F2EA', borderRadius: '0 0 16px 16px' }}><span className="tr-t2" style={{ marginTop: 0 }}>Sofia and Eli haven’t added reflections.</span> <button type="button" className="tr-link" onClick={() => toast && toast('Reminder drafted for Sofia and Eli', 'bell')}>Remind them</button></div>
        </div>
      </div>
    </section>
  );
}

function EventDesk({ eid, go, openEvidence, toast, scenario }) {
  const e = EV(eid), r = T.eventRows(eid), [s, n] = covOf(e);
  const [tab, setTab] = React.useState('overview');
  const d = r.total - r.par;
  return (<>
    <button type="button" className="tr-crumb" onClick={() => go('home')}><Icon name="chevron-left" size={15} />Tournaments</button>
    <div className="tr-head" style={{ marginTop: -14 }}>
      <div>
        <span className="tr-head__k">{dates(e)}, {e.dates[0].slice(0, 4)} · {T.COURSES[e.course][0]} · {T.COURSES[e.course][1]}</span>
        <h1>{e.name}</h1>
        <div className="tr-meta"><span className="tr-chip">{e.rounds.length * 18} holes · stroke play</span><span className="tr-chip">{e.count[0]} count {e.count[1]} each round</span><span className="tr-chip is-ok"><i></i>Completed</span><span className={'tr-chip ' + (scenario === 'provisional' ? 'is-warn' : 'is-ok')}><i></i>{scenario === 'provisional' ? 'Results provisional' : 'Results confirmed'}</span><span className={'tr-chip' + (s < n ? ' is-warn' : '')}>{n} scorecards · {s} with shot data</span></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, marginLeft: 'auto' }}>
        <div className="tr-res"><b className="tr-num">{r.total}</b><span className={d < 0 ? 'tr-under' : ''}>{T.toPar(d)}</span><em>{e.finish[0]} of {e.finish[1]} teams</em></div>
        <div className="tr-head__a"><Button leftIcon="external-link">Official results</Button><Button leftIcon="users" onClick={() => toast && toast('Lineup is locked for a completed event', 'lock')}>Manage lineup</Button><Button variant="primary" leftIcon="git-compare" onClick={() => setTab('compare')}>Compare</Button></div>
      </div>
    </div>
    {scenario === 'provisional' && <InlineNotice tone="warning" title="Results are provisional">The imported leaderboard has Sofia at 73 in round 3. Her scorecard says 74. Team totals use the scorecard until you confirm which is right.</InlineNotice>}
    <Tabs value={tab} onChange={(v) => { hap('selection'); setTab(v); }} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'compare', label: 'Compare players' }, { value: 'holes', label: 'Hole analysis' }, { value: 'review', label: 'Review', count: 3 }]} />
    {tab === 'overview' && <>
      <section className="tr-sec"><div className="tr-sec__h"><h2>Who counted</h2><span>Lowest {e.count[1]} whole-round scores each round make the team total</span></div><Contribution eid={eid} openEvidence={openEvidence} /></section>
      <section className="tr-sec"><div className="tr-sec__h"><h2>Where the event turned</h2><span>Each finding opens its rounds</span></div>
        <div className="tr-find">
          <div className="tr-sheet tr-find__c"><span className="tr-chip" style={{ alignSelf: 'flex-start' }}>Round 3 · 285</span><b>Jonah had the highest total but the team’s best final round.</b><p>His 69 counted after two dropped rounds. Without it Sofia’s 74 counts and the team finishes 5 strokes worse.</p><button type="button" className="tr-link" onClick={() => setTab('holes')}>See round 3 holes<Icon name="arrow-right" size={14} /></button></div>
          <div className="tr-sheet tr-find__c"><span className="tr-chip">Penalties</span><b>Penalty strokes are the clearest cost to review.</b><p>All 15 team scorecards recorded penalties by hole, so this holds even where shot data is missing.</p><button type="button" className="tr-link" onClick={() => setTab('review')}>Open the review<Icon name="arrow-right" size={14} /></button></div>
          <div className="tr-sheet tr-find__c"><span className="tr-chip is-warn">4 rounds without shot data</span><b>Strokes gained covers 11 of 15 team rounds.</b><p>Official scores are complete. SG figures on this event use the 11 rounds with shot data only.</p><button type="button" className="tr-link" onClick={() => setTab('compare')}>Compare with coverage shown<Icon name="arrow-right" size={14} /></button></div>
        </div>
      </section>
    </>}
    {tab === 'compare' && <CompareDesk initial={eid === 'e33' ? 'rr' : 'ee'} openEvidence={openEvidence} scenario={scenario} />}
    {tab === 'holes' && <Holes eid={eid} openEvidence={openEvidence} />}
    {tab === 'review' && <Review eid={eid} toast={toast} />}
  </>);
}

function TournamentsPage({ toast }) {
  const q = new URLSearchParams(location.search);
  const [view, setView] = React.useState(() => ({ v: q.get('view') || 'home', eid: q.get('event') || 'e33', preset: q.get('preset') || 'tq' }));
  const [scenario, setScenario] = React.useState(q.get('scenario') || 'ok');
  const [ev, setEv] = React.useState(null);
  const go = (v, o = {}) => { hap('selection'); setView((s) => ({ ...s, v, ...o })); const c = document.querySelector('.h2-canvas'); if (c) c.scrollTop = 0; };
  const open = (x) => { hap('light'); setEv(x); };
  const top = view.v === 'event' ? null : (
    <div className="tr-head">
      <div><span className="tr-head__k">Varsity · Fall 2026</span><h1>Tournaments</h1><p>What happened at each event, who counted, and how it compares with qualifying, practice and last season.</p></div>
      <div className="tr-head__a" style={{ alignItems: 'center' }}><Segmented label="View" value={view.v} onChange={(v) => go(v)} options={[{ value: 'home', label: 'Events' }, { value: 'compare', label: 'Compare' }, { value: 'history', label: 'History' }]} /><Button variant="primary" leftIcon="plus" onClick={() => toast && toast('Add event opens the calendar editor', 'calendar-plus')}>Add event</Button></div>
    </div>
  );
  return (
    <div className="tr">
      {top}
      {view.v === 'home' && <Home go={go} />}
      {view.v === 'history' && <History go={go} />}
      {view.v === 'compare' && <CompareDesk key={view.preset} initial={view.preset} openEvidence={open} scenario={scenario} />}
      {view.v === 'event' && <EventDesk key={view.eid} eid={view.eid} go={go} openEvidence={open} toast={toast} scenario={scenario} />}
      <Evidence ev={ev} onClose={() => setEv(null)} />
      <div className="tr-scn" data-gh-nopress="" data-haptic="none"><span>Data scenario</span><select value={scenario} onChange={(e) => setScenario(e.target.value)} aria-label="Data scenario">
        {[['ok', 'Complete'], ['slow', 'Slow network (stale labels)'], ['bfail', 'B fails to load'], ['thin', 'B insufficient sample'], ['none', 'B has no rounds'], ['provisional', 'Results provisional']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></div>
    </div>
  );
}
Object.assign(window, { TournamentsPage });
})();
