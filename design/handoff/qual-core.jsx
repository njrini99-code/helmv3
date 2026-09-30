(() => {
const { Icon, Badge } = window.FairwayClubhouseEdition_9c4f4d;
const tp = (v) => v == null ? '—' : v === 0 ? 'E' : (v > 0 ? '+' : '−') + Math.abs(v);
const STATUS = { upcoming: { tone: 'warning', label: 'Upcoming' }, in_progress: { tone: 'accent', label: 'Live', pulse: true }, completed: { tone: 'neutral', label: 'Completed' } };
const cta = (s) => s === 'in_progress' ? 'View leaderboard' : s === 'completed' ? 'View results' : 'View details';
function StatusPill({ status }) {
  const m = STATUS[status] || { tone: 'neutral', label: status };
  return <Badge tone={m.tone}>{m.pulse ? <i className="qf-pulse"></i> : <span className="fw-badge__dot"></span>}{m.label}</Badge>;
}
const TP = ({ v, big }) => <span className={'qf-tp' + (v < 0 ? ' is-under' : '') + (big ? ' is-big' : '')}>{tp(v)}</span>;

function board(q) {
  const topScore = q.spots - q.picks;
  const rows = q.entries.map((en) => {
    const played = en.rounds.map((r, i) => r && { ...r, i }).filter(Boolean);
    const toPar = played.length ? played.reduce((s, r) => s + r.toPar, 0) : null;
    const total = played.length ? played.reduce((s, r) => s + q.par + r.toPar, 0) : null;
    return { ...en, played, toPar, total, avg: played.length ? total / played.length : null, last: played.length ? played[played.length - 1].toPar : 99 };
  });
  const scored = rows.filter((r) => r.played.length).sort((a, b) => b.played.length - a.played.length || a.toPar - b.toPar || a.last - b.last);
  const unscored = rows.filter((r) => !r.played.length);
  scored.forEach((r, i) => {
    const tie = scored.filter((o) => o.toPar === r.toPar && o.played.length === r.played.length);
    r.pos = (tie.length > 1 ? 'T' : '') + (scored.indexOf(tie[0]) + 1); r.idx = i;
    if (q.confirmed) r.state = q.pick && q.pick.id === r.id ? 'pick' : q.confirmed.includes(r.id) ? 'selected' : '';
    else if (q.status === 'completed') r.state = i < topScore ? 'qualified' : '';
    else r.state = i < topScore ? 'locked' : i < q.spots + 1 ? 'bubble' : '';
  });
  const submitted = rows.reduce((s, r) => s + r.played.length, 0);
  const line = scored[topScore - 1] ? scored[topScore - 1].toPar : null;
  return { rows: scored, unscored, topScore, travel: q.spots, submitted, line, entrants: q.entries.length };
}
const STATE = { locked: ['positive', 'Locked'], bubble: ['warning', 'Bubble'], qualified: ['positive', 'Qualified'], selected: ['positive', 'Selected'], pick: ['accent', 'Coach’s pick'] };
const StateBadge = ({ s }) => STATE[s] ? <Badge tone={STATE[s][0]}>{STATE[s][1]}</Badge> : null;

function Meta({ q }) {
  return (
    <div className="qf-meta">
      <span><Icon name="calendar" size={15} />{q.start}{q.end !== q.start ? ' – ' + q.end : ''}</span>
      <span><Icon name="flag" size={15} />{q.spots} spots</span>
      <span className="qf-meta__w"><Icon name="map-pin" size={15} />{q.course}</span>
    </div>
  );
}
Object.assign(window, { qualTp: tp, QualStatusPill: StatusPill, QualTP: TP, qualBoard: board, QualStateBadge: StateBadge, QualMeta: Meta, qualCta: cta });
})();
