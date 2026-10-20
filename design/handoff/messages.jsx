(() => {
const { Icon, Button, IconButton, Avatar, Badge, Segmented, ModalShell, Input, TextArea, Switch, Checkbox, FormField } = window.FairwayClubhouseEdition_9c4f4d;
const M = window.MSG;
const REACTS = ['thumbs-up', 'heart', 'check', 'flag', 'eye'];

function Stack({ ids, size = 28 }) {
  const show = ids.filter((i) => i !== 'me').slice(0, 3);
  return <span className="ms-stack">{show.map((id, i) => <Avatar key={id} name={M.U[id]} size={size} />)}</span>;
}

function Rail({ convs, sel, onSel, filter, setFilter, q, setQ, onNew }) {
  const list = convs.filter((c) => (filter === 'unread' ? c.unread : filter === 'groups' ? c.group : true) && c.title.toLowerCase().includes(q.toLowerCase()));
  const sections = [['today', 'Today'], ['week', 'This week'], ['earlier', 'Earlier']];
  const unread = convs.reduce((a, c) => a + (c.unread ? 1 : 0), 0);
  return (
    <aside className="ms-rail">
      <div className="ms-rail__head">
        <div className="ms-rail__title"><h1>Messages</h1><IconButton icon="square-pen" label="New message" variant="secondary" onClick={onNew} /></div>
        <label className="ms-search"><Icon name="search" size={14} /><input placeholder="Search people and messages" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <Segmented size="sm" label="Filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread · ' + unread }, { value: 'groups', label: 'Groups' }]} />
      </div>
      <div className="ms-rail__body">
        {sections.map(([k, l]) => {
          const rows = list.filter((c) => c.section === k);
          if (!rows.length) return null;
          return (
            <section key={k} className="ms-sec">
              <div className="ms-sec__l">{l}</div>
              <div className="ms-sec__card">
                {rows.map((c) => (
                  <button key={c.id} className={'ms-row' + (c.unread ? ' is-unread' : '') + (sel === c.id ? ' is-sel' : '')} onClick={() => onSel(c.id)} aria-current={sel === c.id}>
                    {c.group ? <span className="ms-row__grp"><Icon name="users" size={15} /></span> : <Avatar name={c.title} size={36} />}
                    <span className="ms-row__main">
                      <span className="ms-row__top"><b>{c.title}</b><span className="fw-num">{c.time}</span></span>
                      <span className="ms-row__bot"><span>{c.preview[0] && <em>{c.preview[0]}: </em>}{c.preview[1]}</span>{c.unread > 0 && <span className="ms-count">{c.unread}</span>}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {!list.length && <div className="ms-empty">{q ? 'No one matches “' + q + '”' : 'Nothing unread. You are caught up.'}</div>}
      </div>
    </aside>
  );
}

function Bubble({ m, first, last, group, onReact, pick, setPick, idx }) {
  const mine = m.from === 'me';
  return (
    <div className={'ms-msg' + (mine ? ' is-mine' : '') + (last ? ' is-last' : '') + (first ? ' is-first' : '')}>
      {!mine && <span className="ms-msg__av">{last && <Avatar name={M.U[m.from]} size={30} />}</span>}
      <div className="ms-msg__col">
        {!mine && first && group && <span className="ms-msg__who">{M.U[m.from].split(' ')[0]}</span>}
        <div className="ms-msg__line">
          {m.text && <div className="ms-bub" onContextMenu={(e) => { e.preventDefault(); setPick(idx); }}>{m.text}</div>}
          {m.file && <div className="ms-bub ms-bub--file"><span className="ms-file__ic"><Icon name="file-text" size={16} /></span><span><b>{m.file.name}</b><span>{m.file.meta}</span></span><Icon name="download" size={15} /></div>}
          {m.card && <div className="ms-bub ms-bub--card"><span className="ms-card__k"><Icon name="calendar-days" size={13} />Event</span><b>{m.card.title}</b><span>{m.card.meta}</span><div className="ms-card__a"><Button size="sm">Open in calendar</Button></div></div>}
          <div className="ms-msg__tools">
            <button className="ms-tool" aria-label="React" onClick={() => setPick(pick === idx ? null : idx)}><Icon name="smile-plus" size={15} /></button>
            <button className="ms-tool" aria-label="Reply"><Icon name="reply" size={15} /></button>
          </div>
          {pick === idx && <div className="ms-reactbar fw-popover" role="menu">{REACTS.map((r) => <button key={r} className="ms-reactbar__b" onClick={() => { onReact(idx, r); setPick(null); }} aria-label={'React ' + r}><Icon name={r} size={16} /></button>)}</div>}
        </div>
        {m.react && <div className="ms-reacts">{m.react.map(([r, n, mineR]) => <button key={r} className={'ms-react' + (mineR ? ' is-mine' : '')} onClick={() => onReact(idx, r)}><Icon name={r} size={12} />{n}</button>)}</div>}
        {last && <span className="ms-msg__t fw-num">{m.t}{mine && m.seen ? ' · Seen' : ''}</span>}
      </div>
    </div>
  );
}

function Thread({ conv, msgs, onSend, onReact, detailsOpen, setDetails }) {
  const [draft, setDraft] = React.useState('');
  const [pick, setPick] = React.useState(null);
  const scroller = React.useRef(null);
  React.useLayoutEffect(() => { const s = scroller.current; if (!s) return; const pin = () => { s.scrollTop = s.scrollHeight; }; pin(); const r = requestAnimationFrame(pin); const t = setTimeout(pin, 250); return () => { cancelAnimationFrame(r); clearTimeout(t); }; }, [conv.id, msgs.length]);
  React.useEffect(() => { setPick(null); setDraft(''); }, [conv.id]);
  const send = () => { if (!draft.trim()) return; onSend(draft.trim()); setDraft(''); };
  const items = [];
  msgs.forEach((m, i) => {
    if (m.day) { items.push(<div key={'d' + i} className="ms-day"><span>{m.day}</span></div>); return; }
    const prev = msgs[i - 1], next = msgs[i + 1];
    const first = !prev || prev.day || prev.from !== m.from;
    const last = !next || next.day || next.from !== m.from;
    items.push(<Bubble key={i} idx={i} m={m} first={first} last={last} group={conv.group} onReact={onReact} pick={pick} setPick={setPick} />);
  });
  const typing = conv.id === 'team';
  return (
    <section className="ms-thread">
      <header className="ms-th">
        <div className="ms-th__who">
          {conv.group ? <span className="ms-row__grp ms-row__grp--lg"><Icon name="users" size={17} /></span> : <Avatar name={conv.title} size={38} />}
          <div><b>{conv.title}</b><span>{conv.group ? conv.members.length + ' members · ' + conv.members.filter((x) => x !== 'me').slice(0, 3).map((x) => M.U[x].split(' ')[0]).join(', ') + ' and more' : conv.sub}</span></div>
        </div>
        <div className="ms-th__act">
          <IconButton icon="calendar-plus" label="Schedule with this person" />
          <IconButton icon="search" label="Search in conversation" />
          <IconButton icon={conv.group ? 'users' : 'info'} label="Details" variant={detailsOpen ? 'secondary' : 'ghost'} onClick={() => setDetails(!detailsOpen)} />
        </div>
      </header>
      <div className="ms-scroll" ref={scroller} onClick={(e) => !e.target.closest('.ms-reactbar,.ms-tool') && setPick(null)}>
        <div className="ms-msgs">{items}
          {typing && <div className="ms-msg"><span className="ms-msg__av"><Avatar name={M.U.theo} size={30} /></span><div className="ms-msg__col"><div className="ms-typing" aria-label="Theo is typing"><i></i><i></i><i></i></div></div></div>}
        </div>
      </div>
      <footer className="ms-comp">
        <div className="ms-comp__field">
          <IconButton icon="paperclip" label="Attach a file" size="sm" />
          <textarea rows={1} placeholder={'Message ' + (conv.group ? conv.title : conv.title.split(' ')[0])} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}></textarea>
          <button className={'ms-send' + (draft.trim() ? ' is-ready' : '')} onClick={send} disabled={!draft.trim()} aria-label="Send"><Icon name="arrow-up" size={17} /></button>
        </div>
        <span className="ms-comp__hint">Enter to send · Shift + Enter for a new line</span>
      </footer>
    </section>
  );
}

function Details({ conv, onClose, toast }) {
  const [muted, setMuted] = React.useState(false);
  return (
    <aside className="ms-det">
      <div className="ms-det__head"><b>{conv.group ? 'Group details' : 'Details'}</b><IconButton icon="x" label="Close details" size="sm" onClick={onClose} /></div>
      <div className="ms-det__hero">
        {conv.group ? <span className="ms-row__grp ms-row__grp--xl"><Icon name="users" size={22} /></span> : <Avatar name={conv.title} size={64} />}
        <b>{conv.title}</b><span>{conv.group ? 'Team chat · created by you · Aug 18' : conv.sub}</span>
      </div>
      <div className="ms-det__sec"><Switch label="Mute notifications" checked={muted} onChange={setMuted} /></div>
      {conv.group && <div className="ms-det__sec">
        <div className="ms-det__l"><span>{conv.members.length} members</span><Button size="sm" variant="ghost" leftIcon="user-plus" onClick={() => toast('Only players and coaches on this team can be added', 'info')}>Add</Button></div>
        {conv.members.map((id) => <div key={id} className="ms-mem"><Avatar name={id === 'me' ? M.me.name : M.U[id]} size={30} /><span><b>{id === 'me' ? 'Maya Reyes (you)' : M.U[id]}</b><span>{id === 'me' ? 'Head coach' : id === 'dan' ? 'Assistant coach' : 'Player'}</span></span>{id === 'me' && <Badge tone="neutral">Admin</Badge>}</div>)}
      </div>}
      <div className="ms-det__sec">
        <div className="ms-det__l"><span>Shared files</span></div>
        <div className="ms-mem"><span className="ms-file__ic"><Icon name="file-text" size={15} /></span><span><b>Room list · Pinehurst.pdf</b><span>Today · 48 KB</span></span></div>
        <div className="ms-mem"><span className="ms-file__ic"><Icon name="file-text" size={15} /></span><span><b>Pairings and tee times.pdf</b><span>Yesterday · 84 KB</span></span></div>
      </div>
      {conv.group && <div className="ms-det__sec"><Button variant="danger" leftIcon="log-out">Leave group</Button></div>}
    </aside>
  );
}

function NewMessage({ open, onClose, onCreate }) {
  const [mode, setMode] = React.useState('direct');
  const [to, setTo] = React.useState([]);
  const [q, setQ] = React.useState('');
  const [urgent, setUrgent] = React.useState(false);
  const [ack, setAck] = React.useState(true);
  const people = Object.entries(M.U).filter(([, n]) => n.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id) => setTo(mode === 'direct' ? [id] : to.includes(id) ? to.filter((x) => x !== id) : [...to, id]);
  const label = mode === 'announce' ? 'Post announcement' : mode === 'group' ? 'Create group' : 'Start conversation';
  return (
    <ModalShell open={open} onClose={onClose} width={560} icon={mode === 'announce' ? 'megaphone' : 'square-pen'} title="New message" description={mode === 'announce' ? 'Goes to the whole team. Players can acknowledge it.' : 'Only players and coaches on Varsity can be messaged.'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={mode !== 'announce' && !to.length} onClick={() => onCreate(mode, to)}>{label}</Button></>}>
      <div className="ms-new">
        <Segmented label="Message type" value={mode} onChange={(v) => { setMode(v); setTo([]); }} options={[{ value: 'direct', label: 'Direct' }, { value: 'group', label: 'Group' }, { value: 'announce', label: 'Announcement' }]} />
        {mode !== 'announce' ? <>
          <label className="ms-search"><Icon name="search" size={14} /><input autoFocus placeholder="Find a player or coach" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {to.length > 0 && mode === 'group' && <div className="ms-to">{to.map((id) => <span key={id} className="ms-to__c"><Avatar name={M.U[id]} size={20} />{M.U[id].split(' ')[0]}<button onClick={() => toggle(id)} aria-label={'Remove ' + M.U[id]}><Icon name="x" size={12} /></button></span>)}</div>}
          <div className="ms-pick">
            {people.map(([id, n]) => { const on = to.includes(id); return (
              <button key={id} className="pp__row" aria-pressed={on} onClick={() => toggle(id)}>
                <Avatar name={n} size={28} /><span className="pp__name"><b>{n}</b><span>{id === 'dan' ? 'Assistant coach' : 'Player'}</span></span>
                {mode === 'group' ? <span className={'pp__box' + (on ? ' is-on' : '')}>{on && <Icon name="check" size={12} />}</span> : on ? <Icon name="check" size={15} /> : <span></span>}
              </button>); })}
          </div>
        </> : <>
          <FormField label="Title"><Input placeholder="Bus time moved to 6:00" /></FormField>
          <FormField label="Message"><TextArea rows={4} placeholder="What the team needs to know, and by when" /></FormField>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}><Switch label="Urgent" checked={urgent} onChange={setUrgent} /><Switch label="Ask players to acknowledge" checked={ack} onChange={setAck} /></div>
        </>}
      </div>
    </ModalShell>
  );
}

Object.assign(window, { MsgRail: Rail, MsgThread: Thread, MsgDetails: Details, MsgNew: NewMessage });
})();
