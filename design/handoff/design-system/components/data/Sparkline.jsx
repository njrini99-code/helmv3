import React from 'react';

function monotone(p) {
  const n = p.length;
  if (n < 3) return p.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d[i] = (p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let path = 'M' + p[0][0].toFixed(1) + ' ' + p[0][1].toFixed(1);
  for (let i = 0; i < n - 1; i++) {
    const h = (p[i + 1][0] - p[i][0]) / 3;
    path += ' C' + (p[i][0] + h).toFixed(1) + ' ' + (p[i][1] + m[i] * h).toFixed(1) + ' ' + (p[i + 1][0] - h).toFixed(1) + ' ' + (p[i + 1][1] - m[i + 1] * h).toFixed(1) + ' ' + p[i + 1][0].toFixed(1) + ' ' + p[i + 1][1].toFixed(1);
  }
  return path;
}

const COLORS = { accent: 'var(--green-600)', negative: 'var(--chart-loss)', muted: 'var(--ink-400)', ink: 'var(--ink-900)', inverse: '#F4F1E8' };

export function Sparkline({ data = [], width = 120, height = 32, fluid = false, tone = 'auto', goodWhen = 'up', invert = false, smooth = true, area = true, baseline = null, endDot = true, strokeWidth = 1.75, inset, label, className = '', style }) {
  const ref = React.useRef(null);
  const [mw, setMw] = React.useState(width);
  const uid = (React.useId ? React.useId() : 'sp').replace(/:/g, '');
  React.useEffect(() => {
    if (!fluid || !ref.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => setMw(Math.max(40, Math.round(es[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [fluid]);
  const Wd = fluid ? mw : width, H = height;
  const [pt, pr, pb, pl] = inset || [6, 6, 6, 6];
  let svg = <svg width={Wd} height={H} />;
  let color = COLORS.muted;
  if (data.length) {
    const first = data[0], last = data[data.length - 1];
    const better = goodWhen === 'down' ? last < first : last > first;
    const t = tone !== 'auto' ? tone : last === first ? 'muted' : better ? 'accent' : 'negative';
    color = COLORS[t] || COLORS.accent;
    const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
    const y = (v) => (invert ? pt + ((v - min) / span) * (H - pt - pb) : pt + (1 - (v - min) / span) * (H - pt - pb));
    const pts = data.map((v, i) => [pl + (i * (Wd - pl - pr)) / Math.max(1, data.length - 1), y(v)]);
    const line = smooth ? monotone(pts) : pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    const lp = pts[pts.length - 1];
    const bv = baseline === 'mean' ? data.reduce((s, v) => s + v, 0) / data.length : typeof baseline === 'number' ? baseline : null;
    svg = (
      <svg width={Wd} height={H} viewBox={'0 0 ' + Wd + ' ' + H} className="fw-spark" aria-hidden="true">
        <defs><linearGradient id={'g' + uid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.2" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {area && <path d={line + ' L' + lp[0].toFixed(1) + ' ' + H + ' L' + pts[0][0].toFixed(1) + ' ' + H + ' Z'} fill={'url(#g' + uid + ')'} />}
        {bv != null && <line x1={pl} x2={Wd - pr} y1={y(bv)} y2={y(bv)} stroke="var(--ink-300)" strokeWidth="1" strokeDasharray="2 3" />}
        <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
        {endDot && <circle cx={lp[0]} cy={lp[1]} r="6" fill={color} opacity="0.14" />}
        {endDot && <circle cx={lp[0]} cy={lp[1]} r="3" fill={color} stroke={tone === 'inverse' ? 'transparent' : 'var(--bg-surface)'} strokeWidth="1.75" />}
      </svg>
    );
  }
  if (fluid) return <div ref={ref} className={'fw-spark-wrap ' + className} style={{ width: '100%', height: H, ...style }}>{svg}</div>;
  if (label != null) return <span className={'fw-spark-labeled ' + className} style={style}>{svg}<span className="fw-spark__label" style={{ color }}>{label}</span></span>;
  return svg;
}
