export function HelmShotTracking() {
  return (
    <section
      id="performance"
      style={{
        scrollMarginTop: '90px',
        background: 'linear-gradient(180deg,var(--tint),var(--canvas))',
      }}
    >
      <div
        style={{
          maxWidth: '1320px',
          margin: '0 auto',
          padding: 'clamp(80px,10vw,150px) clamp(20px,4vw,64px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
          gap: 'clamp(36px,5vw,72px)',
          alignItems: 'center',
        }}
      >
        <div data-parallax="20" data-reveal style={{ maxWidth: '460px', order: 2 }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '11.5px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--accent700)',
            }}
          >
            Shot Tracking &amp; Stats
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
            Every shot, in its place.
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
            Shots are logged live on the hole — lie, distance, result — then resolve into strokes
            gained and the miss tendency a coach can actually work on.
          </p>
          <div
            data-reveal
            data-reveal-delay={150}
            style={{
              marginTop: '30px',
              background: 'var(--surface)',
              borderRadius: '20px',
              boxShadow: 'var(--soft)',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                TP
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 620, color: 'var(--ink)' }}>
                  Test Player
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>
                  Senior · Demo University Golf
                </div>
              </div>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '9.5px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink3)',
                }}
              >
                Player detail
              </span>
            </div>
            <div
              style={{
                marginTop: '16px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '10px',
              }}
            >
              <div style={{ background: 'var(--tint)', borderRadius: '12px', padding: '11px' }}>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '9.5px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--ink3)',
                  }}
                >
                  Scoring
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '20px',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    fontVariantNumeric: 'tabular-nums',
                    marginTop: '3px',
                  }}
                >
                  70.5
                </div>
              </div>
              <div style={{ background: 'var(--accent50)', borderRadius: '12px', padding: '11px' }}>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '9.5px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--accent700)',
                  }}
                >
                  SG Total
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '20px',
                    fontWeight: 600,
                    color: 'var(--accent700)',
                    fontVariantNumeric: 'tabular-nums',
                    marginTop: '3px',
                  }}
                >
                  +1.2
                </div>
              </div>
              <div style={{ background: 'var(--tint)', borderRadius: '12px', padding: '11px' }}>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '9.5px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--ink3)',
                  }}
                >
                  GIR
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '20px',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    fontVariantNumeric: 'tabular-nums',
                    marginTop: '3px',
                  }}
                >
                  61<span style={{ fontSize: '12px', color: 'var(--ink3)' }}>%</span>
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                background: 'var(--sunken)',
                borderRadius: '12px',
                padding: '11px 14px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '9.5px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--ink3)',
                }}
              >
                Last 6 rounds
              </div>
              <svg width="116" height="26" viewBox="0 0 116 26" style={{ overflow: 'visible' }}>
                <polyline
                  points="0,20 23,16 46,18 69,11 92,12 116,5"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="116" cy="5" r="2.6" fill="var(--accent)" />
              </svg>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent700)' }}>
                ▼ 2.1
              </div>
            </div>
            <div
              style={{
                marginTop: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                background: 'var(--accent50)',
                borderRadius: '12px',
                padding: '10px 13px',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent700)" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="1.6" fill="var(--accent700)" stroke="none" />
              </svg>
              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                <span style={{ fontWeight: 600 }}>Focus</span> · Lag putting, 25–40 ft
              </span>
            </div>
          </div>
        </div>
        <div
          data-reveal
          data-reveal-delay={120}
          data-seq
          style={{
            order: 1,
            justifySelf: 'center',
            width: '100%',
            maxWidth: '380px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '20px',
              boxShadow: 'var(--soft)',
              padding: '18px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <span style={{ fontSize: '15px', fontWeight: 640, color: 'var(--ink)' }}>Hole 7</span>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '10.5px',
                    color: 'var(--accent700)',
                    background: 'var(--accent50)',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                  }}
                >
                  PAR 4
                </span>
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '12px',
                  color: 'var(--ink3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                412 yd
              </div>
            </div>
            <div
              style={{
                marginTop: '12px',
                borderRadius: '14px',
                overflow: 'hidden',
                background:
                  'radial-gradient(120% 130% at 50% 30%,oklch(0.86 0.085 142),oklch(0.75 0.105 147))',
                aspectRatio: '8/3',
                position: 'relative',
              }}
            >
              <svg
                viewBox="0 0 320 120"
                preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              >
                <line
                  x1="24"
                  y1="60"
                  x2="292"
                  y2="60"
                  stroke="#2e9b63"
                  strokeOpacity="0.55"
                  strokeWidth="30"
                  strokeLinecap="round"
                />
                <ellipse cx="292" cy="60" rx="17" ry="24" fill="oklch(0.72 0.14 150)" />
                <circle cx="292" cy="60" r="3" fill="oklch(0.2 0.02 150)" />
                <path
                  d="M24 60 L120 46 L210 70 L266 58"
                  fill="none"
                  stroke="oklch(1 0 0/0.5)"
                  strokeWidth="1.4"
                  strokeDasharray="3 3"
                />
                <circle cx="24" cy="60" r="3.2" fill="#d8c79e" />
                <circle
                  data-fade
                  cx="120"
                  cy="46"
                  r="3.4"
                  fill="#fff"
                  stroke="oklch(0.4 0.03 150/0.5)"
                  strokeWidth="0.8"
                />
                <circle
                  data-fade
                  cx="210"
                  cy="70"
                  r="3.4"
                  fill="#fff"
                  stroke="oklch(0.4 0.03 150/0.5)"
                  strokeWidth="0.8"
                />
                <circle
                  data-fade
                  cx="266"
                  cy="58"
                  r="4.4"
                  fill="oklch(0.648 0.149 149.6)"
                  stroke="#fff"
                  strokeWidth="1.4"
                />
              </svg>
            </div>
            <div
              style={{
                marginTop: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: '13px', color: 'var(--ink)' }}>
                <span style={{ fontWeight: 600 }}>Shot 3</span> · Approach
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '12.5px',
                  color: 'var(--ink2)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                168 yd in
              </div>
            </div>
          </div>
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '20px',
              boxShadow: 'var(--soft)',
              padding: '18px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ink3)',
              }}
            >
              Result of shot
            </div>
            <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
              <span
                style={{
                  fontSize: '12.5px',
                  color: 'var(--ink2)',
                  background: 'var(--sunken)',
                  padding: '8px 13px',
                  borderRadius: '9999px',
                }}
              >
                Fairway
              </span>
              <span
                style={{
                  fontSize: '12.5px',
                  color: 'var(--ink2)',
                  background: 'var(--sunken)',
                  padding: '8px 13px',
                  borderRadius: '9999px',
                }}
              >
                Rough
              </span>
              <span
                style={{
                  fontSize: '12.5px',
                  color: 'var(--ink2)',
                  background: 'var(--sunken)',
                  padding: '8px 13px',
                  borderRadius: '9999px',
                }}
              >
                Sand
              </span>
              <span
                data-anim
                style={{
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#fff',
                  background: 'var(--accent)',
                  padding: '8px 13px',
                  borderRadius: '9999px',
                  boxShadow: '0 2px 6px oklch(0.35 0.08 150/0.3)',
                }}
              >
                Green
              </span>
              <span
                style={{
                  fontSize: '12.5px',
                  color: 'var(--ink2)',
                  background: 'var(--sunken)',
                  padding: '8px 13px',
                  borderRadius: '9999px',
                }}
              >
                Hole
              </span>
            </div>
            <div
              style={{
                marginTop: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--sunken)',
                borderRadius: '12px',
                padding: '11px 14px',
              }}
            >
              <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Proximity to hole</span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                18 ft
              </span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div style={{ background: 'var(--accent50)', borderRadius: '14px', padding: '12px' }}>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '9.5px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--accent700)',
                }}
              >
                SG · App
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--accent700)',
                  fontVariantNumeric: 'tabular-nums',
                  marginTop: '3px',
                }}
              >
                +0.4
              </div>
            </div>
            <div
              style={{
                background: 'var(--surface)',
                boxShadow: 'var(--soft)',
                borderRadius: '14px',
                padding: '12px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '9.5px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--ink3)',
                }}
              >
                GIR
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  fontVariantNumeric: 'tabular-nums',
                  marginTop: '3px',
                }}
              >
                57<span style={{ fontSize: '12px', color: 'var(--ink3)' }}>%</span>
              </div>
            </div>
            <div
              style={{
                background: 'var(--surface)',
                boxShadow: 'var(--soft)',
                borderRadius: '14px',
                padding: '12px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '9.5px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--ink3)',
                }}
              >
                Putts
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  fontVariantNumeric: 'tabular-nums',
                  marginTop: '3px',
                }}
              >
                31.3
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
