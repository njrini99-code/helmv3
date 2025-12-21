'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { IconMapPin, IconUser, IconHeart, IconHeartFilled } from '@/components/icons';
import { addToInterests, removeFromInterests } from '@/app/baseball/actions/interests';
import type { College } from '@/lib/types';

interface CollegeCardProps {
  college: College;
  isInterested?: boolean;
  onInterestToggle?: (collegeId: string, isInterested: boolean) => void;
  showInterestButton?: boolean;
}

export function CollegeCard({
  college,
  isInterested = false,
  onInterestToggle,
  showInterestButton = true
}: CollegeCardProps) {
  const [interested, setInterested] = useState(isInterested);
  const [loading, setLoading] = useState(false);

  const handleInterestClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;

    setLoading(true);
    const newState = !interested;

    // Optimistic update
    setInterested(newState);
    onInterestToggle?.(college.id, newState);

    try {
      if (newState) {
        await addToInterests(college.id, college.name, college.division, college.conference);
      } else {
        await removeFromInterests(college.id);
      }
    } catch (error) {
      // Revert on error
      setInterested(!newState);
      onInterestToggle?.(college.id, !newState);
      console.error('Failed to update interest:', error);
    }

    setLoading(false);
  };

  return (
    <Link href={`/baseball/program/${college.id}`}>
      <Card hover className="overflow-hidden h-full">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <Avatar name={college.name} size="lg" src={college.logo_url} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-900 truncate">{college.name}</h3>
                {showInterestButton && (
                  <button
                    onClick={handleInterestClick}
                    disabled={loading}
                    className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${
                      interested
                        ? 'text-red-500 hover:bg-red-50'
                        : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                    } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    aria-label={interested ? 'Remove from interests' : 'Add to interests'}
                  >
                    {interested ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                <IconMapPin size={14} />
                <span className="truncate">{college.city}, {college.state}</span>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {college.division && <Badge variant="success">{college.division}</Badge>}
                {college.conference && <Badge className="truncate max-w-[120px]">{college.conference}</Badge>}
              </div>
            </div>
          </div>
          {college.head_coach && (
            <div className="mt-4 pt-4 border-t border-border-light flex items-center gap-2 text-sm text-gray-600">
              <IconUser size={14} />
              <span className="truncate">Head Coach: {college.head_coach}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
