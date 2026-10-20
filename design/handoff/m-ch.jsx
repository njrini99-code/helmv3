(() => {
const { Icon, Button, Avatar, Badge } = window.FairwayClubhouseEdition_9c4f4d;
const H = window.CH2, R = window.ROSTER;
const who = (id) => id ? R.players.find((p) => p.id === id).name : 'Team';
const SEV = { urgent: ['danger', 'Urgent'], high: ['warning', 'High'], medium: ['neutral', 'Medium'], low: ['neutral', 'Low'] };

function Queue({ open }) {
  const [f, setF] = React.useState('all');
  const list = H.signals.filter((s) => f === 'all' || (f === 'urgent' ? s.severity === 'urgent' : s.category === f));
  return <>
    <section className="m-brief"><span className="m-brief__k"><Icon name="sparkles" size={14} />Morning brief · Tue 14 Oct</span><p>{H.brief.line}</p>
      <div className="m-brief__f"><div><b>{H.brief.urgent}</b><em>Urgent</em></div><div><b>{H.brief.players}</b><em>Players</em></div><div><b>{H.brief.signals}</b><em>Signals</em></div></div></section>
    <div className="qm-switch">{[['all', 'All'], ['urgent', 'Urgent'], ['approach', 'Approach'], ['putting', 'Putting'], ['course_management', 'Course mgmt']].map(([k, l]) => <button key={k} className="qm-chip" aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}</div>
    <section className="qm-panel">{list.map((s) => <button key={s.id} className="m-sig" onClick={() => open(s.id)}>
      {s.playerId ? <Avatar name={who(s.playerId)} size={36} /> : <span className="m-grp"><Icon name="users" size={17} /></span>}
      <span className="m-sig__b"><span className="m-sig__k"><b>{who(s.playerId)}</b>{SEV[s.severity] && <Badge tone={SEV[s.severity][0]}>{SEV[s.severity][1]}</Badge>}</span><span className="m-sig__t">{s.title}</span><span className="m-sig__m">{s.evidence?.window || ''}</span></span>
      {s.strokeImpact ? <span className="m-sig__v"><b>{s.strokeImpact.toFixed(2).replace(/0$/, '')}</b><em>strokes</em></span> : null}
    </button>)}</section>
  </>;
}

function Signal({ s }) {
  const ev = s.evidence || {}, dx = ev.diagnosis, st = ev.standing;
  const pos = (v) => ((v - st.min) / (st.max - st.min)) * 100;
  return <>
    <div className="m-sighead">{s.playerId ? <Avatar name={who(s.playerId)} size={40} /> : <span className="m-grp"><Icon name="users" size={17} /></span>}<span><span className="m-sig__k"><b>{who(s.playerId)}</b>{SEV[s.severity] && <Badge tone={SEV[s.severity][0]}>{SEV[s.severity][1]}</Badge>}</span><em>{ev.window} · {ev.sample_n} {ev.sampleWord}</em></span></div>
    <h1 className="m-sigt">{s.title}</h1>
    <p className="m-claim">{s.claim}</p>
    {st && <section className="qm-panel qm-pad"><b className="qm-h">{st.label}</b>
      <div className="m-stand"><span className="m-stand__track"></span>{[['Tour', st.tour, 'is-tour'], ['Team', st.team, 'is-team'], [st.playerLabel || who(s.playerId).split(' ')[0], st.player, 'is-you']].map(([l, v, c]) => <span key={l} className={'m-stand__m ' + c} style={{ left: pos(v) + '%' }}><i></i><b>{v}{st.unit}</b><em>{l}</em></span>)}</div></section>}
    {s.viz && window.ShotEvidence && <div className="m-viz"><window.ShotEvidence viz={s.viz} title="Where the shots finished" /></div>}
    {dx && <section className="qm-panel qm-pad"><b className="qm-h">Why</b><p className="m-about">{dx.root_cause}</p>
      <div className="m-form">{dx.drivers.map((d) => <div key={d.label} className="m-form__r"><span>{d.label}</span><b>{d.value} <em>n {d.n}</em></b></div>)}</div></section>}
    {dx && <section className="m-act"><span className="m-act__k">Recommended</span><p>{dx.recommended_action}</p><div className="m-act__b"><Button variant="primary" fullWidth leftIcon="check">Assign as focus</Button><Button fullWidth leftIcon="message-square">Send to {s.playerId ? who(s.playerId).split(' ')[0] : 'team'}</Button></div><span className="m-act__c">{dx.confidence_reason}</span></section>}
  </>;
}

function CoachHelmM({ initial = {} }) {
  const [id, setId] = React.useState(initial.id || null);
  const s = id && H.signals.find((x) => x.id === id);
  return (
    <MApp tab="helm" top={s ? <MTop title="Signal" back="Helm" onBack={() => setId(null)} right={<button className="qm-ib" aria-label="Dismiss"><Icon name="archive" size={19} /></button>} /> : <MTop title="CoachHelm" />}>
      {s ? <Signal s={s} /> : <Queue open={setId} />}
    </MApp>
  );
}
function MoreM() {
  const items = [['calendar-days', 'Calendar', 'Pinehurst qualifier Thursday'], ['message-square', 'Messages', '4 unread', 3], ['users', 'Roster', '7 active · 2 join requests'], ['medal', 'Qualifiers', 'Pinehurst · live'], ['list-ordered', 'Lineups', null], ['map-pin', 'Courses', null]];
  return (
    <MApp tab="more" top={<MTop title="More" />}>
      <div className="m-me"><Avatar name="Maya Reyes" size={44} /><span className="m-me__t"><b>Maya Reyes</b><em>Head coach · Varsity</em></span><Icon name="chevrons-up-down" size={16} /></div>
      <section className="qm-panel">{items.map(([ic, l, m, n]) => <button key={l} className="m-row m-row--btn m-more"><span className="m-more__i"><Icon name={ic} size={18} /></span><span className="m-row__b"><b>{l}</b>{m && <span>{m}</span>}</span>{n ? <i className="m-unread">{n}</i> : null}<Icon name="chevron-right" size={16} className="m-chev" /></button>)}</section>
      <section className="qm-panel">{[['settings', 'Settings'], ['circle-help', 'Help'], ['log-out', 'Sign out']].map(([ic, l]) => <button key={l} className="m-row m-row--btn m-more"><span className="m-more__i"><Icon name={ic} size={18} /></span><span className="m-row__b"><b>{l}</b></span></button>)}</section>
    </MApp>
  );
}
Object.assign(window, { CoachHelmM, MoreM });
})();
