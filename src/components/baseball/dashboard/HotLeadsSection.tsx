'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { differenceInDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconMessage,
  IconEye,
  IconChevronRight,
  IconSearch,
  IconClock,
  IconWarning,
  IconTrendingUp,
  IconCheck,
} from '@/components/icons';
import { getFullName } from '@/lib/utils';
import type { WatchlistWithPlayer, Player } from '@/lib/types';

// Lead urgency levels
type LeadUrgency = 'urgent' | 'action_needed' | 'celebrate' | 'normal';

interface HotLead {
  id: string;
  playerId: string;
  player: Player;
  urgency: LeadUrgency;
  reason: string;
  subtext?: string;
  pipelineStage: string;
  addedAt: string;
  lastContactDays?: number;
}

interface HotLeadsSectionProps {
  watchlist: WatchlistWithPlayer[];
  loading?: boolean;
}

function getUrgencyConfig(urgency: LeadUrgency) {
  switch (urgency) {
    case 'urgent':
      return {
        icon: IconWarning,
        iconBg: 'bg-red-50',
        iconColor: 'text-red-500',
        badge: 'bg-red-100 text-red-700',
        badgeText: 'Urgent',
      };
    case 'action_needed':
      return {
        icon: IconClock,
        iconBg: 'bg-amber-50',
        iconColor: 'text-amber-500',
        badge: 'bg-amber-100 text-amber-700',
        badgeText: 'Action Needed',
      };
    case 'celebrate':
      return {
        icon: IconCheck,
        iconBg: 'bg-primary-50',
        iconColor: 'text-primary-500',
        badge: 'bg-primary-100 text-primary-700',
        badgeText: 'New Win',
      };
    default:
      return {
        icon: IconTrendingUp,
        iconBg: 'bg-blue-50',
        iconColor: 'text-blue-500',
        badge: 'bg-blue-100 text-blue-700',
        badgeText: 'Active',
      };
  }
}

function categorizeLeads(watchlist: WatchlistWithPlayer[]): HotLead[] {
  const now = new Date();
  const leads: HotLead[] = [];

  for (const item of watchlist) {
    if (!item.player) continue;

    const addedDateStr = item.added_at || item.created_at || new Date().toISOString();
    const addedDate = new Date(addedDateStr);
    const daysSinceAdded = differenceInDays(now, addedDate);
    const updatedDateStr = item.updated_at || item.created_at || new Date().toISOString();
    const updatedDate = new Date(updatedDateStr);
    const daysSinceUpdated = differenceInDays(now, updatedDate);

    let urgency: LeadUrgency = 'normal';
    let reason = '';
    let subtext: string | undefined;

    // Committed players - celebrate!
    if (item.pipeline_stage === 'committed') {
      const daysSinceCommit = daysSinceUpdated;
      if (daysSinceCommit <= 7) {
        urgency = 'celebrate';
        reason = daysSinceCommit === 0 ? 'Committed today!' : `Committed ${daysSinceCommit} day${daysSinceCommit === 1 ? '' : 's'} ago`;
        subtext = 'Send welcome materials';
      }
    }
    // High priority players that haven't been touched in a while
    else if (item.pipeline_stage === 'high_priority') {
      if (daysSinceUpdated >= 7) {
        urgency = 'urgent';
        reason = `No activity in ${daysSinceUpdated} days`;
        subtext = 'High priority player needs follow-up';
      } else if (daysSinceUpdated >= 3) {
        urgency = 'action_needed';
        reason = `Last touched ${daysSinceUpdated} days ago`;
        subtext = 'Consider reaching out soon';
      }
    }
    // Offer extended but no response
    else if (item.pipeline_stage === 'offer_extended') {
      if (daysSinceUpdated >= 14) {
        urgency = 'urgent';
        reason = `Offer pending for ${daysSinceUpdated} days`;
        subtext = 'Follow up on offer status';
      } else if (daysSinceUpdated >= 7) {
        urgency = 'action_needed';
        reason = `Offer sent ${daysSinceUpdated} days ago`;
        subtext = 'Check in on decision timeline';
      }
    }
    // Watchlist players added recently (potential quick wins)
    else if (item.pipeline_stage === 'watchlist') {
      if (daysSinceAdded <= 3) {
        urgency = 'action_needed';
        reason = 'Recently added to watchlist';
        subtext = 'Review and prioritize';
      }
    }

    // Only add leads with some urgency indicator
    if (urgency !== 'normal') {
      leads.push({
        id: item.id,
        playerId: item.player_id,
        player: item.player,
        urgency,
        reason,
        subtext,
        pipelineStage: item.pipeline_stage || 'watchlist',
        addedAt: addedDateStr,
        lastContactDays: daysSinceUpdated,
      });
    }
  }

  // Sort by urgency priority
  const urgencyOrder: Record<LeadUrgency, number> = {
    urgent: 0,
    action_needed: 1,
    celebrate: 2,
    normal: 3,
  };

  return leads.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
}

export function HotLeadsSection({ watchlist, loading }: HotLeadsSectionProps) {
  const hotLeads = useMemo(() => categorizeLeads(watchlist).slice(0, 5), [watchlist]);

  if (loading) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-hidden">
        <ShineEffect />
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
              <IconTrendingUp size={18} className="text-orange-600" />
            </div>
            <h2 className="font-semibold text-slate-900 tracking-tight">Hot Leads</h2>
          </div>
        </div>
        <div className="p-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 py-4 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 bg-slate-200 rounded" />
                <div className="h-3 w-1/2 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (hotLeads.length === 0) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-hidden">
        <ShineEffect />
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
              <IconTrendingUp size={18} className="text-orange-600" />
            </div>
            <h2 className="font-semibold text-slate-900 tracking-tight">Hot Leads</h2>
          </div>
          <Link href="/baseball/dashboard/pipeline" className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors group">
            Pipeline <IconChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
            <IconCheck size={24} className="text-primary-500" />
          </div>
          <h3 className="text-base font-medium text-slate-900 mb-1">All caught up!</h3>
          <p className="text-sm text-slate-500 text-center mb-4 max-w-xs">
            No players need immediate attention. Keep building your pipeline.
          </p>
          <Link href="/baseball/dashboard/discover">
            <Button size="sm" className="gap-2">
              <IconSearch size={14} /> Discover Players
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative glass-standard rounded-2xl overflow-hidden">
      <ShineEffect />
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
            <IconTrendingUp size={18} className="text-orange-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 tracking-tight">Hot Leads</h2>
            <p className="text-xs text-slate-500">{hotLeads.length} player{hotLeads.length !== 1 ? 's' : ''} need attention</p>
          </div>
        </div>
        <Link href="/baseball/dashboard/pipeline" className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors group">
          View all <IconChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
      <div className="divide-y divide-slate-100/50">
        {hotLeads.map((lead, index) => {
          const config = getUrgencyConfig(lead.urgency);
          const Icon = config.icon;

          return (
            <div
              key={lead.id}
              className="px-6 py-4 hover:bg-slate-50/50 transition-all duration-200 animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start gap-4">
                {/* Urgency indicator */}
                <div className={`w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} className={config.iconColor} />
                </div>

                {/* Player info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      href={`/baseball/dashboard/players/${lead.playerId}`}
                      className="text-sm font-medium text-slate-900 hover:text-primary-600 transition-colors truncate"
                    >
                      {getFullName(lead.player.first_name, lead.player.last_name)}
                    </Link>
                    <Badge variant="secondary" className="text-xs bg-slate-100">
                      {lead.player.primary_position}
                    </Badge>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs text-slate-500">{lead.player.grad_year}</span>
                  </div>
                  <p className="text-sm text-slate-600">{lead.reason}</p>
                  {lead.subtext && (
                    <p className="text-xs text-slate-400 mt-0.5">{lead.subtext}</p>
                  )}

                  {/* Quick actions */}
                  <div className="flex items-center gap-2 mt-3">
                    <Link href={`/baseball/dashboard/messages?player=${lead.playerId}`}>
                      <Button variant="secondary" size="sm" className="h-8 text-xs gap-1.5 bg-slate-100 hover:bg-slate-200 transition-colors active:bg-slate-300 border-0">
                        <IconMessage size={14} /> Message
                      </Button>
                    </Link>
                    <Link href={`/baseball/dashboard/players/${lead.playerId}`}>
                      <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-slate-500 hover:text-slate-700">
                        <IconEye size={14} /> View
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Stage badge */}
                <Badge className={`${config.badge} text-xs flex-shrink-0`}>
                  {config.badgeText}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
      {/* Footer link */}
      <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-100/50">
        <Link
          href="/baseball/dashboard/pipeline"
          className="text-sm text-slate-600 hover:text-primary-600 transition-colors flex items-center justify-center gap-1"
        >
          Manage full pipeline <IconChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
