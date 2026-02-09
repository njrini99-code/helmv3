'use client';

import { cn } from '@/lib/utils';

interface ChartDataPoint {
  label: string;
  value: number;
}

interface AdminBarChartProps {
  data: ChartDataPoint[];
  title: string;
  color?: string;
  height?: number;
}

export function AdminBarChart({
  data,
  title,
  color = '#16A34A',
  height = 160,
}: AdminBarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div>
      <h4 className="text-sm font-medium text-warm-500 mb-3">{title}</h4>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const barHeight = (d.value / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
              {/* Tooltip */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-warm-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {d.value}
              </div>
              <div
                className="w-full rounded-t transition-all duration-300 group-hover:opacity-80"
                style={{
                  height: `${Math.max(barHeight, 2)}%`,
                  backgroundColor: color,
                  minHeight: 2,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[10px] text-warm-400 truncate block">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface AdminDonutChartProps {
  data: { label: string; value: number; color: string }[];
  title: string;
  size?: number;
}

export function AdminDonutChart({ data, title, size = 120 }: AdminDonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div>
        <h4 className="text-sm font-medium text-warm-500 mb-3">{title}</h4>
        <p className="text-sm text-warm-400">No data</p>
      </div>
    );
  }

  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div>
      <h4 className="text-sm font-medium text-warm-500 mb-3">{title}</h4>
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
                strokeDashoffset={-currentOffset}
                className="transition-all duration-500"
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
