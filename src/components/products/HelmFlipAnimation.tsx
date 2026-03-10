'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import Image from 'next/image';
import { Satisfy } from 'next/font/google';
import styles from './HelmFlipAnimation.module.css';

const satisfy = Satisfy({ weight: '400', subsets: ['latin'], display: 'swap' });

/**
 * Helm Sports Labs flip animation — ported from standalone HTML.
 * Cycles through "GolfHelm", "BaseballHelm", "CoachHelm" then
 * collapses to reveal "Helm Sports Labs" with handwritten canvas text.
 * Pauses (holds) once the animation completes.
 */
export function HelmFlipAnimation() {
  const flipperRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const helmRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slWrapRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const taglineRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stepRef = useRef(0);
  const hasStartedRef = useRef(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rafRef = useRef<number | null>(null);
  const unmountedRef = useRef(false);

  // Cleanup all timers and rAF on unmount
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Intersection observer — start when in viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !hasStartedRef.current) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const animateHandwriting = useCallback((cb: () => void) => {
    const canvas = canvasRef.current;
    const helm = helmRef.current;
    if (!canvas || !helm) return;

    const doIt = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const text = 'Sports Labs';
      const dpr = window.devicePixelRatio || 1;
      const hH = helm.getBoundingClientRect().height;
      const fs = Math.round(hH * 0.78);

      ctx.font = `${fs}px ${satisfy.style.fontFamily}`;
      const tw = Math.ceil(ctx.measureText(text).width) + 40;
      const cH = Math.ceil(hH);

      canvas.width = tw * dpr;
      canvas.height = cH * dpr;
      canvas.style.width = `${tw}px`;
      canvas.style.height = `${cH}px`;

      const tY = cH * 0.76;

      // Offscreen text canvas — premium rendering
      const textCanvas = document.createElement('canvas');
      textCanvas.width = tw * dpr;
      textCanvas.height = cH * dpr;
      const tCtx = textCanvas.getContext('2d');
      if (!tCtx) return;
      tCtx.scale(dpr, dpr);
      tCtx.font = `${fs}px ${satisfy.style.fontFamily}`;
      tCtx.textBaseline = 'alphabetic';

      // Subtle glow behind text for depth
      tCtx.shadowColor = 'rgba(255,255,255,0.1)';
      tCtx.shadowBlur = 6;
      tCtx.fillStyle = 'rgba(255,255,255,0.92)';
      tCtx.fillText(text, 18, tY);

      // Crisp edge stroke (thin for premium feel)
      tCtx.shadowColor = 'transparent';
      tCtx.shadowBlur = 0;
      tCtx.strokeStyle = 'rgba(255,255,255,0.25)';
      tCtx.lineWidth = 0.6;
      tCtx.lineJoin = 'round';
      tCtx.strokeText(text, 18, tY);

      // Mask canvas
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = tw * dpr;
      maskCanvas.height = cH * dpr;
      const mCtx = maskCanvas.getContext('2d');
      if (!mCtx) return;

      const edgeWidth = fs * 0.18;
      const duration = 3000;
      let startTime: number | null = null;

      ctx.scale(dpr, dpr);

      // Smoothstep helper
      const smoothstep = (x: number) => x * x * (3 - 2 * x);

      const draw = (ts: number) => {
        if (!startTime) startTime = ts;
        const t = Math.min((ts - startTime) / duration, 1);

        // Piecewise easing with natural pause at word break
        // Phase 1: Write "Sports" — accelerate in
        // Phase 2: Brief pause at space — pen lifts between words
        // Phase 3: Write "Labs" — smooth ease-out
        let e: number;
        if (t <= 0.42) {
          const s = t / 0.42;
          e = smoothstep(s) * 0.52;
        } else if (t <= 0.54) {
          const s = (t - 0.42) / 0.12;
          e = 0.52 + s * 0.03;
        } else {
          const s = (t - 0.54) / 0.46;
          e = 0.55 + smoothstep(s) * 0.45;
        }

        const revealX = e * (tw + edgeWidth);

        // Build mask
        mCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        mCtx.clearRect(0, 0, tw, cH);

        // Solid revealed portion
        mCtx.fillStyle = 'white';
        mCtx.fillRect(0, 0, Math.max(0, revealX - edgeWidth), cH);

        // Feathered edge — tight ink-like falloff
        if (revealX > 0) {
          const grad = mCtx.createLinearGradient(
            Math.max(0, revealX - edgeWidth), 0,
            revealX, 0
          );
          grad.addColorStop(0, 'rgba(255,255,255,1)');
          grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
          grad.addColorStop(0.6, 'rgba(255,255,255,0.15)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          mCtx.fillStyle = grad;
          mCtx.fillRect(Math.max(0, revealX - edgeWidth), 0, edgeWidth, cH);
        }

        // Composite text with mask
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(textCanvas, 0, 0);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.globalCompositeOperation = 'source-over';

        // Pen cursor glow — green-tinted, clearly visible
        if (t > 0.01 && t < 0.96) {
          ctx.save();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

          const cursorX = Math.max(0, revealX - edgeWidth * 0.1);
          const cursorY = tY - fs * 0.15;
          const glowR = fs * 0.4;
          // Bright during writing, dims during word-break pause
          const isInPause = t > 0.42 && t < 0.54;
          const writingIntensity = isInPause ? 0.15 : 1;
          const glowAlpha = Math.min(1, t * 6) * Math.min(1, (1 - t) * 8) * 0.4 * writingIntensity;

          const rg = ctx.createRadialGradient(cursorX, cursorY, 0, cursorX, cursorY, glowR);
          rg.addColorStop(0, `rgba(22, 163, 74, ${glowAlpha})`);
          rg.addColorStop(0.3, `rgba(200, 255, 220, ${glowAlpha * 0.4})`);
          rg.addColorStop(0.6, `rgba(255, 255, 255, ${glowAlpha * 0.1})`);
          rg.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = rg;
          ctx.fillRect(cursorX - glowR, cursorY - glowR, glowR * 2, glowR * 2);

          ctx.restore();
        }

        if (t < 1) {
          rafRef.current = requestAnimationFrame(draw);
        } else {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(textCanvas, 0, 0);
          cb();
        }
      };

      rafRef.current = requestAnimationFrame(draw);
    };

    document.fonts.load(`72px ${satisfy.style.fontFamily}`).then(doIt).catch(doIt);
  }, []);

  const nextStep = useCallback(() => {
    const flipper = flipperRef.current;
    const inner = innerRef.current;
    const slWrap = slWrapRef.current;
    const logo = logoRef.current;
    const tagline = taglineRef.current;
    const words = wordRefs.current;
    if (!flipper || !inner || !slWrap || !logo || !tagline) return;

    stepRef.current++;
    const step = stepRef.current;

    const track = (id: ReturnType<typeof setTimeout>) => { timersRef.current.push(id); return id; };

    if (step <= 2) {
      const word = words[step];
      if (word) {
        flipper.style.width = `${word.scrollWidth}px`;
      }
      inner.style.transform = `translateY(-${step * 1.15}em)`;
      track(setTimeout(nextStep, 2000));
    } else if (step === 3) {
      track(setTimeout(() => {
        if (unmountedRef.current) return;
        flipper.classList.add(styles.flipperHidden!);

        track(setTimeout(() => {
          if (unmountedRef.current) return;
          slWrap.classList.add(styles.slWrapVisible!);
          animateHandwriting(() => {
            if (unmountedRef.current) return;
            logo.classList.add(styles.mainLogoVisible!);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (unmountedRef.current) return;
                logo.classList.add(styles.mainLogoRevealed!);
              });
            });

            track(setTimeout(() => {
              if (unmountedRef.current) return;
              tagline.classList.add(styles.taglineVisible!);
            }, 800));
          });
        }, 1000));
      }, 1600));
    }
  }, [animateHandwriting]);

  // Init flipper width + start sequence
  useEffect(() => {
    if (!isVisible || hasStartedRef.current) return;
    hasStartedRef.current = true;

    const flipper = flipperRef.current;
    const word0 = wordRefs.current[0];
    if (!flipper || !word0) return;

    flipper.style.transition = 'none';
    flipper.style.width = `${word0.scrollWidth}px`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flipper.style.transition =
          'width 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.6s cubic-bezier(0.4,0,0.2,1)';
        timersRef.current.push(setTimeout(nextStep, 2000));
      });
    });
  }, [isVisible, nextStep]);

  return (
    <div ref={containerRef} className={styles.scene}>
      {/* Hidden span to force font load before canvas uses it */}
      <span className={`${styles.fontPreload} ${satisfy.className}`}>Sports Labs</span>

      {/* Green glow */}
      <div className={styles.glow} />

      <div className={styles.wordRow}>
        {/* Flipper (prefix words) */}
        <div ref={flipperRef} className={styles.flipper}>
          <div
            ref={innerRef}
            className={styles.flipperInner}
            style={{ transition: 'transform 0.5s cubic-bezier(0.4,0,0.2,1)' }}
          >
            {(['Golf', 'Baseball', 'Coach'] as const).map((word, i) => (
              <div
                key={word}
                ref={(el) => { wordRefs.current[i] = el; }}
                className={styles.flipWord}
              >
                <div className={styles.flipWordLogo}>
                  <Image
                    src={`/anim/helm-${word.toLowerCase()}-icon.png`}
                    alt={word}
                    width={80}
                    height={80}
                    unoptimized
                  />
                </div>
                {word}
              </div>
            ))}
          </div>
        </div>

        {/* "Helm" text */}
        <span ref={helmRef} className={styles.helm}>
          Helm
        </span>

        {/* Sports Labs handwriting canvas */}
        <div ref={slWrapRef} className={styles.slWrap}>
          <canvas ref={canvasRef} />
        </div>

        {/* Main logo */}
        <div ref={logoRef} className={styles.mainLogo}>
          <Image
            src="/anim/helm-sports-labs-logo.png"
            alt="Helm Sports Labs"
            width={80}
            height={80}
            unoptimized
          />
        </div>
      </div>

      {/* Tagline */}
      <div ref={taglineRef} className={styles.tagline}>
        Sports Intelligence Platform
      </div>
    </div>
  );
}
