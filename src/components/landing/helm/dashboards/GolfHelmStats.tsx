export function GolfHelmStats() {
  return (
    <div
      className="st"
      style={{
        width: 1160,
        background: 'var(--canvas)',
        padding: '30px 34px 36px',
        fontFamily: 'var(--sans)',
        color: 'var(--ink)',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div className="lab" style={{ color: 'var(--accent700)' }}>
        Stats
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '20px',
          marginTop: '8px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '30px', fontWeight: 640, letterSpacing: '-0.02em' }}>
            Test Player&apos;s stats
          </h1>
          <p style={{ marginTop: '7px', fontSize: '14px', color: 'var(--ink2)' }}>
            Where Test Player stands vs PGA Tour and the team — and where the strokes are leaking.
          </p>
        </div>
        <span style={{ fontSize: '12px', color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
          ← Team stats
        </span>
      </div>
      <div style={{ marginTop: '16px', borderBottom: '1px solid var(--line)' }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: '12.5px',
            fontWeight: 560,
            color: 'var(--ink)',
            borderBottom: '2px solid var(--accent)',
            padding: '0 2px 9px',
            marginBottom: '-1px',
          }}
        >
          Brief
        </span>
      </div>

      <div style={{ marginTop: '20px', display: 'flex', gap: '18px', alignItems: 'stretch' }}>
        {/* SPINE */}
        <div
          style={{
            flex: 'none',
            width: '290px',
            background: 'linear-gradient(168deg,#1d6440,#123d28)',
            borderRadius: '18px',
            padding: '22px 20px',
            color: '#e9f8ee',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '9.5px',
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              color: '#93d3aa',
            }}
          >
            Strokes Gained
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
            <span className="num" style={{ fontSize: '50px', fontWeight: 600 }}>
              −4.44
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '11.5px', color: '#93d3aa' }}>
              SG / rd
            </span>
          </div>
          <p style={{ marginTop: '10px', fontSize: '12.5px', lineHeight: 1.5, color: '#c2e6cf' }}>
            −4.44 strokes per round vs the field. Leaking most in putting.
          </p>
          <div
            style={{
              marginTop: '16px',
              position: 'relative',
              height: '6px',
              borderRadius: '9999px',
              background: 'rgba(255,255,255,0.15)',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: '38%',
                top: '-1px',
                width: '2px',
                height: '8px',
                background: 'rgba(255,255,255,0.55)',
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: '6%',
                top: '-3px',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 0 0 3px rgba(255,255,255,0.18)',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--mono)',
              fontSize: '9px',
              color: '#93d3aa',
              marginTop: '8px',
            }}
          >
            <span>CB</span>
            <span>Team</span>
            <span>Tour</span>
          </div>
          <div
            style={{
              marginTop: '18px',
              fontFamily: 'var(--mono)',
              fontSize: '9.5px',
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              color: '#93d3aa',
            }}
          >
            Priorities
          </div>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px' }}>
              <span className="num" style={{ color: '#93d3aa' }}>
                01
              </span>
              <span style={{ flex: 1 }}>SG: Putting</span>
              <span className="num">−3.88</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px' }}>
              <span className="num" style={{ color: '#93d3aa' }}>
                02
              </span>
              <span style={{ flex: 1 }}>SG: Approach</span>
              <span className="num">−1.54</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px' }}>
              <span className="num" style={{ color: '#93d3aa' }}>
                03
              </span>
              <span style={{ flex: 1 }}>Three-putts / round</span>
              <span className="num">−1.06</span>
            </div>
          </div>
          <div
            style={{
              marginTop: '16px',
              paddingTop: '14px',
              borderTop: '1px solid rgba(255,255,255,0.13)',
              display: 'flex',
              flexDirection: 'column',
              gap: '9px',
              fontSize: '12.5px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#c2e6cf' }}>Rounds</span>
              <span className="num">15</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#c2e6cf' }}>Fairways</span>
              <span className="num">
                61% <span style={{ color: '#7fe0a0' }}>▲</span>
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#c2e6cf' }}>Greens</span>
              <span className="num">
                65% <span style={{ color: '#f0b466' }}>▼</span>
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#c2e6cf' }}>Putts / rd</span>
              <span className="num">
                32.9 <span style={{ color: '#f0b466' }}>▲</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            style={{
              marginTop: '18px',
              width: '100%',
              fontFamily: 'var(--sans)',
              fontSize: '12.5px',
              fontWeight: 600,
              color: '#123d28',
              background: '#e9f8ee',
              border: 'none',
              padding: '11px',
              borderRadius: '9999px',
              cursor: 'pointer',
            }}
          >
            Ask CoachHelm
          </button>
        </div>

        {/* BENTO */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
          <div className="cell" style={{ gridColumn: '1/3' }}>
            <div className="lab">Core ball striking</div>
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div style={{ paddingRight: '10px' }}>
                <div className="num" style={{ fontSize: '24px', fontWeight: 600 }}>
                  61<span style={{ fontSize: '13px', color: 'var(--ink3)' }}>%</span>
                </div>
                <div className="lab" style={{ marginTop: '4px' }}>
                  Fairways
                </div>
              </div>
              <div style={{ padding: '0 10px', borderLeft: '1px solid var(--line)' }}>
                <div className="num" style={{ fontSize: '24px', fontWeight: 600 }}>
                  65<span style={{ fontSize: '13px', color: 'var(--ink3)' }}>%</span>
                </div>
                <div className="lab" style={{ marginTop: '4px' }}>
                  GIR
                </div>
              </div>
              <div style={{ paddingLeft: '10px', borderLeft: '1px solid var(--line)' }}>
                <div className="num" style={{ fontSize: '24px', fontWeight: 600 }}>
                  34<span style={{ fontSize: '13px', color: 'var(--ink3)' }}>%</span>
                </div>
                <div className="lab" style={{ marginTop: '4px' }}>
                  Scrambling
                </div>
              </div>
            </div>
            <p className="sent" style={{ marginTop: '12px' }}>
              The three conversion rates that shape scoring opportunity.
            </p>
          </div>
          <div className="cell" style={{ gridColumn: '3/5' }}>
            <div className="lab">Per 18 holes</div>
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div style={{ paddingRight: '10px' }}>
                <div className="num" style={{ fontSize: '24px', fontWeight: 600 }}>
                  75.3
                </div>
                <div className="lab" style={{ marginTop: '4px' }}>
                  Score avg
                </div>
              </div>
              <div style={{ padding: '0 10px', borderLeft: '1px solid var(--line)' }}>
                <div className="num" style={{ fontSize: '24px', fontWeight: 600 }}>
                  32.9
                </div>
                <div className="lab" style={{ marginTop: '4px' }}>
                  Putts
                </div>
              </div>
              <div style={{ paddingLeft: '10px', borderLeft: '1px solid var(--line)' }}>
                <div className="num" style={{ fontSize: '24px', fontWeight: 600 }}>
                  2.6
                </div>
                <div className="lab" style={{ marginTop: '4px' }}>
                  Birdies
                </div>
              </div>
            </div>
            <p className="sent" style={{ marginTop: '12px' }}>
              Normalized to a full round so every scorecard compares cleanly.
            </p>
            <span className="arw">→</span>
          </div>

          <div className="cell" style={{ gridColumn: '1/3', gridRow: '2/4' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="lab">Putting</span>
              <span
                className="chip"
                style={{ color: 'oklch(0.5 0.13 55)', background: 'oklch(0.72 0.13 55/0.16)' }}
              >
                Leak
              </span>
            </div>
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '7px' }}>
              <span className="hl" style={{ fontSize: '28px' }}>
                28%
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>5–10 ft</span>
            </div>
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: 'var(--ink2)',
                    marginBottom: '5px',
                  }}
                >
                  <span>0–3 ft</span>
                  <span className="num">97%</span>
                </div>
                <div
                  style={{
                    height: '7px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: '97%',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                    }}
                  />
                </div>
              </div>
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: 'var(--ink2)',
                    marginBottom: '5px',
                  }}
                >
                  <span>5–10 ft</span>
                  <span className="num">28%</span>
                </div>
                <div
                  style={{
                    height: '7px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: '28%',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: '60%',
                      top: '-2px',
                      bottom: '-2px',
                      width: '2px',
                      background: 'var(--ink3)',
                    }}
                  />
                </div>
              </div>
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: 'var(--ink2)',
                    marginBottom: '5px',
                  }}
                >
                  <span>15–20 ft</span>
                  <span className="num">15%</span>
                </div>
                <div
                  style={{
                    height: '7px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: '15%',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: '34%',
                      top: '-2px',
                      bottom: '-2px',
                      width: '2px',
                      background: 'var(--ink3)',
                    }}
                  />
                </div>
              </div>
            </div>
            <p className="sent" style={{ marginTop: '16px' }}>
              Make rate by distance band, vs the PGA Tour tick.
            </p>
            <span className="arw">→</span>
          </div>

          <div className="cell" style={{ gridColumn: '3' }}>
            <div className="lab">Off the tee</div>
            <div style={{ marginTop: '7px', display: 'flex', alignItems: 'baseline', gap: '5px' }}>
              <span className="hl">61%</span>
              <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>fairways</span>
            </div>
            <div style={{ marginTop: '11px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px' }}>
                <span style={{ width: '34px', color: 'var(--ink3)' }}>Fairw</span>
                <span
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      inset: '0 39% 0 0',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                    }}
                  />
                </span>
                <span className="num" style={{ width: '26px', textAlign: 'right', color: 'var(--ink2)' }}>
                  61%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px' }}>
                <span style={{ width: '34px', color: 'var(--ink3)' }}>Par 4</span>
                <span
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      inset: '0 38% 0 0',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                    }}
                  />
                </span>
                <span className="num" style={{ width: '26px', textAlign: 'right', color: 'var(--ink2)' }}>
                  62%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px' }}>
                <span style={{ width: '34px', color: 'var(--ink3)' }}>Par 5</span>
                <span
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      inset: '0 41% 0 0',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                    }}
                  />
                </span>
                <span className="num" style={{ width: '26px', textAlign: 'right', color: 'var(--ink2)' }}>
                  59%
                </span>
              </div>
            </div>
            <span className="arw">→</span>
          </div>
          <div className="cell" style={{ gridColumn: '4' }}>
            <div className="lab">Approach</div>
            <div style={{ marginTop: '7px', display: 'flex', alignItems: 'baseline', gap: '5px' }}>
              <span className="hl">65%</span>
              <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>GIR</span>
            </div>
            <div style={{ marginTop: '11px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px' }}>
                <span style={{ width: '34px', color: 'var(--ink3)' }}>GIR</span>
                <span
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      inset: '0 35% 0 0',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: '72%',
                      top: '-2px',
                      bottom: '-2px',
                      width: '2px',
                      background: 'var(--ink3)',
                    }}
                  />
                </span>
                <span className="num" style={{ width: '26px', textAlign: 'right', color: 'var(--ink2)' }}>
                  65%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px' }}>
                <span style={{ width: '34px', color: 'var(--ink3)' }}>Par 3</span>
                <span
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      inset: '0 38% 0 0',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                    }}
                  />
                </span>
                <span className="num" style={{ width: '26px', textAlign: 'right', color: 'var(--ink2)' }}>
                  62%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px' }}>
                <span style={{ width: '34px', color: 'var(--ink3)' }}>Par 4</span>
                <span
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      inset: '0 39% 0 0',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                    }}
                  />
                </span>
                <span className="num" style={{ width: '26px', textAlign: 'right', color: 'var(--ink2)' }}>
                  61%
                </span>
              </div>
            </div>
            <span className="arw">→</span>
          </div>
          <div className="cell" style={{ gridColumn: '3' }}>
            <div className="lab">Short game</div>
            <div style={{ marginTop: '7px', display: 'flex', alignItems: 'baseline', gap: '5px' }}>
              <span className="hl">34%</span>
              <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>scrambling</span>
            </div>
            <div style={{ marginTop: '11px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px' }}>
                <span style={{ width: '52px', color: 'var(--ink3)' }}>Scrambling</span>
                <span
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      inset: '0 66% 0 0',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                    }}
                  />
                </span>
                <span className="num" style={{ width: '24px', textAlign: 'right', color: 'var(--ink2)' }}>
                  34%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px' }}>
                <span style={{ width: '52px', color: 'var(--ink3)' }}>Sand save</span>
                <span
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      inset: '0 95% 0 0',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                    }}
                  />
                </span>
                <span className="num" style={{ width: '24px', textAlign: 'right', color: 'var(--ink2)' }}>
                  5%
                </span>
              </div>
            </div>
            <p className="sent" style={{ marginTop: '10px' }}>
              Up-and-down and bunker recovery.
            </p>
            <span className="arw">→</span>
          </div>
          <div className="cell" style={{ gridColumn: '4' }}>
            <div className="lab">Scoring</div>
            <div style={{ marginTop: '7px', display: 'flex', alignItems: 'baseline', gap: '5px' }}>
              <span className="hl">+3.50</span>
              <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>/ 18</span>
            </div>
            <div style={{ marginTop: '11px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px' }}>
                <span style={{ width: '34px', color: 'var(--ink3)' }}>Par 3</span>
                <span
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: 0,
                      bottom: 0,
                      width: '18%',
                      background: 'var(--warn)',
                      borderRadius: '9999px',
                    }}
                  />
                </span>
                <span className="num" style={{ width: '32px', textAlign: 'right', color: 'var(--ink2)' }}>
                  +0.41
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px' }}>
                <span style={{ width: '34px', color: 'var(--ink3)' }}>Par 4</span>
                <span
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: 0,
                      bottom: 0,
                      width: '10%',
                      background: 'var(--warn)',
                      borderRadius: '9999px',
                    }}
                  />
                </span>
                <span className="num" style={{ width: '32px', textAlign: 'right', color: 'var(--ink2)' }}>
                  +0.22
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px' }}>
                <span style={{ width: '34px', color: 'var(--ink3)' }}>Par 5</span>
                <span
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '9999px',
                    background: 'var(--sunken)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      right: '50%',
                      top: 0,
                      bottom: 0,
                      width: '5%',
                      background: 'var(--accent)',
                      borderRadius: '9999px',
                    }}
                  />
                </span>
                <span className="num" style={{ width: '32px', textAlign: 'right', color: 'var(--accent700)' }}>
                  −0.09
                </span>
              </div>
            </div>
            <span className="arw">→</span>
          </div>

          <div className="cell" style={{ gridColumn: '1/3' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="lab">Standing</span>
              <span className="chip" style={{ color: 'var(--accent700)', background: 'var(--accent50)' }}>
                Best
              </span>
            </div>
            <div className="hl" style={{ marginTop: '7px', fontSize: '19px' }}>
              SG: Putting
            </div>
            <div
              style={{
                marginTop: '12px',
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
              }}
            >
              <span className="num" style={{ fontSize: '12px', color: 'var(--accent700)', fontWeight: 600 }}>
                −0.42
              </span>
              <span className="lab">SG: Total</span>
            </div>
            <div
              style={{
                marginTop: '6px',
                position: 'relative',
                height: '7px',
                borderRadius: '9999px',
                background: 'var(--sunken)',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '-1px',
                  bottom: '-1px',
                  width: '1.5px',
                  background: 'var(--ink2)',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: '36%',
                  top: '-1px',
                  bottom: '-1px',
                  width: '1.5px',
                  background: 'var(--ink3)',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: '41%',
                  width: '9%',
                  background: 'var(--warn)',
                  borderRadius: '9999px',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '41%',
                  width: '11px',
                  height: '11px',
                  transform: 'translate(-50%,-50%)',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  boxShadow: '0 0 0 2px var(--surface)',
                }}
              />
            </div>
            <div
              style={{
                position: 'relative',
                height: '12px',
                marginTop: '5px',
                fontFamily: 'var(--mono)',
                fontSize: '8.5px',
                color: 'var(--ink3)',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: '41%',
                  transform: 'translateX(-50%)',
                  color: 'var(--accent700)',
                  fontWeight: 600,
                }}
              >
                You
              </span>
              <span style={{ position: 'absolute', left: '36%', transform: 'translateX(-50%)' }}>Team</span>
              <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>Tour</span>
            </div>
            <p className="sent" style={{ marginTop: '10px' }}>
              Strongest in off the tee; leaking most in putting.
            </p>
            <span className="arw">→</span>
          </div>
          <div className="cell" style={{ gridColumn: '3/5' }}>
            <div className="lab">Last 10 rounds</div>
            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'baseline', gap: '5px' }}>
              <span className="num" style={{ fontSize: '20px', fontWeight: 600 }}>
                10
              </span>
              <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>rounds</span>
            </div>
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'flex-end', gap: '8px', height: '70px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span className="num" style={{ fontSize: '8px', color: 'var(--ink3)' }}>
                  75
                </span>
                <span style={{ width: '100%', height: '52%', background: 'oklch(0.82 0.08 150)', borderRadius: '4px 4px 0 0' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span className="num" style={{ fontSize: '8px', color: 'var(--ink3)' }}>
                  75
                </span>
                <span style={{ width: '100%', height: '52%', background: 'oklch(0.82 0.08 150)', borderRadius: '4px 4px 0 0' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span className="num" style={{ fontSize: '8px', color: 'var(--ink3)' }}>
                  75
                </span>
                <span style={{ width: '100%', height: '52%', background: 'oklch(0.82 0.08 150)', borderRadius: '4px 4px 0 0' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span className="num" style={{ fontSize: '8px', color: 'var(--ink3)' }}>
                  78
                </span>
                <span style={{ width: '100%', height: '66%', background: 'oklch(0.62 0.11 150)', borderRadius: '4px 4px 0 0' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span className="num" style={{ fontSize: '8px', color: 'var(--ink3)' }}>
                  74
                </span>
                <span style={{ width: '100%', height: '46%', background: 'oklch(0.82 0.08 150)', borderRadius: '4px 4px 0 0' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span className="num" style={{ fontSize: '8px', color: 'var(--ink3)' }}>
                  69
                </span>
                <span style={{ width: '100%', height: '28%', background: 'var(--accent)', borderRadius: '4px 4px 0 0' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span className="num" style={{ fontSize: '8px', color: 'var(--ink3)' }}>
                  78
                </span>
                <span style={{ width: '100%', height: '66%', background: 'oklch(0.62 0.11 150)', borderRadius: '4px 4px 0 0' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span className="num" style={{ fontSize: '8px', color: 'var(--ink3)' }}>
                  76
                </span>
                <span style={{ width: '100%', height: '56%', background: 'oklch(0.75 0.1 150)', borderRadius: '4px 4px 0 0' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span className="num" style={{ fontSize: '8px', color: 'var(--ink3)' }}>
                  87
                </span>
                <span style={{ width: '100%', height: '92%', background: 'var(--warn)', borderRadius: '4px 4px 0 0' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span className="num" style={{ fontSize: '8px', color: 'var(--ink3)' }}>
                  85
                </span>
                <span style={{ width: '100%', height: '86%', background: 'var(--warn)', borderRadius: '4px 4px 0 0' }} />
              </div>
            </div>
            <p className="sent" style={{ marginTop: '9px' }}>
              Score trend across the most recent rounds.
            </p>
            <span className="arw">→</span>
          </div>
        </div>
      </div>
    </div>
  );
}
