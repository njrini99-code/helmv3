(() => {
const { Icon, Button, Avatar, Badge, Segmented } = window.FairwayClubhouseEdition_9c4f4d;
const R = window.ROSTER;
const hcp = (v) => (v < 0 ? '+' + Math.abs(v).toFixed(1) : v.toFixed(1));

function Profile({ p }) {
  return <div className="m-hc">
    <section className="m-prof"><Avatar name={p.name} size={64} /><h1>{p.name}</h1><p>{p.year} · Class of {p.cls}{p.role ? ' · ' + p.role : ''}</p><p className="m-prof__m">{p.home} · {p.major}</p>
      <div className="m-prof__act"><Button leftIcon="message-square" fullWidth>Message</Button><Button leftIcon="calendar-plus" fullWidth>Schedule</Button></div></section>
    <dl className="qm-facts"><div><dt>Scoring avg</dt><dd>{p.avg.toFixed(1)}</dd></div><div><dt>Handicap</dt><dd>{hcp(p.hcp)}</dd></div><div><dt>SG / round</dt><dd className={p.sg > 0 ? 'm-pos' : p.sg < 0 ? 'm-neg' : ''}>{mSgn(p.sg)}</dd></div></dl>
    <section className="qm-panel"><div className="qm-panel__h"><b>Scoring trend</b><span className="qm-empty">Last {p.trend.length} rounds</span></div>
      <div className="m-trend"><MSpark data={p.trend} w={330} h={84} /><div className="m-trend__lg"><span>{p.trend[0]}</span><span className={p.attn === 'warning' ? 'm-neg' : ''}>{p.note}</span><span>{p.trend[p.trend.length - 1]}</span></div></div></section>
    <section className="qm-panel"><div className="qm-panel__h"><b>Recent rounds</b><span className="m-link">All {p.rounds}</span></div>
      {p.last.map(([c, d, s, tp], i) => <div key={i} className="m-row"><span className="m-rnd"><Icon name="flag" size={15} /></span><span className="m-row__b"><b>{c}</b><span>{d}</span></span><span className="m-row__v"><b>{s}</b><span className={tp < 0 ? 'is-under' : ''}>{mPar(tp)}</span></span></div>)}</section>
    <section className="qm-panel qm-pad"><b className="qm-h">About</b><p className="m-about">{p.about}</p>
      <div className="m-form">{[['Home course', p.course], ['Birthday', p.bday], ['Member', p.since.replace('Joined ', 'Since ')]].map(([k, v]) => <div key={k} className="m-form__r"><span>{k}</span><b>{v}</b></div>)}</div></section>
  </div>;
}

function RosterM({ initial = {} }) {
  const [id, setId] = React.useState(initial.id || null);
  const [sort, setSort] = React.useState('avg');
  const [req, setReq] = React.useState(!!initial.req);
  const p = id && R.players.find((x) => x.id === id);
  const act = R.players.filter((x) => x.status === 'active').sort((a, b) => sort === 'avg' ? a.avg - b.avg : sort === 'sg' ? (b.sg ?? -9) - (a.sg ?? -9) : a.name.localeCompare(b.name));
  const out = R.players.filter((x) => x.status !== 'active');
  if (p) return <MApp tab="more" top={<MTop title="" back="Roster" onBack={() => setId(null)} right={<button className="qm-ib" aria-label="More actions"><Icon name="ellipsis" size={20} /></button>} />}><Profile p={p} /></MApp>;
  const Row = ({ x }) => <button className="m-row m-row--btn m-prow" onClick={() => setId(x.id)}><Avatar name={x.name} size={40} /><span className="m-row__b"><b><span className="m-row__nm">{x.name}</span>{x.role && <span className="m-cap">{x.role}</span>}</b><span className={x.attn === 'warning' ? 'm-neg' : x.attn === 'positive' ? 'm-pos' : ''}>{x.year} · {x.note}</span></span>{x.trend.length > 2 && <MSpark data={x.trend} w={48} h={20} />}<span className="m-row__v"><b>{x.avg.toFixed(1)}</b><span>{hcp(x.hcp)} hcp</span></span></button>;
  return (
    <MApp tab="more" top={<MTop title="Roster" back="More" right={<button className="qm-ib" aria-label="Invite players"><Icon name="user-plus" size={20} /></button>} />}
      sheet={req && <MSheet title="Join requests" sub={R.requests.length + ' waiting · Varsity'} onClose={() => setReq(false)} foot={<Button variant="primary" size="lg" fullWidth leftIcon="check">Approve all {R.requests.length}</Button>}>
        {R.requests.map((q) => { const [yr, cls, when] = q.meta.split(' · '); return (
          <div key={q.id} className="m-rq">
            <div className="m-rq__top"><Avatar name={q.name} size={44} /><span className="m-rq__id"><b>{q.name}</b><span>{yr} · {cls}</span></span><span className="m-rq__h"><b>{q.hcp}</b><em>hcp</em></span></div>
            <div className="m-rq__meta"><Icon name="clock" size={13} />Requested {when.replace('requested ', '')}</div>
            <div className="m-rq__act"><Button fullWidth>Decline</Button><Button variant="primary" fullWidth leftIcon="check">Approve</Button></div>
          </div>); })}
        <div className="m-code dp-well-soft"><span><em>Team code</em><b>{R.code}</b></span><Button size="sm" leftIcon="copy">Copy</Button></div>
        <p className="qm-empty m-rq__note">Players join with this code. Approved players see the team calendar and messages.</p></MSheet>}>
      <div className="qm-head"><span>Varsity · {act.length} active</span><h1>Roster</h1></div>
      <button className="m-banner" onClick={() => setReq(true)}><span className="m-banner__i"><Icon name="user-plus" size={16} /></span><span><b>{R.requests.length} join requests</b><span>Grace Liu, Owen Park</span></span><Icon name="chevron-right" size={16} /></button>
      <div className="m-sortbar"><span className="qm-empty">Sort by</span><Segmented size="sm" label="Sort" value={sort} onChange={setSort} options={[{ value: 'avg', label: 'Avg' }, { value: 'sg', label: 'SG' }, { value: 'name', label: 'Name' }]} /></div>
      <section className="qm-panel">{act.map((x) => <Row key={x.id} x={x} />)}</section>
      <h3 className="qm-sec">Inactive</h3>
      <section className="qm-panel">{out.map((x) => <Row key={x.id} x={x} />)}</section>
    </MApp>
  );
}
Object.assign(window, { RosterM });
})();
