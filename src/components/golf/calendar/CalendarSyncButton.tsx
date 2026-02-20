'use client';

/**
 * Calendar Sync Button Component
 *
 * A user-friendly button that opens a modal/popover for subscribing to
 * the GolfHelm calendar in external calendar apps (Google, Apple, Outlook).
 *
 * Features:
 * - One-click copy to clipboard
 * - Direct links for Google Calendar, Apple Calendar, Outlook
 * - Premium glassmorphism UI
 * - Security warning about private URLs
 * - Regenerate URL option
 */

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Calendar,
  Copy,
  Check,
  RefreshCw,
  Shield,
  X,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip } from '@/components/ui/tooltip';
import {
  getOrCreateCalendarFeedToken,
  regenerateCalendarFeedToken,
} from '@/app/golf/actions/calendar-feeds';

// Platform icons as simple SVG components
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

function OutlookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 7.387v10.478c0 .23-.08.424-.238.576-.16.154-.352.23-.578.23h-8.547v-6.959l1.63 1.203c.064.043.137.064.217.064.08 0 .153-.021.217-.064l7.061-5.209c.08-.054.16-.095.238-.064z" fill="#0072C6"/>
      <path d="M15.758 8.162l-1.121-.826-5.12 3.652v8.164h11.666c.227 0 .418-.076.575-.23.16-.152.238-.346.238-.575V8.896l-6.238 4.303z" fill="#0072C6"/>
      <path d="M8.586 5.027v14.946l-8.348-2.473V7.5z" fill="#0072C6"/>
      <path d="M8.586 5.027L.238 7.5v10l8.348 2.473V5.027z" fill="#0364B8"/>
      <path d="M6.18 10.846c-.285-.425-.69-.637-1.216-.637-.555 0-.988.223-1.297.67-.308.446-.463 1.044-.463 1.793 0 .76.15 1.362.449 1.805.3.443.722.664 1.266.664.535 0 .953-.21 1.254-.629.3-.42.45-1 .45-1.74 0-.789-.148-1.5-.443-1.926zm.967 4.344c-.507.621-1.221.932-2.14.932-.89 0-1.586-.315-2.088-.946-.502-.63-.753-1.489-.753-2.577 0-1.128.267-2.017.802-2.668.535-.651 1.256-.976 2.164-.976.907 0 1.613.318 2.117.955.505.637.757 1.505.757 2.604 0 1.105-.287 1.998-.86 2.676z" fill="#fff"/>
    </svg>
  );
}

interface CalendarSyncButtonProps {
  variant?: 'icon' | 'button';
  className?: string;
}

export function CalendarSyncButton({
  variant = 'icon',
  className,
}: CalendarSyncButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load feed URL when modal opens
  const loadFeedUrl = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getOrCreateCalendarFeedToken();
      if (result.success && result.data) {
        setFeedUrl(result.data.url);
      } else {
        setError(result.error || 'Failed to load calendar feed URL');
      }
    } catch {
      setError('Failed to load calendar feed URL');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !feedUrl) {
      void loadFeedUrl();
    }
  }, [isOpen, feedUrl, loadFeedUrl]);

  // Copy URL to clipboard
  async function handleCopy() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Failed to copy URL to clipboard');
    }
  }

  // Regenerate feed URL
  async function handleRegenerate() {
    setRegenerating(true);
    setError(null);
    try {
      const result = await regenerateCalendarFeedToken();
      if (result.success && result.data) {
        setFeedUrl(result.data.url);
      } else {
        setError(result.error || 'Failed to regenerate URL');
      }
    } catch {
      setError('Failed to regenerate URL');
    } finally {
      setRegenerating(false);
    }
  }

  // Generate calendar app URLs
  function getCalendarUrls() {
    if (!feedUrl) return null;

    const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://');

    return {
      // webcal:// protocol for Apple Calendar
      webcal: webcalUrl,
      // Google Calendar add by URL
      google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`,
      // Outlook add from web
      outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent('GolfHelm Calendar')}`,
      // Apple Calendar (same as webcal)
      apple: webcalUrl,
    };
  }

  const calendarUrls = getCalendarUrls();

  return (
    <>
      {/* Trigger Button */}
      {variant === 'icon' ? (
        <Tooltip content="Subscribe to Calendar" side="right">
          <button
            onClick={() => setIsOpen(true)}
            className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center',
              'bg-white/60 hover:bg-white/80 active:bg-white/90 backdrop-blur-sm',
              'border border-white/40 hover:border-primary-200',
              'text-warm-500 hover:text-primary-600',
              'shadow-sm hover:shadow-md',
              'transition-all duration-200',
              className
            )}
            aria-label="Subscribe to Calendar"
          >
            <Calendar className="w-5 h-5" />
          </button>
        </Tooltip>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2.5',
            'rounded-lg font-medium text-sm',
            'bg-primary-600 hover:bg-primary-700 active:scale-95 text-white',
            'shadow-sm hover:shadow-md',
            'transition-all duration-200',
            className
          )}
        >
          <Calendar className="w-4 h-4" />
          Subscribe to Calendar
        </button>
      )}

      {/* Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className={cn(
            'max-w-md p-0 overflow-hidden',
            'bg-white/95 backdrop-blur-xl',
            'border border-white/50',
            'shadow-2xl'
          )}
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-warm-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-warm-900">
                    Subscribe to Calendar
                  </DialogTitle>
                  <p className="text-sm text-warm-500 mt-0.5">
                    Add GolfHelm events to your calendar
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg hover:bg-warm-100 active:bg-warm-200 text-warm-400 hover:text-warm-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </DialogHeader>

          <div className="px-6 py-5 space-y-5">
            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                <p className="text-sm text-rose-700">{error}</p>
                <button
                  onClick={loadFeedUrl}
                  className="mt-2 text-sm font-medium text-rose-600 hover:text-rose-700"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Feed URL Section */}
            {feedUrl && !loading && (
              <>
                {/* Copy URL */}
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-2">
                    Calendar Feed URL
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-warm-50 border border-warm-200">
                      <code className="text-xs text-warm-600 truncate block font-mono">
                        {feedUrl.replace(/^https?:\/\//, 'webcal://')}
                      </code>
                    </div>
                    <button
                      onClick={handleCopy}
                      className={cn(
                        'shrink-0 p-2.5 rounded-lg font-medium text-sm transition-all',
                        copied
                          ? 'bg-primary-100 text-primary-700'
                          : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                      )}
                      title="Copy URL"
                      aria-label={copied ? 'Copied' : 'Copy URL'}
                    >
                      {copied ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Quick Add Buttons */}
                <div>
                  <p className="text-sm font-medium text-warm-700 mb-3">
                    Or add directly to:
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Google Calendar */}
                    <a
                      href={calendarUrls?.google}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-xl',
                        'border-2 border-warm-200 hover:border-blue-300',
                        'bg-white hover:bg-blue-50 active:bg-blue-100',
                        'transition-all duration-200 group'
                      )}
                    >
                      <GoogleIcon className="w-6 h-6" />
                      <span className="text-xs font-medium text-warm-700 group-hover:text-blue-700">
                        Google
                      </span>
                    </a>

                    {/* Apple Calendar */}
                    <a
                      href={calendarUrls?.apple}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-xl',
                        'border-2 border-warm-200 hover:border-warm-400',
                        'bg-white hover:bg-warm-50 active:bg-warm-100',
                        'transition-all duration-200 group'
                      )}
                    >
                      <AppleIcon className="w-6 h-6 text-warm-800" />
                      <span className="text-xs font-medium text-warm-700 group-hover:text-warm-900">
                        Apple
                      </span>
                    </a>

                    {/* Outlook */}
                    <a
                      href={calendarUrls?.outlook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-xl',
                        'border-2 border-warm-200 hover:border-blue-300',
                        'bg-white hover:bg-blue-50 active:bg-blue-100',
                        'transition-all duration-200 group'
                      )}
                    >
                      <OutlookIcon className="w-6 h-6" />
                      <span className="text-xs font-medium text-warm-700 group-hover:text-blue-700">
                        Outlook
                      </span>
                    </a>
                  </div>
                </div>

                {/* Security Warning */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-800">
                      This link is private
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      Anyone with this URL can see your calendar events. Don&apos;t share it publicly.
                    </p>
                  </div>
                </div>

                {/* Regenerate Option */}
                <div className="pt-2 border-t border-warm-100">
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className={cn(
                      'flex items-center gap-2 text-sm text-warm-600 hover:text-warm-900',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'transition-colors'
                    )}
                  >
                    <RefreshCw
                      className={cn(
                        'w-4 h-4',
                        regenerating && 'animate-spin'
                      )}
                    />
                    <span>
                      {regenerating ? 'Regenerating...' : 'Regenerate URL'}
                    </span>
                  </button>
                  <p className="text-xs text-warm-500 mt-1.5 pl-6">
                    This will invalidate the old URL and create a new one
                  </p>
                </div>
              </>
            )}
          </div>

                  </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Compact variant for inline use
 */
export function CalendarSyncChip({
  feedUrl,
  className,
}: {
  feedUrl: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copy failed
    }
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
        'bg-primary-50 border border-primary-200',
        className
      )}
    >
      <Calendar className="w-3.5 h-3.5 text-primary-600" />
      <span className="text-xs font-medium text-primary-700">
        Calendar Sync
      </span>
      <button
        onClick={handleCopy}
        className={cn(
          'p-1 rounded-full transition-colors',
          copied
            ? 'bg-primary-200 text-primary-700'
            : 'bg-white/60 text-primary-600 hover:bg-white'
        )}
        aria-label={copied ? 'Copied' : 'Copy calendar URL'}
      >
        {copied ? (
          <Check className="w-3 h-3" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}
