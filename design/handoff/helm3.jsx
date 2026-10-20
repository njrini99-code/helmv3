(() => {
const { Icon, Button, Avatar } = window.FairwayClubhouseEdition_9c4f4d;
// Strings follow the real generator templates (putt-slope-bias, course-mgmt, putt-bias, program-pulse).
const INS = {
  slope: { cat: 'Putting', pri: 'medium', title: 'Downhill putts inside 6 ft: a real penalty',
    content: 'Inside 6 ft you’re making 58% of downhill putts vs 81% of level putts at the same distance, a 23-point gap (n=31 downhill / 44 level). Short putts carry the highest leverage per attempt in your bag (a miss costs a full stroke), so this gap is worth closing. It’s consistent with a pace-control pattern rather than a green-reading one: the gap shows up inside 6 ft and not beyond it, where line matters more than speed.',
    drill: 'Rehearse a downhill-only ladder drill: start 2 ft below the hole and add a foot at a time, focused on dying the ball into the front of the cup rather than a firm strike.',
    ev: { label: 'Downhill penalty vs level putts', you: '23 pts', you_n: 23, cmp: 'No downhill penalty', cmp_n: 0, max: 30, n: 75, win: '90 days', conf: 0.82, lower: true, bars: [['Downhill', 58], ['Level', 81]] } },
  pen: { cat: 'Course management', pri: 'high', title: 'Penalty strokes: 1.1 per round',
    content: 'Across all 21 rounds on file you’re averaging 1.1 penalty strokes per round. College players in our data average ~0.6. Most come off the tee on holes with water right, 7 of the last 12. Every penalty avoided is worth ~1.5 strokes per round.',
    drill: 'On holes with trouble right, take the club that finishes short of it. Log the choice on the tee for the next 5 rounds.',
    ev: { label: 'Penalties per round', you: '1.1', you_n: 1.1, cmp: 'College cohort avg 0.6', cmp_n: 0.6, max: 1.6, n: 21, win: 'All rounds', conf: 0.7, lower: true } },
  brk: { cat: 'Putting', pri: 'low', title: 'Putting break: under-reading left-to-right (10–20 ft)',
    content: 'From 10–20 ft, 64% of your left-to-right misses finish below the hole (n=28). Right-to-left is balanced at 51%. Play one more cup of break on left-to-right putts in this band.',
    drill: 'Gate drill on a left-to-right putt from 15 ft: set the gate one cup higher than your read.',
    ev: { label: 'Low-side misses, L→R 10–20 ft', you: '64%', you_n: 64, cmp: 'Balanced 50%', cmp_n: 50, max: 80, n: 28, win: '90 days', conf: 0.55, lower: true } },
  dbl: { cat: 'Course management', pri: 'low', title: 'Double bogey-or-worse rate: 3.1%', good: true,
    content: 'Across all 21 rounds on file, 3.1% of holes ended in double bogey or worse. College players in our data average ~4.8%. This is the #1 separator between 70s and 80s rounds, and you’re on the right side of it.',
    ev: { label: 'Double bogey-or-worse rate', you: '3.1%', you_n: 3.1, cmp: 'College cohort avg 4.8%', cmp_n: 4.8, max: 6, n: 21, win: 'All rounds', conf: 0.74, lower: true } },
};
const PRI = { high: 'Priority', medium: 'Worth closing', low: 'Minor' };

function Gauge({ ev }) {
  const p = (v) => Math.min(100, (v / ev.max) * 100);
  return (
    <div className={'h3-g' + ((ev.lower ? ev.you_n <= ev.cmp_n : ev.you_n >= ev.cmp_n) ? ' is-good' : '')}>
      <div className="h3-g__t"><span className="h3-g__f" style={{ width: p(ev.you_n) + '%' }}></span><i className="h3-g__cmp" style={{ left: p(ev.cmp_n) + '%' }}></i><i className="h3-g__you" style={{ left: p(ev.you_n) + '%' }}></i></div>
      <div className="h3-g__lg"><span><i className="is-you"></i>You · <b>{ev.you}</b></span><span><i className="is-cmp"></i>{ev.cmp}</span></div>
    </div>
  );
}
function Evidence({ ev }) {
  return (
    <div className="h3-ev">
      <span className="h3-ev__l">{ev.label}</span>
      {ev.bars ? <div className="h3-bars">{ev.bars.map(([l, v]) => <div key={l}><span>{l}</span><span className="h3-bars__t"><i style={{ width: v + '%' }} className={l === 'Downhill' ? 'is-weak' : ''}></i></span><b>{v}%</b></div>)}</div> : <Gauge ev={ev} />}
      <div className="h3-ev__f"><span>{ev.n} {ev.bars ? 'putts' : 'rounds'}</span><span>{ev.win}</span><span className="h3-conf"><span className="h3-conf__d">{[0.25, 0.5, 0.75, 1].map((t) => <i key={t} className={ev.conf >= t - 0.12 ? 'is-on' : ''}></i>)}</span>{ev.conf >= 0.75 ? 'Solid read' : ev.conf >= 0.6 ? 'Good read' : 'Early read'}</span></div>
    </div>
  );
}

function Focus({ ins, who, open }) {
  const [why, setWhy] = React.useState(!!open);
  const [first, ...rest] = ins.content.split('. ');
  return (
    <article className="h3-focus">
      <div className="h3-focus__k"><span>{who ? who + ' · ' : ''}{ins.cat}</span><span className={'h3-pri is-' + ins.pri}>{PRI[ins.pri]}</span></div>
      <h2>{ins.title}</h2>
      <p className="h3-lede">{first}.</p>
      <Evidence ev={ins.ev} />
      {ins.drill && <div className="h3-drill"><span className="h3-drill__k"><Icon name="target" size={14} />This week</span><p>{ins.drill}</p></div>}
      <button className="h3-why" onClick={() => setWhy(!why)} aria-expanded={why}><span>Why we think this</span><Icon name={why ? 'chevron-up' : 'chevron-down'} size={15} /></button>
      {why && <p className="h3-why__b">{rest.join('. ')}</p>}
    </article>
  );
}
function Row({ ins, onOpen, who }) {
  return (
    <button className="h3-row" onClick={onOpen}>
      <span className={'h3-row__d is-' + (ins.good ? 'good' : ins.pri)}></span>
      <span className="h3-row__b"><em>{who ? who + ' · ' : ''}{ins.cat}</em><b>{ins.title}</b></span>
      <span className="h3-row__v">{ins.ev.you}</span><Icon name="chevron-right" size={15} className="h3-muted" />
    </button>
  );
}

function PlayerHelm({ initial = {} }) {
  const [sel, setSel] = React.useState(initial.sel || 'slope');
  return (
    <div className="h3r"><div className="h3">
      <header className="h3-h"><span className="h3-role">Player</span><h1>CoachHelm</h1><p>One thing to work on this week, based on the rounds you’ve posted.</p></header>
      <div className="h3-grid">
        <Focus key={sel} ins={INS[sel]} open={initial.why} />
        <aside className="h3-side">
          <section className="h3-sec"><h3>Also worth knowing</h3>{['slope', 'pen', 'brk'].filter((k) => k !== sel).map((k) => <Row key={k} ins={INS[k]} onOpen={() => setSel(k)} />)}</section>
          <section className="h3-sec"><h3>Working</h3><Row ins={INS.dbl} onOpen={() => setSel('dbl')} /></section>
          <p className="h3-note">Reads refresh after every posted round. Coach Reyes sees the same insights.</p>
        </aside>
      </div>
    </div></div>
  );
}

const PULSE = [
  { ic: 'calendar-x', t: 'No rounds recorded in 9 days', who: 'Eli Brandt', tone: 'warn' },
  { ic: 'trending-up', t: '2 players are scoring higher than their previous three rounds', who: 'Jonah, Eli', tone: 'warn' },
  { ic: 'mail-question', t: '2 players have not responded for Team dinner', who: 'Ava, Priya', tone: 'soft' },
  { ic: 'trending-down', t: '3 players are scoring lower than their previous three rounds', who: 'Theo, Sofia, Priya', tone: 'good' },
];
const PLAYERS = [
  { id: 'jonah', n: 'Jonah Okafor', top: 'slope', count: 3, trend: '+2.1' },
  { id: 'eli', n: 'Eli Brandt', top: 'pen', count: 2, trend: '+0.8' },
  { id: 'priya', n: 'Priya Natarajan', top: 'brk', count: 1, trend: '−1.4' },
  { id: 'theo', n: 'Theo Marchetti', top: 'dbl', count: 1, trend: '−0.8' },
];
function CoachHelm({ initial = {} }) {
  const [p, setP] = React.useState(initial.player || 'jonah');
  const [done, setDone] = React.useState({});
  const mark = (k) => setDone({ ...done, [p + ':' + k]: true });
  const is = (k) => done[p + ':' + k];
  const cur = PLAYERS.find((x) => x.id === p);
  return (
    <div className="h3r"><div className="h3">
      <header className="h3-h"><span className="h3-role">Coach</span><h1>CoachHelm</h1><p>8 open signals across 5 players.</p></header>
      {!initial.hidePulse && <section className="h3-pulse"><h3>Program pulse</h3><ol>{PULSE.map((x) => <li key={x.t} className={'is-' + x.tone}><span className="h3-pulse__ic"><Icon name={x.ic} size={15} /></span><b>{x.t}</b><span>{x.who}</span></li>)}</ol></section>}
      <div className="h3-cgrid">
        <aside className="h3-plist"><h3>By player</h3>{PLAYERS.map((x) => <button key={x.id} className={'h3-pl' + (p === x.id ? ' is-on' : '')} onClick={() => setP(x.id)}><Avatar name={x.n} size={34} /><span><b>{x.n}</b><em>{INS[x.top].title}</em></span><span className="h3-pl__c">{x.count}</span></button>)}</aside>
        <div className="h3-cmain">
          {is('dismiss') ? <div className="h3-dis"><Icon name="archive" size={16} /><span><b>Insight dismissed.</b> It comes back only if {cur.n.split(' ')[0]}’s pattern changes.</span><Button size="sm" variant="ghost" onClick={() => setDone({ ...done, [p + ':dismiss']: false })}>Undo</Button></div> : <>
          <Focus key={p} ins={INS[cur.top]} who={cur.n.split(' ')[0]} />
          <div className="h3-cact">{is('assign') ? <span className="h3-done"><Icon name="check" size={15} />Assigned as {cur.n.split(' ')[0]}’s focus</span> : <Button variant="primary" leftIcon="flag" onClick={() => mark('assign')}>Assign as focus</Button>}{is('share') ? <span className="h3-done"><Icon name="check" size={15} />Shared with {cur.n.split(' ')[0]}</span> : <Button leftIcon="send" onClick={() => mark('share')}>Share with {cur.n.split(' ')[0]}</Button>}<Button variant="ghost" leftIcon="archive" onClick={() => mark('dismiss')}>Dismiss</Button></div></>}
        </div>
      </div>
    </div></div>
  );
}
Object.assign(window, { PlayerHelm, CoachHelm3: CoachHelm });
})();
