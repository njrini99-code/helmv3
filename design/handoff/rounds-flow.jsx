(() => {
const { Icon, Button, Badge, Input } = window.FairwayClubhouseEdition_9c4f4d;
const R = window.RND, tp = window.rndTp;
const course = (id) => R.courses.find((c) => c.id === id);
const TYPES = [['practice', 'Practice'], ['tournament', 'Tournament'], ['qualifier', 'Qualifier']];
const STEPS = ['Setup', 'Holes', 'Track', 'Done'];

function Seg({ value, onChange, options, full, size }) {
  return <div className={'rf-seg' + (full ? ' is-full' : '') + (size === 'sm' ? ' is-sm' : '')} role="radiogroup">{options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

/* ───────── Library ───────── */
const IMG = (name) => (R.courses.find((c) => c.name === name) || {}).img;
const TEEHEX = { Blue: '#2F5E9E', White: '#FFFFFF', Black: '#1C1B18', Gold: '#C9A227', Red: '#B03A2E' };
function Ribbon({ rounds }) {
  const xs = [...rounds].reverse();
  const maxOver = Math.max(1, ...xs.map((x) => x.score - x.par)), maxUnder = Math.max(0, ...xs.map((x) => x.par - x.score));
  const W = 640, L = 40, R2 = 100, u = 20, top = 16, base = top + maxOver * u, H = base + maxUnder * u + 40;
  const bw = (W - L - R2) / xs.length;
  const avg = xs.reduce((s, x) => s + x.score - x.par, 0) / xs.length;
  const ya = (d) => base - d * u;
  const ticks = []; for (let v = -maxUnder; v <= maxOver; v++) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rf-rib" role="img" aria-label="Strokes over par for each round this season, oldest to newest">
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R2} y1={ya(v)} y2={ya(v)} stroke={v === 0 ? '#1C1B18' : 'rgb(28 25 18/.07)'} strokeOpacity={v === 0 ? .45 : 1} /><text x={L - 8} y={ya(v) + 4} textAnchor="end" className={'rf-rib__t' + (v === 0 ? ' is-par' : '')}>{v === 0 ? 'Par' : tp(v)}</text></g>)}
      <line x1={L} x2={W - R2} y1={ya(avg)} y2={ya(avg)} stroke="#1E6B45" strokeOpacity=".7" strokeDasharray="1 5" strokeLinecap="round" strokeWidth="1.8" />
      <g transform={`translate(${W - R2 + 8},${ya(avg)})`}><rect x="0" y="-10" width="86" height="20" rx="10" fill="#EDF4EF" stroke="rgb(21 90 57/.25)" /><text x="43" y="4" textAnchor="middle" className="rf-rib__t rf-rib__t--g">Your avg {tp(+avg.toFixed(1))}</text></g>
      {xs.map((x, i) => { const d = x.score - x.par, cx = L + bw * i + bw / 2, h = Math.max(3, Math.abs(d) * u), y0 = d >= 0 ? base - h : base; return (
        <g key={i}><title>{x.d} · {x.course} · {x.score} ({tp(d)}) · {x.type}</title>
          <rect x={cx - bw * 0.26} y={d === 0 ? base - 1.5 : y0} width={bw * 0.52} height={d === 0 ? 3 : h} rx="4" className={d < 0 ? 'is-under' : d === 0 ? 'is-even' : x.type === 'Qualifier' ? 'is-q' : 'is-over'} />
          <text x={cx} y={d >= 0 ? base - h - 6 : base + h + 13} textAnchor="middle" className={'rf-rib__v' + (d < 0 ? ' is-under' : '')}>{x.score}</text>
          <text x={cx} y={H - 18} textAnchor="middle" className="rf-rib__d">{x.d.split(' ')[1]}</text>
          <text x={cx} y={H - 5} textAnchor="middle" className="rf-rib__t">{x.d.split(' ')[0]}</text>
        </g>); })}
    </svg>
  );
}
function Library({ onNew, onContinue, noUnfinished, noActive, onOpen }) {
  const [none, setNone] = React.useState(!!noUnfinished || !!noActive);
  const [q, setQ] = React.useState('');
  const [group, setGroup] = React.useState('month');
  const all = R.rounds.flatMap((g) => g.items.map((x) => ({ ...x, month: g.month })));
  const shown = all.filter((x) => !q || x.course.toLowerCase().includes(q.toLowerCase()));
  const groups = group === 'month' ? R.rounds.map((g) => [g.month, shown.filter((x) => x.month === g.month)]) : [...new Set(shown.map((x) => x.course))].map((c) => [c, shown.filter((x) => x.course === c)]);
  const avg = all.reduce((s, x) => s + x.score, 0) / all.length, toPar = all.reduce((s, x) => s + x.score - x.par, 0) / all.length;
  const best = all.reduce((m, x) => (x.score - x.par < m.score - m.par ? x : m), all[0]);
  const putts = all.reduce((s, x) => s + x.putts, 0) / all.length, gir = all.reduce((s, x) => s + x.gir, 0) / all.length;
  return (
    <div className="rf rf-lib">
      <header className="rf-lib__h"><div><span className="rf-k">Fall 2026 · {all.length} counted rounds</span><h1>Your rounds</h1></div><Button variant="primary" leftIcon="plus" onClick={onNew}>New round</Button></header>
      <div className="rf-hero">
        {none ? (
        <div className="rf-unf rf-unf--empty">
          <div className="rf-unf__top"><span className="rf-unf__k rf-unf__k--idle"><i></i>No round in progress</span><button className="rf-unf__toggle" onClick={() => setNone(false)}>Show example</button></div>
          <b className="rf-unf__c">Ready when you are.</b><span className="rf-unf__m">Start a round and track every shot. It saves as you go, so you can pick it back up here.</span>
          <div className="rf-unf__holes">{Array.from({ length: 18 }, (_, i) => <span key={i} className="is-ghost">{i + 1}</span>)}</div>
          <div className="rf-unf__f"><span>Last round <b>Sep 26</b> · Finley GC</span><span className="rf-unf__cta" role="button" tabIndex={0} onClick={onNew}>Start a round<Icon name="arrow-right" size={15} /></span></div>
        </div>) : (
        <button className="rf-unf" onClick={onContinue}>
          <div className="rf-unf__top"><span className="rf-unf__k"><i></i>In progress</span><span className="rf-unf__t">Started 9:12 today</span></div>
          <b className="rf-unf__c">Finley GC</b><span className="rf-unf__m">Blue tees · Practice · 18 holes</span>
          <div className="rf-unf__holes">{Array.from({ length: 18 }, (_, i) => { const s = R.played[i]; const par = [4, 5, 3][i]; return <span key={i} className={s ? (s < par ? 'is-b' : s > par ? 'is-o' : 'is-p') : i === 3 ? 'is-next' : ''}>{s || (i === 3 ? '4' : '')}</span>; })}</div>
          <div className="rf-unf__f"><span><b>+1</b> through 3</span><span className="rf-unf__cta">Continue at hole 4<Icon name="arrow-right" size={15} /></span></div>
        </button>)}
        <section className="rf-season">
          <div className="rf-season__h"><div><span className="rf-k">Season scoring</span><div className="rf-season__big"><b>{avg.toFixed(1)}</b><em>avg · +{toPar.toFixed(1)} to par</em></div></div>
            <dl className="rf-season__f">{[['Best', best.score, best.course.split(' ')[0] + ' · ' + best.d], ['Putts', putts.toFixed(1), 'per round'], ['GIR', Math.round((gir / 18) * 100) + '%', gir.toFixed(1) + ' of 18']].map(([k, v, m]) => <div key={k}><dt>{k}</dt><dd>{v}</dd><span>{m}</span></div>)}</dl></div>
          <div className="rf-season__ch"><b>Every round vs par</b><span>Bar height is strokes over par · number on top is your score · shorter is better</span></div>
          <Ribbon rounds={all} />
          <div className="rf-season__lg">{all.some((x) => x.score < x.par) && <span><i className="is-under"></i>Under par</span>}<span><i className="is-over"></i>Over par</span><span><i className="is-q"></i>Qualifier</span></div>
        </section>
      </div>
      <div className="rf-tools"><div className="rf-search"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search course…" aria-label="Search rounds by course" /></div><Seg size="sm" value={group} onChange={setGroup} options={[['month', 'By month'], ['course', 'By course']]} /></div>
      {groups.filter(([, xs]) => xs.length).map(([g, xs]) => { const ga = xs.reduce((s, x) => s + x.score, 0) / xs.length, gb = Math.min(...xs.map((x) => x.score)); return (
        <section key={g} className="rf-grp">
          <div className="rf-grp__h"><h3>{g}</h3><span className="rf-grp__rule"></span><span>{xs.length} rounds</span><span>avg <b>{ga.toFixed(1)}</b></span><span>low <b>{gb}</b></span></div>
          <div className="rf-book">{xs.map((x, i) => { const d = x.score - x.par, fir = x.fir.split('/').map(Number); return (
            <button key={i} className={'rf-sc' + (d < 0 ? ' is-under' : '')} onClick={() => onOpen && onOpen(x)}>
              <span className="rf-sc__img" style={{ backgroundImage: `url(${IMG(x.course)})` }}><span className="rf-sc__date"><b>{x.d.split(' ')[1]}</b><em>{x.dow}</em></span></span>
              <span className="rf-sc__c"><b>{x.course}</b><span><i className="rf-sc__tee" style={{ background: TEEHEX[x.tee] }}></i>{x.tee} tees<span className={'rf-pill is-' + x.type.toLowerCase()}>{x.type}</span></span></span>
              <span className="rf-sc__grid" aria-label={`Out ${x.out}, in ${x.inn}, total ${x.score}`}><span><em>Out</em><b>{x.out}</b></span><span><em>In</em><b>{x.inn}</b></span><span className="is-tot"><em>Tot</em><b>{x.score}</b></span></span>
              <span className="rf-sc__m">
                <span className="rf-meter"><em>Fairways</em><span className="rf-meter__t"><i style={{ width: (fir[0] / fir[1]) * 100 + '%' }}></i></span><b>{x.fir}</b></span>
                <span className="rf-meter"><em>Greens</em><span className="rf-meter__t"><i style={{ width: (x.gir / 18) * 100 + '%' }}></i></span><b>{x.gir}/18</b></span>
                <span className="rf-meter"><em>Putts</em><span className="rf-meter__t is-p"><i style={{ width: ((36 - x.putts) / 10) * 100 + '%' }}></i></span><b>{x.putts}</b></span>
              </span>
              <span className="rf-sc__s"><b>{tp(d)}</b><em>{x.score}</em></span>
            </button>); })}</div>
        </section>); })}
    </div>
  );
}

/* ───────── Course picker (course → tee) ───────── */
function Picker({ stage, setStage, pick, onPick, onClose }) {
  const [q, setQ] = React.useState('');
  const c = pick && course(pick);
  const match = (x) => !q || (x.name + ' ' + x.city).toLowerCase().includes(q.toLowerCase());
  const recent = R.courses.filter((x) => x.recent && match(x)), team = R.courses.filter((x) => x.team && !x.recent && match(x)), lib = R.courses.filter((x) => !x.team && !x.recent && match(x));
  const Row = ({ x }) => (
    <button className="rf-crs" onClick={() => setStage('tees', x.id)}>
      <span className="rf-crs__img" style={{ backgroundImage: `url(${x.img})` }}></span>
      <span className="rf-crs__b"><b>{x.name}</b><span>{x.city} · Par {x.par} · {x.tees.length} tees</span></span>
      {x.recent ? <span className="rf-crs__r">{x.recent}</span> : null}<Icon name="chevron-right" size={16} className="rf-chev" />
    </button>
  );
  const Sec = ({ label, xs }) => xs.length ? <section className="rf-psec"><h4>{label}<span>{xs.length}</span></h4><div className="rf-plist">{xs.map((x) => <Row key={x.id} x={x} />)}</div></section> : null;
  return (
    <div className="rf-scrim" onClick={onClose}>
      <div className="rf-picker" role="dialog" aria-label={stage === 'tees' ? 'Choose tees' : 'Choose a course'} onClick={(e) => e.stopPropagation()}>
        <span className="rf-grab"></span>
        <div className="rf-picker__h">
          {stage === 'tees' ? <button className="rf-back" onClick={() => setStage('courses')}><Icon name="chevron-left" size={18} />Courses</button> : <b>Where are you playing?</b>}
          <button className="rf-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        {stage === 'courses' ? <>
          <div className="rf-search rf-search--lg"><Icon name="search" size={16} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses" aria-label="Search courses" /></div>
          <div className="rf-picker__b">
            {q ? <Sec label="Results" xs={[...recent, ...team, ...lib]} /> : <><Sec label="Recently played" xs={recent} /><Sec label="Team courses" xs={team} /><Sec label="Course library" xs={lib} /></>}
            {q && !recent.length && !team.length && !lib.length && <p className="rf-none">No courses match “{q}”.</p>}
            <button className="rf-add" onClick={() => setStage("add")}><span><Icon name="plus" size={16} /></span><b>Add a course</b><em>Enter pars and yardages yourself</em></button>
          </div>
        </> : <>
          <div className="rf-teehero" style={{ backgroundImage: `linear-gradient(180deg,rgb(11 58 37/0) 30%,rgb(11 58 37/.85)),url(${c.img})` }}><b>{c.name}</b><span><Icon name="map-pin" size={13} />{c.city} · Par {c.par}</span></div>
          <div className="rf-picker__b"><h4 className="rf-teek">Choose your tees</h4>
            <div className="rf-tees">{c.tees.map((t) => { const out = t.holes.slice(0, 9).reduce((s, h) => s + h.y, 0); return (
              <button key={t.id} className="rf-tee" onClick={() => onPick(c.id, t.id)} aria-label={`Play the ${t.name} tees, ${t.total.toLocaleString()} yards`}>
                <span className="rf-tee__sw" style={{ background: t.hex }}></span>
                <span className="rf-tee__b"><b>{t.name}</b><span>{t.cat}</span></span>
                <span className="rf-tee__y"><b>{t.total.toLocaleString()}</b><em>yds</em></span>
                <span className="rf-tee__f"><span><em>Rating</em>{t.rating}</span><span><em>Slope</em>{t.slope}</span><span><em>Out · In</em>{out.toLocaleString()} · {(t.total - out).toLocaleString()}</span></span>
                <span className="rf-tee__bar">{t.holes.map((h) => <i key={h.n} style={{ height: 6 + (h.y / 620) * 22 }} className={'p' + h.par}></i>)}</span>
              </button>); })}</div></div>
        </>}
      </div>
    </div>
  );
}

/* ───────── Hole config ───────── */
function HoleConfig({ holes, setHoles, count, nine, setNine, full18, baseline }) {
  const list = count === 9 ? holes.slice(nine === 'back' ? 9 : 0, nine === 'back' ? 18 : 9) : holes;
  const set = (n, k, v) => setHoles(holes.map((h) => h.n === n ? { ...h, [k]: v } : h));
  const sum = (xs, k) => xs.reduce((s, h) => s + (+h[k] || 0), 0);
  const out = list.slice(0, 9), inn = list.slice(9);
  const edited = holes.filter((h, i) => baseline && (h.par !== baseline[i].par || h.y !== baseline[i].y)).length;
  return (
    <section className="rf-card rf-hc">
      <div className="rf-card__h"><div><h3>Scorecard</h3><span>{edited ? edited + ' hole' + (edited > 1 ? 's' : '') + ' edited for this round' : 'From the tee you picked · edits apply to this round only'}</span></div>
        {count === 9 && full18 && <Seg size="sm" value={nine} onChange={setNine} options={[['front', 'Front 9'], ['back', 'Back 9']]} />}</div>
      <div className="rf-hc__sum">{[['Holes', list.length], ['Par', sum(list, 'par')], ['Yards', sum(list, 'y').toLocaleString()], ...(count === 18 ? [['Out', sum(out, 'par')], ['In', sum(inn, 'par')]] : [])].map(([k, v]) => <div key={k}><em>{k}</em><b>{v}</b></div>)}</div>
      <div className="rf-hc__grid">{list.map((h) => { const b = baseline && baseline[h.n - 1]; const ch = b && (b.par !== h.par || b.y !== h.y); return (
        <div key={h.n} className={'rf-hole' + (ch ? ' is-edited' : '')}>
          <span className="rf-hole__n">{h.n}</span>
          <div className="rf-par" role="radiogroup" aria-label={`Hole ${h.n} par`}>{[3, 4, 5].map((p) => <button key={p} type="button" role="radio" aria-checked={h.par === p} onClick={() => set(h.n, 'par', p)}>{p}</button>)}</div>
          <label className="rf-yds"><input inputMode="numeric" value={h.y} onChange={(e) => set(h.n, 'y', e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label={`Hole ${h.n} yardage`} /><em>yds</em></label>
        </div>); })}</div>
    </section>
  );
}

/* ───────── Setup ───────── */
function Setup({ st, set, openPicker, onStart, onBack }) {
  const c = st.course && course(st.course), t = c && c.tees.find((x) => x.id === st.tee);
  const step = c ? 1 : 0;
  const q = R.qualifier;
  return (
    <div className="rf rf-setup">
      <div className="rf-band">
        <button className="rf-band__back" onClick={onBack}><Icon name="chevron-left" size={16} />Rounds</button>
        <span className="rf-k rf-k--dark">New round · {c ? 'Scorecard' : 'Setup'}</span>
        <h1>{c ? 'Your round at ' + c.name : 'Track every shot of this round.'}</h1>
        <p>{c ? 'These pars and yardages came with the tee you picked. Tweak any hole, then start.' : 'Pick a course, set up your scorecard, then start tracking.'}</p>
        <div className="rf-spine">{STEPS.map((s, i) => <div key={s} className={i < step ? 'is-done' : i === step ? 'is-on' : ''}><span><i></i></span><em>{s}</em></div>)}</div>
      </div>
      <div className="rf-cols">
        <div className="rf-col">
          <section className="rf-card rf-course">
            {c ? <>
              <div className="rf-course__img" style={{ backgroundImage: `linear-gradient(180deg,transparent 35%,rgb(11 58 37/.82)),url(${c.img})` }}><b>{c.name}</b><span><Icon name="map-pin" size={13} />{c.city}</span></div>
              <div className="rf-course__f"><span className="rf-course__tee"><i style={{ background: t.hex }}></i><b>{t.name} tees</b></span><span>{t.total.toLocaleString()} yds</span><span>Rating {t.rating}</span><span>Slope {t.slope}</span><Button size="sm" variant="ghost" onClick={() => openPicker('tees', c.id)}>Change tees</Button></div>
            </> : <div className="rf-course__empty"><span className="rf-course__ic"><Icon name="map-pin" size={20} /></span><div><b>Choose a course</b><span>Search the course library or pick one you’ve played.</span></div><Button onClick={() => openPicker('courses')} leftIcon="search">Browse courses</Button></div>}
          </section>
          {st.type !== 'qualifier' && <button className="rf-qual" onClick={() => set({ type: 'qualifier', course: q.course, tee: q.tee })}>
            <span className="rf-qual__ic"><Icon name="medal" size={17} /></span><span className="rf-qual__b"><em>Active qualifier</em><b>{q.name}</b><span>Round {q.round} of 3 available · Finley GC · Blue</span></span><span className="rf-qual__cta">Play</span></button>}
          <section className="rf-card">
            <div className="rf-card__h"><div><h3>Round details</h3></div></div>
            <div className="rf-form">
              <div className="rf-field"><span>Round type</span><Seg full value={st.type} onChange={(v) => set({ type: v })} options={TYPES} /></div>
              <div className="rf-2">
                <label className="rf-field"><span>Date</span><input type="date" className="rf-in" value={st.date} max="2026-10-14" onChange={(e) => set({ date: e.target.value })} /></label>
                <div className="rf-field"><span>Holes</span><Seg full value={st.count} onChange={(v) => set({ count: v })} options={[[9, '9 holes'], [18, '18 holes']]} /></div>
              </div>
              {st.type === 'qualifier' && <div className="rf-qsel">
                <div className="rf-qsel__h"><Icon name="medal" size={15} /><b>{q.name}</b><Badge tone="accent">Round {q.round}</Badge></div>
                <p>{q.note}</p>
                <div className="rf-qsel__r"><span>Rounds completed</span><span className="rf-dots">{[1, 2, 3].map((n) => <i key={n} className={n < q.round ? 'is-done' : n === q.round ? 'is-now' : ''}></i>)}</span><b>2 of 3</b></div>
              </div>}
            </div>
          </section>
          <p className="rf-note"><Icon name="chart-column" size={15} /><span><b>50+ stats tracked</b>: driving, approach proximity, putting, scrambling and more. Use your rangefinder for accurate distances.</span></p>
        </div>
        <div className="rf-col">
          {c ? <HoleConfig holes={st.holes} setHoles={(h) => set({ holes: h })} count={st.count} nine={st.nine} setNine={(v) => set({ nine: v })} full18 baseline={t.holes} />
            : <section className="rf-card rf-hc rf-hc--empty"><div className="rf-hc__ghost">{Array.from({ length: 9 }).map((_, i) => <span key={i}><b>{i + 1}</b><i></i><i></i></span>)}</div><p>Your scorecard appears here once you pick a course and tees.</p></section>}
        </div>
      </div>
      <div className="rf-dock">
        <span className="rf-dock__s">{c ? <><b>{c.name}</b> · {t.name} · {st.count} holes · Par {(st.count === 9 ? st.holes.slice(st.nine === 'back' ? 9 : 0, st.nine === 'back' ? 18 : 9) : st.holes).reduce((s, h) => s + h.par, 0)}</> : 'Pick a course to continue'}</span>
        <Button variant="primary" size="lg" disabled={!c} onClick={onStart} rightIcon="arrow-right">Start round</Button>
      </div>
    </div>
  );
}

function Started({ st, onBack }) {
  const c = course(st.course), t = c.tees.find((x) => x.id === st.tee), h = st.holes[st.count === 9 && st.nine === 'back' ? 9 : 0];
  return (
    <div className="rf rf-started"><div className="rf-started__c">
      <span className="rf-started__ok"><Icon name="check" size={22} /></span>
      <span className="rf-k">Round started · {c.name} · {t.name}</span>
      <h1>Hole {h.n}</h1><p>Par {h.par} · {h.y} yards</p>
      <p className="rf-started__n">Shot tracking opens next. Your round saves as you go, so you can leave and continue from Rounds.</p>
      <Button onClick={onBack} leftIcon="chevron-left">Back to setup</Button>
    </div></div>
  );
}

function RoundsFlow({ initial = {} }) {
  const baseHoles = (cid, tid) => { const c = course(cid); return c ? c.tees.find((x) => x.id === tid).holes.map((h) => ({ ...h })) : []; };
  const [view, setView] = React.useState(initial.view || 'library');
  const [picker, setPicker] = React.useState(initial.picker || null);
  const [pick, setPick] = React.useState(initial.pickCourse || null);
  const [rev, setRev] = React.useState(initial.review || null);
  const [addC, setAddC] = React.useState(initial.addCourse ? { step: initial.addStep || 0 } : null);
  const [st, setSt] = React.useState(() => ({ course: initial.course || null, tee: initial.tee || null, type: initial.type || 'practice', date: '2026-10-14', count: initial.count || 18, nine: 'front', holes: initial.course ? baseHoles(initial.course, initial.tee) : [] }));
  const set = (p) => setSt((s) => { const n = { ...s, ...p }; if (p.course && (p.course !== s.course || p.tee !== s.tee)) n.holes = baseHoles(p.course, p.tee); return n; });
  const root = React.useRef(null);
  React.useEffect(() => { if (initial.scroll && root.current) { const sc = root.current.closest('.qm-scroll') || root.current.parentElement; const el = root.current.querySelector('.rf-hc'); if (sc && el) sc.scrollTop = el.offsetTop - 12; } }, []);
  return (
    <div ref={root} className="rf-wrap"><div className="rf-root">
      {view === 'library' && <Library noUnfinished={initial.noUnfinished} noActive={initial.noActive} onNew={() => { setView('setup'); setPicker('courses'); }} onContinue={() => setView('tracking')} onOpen={(x) => { setRev(x); setView('review'); }} />}
      {view === 'setup' && <Setup st={st} set={set} openPicker={(s, cid) => { setPicker(s); if (cid) setPick(cid); }} onStart={() => setView('tracking')} onBack={() => setView('library')} />}
      {view === 'started' && <Started st={st} onBack={() => setView('setup')} />}
      {view === 'tracking' && <RoundTracking initial={initial.track || {}} onExit={() => setView('library')} onReview={() => { setRev(null); setView('review'); }} />}
      {view === 'review' && <RoundReview round={rev} onBack={() => setView('library')} />}
      </div>
      {picker && <Picker stage={picker} pick={pick} setStage={(s, cid) => { if (s === 'add') { setPicker(null); setAddC({ step: 0 }); return; } setPicker(s); if (cid) setPick(cid); }} onPick={(cid, tid) => { set({ course: cid, tee: tid }); setPicker(null); }} onClose={() => setPicker(null)} />}
      {addC && <AddCourse initial={addC} onClose={() => { setAddC(null); setPicker('courses'); }} onSave={() => { setAddC(null); setPicker('tees'); setPick('finley'); }} />}
    </div>
  );
}
Object.assign(window, { RoundsFlow });
})();
