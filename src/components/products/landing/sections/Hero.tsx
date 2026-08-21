'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { useRequestDemo } from '@/components/landing/request-demo-context';
import styles from '../products-landing.module.css';
import { useScene } from '@/lib/motion/gsap/useScene';
import { openingScene } from '../scenes/openingScene';

/** Hero — centered logo, thesis headline, and the two primary CTAs.
 *  (No `id="top"` here — MarketingShell's <main id="top"> owns that anchor.) */
export function Hero() {
  const openDemo = useRequestDemo();
  const rootRef = useRef<HTMLElement>(null);
  // P1 · masked SplitText arrival, run on load rather than on scroll. Replaces
  // four `.heroItem` keyframes on staggered `animation-delay`s.
  useScene(rootRef, openingScene);

  return (
    <section ref={rootRef} style={{ position: 'relative', overflow: 'clip', background: 'var(--canvas)' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(1000px,120vw)',
          height: 640,
          borderRadius: '50%',
          background: 'radial-gradient(circle,oklch(0.648 0.149 149.6/0.06),transparent 62%)',
          filter: 'blur(20px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          maxWidth: 1040,
          margin: '0 auto',
          padding: 'clamp(56px,9vw,120px) clamp(20px,4vw,64px) clamp(40px,5vw,72px)',
          textAlign: 'center',
        }}
      >
        <Image
          src="/Helm-Logo-New-Main-mid.png"
          alt="Helm"
          width={512}
          height={512}
          priority
          data-open="mark"
          style={{
            display: 'block',
            margin: '0 auto',
            width: 'clamp(88px,10vw,124px)',
            height: 'auto',
            aspectRatio: '1 / 1',
            objectFit: 'contain',
          }}
        />
        <h1
          data-open="headline"
          style={{
            margin: 'clamp(20px,2.4vw,30px) auto 0',
            maxWidth: '16em',
            fontSize: 'clamp(2.6rem,6vw,5.2rem)',
            lineHeight: 0.98,
            letterSpacing: '-0.028em',
            fontWeight: 640,
            color: 'var(--ink)',
            textWrap: 'balance',
          }}
        >
          Everything a program needs, in one system.
        </h1>
        <p
          data-open="body"
          style={{
            margin: '26px auto 0',
            maxWidth: '34em',
            fontSize: 'clamp(1.06rem,1.5vw,1.28rem)',
            lineHeight: 1.55,
            color: 'var(--ink2)',
            textWrap: 'pretty',
          }}
        >
          Track every shot, turn one round into 85 measured stats, and let CoachHelm find the root — all
          from a single operating view built for college coaches.
        </p>
        <div
          data-open="actions"
          style={{
            margin: '32px 0 0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 18,
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            onClick={openDemo}
            className={styles.btnPrimary}
            style={{
              fontSize: 15,
              fontWeight: 600,
              padding: '15px 28px',
              borderRadius: 9999,
              boxShadow: '0 1px 1px oklch(.35 .08 150/.4),0 3px 10px oklch(.35 .08 150/.28)',
            }}
          >
            Request Demo
          </button>
          <a
            href="#products"
            className={styles.linkGhost}
            style={{
              fontSize: 15,
              fontWeight: 560,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '15px 8px',
            }}
          >
            See the products<span aria-hidden>↓</span>
          </a>
        </div>
      </div>
    </section>
  );
}
