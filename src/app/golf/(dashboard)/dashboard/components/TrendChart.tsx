'use client';

/**
 * TrendChart — simple SVG line chart.
 *
 * Previously wrapped recharts (Area/XAxis/YAxis/ResponsiveContainer), which
 * was fragile under React strict mode + Next.js dynamic imports — recharts
 * children rely on context from their parent AreaChart and the render tree
 * was throwing, tripping the Scoring Trend DashboardErrorBoundary.
 *
 * This version is a hand-rolled polyline with no third-party chart deps.
 * Same visual intent (smooth green line, gradient under the curve,
 * hover dots), much simpler, no provider chain to break.
 */

import { useMemo, useState, useId } from 'react';

interface TrendDataPoint {
    label: string;
    value: number;
    secondaryValue?: number;
}

interface TrendChartProps {
    data: TrendDataPoint[];
    title?: string;
    loading?: boolean;
    valueLabel?: string;
    color?: 'green' | 'blue' | 'amber';
    /** For golf, lower is better — invert Y-axis visually so improvements go up. */
    reverse?: boolean;
}

const COLORS = {
    green: { stroke: '#16A34A', fill: '#16A34A' },
    blue: { stroke: '#2563EB', fill: '#2563EB' },
    amber: { stroke: '#D97706', fill: '#D97706' },
} as const;

export function TrendChart({
    data,
    title,
    loading = false,
    valueLabel = 'Score',
    color = 'green',
    reverse = false,
}: TrendChartProps) {
    const uid = useId().replace(/[:]/g, '');
    const theme = COLORS[color];
    const [hover, setHover] = useState<number | null>(null);

    // Filter noise
    const safeData = useMemo(
        () => data.filter((d) => d.value != null && Number.isFinite(d.value)),
        [data]
    );

    // Chart geometry — a fixed viewBox; SVG scales to container.
    const W = 600;
    const H = 200;
    const PAD_X = 12;
    const PAD_Y = 18;

    const { points, domainMin, domainMax } = useMemo(() => {
        if (safeData.length === 0) return { points: [], domainMin: 0, domainMax: 0 };
        const values = safeData.map((d) => d.value);
        const minV = Math.min(...values);
        const maxV = Math.max(...values);
        const range = maxV - minV || 1;
        const dMin = minV - range * 0.1;
        const dMax = maxV + range * 0.05;
        const n = safeData.length;

        const pts = safeData.map((d, i) => {
            const x = n === 1 ? W / 2 : PAD_X + ((W - 2 * PAD_X) * i) / (n - 1);
            const tVal = (d.value - dMin) / (dMax - dMin || 1);
            const yFromBottom = PAD_Y + (H - 2 * PAD_Y) * (1 - tVal);
            const yFromTop = PAD_Y + (H - 2 * PAD_Y) * tVal;
            const y = reverse ? yFromTop : yFromBottom;
            return { x, y, label: d.label, value: d.value };
        });

        return { points: pts, domainMin: dMin, domainMax: dMax };
    }, [safeData, reverse]);

    if (loading) {
        return (
            <div className="h-[160px] sm:h-[180px] md:h-[200px] relative bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-2xl overflow-clip">
                <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
                <div className="relative h-full flex items-center justify-center">
                    <div className="text-center space-y-2">
                        <div className="space-y-2 w-32 mx-auto">
                            <div className="h-3 w-full bg-warm-200 rounded skeleton-shimmer" />
                            <div className="h-3 w-3/4 bg-warm-200 rounded skeleton-shimmer" />
                        </div>
                        <p className="text-sm text-warm-500 font-medium">Loading chart...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (safeData.length === 0) {
        return (
            <div className="h-[160px] sm:h-[180px] md:h-[200px] flex items-center justify-center bg-warm-50/50 rounded-xl border border-warm-100">
                <p className="text-sm leading-relaxed text-warm-400 font-medium">No data available</p>
            </div>
        );
    }

    // Build path strings
    const linePath =
        points.length === 1
            ? `M ${points[0]!.x} ${points[0]!.y}`
            : points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath =
        points.length > 1
            ? `${linePath} L ${points[points.length - 1]!.x} ${H - PAD_Y} L ${points[0]!.x} ${H - PAD_Y} Z`
            : '';

    const gradientId = `trend-grad-${uid}`;
    const hoverPt = hover !== null ? points[hover] : null;

    void valueLabel; // reserved for future tooltip/accessible label use
    void domainMin;
    void domainMax;

    return (
        <div className="w-full">
            {title && <h3 className="text-sm font-medium text-warm-500 mb-4 px-1">{title}</h3>}
            <div className="h-[160px] sm:h-[180px] md:h-[200px] w-full relative">
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    preserveAspectRatio="none"
                    className="w-full h-full overflow-visible"
                    role="img"
                    aria-label="Scoring trend over recent rounds"
                >
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={theme.fill} stopOpacity={0.22} />
                            <stop offset="100%" stopColor={theme.fill} stopOpacity={0} />
                        </linearGradient>
                    </defs>

                    {/* Gridlines — 4 horizontal */}
                    {[0, 1, 2, 3].map((i) => {
                        const y = PAD_Y + ((H - 2 * PAD_Y) * i) / 3;
                        return (
                            <line
                                key={i}
                                x1={PAD_X}
                                x2={W - PAD_X}
                                y1={y}
                                y2={y}
                                stroke="#e7e5e4"
                                strokeDasharray="3 3"
                                strokeWidth={1}
                                opacity={0.5}
                            />
                        );
                    })}

                    {/* Fill under curve */}
                    {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

                    {/* Line */}
                    <path
                        d={linePath}
                        fill="none"
                        stroke={theme.stroke}
                        strokeWidth={3}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />

                    {/* Point dots (always on first and last) */}
                    {points.length > 0 && (
                        <>
                            <circle cx={points[0]!.x} cy={points[0]!.y} r={3.5} fill={theme.stroke} />
                            <circle
                                cx={points[points.length - 1]!.x}
                                cy={points[points.length - 1]!.y}
                                r={3.5}
                                fill={theme.stroke}
                            />
                        </>
                    )}

                    {/* Hover hit-areas (invisible) */}
                    {points.map((p, i) => (
                        <rect
                            key={`hit-${i}`}
                            x={Math.max(0, p.x - 18)}
                            y={0}
                            width={36}
                            height={H}
                            fill="transparent"
                            onMouseEnter={() => setHover(i)}
                            onMouseLeave={() => setHover(null)}
                        />
                    ))}

                    {/* Hover marker */}
                    {hoverPt && (
                        <>
                            <line
                                x1={hoverPt.x}
                                x2={hoverPt.x}
                                y1={PAD_Y}
                                y2={H - PAD_Y}
                                stroke="#94A3B8"
                                strokeDasharray="4 4"
                                strokeWidth={1}
                            />
                            <circle
                                cx={hoverPt.x}
                                cy={hoverPt.y}
                                r={5}
                                fill="#ffffff"
                                stroke={theme.stroke}
                                strokeWidth={2.5}
                            />
                        </>
                    )}
                </svg>

                {/* Tooltip */}
                {hoverPt && (
                    <div
                        className="absolute pointer-events-none -translate-x-1/2 -translate-y-full rounded-lg bg-warm-900 text-white text-xs px-2.5 py-1.5 shadow-lg whitespace-nowrap"
                        style={{
                            left: `${(hoverPt.x / W) * 100}%`,
                            top: `${(hoverPt.y / H) * 100}%`,
                            marginTop: '-8px',
                        }}
                    >
                        <div className="font-semibold">{hoverPt.label}</div>
                        <div className="text-warm-300 tabular-nums">{hoverPt.value}</div>
                    </div>
                )}

                {/* First + last labels along bottom */}
                {points.length > 0 && (
                    <>
                        <span className="absolute left-2 bottom-0 text-[10px] text-warm-400">
                            {points[0]!.label}
                        </span>
                        <span className="absolute right-2 bottom-0 text-[10px] text-warm-400">
                            {points[points.length - 1]!.label}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}
