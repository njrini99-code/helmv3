/* GolfHelm prototype runtime
   - Screen state: live | loading | empty. Set with ?state= in the URL or the Prototype chip (desktop). GHLayer renders it.
   - Load reveal: content blocks rise in once, 520ms, 55ms stagger, max 10 per column.
   - Press feedback: every tappable shrinks by ~6px on press (110ms) and springs back on release (280ms).
   - Haptics: GH.haptic(kind) calls navigator.vibrate where supported. Native builds map the same kinds to
     UISelectionFeedbackGenerator / UIImpactFeedbackGenerator / UINotificationFeedbackGenerator.
   All motion is skipped under prefers-reduced-motion. */
(function () {
  const GH = (window.GH = window.GH || {});
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const EASE = 'cubic-bezier(.22,1,.36,1)', SPRING = 'cubic-bezier(.34,1.3,.64,1)';
  const canAnim = typeof Element !== 'undefined' && !!Element.prototype.animate;
  const q = new URLSearchParams(location.search).get('state');
  GH.state = q === 'loading' || q === 'empty' ? q : 'live';
  const subs = new Set();
  GH.onState = (f) => { subs.add(f); return () => subs.delete(f); };
  GH.setState = (s) => {
    GH.state = s;
    try { const u = new URL(location.href); if (s === 'live') u.searchParams.delete('state'); else u.searchParams.set('state', s); history.replaceState(history.state, '', u); } catch (e) {}
    subs.forEach((f) => f(s)); paint();
  };
  GH.replay = () => { GH.setState('loading'); setTimeout(() => GH.setState('live'), 1200); };
  GH.reveal = (anchor) => {
    if (RM.matches || !canAnim || !anchor) return;
    let el = anchor.nextElementSibling, i = 0;
    while (el) {
      let blk = el;
      while (blk.children.length === 1 && blk.firstElementChild.children.length) blk = blk.firstElementChild;
      const kids = blk.children.length ? Array.from(blk.children).slice(0, 10) : [blk];
      kids.forEach((k) => k.animate([{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], { duration: 520, delay: 40 + 55 * i++, easing: EASE, fill: 'backwards' }));
      el = el.nextElementSibling;
    }
  };

  const TAP = 'button,[role="button"],[role="tab"],[role="radio"],[role="switch"],[role="checkbox"],a[href],summary';
  let held = null;
  addEventListener('pointerdown', (e) => {
    if (RM.matches || !canAnim || e.button) return;
    const el = e.target.closest && e.target.closest(TAP);
    if (!el || el.disabled || el.closest('[data-gh-nopress]')) return;
    const w = el.getBoundingClientRect().width || 80, s = Math.max(0.96, 1 - 6 / w);
    held = { el, s, a: el.animate([{ scale: 1 }, { scale: s }], { duration: 110, easing: EASE, fill: 'forwards' }) };
  }, true);
  const release = () => { if (!held) return; const { el, s, a } = held; held = null; el.animate([{ scale: s }, { scale: 1 }], { duration: 280, easing: SPRING }); a.cancel(); };
  ['pointerup', 'pointercancel', 'dragstart'].forEach((t) => addEventListener(t, release, true));

  const PAT = { selection: 6, light: 10, medium: 16, heavy: 24, success: [10, 70, 18], warning: [18, 90, 18], error: [22, 60, 22, 60, 22] };
  GH.haptic = (kind, x, y) => {
    if (!PAT[kind]) return;
    try { if (navigator.vibrate) navigator.vibrate(PAT[kind]); } catch (e) {}
    if (GH.showHaptics && x != null) ping(kind, x, y);
  };
  // Default mapping. Components can override any element with data-haptic="selection|light|medium|success|warning|error|none".
  GH.hapticFor = (t) => {
    const tag = t.closest && t.closest('[data-haptic]'); if (tag) return tag.getAttribute('data-haptic');
    const el = t.closest && t.closest(TAP + ',input[type="checkbox"]'); if (!el || el.disabled) return null;
    if (el.matches('[role="tab"],[role="radio"],[role="switch"],[role="checkbox"],[aria-pressed],input[type="checkbox"]')) return 'selection';
    const txt = (el.getAttribute('aria-label') || el.textContent || '').trim();
    if (/^(remove|delete|discard|exit round|dismiss)\b/i.test(txt)) return 'warning';
    if (/^(post|save|import|publish|send|share|assign|start round|finish|submit|got it)\b/i.test(txt)) return 'success';
    if (/primary/.test(typeof el.className === 'string' ? el.className : '')) return 'light';
    return null;
  };
  addEventListener('click', (e) => { const k = GH.hapticFor(e.target); if (k) GH.haptic(k, e.clientX, e.clientY); }, true);
  function ping(kind, x, y) {
    const d = document.createElement('div'); d.className = 'ghh is-' + kind; d.style.left = x + 'px'; d.style.top = y + 'px';
    d.innerHTML = '<i></i><span>' + kind + '</span>'; document.body.appendChild(d); setTimeout(() => d.remove(), 900);
  }

  let P = null;
  function paint() {
    if (!P) return;
    P.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.s === GH.state)));
    const c = P.querySelector('.ghp__chip'); c.classList.toggle('is-alt', GH.state !== 'live');
    c.querySelector('span').textContent = GH.state === 'live' ? 'Prototype' : 'Prototype · ' + (GH.state === 'empty' ? 'Empty' : 'Loading');
  }
  function mount() {
    const kind = document.querySelector('meta[name="gh-kind"]');
    if (!kind || kind.content !== 'desktop') return;
    P = document.createElement('div'); P.className = 'ghp'; P.setAttribute('data-gh-nopress', ''); P.setAttribute('data-haptic', 'none');
    const who = (GH.role === 'player' ? 'Player' : 'Coach') + ' · ' + document.title.split('·').pop().trim();
    P.innerHTML = '<div class="ghp__body" hidden><p class="ghp__k">Reviewer controls. Not part of the product.</p><div class="ghp__seg" role="radiogroup" aria-label="Screen state">' +
      ['live', 'loading', 'empty'].map((s) => '<button type="button" role="radio" data-s="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>').join('') +
      '</div><button type="button" class="ghp__btn" data-act="replay">Replay load</button><label class="ghp__tg"><input type="checkbox" data-act="haptics"><span>Show haptics on tap</span></label><p class="ghp__m">' + who + '</p></div>' +
      '<button type="button" class="ghp__chip" aria-expanded="false"><i></i><span>Prototype</span></button>';
    P.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('.ghp__chip')) { const b = P.querySelector('.ghp__body'); b.hidden = !b.hidden; P.querySelector('.ghp__chip').setAttribute('aria-expanded', String(!b.hidden)); return; }
      const s = t.closest('[data-s]'); if (s) { GH.setState(s.dataset.s); return; }
      if (t.closest('[data-act="replay"]')) GH.replay();
    });
    P.querySelector('[data-act="haptics"]').addEventListener('change', (e) => { GH.showHaptics = e.target.checked; });
    document.body.appendChild(P); paint();
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount); else mount();
})();
