'use client';

import { cn } from '@/lib/utils';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <div className={cn(
      'animate-page-enter',
      className
    )}>
      {children}
    </div>
  );
}

// For staggered list animations
interface StaggeredListProps {
  children: React.ReactNode[];
  className?: string;
  itemClassName?: string;
  delay?: number;
}

export function StaggeredList({ 
  children, 
  className, 
  itemClassName,
  delay = 50 
}: StaggeredListProps) {
  return (
    <div className={className}>
      {children.map((child, index) => (
        <div
          key={index}
          className={cn('animate-slide-in-up', itemClassName)}
          style={{ animationDelay: `${index * delay}ms` }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

// For fade-in cards
interface FadeInCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function FadeInCard({ children, className, delay = 0 }: FadeInCardProps) {
  return (
    <div 
      className={cn('animate-fade-in-up', className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
