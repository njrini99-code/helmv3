'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

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
    setOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsAnimating(true));
    });
  }, []);

  const closeMenu = useCallback(() => {
    setIsAnimating(false);
    const timer = setTimeout(() => setOpen(false), 150);
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
            'min-w-[200px]',
            'bg-white',
            'border border-warm-200',
            'rounded-[14px]',
            'shadow-lg',
            'py-1.5',
            'transition-all duration-150 ease-out origin-top',
            isAnimating
              ? 'opacity-100 scale-y-100 translate-y-0'
              : 'opacity-0 scale-y-95 -translate-y-1',
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
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className={cn(
        'w-full flex items-center gap-3',
        'px-4 py-2.5 min-h-[40px]',
        'text-sm text-left',
        'transition-colors duration-100',
        'focus:outline-none',
        danger
          ? 'text-red-600 hover:bg-red-50 focus:bg-red-50'
          : 'text-warm-700 hover:bg-warm-50 focus:bg-warm-50',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
      <span className="flex-1">{children}</span>
      {shortcut && (
        <span className="text-xs text-warm-400 ml-auto pl-4">{shortcut}</span>
      )}
    </button>
  );
}

export function DropdownSeparator() {
  return (
    <div className="h-px bg-gradient-to-r from-transparent via-warm-200 to-transparent my-1.5" />
  );
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2 text-xs font-medium text-warm-400 uppercase tracking-wide">
      {children}
    </div>
  );
}
