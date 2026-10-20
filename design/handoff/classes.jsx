(() => {
const { Icon, Button, Badge, Switch } = window.FairwayClubhouseEdition_9c4f4d;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DATES = { Mon: 13, Tue: 14, Wed: 15, Thu: 16, Fri: 17 };
const TODAY = 'Tue', NOW = 14.67;
const C = [
  { id: 'stat', code: 'STAT 201', name: 'Probability and Statistics', prof: 'Dr. L. Osei', room: 'Hanes Hall 120', days: ['Tue', 'Thu'], s: 9, e: 10.25, cr: 3, tone: 'mist', exam: 'Midterm · Thu 23 Oct', grade: 'B+', share: true },
  { id: 'econ', code: 'ECON 310', name: 'Intermediate Macroeconomics', prof: 'Prof. M. Hart', room: 'Gardner Hall 008', days: ['Mon', 'Wed'], s: 10.17, e: 11.42, cr: 3, tone: 'clay', exam: 'Problem set 4 · Wed 15 Oct', grade: 'A−', share: true },
  { id: 'busi', code: 'BUSI 401', name: 'Corporate Finance', prof: 'Prof. A. Chen', room: 'McColl 2150', days: ['Tue', 'Thu'], s: 12.5, e: 13.75, cr: 3, tone: 'sand', exam: 'Case memo · Tue 21 Oct', grade: 'A', share: true },
  { id: 'engl', code: 'ENGL 105', name: 'Writing in the Disciplines', prof: 'Dr. R. Pike', room: 'Greenlaw 222', days: ['Mon', 'Wed', 'Fri'], s: 13.42, e: 14.25, cr: 3, tone: 'stone', exam: 'Draft 2 · Fri 17 Oct', grade: 'A−', share: false },
  { id: 'exss', code: 'EXSS 188', name: 'Golf Performance Lab', prof: 'Coach Reyes', room: 'Finley GC', days: ['Fri'], s: 8, e: 9.25, cr: 1, tone: 'sage', exam: null, grade: 'P', share: true },
];
const GOLF = [
  { days: ['Mon', 'Wed'], s: 6.5, e: 7.5, t: 'Strength', where: 'Weight room' },
  { days: ['Mon', 'Tue', 'Wed'], s: 15.5, e: 17.5, t: 'Practice', where: 'Finley GC' },
  { days: ['Fri'], s: 15.5, e: 17, t: 'Recovery nine', where: 'Finley GC' },
];
const TRAVEL = { day: 'Thu', t: 'Pinehurst qualifier', when: 'Thu 16 Oct · bus 6:15 AM, back ~8 PM', misses: ['stat', 'busi'] };
const fmt = (h) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return ((hh + 11) % 12) + 1 + ':' + String(mm).padStart(2, '0'); };
const ap = (h) => (h < 12 ? 'AM' : 'PM');
const byId = (id) => C.find((c) => c.id === id);
const credits = C.reduce((s, c) => s + c.cr, 0);

function dayItems(d) {
  const cls = C.filter((c) => c.days.includes(d)).map((c) => ({ kind: 'class', c, s: c.s, e: c.e }));
  const golf = GOLF.filter((g) => g.days.includes(d)).map((g) => ({ kind: 'golf', g, s: g.s, e: g.e }));
  if (d === TRAVEL.day) golf.push({ kind: 'travel', s: 6.25, e: 20, g: { t: TRAVEL.t, where: 'Pinehurst No. 2' } });
  return [...cls, ...golf].sort((a, b) => a.s - b.s);
}

function Ribbon({ d = TODAY, onOpen }) {
  const S = 7, E = 20, pos = (h) => ((h - S) / (E - S)) * 100;
  const items = dayItems(d);
  const next = items.find((x) => x.s > NOW);
  return (
    <section className="cl-rib">
      <div className="cl-rib__h"><div><span className="cl-k">Tuesday, 14 October</span><h2>{next ? <>Next up: <em>{next.kind === 'class' ? next.c.code : next.g.t}</em> at {fmt(next.s)}</> : 'Done for today'}</h2><p>{(() => { const a = items.filter((x) => x.kind === 'class').length, b = items.filter((x) => x.kind !== 'class').length; return `${a} class${a === 1 ? '' : 'es'} and ${b} team session${b === 1 ? '' : 's'} today.`; })()} You’re between classes and practice.</p></div>
        <div className="cl-rib__now"><b>{fmt(NOW)}</b><em>{ap(NOW)}</em></div></div>
      <div className="cl-rib__track">
        {Array.from({ length: E - S + 1 }, (_, i) => S + i).map((h) => <span key={h} className="cl-rib__tick" style={{ left: pos(h) + '%' }}>{h % 2 ? '' : (((h + 11) % 12) + 1) + (h < 12 ? 'a' : 'p')}</span>)}
        {items.map((x, i) => <button key={i} className={'cl-rib__b is-' + x.kind + (x.kind === 'class' ? ' t-' + x.c.tone : '') + (x.e <= NOW ? ' is-past' : '')} style={{ left: pos(x.s) + '%', width: pos(x.e) - pos(x.s) + '%' }} onClick={() => x.kind === 'class' && onOpen(x.c.id)} title={(x.kind === 'class' ? x.c.code : x.g.t) + ' · ' + fmt(x.s) + '–' + fmt(x.e)}><b>{x.kind === 'class' ? (x.e - x.s < 1.4 ? x.c.code.split(' ')[0] : x.c.code) : x.g.t}</b><em>{fmt(x.s)}</em></button>)}
        <span className="cl-rib__nowl" style={{ left: pos(NOW) + '%' }}><i></i></span>
      </div>
      <div className="cl-rib__lg"><span><i className="is-class"></i>Class</span><span><i className="is-golf"></i>Team session</span><span><i className="is-gap"></i>Free</span></div>
    </section>
  );
}

function Dial({ onOpen }) {
  const items = dayItems(TODAY), S = 7, E = 21, R0 = 120, cx = 150, cy = 150;
  const ang = (h) => (-220 + ((h - S) / (E - S)) * 260) * Math.PI / 180;
  const pt = (h, r) => [cx + r * Math.cos(ang(h)), cy + r * Math.sin(ang(h))];
  const arc = (s, e, r) => { const [x1, y1] = pt(s, r), [x2, y2] = pt(e, r); return `M${x1},${y1} A${r},${r} 0 ${(e - s) / (E - S) * 260 > 180 ? 1 : 0} 1 ${x2},${y2}`; };
  const next = items.find((x) => x.s > NOW), mins = next ? Math.round((next.s - NOW) * 60) : 0;
  const [nx, ny] = pt(NOW, R0 + 16);
  const TONE = { mist: '#9FB0B4', clay: '#C9A48C', sand: '#CDB67E', stone: '#AFA99C', sage: '#9DB69E' };
  return (
    <section className="cl-dial">
      <svg viewBox="0 0 300 250" className="cl-dial__svg" role="img" aria-label="Today's schedule as a clock dial">
        <path d={arc(S, E, R0)} fill="none" stroke="rgb(255 255 255/.08)" strokeWidth="26" strokeLinecap="round" />
        {Array.from({ length: E - S + 1 }, (_, i) => S + i).map((h) => { const [a, b] = pt(h, R0 - 22), [c, d] = pt(h, R0 - 17); const [tx, ty] = pt(h, R0 - 34); return <g key={h}><line x1={a} y1={b} x2={c} y2={d} stroke="rgb(244 241 232/.3)" />{h % 3 === 1 && <text x={tx} y={ty + 3} textAnchor="middle" className="cl-dial__t">{((h + 11) % 12) + 1}{h < 12 ? 'a' : 'p'}</text>}</g>; })}
        <path d={arc(S, NOW, R0)} fill="none" stroke="rgb(255 255 255/.12)" strokeWidth="26" strokeLinecap="round" />
        {items.map((x, i) => <path key={i} d={arc(x.s, x.e, R0)} fill="none" stroke={x.kind === 'class' ? TONE[x.c.tone] : '#7BC79A'} strokeWidth={x.kind === 'class' ? 22 : 14} strokeLinecap="butt" opacity={x.e <= NOW ? .45 : 1} className={x.kind === 'class' ? 'is-link' : ''} onClick={() => x.kind === 'class' && onOpen(x.c.id)}><title>{(x.kind === 'class' ? x.c.code : x.g.t) + ' · ' + fmt(x.s) + '–' + fmt(x.e)}</title></path>)}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#F4F1E8" strokeWidth="2" strokeLinecap="round" /><circle cx={cx} cy={cy} r="5" fill="#F4F1E8" /><circle cx={nx} cy={ny} r="4" fill="#F4F1E8" />
        <text x={cx} y={cy + 40} textAnchor="middle" className="cl-dial__now">{fmt(NOW)}</text><text x={cx} y={cy + 56} textAnchor="middle" className="cl-dial__t">{ap(NOW)} · Tue 14 Oct</text>
      </svg>
      <div className="cl-dial__side">
        <span className="cl-k">Up next</span>
        {next && <><h2>{next.kind === 'class' ? next.c.code : next.g.t}</h2><p>{next.kind === 'class' ? next.c.name : next.g.where}</p>
          <div className="cl-dial__cd"><b>{Math.floor(mins / 60) ? Math.floor(mins / 60) + 'h ' : ''}{mins % 60}m</b><em>until {fmt(next.s)} {ap(next.s)}</em></div></>}
        <ol className="cl-dial__list">{items.map((x, i) => <li key={i} className={x.e <= NOW ? 'is-past' : x === next ? 'is-next' : ''}><i style={{ background: x.kind === 'class' ? TONE[x.c.tone] : '#7BC79A' }}></i><span>{fmt(x.s)}</span><b>{x.kind === 'class' ? x.c.code : x.g.t}</b><em>{x.kind === 'class' ? x.c.room : x.g.where}</em></li>)}</ol>
      </div>
    </section>
  );
}

function AddInline({ onMore }) {
  const [days, setDays] = React.useState(['Mon', 'Wed']);
  const [code, setCode] = React.useState('');
  const clash = days.some((d) => ['Mon', 'Tue', 'Wed'].includes(d));
  return (
    <section className="cl-card cl-addc">
      <div className="cl-card__h"><div><h3>Add a class</h3><span>Weekly until Dec 5 · coach sees busy time only</span></div></div>
      <div className="cl-addc__b">
        <div className="cl-2"><label className="rf-field"><span>Course</span><input className="rf-in" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GEOG 110" /></label><label className="rf-field"><span>Room</span><input className="rf-in" placeholder="Carroll 111" /></label></div>
        <div className="rf-field"><span>Days</span><div className="cl-daypick">{DAYS.map((d) => <button key={d} aria-pressed={days.includes(d)} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{d}</button>)}</div></div>
        <div className="cl-2"><label className="rf-field"><span>Starts</span><input className="rf-in" type="time" defaultValue="15:00" /></label><label className="rf-field"><span>Ends</span><input className="rf-in" type="time" defaultValue="16:15" /></label></div>
        {clash && <div className="cl-clash"><Icon name="triangle-alert" size={15} /><span><b>Overlaps practice</b>3:30–5:30 on {days.filter((d) => ['Mon', 'Tue', 'Wed'].includes(d)).join(', ')}.</span></div>}
        <div className="cl-addc__f"><button className="cl-link" onClick={onMore}>More details</button><Button variant="primary" leftIcon="plus" disabled={!code}>Add {code || 'class'}</Button></div>
      </div>
    </section>
  );
}

function Week({ onOpen }) {
  const S = 6, E = 19, rowH = 34, y = (h) => (h - S) * rowH;
  return (
    <section className="cl-card cl-week">
      <div className="cl-card__h"><div><h3>This week</h3><span>Oct 13 – 17 · classes, practice and travel together</span></div></div>
      <div className="cl-week__g" style={{ '--h': (E - S) * rowH + 'px' }}>
        <div className="cl-week__ax">{Array.from({ length: E - S }, (_, i) => S + i).map((h) => <span key={h} style={{ top: y(h) }}>{((h + 11) % 12) + 1}{h < 12 ? 'a' : 'p'}</span>)}</div>
        {DAYS.map((d) => (
          <div key={d} className={'cl-week__d' + (d === TODAY ? ' is-today' : '') + (d === TRAVEL.day ? ' is-travel' : '')}>
            <div className="cl-week__dh"><em>{d}</em><b>{DATES[d]}</b></div>
            <div className="cl-week__col">
              {Array.from({ length: E - S }, (_, i) => <i key={i} className="cl-week__ln" style={{ top: i * rowH }}></i>)}
              {dayItems(d).map((x, i) => { const miss = x.kind === 'class' && d === TRAVEL.day && TRAVEL.misses.includes(x.c.id); return x.kind === 'travel'
                ? <div key={i} className="cl-ev is-travel" style={{ top: y(Math.max(S, x.s)), height: y(Math.min(E, x.e)) - y(Math.max(S, x.s)) }}><Icon name="bus" size={13} /><b>{x.g.t}</b><em>Away all day</em></div>
                : <button key={i} className={'cl-ev is-' + x.kind + (x.kind === 'class' ? ' t-' + x.c.tone : '') + (miss ? ' is-miss' : '') + (y(x.e) - y(x.s) < 40 ? ' is-short' : '')} style={{ top: y(x.s) + 1, height: y(x.e) - y(x.s) - 2 }} onClick={() => x.kind === 'class' && onOpen(x.c.id)}><b>{x.kind === 'class' ? x.c.code : x.g.t}</b><em>{fmt(x.s)}{x.kind === 'class' ? ' · ' + x.c.room.split(' ')[0] : ''}</em>{miss && <strong>Missing</strong>}</button>; })}
              {d === TODAY && <span className="cl-week__now" style={{ top: y(NOW) }}></span>}
            </div>
          </div>))}
      </div>
    </section>
  );
}

function Travel() {
  return (
    <section className="cl-travel">
      <div className="cl-travel__h"><span className="cl-travel__ic"><Icon name="triangle-alert" size={16} /></span><div><em>Conflict</em><b>{TRAVEL.t}</b><span>{TRAVEL.when}</span></div></div>
      <div className="cl-travel__l">{TRAVEL.misses.map((id) => { const c = byId(id); return (
        <div key={id} className="cl-travel__r"><span className={'cl-dot t-' + c.tone}></span><span className="cl-travel__c"><b>{c.code}</b><em>Thu {fmt(c.s)}–{fmt(c.e)} {ap(c.e)} · {c.prof}</em></span><span className="cl-conf">Conflict</span></div>); })}</div>
    </section>
  );
}

function CourseCard({ c, onOpen }) {
  const nextDay = DAYS[(DAYS.indexOf(TODAY) + DAYS.slice(DAYS.indexOf(TODAY)).findIndex((d) => c.days.includes(d) && !(d === TODAY && c.e <= NOW))) % 5] || c.days[0];
  const isNow = c.days.includes(TODAY) && c.s <= NOW && c.e > NOW;
  return (
    <button className={'cl-course t-' + c.tone} onClick={() => onOpen(c.id)}>
      <span className="cl-course__tab"><b>{c.code.split(' ')[0]}</b><em>{c.code.split(' ')[1]}</em></span>
      <span className="cl-course__b"><b>{c.name}</b><span>{c.prof} · {c.room}</span>
        <span className="cl-course__m"><span className="cl-days">{DAYS.map((d) => <i key={d} className={c.days.includes(d) ? 'is-on' : ''}>{d[0]}</i>)}</span><span>{fmt(c.s)}–{fmt(c.e)} {ap(c.e)}</span><span>{c.cr} cr</span></span></span>
      <span className="cl-course__r">{isNow ? <Badge tone="accent">In class now</Badge> : <span className="cl-course__next"><em>Next</em>{nextDay === TODAY ? 'Today' : nextDay} {fmt(c.s)}</span>}
        {c.exam && <span className="cl-course__ex"><Icon name="calendar-clock" size={12} />{c.exam}</span>}
        <span className={'cl-share' + (c.share ? ' is-on' : '')}><Icon name={c.share ? 'eye' : 'eye-off'} size={12} />{c.share ? 'Coach sees times' : 'Private'}</span></span>
    </button>
  );
}

function Detail({ c, onClose }) {
  const occ = [['Tue 7 Oct', 'Held'], ['Thu 9 Oct', 'Held'], ['Tue 14 Oct', c.days.includes('Tue') ? (c.e <= NOW ? 'Held' : 'Today') : null], ['Thu 16 Oct', TRAVEL.misses.includes(c.id) ? 'Travel' : null], ['Tue 21 Oct', 'Upcoming'], ['Thu 23 Oct', 'Upcoming']].filter((x) => x[1]);
  const [share, setShare] = React.useState(c.share);
  return (
    <div className="cl-scrim" onClick={onClose}><aside className="cl-detail" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={c.code}>
      <span className="rf-grab"></span>
      <div className={'cl-detail__hero t-' + c.tone}><button className="rf-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button><span className="cl-k">{c.code} · {c.cr} credits · Fall 2026</span><h2>{c.name}</h2><p>{c.prof}</p></div>
      <div className="cl-detail__b">
        <dl className="cl-facts">{[['When', c.days.join(', ') + ' · ' + fmt(c.s) + '–' + fmt(c.e) + ' ' + ap(c.e)], ['Where', c.room], ['Next deadline', c.exam || 'None posted'], ['Grade to date', c.grade]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <div className="cl-sec"><b>Meetings</b><ol className="cl-occ">{occ.map(([d, s]) => <li key={d} className={'is-' + s.toLowerCase()}><i></i><span>{d}</span><em>{s === 'Travel' ? 'Conflict · Pinehurst' : s}</em></li>)}</ol></div>
        <label className="cl-sharebox"><span><b>Share class times with coach</b><em>Coach sees when you’re busy, not the class name.</em></span><Switch checked={share} onChange={() => setShare(!share)} aria-label="Share class times with coach" /></label>
      </div>
      <div className="cl-detail__f"><Button variant="ghost" className="rt-danger">Remove class</Button><Button leftIcon="pencil">Edit class</Button></div>
    </aside></div>
  );
}

function AddClass({ onClose }) {
  const [days, setDays] = React.useState(['Tue', 'Thu']);
  return (
    <div className="cl-scrim" onClick={onClose}><aside className="cl-detail cl-add" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add a class">
      <span className="rf-grab"></span>
      <div className="cl-add__h"><div><b>Add a class</b><span>It repeats weekly until Dec 5, the end of term.</span></div><button className="rf-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
      <div className="cl-detail__b">
        <div className="cl-2"><label className="rf-field"><span>Course code</span><input className="rf-in" defaultValue="GEOG 110" /></label><label className="rf-field"><span>Credits</span><input className="rf-in" defaultValue="3" inputMode="numeric" /></label></div>
        <label className="rf-field"><span>Course name</span><input className="rf-in" placeholder="Global Environmental Change" /></label>
        <div className="rf-field"><span>Days</span><div className="cl-daypick">{DAYS.map((d) => <button key={d} aria-pressed={days.includes(d)} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{d}</button>)}</div></div>
        <div className="cl-2"><label className="rf-field"><span>Starts</span><input className="rf-in" type="time" defaultValue="15:30" /></label><label className="rf-field"><span>Ends</span><input className="rf-in" type="time" defaultValue="16:45" /></label></div>
        <div className="cl-clash"><Icon name="triangle-alert" size={15} /><span><b>Overlaps practice</b> Tue 3:30–5:30. Your coach will see the conflict when you save.</span></div>
        <label className="rf-field"><span>Room</span><input className="rf-in" placeholder="Building and room" /></label>
      </div>
      <div className="cl-detail__f"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" leftIcon="plus">Add class</Button></div>
    </aside></div>
  );
}

function Binder({ c, onOpen }) {
  const conflict = GOLF.some((g) => g.days.some((d) => c.days.includes(d)) && g.s < c.e && c.s < g.e);
  const travel = TRAVEL.misses.includes(c.id);
  return (
    <button className={'cl-bind t-' + c.tone} onClick={() => onOpen(c.id)}>
      <span className="cl-bind__top"><span className="cl-bind__code"><b>{c.code.split(' ')[0]}</b>{c.code.split(' ')[1]}</span><span className="cl-bind__cr">{c.cr} cr</span></span>
      <b className="cl-bind__name">{c.name}</b>
      <span className="cl-bind__prof">{c.prof}</span>
      <span className="cl-bind__week">{DAYS.map((d) => <span key={d} className={c.days.includes(d) ? 'is-on' : ''}><em>{d[0]}</em>{c.days.includes(d) && <b>{fmt(c.s)}</b>}</span>)}</span>
      <span className="cl-bind__f"><span><Icon name="map-pin" size={12} />{c.room}</span>{travel ? <span className="cl-flag is-travel"><Icon name="triangle-alert" size={12} />Conflict Thu</span> : conflict ? <span className="cl-flag"><Icon name="triangle-alert" size={12} />Overlaps practice</span> : c.exam ? <span className="cl-flag is-due"><Icon name="calendar-clock" size={12} />{c.exam.split(' · ')[0]}</span> : null}</span>
    </button>
  );
}

function AddCard({ startOpen }) {
  const [open, setOpen] = React.useState(!!startOpen);
  const [days, setDays] = React.useState(['Mon', 'Wed']);
  const [code, setCode] = React.useState('');
  const clash = days.some((d) => ['Mon', 'Tue', 'Wed'].includes(d));
  if (!open) return <button className="cl-bind cl-bind--add" onClick={() => setOpen(true)}><span className="cl-bind__plus"><Icon name="plus" size={22} /></span><b>Add a class</b><em>Course, days, time and room</em></button>;
  return (
    <div className="cl-bind cl-bind--form t-sand">
      <div className="cl-form">
        <div className="cl-form__h"><b>New class</b><button className="rf-x" onClick={() => setOpen(false)} aria-label="Cancel"><Icon name="x" size={14} /></button></div>
        <div className="cl-2"><label className="rf-field"><span>Course code</span><input className="rf-in" autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GEOG 110" /></label><label className="rf-field"><span>Credits</span><input className="rf-in" defaultValue="3" inputMode="numeric" /></label></div>
        <label className="rf-field"><span>Course name</span><input className="rf-in" placeholder="Global Environmental Change" /></label>
        <label className="rf-field"><span>Professor</span><input className="rf-in" placeholder="Dr. J. Alvarez" /></label>
        <div className="rf-field"><span>Days</span><div className="cl-daypick">{DAYS.map((d) => <button key={d} aria-pressed={days.includes(d)} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{d}</button>)}</div></div>
        <div className="cl-2"><label className="rf-field"><span>Starts</span><input className="rf-in" type="time" defaultValue="15:00" /></label><label className="rf-field"><span>Ends</span><input className="rf-in" type="time" defaultValue="16:15" /></label></div>
        <label className="rf-field"><span>Room</span><input className="rf-in" placeholder="Carroll 111" /></label>
        {clash && <div className="cl-clash"><Icon name="triangle-alert" size={15} /><span><b>Overlaps practice</b>3:30–5:30 on {days.filter((d) => ['Mon', 'Tue', 'Wed'].includes(d)).join(', ')}. Your coach will see it.</span></div>}
        <Button variant="primary" leftIcon="plus" disabled={!code} onClick={() => setOpen(false)}>Add {code || 'class'}</Button>
      </div>
    </div>
  );
}

function TermBar() {
  const start = new Date(2026, 7, 18), end = new Date(2026, 11, 5), today = new Date(2026, 9, 14);
  const span = end - start, pos = (d) => ((d - start) / span) * 100;
  const wk = Math.floor((today - start) / 6048e5) + 1, weeks = Math.ceil(span / 6048e5);
  const marks = [
    { d: new Date(2026, 9, 15), w: 'Wed Oct 15', l: 'Problem set 4', c: 'econ', k: 'due' },
    { d: new Date(2026, 9, 16), w: 'Thu Oct 16', l: 'Pinehurst · 2 conflicts', k: 'conf' },
    { d: new Date(2026, 9, 17), w: 'Fri Oct 17', l: 'Draft 2', c: 'engl', k: 'due' },
    { d: new Date(2026, 9, 21), w: 'Tue Oct 21', l: 'Case memo', c: 'busi', k: 'due' },
    { d: new Date(2026, 9, 23), w: 'Thu Oct 23', l: 'STAT midterm', c: 'stat', k: 'exam' },
    { d: new Date(2026, 10, 25), w: 'Wed Nov 25', l: 'Thanksgiving break', k: 'break' },
    { d: new Date(2026, 11, 5), w: 'Sat Dec 5', l: 'Finals begin', k: 'exam' },
  ];
  const soon = marks.filter((m) => m.d >= today).slice(0, 4);
  const dd = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <section className="cl-tb">
      <div className="cl-tb__top">
        <div className="cl-tb__wk"><span>Week</span><b>{wk}</b><em>of {weeks}</em></div>
        <div className="cl-tb__stack"><span className="cl-tb__k">{credits} credits · {C.length} classes</span>
          <div className="cl-tb__bar">{C.map((c) => <i key={c.id} className={'t-' + c.tone} style={{ flex: c.cr }} title={c.code + ' · ' + c.cr + ' cr'}><b>{c.cr > 1 ? c.code.split(' ')[0] : c.code[0]}</b></i>)}</div></div>
        <div className="cl-tb__conf"><Icon name="triangle-alert" size={15} /><b>2</b><span>conflicts this week</span></div>
      </div>
      <div className="cl-tb__line">
        <span className="cl-tb__fill" style={{ width: pos(today) + '%' }}></span>
        {Array.from({ length: weeks + 1 }, (_, i) => <i key={i} className="cl-tb__tick" style={{ left: (i / weeks) * 100 + '%' }}></i>)}
        {marks.filter((m) => m.d - today > 6048e5 * 1.2).map((m, i) => <span key={i} className={'cl-tb__m is-' + m.k + (m.c ? ' t-' + byId(m.c).tone : '')} style={{ left: pos(m.d) + '%' }} title={m.w + ' · ' + m.l}></span>)}
        <span className="cl-tb__wkb" style={{ left: pos(today) + '%', width: pos(new Date(2026, 9, 24)) - pos(today) + '%' }}><em>{marks.filter((m) => m.d >= today && m.d - today <= 6048e5 * 1.2).length} this week</em></span>
        <span className="cl-tb__today" style={{ left: pos(today) + '%' }}><em>Today</em></span>
        <span className="cl-tb__lab is-s">Aug 18</span><span className="cl-tb__lab is-e">Dec 5</span>
      </div>
      <div className="cl-tb__soon">{soon.map((m, i) => <div key={i} className={'cl-tb__s is-' + m.k}><span className={'cl-tb__sd' + (m.c ? ' t-' + byId(m.c).tone : '')}></span><b>{m.w}</b><em>{m.l}</em></div>)}</div>
    </section>
  );
}

const PARSED = [
  { code: 'STAT 201', name: 'Probability and Statistics', days: 'Tue, Thu', time: '9:00–10:15 AM', room: 'Hanes Hall 120', prof: 'Dr. L. Osei', cr: 3, conf: 'high' },
  { code: 'ECON 310', name: 'Intermediate Macroeconomics', days: 'Mon, Wed', time: '10:10–11:25 AM', room: 'Gardner Hall 008', prof: 'Prof. M. Hart', cr: 3, conf: 'high' },
  { code: 'BUSI 401', name: 'Corporate Finance', days: 'Tue, Thu', time: '12:30–1:45 PM', room: 'McColl 2150', prof: 'Prof. A. Chen', cr: 3, conf: 'high' },
  { code: 'ENGL 105', name: 'Writing in the Disciplines', days: 'Mon, Wed, Fri', time: '1:25–2:15 PM', room: '', prof: 'Dr. R. Pike', cr: 3, conf: 'check', note: 'Room not found' },
  { code: 'EXSS 188', name: 'Golf Performance Lab', days: 'Fri', time: '8:00–9:15 AM', room: 'Finley GC', prof: '', cr: 1, conf: 'check', note: 'Professor not found' },
];
const ERR = {
  notSchedule: ['file-x', 'This doesn’t look like a class schedule', 'It reads as a receipt. Upload a screenshot of your class schedule from your student portal.', 'Choose another file'],
  tooLarge: ['file-warning', 'That image is too large', 'Upload an image under 12 MB. A screenshot of the schedule page is usually under 2 MB.', 'Choose another file'],
  unsupported: ['file-question', 'We can’t read that file type', 'Upload a PNG, JPG or WebP screenshot, a PDF, or paste the text.', 'Choose another file'],
  fault: ['cloud-off', 'Reading the schedule didn’t finish', 'The image reader timed out. Your schedule can still be added with Paste text.', 'Paste text instead'],
};
function ImportModal({ state: s0 = 'pick', onClose, onDone }) {
  const [s, setS] = React.useState(s0);
  const [tab, setTab] = React.useState(s0 === 'paste' ? 'paste' : 'file');
  const [rows, setRows] = React.useState(PARSED);
  React.useEffect(() => { if (s === 'reading' && s0 !== 'reading') { const t = setTimeout(() => setS('review'), 1800); return () => clearTimeout(t); } }, [s]);
  const e = ERR[s];
  const cr = rows.reduce((a, r) => a + r.cr, 0), dpw = new Set(rows.flatMap((r) => r.days.split(', '))).size;
  return (
    <div className="cl-scrim cl-scrim--c" onClick={onClose}><div className="cl-imp" role="dialog" aria-label="Import schedule" onClick={(ev) => ev.stopPropagation()}>
      <span className="rf-grab"></span>
      <div className="cl-imp__h"><div><b>{s === 'review' ? 'Review your schedule' : s === 'success' ? 'Schedule imported' : 'Import schedule'}</b><span>{s === 'review' ? 'Check each class before it goes on your calendar' : s === 'success' ? 'Your coach can plan around it now' : 'Screenshot, upload or paste your class schedule'}</span></div><button className="rf-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
      <div className="cl-imp__b">
        {(s === 'pick' || s === 'paste' || e) && <div className="cl-imp__tabs" role="tablist">{[['file', 'image', 'Screenshot or file'], ['paste', 'clipboard', 'Paste text']].map(([k, ic, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); if (e) setS('pick'); }}><Icon name={ic} size={14} />{l}</button>)}</div>}
        {s === 'pick' && tab === 'file' && <button className="cl-drop" onClick={() => setS('reading')}>
          <span className="cl-drop__art"><i></i><i></i><i></i><span><Icon name="upload" size={20} /></span></span>
          <b>Drop your schedule here</b><em>or click to choose · PNG, JPG, WebP, PDF or TXT · up to 12 MB</em>
          <span className="cl-drop__tip"><Icon name="lightbulb" size={13} />Tip: a screenshot of the week view in your student portal reads best.</span></button>}
        {tab === 'paste' && (s === 'pick' || s === 'paste') && <div className="cl-paste"><textarea className="rf-in" rows="8" defaultValue={'STAT 201 - Probability and Statistics\nTTh 9:00AM - 10:15AM\nHanes Hall 120\nDr. L. Osei'} aria-label="Paste your schedule" /><Button variant="primary" onClick={() => setS('reading')} leftIcon="sparkles">Read schedule</Button></div>}
        {s === 'reading' && <div className="cl-read">
          <div className="cl-read__doc"><span className="cl-read__scan"></span>{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ width: 50 + ((i * 37) % 45) + '%' }}></i>)}</div>
          <b>Reading your schedule…</b><span>Finding course codes, days, times and rooms</span>
          <div className="cl-read__steps">{['Image received', 'Finding classes', 'Matching times'].map((t, i) => <span key={t} style={{ animationDelay: i * .5 + 's' }}><Icon name="check" size={12} />{t}</span>)}</div></div>}
        {e && <div className="cl-err"><span className="cl-err__ic"><Icon name={e[0]} size={22} /></span><b>{e[1]}</b><p>{e[2]}</p><div className="cl-err__a"><Button variant="primary" onClick={() => { if (s === 'fault') setTab('paste'); setS('pick'); }}>{e[3]}</Button>{s !== 'fault' && <Button variant="ghost" onClick={() => { setTab('paste'); setS('pick'); }}>Paste text instead</Button>}</div></div>}
        {s === 'none' && <div className="cl-err"><span className="cl-err__ic is-n"><Icon name="search-x" size={22} /></span><b>No classes found</b><p>We read the file but couldn’t find course codes or times. Try pasting your schedule text again.</p><div className="cl-err__a"><Button variant="primary" onClick={() => { setTab('paste'); setS('pick'); }}>Paste text</Button></div></div>}
        {s === 'review' && <>
          <dl className="cl-rv__sum">{[['Classes', rows.length], ['Credits', cr], ['Days a week', dpw], ['Need a look', rows.filter((r) => r.conf === 'check').length]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <div className="cl-rv">{rows.map((r, i) => <div key={r.code} className={'cl-rv__r' + (r.conf === 'check' ? ' is-check' : '')}>
            <span className={'cl-rv__tab t-' + ['mist', 'clay', 'sand', 'stone', 'sage'][i % 5]}>{r.code.split(' ')[0]}<b>{r.code.split(' ')[1]}</b></span>
            <span className="cl-rv__b"><b>{r.name}</b><span>{r.days} · {r.time}{r.room ? ' · ' + r.room : ''}</span>{r.note && <em><Icon name="circle-alert" size={12} />{r.note} · tap to add</em>}</span>
            <span className="cl-rv__a"><button aria-label={'Edit ' + r.code}><Icon name="pencil" size={14} /></button><button aria-label={'Remove ' + r.code} onClick={() => setRows(rows.filter((x) => x !== r))}><Icon name="trash-2" size={14} /></button></span></div>)}</div>
        </>}
        {s === 'success' && <div className="cl-ok"><span className="cl-ok__ic"><Icon name="check" size={28} /></span><b>{rows.length} classes imported</b><p>They’re on your calendar and repeat weekly until Dec 5.</p>
          <div className="cl-ok__chips">{rows.map((r, i) => <span key={r.code} className={'t-' + ['mist', 'clay', 'sand', 'stone', 'sage'][i % 5]}>{r.code}</span>)}</div>
          <div className="cl-ok__warn"><Icon name="triangle-alert" size={15} /><span><b>2 conflicts found.</b> STAT 201 and BUSI 401 overlap the Pinehurst qualifier on Thu.</span></div></div>}
      </div>
      {s === 'review' && <div className="cl-imp__f"><Button variant="ghost" onClick={() => setS('pick')}>Start over</Button><Button variant="primary" leftIcon="check" onClick={() => setS('success')}>Import {rows.length} classes</Button></div>}
      {s === 'success' && <div className="cl-imp__f"><span></span><Button variant="primary" onClick={onDone || onClose}>View classes</Button></div>}
    </div></div>
  );
}

function SyncBtn({ state: s0 = 'ok' }) {
  const [s, setS] = React.useState(s0);
  const run = () => { setS('syncing'); setTimeout(() => setS(s0 === 'failed' ? 'failed' : 'ok'), 1600); };
  return (
    <div className={'cl-sync is-' + s}>
      <span className="cl-sync__st">{s === 'ok' ? <><i></i>Calendar synced · 2 min ago</> : s === 'syncing' ? <><span className="cl-sync__sp"></span>Syncing 5 classes…</> : <><Icon name="circle-alert" size={14} />1 class didn’t sync</>}</span>
      <Button leftIcon={s === 'failed' ? 'rotate-cw' : 'refresh-cw'} onClick={run} disabled={s === 'syncing'}>{s === 'failed' ? 'Retry sync' : 'Sync calendar'}</Button>
    </div>
  );
}

function EmptyClasses({ onImport, onAdd }) {
  return (
    <section className="cl-empty">
      <div className="cl-empty__art">{['mist', 'clay', 'sand'].map((t, i) => <span key={t} className={'cl-empty__card t-' + t} style={{ '--r': (i - 1) * 7 + 'deg', '--x': (i - 1) * 46 + 'px' }}><b></b><i></i><i></i></span>)}</div>
      <h2>Add your class schedule</h2>
      <p>Import a screenshot of your schedule and we’ll add every class. Your coach sees when you’re busy, so practice and travel get planned around class.</p>
      <div className="cl-empty__a"><Button variant="primary" size="lg" leftIcon="upload" onClick={onImport}>Import schedule</Button><Button size="lg" leftIcon="plus" onClick={onAdd}>Add a class</Button></div>
      <div className="cl-empty__how">{[['image', 'Screenshot your portal'], ['sparkles', 'We read the classes'], ['calendar-check', 'Review and import']].map(([ic, t], i) => <span key={t}><em>{i + 1}</em><Icon name={ic} size={15} />{t}</span>)}</div>
    </section>
  );
}

function ClassesPage({ initial = {} }) {
  const [open, setOpen] = React.useState(initial.open || null);
  const [add, setAdd] = React.useState(!!initial.add);
  const [imp, setImp] = React.useState(initial.imp || null);
  const [empty, setEmpty] = React.useState(!!initial.empty);
  const c = open && byId(open);
  const conflicts = C.filter((x) => GOLF.some((g) => g.days.some((d) => x.days.includes(d)) && g.s < x.e && x.s < g.e)).length;
  return (
    <div className="cl-wrap"><div className="cl-root"><div className="cl">
      <header className="cl-h"><div><span className="cl-k">Fall 2026 · Aug 18 – Dec 5</span><h1>Classes</h1></div><div className="cl-h__a">{!empty && <SyncBtn state={initial.sync} />}<Button leftIcon="upload" onClick={() => setImp('pick')}>Import schedule</Button><Button variant="primary" leftIcon="plus" onClick={() => setAdd(true)}>Add class</Button></div></header>
      {empty ? <EmptyClasses onImport={() => setImp('pick')} onAdd={() => setAdd(true)} /> : <><TermBar />
      <div className="cl-grid2">
        <div className="cl-deck">{C.map((x) => <Binder key={x.id} c={x} onOpen={setOpen} />)}<AddCard startOpen={initial.addOpen} /></div>
        <div className="cl-side"><Travel />
          <section className="cl-card cl-note"><Icon name="eye" size={16} /><div><b>What your coach sees</b><span>When you’re busy, never the class name or grades. Change it per class.</span></div></section></div>
      </div></>}
    </div></div>
      {c && <Detail c={c} onClose={() => setOpen(null)} />}
      {add && <AddClass onClose={() => setAdd(false)} />}
      {imp && <ImportModal state={imp} onClose={() => setImp(null)} onDone={() => { setImp(null); setEmpty(false); }} />}
    </div>
  );
}
Object.assign(window, { ClassesPage });
})();
