(() => {
const { Icon, Button, Avatar, Badge, Switch } = window.FairwayClubhouseEdition_9c4f4d;
const H = window.HUB;
const pn = (id) => (H.players.find((p) => p[0] === id) || [id, id])[1];

function Pass({ t, big }) {
  return (
    <article className={'hb-trip2' + (big ? ' is-big' : '')}>
      <span className="hb-trip2__img" style={{ backgroundImage: `url(${t.img})` }}></span>
      <div className="hb-trip2__b">
        <span className="hb-eyebrow">Next trip · {t.dates}</span>
        <b>{t.name}</b><span className="hb-muted">{t.course} · {t.city}</span>
        <dl className="hb-trip2__f"><div><dt>Departs</dt><dd>{t.depart}</dd></div><div><dt>Stay</dt><dd>{t.hotel || 'Same day'}</dd></div><div><dt>Travelers</dt><dd>{t.travelers.length}</dd></div></dl>
        {big && t.plan.length > 0 && <ol className="hb-plan">{t.plan.map(([tm, l]) => <li key={tm}><span>{tm}</span><b>{l}</b></li>)}</ol>}
      </div>
    </article>
  );
}

const RSVPS = [
  { id: 'r1', d: 'Wed', n: 15, t: 'Course prep · 9 holes', m: '3:30 PM · Finley GC', c: [4, 1, 0, 1] },
  { id: 'r2', d: 'Thu', n: 16, t: 'Team dinner', m: '7:30 PM · Carolina Inn', c: [4, 0, 1, 1] },
  { id: 'r3', d: 'Fri', n: 17, t: 'Recovery nine', m: '3:30 PM · Finley GC', c: [3, 2, 0, 1] },
];
function Rsvps({ coach, empty }) {
  const [v, setV] = React.useState({ r1: 'going' });
  if (empty) return (
    <section className="hb-card hb-rsvp"><div className="hb-card__h"><h3>{coach ? 'RSVPs' : 'Your RSVPs'}</h3></div>
      <div className="hb-empty"><span className="hb-empty__ic"><Icon name="calendar-check" size={20} /></span><b>{coach ? 'No events need RSVPs' : 'You’re all caught up'}</b><span>{coach ? 'Events you create with RSVP on will show replies here.' : 'New team events that need a reply will show here.'}</span>{coach && <Button size="sm" leftIcon="plus">Create event</Button>}</div>
    </section>
  );
  return (
    <section className="hb-card hb-rsvp"><div className="hb-card__h"><h3>{coach ? 'RSVPs' : 'Your RSVPs'}</h3><span className="hb-muted">{coach ? 'This week' : RSVPS.filter((r) => !v[r.id]).length + ' need a reply'}</span></div>
      <ol>{RSVPS.map((r) => (
        <li key={r.id}><span className="hb-rsvp__d"><em>{r.d}</em><b>{r.n}</b></span><div><b>{r.t}</b><span>{r.m}</span></div>
          {coach ? <span className="hb-rsvp__c"><span className="hb-rsvp__bar">{[['going', 0], ['maybe', 1], ['no', 2], ['none', 3]].map(([k, i]) => <i key={k} className={'is-' + k} style={{ flex: r.c[i] }}></i>)}</span><em>{r.c[0]} going · {r.c[3]} no reply</em></span>
            : <span className="hb-rsvp__a" role="radiogroup" aria-label={'RSVP for ' + r.t}>{[['going', 'Going'], ['maybe', 'Maybe'], ['no', 'Can’t']].map(([k, l]) => <button key={k} role="radio" aria-checked={v[r.id] === k} onClick={() => setV({ ...v, [r.id]: k })}>{l}</button>)}</span>}
        </li>))}</ol>
    </section>
  );
}

function Ann({ a, coach, compact }) {
  const [ack, setAck] = React.useState(false);
  return (
    <article className={'hb-ann' + (a.pin ? ' is-pin' : '')}>
      {a.pin && <span className="hb-ann__pin"><Icon name="pin" size={12} />Pinned</span>}
      <div className="hb-ann__h"><Avatar name={a.by} size={32} /><div><b>{a.by}</b><span>{a.role} · {a.when}</span></div></div>
      <h4>{a.title}</h4>
      {!compact && <p>{a.body}</p>}
      <div className="hb-ann__f">
        {coach ? <span className="hb-reads"><span className="hb-reads__t"><i style={{ width: (a.ack[0] / a.ack[1]) * 100 + '%' }}></i></span>{a.ack[0]} of {a.ack[1]} {a.needAck ? 'acknowledged' : 'read'}</span>
          : a.needAck ? (ack ? <span className="hb-acked"><Icon name="check" size={13} />Acknowledged</span> : <Button size="sm" variant="primary" onClick={() => setAck(true)}>Got it</Button>) : <span className="hb-muted">{a.ack[0]} teammates read this</span>}
        {coach && <span className="hb-ann__act"><button aria-label="Edit"><Icon name="pencil" size={14} /></button><button aria-label="More"><Icon name="ellipsis" size={14} /></button></span>}
      </div>
    </article>
  );
}

function Feed({ list }) {
  return <section className="hb-card hb-feed"><div className="hb-card__h"><h3>Notifications</h3><span className="hb-count">{list.filter((n) => n.unread).length} new</span></div>
    <ol>{list.map((n) => <li key={n.id} className={n.unread ? 'is-new' : ''}><span className={'hb-feed__ic is-' + n.kind}><Icon name={n.icon} size={14} /></span><div><b>{n.t}</b><span>{n.b}</span></div><em>{n.when}</em></li>)}</ol></section>;
}

function Tasks({ coach }) {
  const [done, setDone] = React.useState(['t3']);
  return <section className="hb-card"><div className="hb-card__h"><h3>{coach ? 'Assigned tasks' : 'Your tasks'}</h3>{coach ? <Button size="sm" variant="ghost" leftIcon="plus">Assign</Button> : <span className="hb-muted">{H.tasks.length - done.length} open</span>}</div>
    <div className="hb-tasks">{H.tasks.map((t) => { const d = done.includes(t.id); return <div key={t.id} className={'hb-task' + (d ? ' is-done' : '')}>
      {coach ? <span className="hb-ring" style={{ '--p': (t.done[0] / t.done[1]) * 100 }}><b>{t.done[0]}/{t.done[1]}</b></span> : <button className="hb-check" aria-pressed={d} onClick={() => setDone(d ? done.filter((x) => x !== t.id) : [...done, t.id])} aria-label={t.t}>{d && <Icon name="check" size={13} />}</button>}
      <div><b>{t.t}</b><span>{t.for}</span></div><em className={t.due === 'Tomorrow' && !d ? 'is-soon' : ''}>{d && !coach ? 'Done' : t.due}</em></div>; })}</div></section>;
}

function Compose({ onClose }) {
  const [aud, setAud] = React.useState('all');
  const [ack, setAck] = React.useState(true);
  return (
    <section className="hb-card hb-compose">
      <div className="hb-card__h"><h3>New announcement</h3>{onClose && <button className="rf-x" onClick={onClose} aria-label="Close"><Icon name="x" size={14} /></button>}</div>
      <div className="hb-compose__b">
        <input className="rf-in hb-compose__t" placeholder="Headline" defaultValue="Bus leaves 15 minutes earlier on Thursday" />
        <textarea className="rf-in" rows="4" defaultValue="Traffic on 15-501 is slow in the mornings. We’ll leave Finley lot at 6:00 AM. Breakfast is still on the bus." />
        <div className="rf-field"><span>Send to</span><div className="hb-aud">{[['all', 'Whole team · 6'], ['travel', 'Pinehurst travelers · 5'], ['pick', 'Choose players']].map(([k, l]) => <button key={k} aria-pressed={aud === k} onClick={() => setAud(k)}>{l}</button>)}</div></div>
        <div className="hb-compose__o"><label><Switch checked={ack} onChange={() => setAck(!ack)} aria-label="Require acknowledgment" /><span>Ask players to acknowledge</span></label><label><Switch aria-label="Pin to top" /><span>Pin to the top</span></label><button className="hb-attach"><Icon name="paperclip" size={14} />Attach from Documents</button></div>
      </div>
      <div className="hb-compose__f"><span className="hb-muted">Players get a push notification</span><div><Button variant="ghost">Schedule</Button><Button variant="primary" leftIcon="send">Post</Button></div></div>
    </section>
  );
}

function TripBuilder() {
  const [sel, setSel] = React.useState(['theo', 'sofia', 'ava', 'eli', 'priya']);
  const [step, setStep] = React.useState(1);
  return (
    <section className="hb-card hb-build">
      <div className="hb-card__h"><div><h3>Plan a trip</h3><span className="hb-muted">Carolina Fall Invitational · Nov 3 – 5</span></div><span className="hb-steps">{['Event', 'Travelers', 'Logistics', 'Itinerary'].map((s, i) => <i key={s} className={i < step ? 'is-done' : i === step ? 'is-on' : ''}>{s}</i>)}</span></div>
      <div className="hb-build__b">
        <div className="rf-field"><span>Who’s traveling · {sel.length} of 5 spots</span><div className="hb-picks">{H.players.map(([id, n]) => { const on = sel.includes(id); return <button key={id} aria-pressed={on} onClick={() => setSel(on ? sel.filter((x) => x !== id) : [...sel, id])}><Avatar name={n} size={28} /><span>{n.split(' ')[0]}</span>{on && <Icon name="check" size={13} />}</button>; })}</div></div>
        <div className="hb-2"><label className="rf-field"><span>Depart</span><input className="rf-in" defaultValue="Mon Nov 3 · 12:00 PM" /></label><label className="rf-field"><span>From</span><input className="rf-in" defaultValue="Finley lot" /></label></div>
        <div className="hb-2"><label className="rf-field"><span>Hotel</span><input className="rf-in" defaultValue="Mid Pines Inn" /></label><label className="rf-field"><span>Rooms</span><input className="rf-in" defaultValue="3 · two to a room" /></label></div>
        <div className="hb-clash"><Icon name="triangle-alert" size={15} /><span><b>Eli has CHEM 102 lab</b> Mon 3:00–4:15. He’d miss it to travel.</span></div>
      </div>
      <div className="hb-compose__f"><Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))}>Back</Button><Button variant="primary" rightIcon="arrow-right" onClick={() => setStep(Math.min(3, step + 1))}>Next: {['Travelers', 'Logistics', 'Itinerary', 'Publish'][step]}</Button></div>
    </section>
  );
}

function Docs({ coach }) {
  const ic = { PDF: 'file-text', DOC: 'file-type', XLS: 'file-spreadsheet' };
  return (
    <div className="hb-docs">
      {coach && <button className="hb-drop"><span><Icon name="upload" size={18} /></span><b>Drop files to share with the team</b><em>PDF, DOC, XLS, images · players are notified</em></button>}
      {H.docs.map((f) => <section key={f.f} className="hb-card hb-folder"><div className="hb-card__h"><h3><Icon name="folder" size={16} />{f.f}</h3><span className="hb-muted">{f.items.length} files{coach ? ' · shared with all' : ''}</span></div>
        <div className="hb-files">{f.items.map(([n, t, s, d]) => <button key={n} className="hb-file"><span className={'hb-file__ic is-' + t.toLowerCase()}><Icon name={ic[t]} size={18} /><em>{t}</em></span><span className="hb-file__b"><b>{n}</b><span>{s} · {d}</span></span><Icon name="download" size={15} className="hb-muted" /></button>)}</div></section>)}
    </div>
  );
}

const TABS = { player: [['home', 'Home', 'house'], ['ann', 'Announcements', 'megaphone'], ['travel', 'Travel', 'plane'], ['docs', 'Documents', 'folder']],
  coach: [['home', 'Home', 'house'], ['ann', 'Announcements', 'megaphone'], ['travel', 'Travel', 'plane'], ['docs', 'Documents', 'folder'], ['tasks', 'Tasks', 'square-check']] };

function TeamHub({ role = 'player', initial = {} }) {
  const coach = role === 'coach';
  const [tab, setTab] = React.useState(initial.tab || 'home');
  const [compose, setCompose] = React.useState(!!initial.compose);
  const next = H.trips[0];
  return (
    <div className="hb-root"><div className="hb">
      <header className="hb-h">
        <div><span className="hb-role"><Icon name={coach ? 'clipboard-list' : 'user'} size={12} />{coach ? 'Coach view' : 'Player view'}</span><h1>Team Hub</h1><span className="hb-k">{H.team}</span></div>
        {coach && <div className="hb-h__a"><Button variant="primary" leftIcon="plus" onClick={() => { setTab('ann'); setCompose(true); }}>New announcement</Button></div>}
      </header>
      <nav className="hb-tabs" role="tablist">{TABS[role].map(([k, l, ic]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}><span>{l}</span></button>)}</nav>
      {tab === 'home' && <div className="hb-home">
        <div className="hb-col">
          <Rsvps coach={coach} empty={initial.emptyRsvp} />
          <Ann a={H.anns[0]} coach={coach} />
          <Pass t={next} />
        </div>
        <div className="hb-col">
          <section className="hb-card hb-feed"><div className="hb-card__h"><h3>Updates</h3><span className="hb-muted">{H.notifs.filter((n) => n.unread).length} new</span></div>
            <ol>{H.notifs.slice(0, 5).map((n) => <li key={n.id} className={n.unread ? 'is-new' : ''}><div><b>{n.t}</b><span>{n.b}</span></div><em>{n.when}</em></li>)}</ol></section>
          {!coach && <Tasks />}
        </div>
      </div>}
      {tab === 'ann' && <div className="hb-list">{coach && (compose ? <Compose onClose={() => setCompose(false)} /> : <button className="hb-new" onClick={() => setCompose(true)}><Avatar name="Maya Reyes" size={32} /><span className="hb-new__t">Write an announcement for the team…</span><Icon name="megaphone" size={16} /></button>)}{H.anns.map((a) => <Ann key={a.id} a={a} coach={coach} />)}</div>}
      {tab === 'travel' && <div className="hb-travel">{coach && <TripBuilder />}<Pass t={next} big />{H.trips.slice(1).map((t) => <div key={t.id} className="hb-trip"><span className="hb-trip__img" style={{ backgroundImage: `url(${t.img})` }}></span><div><b>{t.name}</b><span>{t.dates} · {t.course}</span></div>{coach ? <Badge tone={t.status === 'draft' ? 'neutral' : 'warning'}>{t.status === 'draft' ? 'Draft' : 'Planning'}</Badge> : <span className="hb-muted">{t.travelers.includes('theo') ? 'You’re traveling' : 'Not traveling'}</span>}</div>)}</div>}
      {tab === 'docs' && <Docs coach={coach} />}
      {tab === 'tasks' && <div className="hb-list"><Tasks coach /></div>}
    </div></div>
  );
}
Object.assign(window, { TeamHub });
})();
