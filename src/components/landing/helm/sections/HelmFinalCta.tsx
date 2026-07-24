import Image from 'next/image';
import Link from 'next/link';
import styles from '../helm-landing.module.css';

export function HelmFinalCta({ onRequestDemo }: { onRequestDemo: () => void }) {
  return (
    <section style={{ background: 'var(--dark)', color: 'var(--onacc)' }}>
      <div
        style={{
          maxWidth: '1320px',
          margin: '0 auto',
          padding: 'clamp(90px,12vw,170px) clamp(20px,4vw,64px)',
          textAlign: 'center',
          position: 'relative',
          overflow: 'clip',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            width: 'min(560px,90vw)',
            aspectRatio: '1/1',
            borderRadius: '50%',
            border: '1px solid oklch(1 0 0/0.06)',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            width: 'min(360px,60vw)',
            aspectRatio: '1/1',
            borderRadius: '50%',
            border: '1px solid oklch(1 0 0/0.08)',
          }}
        />
        <div style={{ position: 'relative' }} data-reveal>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '12px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'oklch(0.724 0.132 150)',
            }}
          >
            See GolfHelm
          </div>
          <h2
            style={{
              margin: '18px auto 0',
              fontSize: 'clamp(2.1rem,4.6vw,3.6rem)',
              lineHeight: 1.03,
              letterSpacing: '-0.022em',
              fontWeight: 600,
              color: 'var(--onacc)',
              maxWidth: '15em',
              textWrap: 'balance',
            }}
          >
            See GolfHelm with your program in mind.
          </h2>
          <p
            style={{
              margin: '20px auto 0',
              fontSize: 'clamp(1rem,1.4vw,1.18rem)',
              lineHeight: 1.55,
              color: 'oklch(0.82 0.008 85)',
              maxWidth: '34em',
              textWrap: 'pretty',
            }}
          >
            Bring your rounds and roster. We&apos;ll show you the operating view built for college golf.
          </p>
          <div
            style={{
              margin: '34px 0 0',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '20px',
              justifyContent: 'center',
              alignItems: 'center',
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
                padding: '15px 30px',
                borderRadius: '9999px',
                boxShadow: '0 2px 10px oklch(0.35 0.08 150/0.5)',
              }}
            >
              Request Demo
            </button>
            <Link
              href="#top"
              className={styles.linkInk}
              style={{ fontSize: '15px', fontWeight: 520, color: 'oklch(0.86 0.008 85)' }}
            >
              Log in
            </Link>
          </div>
        </div>
      </div>
      <footer style={{ borderTop: '1px solid oklch(1 0 0/0.08)' }}>
        <div
          style={{
            maxWidth: '1320px',
            margin: '0 auto',
            padding: '44px clamp(20px,4vw,64px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
            gap: '36px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Image
                src="/helm-main-logo-transparent-white-trim.png"
                alt=""
                width={28}
                height={28}
                style={{ width: '28px', height: '28px', objectFit: 'contain' }}
              />
              <span style={{ fontWeight: 620, fontSize: '15px', color: 'var(--onacc)' }}>Helm Sports Labs</span>
            </div>
            <p
              style={{
                margin: '14px 0 0',
                fontSize: '13px',
                lineHeight: 1.5,
                color: 'oklch(0.7 0.008 85)',
                maxWidth: '22em',
              }}
            >
              College sports intelligence, built for the people who run programs.
            </p>
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '10.5px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'oklch(0.62 0.008 85)',
              }}
            >
              Products
            </div>
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px' }}>
              <Link href="/products" className={styles.footLink} style={{ color: 'oklch(0.82 0.008 85)' }}>
                GolfHelm
              </Link>
              <Link href="/products" className={styles.footLink} style={{ color: 'oklch(0.82 0.008 85)' }}>
                BaseballHelm
              </Link>
            </div>
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '10.5px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'oklch(0.62 0.008 85)',
              }}
            >
              Company
            </div>
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px' }}>
              <Link href="/about" className={styles.footLink} style={{ color: 'oklch(0.82 0.008 85)' }}>
                About
              </Link>
              <button
                type="button"
                onClick={onRequestDemo}
                className={styles.footLink}
                style={{
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontFamily: 'var(--sans)',
                  fontSize: '13.5px',
                  color: 'oklch(0.82 0.008 85)',
                  cursor: 'pointer',
                }}
              >
                Request Demo
              </button>
            </div>
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '10.5px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'oklch(0.62 0.008 85)',
              }}
            >
              Legal
            </div>
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px' }}>
              <Link href="/privacy" className={styles.footLink} style={{ color: 'oklch(0.82 0.008 85)' }}>
                Privacy
              </Link>
              <Link href="/terms" className={styles.footLink} style={{ color: 'oklch(0.82 0.008 85)' }}>
                Terms
              </Link>
            </div>
          </div>
        </div>
        <div
          style={{
            maxWidth: '1320px',
            margin: '0 auto',
            padding: '0 clamp(20px,4vw,64px) 40px',
            fontSize: '12px',
            color: 'oklch(0.6 0.008 85)',
          }}
        >
          © 2026 Helm Sports Labs. All rights reserved.
        </div>
      </footer>
    </section>
  );
}
