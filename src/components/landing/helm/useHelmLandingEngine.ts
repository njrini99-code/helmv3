'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Scroll engine for the Helm landing — a 1:1 port of the Claude Design
 * componentDidMount. Selector-based (queries everything from the root) so the
 * section components stay pure/presentational. Markers it drives:
 *   [data-reveal] (+ data-reveal-delay, + data-parallax) — fade / rise in view
 *   [data-seq] (children [data-anim] [data-fade] [data-bar] [data-rise]) — choreographed
 *   [data-parallax] — drift (perspective tilt when value >= 40)
 *   [data-header] — nav pill background swap on scroll
 *   [data-dash-sec] / [data-dash-frame] / [data-dash-scaler] (> .gh) — pinned 3D tilt reveal
 *   [data-stats-frame] / [data-stats-scaler] (> .st) — responsive zoom
 *   [data-team-sec] / [data-team-frame] / [data-team-scaler] (> .tm .card) — scatter → assemble
 * All motion gates on prefers-reduced-motion.
 */
export function useHelmLandingEngine(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const rand = (n: number) => {
      const x = Math.sin((n + 1) * 127.1) * 43758.5453;
      return x - Math.floor(x);
    };
    const q = <T extends Element = HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel));
    const one = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const reveals = q<HTMLElement>('[data-reveal]');

    // ---- reveal + seq observers -------------------------------------------
    let io: IntersectionObserver | undefined;
    let seqIo: IntersectionObserver | undefined;

    const prepSeq = (c: Element) => {
      c.querySelectorAll<HTMLElement>('[data-anim]').forEach((el) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(12px)';
        el.style.transition = 'opacity .6s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1)';
      });
      c.querySelectorAll<HTMLElement>('[data-fade]').forEach((el) => {
        el.style.opacity = '0';
        el.style.transition = 'opacity .5s ease';
      });
      c.querySelectorAll<HTMLElement>('[data-bar]').forEach((el) => {
        el.dataset._w = el.getAttribute('data-w') ?? '100%';
        el.style.width = '0';
        el.style.transition = 'width .9s cubic-bezier(.16,1,.3,1)';
      });
      c.querySelectorAll<HTMLElement>('[data-rise]').forEach((el) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(60px)';
        el.style.transition = 'opacity .7s cubic-bezier(.16,1,.3,1), transform .85s cubic-bezier(.16,1,.3,1)';
      });
    };
    const runSeq = (c: Element) => {
      c.querySelectorAll<HTMLElement>('[data-anim]').forEach((el, i) =>
        setTimeout(() => {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }, 90 + i * 80),
      );
      c.querySelectorAll<HTMLElement>('[data-fade]').forEach((el, i) =>
        setTimeout(() => {
          el.style.opacity = '1';
        }, 220 + i * 150),
      );
      c.querySelectorAll<HTMLElement>('[data-bar]').forEach((el, i) =>
        setTimeout(() => {
          el.style.width = el.dataset._w ?? '100%';
        }, 260 + i * 110),
      );
      c.querySelectorAll<HTMLElement>('[data-rise]').forEach((el) =>
        setTimeout(() => {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }, 640),
      );
    };

    // Feature-gate ALL hide-then-reveal work on IntersectionObserver itself:
    // if the observer can't exist, nothing may be hidden, or every [data-reveal]
    // section below the fold stays invisible forever (same contract as
    // useProductsEffects.ts and the ResizeObserver guard further down).
    if (!reduce && typeof IntersectionObserver === 'function') {
      reveals.forEach((el) => {
        el.style.opacity = '0';
        if (el.hasAttribute('data-parallax')) {
          el.style.transition = 'opacity .9s cubic-bezier(.16,1,.3,1)';
        } else {
          el.style.transform = 'translateY(26px)';
          el.style.transition = 'opacity .8s cubic-bezier(.16,1,.3,1), transform .8s cubic-bezier(.16,1,.3,1)';
          const d = el.getAttribute('data-reveal-delay');
          if (d) el.style.transitionDelay = `${d}ms`;
        }
      });
      io = new IntersectionObserver(
        (es) => {
          es.forEach((e) => {
            if (e.isIntersecting) {
              const el = e.target as HTMLElement;
              el.style.opacity = '1';
              if (!el.hasAttribute('data-parallax')) el.style.transform = 'none';
              io?.unobserve(el);
            }
          });
        },
        { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
      );
      reveals.forEach((el) => io?.observe(el));

      seqIo = new IntersectionObserver(
        (es) => {
          es.forEach((e) => {
            if (e.isIntersecting) {
              runSeq(e.target);
              seqIo?.unobserve(e.target);
            }
          });
        },
        { threshold: 0.25 },
      );
      q('[data-seq]').forEach((el) => {
        prepSeq(el);
        seqIo?.observe(el);
      });
    }

    // ---- responsive zoom scalers ------------------------------------------
    const resizeFrame = (frameSel: string, scalerSel: string, innerSel: string) => {
      const f = one<HTMLElement>(frameSel);
      const s = one<HTMLElement>(scalerSel);
      if (!f || !s) return;
      const inner = s.querySelector<HTMLElement>(innerSel);
      if (!inner || !inner.offsetWidth) return;
      s.style.transform = 'none';
      s.style.height = 'auto';
      f.style.height = 'auto';
      s.style.zoom = String(f.clientWidth / inner.offsetWidth);
    };
    const resizeDash = () => {
      const f = one<HTMLElement>('[data-dash-frame]');
      const s = one<HTMLElement>('[data-dash-scaler]');
      if (!f || !s) return;
      const inner = s.querySelector<HTMLElement>('.gh');
      if (!inner || !inner.offsetWidth) return;
      s.style.transform = 'none';
      s.style.height = 'auto';
      s.style.zoom = String(f.clientWidth / inner.offsetWidth);
      if (reduce) {
        f.style.transform = 'none';
        f.style.opacity = '1';
      } else {
        updateDash();
      }
    };
    const resizeStats = () => resizeFrame('[data-stats-frame]', '[data-stats-scaler]', '.st');
    const resizeTeam = () => resizeFrame('[data-team-frame]', '[data-team-scaler]', '.tm');

    // ---- scroll-driven pieces ---------------------------------------------
    const progressFor = (sec: Element) => {
      const r = sec.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = r.height - vh;
      if (total <= 0) return clamp((0 - r.top) / Math.max(1, r.height), 0, 1);
      return clamp((0 - r.top) / total, 0, 1);
    };

    let headerState: boolean | undefined;
    const updateHeader = () => {
      const h = one<HTMLElement>('[data-header]');
      if (!h) return;
      const s = window.scrollY > 40;
      if (s === headerState) return;
      headerState = s;
      h.style.background = s
        ? 'linear-gradient(180deg,oklch(1 0 0/0.24),oklch(1 0 0/0.07)),color-mix(in srgb, var(--surface) 74%, transparent)'
        : 'linear-gradient(180deg,oklch(1 0 0/0.20),oklch(1 0 0/0.05)),color-mix(in srgb, var(--surface) 52%, transparent)';
      h.style.boxShadow = s
        ? 'inset 0 1px 0 oklch(1 0 0/0.5),0 1px 2px oklch(.18 .01 60/.08),0 12px 34px oklch(.18 .01 60/.12)'
        : 'inset 0 1px 0 oklch(1 0 0/0.34),0 1px 2px oklch(.18 .01 60/.05),0 12px 30px oklch(.18 .01 60/.08)';
    };

    const updateDash = () => {
      const sec = one<HTMLElement>('[data-dash-sec]');
      const f = one<HTMLElement>('[data-dash-frame]');
      if (!sec || !f) return;
      const p = progressFor(sec);
      const e = clamp(p / 0.7, 0, 1);
      const op = clamp(p / 0.15, 0, 1);
      const rx = 6 - 6 * e;
      const ry = -9 + 9 * e;
      const rz = -1 + 1 * e;
      const sc = 0.94 + 0.06 * e;
      const ty = 60 - 60 * clamp(p / 0.3, 0, 1);
      f.style.transform = `perspective(1700px) translateY(${ty}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${sc})`;
      f.style.opacity = String(op);
    };

    const parallaxEls = reduce ? [] : q<HTMLElement>('[data-parallax]');
    const updateParallax = () => {
      const vh = window.innerHeight;
      parallaxEls.forEach((el) => {
        const r = el.getBoundingClientRect();
        const d = (r.top + r.height / 2) / vh - 0.5;
        const amt = parseFloat(el.getAttribute('data-parallax') ?? '0') || 0;
        const big = amt >= 40;
        const ty = (-d * amt).toFixed(1);
        const rx = big ? (d * 7).toFixed(2) : '0';
        const prox = 1 - Math.min(1, Math.abs(d) * 1.5);
        const sc = big ? (0.94 + 0.06 * prox).toFixed(3) : '1';
        el.style.transform = big
          ? `perspective(1500px) translateY(${ty}px) rotateX(${rx}deg) scale(${sc})`
          : `translateY(${ty}px)`;
      });
    };

    let teamPieces: HTMLElement[] | undefined;
    const initTeamPieces = () => {
      if (teamPieces || reduce) return;
      const s = one<HTMLElement>('[data-team-scaler]');
      const tm = s?.querySelector<HTMLElement>('.tm');
      if (!tm) return;
      const cards = Array.from(tm.querySelectorAll<HTMLElement>('.card'));
      if (!cards.length) return;
      cards.forEach((el, i) => {
        const a = rand(i) * 6.2832;
        const dist = 520 + rand(i + 7) * 560;
        el.dataset.dx = (Math.cos(a) * dist).toFixed(0);
        el.dataset.dy = (Math.sin(a) * dist).toFixed(0);
        el.dataset.rot = ((rand(i + 3) - 0.5) * 50).toFixed(1);
        el.dataset.st = (i * 0.055).toFixed(3);
        el.style.willChange = 'transform,opacity';
      });
      teamPieces = cards;
      updateTeamAssembly();
    };
    const updateTeamAssembly = () => {
      if (!teamPieces) return;
      const sec = one<HTMLElement>('[data-team-sec]');
      if (!sec) return;
      const p = progressFor(sec);
      teamPieces.forEach((el) => {
        const st = parseFloat(el.dataset.st ?? '0') || 0;
        const local = clamp((p - st) / 0.5, 0, 1);
        const e = 1 - Math.pow(1 - local, 3);
        const inv = 1 - e;
        const dx = Number(el.dataset.dx) * inv;
        const dy = Number(el.dataset.dy) * inv;
        const rot = Number(el.dataset.rot) * inv;
        el.style.opacity = clamp(e * 1.8, 0, 1).toFixed(3);
        el.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(0.5 + 0.5 * e).toFixed(3)})`;
      });
    };

    const updateScroll = () => {
      updateHeader();
      if (reduce) return;
      updateDash();
      updateParallax();
      if (!teamPieces) initTeamPieces();
      updateTeamAssembly();
    };

    const setReducedFinal = () => {
      const f = one<HTMLElement>('[data-dash-frame]');
      if (f) {
        f.style.transform = 'none';
        f.style.opacity = '1';
      }
      reveals.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    };

    // ---- wiring ------------------------------------------------------------
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateScroll();
      });
    };
    const onResize = () => {
      resizeDash();
      resizeStats();
      resizeTeam();
      updateScroll();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    resizeDash();
    resizeStats();
    resizeTeam();

    // Embedded dashboards mount async — poll until .gh/.st/.tm exist and sized.
    let tries = 0;
    const embedTimer = window.setInterval(() => {
      resizeDash();
      resizeStats();
      resizeTeam();
      initTeamPieces();
      const ready =
        one('[data-dash-scaler] .gh') && one('[data-stats-scaler] .st') && one('[data-team-scaler] .tm');
      if (ready || ++tries > 40) window.clearInterval(embedTimer);
    }, 150);

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver === 'function') {
      let roRaf = 0;
      ro = new ResizeObserver(() => {
        if (roRaf) return;
        roRaf = requestAnimationFrame(() => {
          roRaf = 0;
          resizeDash();
          resizeStats();
          resizeTeam();
        });
      });
      ['[data-dash-scaler]', '[data-stats-scaler]', '[data-team-scaler]'].forEach((sel) => {
        const n = one<HTMLElement>(sel);
        if (n) ro?.observe(n);
      });
    }

    if (reduce) {
      setReducedFinal();
      updateHeader();
    } else {
      updateScroll();
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      io?.disconnect();
      seqIo?.disconnect();
      ro?.disconnect();
      window.clearInterval(embedTimer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [rootRef]);
}
