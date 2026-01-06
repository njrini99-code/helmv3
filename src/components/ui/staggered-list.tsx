'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface StaggeredListProps {
  children: ReactNode[];
  className?: string;
  delay?: number;
}

export function StaggeredList({ children, className, delay = 0 }: StaggeredListProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.06,
            delayChildren: delay
          }
        }
      }}
    >
      {children.map((child, i) => (
        <motion.div
          key={i}
          variants={{
            hidden: { opacity: 0, x: -16 },
            visible: { 
              opacity: 1, 
              x: 0,
              transition: {
                type: 'spring',
                stiffness: 300,
                damping: 28
              }
            }
          }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
