(() => {
const { Icon, Button, Avatar, Badge, Input, TextArea, FormField, Checkbox, EmptyState, ScoreMark } = window.FairwayClubhouseEdition_9c4f4d;
const Q = window.QUAL, tp = window.qualTp, SP = window.QualStatusPill, TP = window.QualTP, board = window.qualBoard, SB = window.QualStateBadge, cta = window.qualCta;
const isActive = (q) => q.status !== 'completed';

function Nine({ holes, start, label }) {
  const sum = (k) => holes.reduce((s, h) => s + h[k], 0);
  return (
    <div className="qm-nine">
      <div className="qm-nine__row qm-nine__row--h"><span>{label}</span>{holes.map((h, i) => <span key={i}>{start + i}</span>)}<span>Tot</span></div>
      <div className="qm-nine__row qm-nine__row--p"><span>Par</span>{holes.map((h, i) => <span key={i}>{h.par}</span>)}<span>{sum('par')}</span></div>
      <div className="qm-nine__row"><span>Score</span>{holes.map((h, i) => <span key={i}><ScoreMark score={h.score} par={h.par} size="sm" /></span>)}<b>{sum('score')}</b></div>
    </div>
  );
}
function Sheet({ title, sub, onClose, children, foot }) {
  return (
    <div className="qm-sheetwrap" onClick={onClose}>
      <div className="qm-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <span className="qm-grab"></span>
        <div className="qm-sheet__h"><div><b>{title}</b><span>{sub}</span></div><button className="qm-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
        <div className="qm-sheet__b">{children}</div>
        {foot && <div className="qm-sheet__f">{foot}</div>}
      </div>
    </div>
  );
}
function PlayerSheet({ q, r, onClose }) {
  const [ri, setRi] = React.useState(r.played.length ? r.played[r.played.length - 1].i : 0);
  const rd = r.rounds[ri];
  return (
    <Sheet title={r.name} sub={r.pos + ' · ' + tp(r.toPar) + ' · ' + r.played.length + ' of ' + q.numRounds + ' rounds'} onClose={onClose}
      foot={<><Button fullWidth leftIcon="message-square">Message</Button><Button fullWidth leftIcon="chart-column">Stats</Button></>}>
      <div className="qm-seg dp-well dp-chips">{q.roundCourses.map((c, i) => <button key={i} className="dp-chip" aria-pressed={ri === i} disabled={!r.rounds[i]} onClick={() => setRi(i)}>R{i + 1}{r.rounds[i] ? ' · ' + tp(r.rounds[i].toPar) : ''}</button>)}</div>
      {rd ? <>
        <div className="qm-rdh"><span>{q.roundCourses[ri][0]} · {q.roundCourses[ri][1]}</span><b>{q.par + rd.toPar}</b></div>
        <Nine holes={rd.holes.slice(0, 9)} start={1} label="Out" /><Nine holes={rd.holes.slice(9)} start={10} label="In" />
      </> : <p className="qm-empty">Round {ri + 1} not submitted yet.</p>}
    </Sheet>
  );
}

function Top({ title, back, onBack, right }) {
  return (
    <header className="qm-top">
      {back ? <button className="qm-back" onClick={onBack}><Icon name="chevron-left" size={20} />{back}</button> : <b className="qm-top__t">{title}</b>}
      {back && <b className="qm-top__c">{title}</b>}
      <span className="qm-top__r">{right || <button className="qm-ib" aria-label="Notifications"><Icon name="bell" size={20} /><i className="qm-dotn">5</i></button>}</span>
    </header>
  );
}

function MList({ go, list }) {
  const [f, setF] = React.useState('all');
  const act = list.filter(isActive), con = list.filter((q) => !isActive(q));
  const A = f !== 'concluded' ? act : [], C = f !== 'active' ? con : [];
  const hero = A.find((q) => q.status === 'in_progress') || A[A.length - 1];
  const rest = A.filter((q) => q !== hero);
  return (
    <div className="qm-page">
      <div className="qm-head"><span>{act.length} active · {con.length} concluded</span><h1>Lineup decisions</h1><p>Run head-to-head qualifiers to decide who plays this week.</p></div>
      <Button variant="primary" size="lg" fullWidth leftIcon="plus" onClick={() => go('new')}>Create qualifier</Button>
      <div className="qf-pills qm-pills">{[['all', 'All', list.length], ['active', 'Active', act.length], ['concluded', 'Concluded', con.length]].map(([k, l, n]) => <button key={k} className="qf-pill" aria-pressed={f === k} onClick={() => setF(k)}>{l}<span>{n}</span></button>)}</div>
      <Input leftIcon="search" placeholder="Search qualifiers" aria-label="Search qualifiers" />
      {hero && (() => { const b = board(hero); return (
        <button className="qm-hero" onClick={() => go('detail', hero.id)}>
          <SP status={hero.status} /><h2>{hero.name}</h2>
          <div className="qm-meta"><span><Icon name="calendar" size={14} />{hero.start} – {hero.end}</span><span><Icon name="map-pin" size={14} />{hero.course} · {hero.spots} spots</span></div>
          {hero.status === 'in_progress' && <div className="qm-lead dp-well-soft">{b.rows.slice(0, 3).map((r) => <div key={r.id}><span className="qf-pos">{r.pos}</span><span>{r.name}</span><TP v={r.toPar} /></div>)}<em>{b.submitted} of {b.entrants * hero.numRounds} rounds in</em></div>}
          <span className="qf-cta">{cta(hero.status)}<Icon name="arrow-right" size={15} /></span>
        </button>); })()}
      {rest.length > 0 && <><h3 className="qm-sec">Active</h3>{rest.map((q) => <MCard key={q.id} q={q} go={go} />)}</>}
      {C.length > 0 && <><h3 className="qm-sec">Concluded</h3>{C.map((q) => <MCard key={q.id} q={q} go={go} />)}</>}
    </div>
  );
}
function MCard({ q, go }) {
  return (
    <button className="qm-card2" onClick={() => go('detail', q.id)}>
      <div className="qm-card2__h"><b>{q.name}</b><SP status={q.status} /></div>
      <div className="qm-meta"><span><Icon name="calendar" size={14} />{q.start}{q.end !== q.start ? ' – ' + q.end : ''}</span><span><Icon name="flag" size={14} />{q.spots} spots</span></div>
      <span className="qf-cta is-quiet">{cta(q.status)}<Icon name="arrow-right" size={14} /></span>
    </button>
  );
}

function MDetail({ q, peek, setPeek }) {
  const b = board(q);
  const pr = peek && b.rows.find((r) => r.id === peek);
  return (
    <div className="qm-page">
      <div className="qm-head"><span className="qm-head__k"><SP status={q.status} />{q.start} – {q.end}</span><h1 className="is-sm">{q.name}</h1><p>{b.entrants} entrants · {q.course}</p></div>
      <div className="qm-acts"><Button fullWidth leftIcon="users">Manage selections</Button><Button variant="ghost" leftIcon="pencil" aria-label="Edit qualifier">Edit</Button></div>
      <dl className="qm-facts"><div><dt>Rounds in</dt><dd>{b.submitted}/{b.entrants * q.numRounds}</dd></div><div><dt>Spots</dt><dd>{q.topScore ?? b.topScore}+{q.picks}</dd></div><div><dt>Deadline</dt><dd>{q.deadline.replace(', 2026', '')}</dd></div></dl>
      <section className="qm-panel">
        <div className="qm-panel__h"><b>Leaderboard</b>{q.status === 'in_progress' && <Badge tone="accent"><i className="qf-pulse"></i>Live</Badge>}</div>
        {!b.rows.length ? <EmptyState icon="flag" title="Awaiting first round">{b.entrants} players entered. Scores post here as rounds are submitted.</EmptyState> : <>
          {b.rows.map((r, i) => <React.Fragment key={r.id}>
            {i === b.topScore && <div className="qf-line qm-line"><span>Top-score line · {b.topScore} auto-qualify</span></div>}
            {i === b.travel && b.travel !== b.topScore && <div className="qf-line qf-line--muted qm-line"><span>Travel cut · top {b.travel}</span></div>}
            <button className="qm-lb" onClick={() => setPeek(r.id)}>
              <span className="qm-lb__top"><span className="qf-pos">{r.pos}</span><Avatar name={r.name} size={32} /><span className="qm-lb__n"><b>{r.name}</b><SB s={r.state} /></span><TP v={r.toPar} big /></span>
              <span className="qm-lb__g dp-well-soft"><span><em>Rounds</em><b>{`${r.played.length}/${q.numRounds}`}</b></span><span><em>Avg</em><b>{r.avg.toFixed(1)}</b></span><span><em>Total</em><b>{r.total}</b></span></span>
            </button></React.Fragment>)}
          {b.unscored.map((r) => <div key={r.id} className="qm-lb is-none"><span className="qm-lb__top"><span className="qf-pos">—</span><Avatar name={r.name} size={32} /><span className="qm-lb__n"><b>{r.name}</b><span>No rounds submitted</span></span><span className="qf-dash">—</span></span></div>)}
          <p className="qm-cap">Ranked by total to par. Top {b.topScore} auto-qualify{q.picks ? `; ${q.picks} coach’s pick` : ''}.</p></>}
      </section>
      <section className="qm-panel"><div className="qm-panel__h"><b>Course per round</b></div>
        {q.roundCourses.map(([c, d], i) => <div key={i} className="qm-rc"><span className="qf-rn">{i + 1}</span><b>{c}</b><span>{d}</span></div>)}</section>
      <section className="qm-panel qm-pad"><b className="qm-h">Scoring rules</b><p className="qm-empty">{q.rules}</p></section>
      {pr && <PlayerSheet q={q} r={pr} onClose={() => setPeek(null)} />}
    </div>
  );
}

function MNew() {
  const [rounds, setRounds] = React.useState('3');
  const [sel, setSel] = React.useState(Q.PLAYERS.filter((p) => p.active).map((p) => p.id));
  const tog = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <div className="qm-page qm-form">
      <section className="qm-panel qm-pad"><b className="qm-h">Basics</b><FormField label="Qualifier name"><Input defaultValue="Conference qualifier" /></FormField><FormField label="Description" optional><TextArea placeholder="Three 18-hole rounds counting toward a cumulative total…" /></FormField></section>
      <section className="qm-panel qm-pad"><b className="qm-h">Schedule</b><div className="qm-2"><FormField label="Start"><Input type="date" defaultValue="2026-10-19" /></FormField><FormField label="End" optional><Input type="date" defaultValue="2026-10-23" /></FormField></div><FormField label="Entry deadline" optional><Input type="date" defaultValue="2026-10-16" /></FormField></section>
      <section className="qm-panel qm-pad"><b className="qm-h">Course and rules</b><div className="qm-2"><FormField label="Rounds"><Input inputMode="numeric" value={rounds} onChange={(e) => setRounds(e.target.value.replace(/\D/g, '').slice(0, 2))} /></FormField><FormField label="Course" optional><Input defaultValue="Hope Valley CC" /></FormField></div>
        {rounds === '1' && <div className="qf-one"><Checkbox label="This qualifier intentionally allows one 18-hole round." /></div>}</section>
      <section className="qm-panel qm-pad"><b className="qm-h">Travel squad</b><div className="qm-2"><FormField label="Squad size"><Input inputMode="numeric" defaultValue="5" /></FormField><FormField label="Coach’s picks"><Input inputMode="numeric" defaultValue="1" /></FormField></div><div className="qf-readout dp-well-soft"><b>4</b> on score<span>·</span><b>1</b> pick<span>·</span><b>5</b>-player squad</div></section>
      <section className="qm-panel"><div className="qm-panel__h"><b>Players</b><span className="qm-empty">{sel.length} of {Q.PLAYERS.filter((p) => p.active).length}</span></div>
        {Q.PLAYERS.filter((p) => p.active).map((p) => <label key={p.id} className="qm-prow"><Checkbox checked={sel.includes(p.id)} onChange={() => tog(p.id)} /><Avatar name={p.name} size={30} /><span><b>{p.name}</b><span>{p.year}</span></span></label>)}</section>
    </div>
  );
}

function SafariBar() {
  return (
    <div className="qm-safari"><div className="qm-safari__pill"><Icon name="text" size={15} /><span><Icon name="lock" size={11} />golfhelm.app</span><Icon name="rotate-cw" size={15} /></div>
      <div className="qm-safari__row"><Icon name="chevron-left" size={20} /><Icon name="chevron-right" size={20} /><Icon name="share" size={18} /><Icon name="book-open" size={18} /><Icon name="copy" size={18} /></div></div>
  );
}

function QualMobile({ initial = {} }) {
  const [route, setRoute] = React.useState({ v: initial.v || 'list', id: initial.id });
  const [peek, setPeek] = React.useState(initial.peek || null);
  const go = (v, id) => { setRoute({ v, id }); setPeek(null); };
  const q = route.id && Q.qualifiers.find((x) => x.id === route.id);
  return (
    <div className="qm fairway">
      {route.v === 'list' && <Top title="Qualifiers" />}
      {route.v === 'detail' && <Top title="Qualifier" back="Qualifiers" onBack={() => go('list')} />}
      {route.v === 'new' && <Top title="New qualifier" back="Cancel" onBack={() => go('list')} right={<button className="qm-save" onClick={() => go('detail', 'conf')}>Create</button>} />}
      <div className="qm-scroll">
        {route.v === 'list' && <MList go={go} list={Q.qualifiers} />}
        {route.v === 'detail' && <MDetail q={q} peek={peek} setPeek={setPeek} />}
        {route.v === 'new' && <MNew />}
      </div>
      {route.v !== 'new' && <nav className="qm-tabs">{[['house', 'Home'], ['sparkles', 'Helm'], ['flag', 'Rounds'], ['chart-column', 'Stats'], ['layout-grid', 'More']].map(([ic, l]) => <button key={l} className={'qm-tab' + (l === 'Rounds' ? ' is-on' : '')}><Icon name={ic} size={21} /><span>{l}</span></button>)}</nav>}
      <SafariBar />
    </div>
  );
}
Object.assign(window, { QualMobile });
})();
