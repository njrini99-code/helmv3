'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { IconWarning, IconRefresh } from '@/components/icons';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface AdminErrorBoundaryProps {
  children: ReactNode;
  /** Fallback UI to show on error */
  fallback?: ReactNode;
  /** Callback when error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Title to show in error UI */
  title?: string;
  /** Additional class names for the error container */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

interface AdminErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ============================================
// COMPONENT
// ============================================

export class AdminErrorBoundary extends Component<
  AdminErrorBoundaryProps,
  AdminErrorBoundaryState
> {
  constructor(props: AdminErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): AdminErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console in development
    console.error('[AdminErrorBoundary] Caught error:', error, errorInfo);

    // Call optional callback
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <ErrorFallback
          error={this.state.error}
          title={this.props.title}
          onReset={this.handleReset}
          className={this.props.className}
          size={this.props.size}
        />
      );
    }

    return this.props.children;
  }
}

// ============================================
// ERROR FALLBACK UI
// ============================================

interface ErrorFallbackProps {
  error: Error | null;
  title?: string;
  onReset: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

function ErrorFallback({
  error,
  title = 'Something went wrong',
  onReset,
  className,
  size = 'md',
}: ErrorFallbackProps) {
  const sizeStyles = {
    sm: 'p-3 gap-2',
    md: 'p-4 gap-3',
    lg: 'p-6 gap-4',
  };

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-xl border',
        'bg-red-50/50 border-red-200/50',
        sizeStyles[size],
        className
      )}
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
        <IconWarning size={iconSizes[size]} className="text-red-600" />
      </div>

      {/* Title */}
      <h3 className={cn('font-semibold text-warm-900', textSizes[size])}>
        {title}
      </h3>

      {/* Error message */}
      {error && (
        <p className={cn('text-warm-600 max-w-md', textSizes[size])}>
          {error.message || 'An unexpected error occurred'}
        </p>
      )}

      {/* Retry button */}
      <button
        onClick={onReset}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg',
          'bg-white hover:bg-warm-50 border border-warm-200',
          'text-warm-700 font-medium transition-colors',
          textSizes[size]
        )}
      >
        <IconRefresh size={iconSizes[size] - 4} />
        Try again
      </button>
    </div>
  );
}

// ============================================
// CARD ERROR BOUNDARY
// ============================================

interface CardErrorBoundaryProps {
  children: ReactNode;
  cardName?: string;
}

export function CardErrorBoundary({
  children,
  cardName,
}: CardErrorBoundaryProps) {
  return (
    <AdminErrorBoundary
      title={cardName ? `Error loading ${cardName}` : 'Error loading card'}
      size="sm"
      className="min-h-[120px]"
    >
      {children}
    </AdminErrorBoundary>
  );
}

// ============================================
// SECTION ERROR BOUNDARY
// ============================================

interface SectionErrorBoundaryProps {
  children: ReactNode;
  sectionName?: string;
}

export function SectionErrorBoundary({
  children,
  sectionName,
}: SectionErrorBoundaryProps) {
  return (
    <AdminErrorBoundary
      title={sectionName ? `Error loading ${sectionName}` : 'Error loading section'}
      size="md"
      className="min-h-[200px]"
    >
      {children}
    </AdminErrorBoundary>
  );
}

// ============================================
// LOADING SKELETON
// ============================================

interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

export function Skeleton({ className, animate = true }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-warm-200 rounded',
        animate && 'animate-pulse',
        className
      )}
    />
  );
}

// ============================================
// STAT SKELETON
// ============================================

export function StatSkeleton() {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-20 mb-2" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

// ============================================
// CARD SKELETON
// ============================================

export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-3"
            style={{ width: `${100 - i * 10}%` }}
          />
        ))}
      </div>
      <div className="mt-4">
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}

// ============================================
// TABLE SKELETON
// ============================================

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass overflow-hidden animate-pulse">
      {/* Header */}
      <div className="px-6 py-4 border-b border-warm-100 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y divide-warm-50">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="px-6 py-4 flex gap-4">
            {Array.from({ length: cols }).map((_, colIdx) => (
              <Skeleton key={colIdx} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// CHART SKELETON
// ============================================

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-36" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
      <div
        className="bg-warm-100 rounded-lg flex items-end justify-around px-4 pt-4"
        style={{ height }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton
            key={i}
            className="w-8 rounded-t"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}
