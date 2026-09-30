(() => {
const { Icon, Button, IconButton, Avatar, Badge, Segmented, Tabs, ScoreTrend, StrokesGainedRoute, PuttingGreen, FieldTable, DriveDispersion, StatPlate, PredictionCard } = window.FairwayClubhouseEdition_9c4f4d;
const R = window.ROSTER;
const sgnInt = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v));
const sgn = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
const hcp = (v) => (v < 0 ? '+' + Math.abs(v).toFixed(1) : v.toFixed(1));
const toPar = (v) => (v === 0 ? 'E' : (v > 0 ? '+' : '−') + Math.abs(v));
const act = R.players.filter((p) => p.status === 'active');
const labels = ['Aug 30', 'Sep 6', 'Sep 9', 'Sep 13', 'Sep 20', 'Sep 23', 'Sep 27', 'Oct 4', 'Oct 8', 'Oct 12'];

// deterministic per-player detail
const seed = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296); };
function detail(p) {
  const r = seed(p.id);
  const base = p.avg;
  const rounds = labels.map((l, i) => ({ label: l, score: Math.round(base + (p.trend[Math.min(i, p.trend.length - 1)] - base) * 0.6 + (r() - 0.5) * 2.4) }));
  const sg = p.sg ?? 0;
  const legs = [{ label: 'Off the tee', value: +(sg * 0.3 + (r() - 0.5) * 0.6).toFixed(1) }, { label: 'Approach', value: +(sg * 0.35 + (r() - 0.6) * 0.8).toFixed(1) }, { label: 'Around green', value: +(sg * 0.15 + (r() - 0.5) * 0.4).toFixed(1) }, { label: 'Putting', value: +(sg * 0.2 + (r() - 0.5) * 0.6).toFixed(1) }];
  if (p.id === 'jonah') { legs[0].value = 0.3; legs[1].value = -1.2; legs[2].value = -0.1; legs[3].value = 0.2; }
  const drives = Array.from({ length: 22 }, () => ({ x: Math.round((r() - 0.5) * 44 + (p.id === 'sofia' ? -4 : 3)), y: Math.round(250 + (r() - 0.5) * 50 + (p.hcp < 2 ? 18 : 0)) }));
  const make = (b, a, bm) => ({ band: b, attempts: a, made: Math.round(a * Math.min(0.99, bm + (r() - 0.55) * 0.18)), benchmark: bm });
  const putts = [make('0–3 ft', 64, 0.96), make('3–6 ft', 48, 0.72), make('6–10 ft', 36, 0.44), make('10–20 ft', 42, 0.2), make('20+ ft', 30, 0.07)];
  if (p.id === 'jonah') { putts[1].made = 31; }
  const field = [
    { label: 'Scoring avg', you: p.avg, team: 72.8, tour: 70.9, better: 'down' },
    { label: 'Fairways hit', you: Math.round(58 + r() * 16), team: 62, tour: 64, unit: '%' },
    { label: 'Greens in reg.', you: Math.round(52 + r() * 18 + (p.hcp < 2 ? 6 : 0)), team: 61, tour: 67, unit: '%' },
    { label: 'Putts / round', you: +(29 + r() * 3).toFixed(1), team: 30.4, tour: 29.1, better: 'down' },
    { label: 'Scrambling', you: Math.round(44 + r() * 20), team: 52, tour: 58, unit: '%' },
  ];
  return { rounds, legs, drives, putts, field };
}

function Head({ title, sub, right, back }) {
  return (
    <header className="st-head">
      {back}
      <div className="st-head__row"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{right}</div>
    </header>
  );
}

function Scope({ value, onChange }) {
  return <Segmented size="sm" label="Window" value={value} onChange={onChange} options={[{ value: '10', label: 'Last 10' }, { value: 'season', label: 'Season' }, { value: 'q', label: 'Qualifiers' }]} />;
}

function Team({ openPlayer }) {
  const [scope, setScope] = React.useState('10');
  const [sort, setSort] = React.useState('avg');
  const avg = (act.reduce((a, p) => a + p.avg, 0) / act.length);
  const board = [...act].sort((a, b) => sort === 'sg' ? (b.sg ?? -9) - (a.sg ?? -9) : a.avg - b.avg);
  const teamRounds = [74.8, 74.6, 74.2, 74.4, 73.9, 73.8, 73.1, 73.5, 73.6, 73.4].map((s, i) => ({ label: labels[i], score: s }));
  return (
    <div className="st">
      <Head title="Team stats" sub={'Varsity · ' + act.length + ' active players · countable rounds only'} right={<div className="st-head__act"><Scope value={scope} onChange={setScope} /><Button variant="ghost" leftIcon="download">Export</Button></div>} />
      <StatFigures items={[['Scoring average', avg.toFixed(1), '', '−0.9', 'down', true, 'vs. previous 10'], ['Greens in regulation', '61', '%', '+3', 'up', true, 'D1 averages 67%'], ['Putts per round', '30.4', '', '+0.3', 'up', false, 'D1 averages 29.1'], ['Scrambling', '52', '%', '+4', 'up', true, 'D1 averages 58%'], ['Birdies per round', '2.6', '', '+0.2', 'up', true, 'D1 averages 3.1']]} />
      <SgFocus openPlayer={openPlayer} />

      <div className="st-grid2">
        <PuttingGreen title="Team putting" meta="Make rate by distance · 220 putts" rows={[{ band: '0–3 ft', made: 118, attempts: 122, benchmark: 0.96 }, { band: '3–6 ft', made: 64, attempts: 92, benchmark: 0.72 }, { band: '6–10 ft', made: 30, attempts: 71, benchmark: 0.44 }, { band: '10–20 ft', made: 14, attempts: 80, benchmark: 0.2 }, { band: '20+ ft', made: 4, attempts: 58, benchmark: 0.07 }]} note="Three to six feet is the only band below the D1 benchmark." />
        <section className="st-card st-best">
          <div className="st-card__head"><div><h2>Season bests</h2><span>Countable rounds</span></div></div>
          {[['Low round', 'Theo Marchetti', '69 (−3)', 'Pine Needles · Oct 11'], ['Most birdies', 'Sofia Alvarez', '6', 'Finley GC · Sep 27'], ['Best SG round', 'Theo Marchetti', '+4.1', 'Oakmont · Oct 12'], ['Longest putt made', 'Ava Lindqvist', '42 ft', 'Finley GC · Oct 8'], ['Most improved', 'Priya Natarajan', '−4.0', 'Scoring avg since Aug']].map(([k, n, v, m]) => (
            <div key={k} className="st-best__r"><span className="st-best__k">{k}</span><span className="st-who"><Avatar name={n} size={26} /><span><b>{n}</b><span className="st-who__m">{m}</span></span></span><span className={'fw-num st-best__v' + (v.includes('−3') ? ' is-under' : '')}>{v}</span></div>
          ))}
        </section>
      </div>
    </div>
  );
}

function Player({ id, back, openPlayer }) {
  const p = R.players.find((x) => x.id === id);
  const d = detail(p);
  const [tab, setTab] = React.useState('overview');
  const [scope, setScope] = React.useState('10');
  const idx = act.findIndex((x) => x.id === id);
  const early = p.rounds < 3;
  return (
    <div className="st">
      <div className="st-back"><Button size="sm" variant="ghost" leftIcon="chevron-left" onClick={back}>Team stats</Button>
        <div className="st-back__nav"><IconButton icon="chevron-left" label="Previous player" size="sm" onClick={() => openPlayer(act[(idx - 1 + act.length) % act.length].id)} /><span className="fw-num">{idx + 1} of {act.length}</span><IconButton icon="chevron-right" label="Next player" size="sm" onClick={() => openPlayer(act[(idx + 1) % act.length].id)} /></div>
      </div>
      <section className="pf-hero">
        <span className="pf-hero__av"><Avatar name={p.name} size={112} /></span>
        <div className="pf-hero__id">
          <div className="pf-hero__tags">{p.role && <span className="rs-cap" style={{ marginLeft: 0 }}>{p.role}</span>}<span className={'rs-status is-' + p.status} style={{ cursor: 'default' }}><i></i>{p.status === 'active' ? 'Active' : 'Inactive'}</span><span className="pf-hero__course"><Icon name="flag" size={11} />{p.course}</span></div>
          <h1>{p.name}</h1>
          <p>{p.year} · Class of {p.cls} · {p.major} · {p.home}</p>
          <p className="pf-hero__about">{p.about}</p>
          <div className="pf-hero__act"><Button leftIcon="message-square" onClick={() => (location.href = 'Coach - Messages.html')}>Message</Button><Button leftIcon="calendar-plus">Schedule 1:1</Button><Button variant="primary" leftIcon="target">Add focus area</Button></div>
        </div>
        <dl className="pf-hero__figs">
          {[['Scoring avg', p.avg.toFixed(1), 'Team 72.8'], ['Handicap', hcp(p.hcp), 'Index'], ['SG / round', early ? '—' : sgn(p.sg), 'vs. D1'], ['Rounds', p.rounds, 'This season']].map(([l, v, s]) => <div key={l}><dt>{l}</dt><dd className={'fw-num' + (l === 'SG / round' && p.sg != null ? (p.sg >= 0 ? ' is-gain' : ' is-loss') : '')}>{v}</dd><span>{s}</span></div>)}
        </dl>
      </section>
      <div className="pf-tabs"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'game', label: 'Game detail' }, { value: 'rounds', label: 'Rounds', count: p.rounds }, { value: 'dev', label: 'Development' }]} /><Scope value={scope} onChange={setScope} /></div>
      {early && <div className="pf-early"><Icon name="info" size={15} />Early read. {p.name.split(' ')[0]} has {p.rounds} countable rounds, so averages and trends will move a lot. Strokes gained shows once there are three.</div>}
      {tab === 'overview' && <>
        <StatFigures items={[
          ['Fairways hit', d.field[1].you, '%', sgnInt(d.field[1].you - d.field[1].team), d.field[1].you >= d.field[1].team ? 'up' : 'down', d.field[1].you >= d.field[1].team, 'vs. team ' + d.field[1].team + '%'],
          ['Greens in regulation', d.field[2].you, '%', sgnInt(d.field[2].you - d.field[2].team), d.field[2].you >= d.field[2].team ? 'up' : 'down', d.field[2].you >= d.field[2].team, 'vs. team ' + d.field[2].team + '%'],
          ['Putts per round', d.field[3].you, '', sgn(+(d.field[3].you - d.field[3].team).toFixed(1)), d.field[3].you >= d.field[3].team ? 'up' : 'down', d.field[3].you <= d.field[3].team, 'vs. team ' + d.field[3].team],
          ['Scrambling', d.field[4].you, '%', sgnInt(d.field[4].you - d.field[4].team), d.field[4].you >= d.field[4].team ? 'up' : 'down', d.field[4].you >= d.field[4].team, 'vs. team ' + d.field[4].team + '%'],
          ['Best round', Math.min(...d.rounds.map((r) => r.score)), '', null, null, null, 'Last 10 rounds']]} />
        <div className="st-grid2">
          <ScoreTrend title="Scoring" meta={'Par 72 · last ' + d.rounds.length + ' rounds'} rounds={d.rounds} par={72} board events={p.id === 'theo' ? [{ index: 8, text: 'Season best' }] : []} note={p.note + '.'} />
          <StrokesGainedRoute title="Strokes gained by leg" meta="Per round vs. D1" rows={d.legs} max={1.4} note={p.id === 'jonah' ? 'Approach is the only leg losing strokes, about 1.2 a round, mostly from 125–150 yards.' : 'Strongest leg is ' + [...d.legs].sort((a, b) => b.value - a.value)[0].label.toLowerCase() + '.'} />
        </div>
        <div className="st-grid2">
          <FieldTable title={p.name.split(' ')[0] + ' vs. team vs. tour'} meta="Last 10 rounds" rows={d.field} />
          <PredictionCard title="Thursday at Pinehurst" meta="Par 72 · 7,588 yds" score={Math.round(p.avg + 0.8)} low={Math.round(p.avg - 1.5)} high={Math.round(p.avg + 3.5)} confidence={p.rounds > 15 ? 68 : 40} average={p.avg} reasons={[{ text: 'Course length favours long hitters', value: p.hcp < 2 ? 0.4 : -0.3 }, { text: 'Fast greens', value: d.legs[3].value > 0 ? 0.3 : -0.4 }]} note="A range, not a promise. Built from the last 10 rounds." />
        </div>
      </>}
      {tab === 'game' && <GameDetail p={p} drives={d.drives} />}
      {tab === 'rounds' && <section className="st-card">
        <div className="st-card__head"><div><h2>Rounds</h2><span>Countable rounds · newest first</span></div></div>
        <div className="st-tbl">
          <div className="st-tr st-tr--h pf-tr"><span>Course</span><span>Date</span><span className="r">Score</span><span className="r">To par</span><span className="r">GIR</span><span className="r">Putts</span><span className="r">SG</span></div>
          {[...d.rounds].reverse().map((r, i) => { const tp = r.score - 72; const s = +((72 - r.score) * 0.45 + 0.4).toFixed(1); return (
            <div key={i} className="st-tr pf-tr"><span><b className="st-course">{['Oakmont CC', 'Pine Needles', 'Finley GC', 'Finley GC', 'Lonnie Poole GC', 'Finley GC', 'Finley GC', 'Pinehurst No. 8', 'Finley GC', 'Finley GC'][i]}</b></span><span className="st-n2">{r.label}</span><span className="r fw-num st-n">{r.score}</span><span className={'r fw-num rs-topar' + (tp < 0 ? ' is-under' : '')}>{toPar(tp)}</span><span className="r fw-num st-n2">{10 + ((i * 7) % 6)}/18</span><span className="r fw-num st-n2">{28 + ((i * 3) % 5)}</span><span className={'r fw-num st-sg ' + (s >= 0 ? 'is-gain' : 'is-loss')}>{sgn(s)}</span></div>); })}
        </div>
      </section>}
      {tab === 'dev' && <div className="st-grid2">
        <section className="st-card">
          <div className="st-card__head"><div><h2>Focus areas</h2><span>{p.focus} active</span></div><Button size="sm" leftIcon="plus">Add</Button></div>
          {(p.focus ? [['Approach 125–150 yds', 'Proximity 31 ft → target 24 ft', 45], ['Short putts', '3–6 ft make rate 65% → 75%', 30]].slice(0, p.focus) : []).map(([t, m, pct]) => <div key={t} className="pf-focus"><div><b>{t}</b><span>{m}</span></div><div className="pf-bar"><span style={{ width: pct + '%' }}></span></div><span className="fw-num st-n2">{pct}%</span></div>)}
          {!p.focus && <p className="pf-empty">No focus areas yet. Add one from a weak leg above.</p>}
        </section>
        <section className="st-card">
          <div className="st-card__head"><div><h2>Goals</h2><span>{p.goals} this season</span></div></div>
          {[['Break 70 in competition', 'Low so far 69', true], ['Scoring avg under 71', 'Now ' + p.avg.toFixed(1), p.avg < 71], ['Qualify for all fall events', '3 of 4', false]].slice(0, Math.max(1, p.goals)).map(([g, m, done]) => <div key={g} className="pf-goal"><span className={'pf-goal__c' + (done ? ' is-done' : '')}>{done && <Icon name="check" size={12} />}</span><div><b>{g}</b><span>{m}</span></div></div>)}
        </section>
      </div>}
    </div>
  );
}

window.StatsTeam = Team; window.StatsPlayer = Player;
})();
