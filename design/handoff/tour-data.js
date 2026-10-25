/* GolfHelm · Tournaments fixture + comparison engine.
   Round-level records are the single source; every aggregate on screen is computed from them with its denominator. */
(function () {
  const rng = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const PLAYERS = [
    { id: 'theo', name: 'Theo Marchetti', year: 'Senior', base: 71.0, ott: .7, app: .5, arg: .1, putt: .3 },
    { id: 'sofia', name: 'Sofia Alvarez', year: 'Senior', base: 71.8, ott: .2, app: .6, arg: .2, putt: .1 },
    { id: 'ava', name: 'Ava Lindqvist', year: 'Junior', base: 72.3, ott: .3, app: .1, arg: .3, putt: .0 },
    { id: 'jonah', name: 'Jonah Okafor', year: 'Sophomore', base: 72.6, ott: .1, app: -.2, arg: .1, putt: -.2 },
    { id: 'eli', name: 'Eli Brandt', year: 'Junior', base: 72.9, ott: -.1, app: .0, arg: -.2, putt: .2 },
    { id: 'priya', name: 'Priya Natarajan', year: 'Freshman', base: 74.4, ott: -.3, app: -.4, arg: .0, putt: -.1 },
    { id: 'will', name: 'Will Harper', year: 'Graduated 2026', base: 72.0, ott: .2, app: .2, arg: .0, putt: .1, alumni: true },
  ];
  const P = Object.fromEntries(PLAYERS.map((p) => [p.id, p]));
  // context offsets (strokes vs base) — tournaments play harder for some players; course, not "pressure"
  const CTX = { tournament: { theo: .2, sofia: .4, ava: .3, jonah: 1.6, eli: .5, priya: .8, will: .3 }, qualifier: { theo: -.1, sofia: .1, ava: .2, jonah: .1, eli: .2, priya: .2, will: .1 }, practice: { theo: -.6, sofia: -.4, ava: -.3, jonah: -.8, eli: -.4, priya: -.3, will: -.4 } };

  const COURSES = { oak: ['Oakmont CC', 'Blue tees', 72, 74.1], sed: ['Sedgefield CC', 'Tournament tees', 72, 73.4], dog: ['Dogwood Lakes', 'Black tees', 72, 73.0], pin: ['Pinehurst No. 2', 'Blue tees', 72, 75.3], home: ['Home course', 'Blue tees', 71, 72.2], ric: ['Riverside Links', 'Back tees', 72, 73.6], hol: ['Holly Ridge', 'Blue tees', 71, 72.8], lak: ['Lakeside GC', 'Tips', 72, 74.0] };
  const EVENTS = [
    // last season
    { id: 'e21', season: '2025–26', name: 'Riverside Intercollegiate', dates: ['2025-09-15', '2025-09-16'], course: 'ric', rounds: ['2025-09-15', '2025-09-15', '2025-09-16'], count: [5, 4], finish: [6, 15], lineup: ['theo', 'sofia', 'ava', 'will', 'jonah'] },
    { id: 'e22', season: '2025–26', name: 'Holly Ridge Classic', dates: ['2025-10-06', '2025-10-07'], course: 'hol', rounds: ['2025-10-06', '2025-10-07'], count: [5, 4], finish: [9, 12], lineup: ['theo', 'sofia', 'ava', 'will', 'jonah'] },
    { id: 'e23', season: '2025–26', name: 'Lakeside Invitational', dates: ['2026-03-02', '2026-03-04'], course: 'lak', rounds: ['2026-03-02', '2026-03-03', '2026-03-04'], count: [5, 4], finish: [5, 14], lineup: ['theo', 'sofia', 'ava', 'will', 'jonah'] },
    { id: 'e24', season: '2025–26', name: 'Conference Championship', dates: ['2026-04-19', '2026-04-21'], course: 'dog', rounds: ['2026-04-19', '2026-04-20', '2026-04-21'], count: [5, 4], finish: [4, 10], lineup: ['theo', 'sofia', 'ava', 'will', 'jonah'], missing: true },
    // this season
    { id: 'e31', season: '2026–27', name: 'Sedgefield Invitational', dates: ['2026-09-08', '2026-09-09'], course: 'sed', rounds: ['2026-09-08', '2026-09-08', '2026-09-09'], count: [5, 4], finish: [5, 12], lineup: ['theo', 'sofia', 'ava', 'eli', 'jonah'], ind: ['priya'] },
    { id: 'e32', season: '2026–27', name: 'Dogwood Collegiate', dates: ['2026-09-21', '2026-09-23'], course: 'dog', rounds: ['2026-09-21', '2026-09-22', '2026-09-23'], count: [6, 5], finish: [4, 13], lineup: ['theo', 'sofia', 'ava', 'eli', 'jonah', 'priya'] },
    { id: 'e33', season: '2026–27', name: 'Oakmont Fall Classic', dates: ['2026-10-05', '2026-10-07'], course: 'oak', rounds: ['2026-10-05', '2026-10-06', '2026-10-07'], count: [5, 4], finish: [3, 14], lineup: ['theo', 'sofia', 'ava', 'jonah', 'eli'], ind: ['priya'], fixed: true },
    { id: 'e34', season: '2026–27', name: 'Pinehurst Intercollegiate', dates: ['2026-10-20', '2026-10-21'], course: 'pin', rounds: ['2026-10-20', '2026-10-21'], count: [5, 4], upcoming: true, lineupNote: 'Lineup from the Pinehurst qualifier · 4 of 5 set' },
    { id: 'e35', season: '2026–27', name: 'Holly Ridge Classic', dates: ['2026-11-02', '2026-11-03'], course: 'hol', rounds: ['2026-11-02', '2026-11-03'], count: [5, 4], upcoming: true, lineupNote: 'Qualifier opens Oct 24' },
  ];
  // Oakmont fixture: the spec's five-count-four table, mapped to our roster
  const OAK = { theo: [70, 73, 71], sofia: [72, 71, 74], ava: [74, 70, 72], jonah: [75, 76, 69], eli: [71, 72, 73], priya: [76, 74, 73] };
  const OAK_SHOT = { theo: [1, 1, 1], sofia: [1, 1, 0], ava: [1, 1, 1], jonah: [0, 1, 1], eli: [1, 0, 0], priya: [1, 1, 1] }; // 11 of 15 team rounds with shot data
  const PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 4];

  const QUALS = ['2025-09-02', '2025-09-04', '2025-09-26', '2025-09-29', '2026-02-18', '2026-02-20', '2026-04-08', '2026-04-10', '2026-08-26', '2026-08-28', '2026-09-15', '2026-09-16', '2026-09-30', '2026-10-01', '2026-10-13', '2026-10-14'];
  const PRACT = []; for (let t = Date.parse('2025-08-20'); t <= Date.parse('2026-10-12'); t += 86400000 * 9) { const d = new Date(t); if (d.getMonth() !== 5 && d.getMonth() !== 6 && d.getMonth() !== 11) PRACT.push(d.toISOString().slice(0, 10)); }

  function mkRound(r, p, ctx, date, course, score, opts = {}) {
    const [cname, tees, par, rating] = COURSES[course];
    const holes = opts.nine ? 9 : 18;
    const toPar = score - (opts.nine ? Math.round(par / 2) : par);
    const perf = (score - (opts.nine ? rating / 2 : rating)) / holes * 18; // strokes vs course rating, per 18
    const gir = Math.max(3, Math.min(holes, Math.round(holes * (0.64 - perf * 0.035) + (r() - .5) * 2)));
    const fwOpp = opts.nine ? 7 : 14, fw = Math.max(2, Math.min(fwOpp, Math.round(fwOpp * (0.62 - perf * 0.02) + (r() - .5) * 2)));
    const pen = Math.max(0, Math.round((ctx === 'tournament' && p.id === 'jonah' ? 1.0 : ctx === 'practice' ? .3 : .6) * holes / 18 + (r() - .5) * 1.4));
    const putts = Math.round(holes * 1.66 + perf * .25 + (r() - .5) * 3);
    const three = Math.max(0, Math.round((putts - holes * 1.6) / 2.2 + (r() - .3)));
    const scrOpp = holes - gir, scr = Math.max(0, Math.min(scrOpp, Math.round(scrOpp * (0.55 - perf * 0.02 + p.arg * .05) + (r() - .5))));
    const birdies = Math.max(0, Math.round(holes * (0.16 - perf * 0.012) + (r() - .5) * 1.5));
    const dbl = Math.max(0, Math.round(holes * (0.05 + perf * 0.008) + (r() - .5) * 1.2 + (pen > 1 ? 1 : 0)));
    const shot = opts.shot != null ? !!opts.shot : r() > (ctx === 'practice' ? .35 : .15);
    const ctxShift = ctx === 'tournament' ? -(CTX.tournament[p.id] - .3) * .5 : 0;
    const sg = shot && !opts.nine ? { ott: +(p.ott + (r() - .5) * .9 - (ctx === 'tournament' && p.id === 'jonah' ? .4 : 0)).toFixed(2), app: +(p.app + (r() - .5) * 1.1 + ctxShift).toFixed(2), arg: +(p.arg + (r() - .5) * .7).toFixed(2), putt: +(p.putt + (r() - .5) * 1.0 + (ctx === 'tournament' && p.id === 'jonah' ? -.35 : ctx === 'practice' && p.id === 'jonah' ? .3 : 0)).toFixed(2) } : null;
    const prox = shot ? Math.round(33 + perf * 1.4 + (r() - .5) * 6) : null;
    return { id: `${ctx}-${p.id}-${date}-${opts.n || 0}`, player: p.id, ctx, date, course, courseName: cname, tees, par: opts.nine ? Math.round(par / 2) : par, holes, score, toPar, gir, fw, fwOpp, pen, putts, three, scr, scrOpp, birdies, dbl, sg, prox, shot, event: opts.event || null, rnd: opts.rnd || null, nc: false, ind: !!opts.ind, wd: !!opts.wd };
  }
  const ROUNDS = [];
  const r = rng(26);
  EVENTS.filter((e) => !e.upcoming).forEach((e) => {
    const entrants = [...e.lineup.map((id) => [id, false]), ...(e.ind || []).map((id) => [id, true])];
    e.rounds.forEach((date, ri) => {
      const rows = entrants.map(([id, ind]) => {
        const p = P[id];
        const score = e.fixed ? OAK[id][ri] : Math.round(p.base + CTX.tournament[id] + (COURSES[e.course][3] - 73) + (r() - .5) * 5);
        return mkRound(r, p, 'tournament', date, e.course, score, { event: e.id, rnd: ri + 1, n: ri, ind, shot: e.fixed ? OAK_SHOT[id][ri] : e.missing ? 0 : undefined });
      });
      // counting: lowest `count[1]` whole-round scores among team entries
      const team = rows.filter((x) => !x.ind).sort((a, b) => a.score - b.score);
      const cut = team[e.count[1] - 1].score;
      const tied = team.filter((x) => x.score === cut).length, below = team.filter((x) => x.score < cut).length;
      team.forEach((x, i) => { x.nc = i >= e.count[1]; x.boundaryTie = x.score === cut && below + tied > e.count[1]; });
      ROUNDS.push(...rows);
    });
  });
  const active = (p, date) => p.alumni ? date < '2026-06-30' : p.id === 'priya' ? date >= '2026-08-01' : true;
  QUALS.forEach((date, i) => PLAYERS.forEach((p) => { if (!active(p, date)) return; const c = i % 3 === 0 ? 'home' : i % 3 === 1 ? 'hol' : 'dog'; ROUNDS.push(mkRound(r, p, 'qualifier', date, c, Math.round(p.base + CTX.qualifier[p.id] + (COURSES[c][3] - 73) + (r() - .5) * 4.5))); }));
  PRACT.forEach((date, i) => PLAYERS.forEach((p, j) => { if ((i + j) % 3 === 0 || !active(p, date)) return; const nine = (i + j) % 7 === 0; const s = p.base + CTX.practice[p.id] + (COURSES.home[3] - 73) + (r() - .5) * 4; ROUNDS.push(mkRound(r, p, 'practice', date, 'home', Math.round(nine ? s / 2 : s), { nine })); }));
  ROUNDS.sort((a, b) => a.date.localeCompare(b.date));

  // ── scopes ──────────────────────────────────────────────
  const MATCHED = ['theo', 'sofia', 'ava', 'jonah'];
  const SEASONS = { '2026–27': ['2026-08-01', '2027-06-30'], '2025–26': ['2025-08-01', '2026-06-30'] };
  const SAMPLE_LABEL = { season: 'This season', last: 'Last season', l10: 'Last 10 rounds', event: 'One event', range: 'Custom range' };
  function select(scope) {
    const { subject, ctx, sample, event, range, rounds } = scope;
    let rs = ROUNDS.filter((x) => x.ctx === ctx && !x.wd);
    if (subject === 'team') rs = rs.filter((x) => !x.ind);
    else if (subject === 'matched') rs = rs.filter((x) => !x.ind && MATCHED.includes(x.player));
    else rs = rs.filter((x) => x.player === subject);
    if (sample === 'season') rs = rs.filter((x) => x.date >= SEASONS['2026–27'][0]);
    if (sample === 'last') rs = rs.filter((x) => x.date >= SEASONS['2025–26'][0] && x.date <= SEASONS['2025–26'][1]);
    if (sample === 'event') rs = rs.filter((x) => x.event === event && (!rounds || rounds.includes(x.rnd)));
    if (sample === 'range' && range) rs = rs.filter((x) => x.date >= range[0] && x.date <= range[1]);
    if (sample === 'l10') rs = subject === 'team' ? rs.slice(-50) : rs.slice(-10);
    return rs;
  }
  const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  // metric definitions: value fn over rounds, denominators, direction, format
  const M = {
    rounds: { label: 'Completed 18-hole rounds', group: 'scoring', calc: (rs) => ({ v: rs.filter((x) => x.holes === 18).length, n: rs.length, per: null }), fmt: (v) => String(v), info: true },
    avg: { label: 'Scoring average', group: 'scoring', lower: true, calc: (rs) => { const f = rs.filter((x) => x.holes === 18); return { v: mean(f.map((x) => x.score)), n: f.length, unit: 'rounds', ex: rs.length - f.length, pts: f.map((x) => [x, x.score]) }; }, fmt: (v) => v.toFixed(1), d: (a, b) => a - b, dfmt: (d) => Math.abs(d).toFixed(1) + (Math.abs(d) === 1 ? ' stroke' : ' strokes'), note: 'Different courses: this is an observed difference, not a course-adjusted estimate.' },
    rel: { label: 'Versus course rating', group: 'scoring', lower: true, calc: (rs) => { const f = rs.filter((x) => x.holes === 18); return { v: mean(f.map((x) => x.score - COURSES[x.course][3])), n: f.length, unit: 'rounds', pts: f.map((x) => [x, x.score - COURSES[x.course][3]]) }; }, fmt: (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1), d: (a, b) => a - b, dfmt: (d) => Math.abs(d).toFixed(1) + ' strokes', note: 'Score minus the course rating for the tees played. Closer to like-for-like across courses.' },
    bird: { label: 'Birdies or better / 18', group: 'scoring', calc: (rs) => { const h = rs.reduce((s, x) => s + x.holes, 0); return { v: h ? rs.reduce((s, x) => s + x.birdies, 0) / h * 18 : null, n: h, unit: 'holes', pts: rs.map((x) => [x, x.birdies / x.holes * 18]) }; }, fmt: (v) => v.toFixed(1), d: (a, b) => a - b, dfmt: (d) => Math.abs(d).toFixed(1) },
    dbl: { label: 'Doubles or worse / 18', group: 'scoring', lower: true, calc: (rs) => { const h = rs.reduce((s, x) => s + x.holes, 0); return { v: h ? rs.reduce((s, x) => s + x.dbl, 0) / h * 18 : null, n: h, unit: 'holes', pts: rs.map((x) => [x, x.dbl / x.holes * 18]) }; }, fmt: (v) => v.toFixed(1), d: (a, b) => a - b, dfmt: (d) => Math.abs(d).toFixed(1) },
    fw: { label: 'Fairways hit', group: 'tee', calc: (rs) => { const o = rs.reduce((s, x) => s + x.fwOpp, 0), h = rs.reduce((s, x) => s + x.fw, 0); return { v: o ? h / o * 100 : null, n: o, hit: h, unit: 'tee shots', pts: rs.map((x) => [x, x.fw / x.fwOpp * 100]) }; }, fmt: (v) => Math.round(v) + '%', d: (a, b) => a - b, dfmt: (d) => Math.round(Math.abs(d)) + ' pts', pp: true },
    pen: { label: 'Penalty strokes / 18', group: 'tee', lower: true, calc: (rs) => { const h = rs.reduce((s, x) => s + x.holes, 0); return { v: h ? rs.reduce((s, x) => s + x.pen, 0) / h * 18 : null, n: h, total: rs.reduce((s, x) => s + x.pen, 0), unit: 'holes', pts: rs.map((x) => [x, x.pen / x.holes * 18]) }; }, fmt: (v) => v.toFixed(1), d: (a, b) => a - b, dfmt: (d) => Math.abs(d).toFixed(1) },
    sgott: { label: 'SG off the tee', group: 'tee', sg: 'ott' },
    gir: { label: 'Greens in regulation', group: 'app', calc: (rs) => { const o = rs.reduce((s, x) => s + x.holes, 0), h = rs.reduce((s, x) => s + x.gir, 0); return { v: o ? h / o * 100 : null, n: o, hit: h, unit: 'holes', pts: rs.map((x) => [x, x.gir / x.holes * 100]) }; }, fmt: (v) => Math.round(v) + '%', d: (a, b) => a - b, dfmt: (d) => Math.round(Math.abs(d)) + ' pts', pp: true },
    prox: { label: 'Approach proximity', group: 'app', lower: true, calc: (rs) => { const f = rs.filter((x) => x.prox != null); return { v: mean(f.map((x) => x.prox)), n: f.length, of: rs.length, unit: 'rounds with shot data', pts: f.map((x) => [x, x.prox]) }; }, fmt: (v) => Math.round(v) + ' ft', d: (a, b) => a - b, dfmt: (d) => Math.round(Math.abs(d)) + ' ft', shot: true },
    sgapp: { label: 'SG approach', group: 'app', sg: 'app' },
    scr: { label: 'Scrambling', group: 'arg', calc: (rs) => { const o = rs.reduce((s, x) => s + x.scrOpp, 0), h = rs.reduce((s, x) => s + x.scr, 0); return { v: o ? h / o * 100 : null, n: o, hit: h, unit: 'missed greens', pts: rs.map((x) => [x, x.scrOpp ? x.scr / x.scrOpp * 100 : 0]) }; }, fmt: (v) => Math.round(v) + '%', d: (a, b) => a - b, dfmt: (d) => Math.round(Math.abs(d)) + ' pts', pp: true },
    sgarg: { label: 'SG around the green', group: 'arg', sg: 'arg' },
    putts: { label: 'Putts / 18', group: 'putt', lower: true, calc: (rs) => { const h = rs.reduce((s, x) => s + x.holes, 0); return { v: h ? rs.reduce((s, x) => s + x.putts, 0) / h * 18 : null, n: h, unit: 'holes', pts: rs.map((x) => [x, x.putts / x.holes * 18]) }; }, fmt: (v) => v.toFixed(1), d: (a, b) => a - b, dfmt: (d) => Math.abs(d).toFixed(1) },
    three: { label: '3-putts / 18', group: 'putt', lower: true, calc: (rs) => { const h = rs.reduce((s, x) => s + x.holes, 0); return { v: h ? rs.reduce((s, x) => s + x.three, 0) / h * 18 : null, n: h, unit: 'holes', pts: rs.map((x) => [x, x.three / x.holes * 18]) }; }, fmt: (v) => v.toFixed(1), d: (a, b) => a - b, dfmt: (d) => Math.abs(d).toFixed(1) },
    sgputt: { label: 'SG putting', group: 'putt', sg: 'putt' },
  };
  Object.values(M).forEach((m) => { if (m.sg) { const k = m.sg; Object.assign(m, { calc: (rs) => { const f = rs.filter((x) => x.sg && x.holes === 18); return { v: f.length ? mean(f.map((x) => x.sg[k])) : null, n: f.length, of: rs.filter((x) => x.holes === 18).length, unit: 'rounds with shot data', pts: f.map((x) => [x, x.sg[k]]) }; }, fmt: (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1), d: (a, b) => a - b, dfmt: (d) => Math.abs(d).toFixed(1) + ' strokes', shot: true, bench: 'D1 men’s benchmark v3', per: 'per round' }); } });
  const GROUPS = [['scoring', 'Scoring', ['rounds', 'avg', 'rel', 'bird', 'dbl']], ['tee', 'Off the tee', ['fw', 'pen', 'sgott']], ['app', 'Approach', ['gir', 'prox', 'sgapp']], ['arg', 'Short game', ['scr', 'sgarg']], ['putt', 'Putting', ['putts', 'three', 'sgputt']]];
  const MIN = 3; // fewer valid observations than this: insufficient sample
  function stat(key, rs) { const m = M[key], c = m.calc(rs); return { ...c, state: c.v == null ? (m.shot ? 'noshot' : 'none') : !m.info && c.n < MIN && (m.unit === 'rounds' || m.unit === 'rounds with shot data') ? 'thin' : 'ok' }; }
  function compare(key, ra, rb) {
    const m = M[key], a = stat(key, ra), b = stat(key, rb);
    if (m.info || a.state !== 'ok' || b.state !== 'ok') return { a, b, d: null };
    const d = m.d(a.v, b.v), zero = Math.abs(d) < (m.pp ? 1 : .05);
    const better = zero ? null : m.lower ? d < 0 : d > 0;
    const word = zero ? 'About the same' : `${m.dfmt(d)} ${m.pp ? (d > 0 ? 'higher' : 'lower') : m.lower ? (d > 0 ? 'higher' : 'lower') : (d > 0 ? 'more' : 'fewer')}`.replace(/^(\S+ \S+) (more|fewer)$/, '$1 $2');
    return { a, b, d, better, word: m.sg ? (zero ? 'About the same' : `${m.dfmt(d)} ${d > 0 ? 'better' : 'worse'}`) : word };
  }
  function summary(rs) {
    if (!rs.length) return { n: 0 };
    const ds = rs.map((x) => x.date).sort(), cs = new Set(rs.map((x) => x.course)), ev = new Set(rs.filter((x) => x.event).map((x) => x.event));
    return { n: rs.length, full: rs.filter((x) => x.holes === 18).length, nine: rs.filter((x) => x.holes === 9).length, shot: rs.filter((x) => x.shot && x.holes === 18).length, from: ds[0], to: ds[ds.length - 1], courses: cs.size, events: ev.size, players: new Set(rs.map((x) => x.player)).size };
  }
  // event helpers
  function eventRows(eid) {
    const e = EVENTS.find((x) => x.id === eid), rs = ROUNDS.filter((x) => x.event === eid);
    const ids = [...e.lineup, ...(e.ind || [])];
    const rows = ids.map((id) => { const mine = rs.filter((x) => x.player === id).sort((a, b) => a.rnd - b.rnd); return { id, p: P[id], ind: (e.ind || []).includes(id), rounds: mine, total: mine.reduce((s, x) => s + x.score, 0), counted: mine.filter((x) => !x.nc && !x.ind).length }; });
    const team = e.rounds.map((_, i) => rs.filter((x) => x.rnd === i + 1 && !x.ind && !x.nc).reduce((s, x) => s + x.score, 0));
    const par = COURSES[e.course][2];
    return { e, rows, team, total: team.reduce((s, v) => s + v, 0), par: par * e.count[1] * e.rounds.length, rs };
  }
  function holeScores(round) { // deterministic hole-by-hole that sums to the round score
    const rr = rng(round.id.split('').reduce((h, c) => h * 31 + c.charCodeAt(0) >>> 0, 7));
    const holes = PARS.map((p) => p); let diff = round.score - 72;
    const out = PARS.map(() => 0);
    const order = PARS.map((_, i) => i).sort(() => rr() - .5);
    let k = 0; while (diff !== 0 && k < 200) { const i = order[k % 18]; if (diff > 0 && out[i] < 3) { out[i]++; diff--; } else if (diff < 0 && out[i] > -1) { out[i]--; diff++; } k++; }
    return holes.map((p, i) => ({ n: i + 1, par: p, score: p + out[i] }));
  }
  const fmtD = (iso, o = { month: 'short', day: 'numeric' }) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', o);
  const toPar = (v) => v === 0 ? 'E' : (v > 0 ? '+' : '−') + Math.abs(v);
  window.TOUR = { MATCHED, PLAYERS, P, EVENTS, ROUNDS, COURSES, PARS, M, GROUPS, SAMPLE_LABEL, SEASONS, select, stat, compare, summary, eventRows, holeScores, fmtD, toPar, MIN };
})();
