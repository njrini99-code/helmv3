'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { logError, type ErrorContext } from '@/lib/error-logging';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export interface ErrorFallbackProps {
  error: Error | null;
  resetError: () => void;
}

/**
 * Root Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error using centralized logging service
    const context: ErrorContext = {
      component: 'ErrorBoundary',
      componentStack: errorInfo.componentStack,
    };

    logError(error, context, 'high');

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return (
        <FallbackComponent
          error={this.state.error}
          resetError={this.resetError}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Default Error Fallback UI
 * Shows when an error is caught and no custom fallback is provided
 */
function DefaultErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 max-w-md w-full text-center">
        {/* Error Icon */}
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-100 flex items-center justify-center mb-4">
          <svg
            className="h-8 w-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Error Message */}
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          Something went wrong
        </h2>
        <p className="text-sm leading-relaxed text-slate-600 mb-6">
          We encountered an unexpected error. Please try refreshing the page.
        </p>

        {/* Error Details (Development Only) */}
        {process.env.NODE_ENV === 'development' && error && (
          <details className="mb-6 text-left">
            <summary className="text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700 mb-2">
              Error Details
            </summary>
            <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-32 text-red-600">
              {error.message}
              {'\n\n'}
              {error.stack}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Refresh Page
          </Button>
          <Button variant="primary" onClick={resetError}>
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Route-specific Error Fallback for Discover Page
 */
export function DiscoverErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
        <svg
          className="h-8 w-8 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        Failed to load players
      </h3>
      <p className="text-sm leading-relaxed text-slate-500 mb-4 max-w-md">
        We couldn't load the player list. This might be a temporary issue.
      </p>
      {process.env.NODE_ENV === 'development' && error && (
        <p className="text-xs text-red-600 mb-4 font-mono">{error.message}</p>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Refresh Page
        </Button>
        <Button variant="primary" onClick={resetError}>
          Try Again
        </Button>
      </div>
    </div>
  );
}

/**
 * Route-specific Error Fallback for Messages Page
 */
export function MessagesErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
        <svg
          className="h-8 w-8 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        Failed to load messages
      </h3>
      <p className="text-sm leading-relaxed text-slate-500 mb-4 max-w-md">
        We couldn't load your conversations. Please try again.
      </p>
      {process.env.NODE_ENV === 'development' && error && (
        <p className="text-xs text-red-600 mb-4 font-mono">{error.message}</p>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Refresh Page
        </Button>
        <Button variant="primary" onClick={resetError}>
          Try Again
        </Button>
      </div>
    </div>
  );
}

/**
 * Route-specific Error Fallback for Player Profile
 */
export function ProfileErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
        <svg
          className="h-8 w-8 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        Failed to load profile
      </h3>
      <p className="text-sm leading-relaxed text-slate-500 mb-4 max-w-md">
        We couldn't load this player's profile. They may not exist or there might be a connection issue.
      </p>
      {process.env.NODE_ENV === 'development' && error && (
        <p className="text-xs text-red-600 mb-4 font-mono">{error.message}</p>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => window.history.back()}>
          Go Back
        </Button>
        <Button variant="primary" onClick={resetError}>
          Try Again
        </Button>
      </div>
    </div>
  );
}
