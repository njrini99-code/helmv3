import styles from '../products-landing.module.css';

/**
 * Closing call-to-action band. The mock folded a dark footer into this section;
 * here it ends at the CTA so the shared site <Footer> (used across the marketing
 * site) carries the footer, keeping chrome consistent with the landing page.
 */
export function FinalCta() {
  return (
    <section id="getdemo" style={{ scrollMarginTop: 90, background: 'var(--dark)', color: 'var(--onacc)' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: 'clamp(80px,11vw,150px) clamp(20px,4vw,64px)', textAlign: 'center', position: 'relative', overflow: 'clip' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '44%',
            transform: 'translate(-50%,-50%)',
            width: 'min(560px,90vw)',
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            background: 'radial-gradient(circle,oklch(0.648 0.149 149.6/0.12),transparent 60%)',
          }}
        />
        <div style={{ position: 'relative' }} data-reveal>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'oklch(0.724 0.132 150)' }}>Get started</div>
          <h2 style={{ margin: '18px auto 0', fontSize: 'clamp(2rem,4.4vw,3.4rem)', lineHeight: 1.04, letterSpacing: '-0.022em', fontWeight: 600, color: 'var(--onacc)', maxWidth: '15em', textWrap: 'balance' }}>
            See the platform with your program in mind.
          </h2>
          <p style={{ margin: '18px auto 0', fontSize: 'clamp(1rem,1.4vw,1.18rem)', lineHeight: 1.55, color: 'oklch(0.82 0.008 85)', maxWidth: '34em', textWrap: 'pretty' }}>
            Bring your roster and a season of rounds — we&apos;ll show you the 87 stats, the root-cause
            insights, and the development plans built for college programs.
          </p>
          <div style={{ margin: '32px 0 0', display: 'flex', flexWrap: 'wrap', gap: 18, justifyContent: 'center' }}>
            <a
              href="#top"
              className={styles.btnPrimary}
              style={{ fontSize: 15, fontWeight: 600, padding: '15px 30px', borderRadius: 9999, boxShadow: '0 2px 10px oklch(0.35 0.08 150/0.5)' }}
            >
              Request Demo
            </a>
            <a href="#coachhelm" className={styles.linkGhostDim} style={{ fontSize: 15, fontWeight: 520, padding: '15px 8px' }}>
              Explore CoachHelm →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
