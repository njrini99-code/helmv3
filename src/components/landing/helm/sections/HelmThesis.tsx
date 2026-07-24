export function HelmThesis() {
  return (
    <section
      style={{
        maxWidth: '1320px',
        margin: '0 auto',
        padding: 'clamp(70px,12vw,180px) clamp(20px,4vw,64px)',
      }}
    >
      <div
        style={{
          maxWidth: '960px',
          marginLeft: 'clamp(0px,8vw,140px)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '11.5px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink3)',
            display: 'flex',
            gap: '18px',
            flexWrap: 'wrap',
          }}
          data-reveal
        >
          <span>Coaching</span>
          <span style={{ color: 'var(--line)' }}>/</span>
          <span>Performance</span>
          <span style={{ color: 'var(--line)' }}>/</span>
          <span>Program</span>
        </div>
        <p
          style={{
            margin: '26px 0 0',
            fontSize: 'clamp(1.7rem,3.6vw,3rem)',
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            fontWeight: 560,
            color: 'var(--ink)',
            textWrap: 'balance',
          }}
          data-reveal
          data-reveal-delay={60}
        >
          A clear view of every round, every player, and what to do next.
        </p>
        <p
          style={{
            margin: '26px 0 0',
            fontSize: 'clamp(1.02rem,1.4vw,1.2rem)',
            lineHeight: 1.55,
            color: 'var(--ink2)',
            maxWidth: '38em',
            textWrap: 'pretty',
          }}
          data-reveal
          data-reveal-delay={120}
        >
          GolfHelm turns a program&apos;s rounds, shots, and statistics into one coherent operating view — so the next decision is always the clear one.
        </p>
      </div>
    </section>
  )
}
