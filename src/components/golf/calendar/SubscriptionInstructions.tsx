'use client';

/**
 * Subscription Instructions Component
 *
 * Platform-specific help for subscribing to calendar feeds:
 * - Apple Calendar (iOS, macOS)
 * - Google Calendar (web, mobile)
 * - Microsoft Outlook (web, desktop, mobile)
 *
 * Features:
 * - Tab-based platform selector
 * - Step-by-step instructions with icons
 * - Copy URL button integrated
 * - Visual hierarchy for easy scanning
 * - Responsive layout (mobile-first)
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Apple,
  Chrome,
  Copy,
  Check,
  ExternalLink,
  Smartphone,
  Monitor,
  Globe,
} from 'lucide-react';
import '@/styles/calendar-tokens.css';

interface SubscriptionInstructionsProps {
  feedUrl: string;
  compact?: boolean;
  className?: string;
}

type Platform = 'apple' | 'google' | 'outlook';

const PLATFORMS = [
  {
    id: 'apple' as Platform,
    name: 'Apple',
    icon: Apple,
    devices: ['iPhone/iPad', 'Mac'],
  },
  {
    id: 'google' as Platform,
    name: 'Google',
    icon: Chrome,
    devices: ['Web', 'Android'],
  },
  {
    id: 'outlook' as Platform,
    name: 'Outlook',
    icon: Globe,
    devices: ['Web', 'Desktop', 'Mobile'],
  },
];

export function SubscriptionInstructions({
  feedUrl,
  compact = false,
  className,
}: SubscriptionInstructionsProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('apple');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copy failed - button will remain in default state
    }
  }

  return (
    <div className={cn('space-y-4', !compact && 'py-4', className)}>
      {/* Platform tabs */}
      <div>
        {!compact && (
          <p className="text-sm font-medium text-warm-700 mb-3">
            Choose your calendar app:
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {PLATFORMS.map((platform) => {
            const Icon = platform.icon;
            const isSelected = selectedPlatform === platform.id;

            return (
              <button
                key={platform.id}
                type="button"
                onClick={() => setSelectedPlatform(platform.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm',
                  'border-2 transition-all duration-200',
                  isSelected
                    ? 'bg-primary-600 text-white border-primary-600 shadow-md'
                    : 'bg-white text-warm-700 border-warm-200 hover:border-warm-300'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{platform.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Copy URL button (prominent) */}
      {!compact && (
        <div className="p-4 rounded-lg bg-primary-50 border border-primary-200">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-primary-900 mb-1">
                First, copy this URL:
              </p>
              <code className="text-xs text-primary-700 font-mono break-all block">
                {feedUrl}
              </code>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'shrink-0 px-3 py-2 rounded-lg font-medium text-sm transition-all',
                copied
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-primary-700 border border-primary-200 hover:bg-primary-100'
              )}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 inline mr-1.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 inline mr-1.5" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Platform-specific instructions */}
      <div className={cn('rounded-lg border border-warm-200', compact ? 'p-3' : 'p-4', 'bg-white')}>
        {selectedPlatform === 'apple' && <AppleInstructions compact={compact} />}
        {selectedPlatform === 'google' && <GoogleInstructions compact={compact} />}
        {selectedPlatform === 'outlook' && <OutlookInstructions compact={compact} />}
      </div>

      {/* Help footer */}
      {!compact && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
          <ExternalLink className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900 mb-0.5">
              Need more help?
            </p>
            <p className="text-xs text-blue-700">
              Contact support or check our detailed guide on subscribing to calendar feeds
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Apple Calendar Instructions
 */
function AppleInstructions({ compact }: { compact?: boolean }) {
  const steps = [
    {
      icon: Smartphone,
      title: 'On iPhone/iPad:',
      steps: [
        'Open Settings app',
        'Tap "Calendar" → "Accounts" → "Add Account"',
        'Select "Other" → "Add Subscribed Calendar"',
        'Paste the feed URL',
        'Tap "Next" and then "Save"',
      ],
    },
    {
      icon: Monitor,
      title: 'On Mac:',
      steps: [
        'Open Calendar app',
        'Go to File → New Calendar Subscription',
        'Paste the feed URL',
        'Click "Subscribe"',
        'Choose refresh frequency and click "OK"',
      ],
    },
  ];

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      {steps.map((section, idx) => {
        const Icon = section.icon;
        return (
          <div key={idx}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-warm-500" />
              <h4 className={cn('font-semibold text-warm-900', compact ? 'text-xs' : 'text-sm')}>
                {section.title}
              </h4>
            </div>
            <ol className="space-y-1.5 pl-6">
              {section.steps.map((step, stepIdx) => (
                <li
                  key={stepIdx}
                  className={cn(
                    'text-warm-600 flex items-baseline gap-2',
                    compact ? 'text-xs' : 'text-sm'
                  )}
                >
                  <span className="text-primary-600 font-semibold shrink-0">{stepIdx + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Google Calendar Instructions
 */
function GoogleInstructions({ compact }: { compact?: boolean }) {
  const steps = [
    {
      icon: Globe,
      title: 'On Web (calendar.google.com):',
      steps: [
        'Click the + next to "Other calendars"',
        'Select "From URL"',
        'Paste the feed URL',
        'Click "Add calendar"',
        'Wait a few minutes for events to appear',
      ],
    },
    {
      icon: Smartphone,
      title: 'On Android:',
      steps: [
        'Open Google Calendar app',
        'Go to Settings',
        'Tap your email account',
        'Subscribe to the calendar using the web method above',
        'The calendar will sync to your phone automatically',
      ],
    },
  ];

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      {steps.map((section, idx) => {
        const Icon = section.icon;
        return (
          <div key={idx}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-warm-500" />
              <h4 className={cn('font-semibold text-warm-900', compact ? 'text-xs' : 'text-sm')}>
                {section.title}
              </h4>
            </div>
            <ol className="space-y-1.5 pl-6">
              {section.steps.map((step, stepIdx) => (
                <li
                  key={stepIdx}
                  className={cn(
                    'text-warm-600 flex items-baseline gap-2',
                    compact ? 'text-xs' : 'text-sm'
                  )}
                >
                  <span className="text-primary-600 font-semibold shrink-0">{stepIdx + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}

      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
        <p className={cn('text-amber-800', compact ? 'text-xs' : 'text-sm')}>
          <strong>Note:</strong> Google Calendar may take 12-24 hours to fully sync external calendars
        </p>
      </div>
    </div>
  );
}

/**
 * Outlook Instructions
 */
function OutlookInstructions({ compact }: { compact?: boolean }) {
  const steps = [
    {
      icon: Globe,
      title: 'On Web (outlook.com):',
      steps: [
        'Click "Add calendar" in the left sidebar',
        'Select "Subscribe from web"',
        'Paste the feed URL',
        'Give it a name and choose a color',
        'Click "Import"',
      ],
    },
    {
      icon: Monitor,
      title: 'On Desktop (Outlook app):',
      steps: [
        'Go to File → Account Settings → Account Settings',
        'Go to "Internet Calendars" tab',
        'Click "New..."',
        'Paste the feed URL',
        'Click "Add" and customize the name',
      ],
    },
  ];

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      {steps.map((section, idx) => {
        const Icon = section.icon;
        return (
          <div key={idx}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-warm-500" />
              <h4 className={cn('font-semibold text-warm-900', compact ? 'text-xs' : 'text-sm')}>
                {section.title}
              </h4>
            </div>
            <ol className="space-y-1.5 pl-6">
              {section.steps.map((step, stepIdx) => (
                <li
                  key={stepIdx}
                  className={cn(
                    'text-warm-600 flex items-baseline gap-2',
                    compact ? 'text-xs' : 'text-sm'
                  )}
                >
                  <span className="text-primary-600 font-semibold shrink-0">{stepIdx + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

