(() => {
const { Icon, Button, Badge, ScoreMark } = window.FairwayClubhouseEdition_9c4f4d;
const R = window.RND, tp = window.rndTp;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ');
const LIES = { fairway: 'Fairway', rough: 'Rough', sand: 'Sand', green: 'Green', hole: 'Holed', other: 'Other' };
const AMISS = [['long_left', 'Long left'], ['long', 'Long'], ['long_right', 'Long right'], ['left', 'Left'], ['pin', ''], ['right', 'Right'], ['short_left', 'Short left'], ['short', 'Short'], ['short_right', 'Short right']];
const PTAGS = ['Short', 'Long', 'Missed left', 'Missed right', 'Low side', 'High side', 'Bad read', 'Bad speed'];
const PEN = [['ob', 'Out of bounds', 'Stroke and distance · replay from the previous spot'], ['water', 'Water hazard', 'One stroke · drop near where it crossed'], ['unplayable', 'Unplayable lie', 'One stroke · take relief'], ['lost', 'Lost ball', 'Stroke and distance · replay from the previous spot']];

/* deterministic full round for review + prior holes */
function buildRound(holes, target) {
  const pattern = [0, 1, 0, 0, -1, 0, 1, 0, 0, 0, -1, 0, 1, 0, 0, 0, 1, 0];
  if (target != null) { let sum = pattern.reduce((a, b) => a + b, 0); const order = [2, 7, 14, 9, 5, 15, 0, 11, 3, 8, 13, 16, 6, 1, 17, 4, 10, 12]; let k = 0; while (sum !== target && k < 60) { const i = order[k % 18]; const st = target > sum ? 1 : -1; if (pattern[i] + st <= 2 && pattern[i] + st >= -1) { pattern[i] += st; sum += st; } k++; } }
  return holes.map((h, i) => {
    const d = pattern[i], putts = d < 0 ? 1 : d > 0 && i % 2 ? 3 : 2;
    const shots = [];
    const teeLie = h.par === 3 ? (d <= 0 ? 'green' : 'sand') : i % 3 === 1 ? 'rough' : 'fairway';
    const approachN = h.par + d - putts - (h.par === 3 ? 0 : 1);
    shots.push({ type: 'Tee', club: h.par === 3 ? null : i % 4 === 2 ? 'Non-driver' : 'Driver', lie: h.par === 3 && teeLie === 'green' ? 'green' : teeLie, from: h.y, to: h.par === 3 ? (teeLie === 'green' ? 24 : 18) : Math.round(h.y * (h.par === 5 ? 0.46 : 0.36)), unit: h.par === 3 && teeLie === 'green' ? 'ft' : 'yds', miss: teeLie === 'rough' ? 'right' : null });
    let from = shots[0].to;
    for (let k = 0; k < Math.max(0, approachN); k++) { const last = k === approachN - 1; const to = last ? 12 + ((i * 7) % 26) : Math.round(from * 0.3); shots.push({ type: from < 40 ? 'Around green' : 'Approach', lie: last ? 'green' : 'fairway', from, to, unit: last ? 'ft' : 'yds' }); from = to; }
    if (shots[shots.length - 1].lie !== 'green') { shots.push({ type: 'Around green', lie: 'green', from: 8, to: 9, unit: 'ft' }); from = 9; }
    for (let k = 0; k < putts; k++) { const last = k === putts - 1; const f = k === 0 ? shots[shots.length - 1].to : 3; shots.push({ type: 'Putt', lie: last ? 'hole' : 'green', from: f, to: last ? 0 : 3, unit: 'ft', brk: ['left_to_right', 'straight', 'right_to_left'][i % 3], slope: ['uphill', 'level', 'downhill'][i % 3] }); }
    const score = h.par + d;
    return { ...h, score, putts, shots: shots.slice(0, score), fir: h.par === 3 ? null : teeLie === 'fairway', gir: score - putts <= h.par - 2 };
  });
}
window.buildTrackedRound = buildRound;

function HoleMap({ hole, shots, pending }) {
  const W = 160, H = 300, gx = 80, gy = 34, tx = 80, ty = 276;
  const pts = [[tx, ty]];
  let rem = hole.y;
  shots.forEach((s) => { const left = s.lie === 'hole' ? 0 : s.unit === 'ft' ? s.to / 3 : s.to; rem = left; const f = Math.max(0, Math.min(1, left / hole.y)); const off = s.lie === 'rough' || s.lie === 'sand' || s.lie === 'other' ? (s.miss === 'left' ? -34 : 34) : s.lie === 'green' ? (pts.length % 2 ? 6 : -6) : 0; pts.push([gx + off * Math.min(1, f * 3), gy + (ty - gy) * f]); });
  const d = hole.par === 3 ? 'M70,288 C66,220 64,120 62,60 C58,30 102,30 98,60 C96,120 94,220 90,288 Z' : hole.par === 5 ? 'M64,290 C58,230 90,180 86,130 C82,90 60,70 62,48 C64,22 104,22 100,52 C98,78 112,100 108,140 C104,190 84,230 96,290 Z' : 'M66,290 C60,220 58,140 60,70 C60,30 100,30 100,70 C102,140 100,220 94,290 Z';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rt-map" role="img" aria-label={`Hole ${hole.n} map with ${shots.length} shots`}>
      <defs><pattern id="rtm" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(90)"><rect width="8" height="8" fill="#3E7A52" /><rect width="4" height="8" fill="#37704A" /></pattern></defs>
      <rect x="0" y="0" width={W} height={H} rx="14" fill="#2C5E3F" />
      <path d={d} fill="url(#rtm)" stroke="rgb(255 255 255/.12)" />
      {hole.par !== 3 && <ellipse cx="112" cy={hole.par === 5 ? 118 : 150} rx="10" ry="7" fill="#E9DFC4" opacity=".9" />}
      <ellipse cx="54" cy="58" rx="8" ry="6" fill="#E9DFC4" opacity=".9" />
      <ellipse cx={gx} cy={gy + 4} rx="22" ry="16" fill="#5FA173" stroke="rgb(255 255 255/.25)" />
      <line x1={gx} y1={gy + 4} x2={gx} y2={gy - 16} stroke="#fff" strokeWidth="1.2" /><path d={`M${gx},${gy - 16} l12,4 l-12,4 z`} fill="#D64B3C" /><circle cx={gx} cy={gy + 4} r="2.2" fill="#12110E" />
      <rect x={tx - 8} y={ty + 4} width="16" height="6" rx="2" fill="#E9DFC4" opacity=".7" />
      {pts.length > 1 && <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#F4F1E8" strokeWidth="1.6" strokeDasharray="3 4" strokeLinecap="round" />}
      {pts.map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r={i === pts.length - 1 ? 6.5 : 5} fill={i === pts.length - 1 && pending ? '#F4F1E8' : '#0B3A25'} stroke="#F4F1E8" strokeWidth="1.6" />{i > 0 && <text x={x} y={y + 3} textAnchor="middle" className={'rt-map__n' + (i === pts.length - 1 && pending ? ' is-cur' : '')}>{i}</text>}</g>)}
    </svg>
  );
}

function ShotLog({ shots }) {
  const [open, setOpen] = React.useState(false);
  if (!shots.length) return <div className="rt-log is-empty"><Icon name="flag" size={14} />No shots yet on this hole</div>;
  const lastS = shots[shots.length - 1];
  return (
    <div className={'rt-log' + (open ? ' is-open' : '')}>
      <button className="rt-log__h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="rt-log__dots">{shots.map((s, i) => <i key={i} className={'is-' + s.lie}>{i + 1}</i>)}</span>
        <span className="rt-log__t"><b>{shots.length} shot{shots.length > 1 ? 's' : ''}{shots.some((s) => s.pen) ? ' · 1 penalty' : ''}</b><em>Last: {lastS.type === 'Tee' && lastS.club ? lastS.club : lastS.type} → {LIES[lastS.lie]}{lastS.lie !== 'hole' ? ', ' + lastS.to + (lastS.unit === 'ft' ? ' ft' : ' yds') : ''}</em></span>
        <Icon name="chevron-down" size={16} className="rt-log__chev" />
      </button>
      <div className="rt-log__b"><div>{shots.map((s, i) => <div key={i} className="rt-log__r"><span className={'rt-log__n is-' + s.lie}>{i + 1}</span><span className="rt-log__rb"><b>{s.type}{s.club ? ' · ' + s.club : ''}</b><em>{s.from}{s.fromUnit === 'ft' ? ' ft' : ' yds'} → {s.lie === 'hole' ? 'holed' : LIES[s.lie] + ' · ' + s.to + (s.unit === 'ft' ? ' ft' : ' yds')}</em></span>{s.pen && <strong>+1</strong>}</div>)}</div></div>
    </div>
  );
}

function Strip({ holes, cur, done, onJump }) {
  const total = Object.values(done).reduce((s, h) => s + h.score, 0), par = Object.keys(done).reduce((s, k) => s + holes[k - 1].par, 0);
  return (
    <div className="rt-strip">{holes.map((h) => { const d = done[h.n]; return <button key={h.n} className={'rt-strip__h' + (h.n === cur ? ' is-cur' : '') + (d ? ' is-done' : '')} onClick={() => d && onJump(h.n)} aria-label={`Hole ${h.n}${d ? ', ' + d.score : ''}`}><em>{h.n}</em>{d ? <ScoreMark score={d.score} par={h.par} size="sm" /> : <b>{h.n === cur ? '•' : ''}</b>}</button>; })}
      <div className="rt-strip__tot"><em>Thru {Object.keys(done).length}</em><b>{Object.keys(done).length ? tp(total - par) : 'E'}</b></div></div>
  );
}

function Seg({ value, onChange, options, cols }) {
  return <div className={'rt-seg' + (cols ? ' rt-seg--grid' : '')} role="radiogroup" style={cols ? { gridTemplateColumns: `repeat(${cols},1fr)` } : null}>{options.map(([v, l, sub]) => <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={sub === 'rare' ? 'is-rare' : ''}>{l}{sub && sub !== 'rare' && <em>{sub}</em>}</button>)}</div>;
}
const Sec = ({ label, hint, tint, children }) => <div className={'rt-sec' + (tint ? ' is-tint' : '')}><div className="rt-sec__h"><span>{label}</span>{hint && <em className={'rt-hint is-' + hint.toLowerCase()}>{hint}</em>}</div>{children}</div>;

function Sheet({ title, sub, onClose, children, foot, wide }) {
  return <div className="rt-scrim" onClick={onClose}><div className={'rt-sheet' + (wide ? ' is-wide' : '')} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}><span className="rf-grab"></span><div className="rt-sheet__h"><div><b>{title}</b>{sub && <span>{sub}</span>}</div><button className="rf-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div><div className="rt-sheet__b">{children}</div>{foot && <div className="rt-sheet__f">{foot}</div>}</div></div>;
}

function Tracking({ initial = {}, onExit, onReview }) {
  const tee = R.courses.find((c) => c.id === 'finley').tees.find((t) => t.id === 'blue');
  const holes = tee.holes;
  const full = React.useMemo(() => buildRound(holes), []);
  const startHole = initial.hole || 4;
  const [done, setDone] = React.useState(() => { const o = {}; full.slice(0, startHole - 1).forEach((h) => (o[h.n] = { score: h.score, putts: h.putts, shots: h.shots })); return o; });
  const [hn, setHn] = React.useState(startHole);
  const hole = holes[hn - 1];
  const [shots, setShots] = React.useState(initial.shots || []);
  const blank = { club: null, result: null, miss: null, amiss: null, brk: null, slope: null, tags: [], dist: '' };
  const [e, setE] = React.useState({ ...blank, ...(initial.entry || {}) });
  const [modal, setModal] = React.useState(initial.modal || null);
  const [pen, setPen] = React.useState({ type: 'water', which: 'last' });
  const [submit, setSubmit] = React.useState(initial.submit || null);
  const [holeDone, setHoleDone] = React.useState(!!initial.holeDone);
  const last = shots[shots.length - 1];
  const kind = !shots.length ? 'tee' : last.lie === 'green' ? 'putt' : 'approach';
  const remaining = !shots.length ? hole.y : last.to;
  const remUnit = !shots.length ? 'yds' : last.unit;
  const around = kind === 'approach' && remUnit === 'yds' && remaining <= 40;
  const opts = kind === 'putt' ? ['hole', 'green', 'rough', 'sand'] : kind === 'tee' && hole.par === 3 ? ['green', 'rough', 'sand', 'hole', 'other'] : ['fairway', 'rough', 'sand', 'green', 'hole', 'other'];
  const rare = (r) => (kind === 'tee' && (r === 'hole' || (r === 'green' && hole.par !== 3))) || (kind === 'putt' && (r === 'rough' || r === 'sand'));
  const sub = (r) => r === 'green' && kind === 'approach' ? 'not fringe' : r === 'hole' && kind === 'tee' ? 'ace' : kind === 'putt' && (r === 'rough' || r === 'sand') ? 'rolled off' : rare(r) ? 'rare' : null;
  const needMiss = (kind === 'tee' && ['rough', 'sand', 'other'].includes(e.result)) || (kind === 'approach' && e.result && !['green', 'hole'].includes(e.result));
  const distLabel = kind === 'putt' ? 'Leave distance (ft)' : e.result === 'green' ? 'Proximity to hole (ft)' : 'Distance remaining (yds)';
  const ready = e.result && (e.result === 'hole' || +e.dist > 0) && (kind !== 'tee' || hole.par === 3 || e.club) && (!needMiss || (kind === 'tee' ? e.miss : e.amiss));
  const score = shots.length + (shots.filter((s) => s.pen).length);
  const shotLen = e.dist && remUnit === 'yds' && e.result !== 'green' && e.result !== 'hole' ? remaining - +e.dist : null;

  const next = () => {
    const s = { type: kind === 'tee' ? 'Tee' : kind === 'putt' ? 'Putt' : around ? 'Around green' : 'Approach', club: kind === 'tee' && hole.par !== 3 ? e.club : null, lie: e.result, from: remaining, fromUnit: remUnit, to: e.result === 'hole' ? 0 : +e.dist, unit: e.result === 'hole' ? 'ft' : kind === 'putt' || e.result === 'green' ? 'ft' : 'yds', miss: e.miss, amiss: e.amiss, brk: e.brk, slope: e.slope, tags: e.tags };
    const ns = [...shots, s]; setShots(ns); setE(blank);
    if (e.result === 'hole') setHoleDone(true);
  };
  const finishHole = () => {
    const sc = shots.length + shots.filter((s) => s.pen).length;
    const nd = { ...done, [hn]: { score: sc, putts: shots.filter((s) => s.type === 'Putt').length, shots } }; setDone(nd); setHoleDone(false);
    if (hn === 18) { setModal('summary'); return; }
    setHn(hn + 1); setShots([]);
  };
  const addPen = () => { const ns = [...shots]; const i = ns.length - 1; if (i >= 0) ns[i] = { ...ns[i], pen: pen.type }; setShots(ns); setModal(null); };
  const undo = () => { setShots(shots.slice(0, -1)); setHoleDone(false); };

  const totals = Object.entries(done).reduce((a, [n, d]) => ({ s: a.s + d.score, p: a.p + holes[n - 1].par, pt: a.pt + d.putts }), { s: 0, p: 0, pt: 0 });
  const sheetHoles = full.map((h) => (done[h.n] ? { ...h, score: done[h.n].score } : h));

  return (
    <div className="rt">
      <header className="rt-top">
        <button className="rt-exit" onClick={() => setModal('save')}><Icon name="x" size={16} />Exit</button>
        <div className="rt-top__c"><b>Finley GC</b><span><i style={{ background: tee.hex }}></i>Blue tees · Practice</span></div>
        <button className="rt-card" onClick={() => setModal('card')}><Icon name="table-2" size={16} /><span>Scorecard</span></button>
      </header>
      <Strip holes={holes} cur={hn} done={done} onJump={() => setModal('card')} />
      <div className="rt-body">
        <section className="rt-hero">
          <div className="rt-hero__main">
            <div className="rt-hero__k"><b className="rt-hno"><em>Hole</em>{hn}</b><span className="rt-hmeta"><b>{`Par ${hole.par}`}</b><i>{`${hole.y} yds`}</i><i>{`Hcp ${((hn * 7) % 18) + 1}`}</i></span></div>
            {holeDone ? <div className="rt-hero__done"><ScoreMark score={score} par={hole.par} /><div><b>{score - hole.par === 0 ? 'Par' : score - hole.par === -1 ? 'Birdie' : score - hole.par === 1 ? 'Bogey' : tp(score - hole.par)}</b><span>{score} strokes · {shots.filter((s) => s.type === 'Putt').length} putts</span></div></div>
              : <div className="rt-hero__dist"><span className="rt-hero__shot">Shot {shots.length + 1}<em>{kind === 'tee' ? 'Tee shot' : kind === 'putt' ? 'Putt' : around ? 'Around the green' : 'Approach'}</em></span><b>{remaining}</b><em>{remUnit === 'ft' ? 'feet to hole' : 'yards to pin'}</em></div>}

          </div>
          <HoleMap hole={hole} shots={shots} pending={!holeDone} />
          <ShotLog shots={shots} />
        </section>

        {holeDone ? (
          <section className="rt-panel rt-review">
            <div className="rt-review__h"><b>Shot review</b><span>Tap any shot to edit</span></div>
            {shots.map((s, i) => <button key={i} className="rt-rs" onClick={() => setModal('edit')}><span className="rt-rs__n">{i + 1}</span><span className="rt-rs__b"><b>{s.type}{s.club ? ' · ' + s.club : ''}</b><span>{s.from}{s.fromUnit === 'ft' ? ' ft' : ' yds'} → {s.lie === 'hole' ? 'holed' : LIES[s.lie].toLowerCase() + ' · ' + s.to + (s.unit === 'ft' ? ' ft' : ' yds')}{s.brk ? ' · ' + ({ left_to_right: 'L → R', right_to_left: 'R → L', straight: 'straight', multiple: 'multiple breaks' })[s.brk] : ''}{s.slope ? ', ' + s.slope : ''}</span></span><Icon name="pencil" size={14} /></button>)}
            <div className="rt-review__f"><Button variant="ghost" leftIcon="undo-2" onClick={undo}>Undo last shot</Button><Button variant="primary" size="lg" rightIcon="arrow-right" onClick={finishHole}>{hn === 18 ? 'Finish round' : 'Next hole · ' + (hn + 1)}</Button></div>
          </section>
        ) : (
          <section className="rt-panel">
            {kind === 'tee' && hole.par !== 3 && <Sec label="Club off tee"><Seg value={e.club} onChange={(v) => setE({ ...e, club: v })} options={[['Driver', 'Driver'], ['Non-driver', 'Non-driver']]} /></Sec>}
            {kind === 'putt' && <Sec label="Putting details" hint="Optional" tint>
              <div className="rt-sub"><em>Break</em><Seg value={e.brk} onChange={(v) => setE({ ...e, brk: v })} options={[['left_to_right', 'L → R'], ['straight', 'Straight'], ['right_to_left', 'R → L'], ['multiple', 'Mult.']]} /></div>
              <div className="rt-sub"><em>Slope</em><Seg value={e.slope} onChange={(v) => setE({ ...e, slope: v })} options={[['uphill', 'Uphill'], ['level', 'Level'], ['downhill', 'Down'], ['severe', 'Severe']]} /></div></Sec>}
            <Sec label={kind === 'putt' ? 'Putt result' : 'Shot result'}><Seg cols={3} value={e.result} onChange={(v) => setE({ ...e, result: v, miss: null, amiss: null, tags: [] })} options={opts.map((r) => [r, LIES[r], sub(r)])} /></Sec>
            {needMiss && <Sec label="Miss direction">{kind === 'tee' ? <Seg value={e.miss} onChange={(v) => setE({ ...e, miss: v })} options={[['left', '← Left'], ['right', 'Right →']]} />
              : <div className="rt-amissw"><span className="rt-amiss__k">Behind the green</span><div className="rt-amiss" role="radiogroup" aria-label="Where it missed the green">{AMISS.map(([v, l]) => v === 'pin' ? <span key={v} className="rt-amiss__g"><i></i></span> : <button key={v} role="radio" aria-checked={e.amiss === v} onClick={() => setE({ ...e, amiss: v })}>{l}</button>)}</div><span className="rt-amiss__k"><Icon name="arrow-up" size={12} />You · short of the green</span></div>}</Sec>}
            {kind === 'putt' && e.result && e.result !== 'hole' && <Sec label="What happened" hint="Optional"><div className="rt-tags">{PTAGS.map((t) => <button key={t} aria-pressed={e.tags.includes(t)} onClick={() => setE({ ...e, tags: e.tags.includes(t) ? e.tags.filter((x) => x !== t) : [...e.tags, t] })}>{t}</button>)}</div></Sec>}
            {e.result && e.result !== 'hole' && <Sec label={distLabel} hint="Required" tint>
              <div className="rt-dist"><input inputMode="numeric" value={e.dist} onChange={(ev) => setE({ ...e, dist: ev.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="0" aria-label={distLabel} autoFocus /><em>{kind === 'putt' || e.result === 'green' ? 'ft' : 'yds'}</em>
                <div className="rt-quick">{(kind === 'putt' || e.result === 'green' ? [3, 6, 10, 15, 25] : kind === 'tee' ? [120, 140, 160, 180] : [10, 20, 40, 80]).map((q) => <button key={q} onClick={() => setE({ ...e, dist: String(q) })}>{q}</button>)}</div></div>
              {shotLen != null && shotLen > 0 && <p className="rt-shotlen">Shot distance <b>{shotLen} yds</b></p>}</Sec>}
            <div className="rt-bar"><button className="rt-bar__i" onClick={undo} disabled={!shots.length} aria-label="Undo last shot"><Icon name="undo-2" size={18} /><span>Undo</span></button><button className="rt-bar__i" onClick={() => setModal('penalty')} disabled={!shots.length} aria-label="Add penalty stroke"><Icon name="flag-triangle-right" size={18} /><span>Penalty</span></button>
              <Button variant="primary" size="lg" disabled={!ready} onClick={next} rightIcon={e.result === 'hole' ? 'check' : 'arrow-right'}>{e.result === 'hole' ? 'Hole out' : 'Next shot'}</Button></div>
          </section>
        )}
      </div>

      {modal === 'penalty' && <Sheet title="Add penalty stroke" sub={`Hole ${hn} · after shot ${shots.length}`} onClose={() => setModal(null)} foot={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" onClick={addPen}>Add 1 stroke</Button></>}>
        <div className="rt-pen">{PEN.map(([v, l, d]) => <button key={v} className="rt-pen__o" role="radio" aria-checked={pen.type === v} onClick={() => setPen({ ...pen, type: v })}><span className="rt-radio"></span><span><b>{l}</b><em>{d}</em></span></button>)}</div>
        <div className="rt-sub"><em>Which shot</em><Seg value={pen.which} onChange={(v) => setPen({ ...pen, which: v })} options={[['last', `Shot ${shots.length} · ${last ? last.type : ''}`], ['here', 'My next shot from here']]} /></div>
      </Sheet>}
      {modal === 'edit' && <Sheet title="Edit shot" sub={`Hole ${hn}`} onClose={() => setModal(null)} foot={<><Button variant="ghost" className="rt-danger">Delete shot</Button><Button variant="primary" onClick={() => setModal(null)}>Save shot</Button></>}>
        <div className="rt-sub"><em>Result</em><Seg cols={3} value={shots[1] ? shots[1].lie : 'green'} onChange={() => {}} options={['fairway', 'rough', 'sand', 'green', 'hole', 'other'].map((r) => [r, LIES[r]])} /></div>
        <div className="rt-sub"><em>Distance after</em><div className="rt-dist"><input defaultValue={shots[1] ? shots[1].to : 18} inputMode="numeric" aria-label="Distance after" /><em>ft</em></div></div>
      </Sheet>}
      {modal === 'save' && <Sheet title="Exit round" onClose={() => setModal(null)}>
        <div className="rt-exitc"><span className="rt-exitc__n"><b>{Object.keys(done).length}</b><em>of 18</em></span><div><b>Round in progress</b><span>Finley GC · thru {Object.keys(done).length} · {tp(totals.s - totals.p)}</span><i className="rt-exitc__bar"><i style={{ width: (Object.keys(done).length / 18) * 100 + '%' }}></i></i></div></div>
        <div className="rt-exit__opts">
          <button className="rt-opt is-primary" onClick={onExit}><Icon name="bookmark" size={18} /><span><b>Save for later</b><em>Continue from Rounds any time. Nothing is lost.</em></span></button>
          <button className="rt-opt" onClick={() => setModal(null)}><Icon name="play" size={18} /><span><b>Keep playing</b><em>Back to hole {hn}</em></span></button>
          <button className="rt-opt is-danger"><Icon name="trash-2" size={18} /><span><b>Discard round</b><em>Deletes every shot. This can’t be undone.</em></span></button>
        </div>
      </Sheet>}
      {modal === 'card' && <Sheet wide title="Scorecard" sub={`Finley GC · Blue · thru ${Object.keys(done).length}`} onClose={() => setModal(null)}><MiniCard holes={holes} done={done} cur={hn} /></Sheet>}
      {modal === 'summary' && <Summary holes={sheetHoles} onSubmit={() => { setModal(null); setSubmit('loading'); setTimeout(() => setSubmit('done'), 2200); }} onClose={() => setModal(null)} />}
      {submit && <Submitting state={submit} onReview={onReview} />}
    </div>
  );
}

function MiniCard({ holes, done, cur }) {
  const nine = (a, b, l) => { const hs = holes.slice(a, b); const par = hs.reduce((s, h) => s + h.par, 0), sc = hs.reduce((s, h) => s + (done[h.n] ? done[h.n].score : 0), 0); return (
    <div className="rt-mc"><div className="rt-mc__r is-h"><span>{l}</span>{hs.map((h) => <span key={h.n} className={h.n === cur ? 'is-cur' : ''}>{h.n}</span>)}<span>Tot</span></div>
      <div className="rt-mc__r is-p"><span>Par</span>{hs.map((h) => <span key={h.n}>{h.par}</span>)}<span>{par}</span></div>
      <div className="rt-mc__r"><span>Score</span>{hs.map((h) => <span key={h.n}>{done[h.n] ? <ScoreMark score={done[h.n].score} par={h.par} size="sm" /> : '—'}</span>)}<b>{sc || '—'}</b></div>
      <div className="rt-mc__r is-p"><span>Putts</span>{hs.map((h) => <span key={h.n}>{done[h.n] ? done[h.n].putts : '—'}</span>)}<span>{hs.reduce((s, h) => s + (done[h.n] ? done[h.n].putts : 0), 0) || '—'}</span></div></div>); };
  return <div className="rt-mcw">{nine(0, 9, 'Out')}{nine(9, 18, 'In')}</div>;
}

function Summary({ holes, onSubmit, onClose }) {
  const s = holes.reduce((a, h) => a + h.score, 0), p = holes.reduce((a, h) => a + h.par, 0), pt = holes.reduce((a, h) => a + h.putts, 0);
  const fw = holes.filter((h) => h.fir).length, fwp = holes.filter((h) => h.par !== 3).length, gir = holes.filter((h) => h.gir).length;
  const done = Object.fromEntries(holes.map((h) => [h.n, { score: h.score, putts: h.putts }]));
  return (
    <Sheet wide title="Round complete" onClose={onClose} foot={<><Button variant="ghost" onClick={onClose}>Back to hole 18</Button><Button variant="primary" size="lg" rightIcon="send" onClick={onSubmit}>Submit round</Button></>}>
      <div className="rt-sum"><div className="rt-sum__hero"><span>Finley GC · Blue · Oct 14</span><b>{s}</b><em className={s < p ? 'is-under' : ''}>{tp(s - p)}</em></div>
        <dl className="rt-sum__f">{[['Putts', pt], ['Fairways', fw + '/' + fwp], ['Greens', gir + '/18'], ['Front · Back', holes.slice(0, 9).reduce((a, h) => a + h.score, 0) + ' · ' + holes.slice(9).reduce((a, h) => a + h.score, 0)]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>
      <MiniCard holes={holes} done={done} cur={0} />
      <p className="rt-sum__n">Submitting posts this round to your stats and your coach. You can still edit shots from the round review.</p>
    </Sheet>
  );
}

function Submitting({ state, onReview }) {
  const steps = ['Saving 71 shots', 'Updating your stats', 'Writing the round recap'];
  return (
    <div className="rt-scrim rt-scrim--dark"><div className="rt-subm" role="status">
      {state === 'loading' ? <><span className="rt-spin"></span><b>Submitting round</b><div className="rt-subm__s">{steps.map((s, i) => <span key={s} style={{ animationDelay: i * 0.6 + 's' }}><Icon name="check" size={13} />{s}</span>)}</div></>
        : <><span className="rt-subm__ok"><Icon name="check" size={26} /></span><b>Round posted</b><span className="rt-subm__m">Your round at Finley GC is posted. Coach Reyes can see it now.</span><Button variant="primary" size="lg" rightIcon="arrow-right" onClick={onReview}>View round review</Button></>}
    </div></div>
  );
}
Object.assign(window, { RoundTracking: Tracking });
})();
