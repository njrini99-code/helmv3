(() => {
const { ModalShell, Button, Input, TextArea, Switch, Checkbox, Icon, FormField, Avatar } = window.FairwayClubhouseEdition_9c4f4d;
const C = window.CAL;
const TYPES = ['practice', 'qualifier', 'tournament', 'workout', 'meeting', 'travel'];
const FROM = 7, TO = 20;

function busyFor(pid, date, ignoreId) {
  return C.events.filter((e) => e.date === date && !e.allDay && e.id !== ignoreId && ((e.type === 'class' && e.owner === pid) || (e.type !== 'class' && e.people && e.people.includes(pid))));
}

function FindTime({ people, date, win, setWin, ignoreId }) {
  const ref = React.useRef(null);
  const drag = React.useRef(null);
  const len = win[1] - win[0];
  const pct = (h) => ((h - FROM) / (TO - FROM)) * 100;
  const toH = (x) => { const r = ref.current.getBoundingClientRect(); const f = (x - r.left) / r.width; return Math.round((FROM + f * (TO - FROM)) * 4) / 4; };
  const clamp = (s) => Math.min(Math.max(s, FROM), TO - len);
  const onDown = (ev) => { ev.preventDefault(); const h = toH(ev.clientX); drag.current = h - win[0]; ev.currentTarget.setPointerCapture(ev.pointerId); };
  const onMove = (ev) => { if (drag.current == null) return; const s = clamp(toH(ev.clientX) - drag.current); if (s !== win[0]) setWin([s, s + len]); };
  const onUp = () => { drag.current = null; };
  const onLane = (ev) => { if (ev.target.closest('.ft__band')) return; const s = clamp(toH(ev.clientX) - len / 2); setWin([s, s + len]); };
  const ticks = []; for (let h = FROM; h <= TO; h += 2) ticks.push(h);
  const rows = people.slice(0, 6);
  return (
    <div className="ft">
      <div className="lanes">
        <span></span><div className="lanes__axis">{ticks.map((h) => <span key={h} style={{ left: pct(h) + '%' }}>{((h + 11) % 12) + 1}{h < 12 ? 'a' : 'p'}</span>)}</div>
        {rows.map((pid, i) => (
          <React.Fragment key={pid}>
            <span className="lanes__who">{C.person(pid).name.split(' ')[0]}</span>
            <div className="lane" ref={i === 0 ? ref : null} onPointerDown={onLane}>
              {busyFor(pid, date, ignoreId).map((b) => { const hit = b.start < win[1] && b.end > win[0]; return <span key={b.id} className={'lane__b ' + (b.type === 'class' ? 'is-busy' : 'is-ev')} style={{ left: pct(b.start) + '%', width: (pct(b.end) - pct(b.start)) + '%', boxShadow: hit ? 'inset 0 0 0 1.5px var(--chart-loss)' : undefined }}>{b.type === 'class' ? 'Class' : b.title}</span>; })}
              <span className="lane__b is-prop ft__band" style={{ left: pct(win[0]) + '%', width: (pct(win[1]) - pct(win[0])) + '%' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}></span>
            </div>
          </React.Fragment>
        ))}
      </div>
      {people.length > 6 && <div className="muted" style={{ marginTop: 8 }}>+{people.length - 6} more checked</div>}
    </div>
  );
}

function EventEditor({ open, onClose, editId, proposal, onSave }) {
  const base = editId ? C.events.find((e) => e.id === editId) : null;
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState('practice');
  const [date, setDate] = React.useState(15);
  const [win, setWin] = React.useState([15.5, 17.5]);
  const [allDay, setAllDay] = React.useState(false);
  const [repeat, setRepeat] = React.useState('none');
  const [loc, setLoc] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [people, setPeople] = React.useState(C.people.map((p) => p.id));
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    if (base) { setTitle(base.title); setType(base.type === 'class' ? 'practice' : base.type); setDate(base.date); setWin(proposal || [base.start ?? 8, base.end ?? 17]); setAllDay(!!base.allDay); setRepeat(base.recurring ? 'weekly' : 'none'); setLoc(base.location || ''); setNotes(base.notes || ''); setPeople(base.people || []); }
    else { setTitle(''); setType('practice'); setDate(15); setWin([13.25, 14.25]); setAllDay(false); setRepeat('none'); setLoc(''); setNotes(''); setPeople(C.people.map((p) => p.id)); }
    setBusy(false);
  }, [open, editId, proposal]);
  const clashes = allDay ? [] : people.filter((pid) => busyFor(pid, date, editId).some((b) => b.start < win[1] && b.end > win[0]));
  const moved = base && proposal && (proposal[0] !== base.start);
  const toggle = (pid) => setPeople(people.includes(pid) ? people.filter((p) => p !== pid) : [...people, pid]);
  const when = C.dow(date) + ' ' + date + ' Oct · ' + (allDay ? 'All day' : C.fmt(win[0], false) + ' – ' + C.fmt(win[1]));
  const primary = !base ? 'Publish event' : moved ? 'Move event' : 'Save changes';
  return (
    <ModalShell open={open} onClose={onClose} width={1040} icon={base ? 'pencil' : 'calendar-plus'} title={base ? 'Edit event' : 'New event'} description={base ? 'Changes notify everyone invited.' : 'Invited players get a notification and can reply.'}
      note={<span className="muted">{people.length ? 'Attendees will be notified' : 'No one invited yet'}</span>}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!title.trim()} onClick={() => { setBusy(true); setTimeout(() => onSave(primary, title), 700); }}>{busy ? (base ? 'Saving…' : 'Publishing…') : primary}</Button></>}>
      <div className="ed">
        <div className="ed__col">
          <input className="ed__title" placeholder="Event title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <div>
            <span className="ed__lbl">Type</span>
            <div className="dp-chips dp-well ed__types" role="radiogroup" aria-label="Event type">
              {TYPES.map((t) => <button key={t} className="dp-chip" aria-pressed={type === t} onClick={() => setType(t)}><Icon name={C.TYPES[t].icon} size={13} />{C.TYPES[t].label}</button>)}
            </div>
          </div>
          <div>
            <span className="ed__lbl">When</span>
            <div className="ed__row">
              <Input leftIcon="calendar" value={C.dow(date) + ', ' + date + ' October'} onChange={() => {}} />
              <Input leftIcon="clock" value={allDay ? '—' : C.fmt(win[0])} disabled={allDay} onChange={() => {}} />
              <Input value={allDay ? '—' : C.fmt(win[1])} disabled={allDay} onChange={() => {}} suffix={allDay ? null : Math.round((win[1] - win[0]) * 60) + ' min'} />
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Switch label="All day" checked={allDay} onChange={setAllDay} />
              <div className="dp-chips dp-well" role="radiogroup" aria-label="Repeat">
                {[['none', 'Once'], ['weekly', 'Weekly'], ['weekdays', 'Weekdays']].map(([v, l]) => <button key={v} className="dp-chip" aria-pressed={repeat === v} onClick={() => setRepeat(v)}>{l}</button>)}
              </div>
            </div>
          </div>
          <FormField label="Location"><Input leftIcon="map-pin" placeholder="Practice green, Finley GC…" value={loc} onChange={(e) => setLoc(e.target.value)} /></FormField>
          <FormField label="Notes" optional><TextArea rows={3} placeholder="What to bring, what you'll work on" value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
        </div>
        <div className="ed__col">
          <div>
            <div className="in__sechead" style={{ marginBottom: 6 }}><span className="ed__lbl" style={{ margin: 0 }}>Invite · {people.length} of {C.people.length}</span><Button size="sm" variant="ghost" onClick={() => setPeople(people.length === C.people.length ? [] : C.people.map((p) => p.id))}>{people.length === C.people.length ? 'Clear' : 'Select all'}</Button></div>
            <div className="ed__inv dp-well-soft">
              {C.people.map((p) => <Checkbox key={p.id} checked={people.includes(p.id)} onChange={() => toggle(p.id)} label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={p.name} size={22} />{p.name}</span>} description={clashes.includes(p.id) ? 'Busy at this time' : undefined} />)}
            </div>
          </div>
          {!allDay && people.length > 0 && <div>
            <div className="in__sechead" style={{ marginBottom: 10 }}><span className="ed__lbl" style={{ margin: 0 }}>Find a time · {C.dow(date)} {date}</span><span className="muted">Drag the band</span></div>
            <FindTime people={people} date={date} win={win} setWin={setWin} ignoreId={editId} />
          </div>}
          <div className={'verify ' + (clashes.length ? 'is-warn' : 'is-ok')}>
            <span className="ic"><Icon name={clashes.length ? 'triangle-alert' : 'check'} size={14} /></span>
            <span>{clashes.length ? clashes.map((p) => C.person(p).name.split(' ')[0]).join(', ') + (clashes.length > 1 ? ' are' : ' is') + ' busy at this time.' : people.length ? 'Everyone invited is free. Checked against classes and team events.' : 'Invite players to check their schedules.'}</span>
          </div>
          <dl className="rcpt">
            <dt>What</dt><dd>{title || '—'} · {C.TYPES[type].label}</dd>
            <dt>When</dt><dd className="fw-num">{when}{moved ? <span className="muted"> · was {C.fmt(base.start, false)} – {C.fmt(base.end)}</span> : null}</dd>
            <dt>Where</dt><dd>{loc || '—'}</dd>
            <dt>Who</dt><dd>{people.length === C.people.length ? 'Whole team · 6 players' : people.length ? people.map((p) => C.person(p).name.split(' ')[0]).join(', ') : '—'}</dd>
            <dt>Repeats</dt><dd>{repeat === 'none' ? 'Does not repeat' : repeat === 'weekly' ? 'Weekly on ' + C.dow(date) : 'Every weekday'}</dd>
          </dl>
        </div>
      </div>
    </ModalShell>
  );
}

function SubscribeModal({ open, onClose, toast }) {
  const feeds = [['Team schedule', 'Every team event, classes excluded', 'hx_7Kq…4mZ'], ['Tournaments and qualifiers', 'Competition days only', 'hx_2Pa…9rT'], ['My schedule', 'Events you are invited to and your busy time', 'hx_Lm3…0sW']];
  return (
    <ModalShell open={open} onClose={onClose} width={560} icon="rss" title="Add to your calendar app" description="One-way: changes in Helm appear in Apple, Google or Outlook within an hour. Edits made there do not come back."
      footer={<Button onClick={onClose}>Done</Button>}>
      <div className="feeds">
        {feeds.map(([n, d, t]) => (
          <div key={n} className="feed">
            <div style={{ minWidth: 0 }}><b>{n}</b><span className="muted">{d}</span><div><code>webcal://golfhelm.app/f/{t}</code></div></div>
            <Button size="sm" leftIcon="copy" onClick={() => toast('Link copied · ' + n, 'copy')}>Copy link</Button>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

Object.assign(window, { EventEditor, SubscribeModal });
})();
