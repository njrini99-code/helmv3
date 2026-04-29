'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function Dropdown({ trigger, children, align = 'start', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = useCallback(() => {
    void triggerHaptic('light');
    setOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsAnimating(true));
    });
  }, []);

  const closeMenu = useCallback(() => {
    setIsAnimating(false);
    const timer = setTimeout(() => setOpen(false), 180);
    return () => clearTimeout(timer);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeMenu]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeMenu();
      return;
    }

    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openMenu();
        return;
      }
    }

    if (open && menuRef.current) {
      const items = Array.from(menuRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[nextIndex]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prevIndex]?.focus();
      }
    }
  }, [open, openMenu, closeMenu]);

  // Focus first item when opened
  useEffect(() => {
    if (open && isAnimating && menuRef.current) {
      const firstItem = menuRef.current.querySelector<HTMLElement>('button:not([disabled])');
      firstItem?.focus();
    }
  }, [open, isAnimating]);

  const alignClasses = {
    start: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    end: 'right-0',
  };

  return (
    <div className="relative inline-block" ref={dropdownRef} onKeyDown={handleKeyDown}>
      <div
        onClick={() => open ? closeMenu() : openMenu()}
        role="button"
        aria-haspopup="menu"
        aria-expanded={open}
        tabIndex={0}
      >
        {trigger}
      </div>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={cn(
            'absolute z-50 mt-2',
            alignClasses[align],
            'min-w-[220px]',
            'bg-cream-50/95 backdrop-blur-xl',
            'border border-warm-200/50',
            'rounded-2xl',
            'shadow-[0_12px_40px_rgba(16,24,40,0.14)]',
            'py-1.5',
            'transition-[opacity,transform] duration-180 ease-[cubic-bezier(0.32,0.72,0,1)] origin-top',
            align === 'end' && 'origin-top-right',
            align === 'center' && 'origin-top',
            align === 'start' && 'origin-top-left',
            isAnimating
              ? 'opacity-100 scale-100 translate-y-0'
              : 'opacity-0 scale-95 -translate-y-1',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

export function DropdownItem({
  children,
  icon: Icon,
  onClick,
  danger,
  disabled,
  shortcut,
}: DropdownItemProps) {
  const handleClick = () => {
    if (disabled) return;
    void triggerHaptic('light');
    onClick?.();
  };
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      role="menuitem"
      className={cn(
        'w-full flex items-center gap-3',
        'px-3 py-2.5 min-h-[44px]',
        'text-[15px] text-left',
        'transition-colors duration-100',
        'focus:outline-none',
        danger
          ? 'text-[#FF3B30] hover:bg-[#FF3B30]/8 focus:bg-[#FF3B30]/8 active:bg-[#FF3B30]/12'
          : 'text-warm-800 hover:bg-warm-100/60 focus:bg-warm-100/60 active:bg-warm-100/80',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            'w-[18px] h-[18px] flex-shrink-0',
            danger ? 'text-[#FF3B30]' : 'text-warm-500',
          )}
        />
      )}
      <span className="flex-1 font-medium">{children}</span>
      {shortcut && (
        <span className="text-xs text-warm-400 ml-auto pl-4 tabular-nums">{shortcut}</span>
      )}
    </button>
  );
}

export function DropdownSeparator() {
  return (
    <div className="h-px bg-warm-200/50 my-1" />
  );
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2 text-xs font-medium text-warm-400 uppercase tracking-wide">
      {children}
    </div>
  );
}
