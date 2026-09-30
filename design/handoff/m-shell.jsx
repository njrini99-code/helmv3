(() => {
const { Icon, ScoreMark } = window.FairwayClubhouseEdition_9c4f4d;
const TABS = [['home', 'house', 'Home'], ['helm', 'sparkles', 'Helm'], ['rounds', 'flag', 'Rounds'], ['stats', 'chart-column', 'Stats'], ['more', 'layout-grid', 'More']];

function MTop({ title, back, onBack, right, large }) {
  return (
    <header className={'qm-top' + (large ? ' m-top--lg' : '')}>
      {back ? <button className="qm-back" onClick={onBack}><Icon name="chevron-left" size={20} />{back}</button> : <b className="qm-top__t">{title}</b>}
      {back && <b className="qm-top__c">{title}</b>}
      <span className="qm-top__r">{right !== undefined ? right : <button className="qm-ib" aria-label="Notifications"><Icon name="bell" size={20} /><i className="qm-dotn">5</i></button>}</span>
    </header>
  );
}
function MTabs({ on, role, badge = { more: 3 } }) {
  return <nav className="qm-tabs">{((window.GH && GH.tabs && GH.tabs[role || GH.role]) || TABS).map(([id, ic, l]) => <button key={id} className={'qm-tab' + (on === id ? ' is-on' : '')}><span className="m-tabic"><Icon name={ic} size={21} />{badge[id] ? <i className="m-tabdot">{badge[id]}</i> : null}</span><span>{l}</span></button>)}</nav>;
}
function MSafari() {
  return (
    <div className="qm-safari"><div className="qm-safari__pill"><Icon name="text" size={15} /><span><Icon name="lock" size={11} />golfhelm.app</span><Icon name="rotate-cw" size={15} /></div>
      <div className="qm-safari__row"><Icon name="chevron-left" size={20} /><Icon name="chevron-right" size={20} /><Icon name="share" size={18} /><Icon name="book-open" size={18} /><Icon name="copy" size={18} /></div></div>
  );
}
function MSheet({ title, sub, onClose, children, foot, tall }) {
  return (
    <div className="qm-sheetwrap" onClick={onClose}>
      <div className={'qm-sheet' + (tall ? ' m-sheet--tall' : '')} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <span className="qm-grab"></span>
        <div className="qm-sheet__h"><div><b>{title}</b>{sub && <span>{sub}</span>}</div><button className="qm-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
        <div className="qm-sheet__b">{children}</div>
        {foot && <div className="qm-sheet__f">{foot}</div>}
      </div>
    </div>
  );
}
function MNine({ holes, start, label }) {
  const sum = (k) => holes.reduce((s, h) => s + h[k], 0);
  return (
    <div className="qm-nine">
      <div className="qm-nine__row qm-nine__row--h"><span>{label}</span>{holes.map((h, i) => <span key={i}>{start + i}</span>)}<span>Tot</span></div>
      <div className="qm-nine__row qm-nine__row--p"><span>Par</span>{holes.map((h, i) => <span key={i}>{h.par}</span>)}<span>{sum('par')}</span></div>
      <div className="qm-nine__row"><span>Score</span>{holes.map((h, i) => <span key={i}><ScoreMark score={h.score} par={h.par} size="sm" /></span>)}<b>{sum('score')}</b></div>
    </div>
  );
}
function MSpark({ data, w = 64, h = 22, lowGood = true }) {
  const lo = Math.min(...data) - 0.4, hi = Math.max(...data) + 0.4, p = 2;
  const x = (i) => p + (i * (w - p * 2)) / Math.max(1, data.length - 1), y = (v) => p + ((v - lo) / (hi - lo)) * (h - p * 2);
  const ch = data[data.length - 1] - data[0], good = lowGood ? ch < -0.5 : ch > 0.5, bad = lowGood ? ch > 0.5 : ch < -0.5;
  const c = good ? 'var(--chart-gain)' : bad ? 'var(--chart-loss)' : 'var(--ink-400)';
  const d = data.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><path d={d} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="2.4" fill={c} /></svg>;
}
function MApp({ children, top, tab, sheet }) {
  return <div className="qm fairway">{top}<div className="qm-scroll">{children}</div>{tab && <MTabs on={tab} />}<MSafari />{sheet}</div>;
}
const mSgn = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
const mPar = (v) => v == null ? '—' : v === 0 ? 'E' : (v > 0 ? '+' : '−') + Math.abs(v);
Object.assign(window, { MTop, MTabs, MSafari, MSheet, MNine, MSpark, MApp, mSgn, mPar });
})();
