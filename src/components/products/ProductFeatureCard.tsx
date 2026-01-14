'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface ProductFeatureCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  iconBg?: string;
  children?: ReactNode;
  size?: 'default' | 'large' | 'wide' | 'tall';
  className?: string;
  delay?: number;
}

const sizeClasses = {
  default: '',
  large: 'md:col-span-2 md:row-span-2',
  wide: 'md:col-span-2',
  tall: 'md:row-span-2',
};

export function ProductFeatureCard({
  title,
  description,
  icon,
  iconBg = 'bg-primary-50 text-primary-600',
  children,
  size = 'default',
  className,
  delay = 0,
}: ProductFeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'group relative overflow-hidden',
        'bg-white/60 backdrop-blur-xl',
        'border border-white/40',
        'rounded-2xl p-6',
        'shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.8)]',
        'transition-all duration-300',
        'hover:bg-white/80 hover:border-white/60',
        'hover:shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]',
        'hover:-translate-y-1',
        sizeClasses[size],
        className
      )}
    >
      {/* Top shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Header with icon */}
        <div className="flex items-start gap-4 mb-4">
          {icon && (
            <div
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                'group-hover:scale-105 transition-transform duration-300',
                iconBg
              )}
            >
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{description}</p>
            )}
          </div>
        </div>

        {/* Visual content area */}
        {children && (
          <div className="flex-1 mt-2">
            {children}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Hero variant for larger feature cards
export function ProductHeroCard({
  title,
  description,
  icon,
  iconBg = 'bg-primary-50 text-primary-600',
  children,
  className,
  delay = 0,
}: Omit<ProductFeatureCardProps, 'size'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'group relative overflow-hidden',
        'bg-white/70 backdrop-blur-xl',
        'border border-white/50',
        'rounded-3xl p-8',
        'shadow-[0_4px_16px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]',
        'transition-all duration-300',
        'hover:bg-white/80 hover:border-white/60',
        'hover:shadow-[0_8px_24px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.95)]',
        'hover:-translate-y-1',
        'md:col-span-2 md:row-span-2',
        className
      )}
    >
      {/* Top shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          {icon && (
            <div
              className={cn(
                'w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0',
                'group-hover:scale-105 transition-transform duration-300',
                iconBg
              )}
            >
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="text-base text-muted-foreground mt-1">{description}</p>
            )}
          </div>
        </div>

        {/* Large visual content area */}
        {children && (
          <div className="flex-1 min-h-0">
            {children}
          </div>
        )}
      </div>
    </motion.div>
  );
}
