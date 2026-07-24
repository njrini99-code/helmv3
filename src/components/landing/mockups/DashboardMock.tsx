import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import { M, monoLabel, num } from './mock-tokens';

/**
 * Handcrafted recreation of the live GolfHelm coach dashboard
 * (/golf/dashboard, FairwayCoachDashboard) for the landing page's reveal
 * scene. Intrinsic width 1280 — scale via <ScaledEmbed>. Pure illustration:
 * no headings, no interactive elements (the parent wraps it in role="img").
 */

const NAV_ITEMS: Array<{ label: string; icon: ReactNode; active?: boolean }> = [
  {
    label: 'Dashboard',
    active: true,
    icon: <path d="M3 10.5L12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  },
  { label: 'CoachHelm AI', icon: <path d="M12 3l2.1 5.4L20 9.3l-4.2 3.7L17 19l-5-3-5 3 1.2-6L4 9.3l5.9-.9z" /> },
  {
    label: 'Roster',
    icon: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5M16 4a3 3 0 0 1 0 6M18 20c0-2-1-3.6-2.5-4.4" />
      </>
    ),
  },
  {
    label: 'Rounds',
    icon: (
      <>
        <path d="M7 21V4l11 3-11 3" />
        <circle cx="7" cy="21" r="0.6" fill="currentColor" />
      </>
    ),
  },
  { label: 'Development', icon: <path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" /> },
  {
    label: 'Calendar',
    icon: (
      <>
        <rect x="3" y="4.5" width="18" height="17" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
  },
  { label: 'Qualifiers', icon: <path d="M5 21V4h11l-1.5 3L16 10H5" /> },
  { label: 'Stats', icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  { label: 'Messages', icon: <path d="M4 5h16v11H8l-4 4z" /> },
];

const ROUNDS: Array<{
  initials: string;
  featured: boolean;
  player: string;
  course: string;
  score: string;
  toPar: string;
  parAccent: boolean;
  date: string;
}> = [
  { initials: 'TP', featured: true, player: 'Test Player', course: 'Sea Island – Seaside', score: '70', toPar: '−1', parAccent: true, date: 'Feb 7' },
  { initials: 'TP', featured: true, player: 'Test Player', course: 'King & Bear', score: '66', toPar: '−5', parAccent: true, date: 'Feb 5' },
  { initials: 'JM', featured: false, player: 'J. Marsh', course: 'Sea Island – Plantation', score: '73', toPar: '+1', parAccent: false, date: 'Feb 5' },
  { initials: 'RD', featured: false, player: 'R. Diaz', course: 'TPC Sawgrass', score: '74', toPar: '+2', parAccent: false, date: 'Feb 3' },
];

const PERFORMERS = [
  { rank: '1', name: 'Test Player', avg: '70.5', rounds: '12 rd', lead: true },
  { rank: '2', name: 'J. Marsh', avg: '72.1', rounds: '9 rd', lead: false },
  { rank: '3', name: 'R. Diaz', avg: '73.4', rounds: '10 rd', lead: false },
];

const navStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  padding: '9px 12px',
  borderRadius: 10,
  fontSize: 13.5,
  color: 'oklch(0.78 0.008 85)',
};

const metricCard: CSSProperties = {
  background: M.surface,
  borderRadius: 20,
  padding: '18px 18px 16px',
  boxShadow: M.softShadow,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

function Spark({ points }: { points: string }) {
  return (
    <svg width="52" height="20" viewBox="0 0 52 20" aria-hidden="true">
      <polyline points={points} fill="none" stroke={M.accent} strokeWidth="1.6" />
    </svg>
  );
}

function Metric({ label, spark, value, delta, sub, valueSuffix }: {
  label: string;
  spark?: string;
  value: string;
  delta?: string;
  sub: string;
  valueSuffix?: string;
}) {
  return (
    <div style={metricCard}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...monoLabel(10.5), letterSpacing: '0.09em' }}>{label}</span>
        {spark ? (
          <Spark points={spark} />
        ) : (
          <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: 8, background: 'oklch(0.85 0.06 285 / 0.3)', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.5 0.13 285)" strokeWidth="2" aria-hidden="true">
              <circle cx="9" cy="8" r="3" />
              <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
            </svg>
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ ...num, fontSize: 34, fontWeight: 600, color: M.ink, letterSpacing: '-0.02em' }}>
          {value}
          {valueSuffix ? <span style={{ fontSize: 18, color: M.ink3 }}>{valueSuffix}</span> : null}
        </span>
        {delta ? <span style={{ ...num, fontSize: 12, color: M.accent700 }}>{delta}</span> : null}
      </div>
      <span style={{ fontSize: 10.5, color: M.ink3 }}>{sub}</span>
    </div>
  );
}

export function DashboardMock() {
  return (
    <div
      className="landing-mock-dashboard"
      style={{ width: 1280, minHeight: 840, display: 'flex', background: M.canvas, fontFamily: M.sans, color: M.ink, WebkitFontSmoothing: 'antialiased', lineHeight: 1.5 }}
    >
      {/* Sidebar */}
      <aside style={{ width: 236, flex: 'none', background: M.dark, color: M.onAccent, display: 'flex', flexDirection: 'column', padding: '18px 14px', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 8px 14px' }}>
          <Image src="/helm-golf-logo-transparent.png" alt="" width={32} height={32} style={{ width: 32, height: 32, objectFit: 'contain', display: 'block' }} />
          <span style={{ fontSize: 17, fontWeight: 680, letterSpacing: '-0.01em' }}>
            Golf<span style={{ color: M.accent300 }}>Helm</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', marginBottom: 6, borderRadius: 12, background: 'oklch(1 0 0 / 0.05)' }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: M.accentDeep, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12.5 }}>DC</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Demo Coach</div>
            <div style={{ fontSize: 11, color: 'oklch(0.72 0.008 85)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: M.accent }} />
              Demo University Golf
            </div>
          </div>
        </div>
        <div style={{ ...monoLabel(9.5, 'oklch(0.6 0.008 85)'), letterSpacing: '0.14em', padding: '8px 10px 4px' }}>Team Management</div>
        {NAV_ITEMS.map((item) => (
          <div
            key={item.label}
            style={item.active ? { ...navStyle, background: 'oklch(0.648 0.149 149.6 / 0.16)', color: M.onAccent } : navStyle}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke={item.active ? '#4ade80' : 'currentColor'} strokeWidth="2" style={{ width: 17, height: 17, flex: 'none', opacity: 0.85 }} aria-hidden="true">
              {item.icon}
            </svg>
            {item.label}
          </div>
        ))}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={navStyle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 17, height: 17, flex: 'none', opacity: 0.85 }} aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7" />
            </svg>
            Settings
          </div>
          <div style={navStyle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 17, height: 17, flex: 'none', opacity: 0.85 }} aria-hidden="true">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
            </svg>
            Sign out
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, padding: '26px 30px 30px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Masthead */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={{ ...monoLabel(10.5), letterSpacing: '0.14em' }}>Coach Dashboard</div>
              <div style={{ margin: '8px 0 0', fontSize: 29, fontWeight: 640, letterSpacing: '-0.02em', color: M.ink }}>Good afternoon, Demo</div>
              <div style={{ marginTop: 7, fontSize: 13.5, color: M.ink2, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: M.accent }} />
                Demo University Golf · 8 players · 1 upcoming event
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 560, color: M.ink, background: M.surface, border: `1px solid ${M.line}`, padding: '9px 15px', borderRadius: 9999 }}>Schedule</div>
              <div style={{ fontSize: 13, fontWeight: 560, color: M.ink, background: M.surface, border: `1px solid ${M.line}`, padding: '9px 15px', borderRadius: 9999 }}>Qualifiers</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: M.accentDeep, padding: '9px 16px', borderRadius: 9999 }}>+ Add Player</div>
            </div>
          </div>
          <div style={{ height: 1, width: '100%', background: M.accent300 }} />

          {/* Window selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ ...monoLabel(10), letterSpacing: '0.1em' }}>Window</span>
            <div style={{ display: 'flex', gap: 2, background: M.sunken, border: `1px solid ${M.line}`, borderRadius: 9999, padding: 3 }}>
              {['7D', '30D', '90D', 'Season'].map((w) => (
                <span key={w} style={{ fontSize: 12, fontWeight: 560, padding: '6px 13px', borderRadius: 9999, color: M.ink3 }}>{w}</span>
              ))}
              <span style={{ fontSize: 12, fontWeight: 600, padding: '6px 13px', borderRadius: 9999, background: M.surface, color: M.ink, boxShadow: M.softShadow }}>All</span>
            </div>
          </div>

          {/* Today's schedule */}
          <div style={{ background: M.surface, borderRadius: 20, boxShadow: M.softShadow, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: M.accent }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: M.ink }}>Today&apos;s Schedule</span>
                <span style={{ ...num, fontSize: 11, color: '#fff', background: M.accentDeep, borderRadius: 9999, padding: '1px 7px' }}>1</span>
              </div>
              <span style={{ fontSize: 12.5, color: M.accent700, fontWeight: 560 }}>Calendar →</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: M.ink3 }}>Tuesday, March 10</div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontFamily: M.mono, fontSize: 9.5, color: M.ink3, padding: '0 2px' }}>
              {['12P', '1', '2', '3', '4', '5', '6', '7', '8P'].map((t) => <span key={t}>{t}</span>)}
            </div>
            <div
              style={{
                marginTop: 6,
                position: 'relative',
                height: 108,
                borderRadius: 14,
                background: M.sunken,
                boxShadow: 'inset 0 1px 3px oklch(0.18 0.01 60 / 0.07)',
                overflow: 'hidden',
                backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent calc(12.5% - 1px), ${M.line} calc(12.5% - 1px), ${M.line} 12.5%)`,
              }}
            >
              <div style={{ position: 'absolute', left: '37.5%', top: 0, bottom: 0, width: 1.5, background: M.accent, opacity: 0.55 }} />
              <div style={{ position: 'absolute', left: '37.5%', top: 6, transform: 'translateX(-50%)', width: 9, height: 9, borderRadius: '50%', background: M.accent, boxShadow: '0 0 0 4px oklch(0.648 0.149 149.6 / 0.18)' }} />
              <div style={{ position: 'absolute', left: '37.5%', top: 17, transform: 'translateX(-50%)', fontFamily: M.mono, fontSize: 8.5, color: M.accent700, whiteSpace: 'nowrap' }}>3:00</div>
              <div style={{ position: 'absolute', left: 'calc(12.5% + 4px)', top: 16, width: 'calc(18.75% - 8px)', height: 76, background: M.surface, borderRadius: 10, padding: '9px 10px', boxShadow: M.softShadow, overflow: 'hidden' }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: M.ink, lineHeight: 1.2 }}>Qualifier Review</div>
                <div style={{ fontSize: 9.5, color: M.ink3, marginTop: 3 }}>1:00 – 2:30 PM</div>
                <span style={{ position: 'absolute', bottom: 8, left: 10, fontFamily: M.mono, fontSize: 8, letterSpacing: '0.06em', color: M.warnDeep, background: 'oklch(0.72 0.11 60 / 0.14)', padding: '2px 5px', borderRadius: 4 }}>MEETING</span>
              </div>
              <div style={{ position: 'absolute', left: 'calc(50% + 3px)', top: 16, width: 'calc(25% - 6px)', height: 76, background: M.surface, borderRadius: 10, padding: '9px 11px', boxShadow: `0 3px 6px oklch(0.35 0.08 150 / 0.16), ${M.softShadow}`, overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: M.ink, lineHeight: 1.2 }}>Team Practice</div>
                <div style={{ fontSize: 9.5, color: M.ink3, marginTop: 3 }}>4:00 – 6:00 PM · Range</div>
                <div style={{ position: 'absolute', bottom: 8, left: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: M.mono, fontSize: 8, letterSpacing: '0.06em', color: M.accent700, background: M.accent50, padding: '2px 5px', borderRadius: 4 }}>PRACTICE</span>
                  <span style={{ fontSize: 8.5, color: M.ink3 }}>6/8</span>
                </div>
              </div>
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <Metric label="Scoring Avg" spark="0,14 10,10 18,13 26,6 34,9 44,4 52,7" value="70.5" delta="↓ 1.2" sub="last 5 rounds" />
            <Metric label="GIR %" spark="0,12 10,14 18,8 26,11 34,6 44,9 52,5" value="57" valueSuffix="%" delta="↑ 4" sub="last 5 rounds" />
            <Metric label="Putts / Rd" spark="0,7 10,10 18,6 26,12 34,9 44,13 52,11" value="31.3" delta="↓ 0.6" sub="last 5 rounds" />
            <Metric label="Roster" value="8" sub="1 active qualifier" />
          </div>

          {/* Recent rounds + side rail */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 640, color: M.ink }}>Recent Rounds</div>
                <span style={{ fontSize: 12.5, color: M.accent700, fontWeight: 560 }}>View all →</span>
              </div>
              <div style={{ height: 1, width: '100%', background: M.accent300 }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.6fr 0.6fr 0.6fr 0.7fr', gap: 10, fontFamily: M.mono, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: M.ink3, padding: '0 6px 8px' }}>
                  <span>Player</span><span>Course</span>
                  <span style={{ textAlign: 'right' }}>Score</span>
                  <span style={{ textAlign: 'right' }}>To Par</span>
                  <span style={{ textAlign: 'right' }}>Date</span>
                </div>
                {ROUNDS.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.6fr 0.6fr 0.6fr 0.7fr', gap: 10, alignItems: 'center', padding: '9px 6px', borderTop: `1px solid ${M.line}`, fontSize: 12.5 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 24, height: 24, borderRadius: '50%', background: r.featured ? M.accentDeep : M.sunken, border: r.featured ? 'none' : `1px solid ${M.line}`, color: r.featured ? '#fff' : M.ink2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600 }}>{r.initials}</span>
                      <span style={{ fontWeight: 560, color: M.ink }}>{r.player}</span>
                    </span>
                    <span style={{ color: M.ink2 }}>{r.course}</span>
                    <span style={{ textAlign: 'right', fontFamily: M.mono, color: M.ink }}>{r.score}</span>
                    <span style={{ textAlign: 'right', fontFamily: M.mono, color: r.parAccent ? M.accent700 : M.ink2 }}>{r.toPar}</span>
                    <span style={{ textAlign: 'right', fontFamily: M.mono, color: M.ink3 }}>{r.date}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
              <div style={{ background: M.surface, borderRadius: 20, boxShadow: M.softShadow, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 14, fontWeight: 640, color: M.ink }}>Team Pulse</div>
                  <span style={{ fontFamily: M.mono, fontSize: 10, color: '#fff', background: M.accentDeep, borderRadius: 9999, padding: '2px 8px' }}>6 this week</span>
                </div>
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { n: '5', label: 'Improving', color: M.accent700 },
                    { n: '2', label: 'Stable', color: M.ink2 },
                    { n: '1', label: 'Declining', color: 'oklch(0.62 0.13 55)' },
                  ].map((p) => (
                    <div key={p.label} style={{ background: M.sunken, borderRadius: 12, padding: 10 }}>
                      <div style={{ ...num, fontSize: 20, fontWeight: 600, color: p.color }}>{p.n}</div>
                      <div style={{ fontSize: 10, color: M.ink3, marginTop: 2 }}>{p.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: M.surface, borderRadius: 20, boxShadow: M.softShadow, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 14, fontWeight: 640, color: M.ink }}>Top Performers</div>
                  <span style={{ fontSize: 11.5, color: M.accent700, fontWeight: 560 }}>Rankings →</span>
                </div>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {PERFORMERS.map((p) => (
                    <div key={p.rank} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: M.sunken, borderRadius: 11, padding: '8px 11px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: p.lead ? M.accentDeep : M.surface, color: p.lead ? '#fff' : M.ink3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: M.mono, fontSize: 10 }}>{p.rank}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 560, color: M.ink }}>{p.name}</span>
                      </span>
                      <span style={{ fontFamily: M.mono, fontSize: 12.5, color: M.ink }}>
                        {p.avg} <span style={{ color: M.ink3, fontSize: 10 }}>{p.rounds}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
