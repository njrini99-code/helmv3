'use client';

import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

const TabsContext = createContext<{
  value: string;
  onChange: (v: string) => void;
  registerTab: (value: string, element: HTMLButtonElement) => void;
  activeRect: { left: number; width: number } | null;
} | null>(null);

export function Tabs({ defaultValue, value: controlledValue, onChange: controlledOnChange, children, className }: {
  defaultValue: string;
  value?: string;
  onChange?: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [activeRect, setActiveRect] = useState<{ left: number; width: number } | null>(null);
  const tabsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const value = controlledValue ?? internalValue;
  const onChange = controlledOnChange ?? setInternalValue;

  const registerTab = useCallback((tabValue: string, element: HTMLButtonElement) => {
    tabsRef.current.set(tabValue, element);
  }, []);

  // Update indicator position when active tab changes
  useEffect(() => {
    const activeTab = tabsRef.current.get(value);
    if (activeTab && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      setActiveRect({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
      });
    }
  }, [value]);

  return (
    <TabsContext.Provider value={{ value, onChange, registerTab, activeRect }}>
      <div ref={containerRef} className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  const ctx = useContext(TabsContext);

  return (
    <div
      className={cn('relative flex gap-1 p-1 bg-cream-100 rounded-lg', className)}
      role="tablist"
    >
      {/* Animated indicator */}
      {ctx?.activeRect && (
        <div
          className="absolute top-1 bottom-1 bg-white rounded-md shadow-sm transition-all duration-200 ease-out pointer-events-none z-0"
          style={{
            left: `${ctx.activeRect.left}px`,
            width: `${ctx.activeRect.width}px`,
          }}
        />
      )}
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, icon, badge, className }: {
  value: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  badge?: number | string;
  className?: string;
}) {
  const ctx = useContext(TabsContext);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (ref.current && ctx) {
      ctx.registerTab(value, ref.current);
    }
  }, [value, ctx]);

  if (!ctx) return null;

  const isActive = ctx.value === value;

  return (
    <button
      ref={ref}
      role="tab"
      aria-selected={isActive}
      onClick={() => ctx.onChange(value)}
      className={cn(
        'relative z-10 px-4 py-2 min-h-[44px] text-sm font-medium rounded-md',
        'transition-colors duration-200 ease-out',
        'flex items-center justify-center gap-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        isActive
          ? 'text-warm-900'
          : 'text-warm-500 hover:text-warm-700',
        className,
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
      {badge !== undefined && (
        <span className={cn(
          'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full',
          'transition-colors duration-200',
          isActive
            ? 'bg-primary-100 text-primary-700'
            : 'bg-warm-200 text-warm-600'
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}

export function TabsContent({ value, children, className }: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabsContext);
  if (!ctx || ctx.value !== value) return null;

  return (
    <div
      role="tabpanel"
      className={cn('mt-4 animate-fade-in', className)}
    >
      {children}
    </div>
  );
}
