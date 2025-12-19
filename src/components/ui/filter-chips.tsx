'use client';

import { cn } from '@/lib/utils';
import { IconX } from '@/components/icons';

export interface FilterChip {
  key: string;
  label: string;
  value: string;
}

interface FilterChipsProps {
  filters: FilterChip[];
  onRemove: (key: string) => void;
  onClearAll?: () => void;
  className?: string;
}

export function FilterChips({
  filters,
  onRemove,
  onClearAll,
  className,
}: FilterChipsProps) {
  if (filters.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {filters.map((filter) => (
        <button
          key={filter.key}
          type="button"
          onClick={() => onRemove(filter.key)}
          className={cn(
            'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full',
            'bg-slate-100 text-slate-700 text-sm',
            'hover:bg-slate-200 transition-colors group'
          )}
        >
          <span className="text-slate-500 font-medium">{filter.label}:</span>
          <span className="font-medium">{filter.value}</span>
          <IconX
            size={14}
            className="text-slate-400 group-hover:text-slate-600 transition-colors"
          />
        </button>
      ))}

      {onClearAll && filters.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors underline-offset-2 hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

// Single toggleable chip (like a tag filter)
interface ChipToggleProps {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  count?: number;
  className?: string;
}

export function ChipToggle({
  label,
  selected = false,
  onClick,
  count,
  className,
}: ChipToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium',
        'transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-green-500/20',
        selected
          ? 'bg-green-100 text-green-700 border border-green-200'
          : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50',
        className
      )}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={cn(
          'min-w-[18px] h-[18px] px-1 rounded-full text-xs flex items-center justify-center',
          selected
            ? 'bg-green-600 text-white'
            : 'bg-slate-100 text-slate-500'
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

// Group of toggleable chips
interface ChipGroupProps {
  options: { value: string; label: string; count?: number }[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  multiple?: boolean;
  className?: string;
}

export function ChipGroup({
  options,
  value,
  onChange,
  multiple = false,
  className,
}: ChipGroupProps) {
  const selectedValues = multiple
    ? (Array.isArray(value) ? value : [])
    : (typeof value === 'string' ? [value] : []);

  const handleClick = (optionValue: string) => {
    if (multiple) {
      const newValues = selectedValues.includes(optionValue)
        ? selectedValues.filter((v) => v !== optionValue)
        : [...selectedValues, optionValue];
      onChange?.(newValues);
    } else {
      onChange?.(selectedValues.includes(optionValue) ? '' : optionValue);
    }
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => (
        <ChipToggle
          key={option.value}
          label={option.label}
          count={option.count}
          selected={selectedValues.includes(option.value)}
          onClick={() => handleClick(option.value)}
        />
      ))}
    </div>
  );
}

// Static badge/chip (non-interactive)
interface BadgeChipProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

export function BadgeChip({
  children,
  variant = 'default',
  size = 'md',
  className,
}: BadgeChipProps) {
  const variants = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
  };

  const sizes = {
    sm: 'h-5 px-2 text-xs',
    md: 'h-6 px-2.5 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}
