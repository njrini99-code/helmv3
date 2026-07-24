import { GolfHelmTeam } from '../dashboards/GolfHelmTeam'

export function HelmTeamManagement() {
  return (
    <section
      id="team"
      data-team-sec
      style={{ scrollMarginTop: '90px', position: 'relative', height: '260vh', background: 'var(--canvas)' }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'clip',
          padding: 'clamp(56px,7vh,88px) clamp(20px,4vw,64px)',
        }}
      >
        <div
          data-parallax="22"
          data-reveal
          style={{ maxWidth: '600px', textAlign: 'center', marginBottom: 'clamp(22px,3vh,38px)' }}
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
            Team Management
          </div>
          <h2
            style={{
              margin: '16px 0 0',
              fontSize: 'clamp(1.9rem,3.4vw,2.75rem)',
              lineHeight: 1.06,
              letterSpacing: '-0.02em',
              fontWeight: 600,
              color: 'var(--ink)',
              textWrap: 'balance',
            }}
          >
            No more group chats.
          </h2>
          <p
            style={{
              margin: '20px 0 0',
              fontSize: 'clamp(1rem,1.3vw,1.12rem)',
              lineHeight: 1.55,
              color: 'var(--ink2)',
              textWrap: 'pretty',
            }}
          >
            Roster, travel, class schedules, qualifiers, development, and announcements run in one place — so the
            program moves on a system, not a group chat.
          </p>
        </div>

        <div
          data-reveal
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr)',
            gap: '14px',
            marginBottom: '26px',
            width: '100%',
            maxWidth: '660px',
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '16px',
              boxShadow: 'var(--soft)',
              padding: '15px 17px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span
              style={{
                flex: 'none',
                display: 'inline-flex',
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'var(--accent50)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent700)" strokeWidth={2}>
                <circle cx="9" cy="8" r="3" />
                <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5M16 4a3 3 0 0 1 0 6" />
              </svg>
            </span>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '19px', fontWeight: 600, color: 'var(--ink)' }}>8</div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Players on roster</div>
            </div>
          </div>

          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '16px',
              boxShadow: 'var(--soft)',
              padding: '15px 17px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span
              style={{
                flex: 'none',
                display: 'inline-flex',
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'var(--accent50)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent700)" strokeWidth={2}>
                <rect x="3" y="4.5" width="18" height="17" rx="2" />
                <path d="M16 3v4M8 3v4M3 10h18" />
              </svg>
            </span>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '19px', fontWeight: 600, color: 'var(--ink)' }}>3</div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Events this week</div>
            </div>
          </div>

          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '16px',
              boxShadow: 'var(--soft)',
              padding: '15px 17px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span
              style={{
                flex: 'none',
                display: 'inline-flex',
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'var(--accent50)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent700)" strokeWidth={2}>
                <path d="M5 21V4h11l-1.5 3L16 10H5" />
              </svg>
            </span>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '19px', fontWeight: 600, color: 'var(--ink)' }}>1</div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Active qualifier</div>
            </div>
          </div>
        </div>

        <div
          data-team-frame
          data-reveal
          style={{ width: 'min(1060px,96vw)', position: 'relative', overflow: 'visible' }}
        >
          <div data-team-scaler style={{ width: '1180px', transformOrigin: 'top left' }}>
            <GolfHelmTeam />
          </div>
        </div>
      </div>
    </section>
  )
}
