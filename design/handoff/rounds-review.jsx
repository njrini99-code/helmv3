(() => {
const { Icon, Button, Badge, ScoreMark } = window.FairwayClubhouseEdition_9c4f4d;
const R = window.RND, tp = window.rndTp;
const LIES = { fairway: 'Fairway', rough: 'Rough', sand: 'Sand', green: 'Green', hole: 'Holed', other: 'Other' };

function Review({ round, onBack }) {
  const rd = round || { d: 'Oct 14', dow: 'Tue', course: 'Finley GC', tee: 'Blue', type: 'Practice', score: 74, par: 72 };
  const c = R.courses.find((x) => x.name === rd.course) || R.courses[0];
  const tee = c.tees.find((t) => t.name === rd.tee) || c.tees[0];
  const holes = React.useMemo(() => window.buildTrackedRound(tee.holes, rd.score - rd.par), [rd.d, rd.course]);
  const [sel, setSel] = React.useState(holes.find((h) => h.score - h.par > 0)?.n || 1);
  const h = holes[sel - 1];
  const sum = (a, b, k) => holes.slice(a, b).reduce((s, x) => s + x[k], 0);
  const score = sum(0, 18, 'score'), par = sum(0, 18, 'par'), putts = sum(0, 18, 'putts');
  const fir = holes.filter((x) => x.fir).length, firp = holes.filter((x) => x.par !== 3).length, gir = holes.filter((x) => x.gir).length;
  const dist = [['Eagle+', (d) => d <= -2], ['Birdie', (d) => d === -1], ['Par', (d) => d === 0], ['Bogey', (d) => d === 1], ['Double+', (d) => d >= 2]].map(([l, f]) => [l, holes.filter((x) => f(x.score - x.par)).length]);
  const maxD = Math.max(...dist.map((x) => x[1]));
  const worst = [...holes].sort((a, b) => (b.score - b.par) - (a.score - a.par))[0];
  const Nine = ({ a, b, label }) => (
    <div className="rv-nine">
      <div className="rv-nine__r is-h"><span>{label}</span>{holes.slice(a, b).map((x) => <button key={x.n} className={x.n === sel ? 'is-sel' : ''} onClick={() => setSel(x.n)}>{x.n}</button>)}<span>Tot</span></div>
      <div className="rv-nine__r is-p"><span>Par</span>{holes.slice(a, b).map((x) => <span key={x.n}>{x.par}</span>)}<span>{sum(a, b, 'par')}</span></div>
      <div className="rv-nine__r is-s"><span>Score</span>{holes.slice(a, b).map((x) => <button key={x.n} className={x.n === sel ? 'is-sel' : ''} onClick={() => setSel(x.n)}><ScoreMark score={x.score} par={x.par} size="sm" /></button>)}<b>{sum(a, b, 'score')}</b></div>
      <div className="rv-nine__r"><span>Putts</span>{holes.slice(a, b).map((x) => <span key={x.n} className={x.putts >= 3 ? 'is-warn' : ''}>{x.putts}</span>)}<span>{sum(a, b, 'putts')}</span></div>
      <div className="rv-nine__r is-t"><span>FIR</span>{holes.slice(a, b).map((x) => <span key={x.n}>{x.fir == null ? <i className="is-na">–</i> : x.fir ? <i className="is-y"></i> : <i className="is-n"></i>}</span>)}<span></span></div>
      <div className="rv-nine__r is-t"><span>GIR</span>{holes.slice(a, b).map((x) => <span key={x.n}>{x.gir ? <i className="is-y"></i> : <i className="is-n"></i>}</span>)}<span></span></div>
    </div>
  );
  return (
    <div className="rf rv">
      <button className="rv-back" onClick={onBack}><Icon name="chevron-left" size={16} />Rounds</button>
      <header className="rv-hero" style={{ backgroundImage: `linear-gradient(90deg,rgb(11 58 37/.96) 0%,rgb(11 58 37/.86) 45%,rgb(11 58 37/.25) 100%),url(${c.img})` }}>
        <div className="rv-hero__l"><span className="rv-hero__k">{rd.dow} {rd.d} · {rd.type}</span><h1>{c.name}</h1><span className="rv-hero__m"><i style={{ background: tee.hex }}></i><span>{`${tee.name} tees · ${tee.total.toLocaleString()} yds · ${tee.rating} / ${tee.slope}`}</span></span></div>
        <div className="rv-hero__s"><b>{score}</b><em className={score < par ? 'is-under' : ''}>{tp(score - par)}</em><span>Strokes</span></div>
      </header>
      <dl className="rv-figs">{[['Front 9', sum(0, 9, 'score'), tp(sum(0, 9, 'score') - sum(0, 9, 'par'))], ['Back 9', sum(9, 18, 'score'), tp(sum(9, 18, 'score') - sum(9, 18, 'par'))], ['Putts', putts, (putts / 18).toFixed(1) + ' / hole'], ['Fairways', fir + '/' + firp, Math.round((fir / firp) * 100) + '%'], ['Greens', gir + '/18', Math.round((gir / 18) * 100) + '%']].map(([k, v, m]) => <div key={k}><dt>{k}</dt><dd>{v}</dd><span>{m}</span></div>)}</dl>
      <section className="rf-card rv-card"><div className="rf-card__h"><div><h3>Scorecard</h3><span>Tap a hole to see every shot</span></div></div><div className="rv-cardw"><Nine a={0} b={9} label="Out" /><Nine a={9} b={18} label="In" /></div></section>
      <div className="rv-cols">
        <section className="rf-card rv-hole">
          <div className="rf-card__h"><div><h3>Hole {h.n} · Par {h.par} · {h.y} yds</h3><span>{h.shots.length} shots · {h.putts} putts</span></div>
            <div className="rv-nav"><button onClick={() => setSel(Math.max(1, sel - 1))} aria-label="Previous hole"><Icon name="chevron-left" size={16} /></button><ScoreMark score={h.score} par={h.par} /><button onClick={() => setSel(Math.min(18, sel + 1))} aria-label="Next hole"><Icon name="chevron-right" size={16} /></button></div></div>
          <div className="rv-hole__b">
            <ol className="rv-shots">{h.shots.map((s, i) => <li key={i}><span className={'rv-shots__n is-' + s.lie}>{i + 1}</span><div><b>{s.type}{s.club ? ' · ' + s.club : ''}</b><span>{s.from} {s.type === 'Putt' || (i > 0 && h.shots[i - 1].unit === 'ft') ? 'ft' : 'yds'} → {s.lie === 'hole' ? 'holed' : LIES[s.lie].toLowerCase() + ', ' + s.to + ' ' + s.unit}{s.miss ? ' · missed ' + s.miss : ''}</span>{s.brk && <em>{s.brk === 'straight' ? 'Straight' : s.brk === 'left_to_right' ? 'Left to right' : 'Right to left'} · {s.slope}</em>}</div><span className={'rv-lie is-' + s.lie}>{LIES[s.lie]}</span></li>)}</ol>
          </div>
        </section>
        <div className="rf-col">
          <section className="rf-card"><div className="rf-card__h"><div><h3>Scoring distribution</h3><span>18 holes</span></div></div>
            <div className="rv-dist">{dist.map(([l, n]) => <div key={l} className={'rv-dist__r is-' + l.replace('+', '').toLowerCase()}><span>{l}</span><span className="rv-dist__t"><i style={{ width: maxD ? (n / maxD) * 100 + '%' : 0 }}></i></span><b>{n}</b></div>)}</div></section>
          <section className="rv-recap"><span className="rv-recap__k"><Icon name="sparkles" size={14} />Round recap</span>
            <p>{gir >= 10 ? 'Ball-striking carried this one: ' + gir + ' greens.' : 'Only ' + gir + ' greens, so scoring leaned on the short game.'} The damage came on {worst.n}, a {worst.score} on a par {worst.par}. {putts > 31 ? 'Putting cost the most, ' + putts + ' putts.' : 'Putting held at ' + putts + '.'}</p>
            <div className="rv-recap__f"><span><b>Focus</b> Approach from 125–150</span><span><b>Keep</b> Lag putting inside 3 ft</span></div></section>
          <section className="rf-card rv-notes"><div className="rf-card__h"><div><h3>Coach notes</h3><span>Coach Reyes · Oct 14</span></div></div><p>Good patience on the back nine. The tee shot on {worst.n} is the one to fix before Thursday.</p></section>
        </div>
      </div>
    </div>
  );
}
Object.assign(window, { RoundReview: Review });
})();
