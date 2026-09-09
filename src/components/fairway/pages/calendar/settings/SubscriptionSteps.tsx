'use client';

/**
 * ============================================================================
 * Fairway · Calendar · SubscriptionSteps — S9 setup instructions
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.9 "step-by-step instructions per platform in a
 * collapsed section". Deliberately does NOT take a `feedUrl` prop and never
 * re-prints one: the legacy `SubscriptionInstructions` echoed the full
 * (unmasked) URL a second time inside these steps, which is exactly the kind
 * of exposure `CalendarSubscriptionsSheet` masks the URL to avoid. Every step
 * instead says "paste the link you copied above".
 * ========================================================================== */

import * as React from 'react';
import { Apple, CalendarDays, Globe, type LucideIcon } from 'lucide-react';
import { Segmented, Inset } from '@/components/fairway';
import { cn } from '@/lib/utils';

type Platform = 'apple' | 'google' | 'outlook';

const PLATFORMS: ReadonlyArray<{ value: Platform; label: string; icon: LucideIcon; steps: string[] }> = [
  {
    value: 'apple',
    label: 'Apple',
    icon: Apple,
    steps: [
      'Copy the link for the calendar you want above.',
      'On iPhone/iPad: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar.',
      'On Mac: Calendar app → File → New Calendar Subscription.',
      'Paste the link you copied, then Subscribe.',
    ],
  },
  {
    value: 'google',
    label: 'Google',
    icon: CalendarDays,
    steps: [
      'Copy the link for the calendar you want above.',
      'On the web: Google Calendar → Other calendars (+) → From URL.',
      'Paste the link you copied, then Add calendar.',
      'New events can take a few hours to appear — Google refreshes subscribed calendars on its own schedule.',
    ],
  },
  {
    value: 'outlook',
    label: 'Outlook',
    icon: Globe,
    steps: [
      'Copy the link for the calendar you want above.',
      'On the web: Outlook → Add calendar → Subscribe from web.',
      'Paste the link you copied, name it, then Import.',
    ],
  },
];

export interface SubscriptionStepsProps {
  className?: string;
}

export function SubscriptionSteps({ className }: SubscriptionStepsProps) {
  const [platform, setPlatform] = React.useState<Platform>('apple');
  const active = PLATFORMS.find((p) => p.value === platform) ?? PLATFORMS[0]!;

  return (
    <div className={cn('space-y-3', className)}>
      <Segmented<Platform>
        aria-label="Choose your calendar app"
        size="sm"
        options={PLATFORMS.map((p) => ({ value: p.value, label: p.label, icon: <p.icon className="h-3.5 w-3.5" aria-hidden /> }))}
        value={platform}
        onValueChange={setPlatform}
      />
      <Inset padding="sm">
        <ol className="list-decimal space-y-1.5 pl-4 font-fw-sans text-caption text-text-secondary">
          {active.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </Inset>
      <p className="font-fw-sans text-caption text-text-tertiary">
        One-way: changes made in {active.label} never sync back to Helm.
      </p>
    </div>
  );
}
