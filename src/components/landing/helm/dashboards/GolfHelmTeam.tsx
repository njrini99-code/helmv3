export function GolfHelmTeam() {
  return (
    <div
      className="tm"
      style={{
        width: 1180,
        background: 'var(--canvas)',
        padding: '28px 32px 34px',
        display: 'flex',
        gap: '18px',
        alignItems: 'flex-start',
      }}
    >
      {/* MAIN */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' }}>
          <div>
            <div className="lab" style={{ color: 'var(--accent700)' }}>Team Management</div>
            <h1 style={{ marginTop: '8px', fontSize: '27px', fontWeight: 640, letterSpacing: '-0.02em' }}>Team Roster</h1>
            <p style={{ marginTop: '6px', fontSize: '13px', color: 'var(--ink2)' }}>Demo University Golf · Spring season · 8 players</p>
          </div>
          <div style={{ display: 'flex', gap: '9px', flex: 'none' }}>
            <button
              type="button"
              style={{
                fontFamily: 'var(--sans)',
                fontSize: '12px',
                fontWeight: 560,
                color: 'var(--ink)',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                padding: '9px 14px',
                borderRadius: '9999px',
                cursor: 'pointer',
              }}
            >
              Message team
            </button>
            <button
              type="button"
              style={{
                fontFamily: 'var(--sans)',
                fontSize: '12px',
                fontWeight: 600,
                color: '#fff',
                background: 'var(--accent)',
                border: 'none',
                padding: '9px 15px',
                borderRadius: '9999px',
                cursor: 'pointer',
              }}
            >
              + Add player
            </button>
          </div>
        </div>

        <div className="card" style={{ marginTop: '18px', padding: '4px 14px 12px' }}>
          <div className="row" style={{ borderTop: 'none', paddingBottom: '6px' }}>
            <span className="lab">Player</span>
            <span className="lab">Status</span>
            <span className="lab" style={{ textAlign: 'right' }}>Rds</span>
            <span className="lab">Scoring avg</span>
            <span className="lab" style={{ textAlign: 'right' }}>SG</span>
            <span className="lab">Focus</span>
          </div>

          <div className="row">
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <span className="av" style={{ background: 'var(--accent)', color: '#fff' }}>TP</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 560 }}>Test Player</span>
                <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>Sr · Atlanta, GA</span>
              </span>
            </span>
            <span><span className="pill" style={{ color: 'var(--accent700)', background: 'var(--accent50)' }}>Active</span></span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--ink2)' }}>15</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span className="num" style={{ fontSize: '13.5px' }}>70.5</span>
              <svg width="42" height="15" viewBox="0 0 42 15" style={{ overflow: 'visible' }}>
                <polyline points="0,11 10,8 21,9 31,5 42,3" fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeLinecap="round" />
              </svg>
            </span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--accent700)' }}>+1.2</span>
            <span style={{ fontSize: '11px', color: 'var(--ink2)' }}>Lag putting</span>
          </div>

          <div className="row">
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <span className="av" style={{ background: 'var(--sunken)', color: 'var(--ink2)' }}>JM</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 560 }}>J. Marsh</span>
                <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>Jr · Dallas, TX</span>
              </span>
            </span>
            <span><span className="pill" style={{ color: 'var(--accent700)', background: 'var(--accent50)' }}>Available</span></span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--ink2)' }}>12</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span className="num" style={{ fontSize: '13.5px' }}>72.1</span>
              <svg width="42" height="15" viewBox="0 0 42 15" style={{ overflow: 'visible' }}>
                <polyline points="0,7 10,8 21,6 31,8 42,7" fill="none" stroke="var(--ink3)" strokeWidth={1.6} strokeLinecap="round" />
              </svg>
            </span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--ink2)' }}>+0.4</span>
            <span style={{ fontSize: '11px', color: 'var(--ink2)' }}>Wedges 100–125</span>
          </div>

          <div className="row">
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <span className="av" style={{ background: 'var(--sunken)', color: 'var(--ink2)' }}>RD</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 560 }}>R. Diaz</span>
                <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>So · Phoenix, AZ</span>
              </span>
            </span>
            <span><span className="pill" style={{ color: 'var(--accent700)', background: 'var(--accent50)' }}>Available</span></span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--ink2)' }}>14</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span className="num" style={{ fontSize: '13.5px' }}>73.4</span>
              <svg width="42" height="15" viewBox="0 0 42 15" style={{ overflow: 'visible' }}>
                <polyline points="0,12 10,10 21,8 31,6 42,4" fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeLinecap="round" />
              </svg>
            </span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--ink2)' }}>−0.2</span>
            <span style={{ fontSize: '11px', color: 'var(--ink2)' }}>Driving accuracy</span>
          </div>

          <div className="row">
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <span className="av" style={{ background: 'var(--sunken)', color: 'var(--ink2)' }}>AW</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 560 }}>A. Wells</span>
                <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>Sr · Columbus, OH</span>
              </span>
            </span>
            <span><span className="pill" style={{ color: 'var(--ink2)', background: 'var(--sunken)' }}>Traveling</span></span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--ink2)' }}>11</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span className="num" style={{ fontSize: '13.5px' }}>72.8</span>
              <svg width="42" height="15" viewBox="0 0 42 15" style={{ overflow: 'visible' }}>
                <polyline points="0,5 10,7 21,6 31,10 42,12" fill="none" stroke="var(--warn)" strokeWidth={1.6} strokeLinecap="round" />
              </svg>
            </span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--ink2)' }}>−0.6</span>
            <span style={{ fontSize: '11px', color: 'var(--ink2)' }}>Course mgmt</span>
          </div>

          <div className="row">
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <span className="av" style={{ background: 'var(--sunken)', color: 'var(--ink2)' }}>CB</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 560 }}>C. Boyd</span>
                <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>Fr · Tampa, FL</span>
              </span>
            </span>
            <span><span className="pill" style={{ color: 'var(--accent700)', background: 'var(--accent50)' }}>Available</span></span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--ink2)' }}>9</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span className="num" style={{ fontSize: '13.5px' }}>74.9</span>
              <svg width="42" height="15" viewBox="0 0 42 15" style={{ overflow: 'visible' }}>
                <polyline points="0,12 10,11 21,8 31,6 42,4" fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeLinecap="round" />
              </svg>
            </span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--ink2)' }}>−1.1</span>
            <span style={{ fontSize: '11px', color: 'var(--ink2)' }}>Bunker play</span>
          </div>

          <div className="row">
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <span className="av" style={{ background: 'var(--sunken)', color: 'var(--ink2)' }}>DK</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 560 }}>D. Kim</span>
                <span style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>Jr · Seattle, WA</span>
              </span>
            </span>
            <span><span className="pill" style={{ color: 'oklch(0.5 0.13 55)', background: 'oklch(0.72 0.13 55/0.16)' }}>Injured</span></span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--ink2)' }}>7</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span className="num" style={{ fontSize: '13.5px' }}>75.6</span>
              <svg width="42" height="15" viewBox="0 0 42 15" style={{ overflow: 'visible' }}>
                <polyline points="0,7 10,7 21,8 31,7 42,8" fill="none" stroke="var(--ink3)" strokeWidth={1.6} strokeLinecap="round" />
              </svg>
            </span>
            <span className="num" style={{ textAlign: 'right', color: 'var(--ink2)' }}>−1.8</span>
            <span style={{ fontSize: '11px', color: 'var(--ink2)' }}>Return plan</span>
          </div>
        </div>

        {/* PROGRAM FEATURES */}
        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
          <div className="card" style={{ padding: '15px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="ico">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent700)" strokeWidth={2}>
                  <path d="M2 16l20-6-9 12-2-5-9-1z" />
                </svg>
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Travel itinerary</span>
            </div>
            <div style={{ marginTop: '11px', fontSize: '12.5px', fontWeight: 560 }}>Sea Island Invitational</div>
            <div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--ink3)', lineHeight: 1.5 }}>
              Depart Fri 7:00 AM · 2 nights<br />6 players · van + lodging booked
            </div>
            <span className="pill" style={{ display: 'inline-block', marginTop: '10px', color: 'var(--accent700)', background: 'var(--accent50)' }}>Confirmed</span>
          </div>

          <div className="card" style={{ padding: '15px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="ico">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent700)" strokeWidth={2}>
                  <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
                  <path d="M20 18v3H6.5A2.5 2.5 0 0 1 4 18.5" />
                </svg>
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Class schedules</span>
            </div>
            <div style={{ marginTop: '11px', fontSize: '12.5px', fontWeight: 560 }}>2 conflicts this week</div>
            <div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--ink3)', lineHeight: 1.5 }}>
              R. Diaz · AM lab vs practice<br />C. Boyd · Thu exam — excused
            </div>
            <span className="pill" style={{ display: 'inline-block', marginTop: '10px', color: 'oklch(0.5 0.13 55)', background: 'oklch(0.72 0.13 55/0.16)' }}>Auto-flagged</span>
          </div>

          <div className="card" style={{ padding: '15px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="ico">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent700)" strokeWidth={2}>
                  <path d="M3 11l14-6v14L3 13zM17 8a3 3 0 0 1 0 8" />
                </svg>
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Announcements</span>
            </div>
            <div style={{ marginTop: '11px', fontSize: '12.5px', fontWeight: 560 }}>Qualifier pairings posted</div>
            <div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--ink3)', lineHeight: 1.5 }}>
              2h ago · 8 acknowledged<br />&ldquo;Study hall moved to Thursday&rdquo;
            </div>
            <span className="pill" style={{ display: 'inline-block', marginTop: '10px', color: 'var(--accent700)', background: 'var(--accent50)' }}>New</span>
          </div>
        </div>
      </div>

      {/* RAIL */}
      <div style={{ flex: 'none', width: '322px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* LIVE QUALIFIER */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)' }}></span>
              <span style={{ fontSize: '13.5px', fontWeight: 640 }}>Spring Qualifier</span>
            </div>
            <span className="num" style={{ fontSize: '10.5px', color: 'var(--ink3)' }}>R2 of 3 · live</span>
          </div>
          <div style={{ marginTop: '6px' }}>
            <span className="pill" style={{ color: 'var(--accent700)', background: 'var(--accent50)' }}>Top 5 qualify</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto auto', gap: '9px', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: '12px' }}>
              <span className="num" style={{ color: 'var(--ink)' }}>1</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="av" style={{ width: '24px', height: '24px', fontSize: '9px', background: 'var(--accent)', color: '#fff' }}>TP</span>Test Player
              </span>
              <span className="num" style={{ color: 'var(--ink2)' }}>136</span>
              <span className="num" style={{ color: 'var(--accent700)', width: '30px', textAlign: 'right' }}>−6</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto auto', gap: '9px', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: '12px' }}>
              <span className="num" style={{ color: 'var(--ink)' }}>2</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="av" style={{ width: '24px', height: '24px', fontSize: '9px', background: 'var(--sunken)', color: 'var(--ink2)' }}>JM</span>J. Marsh
              </span>
              <span className="num" style={{ color: 'var(--ink2)' }}>140</span>
              <span className="num" style={{ color: 'var(--accent700)', width: '30px', textAlign: 'right' }}>−2</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto auto', gap: '9px', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: '12px', background: 'var(--accent50)', borderRadius: '8px' }}>
              <span className="num" style={{ color: 'var(--accent700)' }}>3▲</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="av" style={{ width: '24px', height: '24px', fontSize: '9px', background: 'var(--sunken)', color: 'var(--ink2)' }}>RD</span>R. Diaz
              </span>
              <span className="num" style={{ color: 'var(--ink2)' }}>141</span>
              <span className="num" style={{ color: 'var(--accent700)', width: '30px', textAlign: 'right' }}>−1</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto auto', gap: '9px', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: '12px' }}>
              <span className="num" style={{ color: 'var(--ink)' }}>4</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="av" style={{ width: '24px', height: '24px', fontSize: '9px', background: 'var(--sunken)', color: 'var(--ink2)' }}>AW</span>A. Wells
              </span>
              <span className="num" style={{ color: 'var(--ink2)' }}>142</span>
              <span className="num" style={{ color: 'var(--ink2)', width: '30px', textAlign: 'right' }}>E</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto auto', gap: '9px', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: '12px' }}>
              <span className="num" style={{ color: 'var(--ink)' }}>5</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="av" style={{ width: '24px', height: '24px', fontSize: '9px', background: 'var(--sunken)', color: 'var(--ink2)' }}>CB</span>C. Boyd
              </span>
              <span className="num" style={{ color: 'var(--ink2)' }}>143</span>
              <span className="num" style={{ color: 'var(--ink2)', width: '30px', textAlign: 'right' }}>+1</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0 2px' }}>
            <span style={{ flex: 1, height: '1px', background: 'repeating-linear-gradient(90deg,var(--accent) 0 5px,transparent 5px 10px)', opacity: 0.55 }}></span>
            <span className="lab" style={{ color: 'var(--accent700)' }}>Cut line</span>
            <span style={{ flex: 1, height: '1px', background: 'repeating-linear-gradient(90deg,var(--accent) 0 5px,transparent 5px 10px)', opacity: 0.55 }}></span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto auto', gap: '9px', alignItems: 'center', padding: '7px 0', fontSize: '12px', opacity: 0.6 }}>
            <span className="num">6</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="av" style={{ width: '24px', height: '24px', fontSize: '9px', background: 'var(--sunken)', color: 'var(--ink2)' }}>DK</span>D. Kim ▼
            </span>
            <span className="num" style={{ color: 'var(--ink2)' }}>143</span>
            <span className="num" style={{ color: 'var(--ink2)', width: '30px', textAlign: 'right' }}>+1</span>
          </div>
        </div>

        {/* DEVELOPMENT PLANS */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 640 }}>Development plans</span>
            <span style={{ fontSize: '11px', color: 'var(--accent700)', fontWeight: 560 }}>All →</span>
          </div>
          <div style={{ marginTop: '13px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ fontWeight: 560 }}>Test Player <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>· Lag putting 25–40 ft</span></span>
                <span className="num" style={{ color: 'var(--accent700)' }}>62%</span>
              </div>
              <div style={{ marginTop: '6px', height: '7px', borderRadius: '9999px', background: 'var(--sunken)', position: 'relative' }}>
                <span style={{ position: 'absolute', inset: '0 38% 0 0', background: 'var(--accent)', borderRadius: '9999px' }}></span>
              </div>
              <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--ink3)' }}>Target 30% make · now 28% · +6 sessions</div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ fontWeight: 560 }}>C. Boyd <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>· Bunker recovery</span></span>
                <span className="num" style={{ color: 'var(--accent700)' }}>40%</span>
              </div>
              <div style={{ marginTop: '6px', height: '7px', borderRadius: '9999px', background: 'var(--sunken)', position: 'relative' }}>
                <span style={{ position: 'absolute', inset: '0 60% 0 0', background: 'var(--accent)', borderRadius: '9999px' }}></span>
              </div>
              <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--ink3)' }}>Sand saves 5% → 20% goal · 4 wks left</div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ fontWeight: 560 }}>R. Diaz <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>· Driving accuracy</span></span>
                <span className="num" style={{ color: 'var(--accent700)' }}>55%</span>
              </div>
              <div style={{ marginTop: '6px', height: '7px', borderRadius: '9999px', background: 'var(--sunken)', position: 'relative' }}>
                <span style={{ position: 'absolute', inset: '0 45% 0 0', background: 'var(--accent)', borderRadius: '9999px' }}></span>
              </div>
              <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--ink3)' }}>Fairways 59% → 68% · on track</div>
            </div>
          </div>
        </div>

        {/* THIS WEEK */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="lab">This week</span>
            <span style={{ fontSize: '11px', color: 'var(--accent700)', fontWeight: 560 }}>Calendar →</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ flex: 'none', width: '34px', textAlign: 'center' }}>
                <span className="num" style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>04</span>
                <span style={{ fontSize: '8.5px', color: 'var(--ink3)', textTransform: 'uppercase' }}>Mon</span>
              </span>
              <span style={{ flex: 1, borderLeft: '2px solid var(--accent)', paddingLeft: '10px' }}>
                <span style={{ display: 'block', fontSize: '12px', fontWeight: 560 }}>Team Practice</span>
                <span style={{ fontSize: '10px', color: 'var(--ink3)' }}>4:00–6:00 PM · Range</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ flex: 'none', width: '34px', textAlign: 'center' }}>
                <span className="num" style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>06</span>
                <span style={{ fontSize: '8.5px', color: 'var(--ink3)', textTransform: 'uppercase' }}>Wed</span>
              </span>
              <span style={{ flex: 1, borderLeft: '2px solid var(--warn)', paddingLeft: '10px' }}>
                <span style={{ display: 'block', fontSize: '12px', fontWeight: 560 }}>Spring Qualifier · R2</span>
                <span style={{ fontSize: '10px', color: 'var(--ink3)' }}>Sea Island · Seaside</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ flex: 'none', width: '34px', textAlign: 'center' }}>
                <span className="num" style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>08</span>
                <span style={{ fontSize: '8.5px', color: 'var(--ink3)', textTransform: 'uppercase' }}>Fri</span>
              </span>
              <span style={{ flex: 1, borderLeft: '2px solid var(--line)', paddingLeft: '10px' }}>
                <span style={{ display: 'block', fontSize: '12px', fontWeight: 560 }}>Team travel</span>
                <span style={{ fontSize: '10px', color: 'var(--ink3)' }}>Depart 7:00 AM</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
