(() => {
const { Icon, Button, IconButton, Avatar, Badge, InlineNotice, PopoverPanel } = window.FairwayClubhouseEdition_9c4f4d;
const C = window.CAL;
const ev = (id) => C.events.find((e) => e.id === id);
const dayLabel = (d) => (d === C.today ? 'Today · ' : '') + C.dow(d) + ', ' + d + ' October';

function Fact({ icon, children }) { return <div className="in__fact"><Icon name={icon} size={15} /><div>{children}</div></div>; }

function Summary({ go }) {
  const today = C.events.filter((e) => e.date === C.today && e.type !== 'class').sort((a, b) => a.start - b.start);
  const next = today.find((e) => e.start > C.nowH);
  return (
    <div className="in">
      <div className="in__kick"><span className="muted">Today · Tue 14 Oct</span><span className="muted fw-num">2:40 PM</span></div>
      <h2 className="in__title">{today.length} team events today</h2>
      {next && <button className="h3-now__next" style={{ border: 0, font: 'inherit', textAlign: 'left' }} onClick={() => go({ kind: 'event', id: next.id })}>
        <span className="h3-now__at fw-num">{C.fmt(next.start, false)}</span>
        <div style={{ minWidth: 0 }}><div className="h3-now__a">{next.title}</div><div className="h3-now__b">{next.location} · in 50 min</div></div>
        <Icon name="arrow-right" size={15} />
      </button>}
      <div className="in__sec">
        <div className="in__sechead"><b>Needs attention</b><span>This week</span></div>
        <div>
          {Object.values(C.conflicts).map((k) => (
            <button key={k.id} className="in__need" onClick={() => go({ kind: 'conflict', id: k.id })}>
              <span className="ic"><Icon name="triangle-alert" size={14} /></span>
              <span style={{ minWidth: 0 }}><b>{ev(k.event).title}</b><span>{C.person(k.who).name.split(' ')[0]} overlaps · {C.dow(ev(k.event).date)} {C.fmt(k.overlap[0], false)}–{C.fmt(k.overlap[1])}</span></span>
              <Icon name="chevron-right" size={14} />
            </button>
          ))}
          <button className="in__need" onClick={() => go({ kind: 'event', id: 'e11' })}>
            <span className="ic ok"><Icon name="mail-question" size={14} /></span>
            <span style={{ minWidth: 0 }}><b>1 reply pending</b><span>Qualifier · Pinehurst No. 2 · Eli</span></span>
            <Icon name="chevron-right" size={14} />
          </button>
          <button className="in__need" onClick={() => go({ kind: 'event', id: 'e13' })}>
            <span className="ic ok"><Icon name="mail-question" size={14} /></span>
            <span style={{ minWidth: 0 }}><b>6 replies pending</b><span>Round review · Fri 17</span></span>
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      </div>
      <div className="in__sec">
        <div className="in__sechead"><b>Sources</b><span>Checked 2:38 PM</span></div>
        <div className="in__facts">
          <Fact icon="calendar-check">Team events from Helm</Fact>
          <Fact icon="book-open">Class schedules for 6 players</Fact>
          <Fact icon="lock">Your busy time · shown to others as Busy only</Fact>
        </div>
      </div>
    </div>
  );
}

function Responses({ r }) {
  const cells = [['Accepted', r[0]], ['Maybe', r[1]], ['No', r[2]], ['Pending', r[3]]];
  return (
    <dl className="in__resp" style={{ margin: 0 }}>
      {cells.map(([l, v], i) => <div key={l} className={i === 0 && v > 0 ? 'is-lead' : ''}><dt>{l}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

function EventDetail({ id, go, onEdit, toast }) {
  const e = ev(id);
  const [more, setMore] = React.useState(false);
  const k = e.conflict && C.conflicts[e.conflict];
  const status = (p, i) => (e.rsvp[3] > 0 && i >= e.people.length - e.rsvp[3] ? ['Pending', 'neutral'] : e.rsvp[1] > 0 && i >= e.people.length - e.rsvp[3] - e.rsvp[1] ? ['Maybe', 'warning'] : ['Going', 'accent']);
  return (
    <div className="in">
      <Button className="in__back" size="sm" variant="ghost" leftIcon="chevron-left" onClick={() => go(null)}>Today</Button>
      <div className="in__kick"><Badge tone={e.type === 'qualifier' || e.type === 'tournament' ? 'ink' : 'accent'}>{C.TYPES[e.type].label}</Badge>
        <div className="popwrap"><IconButton icon="ellipsis" label="More actions" size="sm" onClick={() => setMore(!more)} />
          {more && <PopoverPanel items={[{ label: 'Duplicate', icon: 'copy' }, { label: 'Copy link', icon: 'link' }, 'separator', { label: 'Cancel event', icon: 'circle-x', danger: true, onSelect: () => { setMore(false); toast('Event cancelled · attendees notified', 'circle-x'); } }]} />}
        </div>
      </div>
      <h2 className="in__title">{e.title}</h2>
      <div className="in__facts">
        <Fact icon="clock">{dayLabel(e.date)}<br /><span className="fw-num">{C.range(e)}</span> · Eastern</Fact>
        {e.location && <Fact icon="map-pin">{e.location}</Fact>}
        {e.recurring && <Fact icon="repeat">Repeats {e.recurring}</Fact>}
        {e.notes && <Fact icon="text">{e.notes}</Fact>}
      </div>
      {k && <InlineNotice tone="warning" title="Schedule overlap" action={<Button size="sm" variant="ghost" onClick={() => go({ kind: 'conflict', id: k.id })}>Review</Button>}>{k.text}</InlineNotice>}
      {e.people.length > 0 && <div className="in__sec">
        <div className="in__sechead"><b>Responses</b><span>{e.people.length} invited</span></div>
        <Responses r={e.rsvp} />
        <div className="in__people">
          {e.people.map((pid, i) => { const [l, t] = status(pid, i); return <div key={pid} className="in__person"><Avatar name={C.person(pid).name} size={26} /><span>{C.person(pid).name}</span><Badge tone={t} dot>{l}</Badge></div>; })}
        </div>
      </div>}
      {e.files && <div className="in__sec">
        <div className="in__sechead"><b>Files</b><span>{e.files.length}</span></div>
        <div>{e.files.map(([n, m]) => <div key={n} className="in__file"><span className="ic"><Icon name="file-text" size={14} /></span><span style={{ minWidth: 0 }}><b>{n}</b><span className="muted">{m}</span></span><IconButton icon="download" label={'Download ' + n} size="sm" /></div>)}</div>
      </div>}
      <div className="in__sec in__foot">
        <Button variant="primary" leftIcon="pencil" onClick={() => onEdit(e.id)}>Edit event</Button>
        {e.people.length > 0 && <Button leftIcon="clipboard-check" onClick={() => go({ kind: 'attendance', id: e.id })}>Attendance</Button>}
      </div>
    </div>
  );
}

function ClassDetail({ id, go, onFind }) {
  const e = ev(id); const p = C.person(e.owner);
  return (
    <div className="in">
      <Button className="in__back" size="sm" variant="ghost" leftIcon="chevron-left" onClick={() => go(null)}>Today</Button>
      <div className="in__kick"><Badge tone="neutral">Class</Badge><span className="muted">From {p.name.split(' ')[0]}'s class list</span></div>
      <div><h2 className="in__title">{e.title}</h2><div className="cal-sub">{p.name} · {p.year}</div></div>
      <div className="in__facts">
        <Fact icon="clock">{dayLabel(e.date)}<br /><span className="fw-num">{C.range(e)}</span> · Eastern</Fact>
        <Fact icon="map-pin">{e.location}</Fact>
        <Fact icon="user-round">{e.instructor}</Fact>
        <Fact icon="repeat">Meets {e.pattern} · {e.semester}</Fact>
      </div>
      <div className="in__sec">
        <div className="in__sechead"><b>This meeting</b></div>
        <div className="verify is-ok"><span className="ic"><Icon name="check" size={14} /></span>Scheduled. No exclusion on file for this date.</div>
      </div>
      <div className="in__sec"><p className="muted" style={{ margin: 0 }}>Teammates see this block as Busy, with no title or room.</p></div>
      <div className="in__sec in__foot"><Button leftIcon="users" onClick={onFind}>Compare schedules</Button></div>
    </div>
  );
}

function Attendance({ id, go, toast }) {
  const e = ev(id);
  const [marks, setMarks] = React.useState({});
  const [saved, setSaved] = React.useState({});
  const pending = Object.keys(marks).filter((k) => marks[k] !== saved[k]).length;
  const opts = [['present', 'Present', ''], ['late', 'Late', 'is-late'], ['no', 'No-show', 'is-no']];
  return (
    <div className="in">
      <Button className="in__back" size="sm" variant="ghost" leftIcon="chevron-left" onClick={() => go({ kind: 'event', id })}>{e.title}</Button>
      <div><h2 className="in__title">Attendance</h2><div className="cal-sub">{C.dow(e.date)} {e.date} · {C.range(e)}</div></div>
      <div className="in__sechead"><span>{e.people.length} invited · {Object.values(marks).filter((m) => m === 'present').length} present</span><Button size="sm" variant="ghost" onClick={() => setMarks(Object.fromEntries(e.people.map((p) => [p, 'present'])))}>Mark all present</Button></div>
      <div>
        {e.people.map((pid) => (
          <div key={pid} className="in__att">
            <span className="in__who"><Avatar name={C.person(pid).name} size={26} /><span>{C.person(pid).name.split(' ')[0]}<small>{marks[pid] && marks[pid] !== saved[pid] ? 'Unsaved' : saved[pid] ? 'Saved' : 'Going'}</small></span></span>
            <div className="dp-chips dp-well" role="radiogroup" aria-label={'Attendance for ' + C.person(pid).name}>
              {opts.map(([v, l, cls]) => <button key={v} className={'dp-chip ' + cls} aria-pressed={marks[pid] === v} onClick={() => setMarks({ ...marks, [pid]: v })}>{l}</button>)}
            </div>
          </div>
        ))}
      </div>
      <div className="in__sec in__foot">
        <Button variant="primary" disabled={!pending} onClick={() => { setSaved({ ...marks }); toast(pending + ' attendance marks saved', 'circle-check'); }}>{pending ? 'Save attendance · ' + pending : 'All saved'}</Button>
      </div>
    </div>
  );
}

function Lanes({ rows, from, to, prop }) {
  const pct = (h) => ((h - from) / (to - from)) * 100;
  const ticks = []; for (let h = Math.ceil(from); h <= to; h++) ticks.push(h);
  return (
    <div className="lanes">
      <span></span><div className="lanes__axis">{ticks.map((h) => <span key={h} style={{ left: pct(h) + '%' }}>{((h + 11) % 12) + 1}</span>)}</div>
      {rows.map((r) => (
        <React.Fragment key={r.who}>
          <span className="lanes__who">{r.who}</span>
          <div className="lane">
            {r.blocks.map((b, i) => <span key={i} className={'lane__b ' + b.kind} style={{ left: pct(b.s) + '%', width: (pct(b.e) - pct(b.s)) + '%' }}>{b.label}</span>)}
            {prop && <span className="lane__b is-prop" style={{ left: pct(prop[0]) + '%', width: (pct(prop[1]) - pct(prop[0])) + '%' }}></span>}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function ConflictDetail({ id, go, onEdit, toast }) {
  const k = C.conflicts[id]; const e = ev(k.event); const w = ev(k.with);
  const [pick, setPick] = React.useState(0);
  const prop = k.suggestions[pick];
  const first = C.person(k.who).name.split(' ')[0];
  return (
    <div className="in">
      <Button className="in__back" size="sm" variant="ghost" leftIcon="chevron-left" onClick={() => go(null)}>Today</Button>
      <div className="in__kick"><Badge tone="warning" dot>Overlap</Badge><span className="muted">Checked 2:38 PM</span></div>
      <div><h2 className="in__title">{e.title}</h2><div className="cal-sub">{C.dow(e.date)} {e.date} · {C.range(e)}</div></div>
      <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-secondary)', textWrap: 'pretty' }}>{k.text}</p>
      <div className="in__sec">
        <div className="in__sechead"><b>{first}'s afternoon</b><span>Current time and proposal</span></div>
        <Lanes from={13} to={20} prop={prop} rows={[
          { who: 'Current', blocks: [{ kind: 'is-ev', s: e.start, e: e.end, label: e.title }] },
          { who: w.type === 'class' ? 'Class' : w.title, blocks: [{ kind: w.type === 'class' ? 'is-busy' : 'is-ev', s: w.start, e: w.end, label: w.type === 'class' ? w.title : '' }, { kind: 'is-overlap', s: k.overlap[0], e: k.overlap[1], label: '' }] },
        ]} />
      </div>
      <div className="in__sec">
        <div className="in__sechead"><b>Open times</b><span>Everyone required is free</span></div>
        <div className="dp-chips dp-well" style={{ alignSelf: 'flex-start' }}>
          {k.suggestions.map((s, i) => <button key={i} className="dp-chip fw-num" aria-pressed={pick === i} onClick={() => setPick(i)}>{C.fmt(s[0], false)} – {C.fmt(s[1])}</button>)}
        </div>
      </div>
      <div className="in__sec in__foot">
        <Button variant="primary" onClick={() => onEdit(e.id, prop)}>Review new time</Button>
        <Button variant="ghost" onClick={() => { toast('Overlap kept · ' + first + ' will be notified', 'check'); go(null); }}>Keep as is</Button>
      </div>
    </div>
  );
}

Object.assign(window, { CalSummary: Summary, CalEventDetail: EventDetail, CalClassDetail: ClassDetail, CalAttendance: Attendance, CalConflict: ConflictDetail, CalLanes: Lanes });
})();
