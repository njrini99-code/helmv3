import type { CSSProperties, ReactNode } from 'react';
import { M, monoLabel, num } from './mock-tokens';

/**
 * Handcrafted recreation of the team-management surface (roster + program
 * cards + live qualifier rail) for the landing's scroll-assembly scene.
 * Intrinsic width 1180 — scale via <ScaledEmbed>.
 *
 * Every top-level card carries `data-assembly-piece` — TeamSection scatters
 * them off-screen and scrubs them back together as you scroll ("how many
 * pieces go into running a program"). Illustration only (role="img" upstream).
 */

const card: CSSProperties = { background: M.surface, borderRadius: 18, boxShadow: M.cardShadow };
const lab = (color?: string): CSSProperties => monoLabel(9.5, color);
const pill = (color: string, bg: string): CSSProperties => ({
  fontFamily: M.mono,
  fontSize: 9,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  padding: '3px 8px',
  borderRadius: 9999,
  color,
  background: bg,
});
const av = (bg: string, color: string): CSSProperties => ({
  flex: 'none',
  width: 32,
  height: 32,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10.5,
  fontWeight: 600,
  background: bg,
  color,
});
const rowGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2.3fr 1fr 0.7fr 1.3fr 0.6fr 1.3fr',
  gap: 12,
  alignItems: 'center',
  padding: '11px 8px',
  borderTop: `1px solid ${M.lineSolid}`,
};
const ico: CSSProperties = {
  flex: 'none',
  display: 'inline-flex',
  width: 34,
  height: 34,
  borderRadius: 10,
  background: M.accent50,
  alignItems: 'center',
  justifyContent: 'center',
};

interface RosterRow {
  initials: string;
  lead: boolean;
  name: string;
  meta: string;
  status: { label: string; color: string; bg: string };
  rds: string;
  avg: string;
  spark: { points: string; color: string };
  sg: string;
  sgAccent: boolean;
  focus: string;
}

const ROSTER: RosterRow[] = [
  { initials: 'TP', lead: true, name: 'Test Player', meta: 'Sr · Atlanta, GA', status: { label: 'Active', color: M.accent700, bg: M.accent50 }, rds: '15', avg: '70.5', spark: { points: '0,11 10,8 21,9 31,5 42,3', color: M.accent }, sg: '+1.2', sgAccent: true, focus: 'Lag putting' },
  { initials: 'JM', lead: false, name: 'J. Marsh', meta: 'Jr · Dallas, TX', status: { label: 'Available', color: M.accent700, bg: M.accent50 }, rds: '12', avg: '72.1', spark: { points: '0,7 10,8 21,6 31,8 42,7', color: M.ink3 }, sg: '+0.4', sgAccent: false, focus: 'Wedges 100–125' },
  { initials: 'RD', lead: false, name: 'R. Diaz', meta: 'So · Phoenix, AZ', status: { label: 'Available', color: M.accent700, bg: M.accent50 }, rds: '14', avg: '73.4', spark: { points: '0,12 10,10 21,8 31,6 42,4', color: M.accent }, sg: '−0.2', sgAccent: false, focus: 'Driving accuracy' },
  { initials: 'AW', lead: false, name: 'A. Wells', meta: 'Sr · Columbus, OH', status: { label: 'Traveling', color: M.ink2, bg: M.sunkenDeep }, rds: '11', avg: '72.8', spark: { points: '0,5 10,7 21,6 31,10 42,12', color: M.warn }, sg: '−0.6', sgAccent: false, focus: 'Course mgmt' },
  { initials: 'CB', lead: false, name: 'C. Boyd', meta: 'Fr · Tampa, FL', status: { label: 'Available', color: M.accent700, bg: M.accent50 }, rds: '9', avg: '74.9', spark: { points: '0,12 10,11 21,8 31,6 42,4', color: M.accent }, sg: '−1.1', sgAccent: false, focus: 'Bunker play' },
  { initials: 'DK', lead: false, name: 'D. Kim', meta: 'Jr · Seattle, WA', status: { label: 'Injured', color: M.warnDeep, bg: 'oklch(0.72 0.13 55 / 0.16)' }, rds: '7', avg: '75.6', spark: { points: '0,7 10,7 21,8 31,7 42,8', color: M.ink3 }, sg: '−1.8', sgAccent: false, focus: 'Return plan' },
];

const QUALIFIER = [
  { pos: '1', initials: 'TP', lead: true, name: 'Test Player', total: '136', par: '−6', parAccent: true, highlight: false },
  { pos: '2', initials: 'JM', lead: false, name: 'J. Marsh', total: '140', par: '−2', parAccent: true, highlight: false },
  { pos: '3▲', initials: 'RD', lead: false, name: 'R. Diaz', total: '141', par: '−1', parAccent: true, highlight: true },
  { pos: '4', initials: 'AW', lead: false, name: 'A. Wells', total: '142', par: 'E', parAccent: false, highlight: false },
  { pos: '5', initials: 'CB', lead: false, name: 'C. Boyd', total: '143', par: '+1', parAccent: false, highlight: false },
];

const PLANS = [
  { name: 'Test Player', focus: 'Lag putting 25–40 ft', pct: 62, note: 'Target 30% make · now 28% · +6 sessions' },
  { name: 'C. Boyd', focus: 'Bunker recovery', pct: 40, note: 'Sand saves 5% → 20% goal · 4 wks left' },
  { name: 'R. Diaz', focus: 'Driving accuracy', pct: 55, note: 'Fairways 59% → 68% · on track' },
];

const WEEK = [
  { day: '04', dow: 'Mon', title: 'Team Practice', meta: '4:00–6:00 PM · Range', edge: M.accent },
  { day: '06', dow: 'Wed', title: 'Spring Qualifier · R2', meta: 'Sea Island · Seaside', edge: M.warn },
  { day: '08', dow: 'Fri', title: 'Team travel', meta: 'Depart 7:00 AM', edge: M.lineSolid },
];

function ProgramCard({ icon, title, headline, lines, tag }: {
  icon: ReactNode;
  title: string;
  headline: string;
  lines: [string, string];
  tag: { label: string; color: string; bg: string };
}) {
  return (
    <div data-assembly-piece="" style={{ ...card, padding: '15px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={ico}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={M.accent700} strokeWidth="2" aria-hidden="true">{icon}</svg>
        </span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ marginTop: 11, fontSize: 12.5, fontWeight: 560 }}>{headline}</div>
      <div style={{ marginTop: 5, fontSize: 11, color: M.ink3, lineHeight: 1.5 }}>
        {lines[0]}<br />{lines[1]}
      </div>
      <span style={{ ...pill(tag.color, tag.bg), display: 'inline-block', marginTop: 10 }}>{tag.label}</span>
    </div>
  );
}

export function TeamMock() {
  return (
    <div className="landing-mock-team" style={{ width: 1180, background: M.canvas, padding: '28px 32px 34px', display: 'flex', gap: 18, alignItems: 'flex-start', fontFamily: M.sans, color: M.ink, WebkitFontSmoothing: 'antialiased', lineHeight: 1.5 }}>
      {/* Main column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <div style={lab(M.accent700)}>Team Management</div>
            <div style={{ marginTop: 8, fontSize: 27, fontWeight: 640, letterSpacing: '-0.02em' }}>Team Roster</div>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: M.ink2 }}>Demo University Golf · Spring season · 8 players</p>
          </div>
          <div style={{ display: 'flex', gap: 9, flex: 'none' }}>
            <div style={{ fontSize: 12, fontWeight: 560, color: M.ink, background: M.surface, border: `1px solid ${M.lineSolid}`, padding: '9px 14px', borderRadius: 9999 }}>Message team</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: M.accentDeep, padding: '9px 15px', borderRadius: 9999 }}>+ Add player</div>
          </div>
        </div>

        {/* Roster table */}
        <div data-assembly-piece="" style={{ ...card, marginTop: 18, padding: '4px 14px 12px' }}>
          <div style={{ ...rowGrid, borderTop: 'none', paddingBottom: 6 }}>
            <span style={lab()}>Player</span>
            <span style={lab()}>Status</span>
            <span style={{ ...lab(), textAlign: 'right' }}>Rds</span>
            <span style={lab()}>Scoring avg</span>
            <span style={{ ...lab(), textAlign: 'right' }}>SG</span>
            <span style={lab()}>Focus</span>
          </div>
          {ROSTER.map((r) => (
            <div key={r.name} style={rowGrid}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={av(r.lead ? M.accentDeep : M.sunkenDeep, r.lead ? '#fff' : M.ink2)}>{r.initials}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 560 }}>{r.name}</span>
                  <span style={{ fontSize: 10.5, color: M.ink3 }}>{r.meta}</span>
                </span>
              </span>
              <span><span style={pill(r.status.color, r.status.bg)}>{r.status.label}</span></span>
              <span style={{ ...num, textAlign: 'right', color: M.ink2 }}>{r.rds}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ ...num, fontSize: 13.5 }}>{r.avg}</span>
                <svg width="42" height="15" viewBox="0 0 42 15" style={{ overflow: 'visible' }} aria-hidden="true">
                  <polyline points={r.spark.points} fill="none" stroke={r.spark.color} strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <span style={{ ...num, textAlign: 'right', color: r.sgAccent ? M.accent700 : M.ink2 }}>{r.sg}</span>
              <span style={{ fontSize: 11, color: M.ink2 }}>{r.focus}</span>
            </div>
          ))}
        </div>

        {/* Program feature cards */}
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <ProgramCard
            icon={<path d="M2 16l20-6-9 12-2-5-9-1z" />}
            title="Travel itinerary"
            headline="Sea Island Invitational"
            lines={['Depart Fri 7:00 AM · 2 nights', '6 players · van + lodging booked']}
            tag={{ label: 'Confirmed', color: M.accent700, bg: M.accent50 }}
          />
          <ProgramCard
            icon={<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M20 18v3H6.5A2.5 2.5 0 0 1 4 18.5" /></>}
            title="Class schedules"
            headline="2 conflicts this week"
            lines={['R. Diaz · AM lab vs practice', 'C. Boyd · Thu exam — excused']}
            tag={{ label: 'Auto-flagged', color: M.warnDeep, bg: 'oklch(0.72 0.13 55 / 0.16)' }}
          />
          <ProgramCard
            icon={<path d="M3 11l14-6v14L3 13zM17 8a3 3 0 0 1 0 8" />}
            title="Announcements"
            headline="Qualifier pairings posted"
            lines={['2h ago · 8 acknowledged', '“Study hall moved to Thursday”']}
            tag={{ label: 'New', color: M.accent700, bg: M.accent50 }}
          />
        </div>
      </div>

      {/* Rail */}
      <div style={{ flex: 'none', width: 322, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Live qualifier */}
        <div data-assembly-piece="" style={{ ...card, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: M.accent }} />
              <span style={{ fontSize: 13.5, fontWeight: 640 }}>Spring Qualifier</span>
            </div>
            <span style={{ ...num, fontSize: 10.5, color: M.ink3 }}>R2 of 3 · live</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <span style={pill(M.accent700, M.accent50)}>Top 5 qualify</span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column' }}>
            {QUALIFIER.map((q) => (
              <div key={q.pos} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto auto', gap: 9, alignItems: 'center', padding: '7px 0', borderTop: `1px solid ${M.lineSolid}`, fontSize: 12, background: q.highlight ? M.accent50 : undefined, borderRadius: q.highlight ? 8 : undefined }}>
                <span style={{ ...num, color: q.highlight ? M.accent700 : M.ink }}>{q.pos}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...av(q.lead ? M.accentDeep : M.sunkenDeep, q.lead ? '#fff' : M.ink2), width: 24, height: 24, fontSize: 9 }}>{q.initials}</span>
                  {q.name}
                </span>
                <span style={{ ...num, color: M.ink2 }}>{q.total}</span>
                <span style={{ ...num, color: q.parAccent ? M.accent700 : M.ink2, width: 30, textAlign: 'right' }}>{q.par}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 2px' }}>
            <span style={{ flex: 1, height: 1, background: `repeating-linear-gradient(90deg, ${M.accent} 0 5px, transparent 5px 10px)`, opacity: 0.55 }} />
            <span style={lab(M.accent700)}>Cut line</span>
            <span style={{ flex: 1, height: 1, background: `repeating-linear-gradient(90deg, ${M.accent} 0 5px, transparent 5px 10px)`, opacity: 0.55 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto auto', gap: 9, alignItems: 'center', padding: '7px 0', fontSize: 12, opacity: 0.6 }}>
            <span style={num}>6</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...av(M.sunkenDeep, M.ink2), width: 24, height: 24, fontSize: 9 }}>DK</span>
              D. Kim ▼
            </span>
            <span style={{ ...num, color: M.ink2 }}>143</span>
            <span style={{ ...num, color: M.ink2, width: 30, textAlign: 'right' }}>+1</span>
          </div>
        </div>

        {/* Development plans */}
        <div data-assembly-piece="" style={{ ...card, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13.5, fontWeight: 640 }}>Development plans</span>
            <span style={{ fontSize: 11, color: M.accent700, fontWeight: 560 }}>All →</span>
          </div>
          <div style={{ marginTop: 13, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {PLANS.map((p) => (
              <div key={p.name}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ fontWeight: 560 }}>
                    {p.name} <span style={{ color: M.ink3, fontWeight: 400 }}>· {p.focus}</span>
                  </span>
                  <span style={{ ...num, color: M.accent700 }}>{p.pct}%</span>
                </div>
                <div style={{ marginTop: 6, height: 7, borderRadius: 9999, background: M.sunkenDeep, position: 'relative' }}>
                  <span style={{ position: 'absolute', inset: `0 ${100 - p.pct}% 0 0`, background: M.accent, borderRadius: 9999 }} />
                </div>
                <div style={{ marginTop: 4, fontSize: 10, color: M.ink3 }}>{p.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* This week */}
        <div data-assembly-piece="" style={{ ...card, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={lab()}>This week</span>
            <span style={{ fontSize: 11, color: M.accent700, fontWeight: 560 }}>Calendar →</span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {WEEK.map((w) => (
              <div key={w.day} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ flex: 'none', width: 34, textAlign: 'center' }}>
                  <span style={{ ...num, display: 'block', fontSize: 14, fontWeight: 600 }}>{w.day}</span>
                  <span style={{ fontSize: 8.5, color: M.ink3, textTransform: 'uppercase' }}>{w.dow}</span>
                </span>
                <span style={{ flex: 1, borderLeft: `2px solid ${w.edge}`, paddingLeft: 10 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 560 }}>{w.title}</span>
                  <span style={{ fontSize: 10, color: M.ink3 }}>{w.meta}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
