'use client';

import { motion } from 'framer-motion';
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
      <p className="text-sm text-warm-600 font-medium">Miss (optional)</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {tags.map((tag) => {
          const isSelected = selectedTags.includes(tag);

          return (
            <motion.button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              disabled={disabled}
              whileTap={{ scale: 0.96 }}
              className={cn(
                'relative px-4 py-3 rounded-xl border transition-all duration-200',
                'text-sm font-semibold',
                isSelected
                  ? 'bg-primary-600 border-primary-600 text-white shadow-sm shadow-primary-950/10'
                  : 'bg-cream-100/75 backdrop-blur-sm border-warm-200 text-warm-700 hover:border-primary-300 hover:bg-primary-50 active:bg-primary-100',
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
