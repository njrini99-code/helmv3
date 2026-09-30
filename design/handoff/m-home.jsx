(() => {
const { Icon, Button, Avatar, Badge } = window.FairwayClubhouseEdition_9c4f4d;
const D = window.HOME_DATA, C = window.CAL, RO = window.ROSTER;
const TEAM = D.teamRounds.map((r) => r.score);

const STATES = {
  practice: { dow: 'Tuesday', date: '14 October', hello: 'Good afternoon, Maya.', brief: 'Short-game block at 3:30. Scoring is down 0.9 strokes over the last 10 rounds.', day: 14, now: 14.67 },
  competition: { dow: 'Thursday', date: '16 October', hello: 'Good morning, Maya.', brief: 'Qualifier day. Five of six players are checked in and the bus is loading.', day: 16, now: 6.1 },
  empty: { dow: 'Monday', date: '3 August', hello: 'Good morning, Maya.', brief: 'Your calendar is clear. Add practices and events so players see them on their phones.', day: 40, now: 9, none: true },
  quiet: { dow: 'Sunday', date: '19 October', hello: 'Good morning, Maya.', brief: 'Nothing on the calendar today. Scoring is down 1.4 strokes since August.', day: 19, now: 9.5 },
};

function NoEvents({ player }) {
  return (
    <div className="mh-next mh-next--empty">
      <div className="mh-next__k"><span className="mh-next__type"><Icon name="calendar" size={13} />Up next</span></div>
      <div className="mh-none"><span className="mh-none__ic"><Icon name="calendar-plus" size={22} /></span><span><h2>No events scheduled</h2><p>{player ? 'Your coach’s practices and events will show here with a countdown.' : 'Practices, qualifiers and travel show up here with a countdown.'}</p></span></div>
      {!player && <><div className="mh-none__q">{[['flag', 'Practice'], ['target', 'Qualifier'], ['trophy', 'Tournament'], ['dumbbell', 'Workout']].map(([ic, l]) => <button key={l} className="mh-none__chip"><Icon name={ic} size={13} />{l}</button>)}</div>
      <button className="mh-none__add"><Icon name="plus" size={16} />Add event</button></>}
    </div>
  );
}

function UpNext({ s, e, go }) {
  if (!e) return <NoEvents />;
  const mins = !e.allDay && e.date === s.day ? Math.round((e.start - s.now) * 60) : null;
  const when = e.allDay ? 'Today · all day' : e.date === s.day ? (mins <= 0 ? 'Happening now' : mins < 60 ? 'In ' + mins + ' min' : 'In ' + Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min') : 'Tomorrow · ' + C.fmt(e.start);
  const going = e.rsvp[0], total = e.people.length;
  const major = e.type === 'qualifier' || e.type === 'tournament';
  return (
    <button className="mh-next" onClick={go}>
      <div className="mh-next__k"><span className="mh-next__type"><Icon name={C.TYPES[e.type].icon} size={13} />{C.TYPES[e.type].label}</span><span className={'mh-next__when' + (mins != null && mins > 0 && mins < 60 ? ' is-soon' : '')}>{when}</span></div>
      <h2>{e.title.replace('Qualifier · ', '')}</h2>
      <p>{major ? 'First tee 8:42 · ' + e.location : C.range(e) + ' · ' + e.location}</p>
      <div className="mh-next__f">
        <span className="mh-stack">{e.people.slice(0, 5).map((id) => <Avatar key={id} name={C.person(id).name} size={24} />)}</span>
        <span className="mh-next__rsvp"><b>{going}</b> of {total} going</span>
        <Icon name="chevron-right" size={17} />
      </div>
    </button>
  );
}

function Today({ s, list }) {
  if (!list.length) return (
    <section className="mh-sec"><div className="mh-sec__h"><h3>Today</h3></div>
      <div className="mh-empty"><Icon name="sun" size={18} /><span><b>Nothing scheduled</b><span>Players can still post rounds from the course.</span></span>{!s.none && <Button size="sm" leftIcon="plus">Plan</Button>}</div></section>
  );
  return (
    <section className="mh-sec"><div className="mh-sec__h"><h3>Today</h3><span className="mh-link">Calendar</span></div>
      <div className="mh-tl">{list.map((e) => { const past = !e.allDay && e.end <= s.now, now = !e.allDay && e.start <= s.now && e.end > s.now; return (
        <div key={e.id} className={'mh-tl__r' + (past ? ' is-past' : '') + (now ? ' is-now' : '')}>
          <span className="mh-tl__t">{e.allDay ? 'All day' : C.fmt(e.start, false)}</span>
          <span className="mh-tl__rail"><i className={'dot-' + e.type}></i></span>
          <span className="mh-tl__b"><b>{e.title}</b><span>{e.location}</span></span>
          {e.conflict ? <span className="mh-tl__w" title="Schedule conflict"><Icon name="triangle-alert" size={13} /></span> : now ? <span className="mh-now">Now</span> : null}
        </div>); })}</div></section>
  );
}

function Needs({ list }) {
  if (!list.length) return null;
  return (
    <section className="mh-sec"><div className="mh-sec__h"><h3>Needs you</h3><span className="mh-count">{list.length}</span></div>
      <div className="mh-rail">{list.map((n) => (
        <div key={n.id} className="mh-need">
          <div className="mh-need__top"><Avatar name={n.name} size={34} /><span><b>{n.name}</b><em className={'is-' + n.tone}>{n.tag}</em></span></div>
          <p>{n.text}</p>
          <div className="mh-need__a"><Button size="sm" fullWidth>{n.act}</Button></div>
        </div>))}</div></section>
  );
}

function Form() {
  const W = 320, H = 64, lo = Math.min(...TEAM) - 0.3, hi = Math.max(...TEAM) + 0.3;
  const x = (i) => 4 + (i * (W - 8)) / (TEAM.length - 1), y = (v) => 6 + ((v - lo) / (hi - lo)) * (H - 12);
  const d = TEAM.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  return (
    <section className="mh-form">
      <div className="mh-form__top"><span><em>Team scoring average</em><b>73.4</b></span><span className="mh-delta">−0.9<em>vs previous 10</em></span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mh-form__svg" aria-hidden="true"><defs><linearGradient id="mhf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1E6B45" stopOpacity=".14" /><stop offset="1" stopColor="#1E6B45" stopOpacity="0" /></linearGradient></defs>
        <path d={d + ` L${x(TEAM.length - 1)},${H} L${x(0)},${H} Z`} fill="url(#mhf)" /><path d={d} fill="none" stroke="#1E6B45" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /><circle cx={x(TEAM.length - 1)} cy={y(TEAM[TEAM.length - 1])} r="3.6" fill="#1E6B45" stroke="#FDFCF8" strokeWidth="2" /></svg>
      <div className="mh-form__figs">{[['Rounds', '11', 'of 12 this week'], ['GIR', '61%', '+3'], ['Putts', '30.4', '+0.3']].map(([k, v, m], i) => <div key={k}><em>{k}</em><b>{v}</b><span className={i === 2 ? 'm-neg' : i === 1 ? 'm-pos' : ''}>{m}</span></div>)}</div>
    </section>
  );
}

function Week({ s }) {
  const start = s.day - ((s.day + 3) % 7);
  const days = Array.from({ length: 7 }, (_, i) => start + i);
  return (
    <section className="mh-sec"><div className="mh-sec__h"><h3>This week</h3></div>
      <div className="mh-week">{days.map((d) => { const evs = C.events.filter((e) => e.date === d && e.type !== 'class'); const major = evs.find((e) => e.type === 'qualifier' || e.type === 'tournament'); return (
        <div key={d} className={'mh-week__d' + (d === s.day ? ' is-today' : '') + (major ? ' is-major' : '')}><em>{C.dow(d).slice(0, 1)}</em><b>{d}</b><span>{major ? <Icon name={C.TYPES[major.type].icon} size={11} /> : evs.slice(0, 3).map((e, j) => <i key={j}></i>)}</span></div>); })}</div>
      {(() => { const m = C.events.find((e) => e.date > s.day && e.date < start + 7 && (e.type === 'qualifier' || e.type === 'tournament')); return m ? <p className="mh-week__n"><b>{C.dow(m.date)}</b> {m.title}</p> : null; })()}
    </section>
  );
}

function HomeM({ initial = {} }) {
  const s = STATES[initial.state || 'practice'];
  const [round, setRound] = React.useState(initial.round ?? null);
  const today = C.events.filter((e) => e.date === s.day && e.type !== 'class' && !e.title.startsWith('1:1')).sort((a, b) => (a.allDay ? -1 : a.start) - (b.allDay ? -1 : b.start));
  const next = today.find((e) => e.allDay || e.end > s.now) || C.events.filter((e) => e.date === s.day + 1 && e.type !== 'class').sort((a, b) => a.start - b.start)[0];
  const r = round != null && D.rounds[round];
  return (
    <div className="qm fairway mh">
      <div className="qm-scroll mh-scroll">
        <header className="mh-hero">
          <div className="mh-hero__bar"><button className="mh-team"><img src="assets/helm-logo-white.png" alt="" /><span>Varsity</span><Icon name="chevron-down" size={14} /></button><button className="mh-bell" aria-label="Notifications"><Icon name="bell" size={19} /><i></i></button></div>
          <span className="mh-hero__date">{s.dow}, {s.date}</span>
          <h1>{s.hello}</h1>
          <p className="mh-hero__brief"><Icon name="sparkles" size={14} />{s.brief}</p>
          <UpNext s={s} e={next} go={() => {}} />
        </header>
        <div className="mh-body">
          <Today s={s} list={today} />
          <Form />
          {!s.none && <Week s={s} />}
          <section className="mh-sec"><div className="mh-sec__h"><h3>Latest rounds</h3><span className="mh-link">All</span></div>
            <div className="mh-list">{D.rounds.map((x, i) => { const tot = x.holes.reduce((a, h) => a + h.score, 0), par = x.holes.reduce((a, h) => a + h.par, 0); return (
              <button key={i} className="mh-rd" onClick={() => setRound(i)}><Avatar name={x.player} size={38} /><span className="mh-rd__b"><b>{x.player}</b><span>{x.meta.split(' · ').slice(0, 2).join(' · ')}</span></span><span className={'mh-score' + (tot < par ? ' is-under' : '')}><b>{tot}</b><em>{mPar(tot - par)}</em></span></button>); })}</div></section>
        </div>
      </div>
      <MTabs on="home" />
      <MSafari />
      {r && <MSheet title={r.player} sub={r.meta} onClose={() => setRound(null)} foot={<><Button fullWidth leftIcon="message-square">Message</Button><Button fullWidth variant="primary" leftIcon="chart-column">Round recap</Button></>}>
        <div className="m-strip dp-well-soft">{r.stats.map((x) => <div key={x.label}><em>{x.label}</em><b>{x.value}</b></div>)}</div>
        <MNine holes={r.holes.slice(0, 9)} start={1} label="Out" /><MNine holes={r.holes.slice(9)} start={10} label="In" />
      </MSheet>}
    </div>
  );
}
Object.assign(window, { HomeM });
})();
