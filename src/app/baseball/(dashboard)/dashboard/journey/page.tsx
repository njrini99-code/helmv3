'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { PageLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconTarget,
  IconEye,
  IconStar,
  IconVideo,
  IconMessage,
  IconCalendar,
  IconPlus,
  IconChevronRight
} from '@/components/icons';
import { useJourney, updateInterestStatus, type JourneySchool, type JourneyEvent } from '@/hooks/use-journey';
import { cn } from '@/lib/utils';

const statusOptions = [
  { value: 'interested', label: 'Interested' },
  { value: 'researching', label: 'Researching' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'visited', label: 'Campus Visit' },
  { value: 'offered', label: 'Offer Extended' },
  { value: 'committed', label: 'Committed' },
];

function getStatusColor(status: string): string {
  switch (status) {
    case 'interested':
    case 'researching':
      return 'bg-slate-100 text-slate-700';
    case 'contacted':
      return 'bg-blue-100 text-blue-700';
    case 'visited':
      return 'bg-purple-100 text-purple-700';
    case 'offered':
      return 'bg-amber-100 text-amber-700';
    case 'committed':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function getEventIcon(type: JourneyEvent['type']) {
  switch (type) {
    case 'profile_view':
      return <IconEye size={16} className="text-blue-600" />;
    case 'watchlist_add':
      return <IconStar size={16} className="text-amber-600" />;
    case 'video_view':
      return <IconVideo size={16} className="text-purple-600" />;
    case 'message':
      return <IconMessage size={16} className="text-green-600" />;
    case 'added_interest':
      return <IconPlus size={16} className="text-green-600" />;
    case 'status_change':
      return <IconTarget size={16} className="text-slate-600" />;
    default:
      return <IconEye size={16} className="text-slate-600" />;
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else {
    return formatDate(dateString);
  }
}

function SchoolCard({ school, onStatusChange }: { school: JourneySchool; onStatusChange: (id: string, status: string) => void }) {
  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateInterestStatus(school.id, newStatus);
      onStatusChange(school.id, newStatus);
    } catch (error) {
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-slate-900 truncate">{school.school_name}</h3>
              <Badge className={cn('text-xs', getStatusColor(school.status))}>
                {statusOptions.find(s => s.value === school.status)?.label || school.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              {school.division && <span>{school.division}</span>}
              {school.conference && <span>• {school.conference}</span>}
            </div>
          </div>
          <Select
            options={statusOptions}
            value={school.status}
            onChange={handleStatusChange}
            className="w-36 text-sm"
          />
        </div>

        {/* Engagement Stats */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-sm">
            <IconEye size={14} className="text-slate-400" />
            <span className="text-slate-600">{school.profile_views} views</span>
          </div>
          {school.watchlist_added && (
            <div className="flex items-center gap-1.5 text-sm">
              <IconStar size={14} className="text-amber-500" />
              <span className="text-slate-600">On watchlist</span>
            </div>
          )}
          {school.coach_name && (
            <div className="text-sm text-slate-500">
              Contact: {school.coach_name}
            </div>
          )}
        </div>

        {school.notes && (
          <p className="text-sm text-slate-500 mt-3 italic">"{school.notes}"</p>
        )}

        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-slate-400">
            Added {formatDate(school.created_at)}
          </span>
          {school.organization_id && (
            <Link
              href={`/baseball/program/${school.organization_id}`}
              className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
            >
              View Program <IconChevronRight size={14} />
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineEvent({ event }: { event: JourneyEvent }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
          {getEventIcon(event.type)}
        </div>
        <div className="w-0.5 flex-1 bg-slate-100 mt-2" />
      </div>
      <div className="flex-1 pb-6">
        <p className="text-sm text-slate-900">{event.description}</p>
        <p className="text-xs text-slate-400 mt-1">{formatRelativeTime(event.timestamp)}</p>
      </div>
    </div>
  );
}

export default function JourneyPage() {
  const { schools, events, stats, loading } = useJourney();
  const [schoolList, setSchoolList] = useState<JourneySchool[]>([]);

  // Sync schools from hook
  if (schools.length !== schoolList.length && !loading) {
    setSchoolList(schools);
  }

  const handleStatusChange = (id: string, newStatus: string) => {
    setSchoolList(prev =>
      prev.map(s => s.id === id ? { ...s, status: newStatus } : s)
    );
  };

  if (loading) {
    return (
      <>
        <Header title="My Journey" subtitle="Track your recruiting progress" />
        <PageLoading />
      </>
    );
  }

  const displaySchools = schoolList.length > 0 ? schoolList : schools;

  return (
    <>
      <Header
        title="My Journey"
        subtitle="Track your recruiting progress with schools"
      >
        <Link href="/baseball/dashboard/colleges">
          <Button>
            <IconPlus size={18} className="mr-2" />
            Add Schools
          </Button>
        </Link>
      </Header>

      <div className="p-8">
        {/* Stats Overview */}
        {stats && stats.total_interests > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-semibold text-slate-900">{stats.total_interests}</p>
                <p className="text-xs text-slate-500">Total Schools</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-semibold text-slate-900">{stats.schools_interested}</p>
                <p className="text-xs text-slate-500">Interested</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-semibold text-blue-600">{stats.schools_contacted}</p>
                <p className="text-xs text-slate-500">Contacted</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-semibold text-purple-600">{stats.schools_visited}</p>
                <p className="text-xs text-slate-500">Visited</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-semibold text-amber-600">{stats.schools_offered}</p>
                <p className="text-xs text-slate-500">Offers</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Schools List */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Your Schools</h2>
            {displaySchools.length === 0 ? (
              <EmptyState
                icon={<IconTarget size={24} />}
                title="No schools in your journey"
                description="Start by adding schools you're interested in from the Discover Colleges page."
                action={
                  <Link href="/baseball/dashboard/colleges">
                    <Button>
                      <IconPlus size={18} className="mr-2" />
                      Discover Colleges
                    </Button>
                  </Link>
                }
              />
            ) : (
              displaySchools.map(school => (
                <SchoolCard
                  key={school.id}
                  school={school}
                  onStatusChange={handleStatusChange}
                />
              ))
            )}
          </div>

          {/* Activity Timeline */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
            <Card>
              <CardContent className="p-5">
                {events.length === 0 ? (
                  <div className="text-center py-8">
                    <IconCalendar size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500">No activity yet</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Activity from coaches will appear here
                    </p>
                  </div>
                ) : (
                  <div>
                    {events.slice(0, 10).map(event => (
                      <TimelineEvent key={event.id} event={event} />
                    ))}
                    {events.length > 10 && (
                      <p className="text-sm text-slate-500 text-center pt-4">
                        + {events.length - 10} more events
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
