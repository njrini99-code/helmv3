// Full-screen onboarding shell: flow, progress rail, landscape, member card. <OnboardX mobile? preset? invite? flowRef? />
(function () {
const { Icon, Avatar } = window.FairwayClubhouseEdition_9c4f4d;
const LOGO = 'assets/helm-golf-mark.png';
const PLAN = {
  pre: ['intro', 'code'],
  player: ['intro', 'code', 'role', 'name', 'grad', 'account', 'game', 'photo', 'done'],
  assistant: ['intro', 'code', 'role', 'name', 'account', 'pending'],
  staff: ['intro', 'code', 'name', 'account', 'staffdone'],
  head: ['intro', 'code', 'name', 'title', 'account', 'program', 'photo', 'cdone'],
  request: ['intro', 'rwho', 'rdetails', 'sent'],
};
const SECTION = { code: 'Team', role: 'Team', name: 'You', grad: 'You', title: 'You', account: 'Account', game: 'Your game', photo: 'Photo', program: 'Program', pending: 'Approval', rwho: 'You', rdetails: 'Details' };
const FULL = { intro: 1, done: 1, staffdone: 1, cdone: 1, sent: 1 };
const BASE = { intent: null, code: '', match: null, role: null, first: '', last: '', grad: '', title: '', email: '', pw: '', hcp: '', hand: 'right', city: '', state: '', sim: {}, photo: null, school: '', div: 'NCAA D1', gender: 'mens', conf: '', rtitle: null, rfirst: '', rlast: '', rschool: '', rcoach: '', remail: '', rnote: '' };
const pathOf = (d) => d.intent === 'request' ? 'request' : !d.match ? 'pre' : d.match.kind === 'staff' ? 'staff' : d.match.kind === 'program' ? 'head' : d.role === 'assistant' ? 'assistant' : 'player';
const TEO = { intent: 'code', code: 'K7PQX4MN', match: { kind: 'roster' }, role: 'player', first: 'Theo', last: 'Marchetti', grad: '2027', email: 'theo.marchetti@university.edu', pw: 'Fairway#26', hcp: -1.8, city: 'Austin', state: 'TX' };
const MAYA = { intent: 'code', code: 'HELM2026', match: { kind: 'program' }, first: 'Maya', last: 'Reyes', title: 'Head coach', email: 'maya.reyes@university.edu', pw: 'Fairway#26', school: 'Oakmont University' };
const DANA = { intent: 'code', code: 'K7PQX4MN', match: { kind: 'roster' }, role: 'assistant', first: 'Dana', last: 'Whitfield', email: 'd.whitfield@university.edu' };
const JORDAN = { intent: 'request', rtitle: 'ad', rfirst: 'Jordan', rlast: 'Ellis', rschool: 'Oakmont University', remail: 'j.ellis@oakmont.edu' };
const PRESETS = {
  intro: {}, code: { intent: 'code' }, 'code-ok': { intent: 'code', code: 'K7PQX4MN', match: { kind: 'roster' } },
  role: { ...TEO, role: null, first: '', last: '', grad: '', email: '', pw: '', hcp: '', city: '', state: '' }, name: { ...TEO, first: 'Theo', last: '', grad: '', email: '', pw: '', hcp: '', city: '', state: '' },
  grad: { ...TEO, grad: '', email: '', pw: '', hcp: '', city: '', state: '' }, account: { ...TEO, email: '', pw: 'fairway', hcp: '', city: '', state: '' }, game: TEO, photo: TEO, done: TEO,
  pending: DANA, staffdone: { ...DANA, match: { kind: 'staff' }, role: null },
  title: { ...MAYA, title: '', school: '' }, program: { ...MAYA, school: '' }, cdone: MAYA,
  rwho: { intent: 'request' }, rdetails: { ...JORDAN, remail: '' }, sent: JORDAN,
  // error + empty states (step is the part before the colon)
  'code:bad': { intent: 'code', code: 'ABCD1234' }, 'code:network': { intent: 'code', code: 'K7PQX4MN', sim: { code: 'network' } }, 'code:rate': { intent: 'code', code: 'K7PQX4MN', sim: { code: 'rate' } },
  'code:empty': { intent: 'code', code: 'K7PQX4MN', match: { kind: 'roster' }, sim: { emptyTeam: true } },
  'name:empty': { ...TEO, first: '', last: '' }, 'account:exists': { ...TEO, sim: { account: 'exists' } }, 'account:network': { ...TEO, sim: { account: 'network' } },
  'game:state': { ...TEO, city: 'Austin', state: 'T' }, 'photo:error': { ...TEO, sim: { photo: 'big' } },
  'done:empty': { ...TEO, sim: { emptyTeam: true } }, 'done:joinfail': { ...TEO, sim: { join: 'fail' } },
  'program:empty': { ...MAYA, school: '' }, 'rdetails:network': { ...JORDAN, sim: { request: 'network' } },
};
const nowHour = () => { const t = new Date(); return t.getHours() + t.getMinutes() / 60; };
function useHour(fixed) {
  const [h, setH] = React.useState(fixed ?? nowHour());
  React.useEffect(() => { if (fixed != null) { setH(fixed); return; } const t = setInterval(() => setH(nowHour()), 30000); return () => clearInterval(t); }, [fixed]);
  return h;
}

function useFlow(preset = 'intro', invite) {
  const init = React.useMemo(() => {
    const d = { ...BASE, ...(PRESETS[preset] || {}), ...(invite ? { code: 'K7PQX4MN' } : {}) };
    const plan = PLAN[pathOf(d)], i = plan.indexOf(preset.split(':')[0]);
    return { d, hist: i >= 0 ? plan.slice(0, i + 1) : ['intro'] };
  }, []);
  const [d, setD] = React.useState(init.d);
  const [hist, setHist] = React.useState(init.hist);
  const [dir, setDir] = React.useState('fwd');
  const [n, setN] = React.useState(0);
  const dRef = React.useRef(d); dRef.current = d;
  const up = React.useCallback((k, v) => setD((x) => ({ ...x, [k]: v })), []);
  const step = hist[hist.length - 1];
  const next = (patch = {}, to) => {
    const nd = { ...dRef.current, ...patch }, plan = PLAN[pathOf(nd)], i = plan.indexOf(step);
    const s = to || plan[i >= 0 ? i + 1 : 1]; if (!s) return;
    setDir('fwd'); setN((x) => x + 1); setHist((h) => [...h.filter((x) => plan.includes(x)), s]);
  };
  const choose = (patch, delay = 0, to) => { setD((x) => ({ ...x, ...patch })); dRef.current = { ...dRef.current, ...patch }; delay ? setTimeout(() => next(patch, to), delay) : next(patch, to); };
  const back = () => { if (hist.length < 2) return; setDir('back'); setN((x) => x + 1); setHist((h) => h.slice(0, -1)); };
  const jump = (s, patch = {}) => { const nd = { ...BASE, ...patch }; setD(nd); const plan = PLAN[pathOf(nd)], i = plan.indexOf(s); setDir('fwd'); setN((x) => x + 1); setHist(i >= 0 ? plan.slice(0, i + 1) : ['intro', s]); };
  const path = pathOf(d), plan = PLAN[path];
  return { d, up, step, next, choose, back, jump, dir, n, path, plan, hist };
}

function Rail({ f }) {
  const secs = []; f.plan.forEach((s) => { const x = SECTION[s]; if (x && !secs.includes(x)) secs.push(x); });
  if (f.path === 'pre') secs.push('You', 'Account');
  const cur = SECTION[f.step], ci = secs.indexOf(cur);
  return (
    <>
      <nav className="ox-rail" aria-label="Progress">{secs.map((s, i) => <span key={s} className={i === ci ? 'is-cur' : i < ci ? 'is-done' : ''} aria-current={i === ci ? 'step' : undefined}>{i < ci && <Icon name="check" size={12} strokeWidth={2.6} />}{s}</span>)}</nav>
      <span className="ox-rail__m">{ci >= 0 ? `${ci + 1} of ${secs.length}` : ''}</span>
    </>
  );
}

function cardOf(d, path, step) {
  const H = window.OXH, name = path === 'request' ? `${d.rfirst} ${d.rlast}`.trim() : `${d.first} ${d.last}`.trim();
  const team = d.match && d.match.kind !== 'program' && !(d.sim && d.sim.join === 'fail') ? H.TEAM.name : '';
  let tag = 'Member', f;
  if (path === 'request') { tag = 'Access request'; f = [['Title', H.TITLES[d.rtitle]], ['Program', d.rschool], ['Email', d.remail && d.remail.split('@')[0]]]; }
  else if (path === 'head') { tag = 'Head coach'; f = [['Program', d.school], ['Division', d.school ? d.div : ''], ['Team', d.school ? (d.gender === 'womens' ? 'Women’s golf' : 'Men’s golf') : '']]; }
  else if (path === 'assistant' || path === 'staff') { tag = 'Assistant coach'; f = [['Team', team], ['Head coach', H.TEAM.head], ['Status', path === 'staff' ? 'Full access' : step === 'pending' ? 'Pending' : '']]; }
  else { tag = path === 'player' && d.role ? 'Player' : 'Member'; f = [['Team', team], ['Class', d.grad ? `${H.classOf(d.grad)} · ’${d.grad.slice(2)}` : ''], ['Handicap', d.hcp !== '' && d.hcp != null ? H.fmtHcp(Number(d.hcp)) : '']]; }
  const band = path === 'request' ? 'Access request' : path === 'head' ? (d.school ? d.school : 'New program') : team || 'GolfHelm Clubhouse';
  return { name, tag, f, band, photo: path === 'request' ? null : d.photo };
}

function MemberCard({ c, issued }) {
  const ref = React.useRef(null);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const move = (e) => { if (RM) return; const r = ref.current.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; const s = ref.current.style; s.setProperty('--ry', ((x - .5) * 12).toFixed(2) + 'deg'); s.setProperty('--rx', ((.5 - y) * 10).toFixed(2) + 'deg'); s.setProperty('--gx', (x * 100).toFixed(0) + '%'); s.setProperty('--gy', (y * 100).toFixed(0) + '%'); };
  const leave = () => { const s = ref.current.style; ['--rx', '--ry'].forEach((k) => s.setProperty(k, '0deg')); s.setProperty('--gx', '24%'); s.setProperty('--gy', '0%'); };
  return (
    <div className={'ox-mcw' + (issued ? ' is-issued' : '')} onPointerMove={move} onPointerLeave={leave}>
      {issued && <div className="ox-mc__stamp" aria-hidden="true"><span>Member<b>2026</b>since</span></div>}
      <div className="ox-mc" ref={ref} aria-label={`GolfHelm member card${c.name ? ' for ' + c.name : ''}`} role="img">
        <div className="ox-mc__glare"></div>
        <span className="ox-mc__rose" aria-hidden="true"></span>
        <img className="ox-mc__wm" src={LOGO} alt="" aria-hidden="true" />
        <div className="ox-mc__top"><span className="ox-mc__brand"><img src={LOGO} alt="" />GolfHelm</span><span className="ox-mc__tag" key={c.tag}><span className="ox-flash">{c.tag}</span></span></div>
        <div className="ox-mc__who">
          <span className="ox-mc__coin">{c.photo ? <img src={c.photo} alt="" /> : c.name ? <Avatar name={c.name} size={42} /> : <span className="is-blank"><Icon name="user-round" size={18} /></span>}</span>
          <span className={'ox-mc__name' + (c.name ? '' : ' is-blank')} key={c.name ? 'n' : 'b'}>{c.name ? <span className="ox-flash">{c.name}</span> : 'Your name'}</span>
        </div>
        <div className="ox-mc__f">{c.f.map(([k, v]) => <div key={k}><span>{k}</span><b className={v ? '' : 'is-blank'} key={v || '-'}>{v ? <span className="ox-flash">{v}</span> : '—'}</b></div>)}</div>
        <div className="ox-mc__band"><span>{c.band || 'GolfHelm Clubhouse'}</span><span>Fall 2026</span></div>
      </div>
    </div>
  );
}

// Hand-off: the member card lifts out, the course folds into the app canvas, the real dashboard loads underneath,
// and the card flies down into the sidebar where your name lives.
const EZ = 'cubic-bezier(.32,.72,0,1)', EO = 'cubic-bezier(.2,.8,.2,1)';
function useHandoff(root, mobile) {
  const [href, setHref] = React.useState(null);
  const [phase, setPhase] = React.useState(null); // lift → fold → shown → done
  const frame = React.useRef(null), clone = React.useRef(null), t = React.useRef([]);
  const later = (f, ms) => t.current.push(setTimeout(f, ms));
  React.useEffect(() => () => t.current.forEach(clearTimeout), []);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finish = (to) => {
    if (phase) return;
    const card = root.current.querySelector('.ox-mc');
    if (card && !RM) {
      const r = card.getBoundingClientRect(), R = root.current.getBoundingClientRect(), k = R.width / root.current.offsetWidth || 1;
      const c = card.cloneNode(true); c.classList.add('ox-mc--fly');
      const x0 = (r.left - R.left) / k, y0 = (r.top - R.top) / k;
      Object.assign(c.style, { position: 'absolute', left: x0 + 'px', top: y0 + 'px', margin: 0, zIndex: 40, transformOrigin: '0 0' });
      root.current.appendChild(c); clone.current = c; card.style.visibility = 'hidden';
      const nw = c.offsetWidth, nh = c.offsetHeight, s0 = (r.width / k) / nw;
      const W = root.current.offsetWidth, H = root.current.offsetHeight, sL = Math.min(1.12, (W * .42) / nw);
      const tx = W / 2 - (nw * sL) / 2 - x0, ty = H / 2 - (nh * sL) / 2 - y0 - 10;
      c.dataset.x0 = x0; c.dataset.y0 = y0; c.dataset.nw = nw; c.dataset.nh = nh;
      c.animate([{ translate: '0px 0px', scale: s0 }, { translate: tx + 'px ' + ty + 'px', scale: sL }], { duration: 820, easing: EZ, fill: 'forwards' });
    }
    if (window.GH && GH.haptic) GH.haptic('success');
    setHref(to); setPhase('lift');
    later(() => setPhase('fold'), 700);
  };
  // reveal once the fold has played and the dashboard is on screen
  React.useEffect(() => {
    if (phase !== 'fold' || mobile) return; let tm;
    const poll = () => {
      const d = frame.current && frame.current.contentDocument;
      if (d && d.querySelector('.fw-sidebar') && d.querySelector('.h2-canvas') && d.fonts && d.fonts.status === 'loaded') { later(reveal, 650); return; }
      tm = setTimeout(poll, 60);
    };
    poll(); return () => clearTimeout(tm);
  }, [phase]);
  const reveal = () => {
    const d = frame.current.contentDocument, w = frame.current.contentWindow;
    setPhase('shown');
    if (!RM) {
      d.querySelectorAll('.fw-sidebar .h2-brand, .fw-sidebar .fw-navitem, .fw-sidebar .fw-sidebar__section, .fw-sidebar .h2-next').forEach((el, i) => el.animate([{ opacity: 0, translate: '-10px 0' }, { opacity: 1, translate: '0 0' }], { duration: 480, delay: 120 + i * 30, easing: EO, fill: 'backwards' }));
      const top = d.querySelector('.fw-topbar'); if (top) top.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 100, fill: 'backwards' });
      const a = d.querySelector('.h2-canvas .gh-anchor'); if (a && w.GH && w.GH.reveal) w.GH.reveal(a);
      else { const m = d.querySelector('.h2-canvas > :not(.fw-topbar)'); if (m) m.animate([{ opacity: 0, translate: '0 12px' }, { opacity: 1, translate: '0 0' }], { duration: 560, delay: 200, easing: EO, fill: 'backwards' }); }
    }
    const c = clone.current;
    if (c) {
      const id = d.querySelector('.fw-sidebar .fw-identity') || d.querySelector('.fw-sidebar .h2-brand');
      const R = root.current.getBoundingClientRect(), k = R.width / root.current.offsetWidth || 1, fr = frame.current.getBoundingClientRect();
      const x0 = +c.dataset.x0, y0 = +c.dataset.y0, nw = +c.dataset.nw, nh = +c.dataset.nh;
      const tb = id ? id.getBoundingClientRect() : null;
      const tl = tb ? (tb.left + fr.left - R.left) / k : 24, tt = tb ? (tb.top + fr.top - R.top) / k : root.current.offsetHeight - 70, twd = tb ? tb.width / k : 200, tht = tb ? tb.height / k : 40;
      const sT = Math.max(.2, twd / nw), tx = tl - x0 + (twd - nw * sT) / 2, ty = tt - y0 + (tht - nh * sT) / 2;
      if (id) id.animate([{ opacity: 0 }, { opacity: 0, offset: .55 }, { opacity: 1 }], { duration: 980, easing: EO, fill: 'backwards' });
      const cs = getComputedStyle(c);
      c.getAnimations().forEach((x) => x.commitStyles && x.commitStyles());
      c.getAnimations().forEach((x) => x.cancel());
      c.animate([{ translate: cs.translate, scale: cs.scale, opacity: 1 }, { opacity: 1, offset: .7 }, { translate: tx + 'px ' + ty + 'px', scale: sT, opacity: 0 }], { duration: 900, easing: EZ, fill: 'forwards' }).onfinish = () => { c.remove(); clone.current = null; };
    }
    later(() => { setPhase('done'); document.title = d.title; }, 1000);
  };
  return { href, phase, frame, finish };
}

function OnboardX({ mobile, preset = 'intro', invite, hour: fixed, flowRef }) {
  const root = React.useRef(null);
  const h = useHandoff(root, mobile);
  const f = useFlow(preset, invite);
  React.useEffect(() => { if (flowRef) flowRef.current = f; });
  const hour = useHour(fixed);
  const full = !!FULL[f.step];
  const dark = full && window.gsSkyAt(hour).ambA > .3;
  const i = f.plan.indexOf(f.step), z = 1 + (f.plan.length > 1 ? Math.max(0, i) / (f.plan.length - 1) : 0) * .38;
  const S = window.OX_STEPS[f.step];
  const issued = { done: 1, staffdone: 1, cdone: 1, sent: 1 }[f.step] && !(f.d.sim && f.d.sim.join === 'fail');
  const played = issued && f.path !== 'request';
  return (
    <div ref={root} className={'ox' + (mobile ? ' ox--m' : '') + (h.phase ? ' is-leaving is-' + h.phase : '') + (full ? ' is-full' : '') + (dark ? ' is-dark' : '') + (f.step === 'intro' ? ' is-glass' : '')} style={{ '--ox-z': z }}>
      {h.phase !== 'done' && <div className="ox-canvas">
        <div className="ox-land" aria-hidden="true"><GolfScene hour={hour} uid={'gsx' + (mobile ? 'm' + preset : 'd')} crop={mobile ? 'tall' : 'wide'} play={!!played} /></div>
        <div className="ox-fade" aria-hidden="true"></div>
        <div className="ox-scrim" aria-hidden="true"></div>
        <div className="ox-seal" aria-hidden="true"><img src={LOGO} alt="" /></div>
        <header className="ox-top">
          <span></span>
          <Rail f={f} />
          <div className="ox-top__r">{issued ? null : <>Already a member?<a href="Sign in.html">Sign in</a></>}</div>
        </header>
        <main className="ox-stage">
          <div className="ox-col" key={f.n}>
            <S finish={h.finish} d={f.d} up={f.up} next={f.next} choose={f.choose} path={f.path} hour={hour} invite={invite} mobile={mobile} dir={f.dir} back={f.hist.length > 1 && !issued && f.step !== 'pending' ? f.back : null} />
          </div>
          <aside className="ox-side" aria-label="Your member card">
            <MemberCard c={cardOf(f.d, f.path, f.step)} issued={issued} />
            <div className="ox-side__cap"><b>{f.path === 'request' ? 'Your request' : 'Your member card'}</b><span>{issued ? 'Issued today' : f.step === 'intro' ? 'Fills in as you go' : 'Updates as you answer'}</span></div>
          </aside>
        </main>
        <div className="ox-paper" aria-hidden="true"></div>
      </div>}
      {h.href && !mobile && <iframe ref={h.frame} className="ox-app" src={h.href} title="GolfHelm" aria-hidden={h.phase !== 'shown' && h.phase !== 'done'}></iframe>}
      {mobile && h.phase && <div className="ox-mhome" aria-hidden="true"><span className="gh-lock"><img src={LOGO} alt="" /><span>Opening your dashboard</span></span></div>}
    </div>
  );
}
Object.assign(window, { OnboardX, OX_PRESETS: Object.keys(PRESETS) });
})();
