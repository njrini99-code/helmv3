'use client';

/**
 * Subscription Instructions Component
 *
 * Platform-specific help for subscribing to calendar feeds:
 * - Apple Calendar (iOS, macOS)
 * - Google Calendar (web, mobile)
 * - Microsoft Outlook (web, desktop, mobile)
 *
 * Fairway tokens only — renders inline inside FeedCard (itself inside the
 * live Fairway "Subscribe to your calendar" Sheet), so no legacy cream/warm/
 * amber/blue chrome.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Apple,
  CalendarDays,
  Copy,
  Check,
  ExternalLink,
  Smartphone,
  Monitor,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import { SelectablePill, Inset, InlineNotice, IconButton } from '@/components/fairway';

interface SubscriptionInstructionsProps {
  feedUrl: string;
  compact?: boolean;
  className?: string;
}

type Platform = 'apple' | 'google' | 'outlook';

const PLATFORMS: Array<{ id: Platform; name: string; icon: LucideIcon }> = [
  { id: 'apple', name: 'Apple', icon: Apple },
  { id: 'google', name: 'Google', icon: CalendarDays },
  { id: 'outlook', name: 'Outlook', icon: Globe },
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
          <p className="mb-3 font-fw-sans text-body-sm font-medium text-text-secondary">
            Choose your calendar app:
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {PLATFORMS.map((platform) => {
            const Icon = platform.icon;
            const isSelected = selectedPlatform === platform.id;

            return (
              <SelectablePill
                key={platform.id}
                shape="round"
                active={isSelected}
                onClick={() => setSelectedPlatform(platform.id)}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {platform.name}
                </span>
              </SelectablePill>
            );
          })}
        </div>
      </div>

      {/* Copy URL (prominent) */}
      {!compact && (
        <Inset padding="sm" className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 font-fw-sans text-body-sm font-medium text-text-primary">
              First, copy this URL:
            </p>
            <code className="block break-all font-mono text-caption text-text-secondary">{feedUrl}</code>
          </div>
          <IconButton
            variant={copied ? 'primary' : 'secondary'}
            size="sm"
            onClick={handleCopy}
            aria-label={copied ? 'URL copied' : 'Copy feed URL'}
          >
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          </IconButton>
        </Inset>
      )}

      {/* Platform-specific instructions */}
      <Inset padding={compact ? 'sm' : 'md'}>
        {selectedPlatform === 'apple' && <AppleInstructions compact={compact} />}
        {selectedPlatform === 'google' && <GoogleInstructions compact={compact} />}
        {selectedPlatform === 'outlook' && <OutlookInstructions compact={compact} />}
      </Inset>

      {/* Help footer */}
      {!compact && (
        <InlineNotice tone="info" icon={ExternalLink} title="Need more help?">
          Contact support or check our detailed guide on subscribing to calendar feeds.
        </InlineNotice>
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

  return <InstructionSections sections={steps} compact={compact} />;
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
      <InstructionSections sections={steps} compact={compact} />
      <InlineNotice tone="info">
        Google Calendar may take 12-24 hours to fully sync external calendars.
      </InlineNotice>
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

  return <InstructionSections sections={steps} compact={compact} />;
}

/**
 * Shared step-list renderer for the three platform instruction sets.
 */
function InstructionSections({
  sections,
  compact,
}: {
  sections: Array<{ icon: LucideIcon; title: string; steps: string[] }>;
  compact?: boolean;
}) {
  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      {sections.map((section, idx) => {
        const Icon = section.icon;
        return (
          <div key={idx}>
            <div className="mb-2 flex items-center gap-2">
              <Icon className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
              <h4
                className={cn(
                  'font-fw-sans font-medium text-text-primary',
                  compact ? 'text-caption' : 'text-body-sm',
                )}
              >
                {section.title}
              </h4>
            </div>
            <ol className="space-y-1.5 pl-6">
              {section.steps.map((step, stepIdx) => (
                <li
                  key={stepIdx}
                  className={cn(
                    'flex items-baseline gap-2 font-fw-sans text-text-secondary',
                    compact ? 'text-caption' : 'text-body-sm',
                  )}
                >
                  <span className="shrink-0 font-medium text-accent-600">{stepIdx + 1}.</span>
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
