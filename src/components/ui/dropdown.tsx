'use client';

import { useState, useEffect, useRef } from 'react';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

export function Dropdown({ trigger, children, align = 'start' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const alignClasses = {
    start: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    end: 'right-0',
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <div onClick={() => setOpen(!open)}>
        {trigger}
      </div>

      {open && (
        <div className={`
          absolute z-50 mt-2
          ${alignClasses[align]}
          min-w-[200px]
          bg-white
          border border-warm-200
          rounded-[14px]
          shadow-lg
          py-1.5
          animate-in fade-in slide-in-from-top-2
          duration-150
        `}>
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
}

export function DropdownItem({
  children,
  icon: Icon,
  onClick,
  danger,
  disabled
}: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full flex items-center gap-3
        px-4 py-2.5
        text-sm text-left
        transition-colors duration-150
        ${danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-warm-700 hover:bg-warm-50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
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
