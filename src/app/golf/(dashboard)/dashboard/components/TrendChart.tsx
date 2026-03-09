'use client';

import { useId } from 'react';
import { m } from 'framer-motion';
import dynamic from 'next/dynamic';

const AreaChart = dynamic(() => import('recharts').then((mod) => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then((mod) => mod.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((mod) => mod.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then((mod) => mod.ResponsiveContainer), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((mod) => mod.CartesianGrid), { ssr: false });

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
    reverse?: boolean; // For golf, lower is better, so sometimes we might want to invert Y axis visually or logic
}

export function TrendChart({
    data,
    title,
    loading,
    valueLabel = 'Score',
    color = 'green',
    reverse = false
}: TrendChartProps) {
    const uid = useId();
    const colors = {
        green: { stroke: '#16A34A', fill: `url(#colorGreen-${uid})`, gradient: '#16A34A' },
        blue: { stroke: '#2563EB', fill: `url(#colorBlue-${uid})`, gradient: '#2563EB' },
        amber: { stroke: '#D97706', fill: `url(#colorAmber-${uid})`, gradient: '#D97706' },
    };

    const currentTheme = colors[color];

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

    if (data.length === 0) {
        return (
            <div className="h-[160px] sm:h-[180px] md:h-[200px] flex items-center justify-center bg-warm-50/50 rounded-xl border border-warm-100">
                <p className="text-sm leading-relaxed text-warm-400 font-medium">No data available</p>
            </div>
        );
    }

    const minValue = Math.min(...data.map(d => d.value));
    const maxValue = Math.max(...data.map(d => d.value));
    const range = maxValue - minValue || 1;
    const domainMin = minValue - range * 0.1;
    const domainMax = maxValue + range * 0.05;

    return (
        <m.div 
            className="w-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
                type: 'spring',
                stiffness: 200,
                damping: 25,
                delay: 0.1
            }}
        >
            {title && (
                <m.h3 
                    className="text-sm font-medium text-warm-500 mb-4 px-1"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    {title}
                </m.h3>
            )}

            {/* Chart - responsive height for mobile */}
            <m.div
                className="h-[160px] sm:h-[180px] md:h-[200px] w-full"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                    type: 'spring',
                    stiffness: 200,
                    damping: 25,
                    delay: 0.3
                }}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 8, right: 8, left: -25, bottom: 0 }}>
                        <defs>
                            <linearGradient id={`colorGreen-${uid}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#16A34A" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id={`colorBlue-${uid}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id={`colorAmber-${uid}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#D97706" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#D97706" stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid vertical={false} stroke="#e7e5e4" strokeDasharray="3 3" opacity={0.5} />

                        <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#78716c' }}
                            interval="preserveStartEnd"
                            dy={10}
                        />

                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#78716c' }}
                            domain={[Math.floor(domainMin), Math.ceil(domainMax)]}
                            reversed={reverse}
                            width={35}
                        />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                border: '1px solid #e7e5e4',
                                borderRadius: '12px',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                                fontSize: '12px',
                                padding: '8px 12px',
                            }}
                            labelStyle={{ color: '#0F172A', fontWeight: 600, marginBottom: '4px' }}
                            cursor={{ stroke: '#94A3B8', strokeWidth: 1, strokeDasharray: '4 4' }}
                            formatter={(value) => [`${value ?? 0}`, valueLabel]}
                        />

                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke={currentTheme.stroke}
                            strokeWidth={3}
                            fillOpacity={1}
                            fill={currentTheme.fill}
                            animationDuration={1500}
                            animationEasing="ease-in-out"
                            isAnimationActive={true}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </m.div>
        </m.div>
    );
}
