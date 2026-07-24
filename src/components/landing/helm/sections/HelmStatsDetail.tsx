import { GolfHelmStats } from '../dashboards/GolfHelmStats';

export function HelmStatsDetail() {
  return (
    <section
      id="statsdetail"
      style={{
        scrollMarginTop: '90px',
        position: 'relative',
        background: 'linear-gradient(180deg,var(--canvas),var(--tint))',
        overflow: 'clip',
      }}
    >
      <div
        style={{
          maxWidth: '1320px',
          margin: '0 auto',
          padding: 'clamp(70px,9vw,130px) clamp(20px,4vw,64px)',
        }}
      >
        <div
          data-parallax="18"
          data-reveal
          style={{ maxWidth: '620px', margin: '0 auto', textAlign: 'center' }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '11.5px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--accent700)',
            }}
          >
            Player detail
          </div>
          <h2
            style={{
              margin: '16px 0 0',
              fontSize: 'clamp(1.9rem,3.6vw,2.9rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              fontWeight: 600,
              color: 'var(--ink)',
              textWrap: 'balance',
            }}
          >
            See exactly where the strokes leak.
          </h2>
          <p
            style={{
              margin: '16px auto 0',
              fontSize: 'clamp(1rem,1.3vw,1.15rem)',
              lineHeight: 1.55,
              color: 'var(--ink2)',
              maxWidth: '36em',
              textWrap: 'pretty',
            }}
          >
            Open any player and GolfHelm benchmarks them against the field and the team, then ranks the leaks in
            order — so the practice plan writes itself.
          </p>
        </div>
        <div
          data-stats-frame
          data-parallax="66"
          style={{
            marginTop: 'clamp(34px,4vw,56px)',
            width: 'min(1120px,100%)',
            marginLeft: 'auto',
            marginRight: 'auto',
            borderRadius: '20px',
            overflow: 'hidden',
            boxShadow: 'var(--raise)',
            willChange: 'transform',
          }}
        >
          <div data-stats-scaler style={{ width: '1160px', transformOrigin: 'top left' }}>
            <GolfHelmStats />
          </div>
        </div>
      </div>
    </section>
  );
}
