'use client';

import { motion } from 'framer-motion';

interface ProgressDotsProps {
  total: number;
  current: number;
}

export function ProgressDots({ total, current }: ProgressDotsProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, index) => {
        const isActive = index + 1 === current;
        return (
          <motion.div
            key={index}
            className={`h-2 w-2 rounded-full transition-colors duration-200 ${
              isActive ? 'bg-onboarding-kelly-green' : 'bg-onboarding-border-medium'
            }`}
            initial={false}
            animate={{
              scale: isActive ? [1, 1.3, 1] : 1,
            }}
            transition={{
              duration: 0.3,
              ease: [0.4, 0, 0.2, 1],
            }}
          />
        );
      })}
    </div>
  );
}
