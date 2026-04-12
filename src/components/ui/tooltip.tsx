'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayMs?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  delayMs = 200,
  className,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const hideTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const show = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsAnimating(true));
      });
    }, delayMs);
  }, [delayMs]);

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsAnimating(false);
    hideTimeoutRef.current = setTimeout(() => setIsVisible(false), 150);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      hide();
    }
  }, [hide]);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const animateClasses = {
    top: isAnimating ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
    bottom: isAnimating ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1',
    left: isAnimating ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-1',
    right: isAnimating ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-1',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-px border-l-transparent border-r-transparent border-b-transparent border-t-warm-900',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-px border-l-transparent border-r-transparent border-t-transparent border-b-warm-900',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-px border-t-transparent border-b-transparent border-r-transparent border-l-warm-900',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-px border-t-transparent border-b-transparent border-l-transparent border-r-warm-900',
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={handleKeyDown}
    >
      {children}

      {isVisible && (
        <div
          role="tooltip"
          className={cn(
            // Hide tooltips on touch devices / iOS Capacitor shell —
            // they can't be dismissed and just cover content.
            '[body.capacitor_&]:hidden max-[768px]:hidden',
            'absolute z-50 pointer-events-none',
            positionClasses[side],
            'transition-all duration-150 ease-out',
            animateClasses[side],
          )}
        >
          <div className={cn(
            'px-3 py-2',
            'bg-warm-900 text-white',
            'text-xs font-medium',
            'rounded-lg',
            'shadow-lg',
            'whitespace-nowrap',
            className,
          )}>
            {content}
          </div>
          {/* Arrow */}
          <div className={cn(
            'absolute w-0 h-0 border-4 border-transparent',
            arrowClasses[side],
          )} />
        </div>
      )}
    </div>
  );
}
