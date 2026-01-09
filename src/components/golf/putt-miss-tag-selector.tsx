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
  const tags: PuttMissTag[] = ['short', 'low', 'high'];
  const tagLabels: Record<PuttMissTag, string> = {
    short: 'Short',
    low: 'Low',
    high: 'High',
  };

  const toggleTag = (tag: PuttMissTag) => {
    if (disabled) return;
    
    if (selectedTags.includes(tag)) {
      // Remove tag
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      const filtered = tag === 'low'
        ? selectedTags.filter(t => t !== 'high')
        : tag === 'high'
        ? selectedTags.filter(t => t !== 'low')
        : selectedTags;
      onTagsChange([...filtered, tag]);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 font-medium">Miss (optional)</p>
      <div className="grid grid-cols-3 gap-2">
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
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                  : 'bg-white/70 backdrop-blur-sm border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50',
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
