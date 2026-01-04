'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  status?: 'online' | 'offline' | 'away' | 'busy';
  showStatusRing?: boolean; // New: show status as ring instead of dot
}

const sizes = {
  xs: { container: 'w-6 h-6', text: 'text-[10px]', ring: 'p-[1.5px]', dot: 'w-2 h-2' },
  sm: { container: 'w-8 h-8', text: 'text-xs', ring: 'p-[2px]', dot: 'w-2.5 h-2.5' },
  md: { container: 'w-10 h-10', text: 'text-sm', ring: 'p-[2px]', dot: 'w-3 h-3' },
  lg: { container: 'w-12 h-12', text: 'text-base', ring: 'p-[2.5px]', dot: 'w-3.5 h-3.5' },
  xl: { container: 'w-16 h-16', text: 'text-lg', ring: 'p-[3px]', dot: 'w-4 h-4' },
  '2xl': { container: 'w-20 h-20', text: 'text-xl', ring: 'p-[3px]', dot: 'w-5 h-5' },
};

// Deterministic gradient based on name - gives each person a unique color
const AVATAR_GRADIENTS = [
  'from-emerald-400 to-teal-500',
  'from-sky-400 to-blue-500',
  'from-violet-400 to-purple-500',
  'from-rose-400 to-pink-500',
  'from-amber-400 to-orange-500',
  'from-cyan-400 to-sky-500',
  'from-fuchsia-400 to-pink-500',
  'from-lime-400 to-emerald-500',
];

function getGradientForName(name: string): string {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]!;
}

// Status ring gradients (more visible than dots)
const statusRingStyles = {
  online: 'bg-gradient-to-br from-emerald-400 to-emerald-600',
  away: 'bg-gradient-to-br from-amber-400 to-amber-600',
  busy: 'bg-gradient-to-br from-rose-400 to-rose-600',
  offline: 'bg-slate-200',
};

const statusDotColors = {
  online: 'bg-emerald-500',
  away: 'bg-amber-500',
  busy: 'bg-rose-500',
  offline: 'bg-slate-300',
};

function getInitials(name: string): string {
  if (!name || !name.trim()) return '?';
  const names = name.trim().split(' ').filter(n => n.length > 0);
  if (names.length === 0) return '?';
  const firstName = names[0];
  const lastName = names[names.length - 1];
  if (names.length >= 2 && firstName?.[0] && lastName?.[0]) {
    return (firstName[0] + lastName[0]).toUpperCase();
  }
  return (firstName?.substring(0, 2) || '?').toUpperCase();
}

export function Avatar({
  className,
  src,
  name = '',
  size = 'md',
  status,
  showStatusRing = false,
  ...props
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showInitials = !src || imgError;
  const sizeConfig = sizes[size];
  const gradient = getGradientForName(name);

  // If showStatusRing is true, wrap avatar in a gradient ring
  if (showStatusRing && status) {
    return (
      <div className="relative inline-block flex-shrink-0">
        {/* Gradient ring container */}
        <div className={cn(
          'rounded-xl',
          sizeConfig.ring,
          statusRingStyles[status]
        )}>
          {/* Inner avatar */}
          <div
            className={cn(
              'rounded-[9px] flex items-center justify-center font-semibold overflow-hidden',
              'bg-white', // White gap between ring and avatar
              sizeConfig.container,
              sizeConfig.text,
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
              <div className={cn(
                'w-full h-full flex items-center justify-center',
                'bg-gradient-to-br',
                gradient
              )}>
                <span className="text-white drop-shadow-sm select-none">
                  {getInitials(name)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Standard avatar with optional status dot
  return (
    <div className="relative inline-block flex-shrink-0">
      <div
        className={cn(
          'rounded-xl flex items-center justify-center font-semibold overflow-hidden',
          'ring-1 ring-black/5 shadow-sm',
          'transition-all duration-200',
          sizeConfig.container,
          sizeConfig.text,
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
          <div className={cn(
            'w-full h-full flex items-center justify-center',
            'bg-gradient-to-br',
            gradient
          )}>
            <span className="text-white drop-shadow-sm select-none">
              {getInitials(name)}
            </span>
          </div>
        )}
      </div>

      {/* Status dot */}
      {status && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white',
            'shadow-sm',
            sizeConfig.dot,
            statusDotColors[status]
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
  const sizeConfig = sizes[size];

  return (
    <div className="flex -space-x-2">
      {visibleChildren.map((child, i) => (
        <div key={i} className="relative ring-2 ring-white rounded-xl">
          {child}
        </div>
      ))}
      {remaining > 0 && (
        <div className={cn(
          'rounded-xl flex items-center justify-center',
          'bg-slate-100 text-slate-600 font-semibold',
          'ring-2 ring-white',
          sizeConfig.container,
          sizeConfig.text,
        )}>
          +{remaining}
        </div>
      )}
    </div>
  );
}
