'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconChevronRight, IconEye } from '@/components/icons';
import { formatRelativeTime } from '@/lib/utils';

interface CollegeInterest {
  id: string;
  created_at: string;
  event_type: string;
  coach_name: string | null;
  school_name: string | null;
  school_division: string | null;
  player_name: string;
}

interface CollegeInterestTrackerProps {
  interests: CollegeInterest[];
}

export function CollegeInterestTracker({ interests }: CollegeInterestTrackerProps) {
  return (
    <Card variant="glass">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">College Interest Tracker</h2>
          <p className="text-sm leading-relaxed text-slate-500 mt-1">Recent activity from college programs</p>
        </div>
        <Link href="/baseball/dashboard/college-interest">
          <Button variant="ghost" size="sm">
            View All <IconChevronRight size={16} className="ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {interests.length === 0 ? (
          <div className="text-center py-8">
            <IconEye size={32} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm leading-relaxed text-slate-500">No recent college interest</p>
            <p className="text-xs text-slate-400 mt-1">
              Interest events will appear here when college coaches engage with your players.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {interests.slice(0, 6).map((interest) => (
              <div
                key={interest.id}
                className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <IconEye size={16} className="text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {interest.school_name || 'Unknown School'}
                    {interest.school_division && (
                      <Badge variant="secondary" className="ml-2">{interest.school_division}</Badge>
                    )}
                  </p>
                  <p className="text-sm leading-relaxed text-slate-600">
                    {interest.coach_name || 'A coach'} {interest.event_type === 'profile_view' ? 'viewed' : 'added to watchlist'} <span className="font-medium">{interest.player_name}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {formatRelativeTime(interest.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
