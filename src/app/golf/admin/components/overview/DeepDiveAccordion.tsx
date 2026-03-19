'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconChevronDown } from '@/components/icons';

interface DeepDiveAccordionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function DeepDiveAccordion({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: DeepDiveAccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="glass-premium rounded-2xl">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="min-h-[44px] w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-semibold text-warm-900">{title}</span>
          {subtitle && (
            <span className="text-xs font-medium text-warm-400 truncate">
              {subtitle}
            </span>
          )}
        </div>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-warm-400 flex-shrink-0 ml-2"
        >
          <IconChevronDown size={16} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
