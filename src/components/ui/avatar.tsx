'use client';

import { useState } from 'react';
import { cn, getInitials } from '@/lib/utils';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  status?: 'online' | 'offline' | 'away' | 'busy';
  ring?: boolean;
}

const sizes = {
  xs: 'w-6 h-6 text-2xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
  '2xl': 'w-24 h-24 text-2xl',
};

const statusSizes = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
  xl: 'w-3.5 h-3.5',
  '2xl': 'w-5 h-5',
};

const statusColors = {
  online: 'bg-green-500',
  offline: 'bg-slate-300',
  away: 'bg-amber-400',
  busy: 'bg-red-400',
};

// Generate consistent color from name for initials
function getAvatarColor(name: string): string {
  const colors = [
    'bg-slate-100 text-slate-600',
    'bg-slate-200 text-slate-700',
    'bg-zinc-100 text-zinc-600',
    'bg-neutral-100 text-neutral-600',
  ];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[index % colors.length] || 'bg-slate-100 text-slate-600';
}

export function Avatar({ className, src, name = '', size = 'md', status, ring, ...props }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showInitials = !src || imgError;

  return (
    <div className="relative inline-block flex-shrink-0 group">
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-medium overflow-hidden',
          'transition-all duration-200 ring-2 ring-transparent',
          'group-hover:ring-slate-200',
          showInitials ? getAvatarColor(name) : 'bg-slate-100',
          ring && 'ring-white shadow-md',
          sizes[size],
          className
        )}
        title={name}
        {...props}
      >
        {!showInitials ? (
          <img
            src={src!}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="select-none">{getInitials(name)}</span>
        )}
      </div>
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-white',
            statusSizes[size],
            statusColors[status]
          )}
        />
      )}
    </div>
  );
}

// Avatar group for stacking multiple avatars
interface AvatarGroupProps {
  children: React.ReactNode;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
}

export function AvatarGroup({ children, max = 4, size = 'md' }: AvatarGroupProps) {
  const childArray = Array.isArray(children) ? children : [children];
  const visible = childArray.slice(0, max);
  const remaining = childArray.length - max;

  return (
    <div className="flex -space-x-2">
      {visible.map((child, i) => (
        <div key={i} className="relative ring-2 ring-white rounded-full">
          {child}
        </div>
      ))}
      {remaining > 0 && (
        <div className={cn(
          'rounded-full flex items-center justify-center bg-slate-100 text-slate-600 font-medium ring-2 ring-white',
          size === 'sm' && 'w-8 h-8 text-xs',
          size === 'md' && 'w-10 h-10 text-sm',
          size === 'lg' && 'w-12 h-12 text-base',
        )}>
          +{remaining}
        </div>
      )}
    </div>
  );
}
