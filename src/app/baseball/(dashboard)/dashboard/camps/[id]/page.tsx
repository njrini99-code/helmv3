'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { PageLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconArrowLeft,
  IconCalendar,
  IconMapPin,
  IconUsers,
  IconCheck,
  IconX,
  IconClock,
  IconAlertCircle,
} from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { fromUntyped } from '@/lib/supabase/untyped';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/sonner';
import { cn, getFullName, formatRelativeTime } from '@/lib/utils';
import { formatCampDate } from '@/lib/baseball/camp-utils';

interface CampRegistration {
  id: string;
  camp_id: string;
  player_id: string;
  status: 'interested' | 'registered' | 'confirmed' | 'attended' | 'no_show' | 'cancelled';
  registered_at: string | null;
  attended_at: string | null;
  notes: string | null;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
    grad_year: number | null;
    high_school_name: string | null;
    city: string | null;
    state: string | null;
  } | null;
}

interface Camp {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  capacity: number | null;
  status: string | null;
  price_cents: number | null;
  is_free: boolean | null;
  coach_id: string;
  organization: {
    id: string;
    name: string;
  } | null;
}

const CAMP_DETAIL_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  interested: { label: 'Interested', color: 'text-warm-600', bg: 'bg-warm-100' },
  registered: { label: 'Registered', color: 'text-blue-600', bg: 'bg-blue-100' },
  confirmed: { label: 'Confirmed', color: 'text-primary-600', bg: 'bg-primary-100' },
  attended: { label: 'Checked In', color: 'text-primary-600', bg: 'bg-primary-100' },
  no_show: { label: 'No Show', color: 'text-amber-600', bg: 'bg-amber-100' },
  cancelled: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-100' },
};

export default function CampDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { coach, user } = useAuth();
  const { showToast } = useToast();
  const supabase = createClient();
  
  const campId = params.id as string;
  
  const [camp, setCamp] = useState<Camp | null>(null);
  const [registrations, setRegistrations] = useState<CampRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'registered' | 'attended' | 'no_show'>('all');

  const isCoach = user?.role === 'coach';

  const fetchCampData = useCallback(async () => {
    setLoading(true);
    
    // Fetch camp details
    const { data: campData, error: campError } = await supabase
      .from('baseball_camps')
      .select(`
        *,
        organization:organizations(id, name)
      `)
      .eq('id', campId)
      .single();

    if (campError || !campData) {
      showToast('Camp not found', 'error');
      router.push('/baseball/dashboard/camps');
      return;
    }

    // Verify coach owns this camp
    if (isCoach && coach && campData.coach_id !== coach.id) {
      showToast('You do not have access to this camp', 'error');
      router.push('/baseball/dashboard/camps');
      return;
    }

    setCamp(campData as Camp);

    // Fetch registrations with player details
    const { data: regsData } = await supabase
      .from('baseball_camp_registrations')
      .select(`
        id,
        camp_id,
        player_id,
        status,
        registered_at,
        attended_at,
        notes,
        player:baseball_players(
          id,
          first_name,
          last_name,
          avatar_url,
          primary_position,
          grad_year,
          high_school_name,
          city,
          state
        )
      `)
      .eq('camp_id', campId)
      .neq('status', 'cancelled')
      .order('registered_at', { ascending: false });

    setRegistrations((regsData as unknown as CampRegistration[]) || []);
    setLoading(false);
  }, [campId, coach, isCoach, router, showToast, supabase]);

  useEffect(() => {
    fetchCampData();
  }, [fetchCampData]);

  const handleCheckIn = async (registrationId: string) => {
    setCheckingIn(registrationId);
    
    const { error } = await fromUntyped(supabase, 'baseball_camp_registrations')
      .update({
        status: 'attended',
        attended_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (error) {
      showToast('Failed to check in player', 'error');
    } else {
      setRegistrations(prev => 
        prev.map(r => 
          r.id === registrationId 
            ? { ...r, status: 'attended' as const, attended_at: new Date().toISOString() }
            : r
        )
      );
      showToast('Player checked in', 'success');
    }
    
    setCheckingIn(null);
  };

  const handleMarkNoShow = async (registrationId: string) => {
    const { error } = await supabase
      .from('baseball_camp_registrations')
      .update({ status: 'no_show' })
      .eq('id', registrationId);

    if (error) {
      showToast('Failed to update status', 'error');
    } else {
      setRegistrations(prev =>
        prev.map(r =>
          r.id === registrationId ? { ...r, status: 'no_show' as const } : r
        )
      );
    }
  };

  const filteredRegistrations = registrations.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'registered') return r.status === 'registered' || r.status === 'confirmed';
    return r.status === filter;
  });

  const stats = {
    total: registrations.length,
    attended: registrations.filter(r => r.status === 'attended').length,
    pending: registrations.filter(r => r.status === 'registered' || r.status === 'confirmed').length,
    noShow: registrations.filter(r => r.status === 'no_show').length,
  };

  if (loading) {
    return (
      <>
        <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8">
          <h1 className="text-h2 font-semibold text-warm-900">Camp Details</h1>
        </div>
        <PageLoading />
      </>
    );
  }

  if (!camp) {
    return (
      <>
        <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8">
          <h1 className="text-h2 font-semibold text-warm-900">Camp Not Found</h1>
        </div>
        <div className="p-6">
          <EmptyState
            icon={<IconAlertCircle size={24} />}
            title="Camp not found"
            description="This camp may have been deleted or you don't have access."
            action={
              <Link href="/baseball/dashboard/camps">
                <Button>Back to Camps</Button>
              </Link>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-semibold text-warm-900">{camp.name}</h1>
          {camp.organization?.name && (
            <p className="mt-1 text-body-sm text-warm-500">{camp.organization.name}</p>
          )}
        </div>
        <Link href="/baseball/dashboard/camps">
          <Button variant="secondary" size="sm">
            <IconArrowLeft size={16} className="mr-1.5" />
            Back
          </Button>
        </Link>
      </div>

      <div className="p-6 lg:p-8 space-y-6">
        {/* Camp Info */}
        <div className="relative glass-standard rounded-2xl p-6 overflow-clip">
          <ShineEffect />
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            <div className="flex items-center gap-3 text-warm-600">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <IconCalendar size={20} className="text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-warm-500">Date</p>
                <p className="font-medium text-warm-900">
                  {formatCampDate(camp.start_date, CAMP_DETAIL_DATE_OPTIONS)}
                  {camp.end_date !== camp.start_date && ` - ${formatCampDate(camp.end_date, CAMP_DETAIL_DATE_OPTIONS)}`}
                </p>
              </div>
            </div>
            
            {camp.location && (
              <div className="flex items-center gap-3 text-warm-600">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <IconMapPin size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-warm-500">Location</p>
                  <p className="font-medium text-warm-900">{camp.location}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 text-warm-600">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <IconUsers size={20} className="text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-warm-500">Capacity</p>
                <p className="font-medium text-warm-900">
                  {stats.total}{camp.capacity ? ` / ${camp.capacity}` : ''} registered
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card variant="glass" className="p-4">
            <p className="text-sm text-warm-500">Total</p>
            <p className="text-2xl font-semibold text-warm-900 tabular-nums">{stats.total}</p>
          </Card>
          <Card variant="glass" className="p-4">
            <p className="text-sm text-warm-500">Checked In</p>
            <p className="text-2xl font-semibold text-primary-600 tabular-nums">{stats.attended}</p>
          </Card>
          <Card variant="glass" className="p-4">
            <p className="text-sm text-warm-500">Pending</p>
            <p className="text-2xl font-semibold text-blue-600 tabular-nums">{stats.pending}</p>
          </Card>
          <Card variant="glass" className="p-4">
            <p className="text-sm text-warm-500">No Show</p>
            <p className="text-2xl font-semibold text-amber-600 tabular-nums">{stats.noShow}</p>
          </Card>
        </div>

        {/* Roster */}
        <div className="relative glass-standard rounded-2xl overflow-clip">
          <ShineEffect />
          <div className="px-6 py-4 border-b border-warm-100/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="font-semibold text-warm-900">Roster ({filteredRegistrations.length})</h2>
            
            {/* Filter Tabs */}
            <div className="flex gap-1 p-1 bg-warm-100 rounded-lg">
              {(['all', 'registered', 'attended', 'no_show'] as const).map(f => (
                <Button variant="ghost"
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                    filter === f
                      ? 'bg-cream-50 text-warm-900 shadow-sm'
                      : 'text-warm-600 hover:text-warm-900'
                  )}
                >
                  {f === 'all' ? 'All' : f === 'registered' ? 'Pending' : f === 'attended' ? 'Checked In' : 'No Show'}
                </Button>
              ))}
            </div>
          </div>

          {filteredRegistrations.length === 0 ? (
            <div className="p-8 text-center">
              <IconUsers size={32} className="text-warm-300 mx-auto mb-3" />
              <p className="text-warm-500">No registrations yet</p>
            </div>
          ) : (
            <div className="divide-y divide-warm-100/50">
              {filteredRegistrations.map(reg => (
                <div
                  key={reg.id}
                  className="px-6 py-4 flex items-center gap-4 hover:bg-warm-50/50 transition-colors"
                >
                  <Avatar
                    name={getFullName(reg.player?.first_name, reg.player?.last_name)}
                    src={reg.player?.avatar_url}
                    size="md"
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-warm-900 truncate">
                        {getFullName(reg.player?.first_name, reg.player?.last_name)}
                      </p>
                      {reg.player?.primary_position && (
                        <Badge variant="secondary" className="text-xs">
                          {reg.player.primary_position}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-warm-500 truncate">
                      {reg.player?.high_school_name && `${reg.player.high_school_name} • `}
                      {reg.player?.grad_year && `Class of ${reg.player.grad_year}`}
                      {reg.player?.city && reg.player?.state && ` • ${reg.player.city}, ${reg.player.state}`}
                    </p>
                    {reg.attended_at && (
                      <p className="text-xs text-primary-600 mt-1 flex items-center gap-1">
                        <IconCheck size={12} />
                        Checked in {formatRelativeTime(reg.attended_at)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge className={cn(statusConfig[reg.status]?.bg ?? 'bg-warm-100', statusConfig[reg.status]?.color ?? 'text-warm-600')}>
                      {statusConfig[reg.status]?.label ?? reg.status}
                    </Badge>
                    
                    {isCoach && (reg.status === 'registered' || reg.status === 'confirmed') && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => handleCheckIn(reg.id)}
                          disabled={checkingIn === reg.id}
                          className="gap-1"
                        >
                          {checkingIn === reg.id ? (
                            <IconClock size={14} className="animate-spin" />
                          ) : (
                            <IconCheck size={14} />
                          )}
                          Check In
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleMarkNoShow(reg.id)}
                          className="text-amber-600"
                          aria-label="Mark no-show"
                        >
                          <IconX size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
