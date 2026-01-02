'use client';

import { useState, useRef, useEffect } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayMs?: number;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  delayMs = 200
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setOpen(true), delayMs);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setOpen(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-warm-900',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-warm-900',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-warm-900',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-warm-900',
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {open && (
        <div className={`
          absolute z-50
          ${positionClasses[side]}
          animate-in fade-in zoom-in-95
          duration-150
        `}>
          <div className="
            px-3 py-2
            bg-warm-900 text-white
            text-xs font-medium
            rounded-lg
            shadow-lg
            whitespace-nowrap
          ">
            {content}
          </div>
          {/* Arrow */}
          <div className={`
            absolute w-0 h-0
            border-4 border-transparent
            ${arrowClasses[side]}
          `} />
        </div>
      )}
    </div>
  );
}
