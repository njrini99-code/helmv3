'use client';

import { fairwayScope } from '@/lib/redesign/flag';
import { FairwaySettingsCoachingIntelligence } from '@/components/fairway/pages/settings';
import { FeatureUnavailable } from '@/components/fairway';
import { useGolfUser } from '@/contexts/golf-user-context';

export default function CoachingIntelligenceSettingsPage() {
    const golfUser = useGolfUser();

    // Coach-only guard. The wrapping layout.tsx already gates this route
    // server-side (redirect('/golf/login') / FeatureUnavailable for players),
    // but this page is a client component that also independently resolves
    // coachId and fires coach-scoped Supabase reads — mirror the guard here
    // too, defense-in-depth, matching every other coach-only golf route.
    if (golfUser.role === 'player') {
        return (
            <FeatureUnavailable
                title="Coaching Philosophy"
                message="Coaching Intelligence settings are part of the coach toolkit. Your personal AI surfaces live on the CoachHelm dashboard."
                actionHref="/golf/dashboard/coachhelm"
                actionLabel="Open CoachHelm"
            />
        );
    }

    return (
        <div className={fairwayScope('min-h-full bg-canvas')}>
            <FairwaySettingsCoachingIntelligence />
        </div>
    );
}
