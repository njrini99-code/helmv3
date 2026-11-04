import type { ChBenchmarkLadder } from '../../../data/coachhelm-read-view-shape';

/** The track, the loss span, a tick per line and the player's dot (06 ReadLadder). Two labels closer than 76 split apart. */
export function ReadLadder({ ladder, onGreen }: { ladder: ChBenchmarkLadder; onGreen: boolean }) {
  const W = 300;
  const pad = 14;
  const x = (v: number) => pad + ((v - ladder.min) / (ladder.max - ladder.min || 1)) * (W - 2 * pad);
  const ink = onGreen ? 'var(--f-ink)' : 'var(--ink)';
  const ink2 = onGreen ? 'var(--f-ink-2)' : 'var(--ink-2)';
  const track = onGreen ? 'var(--f-track)' : 'var(--track)';
  const loss = onGreen ? 'var(--f-loss)' : 'var(--loss-fill)';
  const xs = [x(ladder.you.value), ...ladder.lines.map((l) => x(l.value))];
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const marks = ladder.lines.map((l) => ({ l, cx: x(l.value), a: 'middle' as 'middle' | 'start' | 'end', tx: x(l.value) })).sort((a, b) => a.cx - b.cx);
  for (const m of marks) m.a = m.cx > W - 60 ? 'end' : m.cx < 60 ? 'start' : 'middle';
  for (let i = 1; i < marks.length; i++) {
    const a = marks[i - 1]!;
    const b = marks[i]!;
    if (b.cx - a.cx < 76) {
      a.a = 'end';
      a.tx = a.cx - 4;
      b.a = 'start';
      b.tx = b.cx + 4;
    }
  }
  const yx = x(ladder.you.value);
  return (
    <svg className="ladder ch-hr-ladder" viewBox={`0 0 ${W} 78`} role="img" aria-label={`${ladder.you.label} ${ladder.you.display}. ${ladder.lines.map((l) => `${l.label} ${l.display}`).join('. ')}.`}>
      <rect x={pad} y="30" width={W - 2 * pad} height="6" rx="3" fill={track} />
      <rect x={lo} y="30" width={hi - lo} height="6" rx="3" fill={loss} opacity=".55" />
      {marks.map((m) => (
        <g key={m.l.label}>
          <line x1={m.cx} x2={m.cx} y1="24" y2="42" stroke={ink2} strokeWidth="2" strokeLinecap="round" />
          <text x={m.tx} y="58" textAnchor={m.a} fontSize="12.5" fill={ink2}>
            {m.l.label}
            <tspan x={m.tx} dy="1.15em" fontWeight="600" fill={ink}>
              {m.l.display}
            </tspan>
          </text>
        </g>
      ))}
      <circle cx={yx} cy="33" r="8" fill={loss} stroke={onGreen ? 'var(--feat)' : 'var(--card)'} strokeWidth="3" />
      <text x={yx} y="14" textAnchor={yx > W - 60 ? 'end' : yx < 60 ? 'start' : 'middle'} fontSize="12.5" fontWeight="600" fill={ink}>
        {ladder.you.label} {ladder.you.display}
      </text>
    </svg>
  );
}
