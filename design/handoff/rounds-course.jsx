(() => {
const { Icon, Button } = window.FairwayClubhouseEdition_9c4f4d;
const COLORS = [['Black', '#1C1B18'], ['Blue', '#2F5E9E'], ['White', '#FFFFFF'], ['Gold', '#C9A227'], ['Red', '#B03A2E'], ['Green', '#1E6B45']];
const BASE = [4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const YDS = [412, 538, 176, 395, 441, 204, 552, 368, 427, 402, 385, 188, 561, 432, 356, 167, 523, 457];
const STEPS = ['Course', 'Tees', 'Holes', 'Review'];

function AddCourse({ initial = {}, onClose, onSave }) {
  const [step, setStep] = React.useState(initial.step || 0);
  const [c, setC] = React.useState({ name: initial.step ? 'Chapel Ridge GC' : '', city: 'Pittsboro', state: 'NC', holes: 18 });
  const [tees, setTees] = React.useState([{ name: 'Blue', hex: '#2F5E9E', rating: '72.8', slope: '134' }, { name: 'White', hex: '#FFFFFF', rating: '70.4', slope: '127' }]);
  const [ti, setTi] = React.useState(0);
  const [holes, setHoles] = React.useState(BASE.map((p, i) => ({ n: i + 1, par: p, y: String(YDS[i]) })));
  const par = holes.reduce((s, h) => s + h.par, 0), yds = holes.reduce((s, h) => s + (+h.y || 0), 0);
  const filled = holes.filter((h) => +h.y > 0).length;
  const setH = (n, k, v) => setHoles(holes.map((h) => (h.n === n ? { ...h, [k]: v } : h)));
  const ok = [c.name.trim().length > 2, tees.every((t) => t.name && t.rating && t.slope), filled === 18, true][step];
  return (
    <div className="ac-scrim" onClick={onClose}><div className="ac" role="dialog" aria-label="Add a course" onClick={(e) => e.stopPropagation()}>
      <span className="rf-grab"></span>
      <header className="ac-h">
        <button className="rf-back" onClick={() => (step ? setStep(step - 1) : onClose && onClose())}><Icon name="chevron-left" size={18} />{step ? STEPS[step - 1] : 'Courses'}</button>
        <button className="rf-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
      </header>
      <div className="ac-top"><span className="ac-k">Add a course · step {step + 1} of 4</span><h2>{['Where are you playing?', 'Which tees are there?', 'Par and yardage', 'Check and save'][step]}</h2>
        <div className="ac-spine">{STEPS.map((s, i) => <span key={s} className={i < step ? 'is-done' : i === step ? 'is-on' : ''}><i></i><em>{s}</em></span>)}</div></div>
      <div className="ac-b">
        {step === 0 && <>
          <label className="rf-field"><span>Course name</span><input className="rf-in ac-big" autoFocus value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Chapel Ridge Golf Club" /></label>
          <div className="ac-2"><label className="rf-field"><span>City</span><input className="rf-in" value={c.city} onChange={(e) => setC({ ...c, city: e.target.value })} /></label><label className="rf-field"><span>State</span><input className="rf-in" value={c.state} onChange={(e) => setC({ ...c, state: e.target.value })} maxLength={2} /></label></div>
          <div className="rf-field"><span>Holes</span><div className="rf-seg is-full" role="radiogroup">{[[18, '18 holes'], [9, '9 holes']].map(([v, l]) => <button key={v} role="radio" aria-checked={c.holes === v} onClick={() => setC({ ...c, holes: v })}>{l}</button>)}</div></div>
          <button className="ac-photo"><span><Icon name="image-plus" size={18} /></span><b>Add a course photo</b><em>Optional · shows on the course card and round review</em></button>
          <p className="ac-note"><Icon name="users" size={14} />Saved to your team’s courses, so teammates can pick it too.</p>
        </>}
        {step === 1 && <>
          <div className="ac-tees">{tees.map((t, i) => <button key={i} className={'ac-tee' + (ti === i ? ' is-on' : '')} onClick={() => setTi(i)}><i style={{ background: t.hex }}></i><b>{t.name || 'New tee'}</b><em>{t.rating && t.slope ? t.rating + ' / ' + t.slope : 'Not set'}</em></button>)}
            <button className="ac-tee is-add" onClick={() => { setTees([...tees, { name: '', hex: '#C9A227', rating: '', slope: '' }]); setTi(tees.length); }}><Icon name="plus" size={16} /><b>Add tee</b></button></div>
          <div className="ac-card">
            <div className="rf-field"><span>Tee colour</span><div className="ac-sw">{COLORS.map(([n, h]) => <button key={n} aria-pressed={tees[ti].hex === h} onClick={() => setTees(tees.map((t, i) => (i === ti ? { ...t, hex: h, name: t.name || n } : t)))} aria-label={n}><i style={{ background: h }}></i></button>)}</div></div>
            <label className="rf-field"><span>Tee name</span><input className="rf-in" value={tees[ti].name} onChange={(e) => setTees(tees.map((t, i) => (i === ti ? { ...t, name: e.target.value } : t)))} placeholder="Blue" /></label>
            <div className="ac-2"><label className="rf-field"><span>Course rating</span><input className="rf-in" inputMode="decimal" value={tees[ti].rating} onChange={(e) => setTees(tees.map((t, i) => (i === ti ? { ...t, rating: e.target.value } : t)))} placeholder="72.8" /></label><label className="rf-field"><span>Slope</span><input className="rf-in" inputMode="numeric" value={tees[ti].slope} onChange={(e) => setTees(tees.map((t, i) => (i === ti ? { ...t, slope: e.target.value } : t)))} placeholder="134" /></label></div>
            <p className="ac-note"><Icon name="info" size={14} />Rating and slope are on the scorecard, usually beside the tee name.</p>
          </div>
        </>}
        {step === 2 && <>
          <div className="ac-teebar"><i style={{ background: tees[ti].hex }}></i><b>{tees[ti].name} tees</b><span>{filled} of 18 holes · par {par} · {yds.toLocaleString()} yds</span></div>
          <div className="ac-prog"><i style={{ width: (filled / 18) * 100 + '%' }}></i></div>
          <div className="ac-holes">{[[0, 9, 'Out'], [9, 18, 'In']].map(([a, b, l]) => <div key={l} className="ac-nine"><div className="ac-nine__h"><b>{l}</b><span>Par {holes.slice(a, b).reduce((s, h) => s + h.par, 0)} · {holes.slice(a, b).reduce((s, h) => s + (+h.y || 0), 0).toLocaleString()} yds</span></div>
            {holes.slice(a, b).map((h) => <div key={h.n} className="rf-hole"><span className="rf-hole__n">{h.n}</span><div className="rf-par" role="radiogroup" aria-label={`Hole ${h.n} par`}>{[3, 4, 5].map((p) => <button key={p} role="radio" aria-checked={h.par === p} onClick={() => setH(h.n, 'par', p)}>{p}</button>)}</div><label className="rf-yds"><input inputMode="numeric" value={h.y} onChange={(e) => setH(h.n, 'y', e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label={`Hole ${h.n} yardage`} /><em>yds</em></label></div>)}</div>)}</div>
          {tees.length > 1 && <p className="ac-note"><Icon name="copy" size={14} />Pars copy to the {tees.filter((_, i) => i !== ti).map((t) => t.name).join(', ')} tees. You’ll only enter their yardages.</p>}
        </>}
        {step === 3 && <div className="ac-rv">
          <div className="ac-rv__hero"><span className="ac-rv__img"><Icon name="flag" size={26} /></span><div><b>{c.name || 'Chapel Ridge GC'}</b><span>{c.city}, {c.state} · {c.holes} holes · par {par}</span></div></div>
          <div className="ac-rv__tees">{tees.map((t) => <div key={t.name}><i style={{ background: t.hex }}></i><b>{t.name}</b><span>{t.name === tees[ti].name ? yds.toLocaleString() + ' yds' : 'yardage to add'}</span><em>{t.rating} / {t.slope}</em></div>)}</div>
          <div className="rt-mc"><div className="rt-mc__r is-h"><span>Out</span>{holes.slice(0, 9).map((h) => <span key={h.n}>{h.n}</span>)}<span>Tot</span></div><div className="rt-mc__r is-p"><span>Par</span>{holes.slice(0, 9).map((h) => <span key={h.n}>{h.par}</span>)}<span>{holes.slice(0, 9).reduce((s, h) => s + h.par, 0)}</span></div><div className="rt-mc__r is-h"><span>In</span>{holes.slice(9).map((h) => <span key={h.n}>{h.n}</span>)}<span>Tot</span></div><div className="rt-mc__r is-p"><span>Par</span>{holes.slice(9).map((h) => <span key={h.n}>{h.par}</span>)}<span>{holes.slice(9).reduce((s, h) => s + h.par, 0)}</span></div></div>
        </div>}
      </div>
      <footer className="ac-f"><span className="ac-f__s">{['Name and location', tees.length + ' tee sets', filled + ' of 18 holes filled', 'Ready to save'][step]}</span><Button variant="primary" size="lg" disabled={!ok} rightIcon={step === 3 ? 'check' : 'arrow-right'} onClick={() => (step < 3 ? setStep(step + 1) : onSave && onSave())}>{step === 3 ? 'Save and pick tees' : 'Next: ' + STEPS[step + 1]}</Button></footer>
    </div></div>
  );
}
Object.assign(window, { AddCourse });
})();
