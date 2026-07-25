'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PuttMissTag } from '@/lib/types/golf';

interface PuttMissTagSelectorProps {
  selectedTags: PuttMissTag[];
  onTagsChange: (tags: PuttMissTag[]) => void;
  disabled?: boolean;
}

export function PuttMissTagSelector({ 
  selectedTags, 
  onTagsChange, 
  disabled,
}: PuttMissTagSelectorProps) {
  const prefersReducedMotion = useReducedMotion();
  const tags: PuttMissTag[] = ['short', 'long', 'low', 'high'];
  const tagLabels: Record<PuttMissTag, string> = {
    short: 'Short',
    long: 'Long',
    low: 'Low',
    high: 'High',
  };

  const toggleTag = (tag: PuttMissTag) => {
    if (disabled) return;

    if (selectedTags.includes(tag)) {
      // Remove tag
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      // Mutually exclusive pairs: low/high (read), short/long (speed)
      let filtered = selectedTags;
      if (tag === 'low') filtered = filtered.filter(t => t !== 'high');
      else if (tag === 'high') filtered = filtered.filter(t => t !== 'low');
      else if (tag === 'short') filtered = filtered.filter(t => t !== 'long');
      else if (tag === 'long') filtered = filtered.filter(t => t !== 'short');
      onTagsChange([...filtered, tag]);
    }
  };

  return (
    <div className="space-y-3">
      <p className="font-fw-sans text-caption font-medium text-text-tertiary">Miss (optional)</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {tags.map((tag) => {
          const isSelected = selectedTags.includes(tag);

          return (
            <motion.button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              disabled={disabled}
              whileTap={prefersReducedMotion ? undefined : ({ scale: 0.96 })}
              className={cn(
                'relative px-4 py-3 rounded-fw-md border transition-all duration-200',
                'font-fw-sans text-sm font-medium',
                'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                isSelected
                  ? 'bg-accent-700 border-accent-700 text-text-on-accent shadow-flat'
                  : 'bg-surface-sunken border-border-subtle text-text-secondary hover:border-accent-300 hover:bg-surface-tint active:bg-surface-tint',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {tagLabels[tag]}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
