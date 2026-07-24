import { GolfHelmDashboard } from '../dashboards/GolfHelmDashboard';

export function HelmDashboardReveal() {
  return (
    <section
      id="golfhelm"
      data-dash-sec
      style={{
        scrollMarginTop: '90px',
        position: 'relative',
        height: '190vh',
        background: 'linear-gradient(180deg,var(--canvas),var(--tint))',
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'clip',
          padding: '0 clamp(20px,4vw,64px)',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            maxWidth: '640px',
            marginBottom: 'clamp(20px,3vh,38px)',
          }}
          data-reveal
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '12px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--accent700)',
            }}
          >
            GolfHelm
          </div>
          <h2
            style={{
              margin: '14px 0 0',
              fontSize: 'clamp(2rem,4.4vw,3.4rem)',
              lineHeight: 1.02,
              letterSpacing: '-0.022em',
              fontWeight: 600,
              color: 'var(--ink)',
              textWrap: 'balance',
            }}
          >
            The whole program, in view.
          </h2>
          <p
            style={{
              margin: '16px 0 0',
              fontSize: 'clamp(1rem,1.35vw,1.15rem)',
              lineHeight: 1.55,
              color: 'var(--ink2)',
              maxWidth: '34em',
              marginLeft: 'auto',
              marginRight: 'auto',
              textWrap: 'pretty',
            }}
          >
            Rounds, players, and coaching intelligence resolve into one coherent operating view.
          </p>
        </div>
        <div
          data-dash-frame
          style={{
            width: 'min(1040px,95vw)',
            borderRadius: '20px',
            overflow: 'hidden',
            background: 'var(--surface)',
            boxShadow: 'var(--raise)',
            transformOrigin: 'center 60%',
            willChange: 'transform',
          }}
        >
          <div
            data-dash-scaler
            style={{
              width: '1280px',
              transformOrigin: 'top left',
            }}
          >
            <GolfHelmDashboard />
          </div>
        </div>
      </div>
    </section>
  );
}
