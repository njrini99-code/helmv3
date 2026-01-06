'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ExpandableCardProps {
  id: string;
  children: React.ReactNode;
  expandedContent: React.ReactNode;
  className?: string;
}

export function ExpandableCard({ 
  id, 
  children, 
  expandedContent, 
  className 
}: ExpandableCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <motion.div
        layoutId={`card-${id}`}
        onClick={() => setIsExpanded(true)}
        className={cn(
          'cursor-pointer rounded-2xl bg-white border border-slate-200',
          className
        )}
        whileHover={{ scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        {children}
      </motion.div>

      <AnimatePresence>
        {isExpanded && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={() => setIsExpanded(false)}
            />
            
            {/* Expanded Card */}
            <motion.div
              layoutId={`card-${id}`}
              className="fixed inset-4 md:inset-20 bg-white rounded-2xl z-50 overflow-auto"
            >
              <button
                onClick={() => setIsExpanded(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xl leading-none"
              >
                ×
              </button>
              {expandedContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
