'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PuttMissTag, PUTT_MISS_TAG_CONFIG } from '@/lib/types/golf';

interface PuttMissTagSelectorProps {
  selectedTags: PuttMissTag[];
  onTagsChange: (tags: PuttMissTag[]) => void;
  disabled?: boolean;
  distanceFeet?: number;
  onDistanceChange?: (feet: number) => void;
}

export function PuttMissTagSelector({ 
  selectedTags, 
  onTagsChange, 
  disabled,
  distanceFeet,
  onDistanceChange,
}: PuttMissTagSelectorProps) {
  const categories = [
    { key: 'read', label: 'Green Reading', tags: ['low', 'high'] as PuttMissTag[] },
    { key: 'speed', label: 'Speed Control', tags: ['short', 'long'] as PuttMissTag[] },
    { key: 'stroke', label: 'Stroke Path', tags: ['pull', 'push'] as PuttMissTag[] },
  ];

  const toggleTag = (tag: PuttMissTag) => {
    if (disabled) return;
    
    const config = PUTT_MISS_TAG_CONFIG[tag];
    const sameCategoryTags = categories
      .find(c => c.key === config.category)?.tags || [];
    
    if (selectedTags.includes(tag)) {
      // Remove tag
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      // Add tag, remove conflicting same-category tag (can't be both low AND high)
      const filtered = selectedTags.filter(t => !sameCategoryTags.includes(t));
      onTagsChange([...filtered, tag]);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 font-medium">Why did it miss? (Optional)</p>
      
      {/* Distance input (optional but encouraged) */}
      {onDistanceChange && (
        <div className="space-y-2">
          <label className="text-xs text-slate-500 uppercase tracking-wider">Putt Distance (feet)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={distanceFeet || ''}
            onChange={(e) => onDistanceChange(parseFloat(e.target.value) || 0)}
            disabled={disabled}
            placeholder="e.g., 8.5"
            className={cn(
              'w-full px-4 py-2.5 rounded-lg border transition-all',
              'bg-white/70 backdrop-blur-sm border-slate-200',
              'focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none',
              'text-slate-900 placeholder:text-slate-400',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />
        </div>
      )}
      
      {categories.map((category) => (
        <div key={category.key} className="space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">
            {category.label}
          </p>
          <div className="flex gap-2">
            {category.tags.map((tag) => {
              const config = PUTT_MISS_TAG_CONFIG[tag];
              const isSelected = selectedTags.includes(tag);
              
              return (
                <motion.button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  disabled={disabled}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    'relative flex-1 px-4 py-3 rounded-xl border transition-all duration-200',
                    'text-sm font-medium',
                    isSelected
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                      : 'bg-white/70 backdrop-blur-sm border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50',
                    disabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-white"
                      />
                    )}
                  </AnimatePresence>
                  <span className="block font-semibold">{config.label}</span>
                  <span className={cn(
                    'block text-xs mt-0.5',
                    isSelected ? 'text-emerald-50' : 'text-slate-500'
                  )}>
                    {config.description}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
      
      {selectedTags.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap gap-2 pt-2"
        >
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium',
                'bg-emerald-100 text-emerald-700 border border-emerald-200'
              )}
            >
              {PUTT_MISS_TAG_CONFIG[tag].label}
            </span>
          ))}
        </motion.div>
      )}
    </div>
  );
}
