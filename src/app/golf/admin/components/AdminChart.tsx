'use client';

import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback, useId } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChartDataPoint {
  label: string;
  value: number;
}

// ---------------------------------------------------------------------------
// AdminBarChart (upgraded)
// ---------------------------------------------------------------------------

interface AdminBarChartProps {
  data: ChartDataPoint[];
  title: string;
  color?: string;
  height?: number;
  showTooltip?: boolean;
}

export function AdminBarChart({
  data,
  title,
  color = '#16A34A',
  height = 200,
  showTooltip: _showTooltip = true,
}: AdminBarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0);
  const avg = data.length > 0 ? total / data.length : 0;
  const avgPct = (avg / max) * 100;
  const gradientId = useId();

  // Handle sparse data gracefully
  if (data.length < 2) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-label md:text-xs font-medium text-warm-400 uppercase tracking-wider">{title}</h4>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center" style={{ minHeight: height }}>
          <div className="w-10 h-10 rounded-xl bg-warm-100/80 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-warm-600 mb-1">Not enough data</p>
          <p className="text-xs text-warm-400">Need at least 2 data points to display chart</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-label md:text-xs font-medium text-warm-400 uppercase tracking-wider">{title}</h4>
        <span className="text-xs text-warm-500 tabular-nums">{total.toLocaleString()} total</span>
      </div>

      {/* Hidden SVG for gradient definitions */}
      <svg width={0} height={0} className="absolute">
        <defs>
          <linearGradient id={`bar-grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={1} />
            <stop offset="100%" stopColor={color} stopOpacity={0.6} />
          </linearGradient>
        </defs>
      </svg>

      <div className="relative">
        <div className="flex items-end gap-[3px]" style={{ height }}>
          {data.map((d, i) => {
            const barHeight = (d.value / max) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center group relative">
                {/* Tooltip */}
                <div className="absolute -top-9 left-1/2 -tranwarm-x-1/2 bg-warm-900 text-white text-xs px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 shadow-lg">
                  <span className="font-medium">{d.value}</span>
                  <span className="text-warm-300 ml-1">{d.label}</span>
                </div>
                {/* Value label on hover */}
                {d.value > 0 && (
                  <span className="text-[9px] font-medium text-warm-500 tabular-nums mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {d.value}
                  </span>
                )}
                <div
                  className="w-full rounded-t transition-all duration-300 group-hover:brightness-110"
                  style={{
                    height: `${Math.max(barHeight, 3)}%`,
                    background: `url(#bar-grad-${gradientId})`,
                    backgroundColor: color,
                    backgroundImage: `linear-gradient(to bottom, ${color}, ${color}99)`,
                    minHeight: 3,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Dashed average line */}
        {data.length > 1 && avg > 0 && (
          <div
            className="absolute left-0 right-0 border-t-[1.5px] border-dashed pointer-events-none"
            style={{
              borderColor: `${color}66`,
              bottom: `${avgPct}%`,
            }}
          >
            <span
              className="absolute -top-3 right-0 text-[8px] tabular-nums px-1 rounded"
              style={{ color: `${color}cc` }}
            >
              avg {Math.round(avg)}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-[3px] mt-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[9px] text-warm-400 truncate block leading-tight">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminDonutChart (upgraded with animated entry)
// ---------------------------------------------------------------------------

interface AdminDonutChartProps {
  data: { label: string; value: number; color: string }[];
  title: string;
  size?: number;
}

export function AdminDonutChart({ data, title, size = 160 }: AdminDonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  if (total === 0) {
    return (
      <div>
        <h4 className="text-label md:text-xs font-medium text-warm-400 uppercase tracking-wider mb-3">{title}</h4>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-warm-100/80 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-warm-600 mb-1">No data yet</p>
          <p className="text-xs text-warm-400">Data will appear once available</p>
        </div>
      </div>
    );
  }

  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div>
      <h4 className="text-label md:text-xs font-medium text-warm-400 uppercase tracking-wider mb-3">{title}</h4>
      <div className="flex items-center gap-4">
        <svg width={size} height={size} className="shrink-0">
          {data.map((d, i) => {
            const pct = d.value / total;
            const dash = circumference * pct;
            const gap = circumference - dash;
            const currentOffset = offset;
            offset += dash;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={mounted ? -currentOffset : circumference}
                strokeLinecap="butt"
                style={{
                  transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                  transitionDelay: `${i * 80}ms`,
                }}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
          })}
          <text
            x={size / 2}
            y={size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-warm-900 text-lg font-semibold"
          >
            {total}
          </text>
        </svg>
        <div className="flex flex-col gap-1.5 min-w-0">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-warm-600 truncate">{d.label}</span>
              <span className="text-warm-400 tabular-nums ml-auto">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminProgressBar (kept as-is)
// ---------------------------------------------------------------------------

interface AdminProgressBarProps {
  label: string;
  value: number;
  max: number;
  color?: string;
}

export function AdminProgressBar({
  label,
  value,
  max,
  color = '#16A34A',
}: AdminProgressBarProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={cn('text-sm text-warm-600 w-28 truncate shrink-0')}>{label}</span>
      <div className="flex-1 h-2 bg-warm-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-sm text-warm-500 tabular-nums w-12 text-right">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminAreaChart (new)
// ---------------------------------------------------------------------------

interface AdminAreaChartProps {
  data: ChartDataPoint[];
  title: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  gradientId?: string;
  showValues?: boolean;
}

export function AdminAreaChart({
  data,
  title,
  color = '#16A34A',
  height = 200,
  showGrid = true,
  gradientId: gradientIdProp,
  showValues: _showValues = true,
}: AdminAreaChartProps) {
  const autoId = useId();
  const gId = gradientIdProp ?? `area-fill-${autoId}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [svgWidth, setSvgWidth] = useState(300);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSvgWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const total = data.reduce((s, d) => s + d.value, 0);

  const padTop = 16;
  const padBottom = 4;
  const padLeft = 28;
  const padRight = 8;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (data.length === 0) return;
      const cW = svgWidth - 28 - 8;
      const toXFn = (i: number) =>
        28 + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < data.length; i++) {
        const dist = Math.abs(toXFn(i) - mouseX);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      setHoverIndex(closestDist < 40 ? closest : null);
    },
    [data.length, svgWidth],
  );

  // Handle sparse data gracefully
  if (data.length < 2) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-label md:text-xs font-medium text-warm-400 uppercase tracking-wider">{title}</h4>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center" style={{ minHeight: height }}>
          <div className="w-10 h-10 rounded-xl bg-warm-100/80 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-warm-600 mb-1">Not enough data</p>
          <p className="text-xs text-warm-400">
            {data.length === 0 ? 'No data available' : 'Need at least 2 data points to display trend'}
          </p>
        </div>
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const toX = (i: number) =>
    padLeft + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
  const toY = (v: number) => padTop + chartH - ((v - minVal) / range) * chartH;

  const polylinePoints = data.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ');
  const firstValue = data[0]?.value ?? 0;
  const areaPath = [
    `M${toX(0)},${toY(firstValue)}`,
    ...data.slice(1).map((d, i) => `L${toX(i + 1)},${toY(d.value)}`),
    `L${toX(data.length - 1)},${padTop + chartH}`,
    `L${toX(0)},${padTop + chartH}`,
    'Z',
  ].join(' ');

  // Grid lines at quartiles
  const gridValues = [0.25, 0.5, 0.75].map((f) => minVal + range * f);

  // X-axis label interval
  const labelInterval = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-warm-500">{title}</h4>
        <span className="text-xs text-warm-400 tabular-nums">{total.toLocaleString()} total</span>
      </div>

      <div ref={containerRef} className="relative w-full group">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${svgWidth} ${height}`}
          preserveAspectRatio="none"
          className="overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {showGrid &&
            gridValues.map((gv, i) => (
              <line
                key={i}
                x1={padLeft}
                y1={toY(gv)}
                x2={svgWidth - padRight}
                y2={toY(gv)}
                stroke="#F5F5F0"
                strokeWidth={1}
              />
            ))}

          {/* Area fill */}
          <path d={areaPath} fill={`url(#${gId})`} />

          {/* Line */}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Hover dots */}
          {data.map((d, i) => (
            <circle
              key={i}
              cx={toX(i)}
              cy={toY(d.value)}
              r={hoverIndex === i ? 4 : 3}
              fill={hoverIndex === i ? color : 'transparent'}
              stroke={hoverIndex === i ? 'white' : 'transparent'}
              strokeWidth={2}
              className="transition-all duration-150"
            />
          ))}

          {/* Y-axis labels */}
          <text
            x={padLeft - 4}
            y={toY(maxVal)}
            textAnchor="end"
            dominantBaseline="central"
            className="fill-warm-400"
            fontSize={9}
          >
            {maxVal}
          </text>
          <text
            x={padLeft - 4}
            y={toY(minVal)}
            textAnchor="end"
            dominantBaseline="central"
            className="fill-warm-400"
            fontSize={9}
          >
            {minVal}
          </text>

          {/* X-axis labels */}
          {data.map((d, i) => {
            if (i % labelInterval !== 0 && i !== data.length - 1) return null;
            return (
              <text
                key={i}
                x={toX(i)}
                y={height - 1}
                textAnchor="middle"
                className="fill-warm-400"
                fontSize={9}
              >
                {d.label}
              </text>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoverIndex !== null && data[hoverIndex] != null && (
          <div
            className="absolute bg-warm-900 text-white text-xs px-2.5 py-1.5 rounded-lg pointer-events-none z-10 shadow-lg whitespace-nowrap"
            style={{
              left: toX(hoverIndex),
              top: toY(data[hoverIndex].value) - 36,
              transform: 'translateX(-50%)',
            }}
          >
            <span className="font-medium">{data[hoverIndex].value}</span>
            <span className="text-warm-300 ml-1">{data[hoverIndex].label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminSparkline (new)
// ---------------------------------------------------------------------------

interface AdminSparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  showEndDot?: boolean;
}

export function AdminSparkline({
  data,
  color = '#16A34A',
  width = 100,
  height = 40,
  showEndDot = true,
}: AdminSparklineProps) {
  const sparkId = useId();

  // Handle sparse data - need at least 2 points for a meaningful sparkline
  if (data.length < 2) return null;

  const maxVal = Math.max(...data, 1);
  const pad = 2;
  const chartH = height - pad * 2;

  const toX = (i: number) => (i / (data.length - 1)) * width;
  const toY = (v: number) => pad + chartH - (v / maxVal) * chartH;

  const linePoints = data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');

  const firstVal = data[0] ?? 0;
  const lastVal = data[data.length - 1] ?? 0;
  const areaPath = [
    `M${toX(0)},${toY(firstVal)}`,
    ...data.slice(1).map((v, i) => `L${toX(i + 1)},${toY(v)}`),
    `L${toX(data.length - 1)},${height - pad}`,
    `L${toX(0)},${height - pad}`,
    'Z',
  ].join(' ');

  const lastX = toX(data.length - 1);
  const lastY = toY(lastVal);

  return (
    <svg width={width} height={height} className="inline-block align-middle overflow-visible">
      <defs>
        <linearGradient id={`spark-${sparkId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${sparkId})`} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="transition-all duration-300"
      />
      {showEndDot && (
        <circle 
          cx={lastX} 
          cy={lastY} 
          r={3} 
          fill={color}
          className="drop-shadow-sm"
        />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// AdminFunnelChart (new)
// ---------------------------------------------------------------------------

interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

interface AdminFunnelChartProps {
  stages: FunnelStage[];
  height?: number;
}

export function AdminFunnelChart({ stages, height = 200 }: AdminFunnelChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  if (stages.length === 0) {
    return <p className="text-sm text-warm-400">No data</p>;
  }

  const maxValue = (stages[0]?.value) || 1;

  return (
    <div className="flex flex-col" style={{ minHeight: height }}>
      {stages.map((stage, i) => {
        const widthPct = (stage.value / maxValue) * 100;
        const prevStage = stages[i - 1];
        const conversionPct =
          i > 0 && prevStage && prevStage.value > 0
            ? Math.round((stage.value / prevStage.value) * 100)
            : null;

        return (
          <div key={i}>
            {/* Conversion rate label between bars */}
            {conversionPct !== null && (
              <div className="flex items-center gap-2 py-1 pl-2">
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 12 12"
                  className="shrink-0 text-warm-300"
                >
                  <path
                    d="M6 2 L6 10 M3 7 L6 10 L9 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-micro text-warm-400 tabular-nums font-medium">
                  {conversionPct}% conversion
                </span>
              </div>
            )}

            {/* Funnel bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-warm-500 w-24 truncate shrink-0 text-right">
                {stage.label}
              </span>
              <div className="flex-1 h-8 relative">
                <div
                  className="h-full rounded-lg transition-all duration-700 ease-out flex items-center justify-end pr-3"
                  style={{
                    width: mounted ? `${Math.max(widthPct, 8)}%` : '0%',
                    backgroundImage: `linear-gradient(to right, ${stage.color}, ${stage.color}cc)`,
                    transitionDelay: `${i * 100}ms`,
                  }}
                >
                  <span className="text-xs font-medium text-white tabular-nums drop-shadow-sm">
                    {stage.value.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
