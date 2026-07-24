import Image from 'next/image';
import styles from '../products-landing.module.css';

const rowBase: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  alignItems: 'center',
  gap: 'clamp(18px,2.6vw,34px)',
  padding: 'clamp(22px,2.8vw,32px) 0',
  borderBottom: '1px solid var(--line)',
  color: 'inherit',
  overflow: 'hidden',
};

const glyphBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'clamp(46px,4.4vw,58px)',
  height: 'clamp(46px,4.4vw,58px)',
  borderRadius: 16,
  background: 'oklch(0.7 0.19 148/0.12)',
  flex: 'none',
};

const washStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  bottom: -1,
  height: 2,
  width: '100%',
  background: 'var(--accent)',
};

const svgGlyphStyle: React.CSSProperties = {
  stroke: 'var(--accent700)',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  transition: 'stroke .3s ease',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(1.3rem,2vw,1.75rem)',
  lineHeight: 1.1,
  letterSpacing: '-0.018em',
  fontWeight: 640,
  color: 'var(--ink)',
};

const descStyle: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: 15,
  lineHeight: 1.5,
  color: 'var(--ink2)',
  maxWidth: '44em',
};

function Arrow() {
  return (
    <span
      className={styles.arrow}
      aria-hidden
      style={{ display: 'flex', alignItems: 'center', color: 'var(--accent700)' }}
    >
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        style={{ stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}
      >
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}

/** Products intro — GolfHelm masthead + the three pillar rows. */
export function ProductsIntro() {
  return (
    <section
      id="products"
      style={{
        scrollMarginTop: 90,
        maxWidth: 1180,
        margin: '0 auto',
        padding: 'clamp(50px,7vw,96px) clamp(20px,4vw,64px)',
      }}
    >
      <div data-reveal style={{ display: 'flex', alignItems: 'center', gap: 'clamp(14px,2vw,24px)' }}>
        <Image
          src="/helm-golf-logo-mid.png"
          alt="GolfHelm"
          width={189}
          height={154}
          style={{
            height: 'clamp(54px,7vw,82px)',
            width: 'auto',
            aspectRatio: '189 / 154',
            flex: 'none',
            objectFit: 'contain',
            filter: 'drop-shadow(0 8px 20px oklch(0.28 0.1 150/0.22))',
          }}
        />
        <h2
          style={{
            margin: 0,
            fontSize: 'clamp(2.8rem,8.5vw,6rem)',
            lineHeight: 0.9,
            letterSpacing: '-0.035em',
            fontWeight: 680,
            color: 'var(--ink)',
          }}
        >
          Golf<span style={{ color: 'var(--accent)' }}>Helm</span>
        </h2>
      </div>
      <p
        data-reveal
        data-reveal-delay="60"
        style={{
          margin: 'clamp(20px,3vw,30px) 0 0',
          maxWidth: '36em',
          fontSize: 'clamp(1.05rem,1.5vw,1.28rem)',
          lineHeight: 1.55,
          color: 'var(--ink2)',
          textWrap: 'pretty',
        }}
      >
        College golf intelligence — rounds, shots, and strokes-gained stats, with the CoachHelm layer
        that turns every number into the next decision.
      </p>

      <div style={{ margin: 'clamp(30px,4vw,52px) 0 0', borderTop: '1px solid var(--line)' }}>
        {/* Team Management */}
        <a data-reveal data-reveal-delay="120" href="#team" className={styles.pRow} style={rowBase}>
          <span className={styles.wash} aria-hidden style={washStyle} />
          <span className={styles.glyphHover} style={glyphBase}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={svgGlyphStyle}>
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <circle cx="9" cy="7" r="4" />
              <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            </svg>
          </span>
          <span>
            <h3 style={titleStyle}>Team Management</h3>
            <p style={descStyle}>
              Rosters, travel squads, and qualifying — every player and event organized in one place.
            </p>
          </span>
          <Arrow />
        </a>

        {/* Built-in CoachHelm AI */}
        <a data-reveal data-reveal-delay="200" href="#coachhelm" className={styles.pRow} style={rowBase}>
          <span className={styles.wash} aria-hidden style={washStyle} />
          <span style={glyphBase}>
            <Image
              src="/anim/helm-coach-icon.png"
              alt="CoachHelm"
              width={300}
              height={300}
              style={{ width: '64%', height: '64%', objectFit: 'contain' }}
            />
          </span>
          <span>
            <h3 style={titleStyle}>Built-in CoachHelm AI</h3>
            <p style={descStyle}>
              Root-cause diagnosis and development plans, layered on top of every stat automatically.
            </p>
          </span>
          <Arrow />
        </a>

        {/* Shot Tracking & Stats */}
        <a data-reveal data-reveal-delay="280" href="#stats" className={styles.pRow} style={rowBase}>
          <span className={styles.wash} aria-hidden style={washStyle} />
          <span className={styles.glyphHover} style={glyphBase}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={svgGlyphStyle}>
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4.5" />
              <circle cx="12" cy="12" r="1" />
            </svg>
          </span>
          <span>
            <h3 style={titleStyle}>Shot Tracking &amp; Stats</h3>
            <p style={descStyle}>
              Log every shot live, and turn one round into 87 measured, benchmarked stats.
            </p>
          </span>
          <Arrow />
        </a>
      </div>
    </section>
  );
}
