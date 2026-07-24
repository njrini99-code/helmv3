import Image from 'next/image';

export function GolfHelmDashboard() {
  return (
    <div
      className="gh"
      style={{
        width: 1280,
        minHeight: '840px',
        display: 'flex',
        background: 'var(--canvas)',
      }}
    >
      {/* SIDEBAR */}
      <aside
        style={{
          width: '236px',
          flex: 'none',
          background: 'var(--dark)',
          color: 'var(--onacc)',
          display: 'flex',
          flexDirection: 'column',
          padding: '18px 14px',
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '4px 8px 14px' }}>
          <Image
            src="/helm-golf-logo-transparent.png"
            alt=""
            width={32}
            height={32}
            style={{ width: '32px', height: '32px', objectFit: 'contain', display: 'block' }}
          />
          <span style={{ fontSize: '17px', fontWeight: 680, letterSpacing: '-0.01em' }}>
            Golf<span style={{ color: 'var(--accent300)' }}>Helm</span>
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 8px',
            marginBottom: '6px',
            borderRadius: '12px',
            background: 'oklch(1 0 0/0.05)',
          }}
        >
          <span
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              background: 'var(--accent)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: '12.5px',
            }}
          >
            DC
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>Demo Coach</div>
            <div
              style={{
                fontSize: '11px',
                color: 'oklch(0.72 0.008 85)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)' }} />
              Demo University Golf
            </div>
          </div>
        </div>
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '9.5px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'oklch(0.6 0.008 85)',
            padding: '8px 10px 4px',
          }}
        >
          Team Management
        </div>
        <div className="nav" style={{ background: 'oklch(0.648 0.149 149.6/0.16)', color: 'var(--onacc)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2}>
            <path d="M3 10.5L12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
          </svg>
          Dashboard
        </div>
        <div className="nav">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 3l2.1 5.4L20 9.3l-4.2 3.7L17 19l-5-3-5 3 1.2-6L4 9.3l5.9-.9z" />
          </svg>
          CoachHelm AI
        </div>
        <div className="nav">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5M16 4a3 3 0 0 1 0 6M18 20c0-2-1-3.6-2.5-4.4" />
          </svg>
          Roster
        </div>
        <div className="nav">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M7 21V4l11 3-11 3" />
            <circle cx="7" cy="21" r="0.6" fill="currentColor" />
          </svg>
          Rounds
        </div>
        <div className="nav">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" />
          </svg>
          Development
        </div>
        <div className="nav">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="4.5" width="18" height="17" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" />
          </svg>
          Calendar
        </div>
        <div className="nav">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M5 21V4h11l-1.5 3L16 10H5" />
          </svg>
          Qualifiers
        </div>
        <div className="nav">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          </svg>
          Stats
        </div>
        <div className="nav">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 5h16v11H8l-4 4z" />
          </svg>
          Messages
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div className="nav">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7" />
            </svg>
            Settings
          </div>
          <div className="nav">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
            </svg>
            Sign out
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, padding: '26px 30px 30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* masthead */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' }}>
            <div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '10.5px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--ink3)',
                }}
              >
                Coach Dashboard
              </div>
              <h1
                style={{
                  margin: '8px 0 0',
                  fontSize: '29px',
                  fontWeight: 640,
                  letterSpacing: '-0.02em',
                  color: 'var(--ink)',
                }}
              >
                Good afternoon, Demo
              </h1>
              <div
                style={{
                  marginTop: '7px',
                  fontSize: '13.5px',
                  color: 'var(--ink2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} />
                Demo University Golf · 8 players · 1 upcoming event
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: '13px',
                  fontWeight: 560,
                  color: 'var(--ink)',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  padding: '9px 15px',
                  borderRadius: '9999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                }}
              >
                Schedule
              </button>
              <button
                type="button"
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: '13px',
                  fontWeight: 560,
                  color: 'var(--ink)',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  padding: '9px 15px',
                  borderRadius: '9999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                }}
              >
                Qualifiers
              </button>
              <button
                type="button"
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#fff',
                  background: 'var(--accent)',
                  border: 'none',
                  padding: '9px 16px',
                  borderRadius: '9999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                }}
              >
                + Add Player
              </button>
            </div>
          </div>
          <div style={{ height: '1px', width: '100%', background: 'var(--accent300)' }} />

          {/* window + invite */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ink3)',
              }}
            >
              Window
            </span>
            <div
              style={{
                display: 'flex',
                gap: '2px',
                background: 'var(--sunken)',
                border: '1px solid var(--line)',
                borderRadius: '9999px',
                padding: '3px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 560, padding: '6px 13px', borderRadius: '9999px', color: 'var(--ink3)' }}>
                7D
              </span>
              <span style={{ fontSize: '12px', fontWeight: 560, padding: '6px 13px', borderRadius: '9999px', color: 'var(--ink3)' }}>
                30D
              </span>
              <span style={{ fontSize: '12px', fontWeight: 560, padding: '6px 13px', borderRadius: '9999px', color: 'var(--ink3)' }}>
                90D
              </span>
              <span style={{ fontSize: '12px', fontWeight: 560, padding: '6px 13px', borderRadius: '9999px', color: 'var(--ink3)' }}>
                Season
              </span>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '6px 13px',
                  borderRadius: '9999px',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  boxShadow: 'var(--soft)',
                }}
              >
                All
              </span>
            </div>
          </div>

          {/* today schedule */}
          <div style={{ background: 'var(--surface)', borderRadius: '20px', boxShadow: 'var(--soft)', padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)' }} />
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>Today&apos;s Schedule</span>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '11px',
                    color: '#fff',
                    background: 'var(--accent)',
                    borderRadius: '9999px',
                    padding: '1px 7px',
                  }}
                >
                  1
                </span>
              </div>
              <span style={{ fontSize: '12.5px', color: 'var(--accent700)', fontWeight: 560 }}>Calendar →</span>
            </div>
            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--ink3)' }}>Tuesday, March 10</div>
            <div
              style={{
                marginTop: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--mono)',
                fontSize: '9.5px',
                color: 'var(--ink3)',
                padding: '0 2px',
              }}
            >
              <span>12P</span>
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
              <span>6</span>
              <span>7</span>
              <span>8P</span>
            </div>
            <div
              style={{
                marginTop: '6px',
                position: 'relative',
                height: '108px',
                borderRadius: '14px',
                background: 'var(--sunken)',
                boxShadow: 'inset 0 1px 3px oklch(0.18 0.01 60/0.07)',
                overflow: 'hidden',
                backgroundImage:
                  'repeating-linear-gradient(90deg,transparent 0,transparent calc(12.5% - 1px),var(--line) calc(12.5% - 1px),var(--line) 12.5%)',
              }}
            >
              {/* now line */}
              <div
                style={{
                  position: 'absolute',
                  left: '37.5%',
                  top: 0,
                  bottom: 0,
                  width: '1.5px',
                  background: 'var(--accent)',
                  opacity: 0.55,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '37.5%',
                  top: '6px',
                  transform: 'translateX(-50%)',
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  boxShadow: '0 0 0 4px oklch(0.648 0.149 149.6/0.18)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '37.5%',
                  top: '17px',
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--mono)',
                  fontSize: '8.5px',
                  color: 'var(--accent700)',
                  whiteSpace: 'nowrap',
                }}
              >
                3:00
              </div>
              {/* qualifier review event */}
              <div
                style={{
                  position: 'absolute',
                  left: 'calc(12.5% + 4px)',
                  top: '16px',
                  width: 'calc(18.75% - 8px)',
                  height: '76px',
                  background: 'var(--surface)',
                  borderRadius: '10px',
                  padding: '9px 10px',
                  boxShadow: 'var(--soft)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>Qualifier Review</div>
                <div style={{ fontSize: '9.5px', color: 'var(--ink3)', marginTop: '3px' }}>1:00 – 2:30 PM</div>
                <span
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '10px',
                    fontFamily: 'var(--mono)',
                    fontSize: '8px',
                    letterSpacing: '0.06em',
                    color: 'oklch(0.55 0.1 60)',
                    background: 'oklch(0.72 0.11 60/0.14)',
                    padding: '2px 5px',
                    borderRadius: '4px',
                  }}
                >
                  MEETING
                </span>
              </div>
              {/* team practice event */}
              <div
                style={{
                  position: 'absolute',
                  left: 'calc(50% + 3px)',
                  top: '16px',
                  width: 'calc(25% - 6px)',
                  height: '76px',
                  background: 'var(--surface)',
                  borderRadius: '10px',
                  padding: '9px 11px',
                  boxShadow: '0 3px 6px oklch(0.35 0.08 150/0.16),var(--soft)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>Team Practice</div>
                <div style={{ fontSize: '9.5px', color: 'var(--ink3)', marginTop: '3px' }}>4:00 – 6:00 PM · Range</div>
                <div style={{ position: 'absolute', bottom: '8px', left: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: '8px',
                      letterSpacing: '0.06em',
                      color: 'var(--accent700)',
                      background: 'var(--accent50)',
                      padding: '2px 5px',
                      borderRadius: '4px',
                    }}
                  >
                    PRACTICE
                  </span>
                  <span style={{ fontSize: '8.5px', color: 'var(--ink3)' }}>6/8</span>
                </div>
              </div>
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px' }}>
            <div className="mc">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="mclab">Scoring Avg</span>
                <svg width="52" height="20" viewBox="0 0 52 20">
                  <polyline points="0,14 10,10 18,13 26,6 34,9 44,4 52,7" fill="none" stroke="var(--accent)" strokeWidth={1.6} />
                </svg>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '34px', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  70.5
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent700)' }}>↓ 1.2</span>
              </div>
              <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>last 5 rounds</span>
            </div>
            <div className="mc">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="mclab">GIR %</span>
                <svg width="52" height="20" viewBox="0 0 52 20">
                  <polyline points="0,12 10,14 18,8 26,11 34,6 44,9 52,5" fill="none" stroke="var(--accent)" strokeWidth={1.6} />
                </svg>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '34px', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  57<span style={{ fontSize: '18px', color: 'var(--ink3)' }}>%</span>
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent700)' }}>↑ 4</span>
              </div>
              <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>last 5 rounds</span>
            </div>
            <div className="mc">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="mclab">Putts / Rd</span>
                <svg width="52" height="20" viewBox="0 0 52 20">
                  <polyline points="0,7 10,10 18,6 26,12 34,9 44,13 52,11" fill="none" stroke="var(--accent)" strokeWidth={1.6} />
                </svg>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '34px', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  31.3
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent700)' }}>↓ 0.6</span>
              </div>
              <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>last 5 rounds</span>
            </div>
            <div className="mc">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="mclab">Roster</span>
                <span
                  style={{
                    display: 'inline-flex',
                    width: '26px',
                    height: '26px',
                    borderRadius: '8px',
                    background: 'oklch(0.85 0.06 285/0.3)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.5 0.13 285)" strokeWidth={2}>
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
                  </svg>
                </span>
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '34px', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                8
              </span>
              <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>1 active qualifier</span>
            </div>
          </div>

          {/* recent rounds + side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 640, color: 'var(--ink)' }}>Recent Rounds</h2>
                <span style={{ fontSize: '12.5px', color: 'var(--accent700)', fontWeight: 560 }}>View all →</span>
              </div>
              <div style={{ height: '1px', width: '100%', background: 'var(--accent300)' }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 1.6fr 0.6fr 0.6fr 0.7fr',
                    gap: '10px',
                    fontFamily: 'var(--mono)',
                    fontSize: '9.5px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--ink3)',
                    padding: '0 6px 8px',
                  }}
                >
                  <span>Player</span>
                  <span>Course</span>
                  <span style={{ textAlign: 'right' }}>Score</span>
                  <span style={{ textAlign: 'right' }}>To Par</span>
                  <span style={{ textAlign: 'right' }}>Date</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 1.6fr 0.6fr 0.6fr 0.7fr',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '9px 6px',
                    borderTop: '1px solid var(--line)',
                    fontSize: '12.5px',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        fontWeight: 600,
                      }}
                    >
                      TP
                    </span>
                    <span style={{ fontWeight: 560, color: 'var(--ink)' }}>Test Player</span>
                  </span>
                  <span style={{ color: 'var(--ink2)' }}>Sea Island – Seaside</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink)' }}>70</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--accent700)' }}>−1</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>Feb 7</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 1.6fr 0.6fr 0.6fr 0.7fr',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '9px 6px',
                    borderTop: '1px solid var(--line)',
                    fontSize: '12.5px',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        fontWeight: 600,
                      }}
                    >
                      TP
                    </span>
                    <span style={{ fontWeight: 560, color: 'var(--ink)' }}>Test Player</span>
                  </span>
                  <span style={{ color: 'var(--ink2)' }}>King &amp; Bear</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink)' }}>66</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--accent700)' }}>−5</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>Feb 5</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 1.6fr 0.6fr 0.6fr 0.7fr',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '9px 6px',
                    borderTop: '1px solid var(--line)',
                    fontSize: '12.5px',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'var(--sunken)',
                        border: '1px solid var(--line)',
                        color: 'var(--ink2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        fontWeight: 600,
                      }}
                    >
                      JM
                    </span>
                    <span style={{ fontWeight: 560, color: 'var(--ink)' }}>J. Marsh</span>
                  </span>
                  <span style={{ color: 'var(--ink2)' }}>Sea Island – Plantation</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink)' }}>73</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink2)' }}>+1</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>Feb 5</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 1.6fr 0.6fr 0.6fr 0.7fr',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '9px 6px',
                    borderTop: '1px solid var(--line)',
                    fontSize: '12.5px',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'var(--sunken)',
                        border: '1px solid var(--line)',
                        color: 'var(--ink2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        fontWeight: 600,
                      }}
                    >
                      RD
                    </span>
                    <span style={{ fontWeight: 560, color: 'var(--ink)' }}>R. Diaz</span>
                  </span>
                  <span style={{ color: 'var(--ink2)' }}>TPC Sawgrass</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink)' }}>74</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink2)' }}>+2</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>Feb 3</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0 }}>
              <div style={{ background: 'var(--surface)', borderRadius: '20px', boxShadow: 'var(--soft)', padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 640, color: 'var(--ink)' }}>Team Pulse</h3>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: '10px',
                      color: '#fff',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                      padding: '2px 8px',
                    }}
                  >
                    6 this week
                  </span>
                </div>
                <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>
                  <div style={{ background: 'var(--sunken)', borderRadius: '12px', padding: '10px' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '20px', fontWeight: 600, color: 'var(--accent700)' }}>5</div>
                    <div style={{ fontSize: '10px', color: 'var(--ink3)', marginTop: '2px' }}>Improving</div>
                  </div>
                  <div style={{ background: 'var(--sunken)', borderRadius: '12px', padding: '10px' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '20px', fontWeight: 600, color: 'var(--ink2)' }}>2</div>
                    <div style={{ fontSize: '10px', color: 'var(--ink3)', marginTop: '2px' }}>Stable</div>
                  </div>
                  <div style={{ background: 'var(--sunken)', borderRadius: '12px', padding: '10px' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '20px', fontWeight: 600, color: 'oklch(0.62 0.13 55)' }}>1</div>
                    <div style={{ fontSize: '10px', color: 'var(--ink3)', marginTop: '2px' }}>Declining</div>
                  </div>
                </div>
              </div>
              <div style={{ background: 'var(--surface)', borderRadius: '20px', boxShadow: 'var(--soft)', padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 640, color: 'var(--ink)' }}>Top Performers</h3>
                  <span style={{ fontSize: '11.5px', color: 'var(--accent700)', fontWeight: 560 }}>Rankings →</span>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--sunken)',
                      borderRadius: '11px',
                      padding: '8px 11px',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <span
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--mono)',
                          fontSize: '10px',
                        }}
                      >
                        1
                      </span>
                      <span style={{ fontSize: '12.5px', fontWeight: 560, color: 'var(--ink)' }}>Test Player</span>
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '12.5px', color: 'var(--ink)' }}>
                      70.5 <span style={{ color: 'var(--ink3)', fontSize: '10px' }}>12 rd</span>
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--sunken)',
                      borderRadius: '11px',
                      padding: '8px 11px',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <span
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: 'var(--surface)',
                          color: 'var(--ink3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--mono)',
                          fontSize: '10px',
                        }}
                      >
                        2
                      </span>
                      <span style={{ fontSize: '12.5px', fontWeight: 560, color: 'var(--ink)' }}>J. Marsh</span>
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '12.5px', color: 'var(--ink)' }}>
                      72.1 <span style={{ color: 'var(--ink3)', fontSize: '10px' }}>9 rd</span>
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--sunken)',
                      borderRadius: '11px',
                      padding: '8px 11px',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <span
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: 'var(--surface)',
                          color: 'var(--ink3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--mono)',
                          fontSize: '10px',
                        }}
                      >
                        3
                      </span>
                      <span style={{ fontSize: '12.5px', fontWeight: 560, color: 'var(--ink)' }}>R. Diaz</span>
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '12.5px', color: 'var(--ink)' }}>
                      73.4 <span style={{ color: 'var(--ink3)', fontSize: '10px' }}>10 rd</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
