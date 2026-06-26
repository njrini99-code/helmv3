export interface TeamHealthData {
  rosterCount: number;
  rosterCapacity: number;
  eligibleCount: number;
  eligibilityPct: number;
  teamGpa: number | null;
  transferReadyCount: number;
  recentJoins: number;
}

export interface DevPlanProgressItem {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  completedGoals: number;
  totalGoals: number;
  progressPct: number;
  hasOverdue: boolean;
  nextGoalTitle: string | null;
}

export interface AttentionItem {
  type: 'academic_risk' | 'declining_stats' | 'overdue_goals' | 'no_video';
  count: number;
  playerIds: string[];
  description: string;
}

export interface TeamStatsTrendPoint {
  date: string;
  teamAvg: number | null;
  exitVelo: number | null;
  obp: number | null;
}

export interface CollegeInterestItem {
  schoolName: string;
  schoolLogo: string | null;
  playerId: string;
  playerName: string;
  viewCount: number;
  isWatchlisted: boolean;
  lastViewed: string;
}

export interface CollegeInterestSummary {
  totalProfileViews: number;
  profileViewsChange: number;
  schoolsInterested: number;
  watchlistAdds: number;
  topInterest: CollegeInterestItem[];
}

export interface TeamActivity {
  id: string;
  type: 'video_upload' | 'goal_completed' | 'stats_uploaded' | 'player_joined' | 'message';
  playerId: string | null;
  playerName: string | null;
  description: string;
  timestamp: string;
}
