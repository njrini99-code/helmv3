(() => {
const { Icon, DriveDispersion } = window.FairwayClubhouseEdition_9c4f4d;
const seed = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296); };
const pct = (v) => Math.round(v) + '%';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function model(p) {
  const r = seed(p.id + 'game');
  const k = clamp((75 - p.avg) / 5, 0, 1); // 0 weak → 1 strong
  const j = p.id === 'jonah';
  const g = {
    n: { rounds: Math.min(p.rounds, 10), drives: 118, approaches: 164, chips: 71, putts: 298 },
    dist: { eagle: +(0.05 + k * 0.08).toFixed(2), birdie: +(1.6 + k * 1.8).toFixed(1), par: +(9.4 + k * 2.2).toFixed(1), bogey: +(5.2 - k * 2).toFixed(1), double: +(1.4 - k * 1.0).toFixed(1) },
    byPar: [[3, +(3.28 - k * 0.24).toFixed(2), 3.09], [4, +(4.32 - k * 0.3).toFixed(2), 4.11], [5, +(4.98 - k * 0.3).toFixed(2), 4.76]],
    bounce: Math.round(18 + k * 16),
    tee: { left: Math.round(22 - k * 6 + (r() - 0.5) * 6), fw: 0, right: 0, driver: Math.round(262 + k * 22 + (r() - 0.5) * 10), other: Math.round(228 + k * 14), fwP4: 0, fwP5: 0, pen: +(0.7 - k * 0.45).toFixed(1) },
    gir: [['50–75', 86 - (1 - k) * 12], ['75–100', 80 - (1 - k) * 14], ['100–125', 72 - (1 - k) * 16], ['125–150', j ? 44 : 64 - (1 - k) * 18], ['150–175', 52 - (1 - k) * 18], ['175–200', 40 - (1 - k) * 16], ['200+', 26 - (1 - k) * 12]].map(([b, v]) => [b, j && b === '125–150' ? 44 : Math.round(v + (r() - 0.5) * 6)]),
    girD1: [84, 78, 70, 62, 52, 41, 28],
    prox: [['50–75', 16], ['75–100', 19], ['100–125', 23], ['125–150', j ? 33 : 27], ['150–175', 32], ['175–200', 39], ['200+', 48]].map(([b, v]) => [b, j && b === '125–150' ? 33 : Math.round(v * (1.25 - k * 0.3) + (r() - 0.5) * 3)]),
    proxD1: [15, 18, 21, 25, 30, 36, 44],
    lie: [['Fairway', 68 - (1 - k) * 12], ['Rough', 46 - (1 - k) * 14], ['Sand', 30 - (1 - k) * 10]].map(([l, v]) => [l, Math.round(v)]),
    miss: { sl: 9, s: j ? 34 : 24, sr: 11, l: 12, r: 14, ll: 4, lg: 10, lr: 6 },
    scr: { all: Math.round(44 + k * 16), lie: [['Fringe', 72, 18], ['Fairway', 58, 14], ['Rough', 44, 27], ['Sand', 38, 12]].map(([l, v, n]) => [l, Math.round(v - (1 - k) * 10), n]), dist: [['0–10 yds', 68], ['10–20 yds', 51], ['20–30 yds', 34]].map(([l, v]) => [l, Math.round(v - (1 - k) * 10)]), sand: Math.round(34 + k * 18) },
    putt: { bands: [['0–3', 97, 96, 64], ['3–5', j ? 62 : 80, 84, 38], ['5–10', 44, 52, 51], ['10–15', 22, 28, 40], ['15–20', 14, 18, 33], ['20–30', 7, 9, 41], ['30+', 3, 4, 31]].map(([b, v, d, n]) => [b, j && b === '3–5' ? 62 : clamp(Math.round(v * (0.88 + k * 0.22)), 1, 99), d, n]), perGir: +(1.86 - k * 0.1).toFixed(2), three: +(0.9 - k * 0.5).toFixed(1), one: Math.round(28 + k * 10), first: +(19 - k * 3).toFixed(1), lag: [['20–30 ft', 2.9], ['30–40 ft', 3.6], ['40+ ft', 4.8]].map(([b, v]) => [b, +(v * (1.2 - k * 0.3)).toFixed(1)]), miss: { left: 18, right: 22, short: j ? 36 : 24, long: 12, low: j ? 64 : 58, high: j ? 36 : 42 }, brk: [['Straight', 71], ['Left to right', 54], ['Right to left', 49]].map(([b, v]) => [b, Math.round(v * (0.9 + k * 0.15))]) },
  };
  g.tee.right = Math.round(20 - k * 5 + (r() - 0.5) * 6);
  g.tee.fw = 100 - g.tee.left - g.tee.right;
  g.tee.fwP4 = g.tee.fw + 2; g.tee.fwP5 = g.tee.fw - 5;
  return g;
}

function Sec({ id, icon, title, lead, sub, figs, children }) {
  return (
    <section className="gm" id={'gm-' + id}>
      <header className="gm__head">
        <span className="gm__ic"><Icon name={icon} size={16} /></span>
        <div className="gm__t"><h2>{title}</h2><p>{lead}</p></div>
        <span className="gm__sub">{sub}</span>
      </header>
      {figs && <dl className="gm__figs">{figs.map(([l, v, n, tone]) => <div key={l}><dt>{l}</dt><dd className={'fw-num' + (tone ? ' is-' + tone : '')}>{v}</dd>{n && <span>{n}</span>}</div>)}</dl>}
      <div className="gm__body">{children}</div>
    </section>
  );
}
function Panel({ title, note, children, wide }) {
  return <div className={'gm-p' + (wide ? ' is-wide' : '')}><div className="gm-p__t">{title}</div>{children}{note && <p className="gm-p__n">{note}</p>}</div>;
}

// Scoring distribution: one stacked bar per round-average, labeled.
function ScoreMix({ d }) {
  const segs = [['Eagle+', d.eagle, 'eg'], ['Birdie', d.birdie, 'bd'], ['Par', d.par, 'pr'], ['Bogey', d.bogey, 'bg'], ['Double+', d.double, 'db']];
  const tot = segs.reduce((a, s) => a + s[1], 0);
  return (
    <div className="mix">
      <div className="mix__bar">{segs.map(([l, v, c]) => <span key={l} className={'mix__s is-' + c} style={{ flex: v / tot }} title={l + ' ' + v}></span>)}</div>
      <div className="mix__k">{segs.map(([l, v, c]) => <span key={l}><i className={'is-' + c}></i><b className="fw-num">{v}</b>{l}</span>)}</div>
    </div>
  );
}
function ParTiles({ rows }) {
  return <div className="par3">{rows.map(([par, v, d1]) => { const diff = v - par; return (
    <div key={par} className="par3__t"><span className="par3__l">Par {par}s</span><span className="par3__v fw-num">{v.toFixed(2)}</span><span className="par3__to fw-num">{diff >= 0 ? '+' : '−'}{Math.abs(diff).toFixed(2)} to par</span><span className="par3__d fw-num">D1 {d1.toFixed(2)}</span></div>); })}</div>;
}

// Tee: fairway strip showing where drives finish.
function FairwayStrip({ t }) {
  return (
    <div className="fws">
      <div className="fws__strip">
        <span className="fws__z is-rough" style={{ flex: t.left }}><b className="fw-num">{t.left}%</b><em>Left</em></span>
        <span className="fws__z is-fw" style={{ flex: t.fw }}><b className="fw-num">{t.fw}%</b><em>Fairway</em></span>
        <span className="fws__z is-rough" style={{ flex: t.right }}><b className="fw-num">{t.right}%</b><em>Right</em></span>
      </div>
      <div className="fws__cap"><span>Miss bias</span><b>{t.left > t.right ? 'Left by ' + (t.left - t.right) + (t.left - t.right === 1 ? ' pt' : ' pts') : t.right > t.left ? 'Right by ' + (t.right - t.left) + (t.right - t.left === 1 ? ' pt' : ' pts') : 'Even'}</b></div>
    </div>
  );
}
function Compare({ rows, unit = '', max }) {
  const m = max || Math.max(...rows.map((r) => r[1]));
  return <div className="cmp">{rows.map(([l, v, sub]) => <div key={l} className="cmp__r"><span className="cmp__l">{l}{sub && <em>{sub}</em>}</span><span className="cmp__bar"><span style={{ width: (v / m) * 100 + '%' }}></span></span><b className="fw-num">{v}{unit}</b></div>)}</div>;
}

// Approach: GIR ladder with D1 ticks.
function Ladder({ rows, d1, invert, unit, label }) {
  const max = Math.max(...rows.map((r) => r[1]), ...d1) * 1.1;
  return (
    <div className="lad">
      {rows.map(([b, v], i) => { const good = invert ? v <= d1[i] : v >= d1[i]; return (
        <div key={b} className="lad__c">
          <span className={'lad__v fw-num ' + (good ? 'is-gain' : 'is-loss')}>{v}{unit}</span>
          <span className="lad__col"><span className={'lad__fill ' + (good ? 'is-gain' : 'is-loss')} style={{ height: (v / max) * 100 + '%' }}></span><span className="lad__d1" style={{ bottom: (d1[i] / max) * 100 + '%' }}></span></span>
          <span className="lad__b fw-num">{b}</span>
        </div>); })}
      <span className="lad__axis">{label}</span>
    </div>
  );
}
// Approach misses around a green: 3×3 grid.
function GreenMiss({ m }) {
  const cells = [['Long left', m.ll], ['Long', m.lg], ['Long right', m.lr], ['Left', m.l], ['Green', null], ['Right', m.r], ['Short left', m.sl], ['Short', m.s], ['Short right', m.sr]];
  const max = Math.max(...Object.values(m));
  return (
    <div className="gmiss">
      {cells.map(([l, v]) => v == null ? <span key={l} className="gmiss__g"><Icon name="flag" size={16} /><em>Green</em></span> : (
        <span key={l} className="gmiss__c" style={{ background: `rgb(154 101 18 / ${0.05 + (v / max) * 0.32})` }}><b className="fw-num">{v}%</b><em>{l}</em></span>))}
    </div>
  );
}

// Putting: make curve vs D1.
function MakeCurve({ bands }) {
  const w = 560, h = 210, pl = 38, pr = 36, pt = 22, pb = 36;
  const x = (i) => pl + (i * (w - pl - pr)) / (bands.length - 1), y = (v) => pt + ((100 - v) / 100) * (h - pt - pb);
  const line = (k) => bands.map((b, i) => (i ? 'L' : 'M') + x(i) + ',' + y(b[k])).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mk" role="img" aria-label="Make rate by distance">
      {[0, 25, 50, 75, 100].map((t) => <g key={t}><line x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} stroke="var(--ivory-200)" /><text x={pl - 8} y={y(t) + 4} textAnchor="end" className="mk__t">{t}%</text></g>)}
      <path d={line(2)} fill="none" stroke="var(--champagne-500)" strokeDasharray="4 4" strokeWidth="1.5" />
      <path d={line(1) + ` L${x(bands.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="var(--chart-gain)" opacity=".07" />
      <path d={line(1)} fill="none" stroke="var(--green-700)" strokeWidth="2.25" strokeLinejoin="round" />
      {bands.map(([b, v, d, n], i) => { const good = v >= d; return (
        <g key={b}>
          <circle cx={x(i)} cy={y(v)} r="4.5" fill="var(--ivory-25)" stroke={good ? 'var(--chart-gain)' : 'var(--chart-loss)'} strokeWidth="2" />
          <text x={x(i)} y={y(v) - 10} textAnchor="middle" className={'mk__v ' + (good ? 'is-gain' : 'is-loss')}>{v}%</text>
          <text x={x(i)} y={h - 16} textAnchor="middle" className="mk__b">{b} ft</text>
          <text x={x(i)} y={h - 3} textAnchor="middle" className="mk__n">{n} putts</text>
        </g>); })}
    </svg>
  );
}
// Putt misses on a cup diagram.
function CupMiss({ m }) {
  return (
    <div className="cup">
      <div className="cup__ring">
        <span className="cup__hole"></span>
        <span className="cup__lbl is-long"><b className="fw-num">{m.long}%</b>Long</span>
        <span className="cup__lbl is-short"><b className="fw-num">{m.short}%</b>Short</span>
        <span className="cup__lbl is-left"><b className="fw-num">{m.left}%</b>Left</span>
        <span className="cup__lbl is-right"><b className="fw-num">{m.right}%</b>Right</span>
      </div>
      <div className="cup__side">
        <span className="cup__st">Missed side</span>
        <div className="cup__split"><span className="is-low" style={{ flex: m.low }}><b className="fw-num">{m.low}%</b>Low side</span><span className="is-high" style={{ flex: m.high }}><b className="fw-num">{m.high}%</b>High side</span></div>
        <p>{m.low > 55 ? 'Most misses finish below the hole, which usually means not enough break played.' : 'Misses are split, with a slight lean to the low side.'}</p>
      </div>
    </div>
  );
}

function GameDetail({ p, drives }) {
  const g = model(p);
  const first = p.name.split(' ')[0];
  const j = p.id === 'jonah';
  const worstGir = g.gir.reduce((a, b, i) => (b[1] - g.girD1[i] < a.d ? { i, d: b[1] - g.girD1[i] } : a), { i: 0, d: 99 });
  const secs = [['scoring', 'Scoring'], ['tee', 'Off the tee'], ['approach', 'Approach'], ['short', 'Short game'], ['putting', 'Putting']];
  const [on, setOn] = React.useState('scoring');
  const jump = (id) => { setOn(id); const el = document.getElementById('gm-' + id); const sc = el && el.closest('.h2-canvas'); if (el && sc) sc.scrollTo({ top: el.offsetTop - 120, behavior: 'smooth' }); };
  return (
    <div className="gd">
      <nav className="gd__nav" aria-label="Game sections">
        {secs.map(([id, l]) => <button key={id} className="gd__nb" aria-pressed={on === id} onClick={() => jump(id)}>{l}</button>)}
        <span className="gd__src">Last {g.n.rounds} countable rounds · {g.n.putts} putts · {g.n.approaches} approaches logged</span>
      </nav>

      <Sec id="scoring" icon="flag" title="Scoring" sub={g.n.rounds + ' rounds'}
        lead={`${first} makes ${g.dist.birdie} birdies and ${g.dist.double} doubles a round. Par 5s are ${g.byPar[2][1] < 5 ? 'a scoring chance' : 'giving shots back'}, playing ${g.byPar[2][1].toFixed(2)} on average.`}
        figs={[['Scoring average', p.avg.toFixed(1), 'Team 72.8'], ['Birdies / round', g.dist.birdie, 'D1 3.1', g.dist.birdie >= 3.1 ? 'gain' : 'loss'], ['Bogeys / round', g.dist.bogey, 'D1 3.8', g.dist.bogey <= 3.8 ? 'gain' : 'loss'], ['Bounce-back', g.bounce + '%', 'Birdie after bogey']]}>
        <Panel title="What an average round looks like" wide note="Holes per round by result. Doubles or worse are the quickest place to save strokes."><ScoreMix d={g.dist} /></Panel>
        <Panel title="Scoring by par" wide><ParTiles rows={g.byPar} /></Panel>
      </Sec>

      <Sec id="tee" icon="move-up-right" title="Off the tee" sub={g.n.drives + ' drives'}
        lead={`${first} finds ${g.tee.fw}% of fairways. When the drive misses it goes ${g.tee.left > g.tee.right ? 'left' : 'right'} more often, and ${g.tee.pen} penalty strokes a round come from the tee.`}
        figs={[['Fairways hit', g.tee.fw + '%', 'D1 64%', g.tee.fw >= 64 ? 'gain' : 'loss'], ['Driver carry', g.tee.driver + ' yds', 'D1 272'], ['Penalties / round', g.tee.pen, 'D1 0.3', g.tee.pen <= 0.3 ? 'gain' : 'loss'], ['Fairways par 5', g.tee.fwP5 + '%', 'Par 4 ' + g.tee.fwP4 + '%']]}>
        <Panel title="Where drives finish" note="Share of tee shots on par 4s and 5s."><FairwayStrip t={g.tee} /></Panel>
        <Panel title="Distance by club"><Compare unit=" yds" max={300} rows={[['Driver', g.tee.driver, 'Carry + roll'], ['Fairway wood · hybrid', g.tee.other, 'When driver stays in the bag']]} /></Panel>
        <Panel title="Dispersion" wide><DriveDispersion shots={drives} fairway={32} lateral={40} range={[200, 300]} note={'Each dot is one drive. Carries ' + g.tee.driver + ' on average.'} /></Panel>
      </Sec>

      <Sec id="approach" icon="crosshair" title="Approach" sub={g.n.approaches + ' approach shots'}
        lead={j ? 'Approach is where Jonah loses most. From 125–150 yards he hits 44% of greens against a D1 rate of 62%, and finishes 33 feet away.' : `${first} is strongest inside 100 yards. The biggest gap to D1 is ${g.gir[worstGir.i][0]} yards, ${Math.abs(worstGir.d)} points below.`}
        figs={[['Greens in regulation', Math.round(g.gir.reduce((a, b) => a + b[1], 0) / g.gir.length) + '%', 'D1 67%'], ['Proximity · all', Math.round(g.prox.reduce((a, b) => a + b[1], 0) / g.prox.length) + ' ft', 'Every approach'], ['Missed short', g.miss.s + g.miss.sl + g.miss.sr + '%', 'Of missed greens', 'loss'], ['From the rough', g.lie[1][1] + '%', 'GIR · fairway ' + g.lie[0][1] + '%']]}>
        <Panel title="Greens hit by distance" wide note="Bars are GIR rate from each band. The dashed tick is the D1 rate."><Ladder rows={g.gir} d1={g.girD1} unit="%" label="Yards to the pin" /></Panel>
        <Panel title="Proximity to the hole" wide note="Average finish distance in feet. Shorter is better; the dashed tick is D1."><Ladder rows={g.prox} d1={g.proxD1} invert unit="′" label="Yards to the pin" /></Panel>
        <Panel title="Where missed greens finish" note={'Most misses finish ' + (g.miss.s >= g.miss.lg ? 'short' : 'long') + '. Taking one more club is the simplest change.'}><GreenMiss m={g.miss} /></Panel>
        <Panel title="Greens hit by lie"><Compare unit="%" max={100} rows={g.lie.map(([l, v]) => [l, v])} /></Panel>
      </Sec>

      <Sec id="short" icon="flag-triangle-right" title="Short game" sub={g.n.chips + ' chances'}
        lead={`${first} gets up and down ${g.scr.all}% of the time. From the rough it drops to ${g.scr.lie[2][1]}%, and sand saves are ${g.scr.sand}%.`}
        figs={[['Scrambling', g.scr.all + '%', 'D1 58%', g.scr.all >= 58 ? 'gain' : 'loss'], ['Sand saves', g.scr.sand + '%', 'D1 50%', g.scr.sand >= 50 ? 'gain' : 'loss'], ['Inside 10 yds', g.scr.dist[0][1] + '%', 'Up and down'], ['From the rough', g.scr.lie[2][1] + '%', g.scr.lie[2][2] + ' attempts']]}>
        <Panel title="Up and down by lie" note="Counts are attempts in the window."><Compare unit="%" max={100} rows={g.scr.lie.map(([l, v, n]) => [l, v, n + ' attempts'])} /></Panel>
        <Panel title="Up and down by distance"><Compare unit="%" max={100} rows={g.scr.dist} /></Panel>
      </Sec>

      <Sec id="putting" icon="circle-dot" title="Putting" sub={g.n.putts + ' putts'}
        lead={j ? 'From three to five feet Jonah makes 62%. The D1 rate is 84%, so short putts cost him most. Lag putting is solid.' : `${first} averages ${g.putt.perGir} putts per green hit and ${g.putt.three} three-putts a round. The first putt starts ${g.putt.first} feet away on average.`}
        figs={[['Putts / GIR', g.putt.perGir, 'D1 1.78', g.putt.perGir <= 1.78 ? 'gain' : 'loss'], ['3-putts / round', g.putt.three, 'D1 0.5', g.putt.three <= 0.5 ? 'gain' : 'loss'], ['One-putt rate', g.putt.one + '%', 'Of holes'], ['First putt', g.putt.first + ' ft', 'Average start']]}>
        <Panel title="Make rate by distance" wide note="Green line is the player, dashed champagne is D1. Each band needs 10 or more putts to grade."><MakeCurve bands={g.putt.bands} /></Panel>
        <Panel title="How putts miss" wide><CupMiss m={g.putt.miss} /></Panel>
        <Panel title="Lag leave"><Compare unit=" ft" max={6} rows={g.putt.lag.map(([b, v]) => ['From ' + b, v, 'Left for the second putt'])} /></Panel>
        <Panel title="Make rate by break" note="Putts inside 10 feet."><Compare unit="%" max={100} rows={g.putt.brk} /></Panel>
      </Sec>
    </div>
  );
}
window.GameDetail = GameDetail;
})();
