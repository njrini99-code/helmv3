import { M, monoLabel } from './mock-tokens';

/**
 * The CoachHelm feature panel — a dark intelligence workspace resolving the
 * team's strokes-gained leak into an evidence-backed recommendation.
 * Fluid width; lives inside the dark #coachhelm section. The parent runs
 * useSequence() over it: [data-bar] bars grow from center, then the insight,
 * trust chips, and recommendation stage in via [data-anim].
 */

interface SgRow {
  label: string;
  value: string;
  width: string;
  side: 'gain' | 'loss';
  leak?: boolean;
}

const SG_ROWS: SgRow[] = [
  { label: 'Off the tee', value: '+0.3', width: '26%', side: 'gain' },
  { label: 'Approach', value: '+0.4', width: '32%', side: 'gain' },
  { label: 'Around green', value: '−0.1', width: '8%', side: 'loss' },
  { label: 'Putting', value: '−0.6', width: '44%', side: 'loss', leak: true },
];

export function CoachHelmPanel() {
  return (
    <div
      style={{
        background: 'linear-gradient(180deg, oklch(0.26 0.006 60), oklch(0.23 0.006 60))',
        borderRadius: 22,
        border: '1px solid oklch(1 0 0 / 0.09)',
        boxShadow:
          'inset 0 1px 0 oklch(1 0 0 / 0.1), 0 2px 4px oklch(0 0 0 / 0.35), 0 20px 44px oklch(0 0 0 / 0.5), 0 46px 100px oklch(0 0 0 / 0.42)',
        padding: 22,
        fontFamily: M.sans,
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ ...monoLabel(11, 'oklch(0.7 0.008 85)'), letterSpacing: '0.08em' }}>Team · Last 10 rounds</div>
        <div style={{ display: 'flex', gap: 6, fontFamily: M.mono, fontSize: 10.5 }}>
          <span style={{ color: 'oklch(0.75 0.13 150)', background: 'oklch(0.648 0.149 149.6 / 0.16)', padding: '3px 8px', borderRadius: 9999 }}>5 improving</span>
          <span style={{ color: 'oklch(0.8 0.09 60)', background: 'oklch(0.7 0.11 60 / 0.14)', padding: '3px 8px', borderRadius: 9999 }}>1 declining</span>
        </div>
      </div>

      <div style={{ marginTop: 18, ...monoLabel(10, 'oklch(0.62 0.008 85)'), letterSpacing: '0.12em' }}>Strokes gained by category</div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 11 }}>
        {SG_ROWS.map((row) => (
          <div
            key={row.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '96px 1fr 44px',
              alignItems: 'center',
              gap: 12,
              ...(row.leak
                ? { padding: '8px 10px', margin: '-2px -10px', borderRadius: 12, background: 'oklch(0.7 0.11 60 / 0.12)', boxShadow: 'inset 0 0 0 1px oklch(0.7 0.11 60 / 0.4)' }
                : {}),
            }}
          >
            <span style={{ fontSize: 12.5, color: row.leak ? M.onAccent : 'oklch(0.86 0.008 85)', fontWeight: row.leak ? 600 : 400 }}>{row.label}</span>
            <span style={{ height: 8, borderRadius: 9999, background: 'oklch(1 0 0 / 0.08)', position: 'relative', display: 'block' }}>
              <span
                data-bar=""
                data-w={row.width}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  width: row.width,
                  borderRadius: 9999,
                  ...(row.side === 'gain'
                    ? { left: '50%', background: M.accent }
                    : { right: '50%', background: row.leak ? 'oklch(0.78 0.13 60)' : 'oklch(0.7 0.02 80)' }),
                }}
              />
            </span>
            <span style={{ fontFamily: M.mono, fontSize: 12, textAlign: 'right', color: row.side === 'gain' ? 'oklch(0.75 0.13 150)' : row.leak ? 'oklch(0.82 0.12 60)' : 'oklch(0.72 0.008 85)' }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid oklch(1 0 0 / 0.08)' }}>
        <p data-anim="" style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: M.onAccent }}>
          Putting is the leak — the team is losing <span style={{ fontFamily: M.mono, color: 'oklch(0.82 0.12 60)' }}>~0.6</span> strokes a round on the greens, concentrated inside 10 ft.
        </p>
        <div data-anim="" style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, fontFamily: M.mono, fontSize: 10, letterSpacing: '0.04em' }}>
          <span style={{ color: 'oklch(0.72 0.008 85)', background: 'oklch(1 0 0 / 0.06)', padding: '4px 9px', borderRadius: 9999 }}>SOURCE · LAST 10 ROUNDS</span>
          <span style={{ color: 'oklch(0.75 0.13 150)', background: 'oklch(0.648 0.149 149.6 / 0.16)', padding: '4px 9px', borderRadius: 9999 }}>CONFIDENCE · HIGH</span>
        </div>
        <div data-anim="" style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ flex: 'none', marginTop: 1, display: 'inline-flex', width: 22, height: 22, borderRadius: 7, background: M.accent, alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'oklch(0.86 0.008 85)' }}>
            <span style={{ color: M.onAccent, fontWeight: 560 }}>Recommended: </span>
            add a 15-minute lag &amp; short-putt block to Tuesday practice.
          </p>
        </div>
      </div>
    </div>
  );
}
