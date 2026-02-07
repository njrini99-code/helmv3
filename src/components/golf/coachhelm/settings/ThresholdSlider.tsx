'use client';

import { useId } from 'react';

interface ThresholdSliderProps {
    label: string;
    description: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step: number;
    unit: string;
}

export function ThresholdSlider({
    label,
    description,
    value,
    onChange,
    min,
    max,
    step,
    unit,
}: ThresholdSliderProps) {
    const id = useId();
    const percentage = ((value - min) / (max - min)) * 100;

    // Generate mark values for visual reference
    const marks: number[] = [];
    const range = max - min;
    const interval = range <= 1 ? 0.5 : 1;
    for (let v = min; v <= max; v += interval) {
        marks.push(v);
    }

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <label htmlFor={id} className="text-sm font-medium text-slate-900">
                        {label}
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                </div>
                <div className="text-right">
                    <span className="text-lg font-semibold text-slate-900 tabular-nums">
                        {value.toFixed(1)}
                    </span>
                    <span className="text-sm text-slate-500 ml-1">{unit}</span>
                </div>
            </div>

            {/* Slider track */}
            <div className="relative pt-1">
                <input
                    id={id}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-transparent cursor-pointer appearance-none z-10 relative [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-green-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
                />

                {/* Background Track */}
                <div className="absolute top-1 left-0 right-0 h-2 bg-slate-100 rounded-full" />

                {/* Fill overlay */}
                <div
                    className="absolute top-1 left-0 h-2 bg-green-500 rounded-full pointer-events-none"
                    style={{ width: `${percentage}%` }}
                />
            </div>

            {/* Marks */}
            <div className="flex justify-between px-1">
                {marks.map((mark) => (
                    <span key={mark} className="text-xs text-slate-400">
                        {mark}
                    </span>
                ))}
            </div>
        </div>
    );
}
