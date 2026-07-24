import Image from 'next/image';
import styles from '../helm-landing.module.css';

export function HelmHero({ onRequestDemo }: { onRequestDemo: () => void }) {
  return (
    <section id="top" style={{ scrollMarginTop: '90px', position: 'relative', overflow: 'clip' }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-14%',
          right: '-8%',
          width: '52vw',
          height: '52vw',
          maxWidth: '760px',
          maxHeight: '760px',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 50% 50%,oklch(0.9 0.07 120/0.28),transparent 62%)',
          filter: 'blur(10px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          maxWidth: '1320px',
          margin: '0 auto',
          padding: 'clamp(40px,7vw,96px) clamp(20px,4vw,64px) clamp(56px,7vw,110px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))',
          gap: 'clamp(32px,5vw,72px)',
          alignItems: 'center',
        }}
      >
        <div style={{ maxWidth: '600px' }}>
          <h1
            className={styles.heroUp}
            style={{
              animationDelay: '0.1s',
              margin: '0',
              fontSize: 'clamp(3rem,6.6vw,6rem)',
              lineHeight: 0.98,
              letterSpacing: '-0.028em',
              fontWeight: 640,
              color: 'var(--ink)',
              textWrap: 'balance',
            }}
          >
            Command every angle of your program.
          </h1>
          <p
            className={styles.heroUp}
            style={{
              animationDelay: '0.3s',
              margin: '30px 0 0',
              fontSize: 'clamp(1.06rem,1.5vw,1.32rem)',
              lineHeight: 1.5,
              color: 'var(--ink2)',
              maxWidth: '32em',
              textWrap: 'pretty',
            }}
          >
            The operating system for college golf — where every round, shot, and stat resolves into your next coaching decision.
          </p>
          <div
            className={styles.heroUp}
            style={{
              animationDelay: '0.4s',
              margin: '34px 0 0',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '22px',
            }}
          >
            <button
              type="button"
              onClick={onRequestDemo}
              className={styles.btnPrimary}
              style={{
                fontFamily: 'var(--sans)',
                fontSize: '15px',
                fontWeight: 600,
                padding: '15px 28px',
                borderRadius: '9999px',
                boxShadow: '0 1px 1px oklch(.35 .08 150/.4),0 3px 10px oklch(.35 .08 150/.28)',
              }}
            >
              Request Demo
            </button>
            <a
              href="#golfhelm"
              className={styles.exploreLink}
              style={{
                fontSize: '15px',
                fontWeight: 560,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <Image
                src="/helm-golf-logo-transparent.png"
                alt="GolfHelm"
                width={189}
                height={154}
                style={{ width: 'auto', height: '34px', display: 'block' }}
              />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--ink)' }}>Explore</span>
                <span style={{ color: 'var(--accent)', fontWeight: 660 }}>GolfHelm</span>
                <span
                  className={styles.exploreArrow}
                  style={{ display: 'inline-block', transition: 'transform .2s ease', color: 'var(--ink)' }}
                >
                  →
                </span>
              </span>
            </a>
          </div>
        </div>
        <div
          className={styles.heroImg}
          style={{
            position: 'relative',
            marginRight: 'calc(-1*clamp(20px,4vw,64px))',
          }}
        >
          <div
            style={{
              position: 'relative',
              borderRadius: '24px 0 0 24px',
              overflow: 'hidden',
              boxShadow: 'var(--raise)',
              aspectRatio: '5/4.3',
            }}
          >
            <Image
              src="/hero-golf.jpg"
              alt="An elevated, sunlit view of a college course green — two players walking the putting surface beside bunkers, flag in place"
              width={2560}
              height={1706}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: '50% 46%',
                display: 'block',
                filter: 'brightness(1.15) saturate(1.05) contrast(0.98)',
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(158deg,oklch(1 0 0/0.24),transparent 32%),linear-gradient(180deg,transparent 60%,oklch(0.28 0.02 60/0.28))',
                pointerEvents: 'none',
              }}
            />
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                boxShadow: 'inset 0 1px 0 oklch(1 0 0/0.35)',
                borderRadius: 'inherit',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
