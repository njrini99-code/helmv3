/* global window, document, addEventListener, requestAnimationFrame, getComputedStyle, devicePixelRatio, innerWidth, innerHeight, scrollY, MutationObserver, ResizeObserver, NodeFilter -- injected into the page */
/*
 * Clubhouse audit probe, ported from the October audit kit (~/clubhouse-audit/harness). Injected with Playwright:
 *   await context.addInitScript({ path: 'scripts/clubhouse/audit/probe.js' });
 * Then call window.__chAudit.* through page.evaluate.
 *
 * Read-only: it observes the page and never changes app state.
 * Works in Chromium and WebKit. long-animation-frame and layout-shift entries are Chromium only.
 *
 * What it measures, and what it can't (the audit kit's 02-MOTION-LAB.md §3, in ~/clubhouse-audit):
 *   - census: every Animation object seen on ANY frame (rAF poll of getAnimations(), deduped by object), including
 *     view-transition pseudo-elements; every inline `style` write (Framer and other JS motion that writes style per
 *     frame); every element whose layout box changes on 3+ frames in a row (a layout animation, whatever drives it).
 *   - frames: raw rAF timestamps. Grade frames with motion.mjs frameStats() (jitter tolerance, active window,
 *     measured refresh rate). rAF is a main-thread signal: compositor motion can be smooth while rAF stalls, so a
 *     frame over 50 ms from rAF alone is "investigate", confirmed only by a trace (motion.mjs trace()) or device video.
 *   - track: one element's rect, opacity and transform scale per frame. Never run it in the pass whose frames you grade
 *     (getBoundingClientRect forces layout every frame).
 */
(() => {
  if (window.__chAudit) return;

  const LAYOUT_PROPS = new Set([
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'top', 'left', 'right', 'bottom', 'inset', 'margin', 'margin-top', 'margin-bottom',
    'margin-left', 'margin-right', 'padding', 'padding-top', 'padding-bottom', 'padding-left',
    'padding-right', 'grid-template-rows', 'grid-template-columns', 'font-size', 'line-height',
    'border-width', 'flex-basis', 'gap', 'row-gap', 'column-gap', 'letter-spacing',
  ]);
  // Paint-only: costs a repaint each frame but no layout. Flagged as a warning, not a fail.
  const PAINT_PROPS = new Set(['background-color', 'color', 'box-shadow', 'border-color', 'filter', 'backdrop-filter', 'clip-path', 'background-position']);
  const kebab = (p) => p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

  const describe = (el) => {
    if (!el || el.nodeType !== 1) return String(el);
    const id = el.id ? `#${el.id}` : '';
    const cls = (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '')
      .trim().split(/\s+/).filter(Boolean).slice(0, 3).map((c) => `.${c}`).join('');
    const label = el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${label ? ` "${label.replace(/\s+/g, ' ')}"` : ''}`;
  };

  // ---- Input log: which pointer type drove the page (a phone row driven by the mouse is INVALID, 02 §3).
  const inputs = [];
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel']) {
    addEventListener(type, (e) => {
      const p = e.touches ? (e.changedTouches && e.changedTouches[0]) : e;
      inputs.push({ t: e.timeStamp, at: performance.now(), type, pointerType: e.pointerType || (e.touches ? 'touch' : null), x: p ? p.clientX : null, y: p ? p.clientY : null, touches: e.touches ? e.touches.length : undefined });
      if (inputs.length > 2000) inputs.splice(0, 1000);
    }, true);
  }
  // Moves are logged only while a drag is being measured (startMoves/stopMoves), to keep the probe cheap.
  let moves = null;
  for (const type of ['pointermove', 'touchmove']) {
    addEventListener(type, (e) => {
      if (!moves) return;
      const list = e.touches ? [...e.touches] : [e];
      // t: the event's own timestamp (what the app's velocity maths reads); at: when the page got it (what it can draw).
      moves.push({ t: e.timeStamp, at: performance.now(), type, pointerType: e.pointerType || 'touch', pts: list.map((p) => [p.clientX, p.clientY, p.identifier ?? p.pointerId]) });
    }, true);
  }

  // ---- bfcache: a page restored from the back/forward cache (02 §3m).
  const pageshows = [];
  addEventListener('pageshow', (e) => pageshows.push({ t: performance.now(), persisted: e.persisted }));

  // ---- Motion events: every CSS transition and animation that starts, with its property and that property's own
  // duration and easing (a multi-property transition lists them in order; read the entry for this property).
  const listEntry = (list, props, prop) => {
    const items = String(list).split(/,(?![^(]*\))/).map((s) => s.trim());
    const names = String(props).split(',').map((s) => s.trim());
    let i = names.indexOf(prop);
    if (i < 0) i = names.indexOf('all');
    if (i < 0) i = 0;
    return items[i % items.length];
  };
  const motionLog = [];
  const onMotion = (kind) => (e) => {
    const cs = getComputedStyle(e.target, e.pseudoElement || null);
    const prop = e.propertyName || null;
    motionLog.push({
      t: performance.now(),
      kind,
      target: describe(e.target),
      pseudo: e.pseudoElement || null,
      property: prop,
      animationName: e.animationName || null,
      duration: kind === 'transition' ? listEntry(cs.transitionDuration, cs.transitionProperty, prop) : cs.animationDuration,
      easing: kind === 'transition' ? listEntry(cs.transitionTimingFunction, cs.transitionProperty, prop) : cs.animationTimingFunction,
      transitionAll: kind === 'transition' ? String(cs.transitionProperty).split(',').map((s) => s.trim()).includes('all') : false,
      layout: prop ? LAYOUT_PROPS.has(prop) : false,
      paint: prop ? PAINT_PROPS.has(prop) : false,
    });
  };
  addEventListener('transitionrun', onMotion('transition'), true);
  addEventListener('animationstart', onMotion('animation'), true);

  // ---- One Animation object as a plain row. Keeps the pseudo-element (view transitions live on
  // ::view-transition-old/new(name) of <html>; without it every page change reads as "html").
  const animRow = (a) => {
    const effect = a.effect;
    const timing = effect && effect.getComputedTiming ? effect.getComputedTiming() : {};
    let frames;
    try { frames = effect && effect.getKeyframes ? effect.getKeyframes() : []; } catch { frames = []; }
    let props = [...new Set(frames.flatMap((f) => Object.keys(f)))]
      .filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p))
      .map(kebab);
    if (!props.length && a.transitionProperty) props = [a.transitionProperty];
    const scaleFromZero = frames.some((k) => /scale\(0(\s*,\s*0)?\)|scale:\s*0(\s|$)/.test(String(k.transform ?? k.scale ?? '')));
    return {
      type: a.constructor.name,
      name: a.animationName || a.transitionProperty || a.id || null,
      target: describe(effect && effect.target),
      pseudo: (effect && effect.pseudoElement) || null,
      props,
      layoutProps: props.filter((p) => LAYOUT_PROPS.has(p)),
      paintProps: props.filter((p) => PAINT_PROPS.has(p)),
      scaleFromZero,
      duration: timing.duration,
      delay: timing.delay,
      iterations: timing.iterations,
      easing: (effect && effect.getTiming && effect.getTiming().easing) || timing.easing,
      playState: a.playState,
    };
  };
  const runningAnimations = () => document.getAnimations().map(animRow);

  // ---- Census: everything that moved during a window, whatever drove it.
  let census = null;
  const styleProps = (s) => {
    const out = new Map();
    String(s || '').split(';').forEach((d) => {
      const i = d.indexOf(':');
      if (i > 0) out.set(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim());
    });
    return out;
  };
  const startCensus = ({ resize = true } = {}) => {
    const seen = new WeakMap();
    const anims = [];
    const styleWrites = new Map(); // "target|prop" -> { target, prop, frames:Set, first, last, layout }
    const sizes = new WeakMap(); // el -> { frames: [frameNo...], last }
    const resized = new Set();
    const touched = [];
    let frame = 0;
    let running = true;
    const nowFrame = () => frame;
    const live = [];
    const poll = () => {
      const now = +performance.now().toFixed(1);
      for (const a of document.getAnimations()) {
        if (seen.has(a)) continue;
        seen.set(a, true);
        const row = animRow(a);
        row.firstSeen = now;
        row.firstFrame = frame;
        row.lastRunning = now;
        anims.push(row);
        live.push([a, row]);
      }
      for (const [a, row] of live) if (a.playState === 'running') row.lastRunning = now; // when it really ended, stalls included
    };
    const tick = () => {
      frame++;
      poll();
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const mo = new MutationObserver((list) => {
      const t = performance.now();
      for (const m of list) {
        if (m.type !== 'attributes' || m.attributeName !== 'style') continue;
        const before = styleProps(m.oldValue);
        const after = styleProps(m.target.getAttribute('style'));
        for (const p of new Set([...before.keys(), ...after.keys()])) {
          if (before.get(p) === after.get(p)) continue;
          const key = `${describe(m.target)}|${p}`;
          let r = styleWrites.get(key);
          if (!r) { r = { target: describe(m.target), prop: p, frames: new Set(), first: t, last: t, layout: LAYOUT_PROPS.has(p), paint: PAINT_PROPS.has(p), writes: 0 }; styleWrites.set(key, r); }
          r.frames.add(nowFrame()); r.last = t; r.writes++;
        }
      }
    });
    mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['style'], attributeOldValue: true });
    let ro = null; let mo2 = null;
    if (resize && typeof ResizeObserver === 'function') {
      ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const b = e.borderBoxSize && e.borderBoxSize[0];
          const w = b ? b.inlineSize : e.contentRect.width;
          const h = b ? b.blockSize : e.contentRect.height;
          let s = sizes.get(e.target);
          if (!s) { s = { frames: [], w, h, first: true }; sizes.set(e.target, s); touched.push(e.target); continue; } // first report is the initial size
          if (Math.abs(s.w - w) < 0.25 && Math.abs(s.h - h) < 0.25) continue;
          s.w = w; s.h = h;
          if (s.frames[s.frames.length - 1] !== frame) s.frames.push(frame);
          resized.add(e.target);
        }
      });
      const all = document.querySelectorAll('body, body *');
      for (let i = 0; i < all.length && i < 8000; i++) ro.observe(all[i], { box: 'border-box' });
      mo2 = new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) { ro.observe(n, { box: 'border-box' }); if (n.querySelectorAll) n.querySelectorAll('*').forEach((c) => ro.observe(c, { box: 'border-box' })); } });
      mo2.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
    census = {
      stop: () => {
        running = false; poll(); mo.disconnect(); if (ro) ro.disconnect(); if (mo2) mo2.disconnect();
        const runs = (fr) => { let best = fr.length ? 1 : 0; let cur = 1; for (let i = 1; i < fr.length; i++) { cur = fr[i] === fr[i - 1] + 1 ? cur + 1 : 1; best = Math.max(best, cur); } return best; };
        const layoutBoxes = [...resized].map((el) => ({ target: describe(el), frames: sizes.get(el).frames.length, longestRun: runs(sizes.get(el).frames) }))
          .filter((r) => r.longestRun >= 3);
        const writes = [...styleWrites.values()].map((r) => ({ ...r, frames: r.frames.size, first: +r.first.toFixed(1), last: +r.last.toFixed(1) }));
        return {
          frames: frame,
          animations: anims,
          styleWrites: writes,
          // A JS animation: the same inline property written on 3+ frames.
          jsAnimated: writes.filter((w) => w.frames >= 3),
          layoutBoxes, // border box changed on 3+ consecutive frames: a layout animation (or a resize the motion causes)
        };
      },
    };
  };
  const stopCensus = () => { if (!census) return null; const r = census.stop(); census = null; return r; };

  // ---- Frame sampler: raw rAF timestamps. Stats live in motion.mjs frameStats() so they can be computed over the
  // active motion window at the measured refresh rate. A summary over the whole window is kept for quick reads.
  let sampler = null;
  const startFrames = () => {
    const times = [];
    let running = true;
    const tick = (now) => { times.push(now); if (running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    sampler = { times, stop: () => { running = false; } };
  };
  const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
  const summarize = (times, refreshHz = 60, from = -Infinity, to = Infinity) => {
    const budget = 1000 / refreshHz;
    const d = [];
    for (let i = 1; i < times.length; i++) if (times[i] >= from && times[i - 1] <= to) d.push(times[i] - times[i - 1]);
    const sorted = [...d].sort((a, b) => a - b);
    const total = d.reduce((s, x) => s + x, 0);
    // R1 b1: only a frame later than 1.5 budgets counts (timer jitter is not a hitch), and it counts its lateness.
    const late = d.filter((x) => x > budget * 1.5);
    const hitchMs = late.reduce((s, x) => s + (x - budget), 0);
    const dropped = late.reduce((n, x) => n + Math.round(x / budget) - 1, 0);
    return {
      frames: d.length, refreshHz, windowMs: +total.toFixed(1),
      p50: +quantile(sorted, 0.5).toFixed(2), p95: +quantile(sorted, 0.95).toFixed(2), max: +(sorted[sorted.length - 1] || 0).toFixed(2),
      dropped, droppedPct: total ? +((dropped / (total / budget)) * 100).toFixed(2) : 0,
      over50ms: d.filter((x) => x > 50).length,
      over2xBudget: d.filter((x) => x > 2 * budget).length,
      hitchMs: +hitchMs.toFixed(1),
      hitchMsPerS: total ? +((hitchMs / total) * 1000).toFixed(2) : 0, // Apple's hitch-time ratio
      source: 'rAF (main thread): investigate signal; confirm with trace() or device video',
    };
  };
  const stopFrames = (refreshHz = 60) => {
    if (!sampler) return null;
    sampler.stop();
    const times = sampler.times.map((t) => +t.toFixed(2));
    sampler = null;
    return { times, ...summarize(times, refreshHz) };
  };
  // The display's real refresh: median idle rAF delta. Run on an idle page; record it with every motion JSON.
  const measureRefresh = (ms = 2000) => new Promise((resolve) => {
    const t = [];
    const tick = (now) => { t.push(now); if (now - t[0] < ms) requestAnimationFrame(tick); else {
      const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
      const med = d[Math.floor(d.length / 2)] || 16.67;
      resolve({ medianMs: +med.toFixed(3), hz: Math.round(1000 / med), samples: d.length });
    } };
    requestAnimationFrame(tick);
  });

  // ---- Geometry track: where an element is on every frame (origin, overshoot, continuity, springs).
  const parseScale = (tf) => {
    if (!tf || tf === 'none') return { sx: 1, sy: 1, tx: 0, ty: 0 };
    const m = /matrix(3d)?\(([^)]+)\)/.exec(tf);
    if (!m) return { sx: 1, sy: 1, tx: 0, ty: 0 };
    const v = m[2].split(',').map(Number);
    if (m[1]) return { sx: Math.hypot(v[0], v[1], v[2]), sy: Math.hypot(v[4], v[5], v[6]), tx: v[12], ty: v[13] };
    return { sx: Math.hypot(v[0], v[1]), sy: Math.hypot(v[2], v[3]), tx: v[4], ty: v[5] };
  };
  let tracker = null;
  const sampleEl = (selector) => {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    const t = +performance.now().toFixed(1);
    if (!el) return { t, absent: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const s = parseScale(cs.transform);
    return { t, x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2), opacity: +cs.opacity, transform: cs.transform, sx: +s.sx.toFixed(4), sy: +s.sy.toFixed(4) };
  };
  const startTrack = (selector) => {
    const rows = [];
    let running = true;
    const tick = () => { rows.push(sampleEl(selector)); if (running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    tracker = { rows, stop: () => { running = false; } };
  };
  const stopTrack = () => { if (!tracker) return []; tracker.stop(); const r = tracker.rows; tracker = null; return r; };

  // ---- Animation progress track: every running animation's computed progress per frame. This is how view-transition
  // pseudo-elements and copy layers are measured: their DOM rect never moves, their timing does (02 §3).
  let progTrack = null;
  const startProgress = ({ pseudoOnly = false, match = null } = {}) => {
    const ids = new WeakMap(); let next = 0;
    const meta = {}; const rows = [];
    let running = true;
    const tick = () => {
      const t = +performance.now().toFixed(1);
      for (const a of document.getAnimations()) {
        const e = a.effect; if (!e) continue;
        if (pseudoOnly && !e.pseudoElement) continue;
        const desc = describe(e.target);
        if (match && !(desc.includes(match) || String(e.pseudoElement || '').includes(match) || String(a.animationName || '').includes(match))) continue;
        if (!ids.has(a)) { ids.set(a, ++next); meta[next] = animRow(a); }
        const ct = e.getComputedTiming();
        rows.push({ t, id: ids.get(a), progress: ct.progress, localTime: ct.localTime, playState: a.playState });
      }
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    progTrack = { stop: () => { running = false; return { meta, rows }; } };
  };
  const stopProgress = () => { if (!progTrack) return null; const r = progTrack.stop(); progTrack = null; return r; };

  // ---- Filmstrip support: pause every animation (pseudo-elements included) and set them all to one time.
  const pauseAll = () => { const list = document.getAnimations(); list.forEach((a) => a.pause()); return list.length; };
  const seekAll = (ms) => { const list = document.getAnimations(); list.forEach((a) => { a.pause(); a.currentTime = ms; }); return list.length; };
  const finishAll = () => { document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } }); };

  // ---- Keyboard: what the on-screen keyboard leaves visible (02 §3f). Call after focusing a field.
  const kbd = () => {
    const vv = window.visualViewport;
    const el = document.activeElement;
    const r = el && el !== document.body ? el.getBoundingClientRect() : null;
    const form = el && el.closest ? el.closest('form, [role="dialog"], dialog, .ch-dock, [data-ch-composer]') : null;
    const submit = form ? form.querySelector('button[type="submit"], [data-ch-submit], button[aria-label*="Send" i], button[aria-label*="Done" i]') : null;
    const sr = submit ? submit.getBoundingClientRect() : null;
    const kh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0;
    const top = vv ? vv.offsetTop : 0; const bottom = vv ? vv.offsetTop + vv.height : innerHeight;
    const inside = (b) => !!b && b.top >= top - 1 && b.bottom <= bottom + 1;
    return {
      innerHeight, scrollY, vv: vv ? { height: +vv.height.toFixed(1), offsetTop: +vv.offsetTop.toFixed(1), scale: +vv.scale.toFixed(3) } : null,
      focused: el ? describe(el) : null, field: r ? { top: r.top, bottom: r.bottom } : null, submit: sr ? { top: sr.top, bottom: sr.bottom, el: describe(submit) } : null,
      keyboardHeightVar: kh, fieldVisible: inside(r), submitVisible: sr ? inside(sr) : null,
      fontSize: el ? parseFloat(getComputedStyle(el).fontSize) : null,
      inputmode: el && el.getAttribute ? el.getAttribute('inputmode') : null, autocomplete: el && el.getAttribute ? el.getAttribute('autocomplete') : null, enterkeyhint: el && el.getAttribute ? el.getAttribute('enterkeyhint') : null,
    };
  };

  // ---- Safe areas as the page resolves them: env(safe-area-inset-*) read through a probe element's padding.
  // Clubhouse uses env() only, so this is the number that matters (0 in WebKit T1: no insets there).
  const safeArea = () => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.documentElement.appendChild(d);
    const cs = getComputedStyle(d);
    const out = { top: parseFloat(cs.paddingTop), right: parseFloat(cs.paddingRight), bottom: parseFloat(cs.paddingBottom), left: parseFloat(cs.paddingLeft) };
    d.remove();
    return out;
  };

  // ---- Long animation frames (Chromium).
  const loaf = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        loaf.push({
          t: e.startTime, duration: e.duration, blockingDuration: e.blockingDuration,
          scripts: (e.scripts || []).slice(0, 3).map((s) => ({ src: s.sourceURL, fn: s.sourceFunctionName, d: s.duration, forcedLayout: s.forcedStyleAndLayoutDuration })),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch { /* WebKit: not supported */ }

  // ---- Layout shift (Chromium).
  let cls = 0;
  const shifts = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        cls += e.value;
        shifts.push({ t: e.startTime, value: e.value, sources: (e.sources || []).map((s) => describe(s.node)) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* WebKit */ }

  // ---- Interaction latency (Event Timing; Chromium, WebKit 26+ where available).
  const events = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.interactionId) continue;
        events.push({ name: e.name, duration: e.duration, target: describe(e.target), t: e.startTime, processingStart: e.processingStart, processingEnd: e.processingEnd });
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch { /* unsupported */ }

  // ---- Layout scan: overflow, clipping, tap targets, type census, page edge, banned rails.
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.01;
  };
  const INTERACTIVE = 'a[href],button,input,select,textarea,summary,[role="button"],[role="tab"],[role="switch"],[role="menuitem"],[role="option"],[role="checkbox"],[role="radio"],[tabindex]:not([tabindex="-1"])';
  const hitArea = (el) => {
    const r = el.getBoundingClientRect();
    let w = r.width; let h = r.height;
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === 'none' || ps.position !== 'absolute') continue;
      const neg = (v) => Math.max(0, -parseFloat(v) || 0);
      w = Math.max(w, r.width + neg(ps.left) + neg(ps.right));
      h = Math.max(h, r.height + neg(ps.top) + neg(ps.bottom));
    }
    return { w: Math.round(w), h: Math.round(h) };
  };
  const SCALE = [11, 12, 13, 14, 15, 16, 17, 20, 22, 28, 34];

  const scan = ({ minTarget = 44, phone = innerWidth <= 820 } = {}) => {
    const out = { viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }, horizontalScroll: document.documentElement.scrollWidth > innerWidth + 1, clipped: [], smallTargets: [], fontSizes: {}, offScale: [], tinyText: [], rails: [], edge: null, hoverOnlyRisk: [] };

    // Clipped text without an ellipsis.
    for (const el of document.querySelectorAll('body *')) {
      if (!isVisible(el) || !el.childNodes.length) continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) continue;
      const cs = getComputedStyle(el);
      if ((cs.overflow === 'hidden' || cs.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis') {
        out.clipped.push(describe(el));
      }
      const px = parseFloat(cs.fontSize);
      out.fontSizes[px] = (out.fontSizes[px] || 0) + 1;
      if (px < 40 && !SCALE.some((step) => Math.abs(px - step) < 0.26)) out.offScale.push(`${px}px ${describe(el)}`);
      if (phone && px < 12) out.tinyText.push(`${px}px ${describe(el)}`);

      // Accent rails: a coloured left edge of 2px or more on a block.
      const blw = parseFloat(cs.borderLeftWidth);
      if (blw >= 2 && cs.borderLeftStyle !== 'none' && parseFloat(cs.borderTopWidth) < blw) out.rails.push(`border-left ${blw}px ${describe(el)}`);
      if (/inset\s+[2-9]px\s+0(px)?\s+0/.test(cs.boxShadow)) out.rails.push(`inset shadow ${describe(el)}`);
    }
    // ::before rails on cards and rows.
    for (const el of document.querySelectorAll('body *')) {
      if (!isVisible(el)) continue;
      const ps = getComputedStyle(el, '::before');
      if (ps.content === 'none' || ps.position !== 'absolute') continue;
      const w = parseFloat(ps.width); const h = parseFloat(ps.height);
      const r = el.getBoundingClientRect();
      if (w >= 2 && w <= 8 && h >= r.height * 0.5 && (parseFloat(ps.left) || 0) <= 1) out.rails.push(`::before bar ${w}px ${describe(el)}`);
    }

    // Tap targets.
    for (const el of document.querySelectorAll(INTERACTIVE)) {
      if (!isVisible(el)) continue;
      const a = hitArea(el);
      if (a.w < minTarget || a.h < minTarget) out.smallTargets.push(`${a.w}x${a.h} ${describe(el)}`);
    }

    // Page edge: the leftmost start of visible content inside main.
    const main = document.querySelector('main') || document.body;
    let left = Infinity;
    for (const el of main.querySelectorAll('h1,h2,h3,p,li,label,button,a,img,section > *, article')) {
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left >= 0 && r.width < innerWidth - 2) left = Math.min(left, Math.round(r.left));
    }
    out.edge = Number.isFinite(left) ? left : null;

    // Hover styles that will stick after a tap on touch devices.
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      const walk = (list, inHoverQuery) => {
        for (const r of list) {
          if (r.media && r.cssRules) walk(r.cssRules, inHoverQuery || /hover:\s*hover/.test(r.media.mediaText));
          else if (r.selectorText && r.selectorText.includes(':hover') && !inHoverQuery) out.hoverOnlyRisk.push(r.selectorText.slice(0, 120));
          else if (r.cssRules) walk(r.cssRules, inHoverQuery);
        }
      };
      walk(rules, false);
    }
    out.hoverOnlyRisk = [...new Set(out.hoverOnlyRisk)].slice(0, 40);
    out.offScale = [...new Set(out.offScale)].slice(0, 60);
    return out;
  };

  // Any CSS colour (hex, rgb, oklch, color-mix, color(srgb …)) to sRGB 8-bit plus alpha, via canvas.
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const toRGBA = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, +(a / 255).toFixed(3)];
  };

  // ---- Text kind for the contrast floors (01 CT-01 to CT-04). A `data-ct="body|meta|large"` on the text or an ancestor
  // overrides the guess. Meta = captions, timestamps, counts: <time>, <small>, <figcaption>, or under 14 px.
  const textKind = (el, fs, fw) => {
    const forced = el.closest && el.closest('[data-ct]');
    if (forced) return forced.getAttribute('data-ct');
    if (fs >= 24 || (fs >= 18.66 && fw >= 700)) return 'large';
    if ((el.closest && el.closest('time, small, figcaption')) || fs < 14) return 'meta';
    return 'body';
  };

  // ---- Text boxes for the painted-contrast pass (see contrast.mjs).
  const textBoxes = () => {
    const boxes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const el = node.parentElement;
      if (!el || seen.has(el) || !isVisible(el)) continue;
      seen.add(el);
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(el);
      let opacity = 1;
      for (let p = el; p; p = p.parentElement) opacity *= +getComputedStyle(p).opacity;
      boxes.push({
        el: describe(el), text: node.textContent.trim().slice(0, 50),
        x: r.left, y: r.top, w: r.width, h: r.height,
        color: cs.color, rgba: toRGBA(cs.color), opacity, fontSize: parseFloat(cs.fontSize), fontWeight: +cs.fontWeight || 400,
        placeholder: false, kind: textKind(el, parseFloat(cs.fontSize), +cs.fontWeight || 400),
      });
    }
    // Placeholders count as text.
    for (const el of document.querySelectorAll('input[placeholder],textarea[placeholder]')) {
      if (!isVisible(el) || el.value) continue;
      const r = el.getBoundingClientRect();
      const ps = getComputedStyle(el, '::placeholder');
      boxes.push({
        el: describe(el), text: el.placeholder.slice(0, 50), x: r.left + parseFloat(getComputedStyle(el).paddingLeft), y: r.top + 4,
        w: Math.min(r.width - 8, el.placeholder.length * parseFloat(ps.fontSize) * 0.5), h: r.height - 8,
        color: ps.color, rgba: toRGBA(ps.color), opacity: 1, fontSize: parseFloat(ps.fontSize), fontWeight: +ps.fontWeight || 400, placeholder: true, kind: 'placeholder',
      });
    }
    return boxes;
  };


  // ---- Non-text parts for CT-05 (WCAG 1.4.11): control boundaries, icons, toggle tracks, selected-tab indicators.
  // Each row says what colour the part paints and where; contrast.mjs reads the real background around it.
  const nonTextBoxes = () => {
    const out = [];
    const push = (el, kind, color, box, extra = {}) => {
      if (!color || box.width < 1 || box.height < 1 || box.bottom < 0 || box.top > innerHeight) return;
      let opacity = 1;
      for (let p = el; p; p = p.parentElement) opacity *= +getComputedStyle(p).opacity;
      const rgba = toRGBA(color);
      if (rgba[3] * opacity < 0.02) return;
      out.push({ el: describe(el), kind, color, rgba, opacity, x: box.left, y: box.top, w: box.width, h: box.height, ...extra });
    };
    // Input, select and textarea boundaries: the border against what is outside it.
    for (const el of document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea')) {
      if (!isVisible(el)) continue;
      const cs = getComputedStyle(el);
      const bw = Math.max(parseFloat(cs.borderTopWidth), parseFloat(cs.borderBottomWidth), parseFloat(cs.borderLeftWidth));
      const r = el.getBoundingClientRect();
      push(el, 'input-border', bw >= 1 && cs.borderTopStyle !== 'none' ? cs.borderBottomColor : null, r, { borderPx: bw, fill: cs.backgroundColor, fillRgba: toRGBA(cs.backgroundColor) });
    }
    // Switch tracks and checkboxes: the track or box fill against the surface.
    for (const el of document.querySelectorAll('[role="switch"], input[type="checkbox"], input[type="radio"]')) {
      if (!isVisible(el)) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const bw = parseFloat(cs.borderTopWidth);
      push(el, 'toggle', toRGBA(cs.backgroundColor)[3] > 0.05 ? cs.backgroundColor : (bw >= 1 ? cs.borderTopColor : null), r);
    }
    // Icons: an svg that is a control's only content, or role="img". Painted colour = stroke or fill.
    for (const svg of document.querySelectorAll('svg')) {
      if (!isVisible(svg)) continue;
      const host = svg.closest('button, a, [role="button"], [role="tab"], [role="img"]') || (svg.getAttribute('role') === 'img' ? svg : null);
      if (!host) continue;
      const cs = getComputedStyle(svg);
      const shape = svg.querySelector('path, circle, rect, line, polyline, polygon');
      const ss = shape ? getComputedStyle(shape) : cs;
      const color = ss.stroke && ss.stroke !== 'none' ? ss.stroke : (ss.fill && ss.fill !== 'none' ? ss.fill : cs.color);
      push(svg, 'icon', /url\(/.test(color) ? null : color, svg.getBoundingClientRect());
    }
    // Selected-tab indicators: the tab's bar or underline (any small absolute child of a selected tab).
    for (const tab of document.querySelectorAll('[role="tab"][aria-selected="true"]')) {
      if (!isVisible(tab)) continue;
      for (const bar of tab.querySelectorAll('*')) {
        const r = bar.getBoundingClientRect();
        if (r.height > 0 && r.height <= 4 && r.width >= 8) push(bar, 'tab-indicator', getComputedStyle(bar).backgroundColor, r, { aaNeeds: 4.5 });
      }
    }
    return out;
  };
  // Focus ring of one element: focus it the way a keyboard does, read its outline (or ring shadow), then blur.
  const focusRing = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    el.focus({ focusVisible: true });
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const ow = parseFloat(cs.outlineWidth) || 0;
    const shadow = /(rgba?\([^)]+\)|#[0-9a-f]{3,8}|oklch\([^)]+\))\s*(0(px)?\s+){2,3}(\d+(\.\d+)?)px/i.exec(cs.boxShadow || '');
    const color = ow > 0 && cs.outlineStyle !== 'none' ? cs.outlineColor : (shadow ? shadow[1] : null);
    const width = ow > 0 && cs.outlineStyle !== 'none' ? ow : (shadow ? parseFloat(shadow[4]) : 0);
    const offset = ow > 0 ? parseFloat(cs.outlineOffset) || 0 : 0;
    return { el: describe(el), kind: 'focus-ring', color, rgba: color ? toRGBA(color) : null, width, offset, x: r.left, y: r.top, w: r.width, h: r.height, aaNeeds: 4.5, focusVisible: el.matches(':focus-visible') };
  };

  window.__chAudit = {
    describe, runningAnimations, startFrames, stopFrames, summarize, measureRefresh, scan, textBoxes, nonTextBoxes, focusRing, toRGBA,
    startTrack, stopTrack, sampleEl, startCensus, stopCensus, startProgress, stopProgress, pauseAll, seekAll, finishAll, kbd, safeArea,
    startMoves: () => { moves = []; }, stopMoves: () => { const m = moves || []; moves = null; return m; },
    inputLog: () => inputs.splice(0),
    pageshows: () => pageshows.slice(),
    motionLog: () => motionLog.splice(0),
    loaf: () => loaf.splice(0),
    layoutShift: () => ({ cls: +cls.toFixed(4), shifts: shifts.slice(-20) }),
    interactions: () => events.splice(0),
  };
})();
