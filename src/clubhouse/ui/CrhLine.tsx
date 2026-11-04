/**
 * A scoring line on the lane's cards (classes-roster-home 06 8.2 and 11.2): straight segments, a flat area under them, a dashed mean and
 * a dot on the last point. Lower scores draw higher. Drawn in place, never drawn on. Its card's label carries the figures.
 */
export function CrhLine({ data, width = 320, height = 84, label, meanLabel }: { data: readonly number[]; width?: number; height?: number; label: string; meanLabel?: string }) {
  if (data.length === 0) return null;
  const lo = Math.min(...data) - 0.6;
  const hi = Math.max(...data) + 0.6;
  const pad = 6;
  const at = (v: number) => Math.round(v * 10) / 10;
  const x = (i: number) => (data.length === 1 ? width / 2 : pad + (i / (data.length - 1)) * (width - pad * 2));
  const y = (v: number) => pad + ((v - lo) / (hi - lo || 1)) * (height - pad * 2);
  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${at(x(i))} ${at(y(v))}`).join(' ');
  const area = `${line} L${at(x(data.length - 1))} ${height} L${at(x(0))} ${height} Z`;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const last = data[data.length - 1]!;
  return (
    <svg className="ch-crh-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path className="ch-crh-line__ar" d={area} />
      <line className="ch-crh-line__mean" x1={0} x2={width} y1={y(mean)} y2={y(mean)} />
      {meanLabel && (
        <text className="ch-crh-line__t" x={width} y={y(mean) - 5} textAnchor="end">
          {meanLabel}
        </text>
      )}
      <path className="ch-crh-line__ln" d={line} />
      <circle className="ch-crh-line__pt" cx={x(data.length - 1)} cy={y(last)} r={4} />
    </svg>
  );
}
