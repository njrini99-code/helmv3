import styles from '../products-landing.module.css';
import { STAT_ROW_1, STAT_ROW_2 } from '../productsData';

const pillBase: React.CSSProperties = {
  flex: 'none',
  fontFamily: 'var(--mono)',
  fontSize: 12.5,
  background: 'var(--canvas)',
  border: '1px solid var(--line)',
  padding: '9px 15px',
  borderRadius: 9999,
  whiteSpace: 'nowrap',
};

/** Every round, quantified — count-up headline over two counter-scrolling rows. */
export function StatsTicker() {
  return (
    <section
      id="stats"
      style={{
        scrollMarginTop: 80,
        position: 'relative',
        overflow: 'clip',
        background: 'var(--surface)',
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: 'clamp(60px,8vw,112px) clamp(20px,4vw,64px) clamp(28px,4vw,48px)', textAlign: 'center' }}>
        <div data-reveal style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'var(--mono)', fontSize: 11.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent700)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
          Every round, quantified
        </div>
        <div data-reveal data-reveal-delay="60" style={{ margin: '20px 0 0', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
          <span
            data-fx="count"
            data-to="85"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'clamp(5rem,15vw,10.5rem)',
              fontWeight: 600,
              lineHeight: 0.86,
              letterSpacing: '-0.03em',
              background: 'linear-gradient(165deg,var(--accent),var(--accent700))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            0
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(2.4rem,6vw,4.2rem)', fontWeight: 600, color: 'var(--accent700)', lineHeight: 1 }}>+</span>
        </div>
        <h2 data-reveal data-reveal-delay="90" style={{ margin: '8px auto 0', maxWidth: '20em', fontSize: 'clamp(1.5rem,3vw,2.4rem)', lineHeight: 1.08, letterSpacing: '-0.02em', fontWeight: 600, color: 'var(--ink)', textWrap: 'balance' }}>
          stats calculated from a single round.
        </h2>
        <p data-reveal data-reveal-delay="120" style={{ margin: '18px auto 0', maxWidth: '36em', fontSize: 'clamp(1rem,1.3vw,1.15rem)', lineHeight: 1.6, color: 'var(--ink2)', textWrap: 'pretty' }}>
          Strokes gained, proximity, scrambling, dispersion, make rates — every shot a player logs turns into
          measured, benchmarked numbers the moment the round closes. No spreadsheets. No manual entry.
        </p>
      </div>

      <div style={{ position: 'relative', paddingBottom: 'clamp(52px,7vw,88px)' }} data-reveal>
        <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(90deg,var(--surface),transparent 12%,transparent 88%,var(--surface))' }} />
        <div style={{ overflow: 'hidden', padding: '4px 0' }}>
          <div className={`${styles.mq} ${styles.mqL}`} style={{ gap: 10 }}>
            {[...STAT_ROW_1, ...STAT_ROW_1].map((s, i) => (
              <span key={`r1-${i}`} style={{ ...pillBase, color: 'var(--ink2)' }}>{s}</span>
            ))}
          </div>
        </div>
        <div style={{ overflow: 'hidden', padding: '4px 0', marginTop: 10 }}>
          <div className={`${styles.mq} ${styles.mqR}`} style={{ gap: 10 }}>
            {[...STAT_ROW_2, ...STAT_ROW_2].map((s, i) => (
              <span key={`r2-${i}`} style={{ ...pillBase, color: 'var(--ink3)' }}>{s}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
