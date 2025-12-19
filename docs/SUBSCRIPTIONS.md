# SUBSCRIPTIONS_AND_FEATURE_GATING.md

## Subscription System & Feature Access Control

> **Critical Business Logic** - Controls which features users can access based on subscription status

---

## 1. Subscription Model Overview

### 1.1 User Type → Subscription Tiers

| User Type | Free Tier | Paid Tier | Premium Tier |
|-----------|-----------|-----------|--------------|
| **Player** | Basic profile, Team hub | + Recruiting (discover, analytics, journey) | + Priority placement, Advanced analytics |
| **College Coach** | Recruiting (discover, watchlist, pipeline) | + Team Management (roster, dev plans) | + Bulk messaging, Advanced compare |
| **HS Coach** | Team management | + College interest analytics | + Unlimited players |
| **JUCO Coach** | Either recruiting OR team | + Both modes unlocked | + Academics suite |
| **Showcase Coach** | 1 team | + Unlimited teams | + Event management |

### 1.2 Feature → Subscription Mapping

```typescript
// lib/subscriptions/feature-map.ts

export const FEATURE_REQUIREMENTS = {
  // Player Features
  'player.profile': 'free',
  'player.videos': 'free',
  'player.team_hub': 'free',
  'player.recruiting': 'player_recruiting',      // Requires subscription
  'player.discover': 'player_recruiting',
  'player.journey': 'player_recruiting',
  'player.analytics': 'player_recruiting',
  'player.camps': 'player_recruiting',
  'player.priority_placement': 'player_premium',
  
  // College Coach Features
  'coach.discover': 'free',
  'coach.watchlist': 'free',
  'coach.pipeline': 'free',
  'coach.compare': 'free',
  'coach.camps': 'free',
  'coach.team_management': 'coach_team',         // Requires subscription
  'coach.roster': 'coach_team',
  'coach.dev_plans': 'coach_team',
  'coach.team_videos': 'coach_team',
  'coach.bulk_messaging': 'coach_premium',
  
  // HS Coach Features
  'hs_coach.roster': 'free',
  'hs_coach.dev_plans': 'free',
  'hs_coach.videos': 'free',
  'hs_coach.interest_analytics': 'hs_coach_pro',
  
  // JUCO Coach Features
  'juco.single_mode': 'free',                    // Either recruiting OR team
  'juco.dual_mode': 'juco_pro',                  // Both modes
  'juco.academics': 'juco_pro',
  
  // Showcase Coach Features
  'showcase.single_team': 'free',
  'showcase.unlimited_teams': 'showcase_pro',
  'showcase.events': 'showcase_pro',
} as const;

export type FeatureKey = keyof typeof FEATURE_REQUIREMENTS;
export type SubscriptionTier = typeof FEATURE_REQUIREMENTS[FeatureKey];
```

---

## 2. Database Schema

### 2.1 Subscription Tables

```sql
-- Subscription plans (configured by admin)
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                           -- 'Player Recruiting', 'Coach Team Management'
  slug TEXT UNIQUE NOT NULL,                    -- 'player_recruiting', 'coach_team'
  description TEXT,
  user_type TEXT NOT NULL,                      -- 'player', 'college_coach', 'hs_coach', etc.
  price_monthly_cents INTEGER NOT NULL,
  price_yearly_cents INTEGER NOT NULL,
  features JSONB NOT NULL DEFAULT '[]',         -- ['recruiting', 'analytics', 'discover']
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User subscriptions
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'expired')),
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, plan_id)
);

-- Subscription history for audit
CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES user_subscriptions(id),
  event_type TEXT NOT NULL,                     -- 'created', 'renewed', 'cancelled', 'expired', 'upgraded'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_period_end ON user_subscriptions(current_period_end);
```

### 2.2 Seed Subscription Plans

```sql
-- Insert default plans
INSERT INTO subscription_plans (name, slug, user_type, price_monthly_cents, price_yearly_cents, features) VALUES
-- Player Plans
('Player Recruiting', 'player_recruiting', 'player', 1999, 19999, '["recruiting", "discover", "journey", "analytics", "camps"]'),
('Player Premium', 'player_premium', 'player', 3999, 39999, '["recruiting", "discover", "journey", "analytics", "camps", "priority_placement", "advanced_analytics"]'),

-- College Coach Plans
('Coach Team Management', 'coach_team', 'college_coach', 2999, 29999, '["team_management", "roster", "dev_plans", "team_videos"]'),
('Coach Premium', 'coach_premium', 'college_coach', 4999, 49999, '["team_management", "roster", "dev_plans", "team_videos", "bulk_messaging", "advanced_compare"]'),

-- HS Coach Plans
('HS Coach Pro', 'hs_coach_pro', 'hs_coach', 1999, 19999, '["interest_analytics", "unlimited_players"]'),

-- JUCO Coach Plans
('JUCO Pro', 'juco_pro', 'juco_coach', 2999, 29999, '["dual_mode", "academics"]'),

-- Showcase Coach Plans
('Showcase Pro', 'showcase_pro', 'showcase_coach', 3999, 39999, '["unlimited_teams", "events"]');
```

---

## 3. Feature Access Checking

### 3.1 Server-Side Check

```typescript
// lib/subscriptions/check-access.ts
import { createClient } from '@/lib/supabase/server';
import { FEATURE_REQUIREMENTS, FeatureKey } from './feature-map';

export async function hasFeatureAccess(feature: FeatureKey): Promise<boolean> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const requirement = FEATURE_REQUIREMENTS[feature];
  
  // Free features always accessible
  if (requirement === 'free') return true;

  // Check for active subscription with this feature
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select(`
      *,
      plan:subscription_plans(features)
    `)
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing'])
    .gte('current_period_end', new Date().toISOString())
    .single();

  if (!subscription) return false;

  // Check if plan includes this feature
  const planFeatures = subscription.plan?.features || [];
  return planFeatures.includes(requirement) || planFeatures.includes(feature);
}

export async function getActiveSubscription(userId: string) {
  const supabase = await createClient();
  
  const { data } = await supabase
    .from('user_subscriptions')
    .select(`
      *,
      plan:subscription_plans(*)
    `)
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .gte('current_period_end', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return data;
}

export async function getUserFeatures(userId: string): Promise<string[]> {
  const subscription = await getActiveSubscription(userId);
  
  // Base free features
  const features = ['free'];
  
  if (subscription?.plan?.features) {
    features.push(...subscription.plan.features);
  }
  
  return features;
}
```

### 3.2 Feature Gate Component

```tsx
// components/shared/FeatureGate.tsx
import { hasFeatureAccess } from '@/lib/subscriptions/check-access';
import { FeatureKey } from '@/lib/subscriptions/feature-map';
import { UpgradePrompt } from './UpgradePrompt';

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export async function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const hasAccess = await hasFeatureAccess(feature);

  if (hasAccess) {
    return <>{children}</>;
  }

  return fallback || <UpgradePrompt feature={feature} />;
}
```

### 3.3 Upgrade Prompt Component

```tsx
// components/shared/UpgradePrompt.tsx
import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';

const FEATURE_DESCRIPTIONS: Record<string, { title: string; description: string; plan: string }> = {
  'player.recruiting': {
    title: 'Unlock Recruiting Features',
    description: 'Get discovered by college coaches, track your recruiting journey, and see analytics.',
    plan: 'Player Recruiting',
  },
  'coach.team_management': {
    title: 'Unlock Team Management',
    description: 'Manage your roster, create development plans, and track player progress.',
    plan: 'Coach Team Management',
  },
  'juco.dual_mode': {
    title: 'Unlock Both Modes',
    description: 'Access recruiting and team management simultaneously.',
    plan: 'JUCO Pro',
  },
  // ... add more
};

interface UpgradePromptProps {
  feature: string;
  compact?: boolean;
}

export function UpgradePrompt({ feature, compact }: UpgradePromptProps) {
  const info = FEATURE_DESCRIPTIONS[feature] || {
    title: 'Premium Feature',
    description: 'Upgrade to access this feature.',
    plan: 'Pro',
  };

  if (compact) {
    return (
      <Link
        href="/settings/subscription"
        className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 
                   rounded-lg text-sm hover:bg-amber-100 transition-colors"
      >
        <Lock className="w-4 h-4" />
        Upgrade to unlock
      </Link>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
        <Sparkles className="w-8 h-8 text-amber-400" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">{info.title}</h2>
      <p className="text-slate-400 mb-6 max-w-md mx-auto">{info.description}</p>
      <Link
        href="/settings/subscription"
        className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 
                   text-white font-medium rounded-lg transition-colors"
      >
        Upgrade to {info.plan}
      </Link>
    </div>
  );
}
```

---

## 4. Integration Points

### 4.1 Player Recruiting Activation (After Subscription)

```tsx
// app/(dashboard)/player/activate/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { hasFeatureAccess } from '@/lib/subscriptions/check-access';
import { FeatureGate } from '@/components/shared/FeatureGate';
import { ActivationFlow } from '@/components/player/recruiting/ActivationFlow';

export default async function ActivatePage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: player } = await supabase
    .from('players')
    .select('id, recruiting_activated, profile_completion_percent')
    .eq('user_id', user.id)
    .single();

  if (!player) redirect('/onboarding/player');
  if (player.recruiting_activated) redirect('/player/discover');

  return (
    <FeatureGate 
      feature="player.recruiting"
      fallback={
        <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-6">
          <UpgradePrompt feature="player.recruiting" />
        </div>
      }
    >
      <ActivationFlow 
        playerId={player.id}
        profileCompletion={player.profile_completion_percent}
      />
    </FeatureGate>
  );
}
```

### 4.2 College Coach Team Management (After Subscription)

```tsx
// app/(dashboard)/coach/college/roster/page.tsx
import { FeatureGate } from '@/components/shared/FeatureGate';
import { RosterManagement } from '@/components/coach/roster/RosterManagement';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';

export default async function RosterPage() {
  // ... fetch coach and team data

  return (
    <FeatureGate 
      feature="coach.team_management"
      fallback={
        <div className="min-h-screen bg-[#FAF6F1]">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <h1 className="text-2xl font-semibold text-slate-900 mb-6">Team Management</h1>
            <UpgradePrompt feature="coach.team_management" />
          </div>
        </div>
      }
    >
      <RosterManagement team={team} roster={roster} />
    </FeatureGate>
  );
}
```

### 4.3 JUCO Mode Toggle (Subscription-Aware)

```tsx
// components/coach/juco/JUCOModeToggle.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, GraduationCap, Lock } from 'lucide-react';

interface JUCOModeToggleProps {
  hasProSubscription: boolean;  // Pass from server
  defaultMode?: 'recruiting' | 'team';
}

export function JUCOModeToggle({ hasProSubscription, defaultMode = 'recruiting' }: JUCOModeToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentMode = searchParams.get('mode') || defaultMode;

  const handleModeChange = (newMode: string) => {
    if (!hasProSubscription && newMode !== defaultMode) {
      // Redirect to upgrade page
      router.push('/settings/subscription?upgrade=juco_pro');
      return;
    }
    
    const params = new URLSearchParams(searchParams.toString());
    params.set('mode', newMode);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
      <button
        onClick={() => handleModeChange('recruiting')}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
          ${currentMode === 'recruiting' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}`}
      >
        <GraduationCap className="w-4 h-4" />
        Recruiting
      </button>
      <button
        onClick={() => handleModeChange('team')}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
          ${currentMode === 'team' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600'}
          ${!hasProSubscription && currentMode !== 'team' ? 'opacity-60' : ''}`}
      >
        <Users className="w-4 h-4" />
        My Team
        {!hasProSubscription && currentMode !== 'team' && (
          <Lock className="w-3 h-3 text-amber-500" />
        )}
      </button>
    </div>
  );
}
```

---

## 5. Stripe Webhook Handling

### 5.1 Webhook Route

```typescript
// app/api/webhooks/stripe/route.ts
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Use service role for webhook (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const body = await request.text();
  const signature = headers().get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(session);
      break;
    }
    
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdate(subscription);
      break;
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionCancelled(subscription);
      break;
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentFailed(invoice);
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const planSlug = session.metadata?.plan_slug;
  
  if (!userId || !planSlug) return;

  // Get plan
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('id')
    .eq('slug', planSlug)
    .single();

  if (!plan) return;

  // Get Stripe subscription details
  const stripeSubscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );

  // Create subscription record
  await supabase.from('user_subscriptions').insert({
    user_id: userId,
    plan_id: plan.id,
    status: 'active',
    billing_cycle: stripeSubscription.items.data[0].price.recurring?.interval === 'year' ? 'yearly' : 'monthly',
    current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
    stripe_subscription_id: stripeSubscription.id,
    stripe_customer_id: stripeSubscription.customer as string,
  });

  // Log event
  await supabase.from('subscription_events').insert({
    subscription_id: (await supabase
      .from('user_subscriptions')
      .select('id')
      .eq('stripe_subscription_id', stripeSubscription.id)
      .single()
    ).data?.id,
    event_type: 'created',
    metadata: { checkout_session_id: session.id },
  });

  // ACTIVATE FEATURES based on plan
  await activateFeaturesForPlan(userId, planSlug);
}

async function activateFeaturesForPlan(userId: string, planSlug: string) {
  switch (planSlug) {
    case 'player_recruiting':
    case 'player_premium':
      // Player subscribes → Set recruiting_activated = true
      await supabase
        .from('players')
        .update({ 
          recruiting_activated: true,
          recruiting_activated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
      
      // Create default player settings
      const { data: player } = await supabase
        .from('players')
        .select('id')
        .eq('user_id', userId)
        .single();
      
      if (player) {
        await supabase.from('player_settings').upsert({
          player_id: player.id,
          is_discoverable: true,
          notify_on_interest: true,
          notify_on_message: true,
        });
      }
      break;

    case 'coach_team':
    case 'coach_premium':
      // College coach subscribes → Create team if not exists
      const { data: coach } = await supabase
        .from('coaches')
        .select('id, organization_id')
        .eq('user_id', userId)
        .single();
      
      if (coach) {
        // Check if team exists
        const { data: existingTeam } = await supabase
          .from('teams')
          .select('id')
          .eq('head_coach_id', coach.id)
          .single();
        
        if (!existingTeam) {
          // Create team for this coach
          await supabase.from('teams').insert({
            head_coach_id: coach.id,
            organization_id: coach.organization_id,
            name: 'My Team',
            team_type: 'college',
          });
        }
      }
      break;

    case 'juco_pro':
      // JUCO coach subscribes → Enable dual mode
      // The mode toggle will now check subscription status
      break;

    case 'showcase_pro':
      // Showcase coach subscribes → Unlock unlimited teams
      break;
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  await supabase
    .from('user_subscriptions')
    .update({
      status: subscription.status === 'active' ? 'active' : 
              subscription.status === 'past_due' ? 'past_due' : 
              subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);
}

async function handleSubscriptionCancelled(subscription: Stripe.Subscription) {
  // Update status to expired
  await supabase
    .from('user_subscriptions')
    .update({
      status: 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  // Get user_id to deactivate features
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('user_id, plan:subscription_plans(slug)')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (sub) {
    await deactivateFeaturesForPlan(sub.user_id, sub.plan?.slug);
  }
}

async function deactivateFeaturesForPlan(userId: string, planSlug: string | undefined) {
  switch (planSlug) {
    case 'player_recruiting':
    case 'player_premium':
      // Player subscription expires → Set recruiting_activated = false
      await supabase
        .from('players')
        .update({ recruiting_activated: false })
        .eq('user_id', userId);
      break;

    // Note: For coaches, we don't delete their team data,
    // just restrict access via FeatureGate
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;
  
  await supabase
    .from('user_subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);

  // Could also trigger an email notification here
}
```

---

## 6. Navigation with Feature Gates

### 6.1 Dynamic Navigation Based on Subscription

```typescript
// lib/navigation/get-nav-items.ts
import { getUserFeatures } from '@/lib/subscriptions/check-access';

export async function getPlayerNavItems(userId: string) {
  const features = await getUserFeatures(userId);
  const hasRecruiting = features.includes('player_recruiting') || features.includes('player_premium');

  const items = [
    { label: 'Dashboard', href: '/player', icon: 'LayoutDashboard' },
    { label: 'Profile', href: '/player/profile', icon: 'User' },
    { label: 'Videos', href: '/player/videos', icon: 'Video' },
    { label: 'My Team', href: '/player/team', icon: 'Users' },
  ];

  if (hasRecruiting) {
    items.push(
      { label: 'Discover', href: '/player/discover', icon: 'Search' },
      { label: 'My Journey', href: '/player/journey', icon: 'Map' },
      { label: 'Analytics', href: '/player/analytics', icon: 'BarChart' },
      { label: 'Camps', href: '/player/camps', icon: 'Calendar' },
    );
  } else {
    items.push({
      label: 'Activate Recruiting',
      href: '/player/activate',
      icon: 'Sparkles',
      badge: 'Upgrade',
    });
  }

  items.push(
    { label: 'Messages', href: '/player/messages', icon: 'MessageSquare' },
    { label: 'Settings', href: '/player/settings', icon: 'Settings' },
  );

  return items;
}

export async function getCollegeCoachNavItems(userId: string) {
  const features = await getUserFeatures(userId);
  const hasTeamManagement = features.includes('coach_team') || features.includes('coach_premium');

  const items = [
    { label: 'Dashboard', href: '/coach/college', icon: 'LayoutDashboard' },
    { label: 'Discover', href: '/coach/college/discover', icon: 'Search' },
    { label: 'Watchlist', href: '/coach/college/watchlist', icon: 'Heart' },
    { label: 'Pipeline', href: '/coach/college/pipeline', icon: 'GitBranch' },
    { label: 'Compare', href: '/coach/college/compare', icon: 'Users' },
    { label: 'Camps', href: '/coach/college/camps', icon: 'Calendar' },
  ];

  if (hasTeamManagement) {
    items.push(
      { type: 'divider', label: 'Team Management' },
      { label: 'Roster', href: '/coach/college/roster', icon: 'Users' },
      { label: 'Dev Plans', href: '/coach/college/dev-plans', icon: 'ClipboardList' },
      { label: 'Team Videos', href: '/coach/college/team-videos', icon: 'Video' },
    );
  } else {
    items.push({
      label: 'Team Management',
      href: '/settings/subscription?upgrade=coach_team',
      icon: 'Users',
      badge: 'Upgrade',
      locked: true,
    });
  }

  items.push(
    { type: 'divider' },
    { label: 'Messages', href: '/coach/college/messages', icon: 'MessageSquare' },
    { label: 'Program', href: '/coach/college/program', icon: 'Building' },
    { label: 'Settings', href: '/coach/college/settings', icon: 'Settings' },
  );

  return items;
}
```

---

## 7. Subscription Settings Page

```tsx
// app/(dashboard)/settings/subscription/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getActiveSubscription } from '@/lib/subscriptions/check-access';
import { SubscriptionManager } from '@/components/settings/SubscriptionManager';

export default async function SubscriptionPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const subscription = await getActiveSubscription(user.id);

  // Get available plans for this user type
  // First determine user type
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  const { data: coach } = await supabase
    .from('coaches')
    .select('coach_type')
    .eq('user_id', user.id)
    .single();

  const userType = player ? 'player' : coach?.coach_type || 'unknown';

  const { data: availablePlans } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('user_type', userType)
    .eq('is_active', true)
    .order('price_monthly_cents', { ascending: true });

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">Subscription</h1>
        
        <SubscriptionManager 
          currentSubscription={subscription}
          availablePlans={availablePlans || []}
          userId={user.id}
        />
      </div>
    </div>
  );
}
```

---

## Summary

### Flow: Player Subscribes → Recruiting Activates

1. Player clicks "Upgrade" on `/player/activate`
2. Redirected to Stripe Checkout with `metadata: { user_id, plan_slug: 'player_recruiting' }`
3. Payment completes → Stripe sends `checkout.session.completed` webhook
4. Webhook handler:
   - Creates `user_subscriptions` record
   - Calls `activateFeaturesForPlan('player_recruiting')`
   - Sets `players.recruiting_activated = true`
5. Player returns to app → `FeatureGate` now allows access
6. Navigation updates to show recruiting features

### Flow: College Coach Subscribes → Team Management Activates

1. Coach clicks "Upgrade" in sidebar or `/settings/subscription`
2. Redirected to Stripe Checkout with `metadata: { user_id, plan_slug: 'coach_team' }`
3. Payment completes → Stripe webhook fires
4. Webhook handler:
   - Creates `user_subscriptions` record
   - Calls `activateFeaturesForPlan('coach_team')`
   - Creates `teams` record if not exists
5. Coach returns to app → `FeatureGate` allows access to Roster, Dev Plans, etc.
6. Navigation updates to show team management section

---

**Document End**
