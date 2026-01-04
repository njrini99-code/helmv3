'use client';

import { useEffect, useState } from 'react';
import { Check, X, HelpCircle, Clock, User } from 'lucide-react';
import { getEventRSVP } from '@/app/golf/actions/golf';

// ============================================================================
// TYPES
// ============================================================================

interface RSVPAttendee {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'tentative';
  respondedAt: string | null;
}

interface RSVPSummary {
  total: number;
  accepted: number;
  declined: number;
  tentative: number;
  pending: number;
  attendees: RSVPAttendee[];
}

interface RSVPStats {
  summary: RSVPSummary;
  acceptanceRate: number;
  responseRate: number;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function RSVPPill({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: 'emerald' | 'red' | 'amber' | 'slate';
}) {
  const colorClasses = {
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    red: 'bg-red-100 text-red-700 border-red-300',
    amber: 'bg-amber-100 text-amber-700 border-amber-300',
    slate: 'bg-slate-100 text-slate-600 border-slate-300',
  };

  return (
    <div className={`px-3 py-2 rounded-lg border ${colorClasses[color]} flex items-center gap-2`}>
      <span className="text-lg font-bold">{count}</span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function RSVPBadge({ status }: { status: 'pending' | 'accepted' | 'declined' | 'tentative' }) {
  const config = {
    accepted: {
      icon: Check,
      label: 'Going',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-500',
    },
    declined: {
      icon: X,
      label: "Can't Go",
      className: 'bg-red-100 text-red-700 border-red-500',
    },
    tentative: {
      icon: HelpCircle,
      label: 'Maybe',
      className: 'bg-amber-100 text-amber-700 border-amber-500',
    },
    pending: {
      icon: Clock,
      label: 'Awaiting',
      className: 'bg-slate-100 text-slate-600 border-slate-300',
    },
  };

  const { icon: Icon, label, className } = config[status];

  return (
    <span className={`px-2.5 py-1 text-xs font-medium rounded-full border flex items-center gap-1 ${className}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function RSVPSkeleton() {
  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-xl animate-pulse">
      <div className="flex gap-2">
        <div className="h-12 bg-slate-200 rounded-lg w-24"></div>
        <div className="h-12 bg-slate-200 rounded-lg w-24"></div>
        <div className="h-12 bg-slate-200 rounded-lg w-24"></div>
        <div className="h-12 bg-slate-200 rounded-lg w-24"></div>
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-200 rounded-full"></div>
            <div className="flex-1 h-4 bg-slate-200 rounded"></div>
            <div className="w-20 h-6 bg-slate-200 rounded-full"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RSVPStatusSection({ eventId }: { eventId: string }) {
  const [stats, setStats] = useState<RSVPStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRSVP() {
      setLoading(true);
      setError(null);

      const result = await getEventRSVP(eventId);

      if (result.success) {
        setStats(result.data);
      } else {
        setError(result.error || 'Failed to load RSVP data');
      }

      setLoading(false);
    }

    fetchRSVP();
  }, [eventId]);

  if (loading) {
    return <RSVPSkeleton />;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const { summary, acceptanceRate, responseRate } = stats;

  return (
    <div className="space-y-4 p-4 bg-slate-50/50 rounded-xl backdrop-blur-sm">
      {/* Summary Pills */}
      <div className="flex flex-wrap gap-2">
        <RSVPPill count={summary.accepted} label="Going" color="emerald" />
        <RSVPPill count={summary.declined} label="Can't Go" color="red" />
        <RSVPPill count={summary.tentative} label="Maybe" color="amber" />
        <RSVPPill count={summary.pending} label="Awaiting" color="slate" />
      </div>

      {/* Response Rate */}
      {summary.total > 0 && (
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Response Rate:</span>
            <span className="font-semibold text-slate-900">{responseRate}%</span>
            <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${responseRate}%` }}
              ></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Acceptance Rate:</span>
            <span className="font-semibold text-slate-900">{acceptanceRate}%</span>
            <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${acceptanceRate}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Attendee List */}
      {summary.attendees.length > 0 ? (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {summary.attendees.map(attendee => (
            <div
              key={attendee.playerId}
              className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
            >
              {/* Avatar */}
              {attendee.avatarUrl ? (
                <img
                  src={attendee.avatarUrl}
                  alt={attendee.playerName}
                  className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center border-2 border-white shadow-sm">
                  <User className="w-5 h-5 text-slate-500" />
                </div>
              )}

              {/* Name */}
              <span className="flex-1 text-sm font-medium text-slate-700">{attendee.playerName}</span>

              {/* Status Badge */}
              <RSVPBadge status={attendee.status} />

              {/* Responded Time */}
              {attendee.respondedAt && (
                <span className="text-xs text-slate-400">
                  {new Date(attendee.respondedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <User className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No attendees invited yet</p>
        </div>
      )}
    </div>
  );
}
