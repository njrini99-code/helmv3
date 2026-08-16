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
                                // `min-w-0 px-2` — these are three flex-1 segments in a
                                // fixed track, so the segment width comes from flex, not
                                // from padding. The Button default (`size="md"` -> px-5)
                                // spent 40px per segment on padding, and `ui/button.tsx`
                                // applies BOTH `whitespace-nowrap` and `overflow-hidden`
                                // (:75-76) — so at 390px the longest FIXED label,
                                // "Conservative", hard-clipped with no ellipsis to signal
                                // it. Same shape as the "View as table" toggle fixed in
                                // 9826bdd30: a constant string cut by a compressing flex
                                // row, not user data truncating gracefully.
                                'min-w-0 px-2',
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
