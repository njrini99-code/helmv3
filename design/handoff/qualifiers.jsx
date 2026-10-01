(() => {
const { Icon, Button, Avatar, Badge, Input, TextArea, FormField, Checkbox, EmptyState, RoundStrip, InlineNotice } = window.FairwayClubhouseEdition_9c4f4d;
const Q = window.QUAL, tp = window.qualTp, SP = window.QualStatusPill, TP = window.QualTP, board = window.qualBoard, SB = window.QualStateBadge, Meta = window.QualMeta, cta = window.qualCta;
const isActive = (q) => q.status !== 'completed';

function Pills({ f, setF, counts }) {
  return <div className="qf-pills" role="group" aria-label="Filter qualifiers by status">{[['all', 'All'], ['active', 'Active'], ['concluded', 'Concluded']].map(([k, l]) => <button key={k} className="qf-pill" aria-pressed={f === k} onClick={() => setF(k)}>{l}<span>{counts[k]}</span></button>)}</div>;
}

function List({ go, list }) {
  const [f, setF] = React.useState('all');
  const [qs, setQs] = React.useState('');
  const m = (q) => !qs.trim() || (q.name + ' ' + q.description + ' ' + q.course).toLowerCase().includes(qs.trim().toLowerCase());
  const act = list.filter(isActive), con = list.filter((q) => !isActive(q));
  const A = f !== 'concluded' ? act.filter(m) : [], C = f !== 'active' ? con.filter(m) : [];
  const hero = A.find((q) => q.status === 'in_progress') || A[A.length - 1];
  const rest = A.filter((q) => q !== hero);
  return (
    <div className="qf">
      <div className="rs-head"><div><span className="h3-head__date">Qualifiers · {act.length} active · {con.length} concluded</span><h1>Lineup decisions</h1><p>Run head-to-head qualifiers to decide who plays this week.</p></div>
        <div className="rs-head__act"><Button variant="primary" leftIcon="plus" onClick={() => go('new')}>Create qualifier</Button></div></div>
      <div className="qf-tools"><Pills f={f} setF={setF} counts={{ all: list.length, active: act.length, concluded: con.length }} />
        <div className="qf-search"><Input leftIcon="search" placeholder="Search qualifiers by name, course, or detail" value={qs} onChange={(e) => setQs(e.target.value)} aria-label="Search qualifiers" /></div></div>
      {!A.length && !C.length ? <section className="qf-panel"><EmptyState icon="search" title="No qualifiers match your filters" action={<Button onClick={() => { setF('all'); setQs(''); }}>Clear filters</Button>}>Try a different search term or clear the status filter.</EmptyState></section> : <>
        {hero && <Hero q={hero} go={go} />}
        {rest.length > 0 && <section className="qf-sec"><h3>Active</h3><div className="qf-grid">{rest.map((q) => <Card key={q.id} q={q} go={go} />)}</div></section>}
        {f !== 'active' && <section className="qf-sec"><h3>Concluded</h3>{C.length ? <div className="qf-grid">{C.map((q) => <Card key={q.id} q={q} go={go} />)}</div> : <section className="qf-panel"><EmptyState icon="flag" title="No concluded qualifiers yet">Qualifiers move here once they’re completed.</EmptyState></section>}</section>}
      </>}
    </div>
  );
}
function Hero({ q, go }) {
  const b = board(q);
  return (
    <button className="qf-hero" onClick={() => go('detail', q.id)}>
      <div className="qf-hero__main"><SP status={q.status} /><h2>{q.name}</h2><p>{q.description}</p><Meta q={q} /><span className="qf-cta">{cta(q.status)}<Icon name="arrow-right" size={16} /></span></div>
      {q.status === 'in_progress' && <div className="qf-hero__lead dp-well-soft">
        <div className="qf-hero__lh"><span>Leaders</span><span>{b.submitted} of {b.entrants * q.numRounds} rounds in</span></div>
        {b.rows.slice(0, b.topScore + 1).map((r, i) => <React.Fragment key={r.id}>{i === b.topScore && <div className="qf-line qf-line--s"><span>Top-score line</span></div>}<div className="qf-hero__r"><span className="qf-pos">{r.pos}</span><span className="qf-hero__n">{r.name}</span><span className="qf-hero__th">{r.played.length}/{q.numRounds}</span><TP v={r.toPar} /></div></React.Fragment>)}
      </div>}
    </button>
  );
}
function Card({ q, go }) {
  return (
    <button className="qf-card2" onClick={() => go('detail', q.id)}>
      <div className="qf-card2__h"><div><h4>{q.name}</h4><p>{q.description}</p></div><SP status={q.status} /></div>
      <Meta q={q} /><span className="qf-cta is-quiet">{cta(q.status)}<Icon name="arrow-right" size={15} /></span>
    </button>
  );
}

function Leaderboard({ q, b }) {
  const [open, setOpen] = React.useState(null);
  const cols = '48px minmax(200px,1.6fr) 70px 70px 70px 70px 104px 28px';
  if (!b.rows.length) return <section className="qf-panel"><div className="qf-panel__head"><div><h3>Leaderboard</h3></div></div><EmptyState icon="flag" title="Awaiting first round">Standings appear once a player submits a round {q.roundCourses[0] ? 'on ' + q.roundCourses[0][1] : ''}.</EmptyState></section>;
  return (
    <section className="qf-panel">
      <div className="qf-panel__head"><div><h3>Leaderboard</h3><span>Ranked by total to par · {b.submitted} rounds submitted</span></div>{q.status === 'in_progress' && <Badge tone="accent"><i className="qf-pulse"></i>Updates as rounds are signed</Badge>}</div>
      <div className="qf-scroll">
        <div className="qf-row qf-row--head" style={{ gridTemplateColumns: cols }}><span>Pos</span><span>Player</span><span className="r">Rounds</span><span className="r">Avg</span><span className="r">Total</span><span className="r">To par</span><span className="r">Status</span><span></span></div>
        {b.rows.map((r, i) => { const o = open === r.id; return <React.Fragment key={r.id}>
          {i === b.topScore && <div className="qf-line"><span>Top-score line · {b.topScore} auto-qualify</span></div>}
          {i === b.travel && b.travel !== b.topScore && <div className="qf-line qf-line--muted"><span>Travel cut · top {b.travel} make the trip</span></div>}
          <div className={'qf-row' + (o ? ' is-open' : '')} style={{ gridTemplateColumns: cols }} role="button" tabIndex={0} aria-expanded={o} onClick={() => setOpen(o ? null : r.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(o ? null : r.id))}>
            <span className="qf-pos">{r.pos}</span><span className="qf-who"><Avatar name={r.name} size={32} /><span><b>{r.name}</b><span>{r.year}</span></span></span>
            <span className="r qf-num">{r.played.length}/{q.numRounds}</span><span className="r qf-num">{r.avg.toFixed(1)}</span><span className="r qf-num">{r.total}</span><span className="r"><TP v={r.toPar} big /></span>
            <span className="r"><SB s={r.state} /></span><span className="qf-chev"><Icon name={o ? 'chevron-up' : 'chevron-down'} size={15} /></span>
          </div>
          {o && <div className="qf-detail">{r.played.map((rd) => <div key={rd.i} className="qf-sc"><div className="qf-sc__h"><b>Round {rd.i + 1}</b><span>{q.roundCourses[rd.i][0]} · {q.roundCourses[rd.i][1]}</span></div><RoundStrip holes={rd.holes} /></div>)}</div>}
        </React.Fragment>; })}
        {b.unscored.map((r) => <div key={r.id} className="qf-row is-wd" style={{ gridTemplateColumns: cols, cursor: 'default' }}><span className="qf-pos">—</span><span className="qf-who"><Avatar name={r.name} size={32} /><span><b>{r.name}</b><span>No rounds submitted</span></span></span><span className="r qf-num">0/{q.numRounds}</span><span className="r qf-dash">—</span><span className="r qf-dash">—</span><span className="r qf-dash">—</span><span></span><span></span></div>)}
      </div>
      <p className="qf-cap">Ranked by total to par, then fewer rounds pending. Top {b.topScore} auto-qualify{q.picks ? `; ${q.picks} coach’s-pick spot${q.picks > 1 ? 's' : ''}` : ''}. {q.rules}</p>
    </section>
  );
}
function RoundByRound({ q, b }) {
  if (!b.rows.length) return null;
  const cols = `36px minmax(180px,1.4fr) ${q.roundCourses.map(() => '64px').join(' ')} 70px 70px`;
  return (
    <section className="qf-panel">
      <div className="qf-panel__head"><div><h3>Round-by-round scores</h3><span>Gross strokes · coach only</span></div></div>
      <div className="qf-scroll">
        <div className="qf-row qf-row--head" style={{ gridTemplateColumns: cols, cursor: 'default' }}><span>#</span><span>Player</span>{q.roundCourses.map((c, i) => <span key={i} className="r" title={c.join(' · ')}>R{i + 1}</span>)}<span className="r">Total</span><span className="r">To par</span></div>
        {b.rows.map((r) => <div key={r.id} className="qf-row qf-row--flat" style={{ gridTemplateColumns: cols }}><span className="qf-pos">{r.pos}</span><span className="qf-who"><b>{r.name}</b></span>{q.roundCourses.map((c, i) => <span key={i} className="r qf-num">{r.rounds[i] ? <span className={r.rounds[i].toPar < 0 ? 'is-under' : ''}>{q.par + r.rounds[i].toPar}</span> : <span className="qf-dash">—</span>}</span>)}<span className="r qf-num"><b>{r.total}</b></span><span className="r"><TP v={r.toPar} /></span></div>)}
      </div>
    </section>
  );
}

function Detail({ q, back, toast, setClosed, closed }) {
  const b = board(q);
  const status = closed ? 'completed' : q.status;
  const locked = b.rows.filter((r) => r.state === 'locked' || r.state === 'qualified');
  return (
    <div className="qf">
      <div><Button size="sm" variant="ghost" leftIcon="chevron-left" onClick={back}>Qualifiers</Button></div>
      <div className="rs-head"><div><span className="qf-head__k"><SP status={status} /><span>Qualifier</span></span><h1>{q.name}</h1><p>{q.description}</p></div>
        <div className="rs-head__act"><Button leftIcon="pencil" onClick={() => toast('Edit qualifier opened', 'pencil')}>Edit qualifier</Button>
          {q.status === 'in_progress' && <Button variant="ghost" leftIcon={closed ? 'lock-open' : 'lock'} onClick={() => { setClosed(!closed); toast(closed ? 'Qualifier reopened · players can enter rounds' : 'Qualifier closed · no new rounds accepted', closed ? 'lock-open' : 'lock'); }}>{closed ? 'Reopen qualifier' : 'Close qualifier'}</Button>}</div></div>
      {closed && <InlineNotice tone="neutral" title="Closed to new rounds">Players can’t enter this qualifier until you reopen it. Rounds already started can still be submitted.</InlineNotice>}
      <dl className="qf-facts">{(() => { const d = (s) => s.replace(/, \d{4}$/, ''), yr = q.start.slice(-4); return [
        ['Dates', d(q.start) + (q.end !== q.start ? ' – ' + d(q.end) : ''), yr + ' · ' + q.numRounds + ' round' + (q.numRounds > 1 ? 's' : '')],
        ['Entry deadline', d(q.deadline), yr],
        ['Entrants', b.entrants, 'players'],
        ['Rounds submitted', b.submitted, 'of ' + b.entrants * q.numRounds],
        ['Course', q.course, 'Par ' + q.par],
        ['Spots', q.spots, (q.spots - q.picks) + ' on score · ' + q.picks + ' pick'],
      ].map(([k, v, s]) => <div key={k}><dt>{k}</dt><dd>{v}</dd><span>{s}</span></div>); })()}</dl>
      <div className="qf-body">
        <div className="qf-col"><Leaderboard q={q} b={b} /><RoundByRound q={q} b={b} /></div>
        <div className="qf-col">
          <section className="qf-side">
            <div className="qf-side__head"><div><h3>Selections</h3><span>{q.spots}-player squad · {b.topScore} on score{q.picks ? ' · ' + q.picks + ' pick' : ''}</span></div></div>
            {q.confirmed ? <><ol className="qf-lu">{q.confirmed.map((id, i) => { const r = b.rows.find((x) => x.id === id); return <li key={id}><span className="qf-lu__n">{i + 1}</span><Avatar name={r.name} size={26} /><b>{r.name}</b>{q.pick && q.pick.id === id && <Badge tone="accent">Pick</Badge>}</li>; })}</ol>{q.pick && <p className="qf-side__why"><b>Pick reasoning.</b> {q.pick.why}</p>}</>
              : q.status === 'upcoming' ? <p className="qf-side__why">Selection opens once the first round is submitted.</p>
              : <><div className="qf-lu__k">Auto-qualifying now</div><ol className="qf-lu">{locked.map((r, i) => <li key={r.id}><span className="qf-lu__n">{i + 1}</span><Avatar name={r.name} size={26} /><b>{r.name}</b><TP v={r.toPar} /></li>)}{Array.from({ length: q.picks }).map((_, i) => <li key={'p' + i} className="is-open"><span className="qf-lu__n">{locked.length + i + 1}</span><span className="qf-lu__empty"><Icon name="user-plus" size={14} /></span><b>Coach’s pick</b><span className="qf-lu__m">Open</span></li>)}</ol>
                <div className="qf-side__act"><Button variant="primary" leftIcon="users" fullWidth onClick={() => toast('Selection workspace opened', 'users')}>Open selection workspace</Button></div></>}
          </section>
          <section className="qf-side">
            <div className="qf-side__head"><div><h3>Course per round</h3><span>{q.numRounds} round{q.numRounds > 1 ? 's' : ''} · par {q.par}</span></div></div>
            <ol className="qf-lu">{q.roundCourses.map(([c, d], i) => <li key={i}><span className="qf-rn">{i + 1}</span><b>{c}</b><span className="qf-lu__m">{d}</span></li>)}</ol>
          </section>
          <section className="qf-side"><div className="qf-side__head"><div><h3>Scoring rules</h3><span>Shown to players</span></div></div><p className="qf-side__why" style={{ marginTop: 0 }}>{q.rules}</p></section>
        </div>
      </div>
    </div>
  );
}

function NewQualifier({ back, create }) {
  const [v, setV] = React.useState({ name: '', description: '', start: '', end: '', deadline: '', rounds: '3', course: 'Finley GC', rules: '', squad: '5', picks: '1' });
  const [one, setOne] = React.useState(false);
  const [sel, setSel] = React.useState(Q.PLAYERS.filter((p) => p.active).map((p) => p.id));
  const [err, setErr] = React.useState(null);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const n = parseInt(v.rounds, 10), sq = parseInt(v.squad, 10) || 0, pk = parseInt(v.picks, 10) || 0;
  const submit = () => {
    if (!v.name.trim()) return setErr('Give the qualifier a name.');
    if (!v.start) return setErr('Add a start date.');
    if (!n || n < 1) return setErr('Rounds must be a whole number of 1 or more.');
    if (n === 1 && !one) return setErr('Confirm that this qualifier intentionally allows one round.');
    if (!sel.length) return setErr('Choose at least one player.');
    create({ name: v.name.trim(), rounds: n, players: sel.length });
  };
  const tog = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const chk = (fn) => (x) => fn(typeof x === 'boolean' ? x : x && x.target ? x.target.checked : !!x);
  return (
    <div className="qf qf--form">
      <div><Button size="sm" variant="ghost" leftIcon="chevron-left" onClick={back}>Qualifiers</Button></div>
      <div className="rs-head"><div><span className="h3-head__date">New qualifier</span><h1>Create a qualifier</h1><p>Players enter rounds from their app. The leaderboard builds as they sign.</p></div></div>
      {err && <InlineNotice tone="danger" title="Couldn’t create the qualifier">{err}</InlineNotice>}
      <div className="qf-form">
        <div className="qf-col">
          <section className="qf-fs"><div className="qf-fs__h"><h3>Basics</h3><span>Name it and describe the format.</span></div>
            <FormField label="Qualifier name"><Input value={v.name} onChange={set('name')} placeholder="Pinehurst qualifier" /></FormField>
            <FormField label="Description" optional help="What players should expect: format, stakes, vibe."><TextArea value={v.description} onChange={set('description')} placeholder="Three 18-hole rounds counting toward a cumulative total…" /></FormField></section>
          <section className="qf-fs"><div className="qf-fs__h"><h3>Schedule</h3><span>When does it run? Dates never close entry; only you can.</span></div>
            <div className="qf-2"><FormField label="Start date"><Input type="date" value={v.start} onChange={set('start')} /></FormField><FormField label="End date" optional help="For multi-day qualifiers."><Input type="date" value={v.end} onChange={set('end')} /></FormField></div>
            <FormField label="Entry deadline" optional help="When players must confirm in, on or before the start date."><Input type="date" value={v.deadline} onChange={set('deadline')} /></FormField></section>
          <section className="qf-fs"><div className="qf-fs__h"><h3>Course and rules</h3><span>Where it’s played and how it’s scored.</span></div>
            <div className="qf-2"><FormField label="Rounds" help="How many rounds count. Players can’t enter more than this."><Input inputMode="numeric" value={v.rounds} onChange={(e) => { setOne(false); setV({ ...v, rounds: e.target.value.replace(/\D/g, '').slice(0, 2) }); }} /></FormField><FormField label="Course" optional><Input leftIcon="map-pin" value={v.course} onChange={set('course')} /></FormField></div>
            {n === 1 && <div className="qf-one"><Checkbox checked={one} onChange={chk(setOne)} label="This qualifier intentionally allows one 18-hole round." /></div>}
            <FormField label="Scoring rules" optional help="Shown on the qualifier page."><TextArea value={v.rules} onChange={set('rules')} placeholder="Lowest aggregate over all rounds. Ties broken by final-round scorecard playoff." /></FormField></section>
          <section className="qf-fs"><div className="qf-fs__h"><h3>Players</h3><span>{sel.length} of {Q.PLAYERS.filter((p) => p.active).length} active players entered</span></div>
            <div className="qf-plist">{Q.PLAYERS.filter((p) => p.active).map((p) => <label key={p.id} className="qf-prow"><Checkbox checked={sel.includes(p.id)} onChange={() => tog(p.id)} /><Avatar name={p.name} size={30} /><span><b>{p.name}</b><span>{p.year}</span></span></label>)}</div></section>
        </div>
        <div className="qf-col qf-col--sticky">
          <section className="qf-fs"><div className="qf-fs__h"><h3>Travel squad</h3><span>Optional. Sets the cut lines on the leaderboard.</span></div>
            <div className="qf-2"><FormField label="Squad size" help="Players who make the trip."><Input inputMode="numeric" value={v.squad} onChange={set('squad')} /></FormField><FormField label="Coach’s picks" help="Discretionary spots."><Input inputMode="numeric" value={v.picks} onChange={set('picks')} /></FormField></div>
            <div className="qf-readout dp-well-soft"><b>{Math.max(0, sq - pk)}</b> auto-qualify on score<span>·</span><b>{pk}</b> coach pick{pk === 1 ? '' : 's'}<span>·</span><b>{sq}</b>-player squad</div></section>
          <div className="qf-formact"><Button variant="ghost" onClick={back}>Cancel</Button><Button variant="primary" leftIcon="check" onClick={submit}>Create qualifier</Button></div>
        </div>
      </div>
    </div>
  );
}

function QualifiersPage({ toast }) {
  const [route, setRoute] = React.useState({ v: 'list' });
  const [list, setList] = React.useState(Q.qualifiers);
  const [closed, setClosed] = React.useState({});
  const go = (v, id) => { setRoute({ v, id }); document.querySelector('.h2-canvas')?.scrollTo(0, 0); window.scrollTo(0, 0); };
  if (route.v === 'new') return <NewQualifier back={() => go('list')} create={(x) => {
    const q = { ...Q.qualifiers[1], id: 'n' + Date.now(), name: x.name, numRounds: x.rounds, description: x.rounds + ' round' + (x.rounds > 1 ? 's' : '') + ' · ' + x.players + ' players entered', roundCourses: Array.from({ length: x.rounds }, () => ['Finley GC', 'TBD']), entries: [] };
    setList([q, ...list]); toast('Qualifier created · ' + x.players + ' players invited', 'check'); go('detail', q.id); }} />;
  if (route.v === 'detail') { const q = list.find((x) => x.id === route.id); return <Detail q={q} back={() => go('list')} toast={toast} closed={!!closed[q.id]} setClosed={(c) => setClosed({ ...closed, [q.id]: c })} />; }
  return <List go={go} list={list} />;
}
Object.assign(window, { QualifiersPage });
})();
