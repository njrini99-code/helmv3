import type { CSSProperties } from 'react';
import { M, monoLabel, num } from './mock-tokens';

/**
 * The Shot Tracking & Stats vertical cockpit — hole flyover with sequenced
 * shot marks ([data-fade]), the resolving result pill ([data-anim]), and the
 * SG / GIR / putts readout. Fluid width, max ~380px in-section.
 */

const cardStyle: CSSProperties = { background: M.surface, borderRadius: 20, boxShadow: M.softShadow, padding: 18 };

const RESULT_PILLS = ['Fairway', 'Rough', 'Sand'] as const;

export function TrackingCockpit() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: M.sans, color: M.ink, lineHeight: 1.5 }}>
      {/* Hole hero */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 15, fontWeight: 640, color: M.ink }}>Hole 7</span>
            <span style={{ fontFamily: M.mono, fontSize: 10.5, color: M.accent700, background: M.accent50, padding: '2px 8px', borderRadius: 9999 }}>PAR 4</span>
          </div>
          <div style={{ ...num, fontSize: 12, color: M.ink3 }}>412 yd</div>
        </div>
        <div style={{ marginTop: 12, borderRadius: 14, overflow: 'hidden', background: 'radial-gradient(120% 130% at 50% 30%, oklch(0.86 0.085 142), oklch(0.75 0.105 147))', aspectRatio: '8 / 3', position: 'relative' }}>
          <svg viewBox="0 0 320 120" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
            <line x1="24" y1="60" x2="292" y2="60" stroke="#2e9b63" strokeOpacity="0.55" strokeWidth="30" strokeLinecap="round" />
            <ellipse cx="292" cy="60" rx="17" ry="24" fill="oklch(0.72 0.14 150)" />
            <circle cx="292" cy="60" r="3" fill="oklch(0.2 0.02 150)" />
            <path d="M24 60 L120 46 L210 70 L266 58" fill="none" stroke="oklch(1 0 0 / 0.5)" strokeWidth="1.4" strokeDasharray="3 3" />
            <circle cx="24" cy="60" r="3.2" fill="#d8c79e" />
            <circle data-fade="" cx="120" cy="46" r="3.4" fill="#fff" stroke="oklch(0.4 0.03 150 / 0.5)" strokeWidth="0.8" />
            <circle data-fade="" cx="210" cy="70" r="3.4" fill="#fff" stroke="oklch(0.4 0.03 150 / 0.5)" strokeWidth="0.8" />
            <circle data-fade="" cx="266" cy="58" r="4.4" fill="oklch(0.648 0.149 149.6)" stroke="#fff" strokeWidth="1.4" />
          </svg>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: M.ink }}>
            <span style={{ fontWeight: 600 }}>Shot 3</span> · Approach
          </div>
          <div style={{ ...num, fontSize: 12.5, color: M.ink2 }}>168 yd in</div>
        </div>
      </div>

      {/* Result entry */}
      <div style={cardStyle}>
        <div style={{ ...monoLabel(10), letterSpacing: '0.1em' }}>Result of shot</div>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {RESULT_PILLS.map((p) => (
            <span key={p} style={{ fontSize: 12.5, color: M.ink2, background: M.sunken, padding: '8px 13px', borderRadius: 9999 }}>{p}</span>
          ))}
          <span data-anim="" style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', background: M.accentDeep, padding: '8px 13px', borderRadius: 9999, boxShadow: '0 2px 6px oklch(0.35 0.08 150 / 0.3)' }}>Green</span>
          <span style={{ fontSize: 12.5, color: M.ink2, background: M.sunken, padding: '8px 13px', borderRadius: 9999 }}>Hole</span>
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: M.sunken, borderRadius: 12, padding: '11px 14px' }}>
          <span style={{ fontSize: 12.5, color: M.ink3 }}>Proximity to hole</span>
          <span style={{ ...num, fontSize: 14, fontWeight: 600, color: M.ink }}>18 ft</span>
        </div>
      </div>

      {/* Readout tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div style={{ background: M.accent50, borderRadius: 14, padding: 12 }}>
          <div style={{ ...monoLabel(9.5, M.accent700), letterSpacing: '0.06em' }}>SG · App</div>
          <div style={{ ...num, fontSize: 20, fontWeight: 600, color: M.accent700, marginTop: 3 }}>+0.4</div>
        </div>
        <div style={{ background: M.surface, boxShadow: M.softShadow, borderRadius: 14, padding: 12 }}>
          <div style={{ ...monoLabel(9.5), letterSpacing: '0.06em' }}>GIR</div>
          <div style={{ ...num, fontSize: 20, fontWeight: 600, color: M.ink, marginTop: 3 }}>
            57<span style={{ fontSize: 12, color: M.ink3 }}>%</span>
          </div>
        </div>
        <div style={{ background: M.surface, boxShadow: M.softShadow, borderRadius: 14, padding: 12 }}>
          <div style={{ ...monoLabel(9.5), letterSpacing: '0.06em' }}>Putts</div>
          <div style={{ ...num, fontSize: 20, fontWeight: 600, color: M.ink, marginTop: 3 }}>31.3</div>
        </div>
      </div>
    </div>
  );
}
