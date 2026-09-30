(() => {
const { Icon, Button, IconButton, Avatar, Badge, Segmented, ModalShell, Input, PopoverPanel, FormField } = window.FairwayClubhouseEdition_9c4f4d;
const R = window.ROSTER;
const toPar = (v) => (v === 0 ? 'E' : (v > 0 ? '+' : '−') + Math.abs(v));
const sgn = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
const hcp = (v) => (v < 0 ? '+' + Math.abs(v).toFixed(1) : v.toFixed(1));

function mono(pts) {
  const n = pts.length; if (n < 2) return '';
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = 'M' + pts[0][0] + ',' + pts[0][1];
  for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`; }
  return d;
}
function FormLine({ data, w = 120, h = 30 }) {
  if (data.length < 3) return <span className="rs-early">Early read</span>;
  const lo = Math.min(...data) - 0.6, hi = Math.max(...data) + 0.6, pad = 4;
  const pts = data.map((v, i) => [pad + (i * (w - pad * 2)) / (data.length - 1), pad + ((v - lo) / (hi - lo)) * (h - pad * 2)]);
  const mean = data.reduce((a, b) => a + b, 0) / data.length, my = pad + ((mean - lo) / (hi - lo)) * (h - pad * 2);
  const ch = data[data.length - 1] - data[0];
  const tone = ch < -0.5 ? 'var(--chart-gain)' : ch > 0.5 ? 'var(--chart-loss)' : 'var(--ink-400)';
  const d = mono(pts); const [ex, ey] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: 'block' }}>
      <line x1={pad} x2={w - pad} y1={my} y2={my} stroke="var(--ivory-300)" strokeDasharray="2 3" />
      <path d={d + ` L${ex},${h} L${pad},${h} Z`} fill={tone} opacity=".06" />
      <path d={d} fill="none" stroke={tone} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={ex} cy={ey} r="3" fill="var(--bg-surface)" stroke={tone} strokeWidth="1.5" />
    </svg>
  );
}

function useFixedPop(ref, open, align) {
  const [pos, setPos] = React.useState(null);
  React.useLayoutEffect(() => {
    if (!open || !ref.current) { setPos(null); return; }
    const place = () => {
      const r = ref.current.getBoundingClientRect();
      const W = 230, H = align === 'end' ? 190 : 110, vw = window.innerWidth, vh = window.innerHeight;
      let left = align === 'end' ? r.right - W : r.left;
      left = Math.max(8, Math.min(left, vw - W - 8));
      const up = r.bottom + 6 + H > vh - 8;
      setPos(up ? { position: 'fixed', left, bottom: vh - r.top + 6, top: 'auto', right: 'auto' } : { position: 'fixed', left, top: r.bottom + 6, right: 'auto' });
    };
    place();
    window.addEventListener('resize', place); document.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [open]);
  return pos;
}

function StatusPill({ p, onSet }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => { if (!open) return; const f = (e) => !ref.current?.contains(e.target) && setOpen(false); document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, [open]);
  const pos = useFixedPop(ref, open, 'start');
  return (
    <span className="popwrap" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className={'rs-status is-' + p.status} onClick={() => setOpen(!open)} aria-haspopup="true" aria-expanded={open} aria-label={'Player status: ' + p.status + '. Change status.'}>
        <i></i>{p.status === 'active' ? 'Active' : 'Inactive'}<Icon name="chevron-down" size={12} />
      </button>
      {open && pos && <PopoverPanel label="Set status" style={pos} items={[{ label: 'Active', icon: p.status === 'active' ? 'check' : 'circle', onSelect: () => { setOpen(false); onSet(p.id, 'active'); } }, { label: 'Inactive', icon: p.status === 'inactive' ? 'check' : 'circle', onSelect: () => { setOpen(false); onSet(p.id, 'inactive'); } }]} />}
    </span>
  );
}

function RowMenu({ p, onRemove, toast }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => { if (!open) return; const f = (e) => !ref.current?.contains(e.target) && setOpen(false); document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, [open]);
  const pos = useFixedPop(ref, open, 'end');
  return (
    <span className="popwrap" ref={ref} onClick={(e) => e.stopPropagation()}>
      <IconButton icon="ellipsis" label={'Actions for ' + p.name} size="sm" onClick={() => setOpen(!open)} />
      {open && pos && <PopoverPanel style={pos} items={[{ label: 'View insights', icon: 'sparkles' }, { label: 'View stats', icon: 'chart-column', onSelect: () => (location.href = 'Coach - Stats.html?player=' + p.id) }, { label: 'Message', icon: 'message-square', onSelect: () => (location.href = 'Coach - Messages.html') }, 'separator', { label: 'Remove from team', icon: 'user-minus', danger: true, onSelect: () => { setOpen(false); onRemove(p); } }]} />}
    </span>
  );
}

function Requests({ reqs, onDecide }) {
  if (!reqs.length) return null;
  return (
    <section className="rs-req">
      <div className="rs-req__head"><span className="rs-req__ic"><Icon name="user-plus" size={15} /></span><b>{reqs.length} {reqs.length === 1 ? 'player wants' : 'players want'} to join {R.team}</b><span className="muted">Approving adds them to the roster and team chat.</span></div>
      {reqs.map((r) => (
        <div key={r.id} className="rs-req__row">
          <Avatar name={r.name} size={32} />
          <span className="rs-req__who"><b>{r.name}</b><span>{r.meta} · HCP {r.hcp}</span></span>
          <div className="rs-req__act"><Button size="sm" variant="ghost" onClick={() => onDecide(r, false)}>Decline</Button><Button size="sm" variant="primary" onClick={() => onDecide(r, true)}>Approve</Button></div>
        </div>
      ))}
    </section>
  );
}

function Faces({ rows, sel, onSel, onSet }) {
  return (
    <div className="rs-faces">
      {rows.map((p) => (
        <button key={p.id} className={'rs-face' + (sel === p.id ? ' is-sel' : '') + (p.status === 'inactive' ? ' is-off' : '')} onClick={() => onSel(sel === p.id ? null : p.id)}>
          <span className="rs-face__top">{p.role ? <span className="rs-face__role"><Icon name="star" size={11} />{p.role}</span> : <span></span>}<span className={'rs-face__dot is-' + p.status} aria-label={p.status}></span></span>
          <span className="rs-face__av"><Avatar name={p.name} size={76} /></span>
          <span className="rs-face__name">{p.name}</span>
          <span className="rs-face__meta">{p.year} · {p.home}</span>
          <span className="rs-face__form"><FormLine data={p.trend} w={150} h={30} /></span>
          <span className="rs-face__figs"><span><b className="fw-num">{p.avg.toFixed(1)}</b>Avg</span><span><b className={'fw-num ' + (p.sg == null ? '' : p.sg >= 0 ? 'is-gain' : 'is-loss')}>{sgn(p.sg)}</b>SG</span><span><b className="fw-num">{hcp(p.hcp)}</b>HCP</span></span>
          {p.attn && <span className={'rs-face__note is-' + p.attn}>{p.note}</span>}
        </button>
      ))}
    </div>
  );
}

function Peek({ p, onClose, onSet }) {
  if (!p) return null;
  const figs = [['Scoring avg', p.avg.toFixed(1)], ['Handicap', hcp(p.hcp)], ['SG / round', sgn(p.sg)], ['Rounds', p.rounds]];
  return (
    <aside className="rs-peek" aria-label={p.name}>
      <div className="rs-peek__top"><StatusPill p={p} onSet={onSet} /><IconButton icon="x" label="Close" size="sm" onClick={onClose} /></div>
      <div className="rs-peek__hero">
        <span className="rs-peek__av"><Avatar name={p.name} size={96} /></span>
        <h2>{p.name}</h2>
        <span className="rs-peek__sub">{p.role ? p.role + ' · ' : ''}{p.year} · Class of {p.cls}</span>
        <p className="rs-peek__about">{p.about}</p>
        <div className="rs-peek__quick"><Button size="sm" leftIcon="message-square" onClick={() => (location.href = 'Coach - Messages.html')}>Message</Button><Button size="sm" leftIcon="calendar-plus">Schedule 1:1</Button></div>
      </div>
      <dl className="rs-peek__facts">
        <div><dt><Icon name="map-pin" size={13} />Hometown</dt><dd>{p.home}</dd></div>
        <div><dt><Icon name="flag" size={13} />Home course</dt><dd>{p.course}</dd></div>
        <div><dt><Icon name="graduation-cap" size={13} />Major</dt><dd>{p.major}</dd></div>
        <div><dt><Icon name="cake" size={13} />Birthday</dt><dd>{p.bday}</dd></div>
      </dl>
      <dl className="rs-peek__figs">{figs.map(([l, v]) => <div key={l}><dt>{l}</dt><dd className="fw-num">{v}</dd></div>)}</dl>
      <div className="rs-peek__sec">
        <div className="rs-peek__l"><b>Form</b><span>Last {p.trend.length} rounds · dashed line is the average</span></div>
        <FormLine data={p.trend} w={292} h={64} />
        <p className="rs-peek__note">{p.note}.</p>
      </div>
      <div className="rs-peek__sec">
        <div className="rs-peek__l"><b>Recent rounds</b><span>Countable only</span></div>
        {p.last.map(([c, d, s, tp]) => <div key={c + d} className="rs-peek__rd"><span><b>{c}</b><span>{d}</span></span><span className="fw-num">{s}</span><span className={'fw-num rs-topar' + (tp < 0 ? ' is-under' : '')}>{toPar(tp)}</span></div>)}
      </div>
      <div className="rs-peek__sec">
        <div className="rs-peek__l"><b>Development</b></div>
        <div className="rs-peek__dev"><span><b className="fw-num">{p.focus}</b> focus {p.focus === 1 ? 'area' : 'areas'}</span><span><b className="fw-num">{p.goals}</b> {p.goals === 1 ? 'goal' : 'goals'}</span></div>
      </div>
      <div className="rs-peek__sec">
        <div className="rs-peek__l"><b>Coach's note</b><span>Only coaches see this</span></div>
        <textarea className="rs-peek__memo" rows={2} defaultValue={p.id === 'jonah' ? 'Confidence dips after a bad hole. Keep 1:1s short and specific.' : ''} placeholder={'Something to remember about ' + p.name.split(' ')[0]}></textarea>
      </div>
      <div className="rs-peek__foot"><Button variant="primary" rightIcon="arrow-right" onClick={() => (location.href = 'Coach - Stats.html?player=' + p.id)}>Open full profile</Button></div>
      <span className="rs-peek__since">{p.since}</span>
    </aside>
  );
}

function InviteModal({ open, onClose, toast }) {
  return (
    <ModalShell open={open} onClose={onClose} width={520} icon="user-plus" title="Invite players" description={'Players join ' + R.team + ' with the code or link. You approve each request.'}
      footer={<Button onClick={onClose}>Done</Button>}>
      <div className="rs-inv">
        <div className="rs-inv__code"><span className="muted">Join code</span><b className="fw-num">{R.code}</b><Button size="sm" leftIcon="copy" onClick={() => toast('Join code copied', 'copy')}>Copy</Button></div>
        <FormField label="Or send an invite" help="They get a link that opens the join request with your team filled in."><div style={{ display: 'flex', gap: 8 }}><Input leftIcon="mail" placeholder="player@email.com" /><Button variant="primary" onClick={() => toast('Invite sent', 'send')}>Send</Button></div></FormField>
      </div>
    </ModalShell>
  );
}

function RemoveModal({ p, onClose, onConfirm }) {
  return (
    <ModalShell open={!!p} onClose={onClose} width={460} icon="user-minus" title="Remove player?" description={p ? 'Remove ' + p.name + ' from ' + R.team + '? They can rejoin later with the team code.' : ''}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={onConfirm}>Remove player</Button></>}>
      <p className="rs-remove">Their account and stats are not deleted. This only removes them from your active roster.</p>
    </ModalShell>
  );
}

function Roster({ toast }) {
  const [players, setPlayers] = React.useState(R.players);
  const [reqs, setReqs] = React.useState(R.requests);
  const [sort, setSort] = React.useState('avg');
  const [view, setView] = React.useState(() => localStorage.getItem('rs-view') || 'faces');
  const [show, setShow] = React.useState('active');
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(null);
  const [invite, setInvite] = React.useState(false);
  const [remove, setRemove] = React.useState(null);
  const setStatus = (id, s) => { setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, status: s } : p))); toast(players.find((p) => p.id === id).name.split(' ')[0] + "'s status changed to " + (s === 'active' ? 'Active' : 'Inactive'), 'circle-check'); };
  const active = players.filter((p) => p.status === 'active');
  let rows = players.filter((p) => (show === 'all' || p.status === show) && p.name.toLowerCase().includes(q.trim().toLowerCase()));
  rows = [...rows].sort((a, b) => sort === 'name' ? a.name.split(' ')[1].localeCompare(b.name.split(' ')[1]) : sort === 'avg' ? a.avg - b.avg : sort === 'hcp' ? a.hcp - b.hcp : b.rounds - a.rounds);
  const attn = players.filter((p) => p.attn && p.status === 'active');
  const cur = players.find((p) => p.id === sel);
  return (
    <div className="rs">
      <header className="rs-head">
        <div><span className="rs-team"><span className="rs-team__stack">{players.filter((p) => p.status === 'active').slice(0, 7).map((p) => <Avatar key={p.id} name={p.name} size={30} />)}</span><span className="h3-head__date">{R.team} · Fall 2026</span></span><h1>Your players.</h1><p>{players.length} players · {active.length} active. Team average {(active.reduce((a, p) => a + p.avg, 0) / active.length).toFixed(1)} over the season.</p></div>
        <div className="rs-head__act"><Button leftIcon="download" variant="ghost" onClick={() => toast('Roster exported as CSV', 'download')}>Export</Button><Button variant="primary" leftIcon="user-plus" onClick={() => setInvite(true)}>Invite players</Button></div>
      </header>
      <Requests reqs={reqs} onDecide={(r, ok) => { setReqs(reqs.filter((x) => x.id !== r.id)); toast(ok ? r.name + ' added to ' + R.team : 'Request from ' + r.name + ' declined', ok ? 'user-check' : 'x'); }} />
      {attn.length > 0 && <section className="rs-attn">
        <span className="rs-attn__l">Needs a look</span>
        {attn.map((p) => <button key={p.id} className="rs-attn__c" onClick={() => setSel(p.id)}><Avatar name={p.name} size={24} /><b>{p.name.split(' ')[0]}</b><span className={'rs-attn__n is-' + p.attn}>{p.note}</span></button>)}
      </section>}
      <div className="rs-bar">
        <label className="ms-search rs-search"><Icon name="search" size={14} /><input placeholder="Search players by name" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button className="rs-x" onClick={() => setQ('')} aria-label="Clear search"><Icon name="x" size={13} /></button>}</label>
        <div className="rs-bar__r">
          <div className="rs-show" role="group" aria-label="Status">{[['active', 'Active · ' + active.length], ['inactive', 'Inactive · ' + (players.length - active.length)], ['all', 'All']].map(([v, l]) => <button key={v} className="rs-show__b" aria-pressed={show === v} onClick={() => setShow(v)}>{l}</button>)}</div>
          <div className="rs-vt" role="group" aria-label="Layout"><button className="rs-vt__b" aria-pressed={view === 'faces'} onClick={() => { setView('faces'); localStorage.setItem('rs-view', 'faces'); }} aria-label="Team view"><Icon name="layout-grid" size={15} /></button><button className="rs-vt__b" aria-pressed={view === 'list'} onClick={() => { setView('list'); localStorage.setItem('rs-view', 'list'); }} aria-label="List view"><Icon name="list" size={15} /></button></div>
          <Segmented size="sm" label="Sort players" value={sort} onChange={setSort} options={[{ value: 'avg', label: 'Avg score' }, { value: 'hcp', label: 'Handicap' }, { value: 'rounds', label: 'Rounds' }, { value: 'name', label: 'Name' }]} />
        </div>
      </div>
      <div className={'rs-body' + (cur ? ' has-peek' : '')}>
        {view === 'faces' ? <Faces rows={rows} sel={sel} onSel={setSel} onSet={setStatus} /> : <div className="rs-list" role="table" aria-label="Roster">
          <div className="rs-row rs-row--head" role="row"><span>Player</span><span>Status</span><span>Last 7 rounds</span><span className="r">Avg</span><span className="r">HCP</span><span className="r">SG / rd</span><span className="r">Rounds</span><span></span></div>
          {rows.map((p) => (
            <div key={p.id} role="row" tabIndex={0} className={'rs-row' + (sel === p.id ? ' is-sel' : '') + (p.status === 'inactive' ? ' is-off' : '')} onClick={() => setSel(sel === p.id ? null : p.id)} onKeyDown={(e) => e.key === 'Enter' && setSel(p.id)}>
              <span className="rs-who"><Avatar name={p.name} size={40} /><span><b>{p.name}{p.role && <span className="rs-cap">{p.role}</span>}</b><span className="rs-who__m">{p.year + ' · ' + p.home}</span></span></span>
              <span><StatusPill p={p} onSet={setStatus} /></span>
              <span><FormLine data={p.trend} /></span>
              <span className="r fw-num rs-num">{p.avg.toFixed(1)}</span>
              <span className="r fw-num rs-num2">{hcp(p.hcp)}</span>
              <span className={'r fw-num rs-sg ' + (p.sg == null ? '' : p.sg >= 0 ? 'is-gain' : 'is-loss')}>{sgn(p.sg)}</span>
              <span className="r fw-num rs-num2">{p.rounds}</span>
              <span className="r"><RowMenu p={p} onRemove={setRemove} /></span>
            </div>
          ))}
          {!rows.length && <div className="rs-empty"><b>No players match “{q.trim()}”</b><Button size="sm" onClick={() => setQ('')}>Clear search</Button></div>}
        </div>}
        <Peek p={cur} onClose={() => setSel(null)} onSet={setStatus} />
      </div>
      <InviteModal open={invite} onClose={() => setInvite(false)} toast={toast} />
      <RemoveModal p={remove} onClose={() => setRemove(null)} onConfirm={() => { setPlayers(players.filter((x) => x.id !== remove.id)); if (sel === remove.id) setSel(null); toast(remove.name + ' removed from team', 'user-minus'); setRemove(null); }} />
    </div>
  );
}
window.RosterPage = Roster;
})();
