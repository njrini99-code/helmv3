(() => {
const { Icon, Avatar, Badge, Switch } = window.FairwayClubhouseEdition_9c4f4d;
const M = window.MSG;
const SEC = { today: 'Today', week: 'This week', earlier: 'Earlier' };

function Inbox({ open }) {
  const [f, setF] = React.useState('all');
  const list = M.convs.filter((c) => f === 'all' || (f === 'unread' ? c.unread : c.group));
  return <>
    <div className="m-search"><Icon name="search" size={16} /><span>Search messages</span></div>
    <div className="m-types">{[['all', 'All'], ['unread', 'Unread · 4'], ['groups', 'Groups']].map(([k, l]) => <button key={k} className="qm-chip" aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}</div>
    {Object.keys(SEC).map((s) => { const cs = list.filter((c) => c.section === s); return cs.length ? <section key={s} className="m-inbox"><h3 className="qm-sec">{SEC[s]}</h3><div className="qm-panel">
      {cs.map((c) => <button key={c.id} className={'m-conv' + (c.unread ? ' is-unread' : '')} onClick={() => open(c.id)}>
        {c.group ? <span className="m-grp"><Icon name={c.id === 'travel' ? 'bus' : 'users'} size={18} /></span> : <Avatar name={c.title} size={44} />}
        <span className="m-conv__b"><span className="m-conv__t"><b>{c.title}</b><em>{c.time}</em></span><span className="m-conv__p">{c.preview[0] && <strong>{c.preview[0]}: </strong>}{c.preview[1]}</span></span>
        {c.unread ? <i className="m-unread">{c.unread}</i> : null}
      </button>)}</div></section> : null; })}
  </>;
}

function Thread({ id }) {
  const c = M.convs.find((x) => x.id === id), t = M.threads[id] || [];
  return <div className="m-thread">
    {t.map((m, i) => {
      if (m.day) return <div key={i} className="m-day"><span>{m.day}</span></div>;
      const mine = m.from === 'me', prev = t[i - 1], cont = prev && prev.from === m.from;
      return <div key={i} className={'m-msg' + (mine ? ' is-me' : '') + (cont ? ' is-cont' : '')}>
        {!mine && c.group && <span className="m-msg__av">{!cont && <Avatar name={M.U[m.from]} size={28} />}</span>}
        <div className="m-msg__col">
          {!mine && c.group && !cont && <span className="m-msg__n">{M.U[m.from].split(' ')[0]}</span>}
          {m.text && <div className="m-bub">{m.text}</div>}
          {m.card && <div className="m-bub m-bub--card"><Icon name="calendar-days" size={16} /><span><b>{m.card.title}</b><span>{m.card.meta}</span></span></div>}
          {m.file && <div className="m-bub m-bub--card"><Icon name="file-text" size={16} /><span><b>{m.file.name}</b><span>{m.file.meta}</span></span></div>}
          {m.react && <div className="m-react">{m.react.map(([ic, n]) => <span key={ic}><Icon name={ic} size={12} />{n}</span>)}</div>}
          {(!t[i + 1] || t[i + 1].from !== m.from) && <span className="m-msg__t">{m.t}</span>}
        </div>
      </div>;
    })}
  </div>;
}


function NewMessage({ onClose, onPick }) {
  const [to, setTo] = React.useState(['jonah']);
  const [q, setQ] = React.useState('');
  const people = Object.entries(M.U).filter(([id, n]) => !q || n.toLowerCase().includes(q.toLowerCase()));
  const tog = (id) => setTo(to.includes(id) ? to.filter((x) => x !== id) : [...to, id]);
  const role = (id) => id === 'dan' ? 'Assistant coach' : (M.convs.find((c) => c.id === id)?.sub || '').split(' · ')[0];
  return (
    <div className="qm fairway">
      <header className="qm-top"><button className="qm-back" onClick={onClose}>Cancel</button><b className="qm-top__c">New message</b><span className="qm-top__r"><button className={'qm-save' + (to.length ? '' : ' is-off')} onClick={() => to.length && onPick(to.length === 1 ? to[0] : 'team')}>{to.length > 1 ? 'Create group' : 'Next'}</button></span></header>
      <div className="m-to"><span className="m-to__k">To</span><div className="m-to__f">{to.map((id) => <button key={id} className="m-tok" onClick={() => tog(id)}>{M.U[id].split(' ')[0]}<Icon name="x" size={12} /></button>)}<input className="m-to__in" value={q} onChange={(e) => setQ(e.target.value)} placeholder={to.length ? '' : 'Name or group'} aria-label="Search people" /></div></div>
      <div className="qm-scroll">
        {!q && <><h3 className="qm-sec">Quick groups</h3><section className="qm-panel">
          {[['users', 'Whole team', '6 players · 2 coaches'], ['plane', 'Pinehurst travel squad', '5 players traveling Thursday'], ['user-round', 'Seniors', 'Theo, Sofia']].map(([ic, l, s]) => <button key={l} className="m-row m-row--btn"><span className="m-grp is-md"><Icon name={ic} size={16} /></span><span className="m-row__b"><b>{l}</b><span>{s}</span></span><Icon name="chevron-right" size={16} className="m-chev" /></button>)}</section></>}
        <h3 className="qm-sec">{q ? 'Results' : 'People'}</h3>
        <section className="qm-panel">{people.map(([id, n]) => { const on = to.includes(id); return <button key={id} className="m-row m-row--btn" onClick={() => tog(id)}><Avatar name={n} size={40} /><span className="m-row__b"><b>{n}</b><span>{role(id)}</span></span><span className={'m-check' + (on ? ' is-on' : '')}>{on && <Icon name="check" size={14} />}</span></button>; })}</section>
        {to.length > 1 && <p className="qm-empty m-hint">Messages to {to.length} people start a new group. You can name it after sending.</p>}
      </div>
      <div className="m-compose"><button className="qm-ib" aria-label="Attach"><Icon name="plus" size={20} /></button><div className="m-compose__f">{to.length ? 'Message ' + (to.length === 1 ? M.U[to[0]].split(' ')[0] : to.length + ' people') : 'Choose who to message'}</div><button className="m-send" aria-label="Send"><Icon name="arrow-up" size={17} /></button></div>
      <MSafari />
    </div>
  );
}

function Details({ c, onBack }) {
  const [mute, setMute] = React.useState(false);
  const members = c.group ? c.members : ['me', c.id];
  const th = M.threads[c.id] || [];
  let day = ''; const withDay = th.map((x) => (x.day ? (day = x.day, null) : { ...x, day })).filter(Boolean);
  const files = withDay.filter((x) => x.file).map((x) => [x.file.name, x.file.meta + ' · ' + x.day]);
  const PIN = { team: { title: 'Bus leaves at 6:15 sharp', sub: 'You · Yesterday · Breakfast on the bus.', icon: 'pin' } };
  const card = withDay.find((x) => x.card);
  const pin = PIN[c.id] || (card ? { title: card.card.title, sub: card.card.meta, icon: 'calendar-days' } : files[0] ? { title: files[0][0], sub: 'You · ' + files[0][1], icon: 'file-text' } : null);
  return (
    <MApp top={<MTop title="Details" back="Chat" onBack={onBack} right={c.group ? <button className="qm-save">Edit</button> : null} />}>
      <section className="m-prof">{c.group ? <span className="m-grp is-lg"><Icon name={c.id === 'travel' ? 'bus' : 'users'} size={28} /></span> : <Avatar name={c.title} size={72} />}<h1>{c.title}</h1><p>{c.group ? members.length + ' members · created by you' : c.sub}</p>
        <div className="m-dact">{[['phone', 'Call'], ['calendar-plus', 'Schedule'], [mute ? 'bell-off' : 'bell', mute ? 'Muted' : 'Mute'], ['search', 'Search']].map(([ic, l]) => <button key={l} className={'m-dact__b' + (l === 'Muted' ? ' is-on' : '')} onClick={() => (l === 'Mute' || l === 'Muted') && setMute(!mute)}><Icon name={ic} size={18} /><span>{l}</span></button>)}</div></section>
      {pin && <section className="qm-panel"><div className="qm-panel__h"><b>Pinned</b></div>
        <div className="m-row"><span className="m-pin"><Icon name={pin.icon} size={15} /></span><span className="m-row__b"><b>{pin.title}</b><span>{pin.sub}</span></span></div></section>}
      <section className="qm-panel"><div className="qm-panel__h"><b>{c.group ? 'Members' : 'People'}</b>{c.group && <span className="m-link">Add</span>}</div>
        {members.map((id) => <div key={id} className="m-row"><Avatar name={id === 'me' ? M.me.name : M.U[id]} size={36} /><span className="m-row__b"><b>{id === 'me' ? M.me.name + ' (you)' : M.U[id]}</b><span>{id === 'me' ? 'Head coach · Admin' : id === 'dan' ? 'Assistant coach · Admin' : (M.convs.find((x) => x.id === id)?.sub || 'Player').split(' · ')[0]}</span></span>{id !== 'me' && <button className="qm-ib" aria-label={'Message ' + M.U[id]}><Icon name="message-square" size={17} /></button>}</div>)}</section>
      <section className="qm-panel"><div className="qm-panel__h"><b>Files</b>{files.length > 0 && <span className="qm-empty">{files.length}</span>}</div>
        {files.length ? files.map(([n, s]) => <div key={n} className="m-row"><span className="m-pin"><Icon name="file-text" size={15} /></span><span className="m-row__b"><b>{n}</b><span>{s}</span></span></div>) : <p className="qm-empty m-none">No files shared yet.</p>}</section>
      <section className="qm-panel">
        <label className="m-form__r m-set"><span>Mute notifications</span><Switch checked={mute} onChange={() => setMute(!mute)} aria-label="Mute notifications" /></label>
        {c.group && <label className="m-form__r m-set"><span>Only coaches can post</span><Switch aria-label="Only coaches can post" /></label>}
        <button className="m-form__r m-set m-danger">{c.group ? 'Leave group' : 'Delete chat'}</button></section>
    </MApp>
  );
}

function MessagesM({ initial = {} }) {
  const [id, setId] = React.useState(initial.id || null);
  const [view, setView] = React.useState(initial.view || null);
  const c = id && M.convs.find((x) => x.id === id);
  if (view === 'new') return <NewMessage onClose={() => setView(null)} onPick={(x) => { setId(x); setView(null); }} />;
  if (c && view === 'details') return <Details c={c} onBack={() => setView(null)} />;
  if (!c) return <MApp tab="more" top={<MTop title="Messages" back="More" right={<button className="qm-ib" aria-label="New message" onClick={() => setView('new')}><Icon name="square-pen" size={20} /></button>} />}><Inbox open={setId} /></MApp>;
  return (
    <div className="qm fairway">
      <header className="qm-top m-thtop"><button className="qm-back" onClick={() => setId(null)}><Icon name="chevron-left" size={20} /></button>
        <span className="m-thtop__c" role="button" onClick={() => setView('details')}>{c.group ? <span className="m-grp is-sm"><Icon name={c.id === 'travel' ? 'bus' : 'users'} size={15} /></span> : <Avatar name={c.title} size={30} />}<span><b>{c.title}</b><em>{c.group ? c.members.length + ' members' : c.sub}</em></span></span>
        <span className="qm-top__r"><button className="qm-ib" aria-label="Details" onClick={() => setView('details')}><Icon name="info" size={20} /></button></span></header>
      <div className="qm-scroll m-thscroll" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}><Thread id={id} /></div>
      <div className="m-compose"><button className="qm-ib" aria-label="Attach"><Icon name="plus" size={20} /></button><div className="m-compose__f">{initial.draft || 'Message ' + (c.group ? c.title : c.title.split(' ')[0])}</div><button className={'m-send' + (initial.draft ? ' is-on' : '')} aria-label="Send"><Icon name="arrow-up" size={17} /></button></div>
      <MSafari />
    </div>
  );
}
Object.assign(window, { MessagesM });
})();
