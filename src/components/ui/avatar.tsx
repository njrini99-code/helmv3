'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  status?: 'online' | 'offline' | 'away';
  ring?: boolean;
}

const sizes = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
  '2xl': 'w-20 h-20 text-xl',
};

const statusColors = {
  online: 'bg-primary-500',
  offline: 'bg-warm-300',
  away: 'bg-amber-500',
};

// Get initials from name
function getInitials(name: string): string {
  if (!name) return '?';
  const names = name.trim().split(' ').filter(n => n.length > 0);
  const firstName = names[0];
  const lastName = names[names.length - 1];
  if (names.length >= 2 && firstName?.[0] && lastName?.[0]) {
    return (firstName[0] + lastName[0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export function Avatar({ className, src, name = '', size = 'md', status, ring, ...props }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showInitials = !src || imgError;

  return (
    <div className="relative inline-block flex-shrink-0">
      <div
        className={cn(
          // BATCH 2: Rounded square (10px) not circle
          'rounded-[10px] flex items-center justify-center font-medium overflow-hidden',
          'transition-all duration-200',
          showInitials ? 'bg-warm-100 text-warm-600' : 'bg-warm-100',
          ring ? 'ring-2 ring-white shadow-sm' : 'ring-2 ring-transparent',
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
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white',
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
  total?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export function AvatarGroup({ children, max = 3, total, size = 'md' }: AvatarGroupProps) {
  const childArray = Array.isArray(children) ? children : [children];
  const visibleChildren = childArray.slice(0, max);
  const remaining = total ? total - max : childArray.length - max;

  return (
    <div className="flex -space-x-2">
      {visibleChildren.map((child, i) => (
        <div key={i} className="relative ring-2 ring-white rounded-lg">
          {child}
        </div>
      ))}
      {remaining > 0 && (
        <div className={cn(
          'rounded-lg flex items-center justify-center bg-warm-100 text-warm-600 font-medium ring-2 ring-white',
          size === 'xs' && 'w-6 h-6 text-xs',
          size === 'sm' && 'w-8 h-8 text-xs',
          size === 'md' && 'w-10 h-10 text-sm',
          size === 'lg' && 'w-12 h-12 text-base',
          size === 'xl' && 'w-16 h-16 text-lg',
          size === '2xl' && 'w-20 h-20 text-xl',
        )}>
          +{remaining}
        </div>
      )}
    </div>
  );
}
