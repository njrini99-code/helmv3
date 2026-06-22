'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Sensitivity = 'aggressive' | 'balanced' | 'conservative';

interface SensitivitySliderProps {
    value: Sensitivity;
    onChange: (value: Sensitivity) => void;
}

const OPTIONS: { value: Sensitivity; label: string; description: string }[] = [
    {
        value: 'aggressive',
        label: 'Aggressive',
        description: 'Surface issues early. May include some false positives.',
    },
    {
        value: 'balanced',
        label: 'Balanced',
        description: 'Standard thresholds. Good balance of signal to noise.',
    },
    {
        value: 'conservative',
        label: 'Conservative',
        description: 'Only high-confidence issues with strong data backing.',
    },
];

export function SensitivitySlider({ value, onChange }: SensitivitySliderProps) {
    const selectedIndex = OPTIONS.findIndex((o) => o.value === value);
    // Default to balanced if invalid value
    const safeIndex = selectedIndex === -1 ? 1 : selectedIndex;

    return (
        <div className="space-y-3">
            {/* Track with sliding indicator */}
            <div className="relative h-11 bg-surface-sunken rounded-full p-1">
                {/* Sliding background */}
                <div
                    className="absolute top-1 bottom-1 bg-surface rounded-full shadow-soft transition-all duration-200 ease-out"
                    style={{
                        width: 'calc(33.333% - 4px)',
                        left: `calc(${safeIndex * 33.333}% + 2px)`,
                    }}
                />

                {/* Buttons */}
                <div className="relative flex h-full">
                    {OPTIONS.map((option) => (
                        <Button variant="ghost"
                            key={option.value}
                            onClick={() => onChange(option.value)}
                            className={cn(
                                'flex-1 flex items-center justify-center rounded-full text-sm font-medium transition-colors duration-150 z-10',
                                value === option.value ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
                            )}
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Description */}
            <p className="text-sm text-text-secondary text-center min-h-[20px]">
                {OPTIONS[safeIndex]?.description ?? ''}
            </p>
        </div>
    );
}
