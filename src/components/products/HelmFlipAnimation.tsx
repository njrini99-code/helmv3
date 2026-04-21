'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import Image from 'next/image';
import { Satisfy } from 'next/font/google';
import styles from './HelmFlipAnimation.module.css';

const satisfy = Satisfy({ weight: '400', subsets: ['latin'], display: 'swap' });

/**
 * Helm Sports Labs flip animation — ported from standalone HTML.
 * Cycles through "GolfHelm", "BaseballHelm", "CoachHelm" then
 * collapses to reveal "Helm Sports Labs" with handwritten SVG text.
 * Pauses (holds) once the animation completes.
 */
export function HelmFlipAnimation() {
  const flipperRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const helmRef = useRef<HTMLSpanElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<SVGTextElement>(null);
  const clipRectRef = useRef<SVGRectElement>(null);
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

  /** Size the SVG viewBox + container to fit the text at the given font size. */
  const sizeSvg = useCallback(() => {
    const svg = svgRef.current;
    const textEl = textRef.current;
    const helm = helmRef.current;
    if (!svg || !textEl || !helm) return;

    const hH = helm.getBoundingClientRect().height;
    const fs = Math.round(hH * 0.78);
    textEl.style.fontSize = `${fs}px`;
    // Force layout so getBBox is accurate
    textEl.getBoundingClientRect();
    const bbox = textEl.getBBox();
    const vbX = bbox.x - 2;
    const vbY = bbox.y - 2;
    const vbW = bbox.width + 4;
    const vbH = bbox.height + 4;
    svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
    svg.style.width = `${vbW}px`;
    svg.style.height = `${vbH}px`;

    // Size the clip rect to cover the full viewBox height
    const clipRect = clipRectRef.current;
    if (clipRect) {
      clipRect.setAttribute('x', `${vbX}`);
      clipRect.setAttribute('y', `${vbY}`);
      clipRect.setAttribute('width', '0');
      clipRect.setAttribute('height', `${vbH}`);
    }
  }, []);

  const animateHandwriting = useCallback((cb: () => void) => {
    const svg = svgRef.current;
    const textEl = textRef.current;
    const clipRect = clipRectRef.current;
    const helm = helmRef.current;
    if (!svg || !textEl || !clipRect || !helm) return;

    const track = (id: ReturnType<typeof setTimeout>) => { timersRef.current.push(id); return id; };

    document.fonts.load(`72px ${satisfy.style.fontFamily}`).then(() => {
      if (unmountedRef.current) return;

      // Ensure SVG is sized (may already be from step 3, but re-measure to be safe)
      sizeSvg();

      const bbox = textEl.getBBox();
      const vbW = bbox.width + 4;

      // Smoothstep helper
      const smoothstep = (x: number) => x * x * (3 - 2 * x);

      const duration = 3000;
      let startTime: number | null = null;

      const draw = (ts: number) => {
        if (unmountedRef.current) return;
        if (!startTime) startTime = ts;
        const t = Math.min((ts - startTime) / duration, 1);

        // Piecewise easing with natural pause at word break
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

        // Reveal via clip rect width
        clipRect.setAttribute('width', `${e * vbW}`);

        if (t < 1) {
          rafRef.current = requestAnimationFrame(draw);
        } else {
          // Fully reveal
          clipRect.setAttribute('width', `${vbW}`);
          // Fade in the fill
          textEl.classList.add(styles.handwritingFill!);
          track(setTimeout(() => {
            cb();
          }, 400));
        }
      };

      rafRef.current = requestAnimationFrame(draw);
    });
  }, [sizeSvg]);

  const nextStep = useCallback(() => {
    const flipper = flipperRef.current;
    const inner = innerRef.current;
    const helm = helmRef.current;
    const slWrap = slWrapRef.current;
    const logo = logoRef.current;
    const tagline = taglineRef.current;
    const words = wordRefs.current;
    if (!flipper || !inner || !helm || !slWrap || !logo || !tagline) return;

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
      const wordRow = flipper.parentElement;
      // 1) Pause before collapsing flipper
      track(setTimeout(() => {
        if (unmountedRef.current) return;

        // Ensure font is loaded before measuring
        document.fonts.load(`72px ${satisfy.style.fontFamily}`).then(() => {
          if (unmountedRef.current) return;

          // Measure Helm position before any changes
          const helmBefore = helm.getBoundingClientRect().left;

          // Hide wordRow so no intermediate frames are painted
          if (wordRow) wordRow.style.visibility = 'hidden';

          // Show slWrap (invisible due to wordRow hidden) so SVG text is measurable
          slWrap.style.opacity = '0';
          slWrap.classList.add(styles.slWrapVisible!);

          // Pre-size the SVG so slWrap has its final width
          sizeSvg();

          // Collapse flipper instantly
          flipper.style.transition = 'none';
          flipper.style.opacity = '0';
          flipper.style.width = '0px';
          flipper.style.overflow = 'hidden';

          // Measure Helm in its final position
          const helmFinal = helm.getBoundingClientRect().left;
          const diff = helmBefore - helmFinal;

          // Apply offset so Helm appears unmoved, then reveal
          if (wordRow) {
            wordRow.style.transition = 'none';
            wordRow.style.transform = `translateX(${diff}px)`;
            // Force the browser to commit this layout before we animate
            wordRow.getBoundingClientRect();
            wordRow.style.visibility = 'visible';
            // Force commit again with visibility
            wordRow.getBoundingClientRect();

            // Now animate to final centered position
            wordRow.style.transition = 'transform 1.2s cubic-bezier(0.25, 0.1, 0.25, 1)';
            wordRow.style.transform = 'translateX(-1.2em)';
          }

          // 2) Wait for slide to finish, then start handwriting
          track(setTimeout(() => {
            if (unmountedRef.current) return;
            // slWrap is already visible and sized — just make it opaque
            slWrap.style.opacity = '1';

            // 3) Handwriting takes ~3s — wait for it to complete
            animateHandwriting(() => {
              if (unmountedRef.current) return;

              // 4) Pause after handwriting, then fade in logo
              track(setTimeout(() => {
                if (unmountedRef.current) return;
                logo.classList.add(styles.mainLogoVisible!);
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    if (unmountedRef.current) return;
                    logo.classList.add(styles.mainLogoRevealed!);
                  });
                });

                // 5) Tagline fades in after logo has started appearing
                track(setTimeout(() => {
                  if (unmountedRef.current) return;
                  tagline.classList.add(styles.taglineVisible!);
                }, 1000));
              }, 600));
            });
          }, 1100));
        });
      }, 1600));
    }
  }, [animateHandwriting, sizeSvg]);

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
      {/* Hidden span to force font load before SVG uses it */}
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

        {/* Sports Labs handwriting SVG */}
        <div ref={slWrapRef} className={styles.slWrap}>
          <svg ref={svgRef} className={styles.handwritingSvg}>
            <defs>
              <clipPath id="hw-clip">
                <rect ref={clipRectRef} />
              </clipPath>
            </defs>
            <text
              ref={textRef}
              className={`${styles.handwritingText} ${satisfy.className}`}
              clipPath="url(#hw-clip)"
            >
              Sports Labs
            </text>
          </svg>
        </div>

        {/* Main logo */}
        <div ref={logoRef} className={styles.mainLogo}>
          <Image
            src="/anim/helm-sports-labs-logo.png"
            alt="Helm Sports Labs"
            width={80}
            height={80}
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
