import Image from 'next/image'

export function HelmCoachHelm() {
  return (
    <section
      id="coachhelm"
      style={{ scrollMarginTop: '90px', background: 'var(--dark)', color: 'var(--onacc)' }}
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
        <div data-parallax="22" style={{ maxWidth: '440px' }} data-reveal>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <Image
              src="/helm-golf-logo-transparent.png"
              alt=""
              width={22}
              height={22}
              style={{ width: '22px', height: '22px' }}
            />
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '11.5px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'oklch(0.75 0.13 150)',
              }}
            >
              CoachHelm
            </span>
          </div>
          <h2
            style={{
              margin: '16px 0 0',
              fontSize: 'clamp(1.9rem,3.4vw,2.75rem)',
              lineHeight: 1.06,
              letterSpacing: '-0.02em',
              fontWeight: 600,
              color: 'var(--onacc)',
              textWrap: 'balance',
            }}
          >
            Ask the program. See the evidence.
          </h2>
          <p
            style={{
              margin: '20px 0 0',
              fontSize: 'clamp(1rem,1.3vw,1.12rem)',
              lineHeight: 1.55,
              color: 'oklch(0.8 0.008 85)',
              textWrap: 'pretty',
            }}
          >
            An intelligence layer that reads your program&apos;s own rounds and resolves them into an
            evidence-backed focus — with the sources it used, never a black box.
          </p>
        </div>

        <div
          data-reveal
          data-reveal-delay={120}
          data-seq
          data-parallax="52"
          style={{
            background: 'oklch(0.24 0.006 60)',
            borderRadius: '22px',
            boxShadow:
              '0 2px 4px oklch(0 0 0/0.3),0 24px 60px oklch(0 0 0/0.5),inset 0 1px 0 oklch(1 0 0/0.06)',
            padding: '22px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '11px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'oklch(0.7 0.008 85)',
              }}
            >
              Team · Last 10 rounds
            </div>
            <div style={{ display: 'flex', gap: '6px', fontFamily: 'var(--mono)', fontSize: '10.5px' }}>
              <span
                style={{
                  color: 'oklch(0.75 0.13 150)',
                  background: 'oklch(0.648 0.149 149.6/0.16)',
                  padding: '3px 8px',
                  borderRadius: '9999px',
                }}
              >
                5 improving
              </span>
              <span
                style={{
                  color: 'oklch(0.8 0.09 60)',
                  background: 'oklch(0.7 0.11 60/0.14)',
                  padding: '3px 8px',
                  borderRadius: '9999px',
                }}
              >
                1 declining
              </span>
            </div>
          </div>

          <div
            style={{
              marginTop: '18px',
              fontFamily: 'var(--mono)',
              fontSize: '10px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'oklch(0.62 0.008 85)',
            }}
          >
            Strokes gained by category
          </div>

          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '11px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '96px 1fr 44px',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '12.5px', color: 'oklch(0.86 0.008 85)' }}>Off the tee</span>
              <span
                style={{
                  height: '8px',
                  borderRadius: '9999px',
                  background: 'oklch(1 0 0/0.08)',
                  position: 'relative',
                }}
              >
                <span
                  data-bar
                  data-w="26%"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: 0,
                    bottom: 0,
                    width: '26%',
                    background: 'var(--accent)',
                    borderRadius: '9999px',
                  }}
                />
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'oklch(0.75 0.13 150)', textAlign: 'right' }}>
                +0.3
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '96px 1fr 44px',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '12.5px', color: 'oklch(0.86 0.008 85)' }}>Approach</span>
              <span
                style={{
                  height: '8px',
                  borderRadius: '9999px',
                  background: 'oklch(1 0 0/0.08)',
                  position: 'relative',
                }}
              >
                <span
                  data-bar
                  data-w="32%"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: 0,
                    bottom: 0,
                    width: '32%',
                    background: 'var(--accent)',
                    borderRadius: '9999px',
                  }}
                />
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'oklch(0.75 0.13 150)', textAlign: 'right' }}>
                +0.4
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '96px 1fr 44px',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '12.5px', color: 'oklch(0.86 0.008 85)' }}>Around green</span>
              <span
                style={{
                  height: '8px',
                  borderRadius: '9999px',
                  background: 'oklch(1 0 0/0.08)',
                  position: 'relative',
                }}
              >
                <span
                  data-bar
                  data-w="8%"
                  style={{
                    position: 'absolute',
                    right: '50%',
                    top: 0,
                    bottom: 0,
                    width: '8%',
                    background: 'oklch(0.7 0.02 80)',
                    borderRadius: '9999px',
                  }}
                />
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'oklch(0.72 0.008 85)', textAlign: 'right' }}>
                −0.1
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '96px 1fr 44px',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 10px',
                margin: '-2px -10px',
                borderRadius: '12px',
                background: 'oklch(0.7 0.11 60/0.12)',
                boxShadow: 'inset 0 0 0 1px oklch(0.7 0.11 60/0.4)',
              }}
            >
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--onacc)' }}>Putting</span>
              <span
                style={{
                  height: '8px',
                  borderRadius: '9999px',
                  background: 'oklch(1 0 0/0.08)',
                  position: 'relative',
                }}
              >
                <span
                  data-bar
                  data-w="44%"
                  style={{
                    position: 'absolute',
                    right: '50%',
                    top: 0,
                    bottom: 0,
                    width: '44%',
                    background: 'oklch(0.78 0.13 60)',
                    borderRadius: '9999px',
                  }}
                />
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'oklch(0.82 0.12 60)', textAlign: 'right' }}>
                −0.6
              </span>
            </div>
          </div>

          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid oklch(1 0 0/0.08)' }}>
            <p data-anim style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--onacc)' }}>
              Putting is the leak — the team is losing{' '}
              <span style={{ fontFamily: 'var(--mono)', color: 'oklch(0.82 0.12 60)' }}>~0.6</span> strokes a
              round on the greens, concentrated inside 10 ft.
            </p>
            <div
              data-anim
              style={{
                marginTop: '12px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                fontFamily: 'var(--mono)',
                fontSize: '10px',
                letterSpacing: '0.04em',
              }}
            >
              <span
                style={{
                  color: 'oklch(0.72 0.008 85)',
                  background: 'oklch(1 0 0/0.06)',
                  padding: '4px 9px',
                  borderRadius: '9999px',
                }}
              >
                SOURCE · LAST 10 ROUNDS
              </span>
              <span
                style={{
                  color: 'oklch(0.75 0.13 150)',
                  background: 'oklch(0.648 0.149 149.6/0.16)',
                  padding: '4px 9px',
                  borderRadius: '9999px',
                }}
              >
                CONFIDENCE · HIGH
              </span>
            </div>
            <div data-anim style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span
                style={{
                  flex: 'none',
                  marginTop: '1px',
                  display: 'inline-flex',
                  width: '22px',
                  height: '22px',
                  borderRadius: '7px',
                  background: 'var(--accent)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.4}>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.5, color: 'oklch(0.86 0.008 85)' }}>
                <span style={{ color: 'var(--onacc)', fontWeight: 560 }}>Recommended:</span> add a 15-minute
                lag &amp; short-putt block to Tuesday practice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
