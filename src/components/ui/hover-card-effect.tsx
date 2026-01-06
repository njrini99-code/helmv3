'use client';

import { motion } from 'framer-motion';
import { ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';

interface HoverCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
}

export function HoverCard({ children, className, glowColor = 'rgba(34, 197, 94, 0.15)' }: HoverCardProps) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  return (
    <motion.div
      className={cn('relative overflow-hidden', className)}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Glow effect following cursor */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-0 rounded-2xl"
        animate={{
          background: isHovered
            ? `radial-gradient(300px circle at ${mousePosition.x}px ${mousePosition.y}px, ${glowColor}, transparent 60%)`
            : 'none'
        }}
        transition={{ duration: 0.2 }}
      />
      
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
