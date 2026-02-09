'use client';

import { cn } from '@/lib/utils';
import { IconLayoutGrid, IconList, IconMap } from '@/components/icons';

export type ViewMode = 'grid' | 'list' | 'map';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  className?: string;
  showMap?: boolean;
}

export function ViewToggle({ value, onChange, className, showMap = true }: ViewToggleProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-xl border border-warm-200 bg-white p-1',
        className
      )}
    >
      {showMap && (
        <ToggleButton
          active={value === 'map'}
          onClick={() => onChange('map')}
          icon={IconMap}
          label="Map view"
        />
      )}
      <ToggleButton
        active={value === 'grid'}
        onClick={() => onChange('grid')}
        icon={IconLayoutGrid}
        label="Grid view"
      />
      <ToggleButton
        active={value === 'list'}
        onClick={() => onChange('list')}
        icon={IconList}
        label="List view"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'p-2 rounded-lg transition-all duration-200',
        active
          ? 'bg-warm-100 text-warm-900'
          : 'text-warm-400 hover:text-warm-600 hover:bg-warm-50'
      )}
    >
      <Icon size={18} />
    </button>
  );
}

// Extended variant with labels
interface ViewToggleExtendedProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  gridLabel?: string;
  listLabel?: string;
  className?: string;
}

export function ViewToggleExtended({
  value,
  onChange,
  gridLabel = 'Grid',
  listLabel = 'List',
  className,
}: ViewToggleExtendedProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-xl border border-warm-200 bg-white p-1 gap-1',
        className
      )}
    >
      <button
        type="button"
        onClick={() => onChange('grid')}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
          value === 'grid'
            ? 'bg-warm-100 text-warm-900'
            : 'text-warm-500 hover:text-warm-700 hover:bg-warm-50'
        )}
      >
        <IconLayoutGrid size={16} />
        {gridLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
          value === 'list'
            ? 'bg-warm-100 text-warm-900'
            : 'text-warm-500 hover:text-warm-700 hover:bg-warm-50'
        )}
      >
        <IconList size={16} />
        {listLabel}
      </button>
    </div>
  );
}
