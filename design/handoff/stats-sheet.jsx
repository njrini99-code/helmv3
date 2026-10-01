(() => {
const { Icon, DeltaChip } = window.FairwayClubhouseEdition_9c4f4d;
// Stat sheet: calm, ruled, grouped by the codebase's sections.
// Each row: value, team, D1 benchmark, a quiet range bar placing value between worst and best on the team.
const SHEET = [
  ['Scoring', [
    ['Scoring average', 'avg', 72.8, 71.9, 'down', 1, ''],
    ['Par 3 average', 'p3', 3.12, 3.05, 'down', 2, ''],
    ['Par 4 average', 'p4', 4.18, 4.09, 'down', 2, ''],
    ['Par 5 average', 'p5', 4.86, 4.74, 'down', 2, ''],
    ['Birdies / round', 'bird', 2.6, 3.1, 'up', 1, ''],
    ['Bogey avoidance', 'bog', 68, 72, 'up', 0, '%'],
  ]],
  ['Off the tee', [
    ['Fairways hit', 'fw', 62, 64, 'up', 0, '%'],
    ['Driving distance', 'dd', 264, 272, 'up', 0, ' yds'],
    ['Penalties / round', 'pen', 0.4, 0.3, 'down', 1, ''],
  ]],
  ['Approach', [
    ['Greens in regulation', 'gir', 61, 67, 'up', 0, '%'],
    ['Proximity 100–125', 'px1', 24, 21, 'down', 0, ' ft'],
    ['Proximity 125–150', 'px2', 29, 26, 'down', 0, ' ft'],
    ['Proximity 150–175', 'px3', 34, 31, 'down', 0, ' ft'],
  ]],
  ['Short game', [
    ['Scrambling', 'scr', 52, 58, 'up', 0, '%'],
    ['Sand saves', 'sand', 44, 50, 'up', 0, '%'],
    ['Up and down inside 30 yds', 'ud', 61, 64, 'up', 0, '%'],
  ]],
  ['Putting', [
    ['Putts / round', 'pr', 30.4, 29.1, 'down', 1, ''],
    ['One-putt rate', 'op', 34, 38, 'up', 0, '%'],
    ['Three-putt avoidance', 'tp', 94, 96, 'up', 0, '%'],
    ['Make rate 3–6 ft', 'm36', 70, 72, 'up', 0, '%'],
  ]],
];
const seed = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296); };
function valuesFor(p) {
  const r = seed(p.id + 'sheet');
  const skill = (72.8 - p.avg) / 3; // + good
  const out = {};
  SHEET.forEach(([, rows]) => rows.forEach(([, k, team, d1, better, dec]) => {
    if (k === 'avg') { out[k] = p.avg; return; }
    const span = Math.abs(d1 - team) * 2.2 || 1;
    const dir = better === 'up' ? 1 : -1;
    let v = team + dir * skill * span * 0.6 + (r() - 0.5) * span * 0.9;
    if (p.id === 'jonah' && k === 'px2') v = 33;
    if (p.id === 'jonah' && k === 'm36') v = 65;
    out[k] = +v.toFixed(dec);
  }));
  return out;
}
const fmt = (v, dec, unit) => (v == null ? '—' : v.toFixed(dec) + unit);
function Bar({ v, lo, hi, team, d1, better }) {
  const pct = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
  const good = better === 'up' ? v >= team : v <= team;
  return (
    <span className="sh-bar" aria-hidden="true">
      <span className="sh-bar__track"></span>
      <span className="sh-bar__d1" style={{ left: pct(d1) + '%' }}></span>
      <span className="sh-bar__team" style={{ left: pct(team) + '%' }}></span>
      <span className={'sh-bar__v ' + (good ? 'is-good' : 'is-low')} style={{ left: pct(v) + '%' }}></span>
    </span>
  );
}

function StatSheet({ players, focus, compact }) {
  const vals = Object.fromEntries(players.map((p) => [p.id, valuesFor(p)]));
  const [open, setOpen] = React.useState(() => Object.fromEntries(SHEET.map(([g]) => [g, true])));
  return (
    <section className="sh">
      <div className="sh__head">
        <div><h2>{focus ? 'Full stat sheet' : 'Team stat sheet'}</h2><span>Countable rounds · last 10 · bar runs from the team's lowest to highest</span></div>
        <div className="sh__key"><span><i className="k-v"></i>{focus ? focus.name.split(' ')[0] : 'Team'}</span>{focus && <span><i className="k-t"></i>Team</span>}<span><i className="k-d"></i>D1</span></div>
      </div>
      {SHEET.map(([g, rows]) => (
        <div key={g} className="sh__grp">
          <button className="sh__g" onClick={() => setOpen({ ...open, [g]: !open[g] })} aria-expanded={open[g]}><Icon name={open[g] ? 'chevron-down' : 'chevron-right'} size={14} />{g}<span>{rows.length}</span></button>
          {open[g] && <div className="sh__rows">
            <div className="sh__r sh__r--h"><span>Stat</span><span className="r">{focus ? focus.name.split(' ')[0] : 'Team'}</span>{focus && <span className="r">Team</span>}<span className="r">D1</span><span>Where it sits</span>{!focus && <span>Team best</span>}</div>
            {rows.map(([label, k, team, d1, better, dec, unit]) => {
              const all = players.map((p) => vals[p.id][k]);
              const lo = Math.min(...all, d1, team), hi = Math.max(...all, d1, team);
              const bestP = players[all.indexOf(better === 'up' ? Math.max(...all) : Math.min(...all))];
              const v = focus ? vals[focus.id][k] : team;
              const good = better === 'up' ? v >= team : v <= team;
              return (
                <div key={k} className="sh__r">
                  <span className="sh__l">{label}{better === 'down' && <em>lower is better</em>}</span>
                  <span className={'r fw-num sh__v' + (focus ? (good ? ' is-good' : ' is-low') : '')}>{fmt(v, dec, unit)}</span>
                  {focus && <span className="r fw-num sh__t">{fmt(team, dec, unit)}</span>}
                  <span className="r fw-num sh__t">{fmt(d1, dec, unit)}</span>
                  <Bar v={v} lo={lo} hi={hi} team={team} d1={d1} better={better} />
                  {!focus && <span className="sh__best"><b>{bestP.name.split(' ')[0]}</b><span className="fw-num">{fmt(vals[bestP.id][k], dec, unit)}</span></span>}
                </div>
              );
            })}
          </div>}
        </div>
      ))}
    </section>
  );
}

// items: [label, value, unit, delta, direction('up'|'down'), good(bool|null), context]
function Figures({ items }) {
  return (
    <section className="fg">
      {items.map(([l, v, u, delta, dir, good, ctx]) => (
        <div key={l} className="fg__c">
          <span className="fg__l">{l}</span>
          <span className="fg__v fw-num">{v}{u && <small>{u}</small>}</span>
          <span className="fg__d">{delta ? <DeltaChip value={delta} direction={dir} tone={good == null ? 'neutral' : good ? 'positive' : 'negative'} /> : null}<span>{ctx}</span></span>
        </div>
      ))}
    </section>
  );
}

Object.assign(window, { StatSheet, StatFigures: Figures });
})();
