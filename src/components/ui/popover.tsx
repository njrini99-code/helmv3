'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  className?: string;
  closeOnInteractOutside?: boolean;
}

export function Popover({
  trigger,
  children,
  side = 'bottom',
  align = 'center',
  className,
  closeOnInteractOutside = true,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const openPopover = useCallback(() => {
    setOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsAnimating(true));
    });
  }, []);

  const closePopover = useCallback(() => {
    setIsAnimating(false);
    const timer = setTimeout(() => setOpen(false), 150);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!closeOnInteractOutside) return;
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        closePopover();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeOnInteractOutside, closePopover]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') closePopover();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, closePopover]);

  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  const alignClasses = {
    start: 'left-0',
    center: side === 'left' || side === 'right' ? 'top-1/2 -translate-y-1/2' : 'left-1/2 -translate-x-1/2',
    end: 'right-0',
  };

  const animateClasses = {
    top: isAnimating ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-1 scale-95',
    bottom: isAnimating ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-1 scale-95',
    left: isAnimating ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-1 scale-95',
    right: isAnimating ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 -translate-x-1 scale-95',
  };

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <div onClick={() => open ? closePopover() : openPopover()}>
        {trigger}
      </div>

      {open && (
        <div
          className={cn(
            'absolute z-50',
            positionClasses[side],
            alignClasses[align],
            'min-w-[280px]',
            'bg-white',
            'border border-warm-200',
            'rounded-xl',
            'shadow-lg',
            'p-4',
            'transition-all duration-150 ease-out',
            animateClasses[side],
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
