export type AdminCommandCenterMetrics = {
  updatedAt: string;
  status: {
    connected: boolean;
    warnings: string[];
  };
  totals: {
    users: number;
    admins: number;
    newUsers30d: number;
    baseball: {
      players: number;
      coaches: number;
    };
    golf: {
      players: number;
      coaches: number;
    };
  };
  activity: {
    activeSenders7d: number;
    activeSenders30d: number;
    baseballActive7d: number;
    golfActive7d: number;
    messages7d: number;
    conversations30d: number;
  };
  onboarding: {
    baseball: {
      playersTotal: number;
      playersCompleted: number;
      playersProfileComplete: number;
      coachesTotal: number;
      coachesCompleted: number;
    };
    golf: {
      playersTotal: number;
      playersCompleted: number;
      playersProfileComplete: number;
      coachesTotal: number;
      coachesCompleted: number;
    };
  };
  baseball: {
    watchlistStages: Record<string, number>;
    recruitingActivePlayers: number;
    commitments: number;
    videos30d: number;
    engagementEvents30d: number;
  };
  golf: {
    rounds30d: number;
    events30d: number;
    activePlayers30d: number;
  };
  demos: {
    total: number;
    new30d: number;
  };
  auth: {
    failedLogins7d: number;
    lockedAccounts: number;
  };
  geography: {
    topStates: Array<{ state: string; count: number }>;
  };
  gaps: Array<{
    label: string;
    source: string;
    note: string;
  }>;
};
