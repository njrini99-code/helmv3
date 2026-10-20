// GolfHelm sign-in → welcome → Home hand-off. Desktop <SignInDesktop/>, mobile <SignInMobile/>.
(function () {
const { Button, Input, FormField, InlineNotice, Icon } = window.FairwayClubhouseEdition_9c4f4d;
const LOGO = 'assets/helm-golf-mark.png';
const HSL = 'assets/helm-sports-labs-mark.png';
const PEOPLE = {
  coach: { email: 'maya.reyes@university.edu', name: 'Coach Reyes', home: '../Coach - Home.html', last: 'Sunday at 9:12 pm',
    news: [['message-square', '4 new messages', 'Sofia, Eli and 2 others'], ['flag', 'Jonah posted a round', '74 (+2) at Pine Needles'], ['calendar-check', '5 of 6 RSVPs for Pinehurst', 'Eli hasn’t replied yet']] },
  player: { email: 'theo.marchetti@university.edu', name: 'Theo', home: '../Player - Home.html', last: 'Sunday at 10:40 pm',
    news: [['megaphone', 'Coach Reyes posted pairings', 'Pinehurst qualifier · off at 8:42'], ['target', 'New drill assigned', 'Lag putting from 30 feet'], ['message-square', '2 team messages', 'Ava and Sofia']] },
};
const wordFor = (h) => (h >= 4.5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening');
const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
function useHour(fixed) {
  const [h, setH] = React.useState(fixed ?? nowHour());
  React.useEffect(() => { if (fixed != null) { setH(fixed); return; } setH(nowHour()); const t = setInterval(() => setH(nowHour()), 30000); return () => clearInterval(t); }, [fixed]);
  return h;
}
const CRED_ERR = 'Incorrect email or password. Please check your credentials and try again.';
// Server errors, worded as golf-sign-in-form.tsx getErrorMessage() maps them.
const FAILS = {
  creds: { msg: CRED_ERR, field: 'both' },
  unconfirmed: { msg: 'Please verify your email address before signing in. Check your inbox for the confirmation link.', field: null, tone: 'warning' },
  rate: { msg: 'Too many sign-in attempts. Please wait a moment and try again.', field: null, tone: 'warning' },
  network: { msg: 'Unable to reach the server. Please check your internet connection and try again.', field: null },
  stale: { msg: 'The app updated in the background. Please try signing in once more.', field: null, tone: 'info' },
};
const hap = (k) => window.GH && GH.haptic && GH.haptic(k);

function useSignIn({ role, failFirst, fail, onSuccess }) {
  const failKind = fail || (failFirst ? 'creds' : null);
  const [email, setEmail] = React.useState(PEOPLE[role].email);
  const [pw, setPw] = React.useState('fairway26');
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const tries = React.useRef(0);
  React.useEffect(() => { setEmail(PEOPLE[role].email); setErr(null); tries.current = 0; }, [role]);
  const submit = (e) => {
    e && e.preventDefault(); if (busy) return;
    if (!email.trim() || !pw) { setErr({ msg: 'Enter your email and password to sign in.', field: !email.trim() ? 'email' : 'pw' }); hap('warning'); return; }
    setErr(null); setBusy(true); hap('light');
    setTimeout(() => {
      tries.current += 1;
      if (failKind && failKind !== 'none' && tries.current === 1) { setBusy(false); setErr(FAILS[failKind] || FAILS.creds); hap(failKind === 'rate' || failKind === 'unconfirmed' ? 'warning' : 'error'); return; }
      hap('success'); onSuccess();
    }, 950);
  };
  return { email, setEmail, pw, setPw, show, setShow, busy, err, submit };
}

function Welcome({ role, hour, anon, mobile, onContinue, active, news = 'some' }) {
  const p = PEOPLE[role];
  const items = news === 'some' ? p.news : [];
  const btn = React.useRef(null);
  React.useEffect(() => {
    if (!active) return;
    const k = (e) => { if (e.key === 'Enter' && !mobile) onContinue(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [active]);
  const word = wordFor(hour), dark = window.gsSkyAt(hour).ambA > .3;
  const line1 = word + (anon ? '.' : ',');
  return (
    <div className={'wl' + (mobile ? ' wl--m' : '') + (active ? ' is-in' : '') + (anon ? '' : ' has-name') + (dark ? ' is-dark' : '')} aria-hidden={!active}>
      <div className="wl-scrim"></div>
      <div className="wl-mark gh-lock"><img src={LOGO} alt="" /><span>Golf<b style={{ color: '#1F7A4A', fontWeight: 'inherit' }}>Helm</b></span></div>
      <div className="wl-body">
        <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{active ? (anon ? word + '.' : word + ', ' + p.name + '.') : ''}</div>
        <span className="wl-date">Tuesday, 14 October</span>
        <h1 aria-hidden="true"><span className="wl-l1">{line1}</span>{!anon && <span className="wl-l2"><span>{p.name}.</span></span>}</h1>
      </div>
      <div className="wl-card" ref={btn}>
        <div className="wl-news">
          <div className="wl-news__h"><b>{news === 'first' ? 'Your first time in' : 'Since you last signed in'}</b>{news !== 'first' && <span>{p.last}</span>}</div>
          {items.length === 0 && <div className="wl-empty"><span className="wl-news__ic"><Icon name={news === 'first' ? 'sparkles' : 'circle-check'} size={15} /></span><span className="wl-news__t"><b>{news === 'first' ? 'Your team’s updates will show up here' : 'You’re all caught up'}</b><em>{news === 'first' ? 'Messages, posted rounds and RSVPs since your last visit.' : 'Nothing new since your last visit.'}</em></span></div>}
          <ul>{items.map(([ic, t, m], i) => <li key={t} style={{ '--i': i }}><span className="wl-news__ic"><Icon name={ic} size={15} /></span><span className="wl-news__t"><b>{t}</b><em>{m}</em></span></li>)}</ul>
        </div>
        <div className="wl-cta"><Button variant="primary" size="lg" rightIcon="arrow-right" onClick={onContinue} data-haptic="medium">Continue</Button></div>
      </div>
      {!mobile && <span className="wl-hint">or press <kbd>Return</kbd></span>}
    </div>
  );
}

function useFlow({ start = 'login' }) {
  const [phase, setPhase] = React.useState('login');
  const [leaving, setLeaving] = React.useState(false);
  const [preload, setPreload] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [morphed, setMorphed] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const timers = React.useRef([]);
  const later = (f, ms) => timers.current.push(setTimeout(f, ms));
  const open = () => { setPhase('opening'); later(() => setPhase('welcome'), 700); later(() => setPreload(true), 700 + 3300); };
  React.useEffect(() => { if (start === 'welcome') later(open, 500); return () => timers.current.forEach(clearTimeout); }, []);
  const cont = () => { if (leaving) return; setLeaving(true); setPreload(true); later(() => setMorphed(true), 900); };
  const shown = leaving && morphed && ready;
  React.useEffect(() => { if (shown) later(() => setDone(true), 700); }, [shown]);
  const reset = (to = 'login') => { timers.current.forEach(clearTimeout); timers.current = []; setLeaving(false); setPreload(false); setReady(false); setMorphed(false); setDone(false); setPhase('login'); if (to === 'welcome') later(open, 350); };
  return { phase, leaving, preload, ready, setReady, shown, done, open, cont, reset };
}

// Watches a same-origin iframe until its React tree is on screen.
function useFrameReady(ref, on, setReady) {
  React.useEffect(() => {
    if (!on) return; let t;
    const poll = () => {
      const d = ref.current && ref.current.contentDocument;
      if (d && d.querySelector('.h2-canvas .gh-anchor') && d.fonts && d.fonts.status === 'loaded') { requestAnimationFrame(() => requestAnimationFrame(() => setReady(true))); return; }
      t = setTimeout(poll, 60);
    };
    poll(); return () => clearTimeout(t);
  }, [on]);
}
function revealApp(frame) {
  const w = frame && frame.contentWindow, d = frame && frame.contentDocument; if (!w || !d) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const E = 'cubic-bezier(.2,.8,.2,1)';
  const side = d.querySelectorAll('.fw-sidebar .h2-brand, .fw-sidebar .fw-navitem, .fw-sidebar .fw-sidebar__section, .fw-sidebar .h2-next, .fw-sidebar .fw-sidebar__foot .fw-identity');
  side.forEach((el, i) => el.animate([{ opacity: 0, translate: '-8px 0' }, { opacity: 1, translate: '0 0' }], { duration: 460, delay: 60 + i * 28, easing: E, fill: 'backwards' }));
  const top = d.querySelector('.fw-topbar'); if (top) top.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 80, easing: E, fill: 'backwards' });
  const a = d.querySelector('.h2-canvas .gh-anchor'); if (a && w.GH && w.GH.reveal) w.GH.reveal(a);
}

function SignInDesktop({ role, hour: fixedHour, failFirst, fail, news, anon, flowRef, onHanded }) {
  const hour = useHour(fixedHour);
  const f = useFlow({});
  const frame = React.useRef(null);
  useFrameReady(frame, f.preload, f.setReady);
  React.useEffect(() => { if (f.shown) { revealApp(frame.current); } if (f.done) { document.title = frame.current.contentDocument.title; onHanded && onHanded(true); } }, [f.shown, f.done]);
  const s = useSignIn({ role, failFirst, fail, onSuccess: f.open });
  React.useEffect(() => { if (flowRef) flowRef.current = f; });
  const isOpen = f.phase === 'opening' || f.phase === 'welcome';
  const inv = (k) => s.err && (s.err.field === k || s.err.field === 'both');
  return (
    <div className={'lg' + (isOpen ? ' is-open' : '') + (f.leaving ? ' is-leaving' : '') + (f.shown ? ' is-shown' : '')}>
      {!f.done && <div className={'lg-photo' + (isOpen ? ' is-cam' : '')} aria-hidden="true">
        <GolfScene hour={hour} uid="gsd" play={f.phase === 'welcome'} /><div className="lg-veil"></div>
        <div className="lg-paper"></div>
        <div className="lg-say"><h2>GolfHelm for college golf.</h2><p><i></i>Rounds, stats, travel and qualifiers in one place</p></div>
      </div>}
      {!f.done && <main className="lg-panel" aria-label="Sign in" aria-hidden={isOpen}>
        <div className="lg-top"><a className="lg-back" href="Index.html"><Icon name="chevron-left" size={16} />Home</a></div>
        <form className="lg-form" onSubmit={s.submit} noValidate>
          <div className="lg-lock gh-lock--lg gh-lock"><img src={LOGO} alt="" /><span>Golf<b style={{ color: '#1F7A4A', fontWeight: 'inherit' }}>Helm</b></span></div>
          <h1>Sign in</h1>
          <p className="lg-sub">Coaches and players use the same sign-in. We’ll open the right clubhouse for you.</p>
          <div className="lg-fields">
            <FormField label="Email" htmlFor="lg-email">
              <Input id="lg-email" size="lg" type="email" autoComplete="username" value={s.email} invalid={inv('email')} onChange={(e) => s.setEmail(e.target.value)} placeholder="you@school.edu" />
            </FormField>
            <div className="lg-pw">
              <FormField label="Password" htmlFor="lg-pw">
                <Input id="lg-pw" size="lg" type={s.show ? 'text' : 'password'} autoComplete="current-password" value={s.pw} invalid={inv('pw')} onChange={(e) => s.setPw(e.target.value)}
                  suffix={<button type="button" className="lg-eye" aria-label={s.show ? 'Hide password' : 'Show password'} aria-pressed={s.show} onClick={() => s.setShow(!s.show)}><Icon name={s.show ? 'eye-off' : 'eye'} size={16} /></button>} />
              </FormField>
              <a className="lg-forgot" href="#">Forgot password?</a>
            </div>
          </div>
          {s.err && <div className="lg-err" key={s.err.msg}><InlineNotice tone={s.err.tone || 'danger'}>{s.err.msg}</InlineNotice></div>}
          <div className="lg-submit"><Button type="submit" variant="primary" size="lg" fullWidth busy={s.busy}>{s.busy ? 'Signing in…' : 'Sign in'}</Button></div>
        </form>
        <div className="lg-foot"><span>New here? <a href="Sign up.html">Create an account</a></span><span className="lg-legal"><a href="#">Privacy</a>·<a href="#">Terms</a></span></div>
        <div className="lg-hsl"><img src={HSL} alt="" />A Helm Sports Labs product</div>
      </main>}
      {!f.done && f.phase !== 'login' && <Welcome role={role} hour={hour} anon={anon} news={news} active={f.phase === 'welcome'} onContinue={f.cont} />}
      {f.preload && <iframe ref={frame} className="lg-app" src={PEOPLE[role].home} title="GolfHelm" tabIndex={f.done ? 0 : -1} aria-hidden={!f.shown}></iframe>}
    </div>
  );
}

function SignInMobile({ role = 'coach', hour: fixedHour, failFirst, fail, news, anon, start = 'login', showError, replayKey, uid = '' }) {
  const hour = useHour(fixedHour);
  const f = useFlow({ start });
  const root = React.useRef(null), homeRef = React.useRef(null);
  const [hb, setHb] = React.useState(300);
  React.useEffect(() => {
    if (!f.preload) return; let t;
    const m = () => { const h = homeRef.current && homeRef.current.querySelector('.mh-hero'); if (!h) { t = setTimeout(m, 50); return; }
      const R0 = root.current.getBoundingClientRect(), s = R0.height / root.current.offsetHeight || 1; setHb((h.getBoundingClientRect().bottom - R0.top) / s); requestAnimationFrame(() => f.setReady(true)); };
    m(); return () => clearTimeout(t);
  }, [f.preload]);
  React.useLayoutEffect(() => { if (!f.leaving) return; const h = homeRef.current && homeRef.current.querySelector('.mh-hero'); if (!h) return; const R0 = root.current.getBoundingClientRect(), s = R0.height / root.current.offsetHeight || 1; setHb((h.getBoundingClientRect().bottom - R0.top) / s); }, [f.leaving, f.ready]);
  const s = useSignIn({ role, failFirst, fail, onSuccess: f.open });
  React.useEffect(() => { if (replayKey) f.reset(start === 'welcome' ? 'welcome' : 'login'); }, [replayKey]);
  React.useEffect(() => { if (showError) { s.setPw(''); } }, []);
  const err = s.err || (showError ? (FAILS[showError] || FAILS.creds) : null);
  const isOpen = f.phase === 'opening' || f.phase === 'welcome';
  const Home = role === 'coach' ? window.HomeM : window.PlayerHomeM;
  return (
    <div ref={root} className={'ml' + (isOpen ? ' is-open' : '') + (f.leaving ? ' is-leaving' : '') + (f.shown ? ' is-shown' : '')} style={{ '--hb': hb + 'px' }}>
      <div className={'ml-photo' + (isOpen ? ' is-cam' : '')} aria-hidden="true">
        <GolfScene hour={hour} uid={'gsm' + uid} crop="tall" /><div className="lg-veil"></div>
        <div className="ml-mark gh-lock"><img src={LOGO} alt="" /><span>Golf<b style={{ color: '#1F7A4A', fontWeight: 'inherit' }}>Helm</b></span></div>
        <div className="ml-brand"><h2>GolfHelm for college golf.</h2></div>
      </div>
      <form className="ml-sheet" onSubmit={s.submit} noValidate aria-hidden={isOpen}>
        <h1>Sign in</h1>
        <p className="lg-sub">Coaches and players use the same sign-in.</p>
        <div className="ml-group" data-invalid={err && err.field === 'both' ? '' : undefined}>
          <label className="ml-row"><input type="email" aria-label="Email" placeholder="Email" value={s.email} onChange={(e) => s.setEmail(e.target.value)} autoComplete="username" /></label>
          <label className="ml-row"><input type={s.show ? 'text' : 'password'} aria-label="Password" placeholder="Password" value={s.pw} onChange={(e) => s.setPw(e.target.value)} autoComplete="current-password" />
            <button type="button" className="lg-eye" aria-label={s.show ? 'Hide password' : 'Show password'} onClick={() => s.setShow(!s.show)}><Icon name={s.show ? 'eye-off' : 'eye'} size={17} /></button></label>
        </div>
        {err && <div className="lg-err"><InlineNotice tone={err.tone || 'danger'}>{err.msg}</InlineNotice></div>}
        <div className="lg-submit"><Button type="submit" variant="primary" size="lg" fullWidth busy={s.busy}>{s.busy ? 'Signing in…' : 'Sign in'}</Button></div>
        <a className="ml-forgot" href="#">Forgot password?</a>
        <div className="ml-foot"><span>New here? <a href="Sign up.html">Create an account</a></span><span className="lg-legal"><a href="#">Privacy</a>·<a href="#">Terms</a></span><span className="lg-hsl"><img src={HSL} alt="" />A Helm Sports Labs product</span></div>
      </form>
      {!f.done && f.phase !== 'login' && <Welcome mobile role={role} hour={hour} anon={anon} news={news} active={f.phase === 'welcome'} onContinue={f.cont} />}
      {!f.done && <div className="ml-rise" aria-hidden="true"></div>}
      {!f.done && <div className="ml-hero" aria-hidden="true"></div>}
      {f.preload && Home && <div className="ml-home" ref={homeRef} aria-hidden={!f.shown}><Home initial={{}} /></div>}
    </div>
  );
}

Object.assign(window, { SignInDesktop, SignInMobile, LG_PEOPLE: PEOPLE, lgNowHour: nowHour });
})();
