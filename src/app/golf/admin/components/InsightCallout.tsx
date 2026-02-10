'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';

type TabId = 'dashboard' | 'visibility' | 'performance' | 'growth';

interface Props {
  data: AdminDashboardData;
  tab: TabId;
}

interface Insight {
  text: string;
  severity: 'info' | 'warning' | 'success';
}

const severityStyles = {
  info: 'bg-blue-50/80 border-blue-200/50 text-blue-800',
  warning: 'bg-amber-50/80 border-amber-200/50 text-amber-800',
  success: 'bg-emerald-50/80 border-emerald-200/50 text-emerald-800',
};

const severityDots = {
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
  success: 'bg-emerald-400',
};

function generateInsights(data: AdminDashboardData, tab: TabId): Insight[] {
  const insights: Insight[] = [];

  if (tab === 'dashboard') {
    if (data.growth.churnedPlayers30d > 0) {
      insights.push({
        text: `${data.growth.churnedPlayers30d} player${data.growth.churnedPlayers30d > 1 ? 's' : ''} churned in the last 30 days`,
        severity: 'warning',
      });
    }
    if (data.health.systemErrors7d > 0) {
      insights.push({
        text: `${data.health.systemErrors7d} AI generation failures detected this week`,
        severity: 'warning',
      });
    }
    if (data.health.roundsToday > 0) {
      insights.push({
        text: `${data.health.roundsToday} round${data.health.roundsToday > 1 ? 's' : ''} submitted today — platform is active`,
        severity: 'success',
      });
    }
    if (data.growth.userGrowthRate > 10) {
      insights.push({
        text: `User growth is up ${data.growth.userGrowthRate}% week-over-week`,
        severity: 'success',
      });
    }
  }

  if (tab === 'visibility') {
    const notOnboarded = data.userDirectory.filter((u) => !u.onboardingCompleted).length;
    if (notOnboarded > 0) {
      insights.push({
        text: `${notOnboarded} user${notOnboarded > 1 ? 's' : ''} haven't completed onboarding`,
        severity: 'warning',
      });
    }
    const dormantUsers = data.userDirectory.filter((u) => {
      if (!u.lastActiveAt) return true;
      return (Date.now() - new Date(u.lastActiveAt).getTime()) > 14 * 86400000;
    });
    if (dormantUsers.length > 0) {
      insights.push({
        text: `${dormantUsers.length} user${dormantUsers.length > 1 ? 's' : ''} inactive for 14+ days`,
        severity: 'warning',
      });
    }
    if (data.users.newUsersThisWeek > 0) {
      insights.push({
        text: `${data.users.newUsersThisWeek} new user${data.users.newUsersThisWeek > 1 ? 's' : ''} signed up this week`,
        severity: 'info',
      });
    }
  }

  if (tab === 'performance') {
    if (data.dataQuality.gpsPercentage < 50) {
      insights.push({
        text: `Only ${data.dataQuality.gpsPercentage}% of shots have GPS data — encourage players to enable location`,
        severity: 'warning',
      });
    }
    if (data.usage.roundsCompletionRate < 80) {
      insights.push({
        text: `Round completion rate is ${data.usage.roundsCompletionRate}% — many rounds are started but not finished`,
        severity: 'warning',
      });
    }
    if (data.scoring.platformScoringAvg != null) {
      insights.push({
        text: `Platform scoring average is ${data.scoring.platformScoringAvg.toFixed(1)} across all players`,
        severity: 'info',
      });
    }
  }

  if (tab === 'growth') {
    if (data.stickiness.dauMauRatio > 20) {
      insights.push({
        text: `DAU/MAU stickiness is ${data.stickiness.dauMauRatio}% — healthy engagement`,
        severity: 'success',
      });
    } else if (data.stickiness.dauMauRatio > 0) {
      insights.push({
        text: `DAU/MAU stickiness is only ${data.stickiness.dauMauRatio}% — consider engagement features`,
        severity: 'warning',
      });
    }
    if (data.playerEngagement.dormant > data.playerEngagement.highEngagement) {
      insights.push({
        text: `More dormant players (${data.playerEngagement.dormant}) than high-engagement (${data.playerEngagement.highEngagement})`,
        severity: 'warning',
      });
    }
    if (data.coachhelmRoi.coachesUsingAI > 0) {
      insights.push({
        text: `${data.coachhelmRoi.coachesUsingAI} coach${data.coachhelmRoi.coachesUsingAI > 1 ? 'es' : ''} actively using CoachHelm AI philosophy`,
        severity: 'info',
      });
    }
  }

  return insights.slice(0, 3);
}

export function InsightCallout({ data, tab }: Props) {
  const insights = generateInsights(data, tab);

  if (insights.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {insights.map((insight, i) => (
        <div
          key={i}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm backdrop-blur-sm',
            severityStyles[insight.severity]
          )}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', severityDots[insight.severity])} />
          {insight.text}
        </div>
      ))}
    </div>
  );
}
