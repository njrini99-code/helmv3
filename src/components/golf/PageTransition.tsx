'use client';

import { cn } from '@/lib/utils';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

function PageTransition({ children, className }: PageTransitionProps) {
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

function StaggeredList({
  children,
  className,
  itemClassName,
  delay = 50
}: StaggeredListProps) {
  return (
    <div className={className}>
      {children.map((child, index) => {
        const key = (child as React.ReactElement)?.key ?? index;
        return (
          <div
            key={key}
            className={cn('animate-slide-in-up', itemClassName)}
            style={{ animationDelay: `${index * delay}ms` }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}

// For fade-in cards
interface FadeInCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

function FadeInCard({ children, className, delay = 0 }: FadeInCardProps) {
  return (
    <div 
      className={cn('animate-fade-in-up', className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
