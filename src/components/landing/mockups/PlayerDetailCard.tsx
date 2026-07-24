import { M, monoLabel, num } from './mock-tokens';

/**
 * The player-detail card that fills the Performance chapter's copy column —
 * avatar, scoring / SG / GIR tiles, last-6-rounds form line, and the focus
 * tag. Fluid width.
 */

export function PlayerDetailCard() {
  return (
    <div style={{ background: M.surface, borderRadius: 20, boxShadow: M.softShadow, padding: 20, fontFamily: M.sans, color: M.ink, lineHeight: 1.5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: '50%', background: M.accentDeep, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14 }}>TP</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 620, color: M.ink }}>Test Player</div>
          <div style={{ fontSize: 11.5, color: M.ink3 }}>Senior · Demo University Golf</div>
        </div>
        <span style={{ ...monoLabel(9.5), letterSpacing: '0.08em' }}>Player detail</span>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div style={{ background: M.tint, borderRadius: 12, padding: 11 }}>
          <div style={{ ...monoLabel(9.5), letterSpacing: '0.06em' }}>Scoring</div>
          <div style={{ ...num, fontSize: 20, fontWeight: 600, color: M.ink, marginTop: 3 }}>70.5</div>
        </div>
        <div style={{ background: M.accent50, borderRadius: 12, padding: 11 }}>
          <div style={{ ...monoLabel(9.5, M.accent700), letterSpacing: '0.06em' }}>SG Total</div>
          <div style={{ ...num, fontSize: 20, fontWeight: 600, color: M.accent700, marginTop: 3 }}>+1.2</div>
        </div>
        <div style={{ background: M.tint, borderRadius: 12, padding: 11 }}>
          <div style={{ ...monoLabel(9.5), letterSpacing: '0.06em' }}>GIR</div>
          <div style={{ ...num, fontSize: 20, fontWeight: 600, color: M.ink, marginTop: 3 }}>
            61<span style={{ fontSize: 12, color: M.ink3 }}>%</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: M.sunken, borderRadius: 12, padding: '11px 14px' }}>
        <div style={{ ...monoLabel(9.5), letterSpacing: '0.06em' }}>Last 6 rounds</div>
        <svg width="116" height="26" viewBox="0 0 116 26" style={{ overflow: 'visible' }} aria-hidden="true">
          <polyline points="0,20 23,16 46,18 69,11 92,12 116,5" fill="none" stroke={M.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="116" cy="5" r="2.6" fill={M.accent} />
        </svg>
        <div style={{ fontFamily: M.mono, fontSize: 11, color: M.accent700 }}>▼ 2.1</div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 9, background: M.accent50, borderRadius: 12, padding: '10px 13px' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={M.accent700} strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="1.6" fill={M.accent700} stroke="none" />
        </svg>
        <span style={{ fontSize: 13, color: M.ink }}>
          <span style={{ fontWeight: 600 }}>Focus</span> · Lag putting, 25–40 ft
        </span>
      </div>
    </div>
  );
}
