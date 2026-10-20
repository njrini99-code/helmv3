(() => {
const { Icon, Button, Avatar, Badge, Input, Segmented, Switch } = window.FairwayClubhouseEdition_9c4f4d;
const C = window.CAL;
const WEEK = [12, 13, 14, 15, 16, 17, 18];

function EventSheet({ e, onClose }) {
  const k = e.conflict && C.conflicts[e.conflict];
  const [yes, maybe, no, pend] = e.rsvp;
  return (
    <MSheet title={e.title} sub={C.dow(e.date) + ' ' + e.date + ' Oct · ' + C.range(e)} onClose={onClose} foot={<><Button fullWidth leftIcon="pencil">Edit</Button><Button fullWidth leftIcon="message-square">Message invitees</Button></>}>
      <div className="m-evk"><Badge tone={e.type === 'qualifier' || e.type === 'tournament' ? 'ink' : 'accent'}>{C.TYPES[e.type].label}</Badge>{e.recurring && <span><Icon name="repeat" size={13} />{e.recurring}</span>}</div>
      {k && <div className="m-conf"><div className="m-conf__h"><Icon name="triangle-alert" size={16} /><b>Schedule conflict</b></div><p>{k.text}</p><div className="m-conf__s">{k.suggestions.map(([a, b]) => <button key={a} className="m-slot">Move to {C.fmt(a, false)} – {C.fmt(b)}</button>)}</div></div>}
      <div className="m-kv"><Icon name="map-pin" size={16} /><span>{e.location}</span></div>
      {e.notes && <div className="m-kv"><Icon name="notebook-pen" size={16} /><span>{e.notes}</span></div>}
      <div className="m-rsvp dp-well-soft"><div><b>{yes}</b><em>Going</em></div><div><b>{maybe}</b><em>Maybe</em></div><div><b>{no}</b><em>No</em></div><div><b>{pend}</b><em>No reply</em></div></div>
      <div className="m-people">{e.people.map((id) => <span key={id} className="m-person"><Avatar name={C.person(id).name} size={28} />{C.person(id).name.split(' ')[0]}</span>)}</div>
    </MSheet>
  );
}
function NewSheet({ onClose }) {
  const [type, setType] = React.useState('practice');
  return (
    <MSheet title="New event" onClose={onClose} tall foot={<Button variant="primary" size="lg" fullWidth>Create and invite 6</Button>}>
      <div className="m-types">{['practice', 'qualifier', 'tournament', 'workout', 'meeting', 'travel'].map((t) => <button key={t} className="qm-chip" aria-pressed={type === t} onClick={() => setType(t)}><Icon name={C.TYPES[t].icon} size={14} />{C.TYPES[t].label}</button>)}</div>
      <Input placeholder="Title" defaultValue="Range and wedges" style={{ height: 44 }} />
      <div className="m-form">
        <div className="m-form__r"><span>Date</span><b>Wed 15 Oct</b></div>
        <div className="m-form__r"><span>Time</span><b>3:30 – 5:30 PM</b></div>
        <div className="m-form__r"><span>Repeat</span><b>Weekdays</b></div>
        <div className="m-form__r"><span>Location</span><b>Practice range</b></div>
        <div className="m-form__r"><span>Invite</span><b>Whole team · 6</b></div>
        <label className="m-form__r"><span>Check class schedules</span><Switch defaultChecked aria-label="Check class schedules" /></label>
      </div>
      <p className="qm-empty">Eli has CHEM 102 lab until 4:15 on Wednesday. He will be marked late.</p>
    </MSheet>
  );
}

function CalendarM({ initial = {} }) {
  const [view, setView] = React.useState(initial.view || 'day');
  const [day, setDay] = React.useState(C.today);
  const [ev, setEv] = React.useState(initial.ev || null);
  const [nw, setNw] = React.useState(!!initial.new);
  const list = C.events.filter((e) => e.date === day).sort((a, b) => (a.allDay ? -1 : a.start) - (b.allDay ? -1 : b.start));
  const e = ev && C.events.find((x) => x.id === ev);
  const month = Array.from({ length: 35 }, (_, i) => i - 2);
  return (
    <MApp tab="more" top={<MTop title="Calendar" back="More" right={<button className="qm-ib" aria-label="New event" onClick={() => setNw(true)}><Icon name="plus" size={21} /></button>} />}
      sheet={e ? <EventSheet e={e} onClose={() => setEv(null)} /> : nw ? <NewSheet onClose={() => setNw(false)} /> : null}>
      <div className="m-calhead"><h1>October</h1><Segmented size="sm" label="View" value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'month', label: 'Month' }, { value: 'list', label: 'List' }]} /></div>
      {view === 'day' && <>
        <div className="m-week">{WEEK.map((d) => { const n = C.events.filter((x) => x.date === d && x.type !== 'class').length; return <button key={d} className={'m-week__d' + (d === day ? ' is-on' : '') + (d === C.today ? ' is-today' : '')} onClick={() => setDay(d)}><em>{C.dow(d)[0]}</em><b>{d}</b><i>{Array.from({ length: Math.min(3, n) }).map((_, j) => <span key={j}></span>)}</i></button>; })}</div>
        <div className="m-dayk"><b>{C.dow(day)} {day} October</b><span>{list.filter((x) => x.type !== 'class').length} events · {list.filter((x) => x.type === 'class').length} classes</span></div>
        <div className="m-agenda">{list.map((x) => { const now = day === C.today && x.start <= C.nowH && x.end > C.nowH; const past = day === C.today && x.end <= C.nowH; return (
          <React.Fragment key={x.id}>
            {day === C.today && !past && !now && list.filter((y) => y.end <= C.nowH || (y.start <= C.nowH && y.end > C.nowH)).slice(-1)[0]?.id === list[list.indexOf(x) - 1]?.id && <div className="m-now"><span>{C.fmt(C.nowH)}</span></div>}
            <button className={'m-ev ev--' + x.type + (x.type === 'class' ? ' is-class' : '') + (past ? ' is-past' : '')} onClick={() => x.type !== 'class' && setEv(x.id)}>
              <span className="m-ev__t">{x.allDay ? 'All day' : C.fmt(x.start, false)}<em>{x.allDay ? '' : C.fmt(x.end, false)}</em></span>
              <span className="m-ev__b"><b>{x.title}</b><span>{x.type === 'class' ? C.person(x.owner).name.split(' ')[0] + '’s class · ' + x.location : x.location}</span></span>
              {x.conflict ? <span className="m-ev__w"><Icon name="triangle-alert" size={13} /></span> : now ? <Badge tone="accent">Now</Badge> : null}
            </button></React.Fragment>); })}</div>
      </>}
      {view === 'month' && <section className="qm-panel m-month">
        <div className="m-month__h">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="m-month__g">{month.map((d, i) => { const valid = d >= 1 && d <= 31; const evs = valid ? C.events.filter((x) => x.date === d && x.type !== 'class') : []; const major = evs.some((x) => x.type === 'qualifier' || x.type === 'tournament'); return (
          <button key={i} className={'m-month__c' + (valid ? '' : ' is-out') + (d === C.today ? ' is-today' : '') + (d === day ? ' is-on' : '')} onClick={() => valid && (setDay(d), setView('day'))}><b>{valid ? d : ''}</b>{major ? <i className="is-major"></i> : evs.length ? <i></i> : null}</button>); })}</div>
        <div className="m-month__lg"><span><i className="is-major"></i>Competition</span><span><i></i>Practice or meeting</span></div>
      </section>}
      {view === 'list' && [14, 15, 16, 17].map((d) => <section key={d} className="qm-panel"><div className="qm-panel__h"><b>{C.dow(d)} {d} Oct</b>{d === C.today && <Badge tone="accent">Today</Badge>}</div>
        {C.events.filter((x) => x.date === d && x.type !== 'class').sort((a, b) => (a.allDay ? -1 : a.start) - (b.allDay ? -1 : b.start)).map((x) => <button key={x.id} className="m-ag m-row--btn" onClick={() => setEv(x.id)}><span className="m-ag__t">{x.allDay ? 'All day' : C.fmt(x.start, false)}</span><i className={'m-ag__d dot-' + x.type}></i><span className="m-ag__b"><b>{x.title}</b><span>{x.location}</span></span></button>)}</section>)}
    </MApp>
  );
}
Object.assign(window, { CalendarM });
})();
