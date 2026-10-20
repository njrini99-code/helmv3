// Onboarding questions. Each step gets { d, up, next, choose, path, hour, mobile, back }.
(function () {
const { Button, Input, FormField, InlineNotice, Icon, Avatar, TextArea } = window.FairwayClubhouseEdition_9c4f4d;
const hap = (k) => window.GH && GH.haptic && GH.haptic(k);
const TEAM = { name: 'Varsity Golf', head: 'Maya Reyes', headShort: 'Coach Reyes', season: 'Fall 2026', crest: 'VG' };
const ROSTER = [['Theo Marchetti', 'Senior', '+1.8'], ['Sofia Alvarez', 'Senior', '0.4'], ['Ava Lindqvist', 'Junior', '1.9'], ['Jonah Okafor', 'Sophomore', '3.1'], ['Eli Brandt', 'Junior', '2.6'], ['Priya Natarajan', 'Freshman', '4.2']];
const CODES = { K7PQX4MN: { kind: 'roster' }, S4VN8QRT: { kind: 'staff' }, HELM2026: { kind: 'program' } };
const CLASS = { 2027: 'Senior', 2028: 'Junior', 2029: 'Sophomore', 2030: 'Freshman' };
const classOf = (y) => CLASS[y] || 'Recruit';
const clean = (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const pwRules = (p) => [['8+ characters', p.length >= 8], ['A number', /\d/.test(p)], ['A symbol', /[^A-Za-z0-9]/.test(p)]];
const pwScore = (p) => !p ? 0 : Math.min(4, pwRules(p).filter((r) => r[1]).length + (p.length >= 12 ? 1 : 0));
const fmtHcp = (n) => n == null || n === '' ? '' : n < 0 ? '+' + Math.abs(n).toFixed(1) : Number(n).toFixed(1);
const wordFor = (h) => (h >= 4.5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening');
const TITLES = { player: 'Player', coach: 'Coach', ad: 'Athletic director' };

function Q({ eyebrow, title, sub, children, onSubmit, back, dir }) {
  return (
    <form className={'ox-q' + (dir === 'back' ? ' is-back' : '')} onSubmit={(e) => { e.preventDefault(); onSubmit && onSubmit(); }} noValidate>
      {back && <button type="button" className="ox-back" onClick={back}><Icon name="chevron-left" size={16} />Back</button>}
      {eyebrow && <div className="ox-eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {sub && <p className="ox-sub">{sub}</p>}
      {children}
    </form>
  );
}
function Act({ label = 'Continue', disabled, busy, busyLabel, children, icon = 'arrow-right' }) {
  return (
    <div className="ox-act">
      <Button type="submit" variant="primary" size="lg" rightIcon={busy ? undefined : icon} disabled={disabled} busy={busy}>{busy ? busyLabel : label}</Button>
      {!disabled && !busy && <span className="ox-enter">or press <kbd>Return</kbd></span>}
      {children}
    </div>
  );
}
const Tick = () => <span className="ox-tick"><Icon name="check" size={12} strokeWidth={3} /></span>;
const pathTeam = (path) => path === 'head' ? 'New program' : TEAM.name;
const ROLE_WORD = { player: 'Player', assistant: 'Assistant coach', staff: 'Assistant coach', head: 'Head coach' };
function Who({ d, path }) {
  const n = [d.first, d.last].filter(Boolean).join(' ');
  return <>{n ? <Avatar name={n} src={d.photo || undefined} size={22} /> : null}<span>{ROLE_WORD[path] || 'New member'} · {pathTeam(path)}</span></>;
}

function Intro({ choose, hour, invite }) {
  if (invite) return (
    <Q eyebrow={<><span className="ox-crest" style={{ width: 28, height: 28, borderRadius: 8, fontSize: 11 }}>{TEAM.crest}</span>{wordFor(hour)}</>} title={`You’re invited to ${TEAM.name}.`} sub={<>{TEAM.head} added you to the roster. Set up your account and you’ll be with the team in about two minutes.</>}>
      <div className="ox-act"><Button variant="primary" size="lg" rightIcon="arrow-right" onClick={() => choose({ intent: 'code' })}>Accept invite</Button></div>
    </Q>
  );
  return (
    <Q eyebrow={wordFor(hour)} title="Welcome to the clubhouse." sub="GolfHelm keeps your team’s rounds, stats, travel and qualifiers in one place. Let’s get you in.">
      <div className="ox-body">
        <div className="ox-choice" role="group">
          <button type="button" className="ox-card is-glass" onClick={() => choose({ intent: 'code' })}>
            <span className="ox-art"><Icon name="key-round" size={24} /></span>
            <div><b>I have a team code</b><p>From your head coach. Setup takes about two minutes.</p></div>
            <span className="ox-card__go">Enter code<Icon name="arrow-right" size={14} /></span>
          </button>
          <button type="button" className="ox-card is-glass" onClick={() => choose({ intent: 'request' })}>
            <span className="ox-art"><Icon name="mail" size={24} /></span>
            <div><b>I need access</b><p>For coaches, athletic directors, and players whose coach isn’t here yet.</p></div>
            <span className="ox-card__go">Request access<Icon name="arrow-right" size={14} /></span>
          </button>
        </div>
      </div>
    </Q>
  );
}

function Code({ d, up, next, choose, back, dir, mobile }) {
  const [focus, setFocus] = React.useState(false);
  const [st, setSt] = React.useState(d.match ? 'ok' : 'idle');
  const inp = React.useRef(null);
  React.useEffect(() => {
    if (d.code.length !== 8 || d.match) return;
    setSt('checking');
    const fail = d.sim && d.sim.code;
    const t = setTimeout(() => {
      if (fail === 'network') { setSt('net'); hap('error'); return; }
      if (fail === 'rate') { setSt('rate'); hap('warning'); return; }
      const m = CODES[d.code]; if (m) { setSt('ok'); up('match', m); hap('success'); } else { setSt('bad'); hap('error'); }
    }, 800);
    return () => clearTimeout(t);
  }, [d.code, d.sim && d.sim.code]);
  const retry = () => { up('sim', { ...(d.sim || {}), code: null }); setSt('idle'); };
  const empty = d.sim && d.sim.emptyTeam;
  const set = (v) => { up('code', clean(v)); if (d.match) up('match', null); setSt('idle'); };
  const m = d.match, ch = d.code.split('');
  return (
    <Q dir={dir} back={back} title={m ? (m.kind === 'program' ? 'Your program code is ready.' : `Welcome to ${TEAM.name}.`) : 'Enter your team code.'} sub={m ? (m.kind === 'program' ? 'This code sets up a new program on GolfHelm with you as head coach.' : m.kind === 'staff' ? `${TEAM.head} invited you to join the coaching staff.` : d.sim && d.sim.emptyTeam ? `${TEAM.head} is setting up the team. You’re one of the first to join.` : `${TEAM.head} and ${ROSTER.length} players are already here.`) : 'Eight letters and numbers from your head coach. Case doesn’t matter.'} onSubmit={() => m && next()}>
      <div className="ox-body">
        <label className={'ox-code' + (focus ? ' is-focus' : '') + (st === 'ok' ? ' is-ok' : '') + (st === 'bad' ? ' is-bad' : '')}>
          <input ref={inp} value={d.code} onChange={(e) => set(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} aria-label="Team code" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={12} autoFocus={!mobile && !m} />
          <div className="ox-slots" aria-hidden="true">
            {[0, 1, 2, 3, 'd', 4, 5, 6, 7].map((i) => i === 'd' ? <b key="d"></b> : <span key={i + (ch[i] || '')} style={{ '--i': i }} className={'ox-slot' + (ch[i] ? ' is-filled' : '') + (i === ch.length && st === 'idle' ? ' is-cur' : '')}>{ch[i] || ''}</span>)}
          </div>
        </label>
        <div className="ox-code__foot" style={{ marginTop: -8 }}>
          {st === 'checking' ? <span className="ox-check"><i className="ox-spin"></i>Checking your code…</span>
            : st === 'ok' ? <span className="ox-check is-ok"><Icon name="circle-check" size={15} />Code matched</span>
            : st === 'bad' ? <span className="ox-check" style={{ color: '#B3261E' }}><Icon name="circle-alert" size={15} />That code didn’t match a team</span>
            : st === 'net' || st === 'rate' ? <span className="ox-check" style={{ color: '#9A6B1F' }}><Icon name={st === 'net' ? 'wifi-off' : 'timer'} size={15} />{st === 'net' ? 'We couldn’t check your code' : 'Too many attempts'}</span>
            : <span className="ox-hint">Paste it or type it. We check as you go.</span>}
          {d.code && st !== 'checking' && <button type="button" className="ox-link" style={{ fontSize: 13, padding: 0 }} onClick={() => { set(''); inp.current && inp.current.focus(); }}>Clear</button>}
        </div>
        {st === 'bad' && <div className="ox-err"><InlineNotice tone="danger">Check the code with your head coach and try again. Codes are 8 letters and numbers.</InlineNotice></div>}
        {st === 'net' && <div className="ox-err"><InlineNotice tone="warning" action={<Button size="sm" onClick={retry}>Try again</Button>}>Unable to reach the server. Please check your internet connection and try again.</InlineNotice></div>}
        {st === 'rate' && <div className="ox-err"><InlineNotice tone="warning" action={<Button size="sm" onClick={retry}>Try again</Button>}>Too many attempts. Please wait a moment and try again.</InlineNotice></div>}
        {m && m.kind !== 'program' && (
          <div className="ox-team">
            <span className="ox-crest">{TEAM.crest}</span>
            <div><div className="ox-team__n">{TEAM.name}</div><div className="ox-team__m">Head coach {TEAM.head} · {TEAM.season}</div></div>
            <div className="ox-team__row">{empty ? <><span className="ox-stack ox-stack--empty"><i></i><i></i><i></i></span><span>No players yet. You’ll be the first on the roster.</span></> : <><span className="ox-stack">{ROSTER.slice(0, 6).map(([n], i) => <Avatar key={n} name={n} size={26} />)}</span><span>{m.kind === 'staff' ? 'Staff invite · assistant coach' : `${ROSTER.length} players on the roster`}</span></>}</div>
          </div>
        )}
        {m && m.kind === 'program' && (
          <div className="ox-team"><span className="ox-crest"><Icon name="flag" size={22} /></span><div><div className="ox-team__n">Program setup</div><div className="ox-team__m">You’ll get your own team code at the end</div></div></div>
        )}
      </div>
      {m ? <Act label={m.kind === 'program' ? 'Set up my program' : m.kind === 'staff' ? 'Join the staff' : 'Continue'} />
        : <div className="ox-act"><button type="button" className="ox-link" onClick={() => choose({ intent: 'request' })}>I don’t have a code</button></div>}
    </Q>
  );
}

function Role({ d, choose, back, dir }) {
  const opts = [['player', 'flag', 'Player', 'Post rounds, see your schedule and tee times, and work on your game with your coach.'], ['assistant', 'clipboard-list', 'Assistant coach', `Help run the program. ${TEAM.head} approves staff before you get team access.`]];
  return (
    <Q dir={dir} back={back} eyebrow={<><span className="ox-crest" style={{ width: 22, height: 22, borderRadius: 6, fontSize: 9, boxShadow: 'none' }}>{TEAM.crest}</span>{TEAM.name}</>} title="How are you joining the team?" sub="Pick one. It decides what you see on your dashboard.">
      <div className="ox-body">
        <div className="ox-choice" role="radiogroup" aria-label="Join as">
          {opts.map(([v, ic, t, s]) => (
            <button key={v} type="button" role="radio" aria-checked={d.role === v} className="ox-card" onClick={() => { hap('selection'); choose({ role: v }, 260); }}>
              <span className="ox-art"><Icon name={ic} size={24} /></span><div><b>{t}</b><p>{s}</p></div><Tick />
            </button>
          ))}
        </div>
      </div>
    </Q>
  );
}

function Name({ d, up, next, path, back, dir }) {
  const [bad, setBad] = React.useState(null);
  const go = () => { if (!d.first.trim()) { setBad('first'); hap('warning'); return; } if (!d.last.trim()) { setBad('last'); hap('warning'); return; } next(); };
  return (
    <Q dir={dir} back={back} eyebrow={<Who d={{}} path={path} />} title="First, what should we call you?" sub={path === 'head' ? 'Players and staff see this across the program.' : 'This is how you’ll appear on the roster and in messages.'} onSubmit={go}>
      <div className="ox-body">
        <div className="ox-names">
          <label className={'ox-big' + (bad === 'first' ? ' is-bad' : '')}><span>First name</span><input value={d.first} onChange={(e) => { up('first', e.target.value); setBad(null); }} placeholder="First" autoComplete="given-name" autoFocus /></label>
          <label className={'ox-big' + (bad === 'last' ? ' is-bad' : '')}><span>Last name</span><input value={d.last} onChange={(e) => { up('last', e.target.value); setBad(null); }} placeholder="Last" autoComplete="family-name" /></label>
        </div>
        <div className="ox-hello" aria-live="polite">{bad ? <span style={{ color: '#B3261E' }}>Add your {bad} name to continue.</span> : d.first.trim() ? <span key={d.first.trim().length > 1 ? 'y' : 'n'}>Nice to meet you, {d.first.trim()}.</span> : null}</div>
      </div>
      <Act disabled={!d.first.trim() || !d.last.trim()} />
    </Q>
  );
}

function Grad({ d, choose, path, back, dir }) {
  const years = ['2027', '2028', '2029', '2030', '2031', '2032'];
  return (
    <Q dir={dir} back={back} eyebrow={<Who d={d} path={path} />} title={`When do you graduate, ${d.first || 'there'}?`} sub="Sets your class on the roster. Coaches use it for eligibility.">
      <div className="ox-body">
        <div className="ox-tiles" role="radiogroup" aria-label="Graduation year">
          {years.map((y) => <button key={y} type="button" role="radio" aria-checked={d.grad === y} className="ox-tile" onClick={() => { hap('selection'); choose({ grad: y }, 280); }}><b>{y}</b><span>{classOf(y)}</span><Tick /></button>)}
        </div>
      </div>
    </Q>
  );
}

function Title({ d, choose, path, back, dir }) {
  const opts = [['Head coach', 'award', 'Runs the program and the roster'], ['Director of golf', 'landmark', 'Oversees men’s and women’s programs'], ['Associate head coach', 'users', 'Shares head coach duties']];
  return (
    <Q dir={dir} back={back} eyebrow={<Who d={d} path={path} />} title={`What’s your title, ${d.first || 'Coach'}?`} sub="It shows under your name on the team page.">
      <div className="ox-body">
        <div className="ox-rows" role="radiogroup" aria-label="Title">
          {opts.map(([t, ic, s]) => <button key={t} type="button" role="radio" aria-checked={d.title === t} className="ox-row-opt" onClick={() => { hap('selection'); choose({ title: t }, 260); }}><span className="ox-art"><Icon name={ic} size={18} /></span><span><b>{t}</b><em>{s}</em></span><span className="ox-radio"></span></button>)}
        </div>
      </div>
    </Q>
  );
}

function Account({ d, up, next, path, back, dir }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [show, setShow] = React.useState(false);
  const miss = (k) => err && err.field === k;
  const submit = () => {
    if (busy) return;
    if (!/.+@.+\..+/.test(d.email)) { setErr({ field: 'email', msg: d.email ? 'Please enter a valid email address.' : 'Enter your email.' }); hap('warning'); return; }
    const bad = pwRules(d.pw).find((r) => !r[1]);
    if (bad) { setErr({ field: 'pw', msg: bad[0] === '8+ characters' ? 'Use at least 8 characters.' : `Add ${bad[0].toLowerCase()}.` }); hap('warning'); return; }
    setErr(null); setBusy(true); hap('light');
    const fail = d.sim && d.sim.account;
    setTimeout(() => {
      setBusy(false);
      if (fail === 'exists') { setErr({ field: 'email', msg: 'An account with this email already exists. Please sign in instead, or use a different email.', signin: true }); hap('error'); up('sim', { ...d.sim, account: null }); return; }
      if (fail === 'network') { setErr({ field: null, msg: 'Unable to reach the server. Please check your internet connection and try again.' }); hap('error'); up('sim', { ...d.sim, account: null }); return; }
      hap('success'); next();
    }, 1000);
  };
  const player = path === 'player';
  return (
    <Q dir={dir} back={back} eyebrow={<Who d={d} path={path} />} title={`Create your account, ${d.first}.`} sub="You’ll use this email and password to sign in." onSubmit={submit}>
      <div className="ox-body">
        <div className="ox-fields">
          <FormField label="Email" htmlFor="ox-email" error={miss('email') && err.msg} help={player ? '' : 'Your school email helps your athletic department find you.'}><Input id="ox-email" size="lg" type="email" value={d.email} invalid={miss('email')} onChange={(e) => up('email', e.target.value)} autoComplete="email" placeholder="you@school.edu" autoFocus /></FormField>
          <div>
            <FormField label="Password" htmlFor="ox-pw" error={miss('pw') && err.msg}>
              <Input id="ox-pw" size="lg" type={show ? 'text' : 'password'} value={d.pw} invalid={miss('pw')} onChange={(e) => up('pw', e.target.value)} autoComplete="new-password"
                suffix={<button type="button" className="lg-eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(!show)}><Icon name={show ? 'eye-off' : 'eye'} size={16} /></button>} />
            </FormField>
            <div className="ox-meter" data-s={pwScore(d.pw)} aria-hidden="true"><i></i><i></i><i></i><i></i></div>
            <div className="ox-rules">{pwRules(d.pw).map(([t, ok]) => <span key={t} className={ok ? 'is-ok' : ''}><Icon name={ok ? 'circle-check' : 'circle'} size={13} />{t}</span>)}</div>
          </div>
        </div>
      </div>
      {err && err.signin && <div className="ox-err" style={{ marginTop: 14 }}><InlineNotice tone="danger" action={<Button size="sm" href="Sign in.html">Go to sign in</Button>}>This email already has a GolfHelm account.</InlineNotice></div>}
      {err && !err.field && <div className="ox-err" style={{ marginTop: 14 }}><InlineNotice tone="danger">{err.msg}</InlineNotice></div>}
      <Act label="Create account" busy={busy} busyLabel="Creating your account…" />
      <p className="ox-legal">By creating an account you agree to the <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.</p>
    </Q>
  );
}

function Game({ d, up, next, path, back, dir }) {
  const [stErr, setStErr] = React.useState(d.state && d.state.length === 1 ? 'Use the two-letter code, like TX.' : null);
  const go = () => { if (d.state && d.state.length !== 2) { setStErr('Use the two-letter code, like TX.'); hap('warning'); return; } if (d.city && !d.state) { setStErr('Add the state.'); hap('warning'); return; } next(); };
  const none = d.hcp === '' || d.hcp == null;
  const n = none ? 8 : Number(d.hcp);
  const MIN = -6, MAX = 36, pct = ((n - MIN) / (MAX - MIN)) * 100;
  const set = (v) => up('hcp', Math.round(Math.max(MIN, Math.min(MAX, v)) * 10) / 10);
  const desc = none ? 'No handicap yet. That’s fine, your coach can add one later.' : n < 0 ? 'Plus handicap. Better than scratch.' : n === 0 ? 'Scratch.' : n <= 5 ? 'Low single digits.' : n <= 12 ? 'Single to low double digits.' : 'Still building. Rounds you post here help.';
  const marks = [[-6, '+6'], [0, 'Scratch'], [10, '10'], [20, '20'], [36, '36']];
  return (
    <Q dir={dir} back={back} eyebrow={<Who d={d} path={path} />} title="Tell us about your game." sub={`${TEAM.headShort} sees this on your profile. You can change it anytime.`} onSubmit={go}>
      <div className="ox-body">
        <div className="ox-hcp">
          <div className="ox-hcp__top"><span className="ox-hcp__k">Handicap index</span><button type="button" className="ox-link" style={{ fontSize: 13, padding: 0 }} onClick={() => up('hcp', none ? 8 : '')}>{none ? 'I have one' : 'I don’t have one yet'}</button></div>
          <div className="ox-hcp__row">
            <span className={'ox-hcp__val' + (none ? ' is-none' : n < 0 ? ' is-plus' : '')}>{none ? '—' : fmtHcp(n)}</span>
            <span className="ox-hcp__desc">{desc}</span>
            {!none && <span className="ox-step-btns"><button type="button" className="ox-step-btn" aria-label="Lower" onClick={() => set(n - 0.1)}><Icon name="minus" size={16} /></button><button type="button" className="ox-step-btn" aria-label="Higher" onClick={() => set(n + 0.1)}><Icon name="plus" size={16} /></button></span>}
          </div>
          {!none && <><input className="ox-range" type="range" min={MIN} max={MAX} step="0.1" value={n} style={{ '--p': pct + '%' }} onChange={(e) => set(+e.target.value)} aria-label="Handicap index" />
            <div className="ox-scale">{marks.map(([v, l]) => <span key={v} className={v === 0 ? 'is-mark' : ''} style={{ left: ((v - MIN) / (MAX - MIN)) * 100 + '%' }}>{l}</span>)}</div></>}
        </div>
        <div>
          <div className="ox-lbl">You play</div>
          <div className="ox-hand" role="radiogroup" aria-label="Handedness">
            {[['right', 'Right-handed'], ['left', 'Left-handed']].map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={d.hand === v} className="ox-tile" onClick={() => { hap('selection'); up('hand', v); }}><span className="ox-art"><Icon name="hand" size={18} className={v === 'left' ? 'ox-mirror' : ''} /></span><b>{t}</b><Tick /></button>)}
          </div>
        </div>
        <div>
          <div className="ox-lbl">Hometown <span style={{ color: '#6B6860' }}>· optional</span></div>
          <div className="ox-city">
            <FormField label="City" htmlFor="ox-city"><Input id="ox-city" size="lg" value={d.city} onChange={(e) => up('city', e.target.value.slice(0, 40))} placeholder="Austin" autoComplete="address-level2" /></FormField>
            <FormField label="State" htmlFor="ox-state" error={stErr}><Input id="ox-state" size="lg" value={d.state} invalid={!!stErr} maxLength={2} inputMode="text" autoCapitalize="characters" autoComplete="address-level1" pattern="[A-Za-z]{2}" aria-describedby="ox-state-h" onChange={(e) => { up('state', e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()); setStErr(null); }} placeholder="TX" /></FormField>
          </div>
        </div>
      </div>
      <Act />
    </Q>
  );
}

function Photo({ d, up, next, path, back, dir }) {
  const f = React.useRef(null);
  const [over, setOver] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [perr, setPerr] = React.useState(null);
  const take = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setPerr('Choose a JPG, PNG or HEIC image.'); hap('error'); return; }
    if (file.size > 10 * 1024 * 1024) { setPerr('That photo is over 10 MB. Try a smaller one.'); hap('error'); return; }
    setPerr(null); up('photo', URL.createObjectURL(file)); hap('success');
  };
  const name = `${d.first} ${d.last}`.trim() || 'You';
  const head = path === 'head';
  const meta = head ? `${d.title || 'Head coach'} · ${d.school || 'Your program'}` : [d.grad && classOf(d.grad), d.hcp !== '' && d.hcp != null ? fmtHcp(Number(d.hcp)) + ' index' : null, [d.city, d.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Player';
  const finish = () => { if (busy) return; setBusy(true); setTimeout(() => { hap('success'); next(); }, 1000); };
  return (
    <Q dir={dir} back={back} eyebrow={<Who d={d} path={path} />} title={head ? 'Put a face to the program.' : 'Put a face to the name.'} sub={head ? 'Players and recruits see this on your team page.' : 'Teammates see this on the roster, the leaderboard and in messages.'} onSubmit={finish}>
      <div className="ox-body">
        <div className="ox-photo">
          <button type="button" className={'ox-drop' + (over ? ' is-over' : '')} onClick={() => f.current.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }} aria-label={d.photo ? 'Replace photo' : 'Choose a photo'}>
            <span className="ox-drop__in">{d.photo ? <img src={d.photo} alt="" /> : <span className="ox-drop__ph"><Icon name="image-plus" size={26} />{over ? 'Drop it here' : <>Drop a photo<br />or click to choose</>}</span>}</span>
            <span className="ox-drop__cam"><Icon name="camera" size={16} /></span>
          </button>
          <input ref={f} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files && e.target.files[0])} />
          {(perr || (d.sim && d.sim.photo)) && <div className="ox-err" style={{ gridColumn: '1 / -1' }}><InlineNotice tone="danger">{perr || 'That photo is over 10 MB. Try a smaller one.'}</InlineNotice></div>}
          <div className="ox-preview">
            <span className="ox-preview__k">{head ? 'How players see you' : 'How you’ll look on the roster'}</span>
            {!head && <div className="ox-prow is-ghost"><Avatar name={ROSTER[1][0]} size={32} /><span><b>{ROSTER[1][0]}</b><em>{ROSTER[1][1]}</em></span><span className="ox-prow__n">{ROSTER[1][2]}</span></div>}
            <div className="ox-prow">{d.photo ? <img className="ox-av" src={d.photo} alt="" /> : <Avatar name={name} size={40} />}<span style={{ minWidth: 0 }}><b>{name}</b><em>{meta}</em></span>{!head && <span className="ox-prow__n">{d.hcp !== '' && d.hcp != null ? fmtHcp(Number(d.hcp)) : '—'}</span>}</div>
            {!head && <div className="ox-prow is-ghost"><Avatar name={ROSTER[2][0]} size={32} /><span><b>{ROSTER[2][0]}</b><em>{ROSTER[2][1]}</em></span><span className="ox-prow__n">{ROSTER[2][2]}</span></div>}
          </div>
        </div>
      </div>
      <Act label={head ? 'Create my program' : 'Finish setup'} busy={busy} busyLabel={head ? 'Creating your program…' : 'Finishing…'} icon="check">
        {!d.photo && !busy && <button type="button" className="ox-link" onClick={finish}>Skip for now</button>}
      </Act>
    </Q>
  );
}

function Program({ d, up, next, path, back, dir }) {
  const [bad, setBad] = React.useState(false);
  const DIVS = [['NCAA', 'D1'], ['NCAA', 'D2'], ['NCAA', 'D3'], ['NAIA', ''], ['NJCAA', ''], ['High school', ''], ['Club', ''], ['Other', '']];
  const go = () => { if (!d.school.trim()) { setBad(true); hap('warning'); return; } next(); };
  return (
    <Q dir={dir} back={back} eyebrow={<Who d={d} path={path} />} title={`Tell us about your program, Coach ${d.last || ''}.`.replace(' .', '.')} sub="This is how players, staff and opponents will see your team." onSubmit={go}>
      <div className="ox-body">
        <label className={'ox-big' + (bad ? ' is-bad' : '')}><span>School or organization</span><input value={d.school} onChange={(e) => { up('school', e.target.value); setBad(false); }} placeholder="University name" autoFocus /></label>
        <div>
          <div className="ox-lbl">Division</div>
          <div className="ox-tiles ox-tiles--4" role="radiogroup" aria-label="Division">
            {DIVS.map(([a, b]) => { const v = (a + ' ' + b).trim(); return <button key={v} type="button" role="radio" aria-checked={d.div === v} className="ox-tile ox-tile--s" onClick={() => { hap('selection'); up('div', v); }}><span>{b ? a : ' '}</span><b>{b || a}</b><Tick /></button>; })}
          </div>
        </div>
        <div>
          <div className="ox-lbl">Team</div>
          <div className="ox-hand" role="radiogroup" aria-label="Team">
            {[['mens', 'Men’s golf'], ['womens', 'Women’s golf']].map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={d.gender === v} className="ox-tile" onClick={() => { hap('selection'); up('gender', v); }}><span className="ox-art"><Icon name="flag" size={18} /></span><b>{t}</b><Tick /></button>)}
          </div>
        </div>
        <FormField label="Conference" htmlFor="ox-conf" optional><Input id="ox-conf" size="lg" value={d.conf} onChange={(e) => up('conf', e.target.value)} /></FormField>
      </div>
      <Act disabled={!d.school.trim()} />
    </Q>
  );
}

function Done({ d, finish, choose }) {
  if (d.sim && d.sim.join === 'fail') return (
    <Q eyebrow={<><Icon name="circle-alert" size={15} />Almost there</>} title={`Your profile is saved, ${d.first || 'there'}.`} sub="We couldn’t add you to your coach’s team with that invite link. Ask your coach to re-send it, or enter the team code again.">
      <div className="ox-act"><Button variant="primary" size="lg" rightIcon="arrow-right" onClick={() => choose({ sim: {}, match: null, code: '' }, 0, 'code')}>Enter a team code</Button><Button variant="ghost" size="lg" onClick={() => finish('../Player - Home.html')}>Go to your dashboard</Button></div>
    </Q>
  );
  const empty = d.sim && d.sim.emptyTeam;
  return (
    <Q eyebrow={<><Icon name="circle-check" size={15} />Welcome to {TEAM.name}</>} title={empty ? `You’re the first on the roster, ${d.first || 'there'}.` : `You’re on the roster, ${d.first || 'there'}.`} sub={empty ? <>{TEAM.headShort} will add teammates soon. Your member card is ready.</> : <>{TEAM.headShort} and {ROSTER.length} teammates are already here. Your member card is ready.</>}>
      <div className="ox-act"><Button variant="primary" size="lg" rightIcon="arrow-right" onClick={() => finish('../Player - Home.html')}>Go to your dashboard</Button></div>
      <ul className="ox-list is-glass" style={{ marginTop: 26, maxWidth: 440 }}>
        {[['flag', 'Post your first round', 'Scores feed your stats and CoachHelm'], ['book-open', 'Add your class schedule', 'Flags travel conflicts early'], ['bell', 'Turn on notifications', 'Pairings, tee times and team messages']].map(([ic, t, m]) => <li key={t}><span className="ox-list__ic"><Icon name={ic} size={15} /></span><span><b>{t}</b><em>{m}</em></span><Icon name="chevron-right" size={15} style={{ color: 'var(--text-tertiary)' }} /></li>)}
      </ul>
    </Q>
  );
}

function Pending({ d, back, dir, choose }) {
  const [busy, setBusy] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  return (
    <Q dir={dir} eyebrow={<Who d={d} path="assistant" />} title={`Your request is with ${TEAM.headShort}.`} sub={`Your account is ready, ${d.first || 'Coach'}. ${TEAM.head} approves staff from Team settings, and the team appears here the moment she does.`} onSubmit={() => { setBusy(true); setTimeout(() => { setBusy(false); setChecked(true); hap('light'); }, 900); }}>
      <div className="ox-body">
        <ul className="ox-list">
          <li className="is-done"><span className="ox-list__ic"><Icon name="check" size={15} strokeWidth={2.6} /></span><span><b>Account created</b><em>{d.email || 'Signed in'}</em></span></li>
          <li className="is-done"><span className="ox-list__ic"><Icon name="send" size={14} /></span><span><b>Request sent to {TEAM.head}</b><em>Assistant coach · {TEAM.name}</em></span><span className="ox-k">Just now</span></li>
          <li className="is-wait"><span className="ox-list__ic"><Icon name="hourglass" size={14} /></span><span><b>Head coach approval</b><em>{checked ? 'Still waiting. We’ll email you when it’s done.' : 'Nothing else is needed from you'}</em></span><i className="ox-pulse"></i></li>
          <li className="is-later"><span className="ox-list__ic"><Icon name="lock-open" size={14} /></span><span><b>Full team access</b><em>Roster, calendar, stats and CoachHelm</em></span></li>
        </ul>
      </div>
      <Act label="Check again" icon="refresh-cw" busy={busy} busyLabel="Checking…"><button type="button" className="ox-link" onClick={() => choose({ role: 'player' }, 0, 'name')}>I’m a player instead</button></Act>
    </Q>
  );
}

function StaffDone({ d, finish }) {
  return (
    <Q eyebrow={<><Icon name="circle-check" size={15} />Staff access granted</>} title={`You’re on staff, Coach ${d.last || ''}.`.replace(' .', '.')} sub={<>{TEAM.head} added you as an assistant coach at {TEAM.name}. The roster, calendar and stats are ready for you.</>}>
      <div className="ox-act"><Button variant="primary" size="lg" rightIcon="arrow-right" onClick={() => finish('../Coach - Home.html')}>Go to the dashboard</Button></div>
    </Q>
  );
}

function CoachDone({ d, finish }) {
  const [copied, setCopied] = React.useState(null);
  const code = 'R4TW9KLM';
  const copy = (k, v) => { try { navigator.clipboard && navigator.clipboard.writeText(v); } catch (e) {} setCopied(k); hap('light'); setTimeout(() => setCopied(null), 1600); };
  const team = `${d.school || 'Your program'} ${d.gender === 'womens' ? 'Women’s' : 'Men’s'} Golf`;
  return (
    <Q eyebrow={<><Icon name="circle-check" size={15} />Program created</>} title={`${team} is open for play.`} sub="Share this code with players and assistant coaches. Players land on your roster the moment they sign up.">
      <div className="ox-jc" style={{ marginTop: 26, maxWidth: 460 }}>
        <div className="ox-jc__k"><span>Your team code</span><span>One code for players and staff</span></div>
        <div className="ox-jc__code" aria-label={code}>{code.slice(0, 4).split('').map((c, i) => <span key={i} style={{ '--i': i }}>{c}</span>)}<b></b>{code.slice(4).split('').map((c, i) => <span key={i + 4} style={{ '--i': i + 4 }}>{c}</span>)}</div>
        <div className="ox-jc__btns">
          <Button size="sm" leftIcon={copied === 'code' ? 'check' : 'copy'} onClick={() => copy('code', code)}>{copied === 'code' ? 'Copied' : 'Copy code'}</Button>
          <Button size="sm" leftIcon={copied === 'link' ? 'check' : 'link'} onClick={() => copy('link', 'https://golfhelm.app/join/' + code)}>{copied === 'link' ? 'Copied' : 'Copy invite link'}</Button>
        </div>
      </div>
      <div className="ox-act"><Button variant="primary" size="lg" rightIcon="arrow-right" onClick={() => finish('../Coach - Roster.html')}>Invite players</Button><Button variant="ghost" size="lg" onClick={() => finish('../Coach - Home.html')}>Go to the dashboard</Button></div>
    </Q>
  );
}

function RWho({ d, choose, back, dir }) {
  const opts = [['coach', 'clipboard-list', 'Coach', 'Bring your program onto GolfHelm.'], ['ad', 'landmark', 'Athletic director', 'Set up golf, or several teams, for your department.'], ['player', 'flag', 'Player', 'Your coach isn’t on GolfHelm yet. We’ll reach out to them.']];
  return (
    <Q dir={dir} back={back} eyebrow="Request access" title="Who are we setting up?" sub="We set up every program by hand, so tell us a little about you first.">
      <div className="ox-body">
        <div className="ox-choice ox-choice--3" role="radiogroup" aria-label="I am a">
          {opts.map(([v, ic, t, s]) => <button key={v} type="button" role="radio" aria-checked={d.rtitle === v} className="ox-card" style={{ minHeight: 210 }} onClick={() => { hap('selection'); choose({ rtitle: v }, 260); }}><span className="ox-art"><Icon name={ic} size={24} /></span><div><b>{t}</b><p>{s}</p></div><Tick /></button>)}
        </div>
      </div>
    </Q>
  );
}

function RDetails({ d, up, next, back, dir }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const miss = (k) => err && err.field === k;
  const submit = () => {
    if (busy) return;
    for (const [k, msg] of [['rfirst', 'Enter your first name.'], ['rlast', 'Enter your last name.'], ['rschool', 'Enter your school.'], ['remail', 'Enter your email.']]) if (!String(d[k] || '').trim()) { setErr({ field: k, msg }); hap('warning'); return; }
    if (!/.+@.+\..+/.test(d.remail)) { setErr({ field: 'remail', msg: 'Please enter a valid email address.' }); hap('warning'); return; }
    setErr(null); setBusy(true);
    setTimeout(() => { setBusy(false); if (d.sim && d.sim.request === 'network') { setErr({ field: null, msg: 'Unable to reach the server. Your details are still here. Check your connection and try again.' }); hap('error'); up('sim', { ...d.sim, request: null }); return; } hap('success'); next(); }, 1000);
  };
  const P = d.rtitle === 'player', A = d.rtitle === 'ad';
  return (
    <Q dir={dir} back={back} eyebrow={<><Icon name={P ? 'flag' : A ? 'landmark' : 'clipboard-list'} size={14} />{TITLES[d.rtitle] || 'Request access'}</>} title={P ? 'Tell us about you and your coach.' : A ? 'Tell us about your department.' : 'Tell us about your program.'} sub="We’ll reply by email with next steps." onSubmit={submit}>
      <div className="ox-body">
        <div className="ox-fields">
          <div className="ox-2">
            <FormField label="First name" htmlFor="ox-rf" error={miss('rfirst') && err.msg}><Input id="ox-rf" size="lg" value={d.rfirst} invalid={miss('rfirst')} onChange={(e) => up('rfirst', e.target.value)} autoComplete="given-name" autoFocus /></FormField>
            <FormField label="Last name" htmlFor="ox-rl" error={miss('rlast') && err.msg}><Input id="ox-rl" size="lg" value={d.rlast} invalid={miss('rlast')} onChange={(e) => up('rlast', e.target.value)} autoComplete="family-name" /></FormField>
          </div>
          <FormField label={A ? 'School or athletic department' : 'School or program'} htmlFor="ox-rs" error={miss('rschool') && err.msg}><Input id="ox-rs" size="lg" value={d.rschool} invalid={miss('rschool')} onChange={(e) => up('rschool', e.target.value)} /></FormField>
          {P && <FormField label="Your coach’s name" htmlFor="ox-rc" optional><Input id="ox-rc" size="lg" value={d.rcoach} onChange={(e) => up('rcoach', e.target.value)} /></FormField>}
          <FormField label="Email" htmlFor="ox-re" error={miss('remail') && err.msg} help={P ? '' : 'Your school email helps us verify you faster.'}><Input id="ox-re" size="lg" type="email" value={d.remail} invalid={miss('remail')} onChange={(e) => up('remail', e.target.value)} autoComplete="email" placeholder="you@school.edu" /></FormField>
          <FormField label="Anything we should know?" htmlFor="ox-rn" optional><TextArea id="ox-rn" rows={3} value={d.rnote} onChange={(e) => up('rnote', e.target.value)} placeholder={A ? 'Which sports, and how many teams' : 'Roster size, season start, or what you’d use first'} /></FormField>
        </div>
      </div>
      {err && !err.field && <div className="ox-err" style={{ marginTop: 14 }}><InlineNotice tone="danger">{err.msg}</InlineNotice></div>}
      <Act label="Send request" busy={busy} busyLabel="Sending…" icon="send" />
    </Q>
  );
}

function Sent({ d }) {
  return (
    <Q eyebrow={<><Icon name="circle-check" size={15} />Request received</>} title={`Thanks, ${d.rfirst || 'there'}. We’ve got it.`} sub={<>We’ll email <b>{d.remail || 'you'}</b> when your access is ready.</>}>
      <div className="ox-sum" style={{ marginTop: 26, maxWidth: 440 }}>
        {[['Name', `${d.rfirst} ${d.rlast}`.trim()], ['Title', TITLES[d.rtitle]], ['Program', d.rschool], ['Email', d.remail]].map(([k, v]) => <div key={k}><span>{k}</span>{v || '—'}</div>)}
      </div>
      <div className="ox-act"><Button size="lg" href="Sign in.html">Back to sign in</Button></div>
    </Q>
  );
}

Object.assign(window, {
  OX_STEPS: { intro: Intro, code: Code, role: Role, name: Name, grad: Grad, title: Title, account: Account, game: Game, photo: Photo, program: Program, done: Done, pending: Pending, staffdone: StaffDone, cdone: CoachDone, rwho: RWho, rdetails: RDetails, sent: Sent },
  OXH: { TEAM, ROSTER, classOf, fmtHcp, TITLES },
});
})();
