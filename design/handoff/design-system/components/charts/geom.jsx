/* Yardage-book chart geometry: returns SVG/HTML strings. Internal to components/charts. */

  const f = (v, d = 1) => Number(v).toFixed(d);
  const sg = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) * (v - m)))); };
  const n1 = (v) => v.toFixed(1);
  function curve(p) {
    const n = p.length;
    if (n < 3) return 'M' + p.map((q) => n1(q[0]) + ' ' + n1(q[1])).join(' L');
    const d = [], m = [];
    for (let i = 0; i < n - 1; i++) d[i] = (p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (!d[i]) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    let s = 'M' + n1(p[0][0]) + ' ' + n1(p[0][1]);
    for (let i = 0; i < n - 1; i++) {
      const h = (p[i + 1][0] - p[i][0]) / 3;
      s += ' C' + n1(p[i][0] + h) + ' ' + n1(p[i][1] + m[i] * h) + ' ' + n1(p[i + 1][0] - h) + ' ' + n1(p[i + 1][1] - m[i + 1] * h) + ' ' + n1(p[i + 1][0]) + ' ' + n1(p[i + 1][1]);
    }
    return s;
  }
  const glow = (id, dev) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${dev}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

  /* Scoring trend. Lower is better → invert puts improvement up. */
  function trend(data, o = {}) {
    const W = o.w || 640, H = o.h || 250, P = Object.assign({ t: 34, r: 40, b: 30, l: 34 }, o.pad || {});
    const vals = data.map((d) => d.v), lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
    const x = (i) => P.l + (i * (W - P.l - P.r)) / (data.length - 1);
    const y = (v) => { const r = (v - lo) / (hi - lo); return P.t + (o.invert === false ? 1 - r : r) * (H - P.t - P.b); };
    const pts = vals.map((v, i) => [x(i), y(v)]), line = curve(pts), lp = pts[pts.length - 1], mv = mean(vals), id = o.id || 't';
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="k-trend" role="img" aria-label="${o.label || 'Scoring trend'}"><defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.fill || o.stroke}" stop-opacity="${o.fillOpacity ?? 0.14}"/><stop offset="1" stop-color="${o.fill || o.stroke}" stop-opacity="0"/></linearGradient>${glow(id + 'f', 3)}</defs>`;
    for (let v = lo; v <= hi; v++) if ((v - lo) % 2 === 0) s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="${o.grid}" stroke-width="1"/><text x="${P.l - 8}" y="${y(v)}" dy=".34em" text-anchor="end" class="k-ax">${v}</text>`;
    (o.xLabels === false ? [] : [0, Math.floor((data.length - 1) / 2), data.length - 1]).forEach((i) => { s += `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}" class="k-ax">${data[i].l}</text>`; });
    if (o.area !== false) s += `<path d="${line} L${n1(lp[0])} ${H - P.b} L${n1(pts[0][0])} ${H - P.b} Z" fill="url(#${id}g)"/>`;
    if (o.mean !== false) s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(mv)}" y2="${y(mv)}" stroke="${o.meanColor || o.grid}" stroke-width="1.25" stroke-dasharray="2 4"/><text x="${P.l + 6}" y="${y(mv) + 15}" class="k-ax">avg ${f(mv)}</text>`;
    (o.events || []).forEach((e) => { const p = pts[e.i]; s += `<line x1="${p[0]}" x2="${p[0]}" y1="${p[1] - 9}" y2="${P.t - 8}" stroke="${o.annLine || o.stroke}" stroke-width="1" opacity=".55"/><text x="${p[0]}" y="${P.t - 14}" text-anchor="middle" class="k-ann">${e.text}</text>`; });
    s += `<path d="${line}" fill="none" stroke="${o.stroke}" stroke-width="${o.sw || 2}" stroke-linecap="round" stroke-linejoin="round"${o.glow ? ` filter="url(#${id}f)"` : ''}/>`;
    if (o.dots !== false) pts.slice(0, -1).forEach((p) => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="${o.dotR || 2.75}" fill="${o.dotFill || '#FDFCF8'}" stroke="${o.stroke}" stroke-width="1.5"/>`; });
    s += `<circle cx="${lp[0]}" cy="${lp[1]}" r="10" fill="${o.stroke}" opacity=".16"/><circle cx="${lp[0]}" cy="${lp[1]}" r="4.5" fill="${o.stroke}" stroke="${o.ring || '#FDFCF8'}" stroke-width="2"/>`;
    if (o.endLabel !== false) s += `<text x="${lp[0] + 13}" y="${lp[1]}" dy=".34em" class="k-end">${vals[vals.length - 1]}</text>`;
    return s + '</svg>';
  }

  /* Strokes gained — diverging rows (HTML). */
  function tornado(rows, o = {}) {
    const m = o.max || Math.max(1, Math.ceil(Math.max(...rows.map((r) => Math.abs(r.v))) * 2) / 2);
    const total = rows.reduce((s, r) => s + r.v, 0);
    return `<div class="k-sg">${rows.map((r) => { const p = Math.min(50, (Math.abs(r.v) / m) * 50), pos = r.v >= 0; return `<div class="k-sg__row${r.focus ? ' is-focus' : ''}"><span class="k-sg__k">${r.k}</span><span class="k-sg__track"><i class="k-sg__bar ${pos ? 'is-pos' : 'is-neg'}" style="${pos ? 'left' : 'right'}:50%;width:${p}%"></i></span><span class="k-sg__v ${pos ? 'is-pos' : 'is-neg'}">${sg(r.v)}</span></div>`; }).join('')}${o.total !== false ? `<div class="k-sg__row k-sg__row--total"><span class="k-sg__k">Total</span><span class="k-sg__track k-sg__track--none"></span><span class="k-sg__v ${total >= 0 ? 'is-pos' : 'is-neg'}">${sg(total)}</span></div>` : ''}</div>`;
  }

  /* Strokes gained as a route from tee to hole (SVG). */
  function route(rows, o = {}) {
    const W = o.w || 340, H = o.h || 220, mid = H / 2, P = 38, step = (W - P * 2) / (rows.length - 1), m = o.max || 1, hh = mid - 46;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="k-route"><line x1="${P - 24}" x2="${W - P + 24}" y1="${mid}" y2="${mid}" stroke="${o.line}" stroke-width="2" stroke-dasharray="0.5 7" stroke-linecap="round"/>`;
    rows.forEach((r, i) => {
      const x = P + i * step, h = (Math.abs(r.v) / m) * hh, pos = r.v >= 0;
      s += `<rect x="${x - 10}" y="${pos ? mid - h : mid}" width="20" height="${h}" rx="4" fill="${pos ? o.pos : o.neg}"/>`;
      s += `<circle cx="${x}" cy="${mid}" r="6.5" fill="${o.node}" stroke="${o.line}" stroke-width="2"/>`;
      s += `<text x="${x}" y="${pos ? mid - h - 9 : mid + h + 19}" text-anchor="middle" class="k-route__v ${pos ? 'is-pos' : 'is-neg'}">${sg(r.v)}</text>`;
      s += `<text x="${x}" y="${pos ? mid + 24 : mid - 16}" text-anchor="middle" class="k-route__k">${r.k}</text>`;
    });
    return s + '</svg>';
  }

  /* Driving dispersion. Returns { svg, hits, left, right, carry, width }. */
  function spray(shots, o = {}) {
    const W = o.w || 340, H = o.h || 280, lat = o.lat || 40, d0 = o.d0 || 250, d1 = o.d1 || 310, fw = o.fw || 30;
    const X = (x) => W / 2 + (x / lat) * (W / 2), Y = (y) => H - ((y - d0) / (d1 - d0)) * H, inF = (p) => Math.abs(p.x) <= fw / 2;
    const xs = shots.map((p) => p.x), ys = shots.map((p) => p.y), mx = mean(xs), my = mean(ys), sx = sd(xs), sy = sd(ys);
    const hits = shots.filter(inF).length, left = shots.filter((p) => p.x < -fw / 2).length, right = shots.filter((p) => p.x > fw / 2).length, id = o.id || 's';
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="k-spray" role="img" aria-label="${hits} of ${shots.length} drives in the fairway"><defs>${glow(id + 'f', 2.5)}</defs><rect width="${W}" height="${H}" fill="${o.rough}"/>`;
    if (o.stripes) for (let y = d0, k = 0; y < d1; y += 6, k++) s += `<rect x="${X(-fw / 2)}" y="${Y(y + 6)}" width="${X(fw / 2) - X(-fw / 2)}" height="${Y(y) - Y(y + 6) + 0.5}" fill="${k % 2 ? o.fw1 : o.fw2}"/>`;
    else s += `<rect x="${X(-fw / 2)}" y="0" width="${X(fw / 2) - X(-fw / 2)}" height="${H}" fill="${o.fw1}"/>`;
    if (o.edge) s += `<line x1="${X(-fw / 2)}" x2="${X(-fw / 2)}" y1="0" y2="${H}" stroke="${o.edge}"/><line x1="${X(fw / 2)}" x2="${X(fw / 2)}" y1="0" y2="${H}" stroke="${o.edge}"/>`;
    for (let y = Math.ceil(d0 / 20) * 20; y < d1; y += 20) s += `<line x1="0" x2="${W}" y1="${Y(y)}" y2="${Y(y)}" stroke="${o.grid}" stroke-dasharray="2 5"/><text x="${W - 8}" y="${Y(y) - 6}" text-anchor="end" class="k-ax">${y}</text>`;
    s += `<line x1="${X(0)}" x2="${X(0)}" y1="0" y2="${H}" stroke="${o.target}" stroke-dasharray="4 5"/>`;
    s += `<ellipse cx="${X(mx)}" cy="${Y(my)}" rx="${(sx / lat) * (W / 2)}" ry="${(sy / (d1 - d0)) * H}" fill="${o.ellFill}" stroke="${o.ell}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    shots.forEach((p) => { s += inF(p) ? `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="5" fill="${o.hit}" stroke="${o.hitRing}" stroke-width="1.5"${o.glow ? ` filter="url(#${id}f)"` : ''}/>` : `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="4.5" fill="${o.missFill}" stroke="${o.miss}" stroke-width="1.5"/>`; });
    s += `<g stroke="${o.cross}" stroke-width="1.75" stroke-linecap="round"><line x1="${X(mx) - 7}" x2="${X(mx) + 7}" y1="${Y(my)}" y2="${Y(my)}"/><line x1="${X(mx)}" x2="${X(mx)}" y1="${Y(my) - 7}" y2="${Y(my) + 7}"/></g>`;
    if (o.labels) s += `<text x="10" y="20" class="k-lab">Left ${left}</text><text x="${W / 2}" y="20" text-anchor="middle" class="k-lab k-lab--hit">${hits} of ${shots.length} fairway</text><text x="${W - 10}" y="20" text-anchor="end" class="k-lab">Right ${right}</text>`;
    return { svg: s + '</svg>', hits, left, right, carry: Math.round(my), width: Math.round(sx * 2) };
  }

  /* Putting make % by distance — line vs benchmark. */
  function makeLine(rows, o = {}) {
    const W = o.w || 340, H = o.h || 240, P = { t: 24, r: 16, b: 34, l: 32 };
    const x = (i) => P.l + (i * (W - P.l - P.r)) / (rows.length - 1), y = (v) => P.t + (1 - v / 100) * (H - P.t - P.b);
    const pct = rows.map((r) => Math.round((r.made / r.att) * 100)), you = pct.map((v, i) => [x(i), y(v)]), bench = rows.map((r, i) => [x(i), y(r.bench)]);
    let gi = 0; rows.forEach((r, i) => { if (r.bench - pct[i] > rows[gi].bench - pct[gi]) gi = i; });
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="k-make">`;
    [0, 50, 100].forEach((v) => { s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="${o.grid}"/><text x="${P.l - 8}" y="${y(v)}" dy=".34em" text-anchor="end" class="k-ax">${v}</text>`; });
    s += `<path d="${curve(bench)}" fill="none" stroke="${o.bench}" stroke-width="1.5" stroke-dasharray="4 4"/>`;
    s += `<path d="${curve(you)}" fill="none" stroke="${o.stroke}" stroke-width="2.25" stroke-linecap="round"/>`;
    you.forEach((p, i) => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${i === gi ? o.flag : o.stroke}" stroke="${o.ring || '#FDFCF8'}" stroke-width="2"/><text x="${p[0]}" y="${p[1] - 11}" text-anchor="${i === 0 ? 'start' : 'middle'}" class="k-pt">${pct[i]}%</text><text x="${x(i)}" y="${H - 10}" text-anchor="${i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}" class="k-ax">${rows[i].b}</text>`; });
    s += `<text x="${you[gi][0] - 10}" y="${you[gi][1] + 20}" text-anchor="end" class="k-ann">${pct[gi] - rows[gi].bench} vs team</text>`;
    return s + '</svg>';
  }

  /* Putting make % — recessed columns with benchmark ticks (HTML). */
  function makeColumns(rows) {
    return `<div class="k-cols">${rows.map((r) => { const p = Math.round((r.made / r.att) * 100); return `<div class="k-col"><span class="k-col__pct">${p}%</span><span class="k-col__track"><i class="k-col__fill${p < r.bench ? ' is-below' : ''}" style="height:${p}%"></i><i class="k-col__bench" style="bottom:${r.bench}%"></i></span><span class="k-col__b">${r.b}</span><span class="k-col__n">${r.made}/${r.att}</span></div>`; }).join('')}</div>`;
  }

  /* Putting make % on a green — rings by distance, shaded by make rate. */
  function green(rows, o = {}) {
    const W = o.w || 340, H = o.h || 270, cx = 124, cy = H / 2, R = [18, 38, 62, 92, 120];
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="k-green">`;
    for (let i = rows.length - 1; i >= 0; i--) { const p = rows[i].made / rows[i].att; s += `<circle cx="${cx}" cy="${cy}" r="${R[i]}" fill="${o.base}" /><circle cx="${cx}" cy="${cy}" r="${R[i]}" fill="${o.fill}" fill-opacity="${(0.1 + p * 0.85).toFixed(2)}" stroke="${o.sep}" stroke-width="1.25"/>`; }
    s += `<circle cx="${cx}" cy="${cy}" r="4" fill="${o.hole}"/><line x1="${cx}" x2="${cx}" y1="${cy}" y2="${cy - 30}" stroke="${o.hole}" stroke-width="1.5"/><path d="M${cx} ${cy - 30} l14 5 -14 5z" fill="${o.flag}"/>`;
    rows.forEach((r, i) => {
      const rm = i ? (R[i] + R[i - 1]) / 2 : R[0] / 2 + 3, a = -0.6, px = cx + rm * Math.cos(a), py = cy + rm * Math.sin(a) - (4 - i) * 4, p = Math.round((r.made / r.att) * 100), ly = 26 + i * 24;
      s += `<circle cx="${px}" cy="${py}" r="2.5" fill="${o.hole}"/><polyline points="${px},${py} ${W - 96},${ly} ${W - 90},${ly}" fill="none" stroke="${o.leader}" stroke-width="1"/><text x="${W - 86}" y="${ly}" dy=".34em" class="k-gl"><tspan class="k-gl__b">${r.b}</tspan> <tspan class="k-gl__p${p < r.bench ? ' is-below' : ''}">${p}%</tspan></text>`;
    });
    return s + '</svg>';
  }

  /* Prediction arc dial (instrument). Lower scores on the left. */
  function dial(p, o = {}) {
    const W = o.w || 300, H = o.h || 236, cx = W / 2, cy = 142, r = 108, a0 = -120, a1 = 120, lo = 66, hi = 80;
    const A = (v) => a0 + ((v - lo) / (hi - lo)) * (a1 - a0), P = (a, rr) => [cx + rr * Math.sin((a * Math.PI) / 180), cy - rr * Math.cos((a * Math.PI) / 180)];
    const arc = (x0, x1, rr) => { const s0 = P(x0, rr), s1 = P(x1, rr); return `M${n1(s0[0])} ${n1(s0[1])} A${rr} ${rr} 0 ${x1 - x0 > 180 ? 1 : 0} 1 ${n1(s1[0])} ${n1(s1[1])}`; };
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="k-dial"><defs><linearGradient id="dg" x1="0" x2="1"><stop offset="0" stop-color="${o.rangeA}"/><stop offset="1" stop-color="${o.rangeB}"/></linearGradient>${glow('dgl', 4)}</defs>`;
    s += `<path d="${arc(a0, a1, r)}" fill="none" stroke="${o.track}" stroke-width="16" stroke-linecap="round"/>`;
    for (let v = lo; v <= hi; v++) { const t0 = P(A(v), r + 14), t1 = P(A(v), r + (v % 2 ? 18 : 22)); s += `<line x1="${n1(t0[0])}" y1="${n1(t0[1])}" x2="${n1(t1[0])}" y2="${n1(t1[1])}" stroke="${o.tick}" stroke-width="${v % 2 ? 1 : 1.5}"/>`; if (v % 2 === 0) { const t = P(A(v), r + 33); s += `<text x="${n1(t[0])}" y="${n1(t[1])}" dy=".34em" text-anchor="middle" class="k-ax">${v}</text>`; } }
    s += `<path d="${arc(A(p.lo), A(p.hi), r)}" fill="none" stroke="url(#dg)" stroke-width="16" stroke-linecap="round" filter="url(#dgl)"/>`;
    s += `<path d="${arc(a0, a1, r - 26)}" fill="none" stroke="${o.track}" stroke-width="3" stroke-linecap="round"/><path d="${arc(a0, a0 + ((a1 - a0) * p.confidence) / 100, r - 26)}" fill="none" stroke="${o.conf}" stroke-width="3" stroke-linecap="round"/>`;
    const g0 = P(A(p.avg), r - 11), g1 = P(A(p.avg), r + 11), k = P(A(p.score), r);
    s += `<line x1="${n1(g0[0])}" y1="${n1(g0[1])}" x2="${n1(g1[0])}" y2="${n1(g1[1])}" stroke="${o.avg}" stroke-width="2.5" stroke-linecap="round"/>`;
    s += `<circle cx="${n1(k[0])}" cy="${n1(k[1])}" r="10" fill="${o.knob}" stroke="${o.knobRing}" stroke-width="3"/>`;
    s += `<text x="${cx}" y="${cy + 12}" text-anchor="middle" class="k-dial__v">${p.score}</text><text x="${cx}" y="${cy + 40}" text-anchor="middle" class="k-dial__l">${p.confidence}% confidence</text>`;
    return s + '</svg>';
  }

  /* Prediction as a ruled range scale (editorial). */
  function rangeScale(p, o = {}) {
    const W = o.w || 420, H = o.h || 96, L = 14, Rr = W - 14, lo = 66, hi = 80, X = (v) => L + ((v - lo) / (hi - lo)) * (Rr - L), b = 46;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="k-range"><rect x="${X(p.lo)}" y="${b - 22}" width="${X(p.hi) - X(p.lo)}" height="22" fill="${o.band}"/>`;
    s += `<text x="${X(p.lo) + 6}" y="${b - 30}" class="k-ann">Likely range ${p.lo}–${p.hi}</text><line x1="${L}" x2="${Rr}" y1="${b}" y2="${b}" stroke="${o.ink}" stroke-width="1.25"/>`;
    for (let v = lo; v <= hi; v++) { s += `<line x1="${X(v)}" x2="${X(v)}" y1="${b}" y2="${b + (v % 2 ? 5 : 9)}" stroke="${o.ink}"/>`; if (v % 2 === 0) s += `<text x="${X(v)}" y="${b + 24}" text-anchor="middle" class="k-ax">${v}</text>`; }
    s += `<path d="M${X(p.avg)} ${b + 30} l-5 8 h10z" fill="${o.ink}"/>`;
    s += `<line x1="${X(p.score)}" x2="${X(p.score)}" y1="${b - 26}" y2="${b + 2}" stroke="${o.accent}" stroke-width="3" stroke-linecap="round"/><circle cx="${X(p.score)}" cy="${b}" r="5" fill="${o.accent}" stroke="${o.ring || '#FDFCF8'}" stroke-width="2"/>`;
    return s + '</svg>';
  }

  /* Prediction as a landing zone on a hole (course-native). */
  function landing(p, o = {}) {
    const W = o.w || 440, H = o.h || 130, L = 16, Rr = W - 16, lo = 66, hi = 80, X = (v) => L + ((v - lo) / (hi - lo)) * (Rr - L), top = 18, bot = H - 34, cyy = (top + bot) / 2;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="k-land"><rect x="${L}" y="${top}" width="${Rr - L}" height="${bot - top}" rx="${(bot - top) / 2}" fill="${o.rough}"/>`;
    for (let v = p.lo, k = 0; v < p.hi; v += 0.5, k++) s += `<rect x="${X(v)}" y="${top + 8}" width="${X(v + 0.5) - X(v) + 0.3}" height="${bot - top - 16}" fill="${k % 2 ? o.fw1 : o.fw2}"/>`;
    s += `<ellipse cx="${X(p.score)}" cy="${cyy}" rx="${((X(p.hi) - X(p.lo)) / 2) * (1 - p.confidence / 100) + 22}" ry="${(bot - top) / 2 - 12}" fill="none" stroke="${o.ink}" stroke-width="1.25" stroke-dasharray="2 4"/>`;
    s += `<line x1="${X(p.score)}" x2="${X(p.score)}" y1="${cyy}" y2="${top - 6}" stroke="${o.ink}" stroke-width="1.5"/><path d="M${X(p.score)} ${top - 6} l16 6 -16 6z" fill="${o.flag}"/><circle cx="${X(p.score)}" cy="${cyy}" r="3.5" fill="${o.ink}"/>`;
    for (let v = lo; v <= hi; v += 2) s += `<text x="${X(v)}" y="${H - 12}" text-anchor="middle" class="k-ax">${v}</text>`;
    s += `<line x1="${X(p.avg)}" x2="${X(p.avg)}" y1="${bot + 4}" y2="${bot + 10}" stroke="${o.ink}" stroke-width="2"/>`;
    return s + '</svg>';
  }

  /* PGA vs team vs you — one rail per metric (HTML). Right is always better. */
  function standing(ms) {
    return ms.map((m) => {
      const vs = [m.you, m.team, m.pga], lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * 0.45 || 1, a = lo - pad, b = hi + pad;
      const pos = (v) => (m.better === 'down' ? ((b - v) / (b - a)) * 100 : ((v - a) / (b - a)) * 100).toFixed(1);
      const good = m.better === 'down' ? m.you <= m.team : m.you >= m.team;
      return `<div class="k-st"><div class="k-st__top"><span class="k-st__k">${m.k}</span><span class="k-st__you ${good ? 'is-good' : 'is-bad'}">${m.you}${m.unit}</span></div><div class="k-st__rail"><i class="k-st__m k-st__m--pga" style="left:${pos(m.pga)}%"><b>Tour ${m.pga}${m.unit}</b></i><i class="k-st__m k-st__m--team" style="left:${pos(m.team)}%"><b>Team ${m.team}${m.unit}</b></i><i class="k-st__m k-st__m--you" style="left:${pos(m.you)}%"></i></div></div>`;
    }).join('');
  }

  /* 8-cell quintile bar (doctrine). */
  const quint = (n, of = 8) => `<span class="k-q">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

  /* Hand-operated scoreboard strip — each round relative to par. */
  function scoreboard(data, par = 72) {
    return `<div class="k-board">${data.map((d) => { const t = d.v - par; return `<div class="k-board__c"><span class="k-board__d">${d.l}</span><span class="k-board__n ${t < 0 ? 'is-under' : t > 0 ? 'is-over' : 'is-even'}">${t === 0 ? 'E' : t > 0 ? '+' + t : '−' + Math.abs(t)}</span></div>`; }).join('')}</div>`;
  }

export { sg, f, trend, route, spray, green, landing, scoreboard };
