# PHASE_4_PLAYER_RECRUITING.md

## Player Recruiting Features - Complete Implementation Guide

> **Duration:** 3 days
> **Prerequisites:** Phase 3 (Player Core) complete
> **Goal:** Fully functional Player recruiting experience

---

## Table of Contents

1. [Overview](#1-overview)
2. [Recruiting Activation](#2-recruiting-activation)
3. [Discover Colleges](#3-discover-colleges)
4. [My Journey](#4-my-journey)
5. [Camps Browser](#5-camps-browser)
6. [Analytics Dashboard](#6-analytics-dashboard)
7. [Anonymous vs Identified Interest](#7-anonymous-vs-identified-interest)
8. [API Routes & Server Actions](#8-api-routes--server-actions)

---

## 1. Overview

### 1.1 Feature Summary

| Feature | Description | Complexity |
|---------|-------------|------------|
| Activation Flow | Opt-in to recruiting features | Medium |
| Discover Colleges | Search/filter colleges, add to interests | Medium |
| My Journey | Track recruiting milestones/timeline | Medium |
| Camps Browser | Find and register for camps | Medium |
| Analytics | View profile engagement data | High |
| Interest Logic | Anonymous vs identified coach views | Medium |

### 1.2 File Structure

```
app/(dashboard)/player/
├── activate/
│   └── page.tsx               # Activation flow
├── discover/
│   └── page.tsx               # Discover colleges
├── journey/
│   └── page.tsx               # My journey timeline
├── camps/
│   ├── page.tsx               # Camps browser
│   └── [campId]/page.tsx      # Camp detail
├── analytics/
│   └── page.tsx               # Analytics dashboard
└── messages/
    └── page.tsx               # Messages with coaches

components/player/
├── recruiting/
│   ├── ActivationModal.tsx
│   ├── ActivationBenefits.tsx
│   ├── ModeToggle.tsx
│   └── RecruitingLockedOverlay.tsx
├── discover/
│   ├── CollegeCard.tsx
│   ├── CollegeFilters.tsx
│   ├── CollegeGrid.tsx
│   └── AddToInterestsButton.tsx
├── journey/
│   ├── JourneyTimeline.tsx
│   ├── MilestoneCard.tsx
│   ├── AddMilestoneModal.tsx
│   └── InterestsList.tsx
├── camps/
│   ├── CampBrowser.tsx
│   ├── CampCard.tsx
│   └── CampRegistrationModal.tsx
└── analytics/
    ├── EngagementChart.tsx
    ├── ViewsOverTime.tsx
    ├── TopSchoolsViewing.tsx
    └── InterestBreakdown.tsx
```

---

## 2. Recruiting Activation

### 2.1 Activation Page

```tsx
// app/(dashboard)/player/activate/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ActivationFlow } from '@/components/player/recruiting/ActivationFlow';

export default async function ActivatePage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: player } = await supabase
    .from('players')
    .select('id, player_type, recruiting_activated, profile_completion_percent')
    .eq('user_id', user.id)
    .single();

  if (!player) redirect('/onboarding/player');

  // Already activated
  if (player.recruiting_activated) {
    redirect('/player/discover');
  }

  // College players can't activate recruiting
  if (player.player_type === 'college') {
    redirect('/player');
  }

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <ActivationFlow 
          playerId={player.id}
          profileCompletion={player.profile_completion_percent}
        />
      </div>
    </div>
  );
}
```

### 2.2 Activation Flow Component

```tsx
// components/player/recruiting/ActivationFlow.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, MessageSquare, BarChart3, Shield, ChevronRight } from 'lucide-react';
import { activateRecruiting } from '@/app/actions/recruiting';

interface ActivationFlowProps {
  playerId: string;
  profileCompletion: number;
}

const BENEFITS = [
  {
    icon: Eye,
    title: 'Get Discovered',
    description: 'Appear in college coach searches and be found based on your skills and metrics.',
  },
  {
    icon: MessageSquare,
    title: 'Connect with Coaches',
    description: 'Receive and send messages directly to college coaching staff.',
  },
  {
    icon: BarChart3,
    title: 'Track Your Interest',
    description: 'See which colleges are viewing your profile and adding you to watchlists.',
  },
  {
    icon: Shield,
    title: 'Control Your Privacy',
    description: 'Choose what information is visible and who can contact you.',
  },
];

export function ActivationFlow({ playerId, profileCompletion }: ActivationFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleActivate = async () => {
    setLoading(true);
    try {
      await activateRecruiting(playerId);
      router.push('/player/discover');
      router.refresh();
    } catch (error) {
      console.error('Activation failed:', error);
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 px-8 py-12 text-white text-center">
        <h1 className="text-3xl font-bold mb-2">Activate Recruiting</h1>
        <p className="text-green-100">
          Take the next step in your baseball journey
        </p>
      </div>

      {/* Progress */}
      <div className="px-8 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${step >= s ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-400'}`}
              >
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-16 h-0.5 mx-2 ${step > s ? 'bg-green-600' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="p-8">
        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-6">
              What You'll Get
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {BENEFITS.map((benefit) => (
                <div key={benefit.title} className="flex gap-4 p-4 bg-slate-50 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                    <benefit.icon className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-900">{benefit.title}</h3>
                    <p className="text-sm text-slate-500 mt-1">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 
                         bg-green-600 hover:bg-green-700 text-white font-medium 
                         rounded-lg transition-colors"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              Profile Check
            </h2>
            <p className="text-slate-500 mb-6">
              Complete your profile to get the most out of recruiting.
            </p>

            {/* Profile Completion */}
            <div className="p-6 bg-slate-50 rounded-xl mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-slate-900">Profile Completion</span>
                <span className="text-2xl font-bold text-green-600">{profileCompletion}%</span>
              </div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${profileCompletion}%` }}
                />
              </div>
              {profileCompletion < 80 && (
                <p className="text-sm text-amber-600 mt-3">
                  ⚠️ We recommend at least 80% completion for best results
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 text-slate-700 font-medium hover:bg-slate-100 
                           rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 
                           bg-green-600 hover:bg-green-700 text-white font-medium 
                           rounded-lg transition-colors"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              Terms & Privacy
            </h2>
            <p className="text-slate-500 mb-6">
              Please review and accept to activate recruiting.
            </p>

            {/* Terms Summary */}
            <div className="p-4 bg-slate-50 rounded-xl mb-6 max-h-48 overflow-y-auto">
              <h3 className="font-medium text-slate-900 mb-2">By activating recruiting:</h3>
              <ul className="text-sm text-slate-600 space-y-2">
                <li>• Your profile will be visible to college coaches</li>
                <li>• Coaches can view your stats, videos, and contact information (based on your settings)</li>
                <li>• You'll receive notifications when coaches show interest</li>
                <li>• You can deactivate at any time from your settings</li>
                <li>• Your data will be handled according to our privacy policy</li>
              </ul>
            </div>

            {/* Agreement Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer mb-6">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-green-600 
                           focus:ring-green-500 mt-0.5"
              />
              <span className="text-sm text-slate-600">
                I agree to the <a href="#" className="text-green-600 hover:underline">Terms of Service</a> and{' '}
                <a href="#" className="text-green-600 hover:underline">Privacy Policy</a>
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="px-6 py-3 text-slate-700 font-medium hover:bg-slate-100 
                           rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleActivate}
                disabled={!agreedToTerms || loading}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white 
                           font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Activating...' : 'Activate Recruiting'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 3. Discover Colleges

### 3.1 Discover Colleges Page

```tsx
// app/(dashboard)/player/discover/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CollegeGrid } from '@/components/player/discover/CollegeGrid';
import { CollegeFilters } from '@/components/player/discover/CollegeFilters';

interface SearchParams {
  division?: string;
  state?: string;
  conference?: string;
  search?: string;
  page?: string;
}

export default async function DiscoverCollegesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: player } = await supabase
    .from('players')
    .select('id, recruiting_activated')
    .eq('user_id', user.id)
    .single();

  if (!player) redirect('/onboarding/player');
  if (!player.recruiting_activated) redirect('/player/activate');

  // Build query for colleges (organizations of type 'college' or 'juco')
  let query = supabase
    .from('organizations')
    .select('*', { count: 'exact' })
    .in('type', ['college', 'juco']);

  // Apply filters
  if (searchParams.division) {
    query = query.eq('division', searchParams.division);
  }
  if (searchParams.state) {
    query = query.eq('location_state', searchParams.state);
  }
  if (searchParams.conference) {
    query = query.eq('conference', searchParams.conference);
  }
  if (searchParams.search) {
    query = query.ilike('name', `%${searchParams.search}%`);
  }

  const page = parseInt(searchParams.page || '1');
  const perPage = 24;
  const offset = (page - 1) * perPage;

  const { data: colleges, count } = await query
    .order('name', { ascending: true })
    .range(offset, offset + perPage - 1);

  // Get player's current interests
  const { data: interests } = await supabase
    .from('recruiting_interests')
    .select('organization_id')
    .eq('player_id', player.id);

  const interestIds = new Set(interests?.map(i => i.organization_id) || []);
  const totalPages = Math.ceil((count || 0) / perPage);

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Discover Colleges</h1>
          <p className="text-slate-500 mt-1">
            Find and track colleges you're interested in
          </p>
        </div>

        <div className="flex gap-6">
          {/* Filters */}
          <div className="w-64 flex-shrink-0">
            <CollegeFilters currentFilters={searchParams} />
          </div>

          {/* Results */}
          <div className="flex-1">
            <CollegeGrid 
              colleges={colleges || []}
              interestIds={interestIds}
              playerId={player.id}
              totalCount={count || 0}
              currentPage={page}
              totalPages={totalPages}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 3.2 College Card Component

```tsx
// components/player/discover/CollegeCard.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, Star, Check, Plus } from 'lucide-react';
import { addToInterests, removeFromInterests } from '@/app/actions/recruiting';

interface College {
  id: string;
  name: string;
  type: string;
  division: string | null;
  conference: string | null;
  location_city: string | null;
  location_state: string | null;
  logo_url: string | null;
  primary_color: string | null;
}

interface CollegeCardProps {
  college: College;
  isInterested: boolean;
  playerId: string;
}

export function CollegeCard({ college, isInterested, playerId }: CollegeCardProps) {
  const [interested, setInterested] = useState(isInterested);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (interested) {
        await removeFromInterests(playerId, college.id);
        setInterested(false);
      } else {
        await addToInterests(playerId, college.id, college.name);
        setInterested(true);
      }
    } catch (error) {
      console.error('Toggle failed:', error);
    }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden
                    hover:border-green-200 hover:shadow-md transition-all">
      {/* Header with Logo */}
      <div 
        className="h-24 flex items-center justify-center"
        style={{ backgroundColor: college.primary_color || '#16A34A' }}
      >
        {college.logo_url ? (
          <img 
            src={college.logo_url} 
            alt={college.name}
            className="h-16 w-auto object-contain"
          />
        ) : (
          <span className="text-3xl font-bold text-white">
            {college.name.split(' ').map(w => w[0]).join('').slice(0, 3)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <Link 
          href={`/program/${college.id}`}
          className="text-lg font-semibold text-slate-900 hover:text-green-600 transition-colors line-clamp-1"
        >
          {college.name}
        </Link>

        <div className="flex items-center gap-2 mt-2">
          {college.division && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded">
              {college.division}
            </span>
          )}
          {college.type === 'juco' && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs font-medium rounded">
              JUCO
            </span>
          )}
        </div>

        {(college.location_city || college.location_state) && (
          <div className="flex items-center gap-1 mt-2 text-sm text-slate-500">
            <MapPin className="w-3.5 h-3.5" />
            {[college.location_city, college.location_state].filter(Boolean).join(', ')}
          </div>
        )}

        {college.conference && (
          <p className="text-xs text-slate-400 mt-1">{college.conference}</p>
        )}

        {/* Add to Interests Button */}
        <button
          onClick={handleToggle}
          disabled={loading}
          className={`w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 
                      rounded-lg font-medium text-sm transition-colors
            ${interested
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
        >
          {interested ? (
            <>
              <Check className="w-4 h-4" />
              Interested
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Add to Interests
            </>
          )}
        </button>
      </div>
    </div>
  );
}
```

---

## 4. My Journey

### 4.1 Journey Page

```tsx
// app/(dashboard)/player/journey/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { JourneyTimeline } from '@/components/player/journey/JourneyTimeline';
import { InterestsList } from '@/components/player/journey/InterestsList';

export default async function JourneyPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: player } = await supabase
    .from('players')
    .select('id, recruiting_activated')
    .eq('user_id', user.id)
    .single();

  if (!player) redirect('/onboarding/player');
  if (!player.recruiting_activated) redirect('/player/activate');

  // Get recruiting interests
  const { data: interests } = await supabase
    .from('recruiting_interests')
    .select(`
      *,
      organization:organizations(id, name, logo_url, division, location_state)
    `)
    .eq('player_id', player.id)
    .order('updated_at', { ascending: false });

  // Group by status for timeline
  const statusGroups = {
    interested: interests?.filter(i => i.status === 'interested') || [],
    contacted: interests?.filter(i => i.status === 'contacted') || [],
    questionnaire: interests?.filter(i => i.status === 'questionnaire') || [],
    unofficial_visit: interests?.filter(i => i.status === 'unofficial_visit') || [],
    official_visit: interests?.filter(i => i.status === 'official_visit') || [],
    offer: interests?.filter(i => i.status === 'offer') || [],
    verbal: interests?.filter(i => i.status === 'verbal') || [],
    signed: interests?.filter(i => i.status === 'signed') || [],
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">My Journey</h1>
          <p className="text-slate-500 mt-1">
            Track your recruiting progress with each school
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Timeline - 2 columns */}
          <div className="lg:col-span-2">
            <JourneyTimeline statusGroups={statusGroups} playerId={player.id} />
          </div>

          {/* Interests List */}
          <div>
            <InterestsList interests={interests || []} playerId={player.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 4.2 Journey Timeline Component

```tsx
// components/player/journey/JourneyTimeline.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { 
  Star, Mail, FileText, Building, Building2, 
  Gift, HandshakeIcon, PenTool, ChevronDown 
} from 'lucide-react';

interface Interest {
  id: string;
  school_name: string;
  status: string;
  updated_at: string;
  organization: {
    id: string;
    name: string;
    logo_url: string | null;
    division: string | null;
    location_state: string | null;
  } | null;
}

interface JourneyTimelineProps {
  statusGroups: Record<string, Interest[]>;
  playerId: string;
}

const STATUS_CONFIG = [
  { key: 'signed', label: 'Signed', icon: PenTool, color: 'bg-green-500' },
  { key: 'verbal', label: 'Verbal Commit', icon: HandshakeIcon, color: 'bg-green-400' },
  { key: 'offer', label: 'Offers', icon: Gift, color: 'bg-purple-500' },
  { key: 'official_visit', label: 'Official Visits', icon: Building2, color: 'bg-blue-500' },
  { key: 'unofficial_visit', label: 'Unofficial Visits', icon: Building, color: 'bg-blue-400' },
  { key: 'questionnaire', label: 'Questionnaires', icon: FileText, color: 'bg-amber-500' },
  { key: 'contacted', label: 'Contacted', icon: Mail, color: 'bg-slate-400' },
  { key: 'interested', label: 'Interested', icon: Star, color: 'bg-slate-300' },
];

export function JourneyTimeline({ statusGroups, playerId }: JourneyTimelineProps) {
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null);

  const hasAnyProgress = Object.values(statusGroups).some(group => group.length > 0);

  if (!hasAnyProgress) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <Star className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          Start Your Journey
        </h3>
        <p className="text-sm text-slate-500 mb-6">
          Add colleges you're interested in to start tracking your recruiting progress.
        </p>
        <Link
          href="/player/discover"
          className="inline-flex px-4 py-2 bg-green-600 hover:bg-green-700 
                     text-white font-medium rounded-lg"
        >
          Discover Colleges
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Recruiting Timeline</h2>
      </div>

      <div className="divide-y divide-slate-100">
        {STATUS_CONFIG.map(({ key, label, icon: Icon, color }) => {
          const schools = statusGroups[key] || [];
          const isExpanded = expandedStatus === key;

          return (
            <div key={key}>
              <button
                onClick={() => setExpandedStatus(isExpanded ? null : key)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-slate-900">{label}</p>
                    <p className="text-sm text-slate-500">
                      {schools.length} school{schools.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform 
                  ${isExpanded ? 'rotate-180' : ''}`} 
                />
              </button>

              {isExpanded && schools.length > 0 && (
                <div className="px-6 pb-4">
                  <div className="ml-14 space-y-2">
                    {schools.map((school) => (
                      <div 
                        key={school.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {school.organization?.logo_url ? (
                            <img 
                              src={school.organization.logo_url} 
                              alt="" 
                              className="w-8 h-8 rounded object-contain bg-white"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center">
                              <span className="text-xs font-bold text-slate-500">
                                {school.school_name[0]}
                              </span>
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {school.school_name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {formatDistanceToNow(new Date(school.updated_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isExpanded && schools.length === 0 && (
                <div className="px-6 pb-4">
                  <div className="ml-14 p-4 bg-slate-50 rounded-lg text-center">
                    <p className="text-sm text-slate-500">No schools at this stage yet</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### 4.3 Interests List Component

```tsx
// components/player/journey/InterestsList.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Trash2, ArrowUp, MapPin } from 'lucide-react';
import { updateInterestStatus, removeFromInterests } from '@/app/actions/recruiting';

interface Interest {
  id: string;
  organization_id: string | null;
  school_name: string;
  status: string;
  interest_level: string | null;
  notes: string | null;
  organization: {
    id: string;
    name: string;
    logo_url: string | null;
    division: string | null;
    location_state: string | null;
  } | null;
}

interface InterestsListProps {
  interests: Interest[];
  playerId: string;
}

const STATUS_OPTIONS = [
  { value: 'interested', label: 'Interested' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'questionnaire', label: 'Questionnaire' },
  { value: 'unofficial_visit', label: 'Unofficial Visit' },
  { value: 'official_visit', label: 'Official Visit' },
  { value: 'offer', label: 'Offer' },
  { value: 'verbal', label: 'Verbal Commit' },
  { value: 'signed', label: 'Signed' },
];

export function InterestsList({ interests, playerId }: InterestsListProps) {
  const router = useRouter();
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  const handleStatusChange = async (interestId: string, newStatus: string) => {
    await updateInterestStatus(playerId, interestId, newStatus);
    router.refresh();
  };

  const handleRemove = async (organizationId: string) => {
    if (confirm('Remove this school from your interests?')) {
      await removeFromInterests(playerId, organizationId);
      router.refresh();
    }
    setActionMenuId(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">My Schools</h2>
        <p className="text-sm text-slate-500">{interests.length} schools tracked</p>
      </div>

      {interests.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm text-slate-500">No schools added yet</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
          {interests.map((interest) => (
            <div key={interest.id} className="p-4">
              <div className="flex items-start gap-3">
                {interest.organization?.logo_url ? (
                  <img 
                    src={interest.organization.logo_url} 
                    alt="" 
                    className="w-10 h-10 rounded object-contain bg-slate-50"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-slate-400">
                      {interest.school_name[0]}
                    </span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {interest.school_name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {interest.organization?.division && (
                      <span className="text-xs text-slate-500">
                        {interest.organization.division}
                      </span>
                    )}
                    {interest.organization?.location_state && (
                      <span className="flex items-center gap-0.5 text-xs text-slate-400">
                        <MapPin className="w-3 h-3" />
                        {interest.organization.location_state}
                      </span>
                    )}
                  </div>

                  {/* Status Dropdown */}
                  <select
                    value={interest.status}
                    onChange={(e) => handleStatusChange(interest.id, e.target.value)}
                    className="mt-2 px-2 py-1 text-xs font-medium rounded border border-slate-200 
                               bg-white text-slate-700 focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div className="relative">
                  <button
                    onClick={() => setActionMenuId(actionMenuId === interest.id ? null : interest.id)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {actionMenuId === interest.id && (
                    <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg border border-slate-200 
                                    shadow-lg py-1 z-10">
                      <button
                        onClick={() => handleRemove(interest.organization_id!)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 6. Analytics Dashboard

### 6.1 Analytics Page

```tsx
// app/(dashboard)/player/analytics/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { EngagementChart } from '@/components/player/analytics/EngagementChart';
import { TopSchoolsViewing } from '@/components/player/analytics/TopSchoolsViewing';
import { InterestBreakdown } from '@/components/player/analytics/InterestBreakdown';

export default async function AnalyticsPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: player } = await supabase
    .from('players')
    .select('id, recruiting_activated')
    .eq('user_id', user.id)
    .single();

  if (!player) redirect('/onboarding/player');
  if (!player.recruiting_activated) redirect('/player/activate');

  // Get engagement data for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: engagement } = await supabase
    .from('player_engagement_events')
    .select(`
      *,
      coach:coaches(id, school_name, program_division, athletic_conference, logo_url)
    `)
    .eq('player_id', player.id)
    .gte('engagement_date', thirtyDaysAgo.toISOString())
    .order('engagement_date', { ascending: false });

  // Calculate stats
  const stats = {
    totalViews: engagement?.filter(e => e.engagement_type === 'profile_view').length || 0,
    uniqueCoaches: new Set(engagement?.map(e => e.coach_id).filter(Boolean)).size,
    watchlistAdds: engagement?.filter(e => e.engagement_type === 'watchlist_add').length || 0,
    videoViews: engagement?.filter(e => e.engagement_type === 'video_view').length || 0,
  };

  // Group by day for chart
  const engagementByDay: Record<string, number> = {};
  engagement?.forEach(e => {
    const date = new Date(e.engagement_date).toISOString().split('T')[0];
    engagementByDay[date] = (engagementByDay[date] || 0) + 1;
  });

  // Fill in missing days
  const chartData = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    chartData.push({
      date: dateStr,
      views: engagementByDay[dateStr] || 0,
    });
  }

  // Top schools viewing (group by coach/school)
  const schoolViews: Record<string, { name: string; logo: string | null; division: string | null; views: number }> = {};
  engagement?.forEach(e => {
    if (e.coach?.school_name) {
      const key = e.coach.school_name;
      if (!schoolViews[key]) {
        schoolViews[key] = {
          name: e.coach.school_name,
          logo: e.coach.logo_url,
          division: e.coach.program_division,
          views: 0,
        };
      }
      schoolViews[key].views++;
    }
  });

  const topSchools = Object.values(schoolViews)
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  // Interest breakdown by type
  const interestBreakdown = {
    profile_view: engagement?.filter(e => e.engagement_type === 'profile_view').length || 0,
    video_view: engagement?.filter(e => e.engagement_type === 'video_view').length || 0,
    watchlist_add: engagement?.filter(e => e.engagement_type === 'watchlist_add').length || 0,
    stats_view: engagement?.filter(e => e.engagement_type === 'stats_view').length || 0,
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
          <p className="text-slate-500 mt-1">
            See how colleges are engaging with your profile
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-sm text-slate-500">Total Views</p>
            <p className="text-3xl font-semibold text-slate-900 mt-1">{stats.totalViews}</p>
            <p className="text-xs text-slate-400 mt-1">Last 30 days</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-sm text-slate-500">Unique Coaches</p>
            <p className="text-3xl font-semibold text-slate-900 mt-1">{stats.uniqueCoaches}</p>
            <p className="text-xs text-slate-400 mt-1">Viewed your profile</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-sm text-slate-500">Watchlist Adds</p>
            <p className="text-3xl font-semibold text-slate-900 mt-1">{stats.watchlistAdds}</p>
            <p className="text-xs text-slate-400 mt-1">Coaches following you</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-sm text-slate-500">Video Views</p>
            <p className="text-3xl font-semibold text-slate-900 mt-1">{stats.videoViews}</p>
            <p className="text-xs text-slate-400 mt-1">Your videos watched</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart - 2 columns */}
          <div className="lg:col-span-2">
            <EngagementChart data={chartData} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <TopSchoolsViewing schools={topSchools} />
            <InterestBreakdown breakdown={interestBreakdown} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 6.2 Engagement Chart Component

```tsx
// components/player/analytics/EngagementChart.tsx
'use client';

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';

interface ChartData {
  date: string;
  views: number;
}

interface EngagementChartProps {
  data: ChartData[];
}

export function EngagementChart({ data }: EngagementChartProps) {
  const maxViews = useMemo(() => Math.max(...data.map(d => d.views), 1), [data]);
  const totalViews = useMemo(() => data.reduce((sum, d) => sum + d.views, 0), [data]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-900">Profile Views Over Time</h2>
        <span className="text-sm text-slate-500">{totalViews} total views</span>
      </div>

      {/* Simple Bar Chart */}
      <div className="h-64 flex items-end gap-1">
        {data.map((day, index) => {
          const height = (day.views / maxViews) * 100;
          const isToday = index === data.length - 1;

          return (
            <div
              key={day.date}
              className="flex-1 flex flex-col items-center group"
            >
              {/* Tooltip */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity mb-2 
                              px-2 py-1 bg-slate-900 text-white text-xs rounded whitespace-nowrap">
                {format(parseISO(day.date), 'MMM d')}: {day.views} views
              </div>
              
              {/* Bar */}
              <div
                className={`w-full rounded-t transition-all ${
                  isToday ? 'bg-green-500' : 'bg-green-200 group-hover:bg-green-400'
                }`}
                style={{ height: `${Math.max(height, 2)}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-slate-400">
        <span>{format(parseISO(data[0].date), 'MMM d')}</span>
        <span>Today</span>
      </div>
    </div>
  );
}
```

### 6.3 Top Schools Viewing Component

```tsx
// components/player/analytics/TopSchoolsViewing.tsx
interface School {
  name: string;
  logo: string | null;
  division: string | null;
  views: number;
}

interface TopSchoolsViewingProps {
  schools: School[];
}

export function TopSchoolsViewing({ schools }: TopSchoolsViewingProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Top Schools Viewing</h2>

      {schools.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">
          No school views yet
        </p>
      ) : (
        <div className="space-y-3">
          {schools.map((school, index) => (
            <div key={school.name} className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-400 w-5">
                {index + 1}
              </span>
              {school.logo ? (
                <img 
                  src={school.logo} 
                  alt="" 
                  className="w-8 h-8 rounded object-contain bg-slate-50"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center">
                  <span className="text-xs font-bold text-slate-400">
                    {school.name[0]}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {school.name}
                </p>
                {school.division && (
                  <p className="text-xs text-slate-400">{school.division}</p>
                )}
              </div>
              <span className="text-sm font-semibold text-green-600">
                {school.views}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 7. Anonymous vs Identified Interest

### 7.1 Interest Display Logic

The key concept is that players only see **identified** coach information if they have `recruiting_activated = true`. Otherwise, they see **anonymous** information.

```tsx
// lib/utils/interest-display.ts

interface EngagementEvent {
  id: string;
  engagement_type: string;
  engagement_date: string;
  is_anonymous: boolean;
  coach: {
    id: string;
    school_name: string;
    full_name: string;
    avatar_url: string | null;
    program_division: string | null;
    school_state: string | null;
  } | null;
}

interface DisplayableInterest {
  id: string;
  type: string;
  date: string;
  schoolName: string | null;
  coachName: string | null;
  division: string | null;
  state: string | null;
  isIdentified: boolean;
}

export function formatInterestForDisplay(
  event: EngagementEvent,
  playerRecruitingActivated: boolean
): DisplayableInterest {
  // If player has recruiting activated and event is not marked anonymous,
  // show full details
  const isIdentified = playerRecruitingActivated && !event.is_anonymous && event.coach !== null;

  if (isIdentified && event.coach) {
    return {
      id: event.id,
      type: event.engagement_type,
      date: event.engagement_date,
      schoolName: event.coach.school_name,
      coachName: event.coach.full_name,
      division: event.coach.program_division,
      state: event.coach.school_state,
      isIdentified: true,
    };
  }

  // Anonymous display
  return {
    id: event.id,
    type: event.engagement_type,
    date: event.engagement_date,
    schoolName: event.coach?.school_state 
      ? `A coach from ${event.coach.school_state}` 
      : 'A college coach',
    coachName: null,
    division: event.coach?.program_division || null,
    state: event.coach?.school_state || null,
    isIdentified: false,
  };
}
```

### 7.2 Interest Card Component with Anonymous Support

```tsx
// components/player/analytics/InterestCard.tsx
import { formatDistanceToNow } from 'date-fns';
import { Eye, Heart, Play, Lock } from 'lucide-react';

interface DisplayableInterest {
  id: string;
  type: string;
  date: string;
  schoolName: string | null;
  coachName: string | null;
  division: string | null;
  state: string | null;
  isIdentified: boolean;
}

interface InterestCardProps {
  interest: DisplayableInterest;
  recruitingActivated: boolean;
}

const TYPE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  profile_view: { icon: Eye, label: 'viewed your profile', color: 'bg-blue-50 text-blue-600' },
  video_view: { icon: Play, label: 'watched your video', color: 'bg-purple-50 text-purple-600' },
  watchlist_add: { icon: Heart, label: 'added you to watchlist', color: 'bg-pink-50 text-pink-600' },
};

export function InterestCard({ interest, recruitingActivated }: InterestCardProps) {
  const config = TYPE_CONFIG[interest.type] || TYPE_CONFIG.profile_view;
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.color}`}>
        <Icon className="w-5 h-5" />
      </div>

      <div className="flex-1">
        <p className="text-sm text-slate-900">
          {interest.isIdentified ? (
            <>
              <span className="font-medium">{interest.coachName}</span>
              {' from '}
              <span className="font-medium">{interest.schoolName}</span>
            </>
          ) : (
            <span className="font-medium">{interest.schoolName}</span>
          )}
          {' '}{config.label}
        </p>

        {interest.division && (
          <p className="text-xs text-slate-500 mt-0.5">
            {interest.division}
          </p>
        )}

        <p className="text-xs text-slate-400 mt-1">
          {formatDistanceToNow(new Date(interest.date), { addSuffix: true })}
        </p>
      </div>

      {/* Lock indicator for anonymous */}
      {!interest.isIdentified && !recruitingActivated && (
        <div className="flex items-center gap-1 text-xs text-amber-600">
          <Lock className="w-3 h-3" />
          <span>Activate to see details</span>
        </div>
      )}
    </div>
  );
}
```

---

## 8. API Routes & Server Actions

### 8.1 Recruiting Actions

```tsx
// app/actions/recruiting.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function activateRecruiting(playerId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('players')
    .update({
      recruiting_activated: true,
      recruiting_activated_at: new Date().toISOString(),
    })
    .eq('id', playerId);

  if (error) throw new Error(error.message);

  // Create default player settings if not exists
  await supabase.from('player_settings').upsert({
    player_id: playerId,
    is_discoverable: true,
    notify_on_interest: true,
    notify_on_message: true,
    notify_on_watchlist_add: true,
    notify_on_profile_view: true,
  });

  revalidatePath('/player');
}

export async function deactivateRecruiting(playerId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('players')
    .update({
      recruiting_activated: false,
    })
    .eq('id', playerId);

  if (error) throw new Error(error.message);

  revalidatePath('/player');
}

export async function addToInterests(
  playerId: string, 
  organizationId: string, 
  schoolName: string
) {
  const supabase = await createClient();
  
  const { error } = await supabase.from('recruiting_interests').upsert({
    player_id: playerId,
    organization_id: organizationId,
    school_name: schoolName,
    status: 'interested',
  }, {
    onConflict: 'player_id,organization_id',
  });

  if (error) throw new Error(error.message);

  revalidatePath('/player/discover');
  revalidatePath('/player/journey');
}

export async function removeFromInterests(playerId: string, organizationId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('recruiting_interests')
    .delete()
    .eq('player_id', playerId)
    .eq('organization_id', organizationId);

  if (error) throw new Error(error.message);

  revalidatePath('/player/discover');
  revalidatePath('/player/journey');
}

export async function updateInterestStatus(
  playerId: string,
  interestId: string,
  status: string
) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('recruiting_interests')
    .update({ status })
    .eq('id', interestId)
    .eq('player_id', playerId);

  if (error) throw new Error(error.message);

  revalidatePath('/player/journey');
}

export async function updateInterestLevel(
  playerId: string,
  interestId: string,
  level: string
) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('recruiting_interests')
    .update({ interest_level: level })
    .eq('id', interestId)
    .eq('player_id', playerId);

  if (error) throw new Error(error.message);

  revalidatePath('/player/journey');
}
```

### 8.2 Camp Registration Actions

```tsx
// app/actions/camp-registration.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function registerForCamp(playerId: string, campId: string) {
  const supabase = await createClient();
  
  // Check if already registered
  const { data: existing } = await supabase
    .from('camp_registrations')
    .select('id, status')
    .eq('player_id', playerId)
    .eq('camp_id', campId)
    .single();

  if (existing) {
    // Update status if was interested
    if (existing.status === 'interested') {
      const { error } = await supabase
        .from('camp_registrations')
        .update({ 
          status: 'registered',
          registered_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) throw new Error(error.message);
    }
    return;
  }

  // Create new registration
  const { error } = await supabase.from('camp_registrations').insert({
    player_id: playerId,
    camp_id: campId,
    status: 'registered',
    registered_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);

  revalidatePath('/player/camps');
}

export async function showInterestInCamp(playerId: string, campId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase.from('camp_registrations').upsert({
    player_id: playerId,
    camp_id: campId,
    status: 'interested',
  }, {
    onConflict: 'camp_id,player_id',
  });

  if (error) throw new Error(error.message);

  // Record engagement event for the coach
  const { data: camp } = await supabase
    .from('camps')
    .select('coach_id')
    .eq('id', campId)
    .single();

  if (camp) {
    await supabase.from('player_engagement_events').insert({
      player_id: playerId,
      coach_id: camp.coach_id,
      engagement_type: 'camp_interest',
      metadata: { camp_id: campId },
    });
  }

  revalidatePath('/player/camps');
}

export async function cancelCampRegistration(playerId: string, campId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('camp_registrations')
    .update({ 
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('player_id', playerId)
    .eq('camp_id', campId);

  if (error) throw new Error(error.message);

  revalidatePath('/player/camps');
}
```

---

## Verification Checklist

### Recruiting Activation
- [ ] Activation flow renders all 3 steps
- [ ] Profile completion shows accurately
- [ ] Terms checkbox required
- [ ] Redirects after activation
- [ ] player.recruiting_activated updates

### Discover Colleges
- [ ] Filters work (division, state, conference)
- [ ] Search works
- [ ] Pagination works
- [ ] Add to interests toggles correctly
- [ ] Interest state persists

### My Journey
- [ ] Timeline shows correct groupings
- [ ] Status dropdown updates correctly
- [ ] Remove works
- [ ] Empty state displays

### Camps Browser
- [ ] Camps list loads
- [ ] Filters work
- [ ] Registration works
- [ ] Interest expression works

### Analytics
- [ ] Stats calculate correctly
- [ ] Chart renders with data
- [ ] Top schools show correctly
- [ ] Anonymous vs identified logic works

### Anonymous vs Identified
- [ ] Anonymous display when not activated
- [ ] Full details when activated
- [ ] Lock indicator shows
- [ ] State-only fallback works

---

**Document End**

*This guide covers all Player recruiting features. Components handle both activated and non-activated states.*
