/**
 * Helm Bridge canonical feature registry (W15 Task 3).
 *
 * The single source of truth for the `feature` key written to
 * `admin_events.feature` (W15 Task 1 migration) and passed as `feature` in
 * `withAdminObserved` opts (W15 Task 2). Mirrors
 * docs/superpowers/specs/helm-bridge/FEATURE_COVERAGE.md §1–§2 verbatim —
 * that doc is canonical; `feature-registry.test.ts` is the tripwire that
 * keeps this file in sync with it.
 *
 * `actions` is a machine-readable encoding of the §2.2 file → feature map:
 * every wrapped export in a file maps to `'ALL'` unless the file is one of
 * the six multi-feature files (golf.ts, insights.ts, dashboard-data.ts,
 * teams.ts, development.ts, recurring-events.ts), in which case only the
 * named exports for THIS feature are listed — the remaining exports of that
 * file belong to a different feature's manifest.
 */

export type FeatureApp = 'golfhelm' | 'coachhelm' | 'baseballhelm';
export type FeatureTier = 'high' | 'med' | 'low';

export type FeatureKey =
  // GolfHelm (24)
  | 'round_tracking'
  | 'stats_analytics'
  | 'qualifiers'
  | 'my_qualifiers'
  | 'calendar_events'
  | 'academics_classes'
  | 'roster_management'
  | 'task_management'
  | 'messaging'
  | 'announcements'
  | 'documents'
  | 'travel'
  | 'team_info'
  | 'join_team_flow'
  | 'settings'
  | 'course_library'
  | 'recruiting_prospect_tracking'
  | 'player_hub'
  | 'coach_dashboard'
  | 'notifications'
  | 'auth_onboarding'
  | 'whats_new'
  | 'my_game_profile'
  | 'admin_dashboard'
  // CoachHelm (13)
  | 'coachhelm_ai_engine'
  | 'alerts_system'
  | 'patterns_dashboard'
  | 'insights_management'
  | 'intelligence_dashboard'
  | 'coachhelm_analytics'
  | 'coaching_intelligence_settings'
  | 'player_coachhelm_dashboard'
  | 'round_review_ai'
  | 'development_plans_coach'
  | 'my_development'
  | 'drills_practice_rx'
  | 'coachhelm_v3_goals'
  // BaseballHelm (48)
  | 'baseball_academics'
  | 'baseball_announcements'
  | 'baseball_auth'
  | 'baseball_calendar'
  | 'baseball_camps'
  | 'baseball_classes'
  | 'baseball_coach_command_center'
  | 'baseball_coachhelm'
  | 'baseball_command_center'
  | 'baseball_compare'
  | 'baseball_decision_room'
  | 'baseball_demo_access'
  | 'baseball_demo_tracking'
  | 'baseball_dev_plans'
  | 'baseball_discover'
  | 'baseball_documents'
  | 'baseball_games'
  | 'baseball_import'
  | 'baseball_insights'
  | 'baseball_interests'
  | 'baseball_lift_onboarding'
  | 'baseball_lifting'
  | 'baseball_lineups'
  | 'baseball_messages'
  | 'baseball_notes'
  | 'baseball_notifications'
  | 'baseball_onboarding'
  | 'baseball_philosophy'
  | 'baseball_player_actions'
  | 'baseball_player_peek'
  | 'baseball_player_today'
  | 'baseball_postgame'
  | 'baseball_practice'
  | 'baseball_profile'
  | 'baseball_recruiting'
  | 'baseball_recruiting_philosophy'
  | 'baseball_roster'
  | 'baseball_scout_packet'
  | 'baseball_settings'
  | 'baseball_signals'
  | 'baseball_staff'
  | 'baseball_stats'
  | 'baseball_tasks'
  | 'baseball_teams'
  | 'baseball_timeline'
  | 'baseball_travel'
  | 'baseball_video'
  | 'baseball_watchlist'
  // Excluded (1) — registry-listed for completeness only, never wrapped.
  | 'crm_recruiting_pipeline';

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  app: FeatureApp;
  /** Action manifest: repo-relative file → 'ALL' | string[] of export names. */
  actions: Record<string, 'ALL' | string[]>;
  primaryTable: string | null;
  heartbeatTable: string | null;
  tier: FeatureTier;
  seasonalEmpty: boolean;
  neverNeutral?: boolean;
  healthSignal: string;
  knownGaps?: string[];
  excluded?: 'crm';
  /**
   * Per-feature heartbeat-staleness override, in hours (W16 Task 1). Only
   * `qualifiers` uses this today — FEATURE_COVERAGE.md §1.1: "Quiet between
   * events is NORMAL: heartbeat window widened to 7d, never ambers on
   * silence alone." Omit to fall back to the tier default in
   * `TIER_THRESHOLDS`.
   */
  heartbeatStaleHoursOverride?: number;
}

/**
 * Tier thresholds (W16 Task 1 — FEATURE_COVERAGE.md §3 "Tier thresholds"
 * table). `computeFeatureStatus()` imports these rather than inlining magic
 * numbers, per the doc's explicit instruction — they get recalibrated after
 * 1-2 weeks of tagged production data (Appendix B item 5).
 *
 * `amberFp`/`redFp` are grouped-fingerprint counts over the tier's judging
 * window (24h for high/med, trailing 7d for low — see computeFeatureStatus).
 * `heartbeatStaleHours` gates the heartbeat-staleness AMBER rule (§3.3).
 */
export interface TierThresholds {
  amberFp: number;
  redFp: number;
  heartbeatStaleHours: number;
}

export const TIER_THRESHOLDS: Readonly<Record<FeatureTier, TierThresholds>> = {
  high: { amberFp: 2, redFp: 5, heartbeatStaleHours: 6 },
  med: { amberFp: 1, redFp: 2, heartbeatStaleHours: 72 },
  low: { amberFp: 1, redFp: 2, heartbeatStaleHours: 24 * 14 },
} as const;

export const FEATURE_REGISTRY: readonly FeatureDef[] = [
  // ── GolfHelm (24) ──────────────────────────────────────────────────────
  {
    key: 'round_tracking',
    label: 'Round Tracking',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/round-drafts.ts': 'ALL',
      'src/app/golf/actions/golf.ts': [
        'submitGolfRoundComprehensive',
        'savePartialRound',
        'deleteInProgressRound',
        'deleteShot',
        'updateShot',
        'getRoundShotDetails',
      ],
    },
    primaryTable: 'golf_rounds',
    heartbeatTable: 'golf_rounds',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal:
      'Round submits/partial saves complete; no 42501 on golf_rounds/holes/shots.',
  },
  {
    key: 'stats_analytics',
    label: 'Stats & Analytics',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/stats.ts': 'ALL',
      'src/app/golf/actions/stats-data.ts': 'ALL',
      'src/app/golf/actions/stats-intelligence.ts': 'ALL',
      'src/app/golf/actions/stats-leak-maps.ts': 'ALL',
      'src/app/golf/actions/shot-analytics.ts': 'ALL',
      'src/app/golf/actions/team-sg-baseline.ts': 'ALL',
    },
    primaryTable: 'golf_player_stats_cache',
    heartbeatTable: 'golf_player_stats_cache',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal:
      'Cache refresh + stats reads succeed post-round. Known-null SG columns are NOT errors (annotated gap).',
  },
  {
    key: 'qualifiers',
    label: 'Qualifiers (coach)',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/v3/qualifying.ts': 'ALL',
      'src/app/golf/actions/golf.ts': [
        'createGolfQualifier',
        'getQualifierRoundCourses',
        'setQualifierRoundCourses',
        'updateQualifierStatus',
        'updateGolfQualifierDetails',
        'reconcileQualifierStatus',
        'getNextQualifierRoundNumber',
        'getQualifierLeaderboard',
      ],
    },
    primaryTable: 'golf_qualifiers',
    heartbeatTable: 'golf_qualifiers',
    tier: 'med',
    seasonalEmpty: false,
    heartbeatStaleHoursOverride: 24 * 7,
    healthSignal:
      'Qualifier CRUD + leaderboard + selection-state transitions succeed. Quiet between events is NORMAL — heartbeat window widened to 7d.',
  },
  {
    key: 'my_qualifiers',
    label: 'My Qualifiers (player)',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/golf.ts': ['getPlayerQualifiers'],
    },
    primaryTable: 'golf_qualifier_entries',
    heartbeatTable: 'golf_qualifier_entries',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Player progress reads match golf_rounds.',
  },
  {
    key: 'calendar_events',
    label: 'Calendar & Events',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/golf.ts': [
        'createGolfEvent',
        'updateGolfEvent',
        'deleteGolfEvent',
        'deleteGolfEventPermanently',
        'respondToEvent',
        'sendEventReminderToPlayers',
        'checkScheduleConflicts',
        'getPlayerAvailability',
        'getCurrentUserBusyPeriods',
        'getPlayerEventRSVP',
        'getEventRSVP',
        'addCoachBlockedTime',
        'deleteCoachBlockedTime',
        'updateCoachBlockedTime',
        'getCoachBlockedTime',
      ],
      'src/app/golf/actions/attendance.ts': 'ALL',
      'src/app/golf/actions/calendar-feeds.ts': 'ALL',
      'src/app/golf/actions/recurring-events.ts': [
        'createRecurringEvent',
        'editRecurringEvent',
        'deleteRecurringEvent',
        'getExpandedEvents',
      ],
      'src/app/golf/actions/event-documents.ts': 'ALL',
    },
    primaryTable: 'golf_events',
    heartbeatTable: 'golf_events',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal:
      'Event CRUD/RSVP/attendance/iCal feeds complete; no 42501 on golf_events/golf_event_attendance.',
  },
  {
    key: 'academics_classes',
    label: 'Academics & Classes',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/calendar-sync.ts': 'ALL',
      'src/app/golf/actions/recurring-events.ts': [
        'createAcademicExclusion',
        'deleteAcademicExclusion',
      ],
    },
    primaryTable: 'golf_player_classes',
    heartbeatTable: 'golf_player_classes',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal:
      'Class↔calendar sync leaves no orphaned events. Seasonal-quiet (summer) never ambers.',
  },
  {
    key: 'roster_management',
    label: 'Roster',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/roster.ts': 'ALL',
      'src/app/golf/actions/golf.ts': [
        'invitePlayerToTeam',
        'updatePlayerStatus',
        'getPendingInvitations',
      ],
    },
    primaryTable: 'golf_team_members',
    heartbeatTable: 'golf_team_members',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal:
      'Invites/status changes/removals succeed; no 42501 on golf_team_members.',
  },
  {
    key: 'task_management',
    label: 'Tasks',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/tasks.ts': 'ALL',
      'src/app/golf/actions/task-templates.ts': 'ALL',
      'src/app/golf/actions/task-reminders.ts': 'ALL',
    },
    primaryTable: 'golf_task_assignments',
    heartbeatTable: 'golf_task_assignments',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal: 'Task CRUD/complete/reminders succeed.',
    knownGaps: [
      'KNOWN dual-table drift: hub reads golf_task_completions, completeTask writes golf_task_assignments — pre-existing bug, not an outage.',
    ],
  },
  {
    key: 'messaging',
    label: 'Messaging',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/message-attachments.ts': 'ALL',
      'src/app/actions/messages.ts': [
        'sendGolfMessage',
        'createGolfConversation',
        'markGolfMessagesAsRead',
        'createGolfTeamBroadcast',
        'getGolfTeamPlayersForBroadcast',
        'updateGolfMessage',
        'deleteGolfMessage',
        'getGolfPlayerUserId',
        'searchGolfMessages',
        'getGolfActiveTeamConversationIds',
      ],
    },
    primaryTable: 'golf_messages',
    heartbeatTable: 'golf_messages',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal:
      'Sends + attachment flows succeed; Realtime delivery not directly measured (absence of send errors is the proxy).',
  },
  {
    key: 'announcements',
    label: 'Announcements',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/announcements.ts': 'ALL',
      'src/app/golf/actions/communication.ts': 'ALL',
      'src/app/golf/actions/golf.ts': ['createAnnouncement'],
    },
    primaryTable: 'golf_announcements',
    heartbeatTable: 'golf_announcements',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal:
      'createEnrichedAnnouncement multi-insert lands atomically (announcement+recipients+docs+tasks); partial-write = error.',
  },
  {
    key: 'documents',
    label: 'Documents',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/documents.ts': 'ALL',
    },
    primaryTable: 'golf_documents',
    heartbeatTable: 'golf_documents',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Upload/version/signed-URL flows succeed against Storage.',
  },
  {
    key: 'travel',
    label: 'Travel',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/travel.ts': 'ALL',
    },
    primaryTable: 'golf_travel_itineraries',
    heartbeatTable: 'golf_travel_itineraries',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Itinerary/expense/budget CRUD succeeds.',
    knownGaps: ['golf_travel_expense_splits table unused — known gap, not an error.'],
  },
  {
    key: 'team_info',
    label: 'Team Info & Switcher',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/team-switcher.ts': 'ALL',
      'src/app/golf/actions/teams.ts': ['createTeam', 'updateTeam', 'regenerateJoinCode'],
    },
    primaryTable: 'golf_teams',
    heartbeatTable: 'golf_teams',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal:
      'Team settings persist; join codes resolve; active-team cookie ops succeed.',
  },
  {
    key: 'join_team_flow',
    label: 'Join Team',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/teams.ts': [
        'validateGolfPlayerCanJoinTeam',
        'joinGolfTeam',
        'processGolfTeamInvitation',
        'createTeamJoinRequest',
        'getTeamJoinRequests',
        'acceptJoinRequest',
        'rejectJoinRequest',
        'cancelJoinRequest',
        'getPlayerJoinRequests',
        'addSecondTeam',
      ],
    },
    primaryTable: 'golf_team_join_requests',
    heartbeatTable: 'golf_team_join_requests',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal:
      'Join by code / requests / accept-reject succeed; no case-sensitivity lookup failures.',
  },
  {
    key: 'settings',
    label: 'Settings & Notification Prefs',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/v3/notification-prefs.ts': 'ALL',
    },
    primaryTable: null,
    heartbeatTable: null,
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Pref writes persist.',
    knownGaps: [
      'Most sub-panels write via inline client calls (src/components/golf/settings/) — RLS-denial capture via the shared helper is the only net for those.',
    ],
  },
  {
    key: 'course_library',
    label: 'Course Library',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/course-library.ts': 'ALL',
      'src/app/golf/actions/courses.ts': 'ALL',
      'src/app/golf/actions/golf.ts': [
        'getPlayerSavedCourses',
        'savePlayerCourse',
        'touchSavedCourse',
        'getRecentCoursesForPlayer',
      ],
    },
    primaryTable: 'golf_courses',
    heartbeatTable: 'golf_courses',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal: 'Course/tee CRUD + contribute-from-round succeed.',
    knownGaps: [
      'A 42501 cluster on golf_courses UPDATE = the known unapplied-RLS-migration class.',
    ],
  },
  {
    key: 'recruiting_prospect_tracking',
    label: 'Recruiting HQ (coach tracker — NOT CRM)',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/recruiting.ts': 'ALL',
      'src/app/golf/actions/recruit-documents.ts': 'ALL',
    },
    primaryTable: 'golf_recruits',
    heartbeatTable: 'golf_recruits',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal:
      'Recruit CRUD + private-bucket doc flows succeed; no 42501 on golf_recruit_documents.',
  },
  {
    key: 'player_hub',
    label: 'Player Hub',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/dashboard-data.ts': [
        'getPlayerDashboardData',
        'getCachedPlayerDashboardData',
      ],
    },
    primaryTable: null,
    heartbeatTable: null,
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'Hub aggregate loads without error.',
    knownGaps: [
      'Task-completion staleness is the known task_management dual-table bug, not an outage.',
    ],
  },
  {
    key: 'coach_dashboard',
    label: 'Coach Dashboard & Command Palette',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/command-palette.ts': 'ALL',
      'src/app/golf/actions/dashboard-data.ts': [
        'getCoachDashboardData',
        'getCachedCoachDashboardData',
      ],
    },
    primaryTable: null,
    heartbeatTable: null,
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'Coach aggregate + palette data load without error.',
  },
  {
    key: 'notifications',
    label: 'Notifications & Push',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/coach-notifications.ts': 'ALL',
      'src/app/golf/actions/player-notifications.ts': 'ALL',
      'src/app/golf/actions/push-notifications.ts': 'ALL',
      'src/app/golf/actions/golf.ts': [
        'getNotifications',
        'markNotificationRead',
        'markAllNotificationsRead',
      ],
    },
    primaryTable: null,
    heartbeatTable: null,
    tier: 'med',
    seasonalEmpty: false,
    healthSignal: 'Counts/mark-read/device-token ops succeed.',
  },
  {
    key: 'auth_onboarding',
    label: 'Auth, Onboarding & Demo',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/auth.ts': 'ALL',
      'src/app/golf/actions/onboarding.ts': 'ALL',
      'src/app/golf/actions/access-code.ts': 'ALL',
      'src/app/golf/actions/demo-access.ts': 'ALL',
      'src/app/golf/actions/demo-tracking.ts': 'ALL',
    },
    primaryTable: 'golf_players',
    heartbeatTable: 'golf_players',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal:
      "Login/signup/reset/onboarding complete; enterDemo's redirect() is control flow (safe to wrap).",
  },
  {
    key: 'whats_new',
    label: "What's New",
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/whats-new.ts': 'ALL',
    },
    primaryTable: null,
    heartbeatTable: null,
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Informational feed loads.',
  },
  {
    key: 'my_game_profile',
    label: 'Player Profile Surfaces (My Game / My Standing / Team Hub)',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/player-profile-stats.ts': 'ALL',
    },
    primaryTable: 'golf_player_stats_cache',
    heartbeatTable: 'golf_player_stats_cache',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Profile stat reads succeed.',
    knownGaps: [
      'Route-ownership partially unverified — remaining data-fetch paths get coverage via the shared RLS helper only until traced.',
    ],
  },
  {
    key: 'admin_dashboard',
    label: 'Admin Platform (self-referential)',
    app: 'golfhelm',
    actions: {
      'src/app/golf/actions/admin-bi-data.ts': 'ALL',
      'src/app/golf/actions/admin-data.ts': 'ALL',
      'src/app/golf/actions/admin-people-data.ts': 'ALL',
      'src/app/golf/actions/admin-system-data.ts': 'ALL',
      'src/app/golf/actions/admin-tracer-data.ts': 'ALL',
      'src/app/golf/actions/admin/rollup-c.ts': 'ALL',
      'src/app/admin/actions/triage.ts': 'ALL',
    },
    primaryTable: 'admin_events',
    heartbeatTable: 'admin_events',
    tier: 'med',
    seasonalEmpty: false,
    neverNeutral: true,
    healthSignal: 'Rollup RPCs return in budget; no 42501 on SECURITY DEFINER rollups.',
  },
  // ── CoachHelm (13) ─────────────────────────────────────────────────────
  {
    key: 'coachhelm_ai_engine',
    label: 'CoachHelm Engine',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/insight-delivery.ts': 'ALL',
      'src/app/golf/actions/player-fingerprint.ts': 'ALL',
      'src/app/golf/actions/insights.ts': [
        'getTopInsightsByStrokeImpact',
        'generateTeamInsights',
        'getActiveInsights',
        'analyzePlayer',
        'generatePlayerInsight',
        'generateTeamInsight',
        'generatePracticeRecommendations',
        'generateTournamentPrep',
        'getPlayerPatterns',
        'recordInteraction',
        'getCoachHelmStatus',
        'triggerPlayerInsightsAfterRound',
        'refreshPlayerAnalysisAsCoach',
        'getTeamCoachHelmAccess',
        'getOrCreateTeamCoachHelmSettings',
        'updateTeamCoachHelmSettings',
      ],
    },
    primaryTable: 'golf_coach_insights',
    heartbeatTable: 'golf_coach_insights',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal:
      'Post-round trigger fan-out (triggerPlayerInsightsAfterRound) completes; insights/patterns accumulate per completed round. Heartbeat measured against round-submit cadence, NOT wall-clock.',
    knownGaps: [
      'Threshold-starvation / philosophy-gate skips are info+skipSentry — EXCLUDED from fingerprint math, shown as a separate starvation-rate line on drill-in.',
    ],
  },
  {
    key: 'alerts_system',
    label: 'Alerts',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/alerts.ts': 'ALL',
    },
    primaryTable: 'golf_coach_insights',
    heartbeatTable: 'golf_coach_insights',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal:
      'Scan-team completes and inserts is_alert rows; ack/dismiss persist.',
  },
  {
    key: 'patterns_dashboard',
    label: 'Patterns',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/pattern-management.ts': 'ALL',
    },
    primaryTable: 'golf_patterns_v2',
    heartbeatTable: 'golf_patterns_v2',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal:
      'Lifecycle transitions (detected→confirmed→addressed→resolved/dismissed) persist; no stuck records.',
  },
  {
    key: 'insights_management',
    label: 'Insights Management',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/insight-management.ts': 'ALL',
      'src/app/golf/actions/insight-evidence.ts': 'ALL',
      'src/app/golf/actions/insights.ts': [
        'acknowledgeInsight',
        'dismissInsight',
        'reactivateInsight',
        'resolveInsight',
        'rateInsight',
        'acknowledgeComposedInsight',
        'dismissComposedInsight',
      ],
    },
    primaryTable: 'golf_coach_insights',
    heartbeatTable: 'golf_coach_insights',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal:
      'Search/filter/export/bulk ops return promptly; export produces a file.',
  },
  {
    key: 'intelligence_dashboard',
    label: 'Intelligence Hub',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/intelligence-dashboard.ts': 'ALL',
      'src/app/golf/actions/team-category-insights.ts': 'ALL',
      'src/app/golf/actions/coachhelm-data.ts': 'ALL',
      'src/app/golf/actions/causal-relationships.ts': 'ALL',
    },
    primaryTable: 'golf_patterns_v2',
    heartbeatTable: 'golf_patterns_v2',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal:
      'Team summary/correlations complete without N+1 timeout.',
    knownGaps: [
      'Known 5+ queries/player N+1 gap — timeouts DO count as errors here.',
    ],
  },
  {
    key: 'coachhelm_analytics',
    label: 'CoachHelm Analytics',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/coachhelm-analytics.ts': 'ALL',
      'src/app/golf/actions/player-effectiveness.ts': 'ALL',
    },
    primaryTable: 'golf_insight_effectiveness',
    heartbeatTable: 'golf_insight_effectiveness',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Effectiveness reads succeed.',
    knownGaps: [
      'Sparse table = expected-degraded, NOT an outage (all-zero dashboards do not error).',
    ],
  },
  {
    key: 'coaching_intelligence_settings',
    label: 'Coaching Intelligence Settings',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/coaching-philosophy.ts': 'ALL',
    },
    primaryTable: 'golf_coach_philosophy',
    heartbeatTable: 'golf_coach_philosophy',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Philosophy saves persist all fields + revalidate fires.',
  },
  {
    key: 'player_coachhelm_dashboard',
    label: 'Player CoachHelm',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/player-feedback.ts': 'ALL',
      'src/app/golf/actions/insight-celebration.ts': 'ALL',
      'src/app/golf/actions/insights.ts': ['getPlayerCoachHelmDashboard'],
    },
    primaryTable: 'golf_predictions',
    heartbeatTable: 'golf_predictions',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal: 'Cold-start auto-generate path does not throw for zero-insight players.',
  },
  {
    key: 'round_review_ai',
    label: 'Round Review AI',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/round-reviews.ts': 'ALL',
      'src/app/golf/actions/round-review-system.ts': 'ALL',
      'src/app/golf/actions/round-recap.ts': 'ALL',
      'src/app/golf/actions/v3/llm.ts': 'ALL',
      'src/app/golf/actions/insights.ts': ['generateRoundReview'],
    },
    primaryTable: 'golf_round_reviews',
    heartbeatTable: 'golf_round_reviews',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal: 'Review generation persists without timeout.',
    knownGaps: [
      'TWO pipelines (V1/V2 rule-based + v3 LLM) both tagged here so whichever is live is covered; per-action name disambiguates on drill-in.',
    ],
  },
  {
    key: 'development_plans_coach',
    label: 'Development Plans (coach)',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/development.ts': [
        'createFocusArea',
        'createPlayerFocusArea',
        'updateFocusArea',
        'deleteFocusArea',
        'completeFocusArea',
        'reactivateFocusArea',
        'createFocusAreaFromReview',
        'createFocusAreaFromInsightV2',
        'createFocusAreaFromInsight',
        'recordFocusAreaOutcome',
      ],
    },
    primaryTable: 'golf_player_focus_areas',
    heartbeatTable: 'golf_player_focus_areas',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal: 'Focus-area creation/updates visible on player side immediately.',
  },
  {
    key: 'my_development',
    label: 'My Development (player)',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/development.ts': [
        'acceptFocusArea',
        'declineFocusArea',
        'updateFocusAreaProgress',
      ],
      'src/app/golf/actions/insights.ts': ['getPlayerFocusAreas'],
    },
    primaryTable: 'golf_player_focus_areas',
    heartbeatTable: 'golf_player_focus_areas',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal:
      'Player accept/decline/progress writes succeed; reads RLS-clean for own player_id.',
  },
  {
    key: 'drills_practice_rx',
    label: 'Drills & Practice Rx',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/drills.ts': 'ALL',
      'src/app/golf/actions/v3/practice-rx.ts': 'ALL',
      'src/app/golf/actions/v3/team-practice-rx.ts': 'ALL',
    },
    primaryTable: 'golf_drills',
    heartbeatTable: 'golf_drills',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Rx generation + drill matching return.',
    knownGaps: [
      'Empty match set = degraded quality signal on drill-in, NOT an error.',
    ],
  },
  {
    key: 'coachhelm_v3_goals',
    label: 'Goals & Progress (V3)',
    app: 'coachhelm',
    actions: {
      'src/app/golf/actions/v3/goals.ts': 'ALL',
      'src/app/golf/actions/v3/goal-progress.ts': 'ALL',
      'src/app/golf/actions/v3/focus-area-progress.ts': 'ALL',
      'src/app/golf/actions/v3/intent.ts': 'ALL',
    },
    primaryTable: 'golf_goals',
    heartbeatTable: 'golf_goals',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal: 'Goal CRUD/suggestions/progress evaluators complete.',
    knownGaps: [
      'V3 surface = documented drift from the 28-feature doc, now first-class here.',
    ],
  },
  // ── BaseballHelm (48) ───────────────────────────────────────────────────
  {
    key: 'baseball_academics',
    label: 'Baseball Academics',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/academics.ts': ['addPlayerClass', 'createEligibilityRecord', 'deletePlayerClass', 'getPlayerClasses', 'getTeamAcademics', 'getTeamEligibility', 'updateEligibility', 'updatePlayerClass', 'upsertPlayerAcademics'],
    },
    primaryTable: 'baseball_academic_eligibility',
    heartbeatTable: 'baseball_academic_eligibility',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Academics actions complete without server errors.',
  },
  {
    key: 'baseball_announcements',
    label: 'Baseball Announcements',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/announcements.ts': ['acknowledgeAnnouncement', 'createAnnouncement', 'deleteAnnouncement', 'getAnnouncementsWithMeta'],
    },
    primaryTable: 'baseball_announcements',
    heartbeatTable: 'baseball_announcements',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Announcements actions complete without server errors.',
  },
  {
    key: 'baseball_auth',
    label: 'Baseball Auth',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/auth.ts': ['changePasswordAction', 'loginAction', 'requestPasswordResetAction', 'signupAction'],
    },
    primaryTable: null,
    heartbeatTable: null,
    tier: 'med',
    seasonalEmpty: false,
    healthSignal: 'Baseball Auth actions complete without server errors.',
  },
  {
    key: 'baseball_calendar',
    label: 'Baseball Calendar',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/calendar.ts': ['attachPracticeToCalendar', 'checkInBaseballPlayer', 'createBaseballEvent', 'deleteBaseballEvent', 'getBaseballEventAttendance', 'getTeamEvents', 'rsvpToBaseballEvent', 'uncheckInBaseballPlayer', 'updateBaseballEvent'],
    },
    primaryTable: 'baseball_events',
    heartbeatTable: 'baseball_events',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal: 'Baseball Calendar actions complete without server errors.',
  },
  {
    key: 'baseball_camps',
    label: 'Baseball Camps',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/camps.ts': ['checkInCampPlayer', 'createCamp', 'deleteCamp', 'markCampNoShow', 'registerForCamp', 'unregisterFromCamp', 'updateCamp'],
    },
    primaryTable: 'baseball_camps',
    heartbeatTable: 'baseball_camps',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Camps actions complete without server errors.',
  },
  {
    key: 'baseball_classes',
    label: 'Baseball Classes',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/video-classes.ts': ['runClassConflictDetection', 'updateClassConflictDisposition'],
    },
    primaryTable: 'baseball_video_class_conflicts',
    heartbeatTable: 'baseball_video_class_conflicts',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Classes actions complete without server errors.',
  },
  {
    key: 'baseball_coach_command_center',
    label: 'Baseball Coach Command Center',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/daily-contract.ts': ['acknowledgeDailyContract'],
    },
    primaryTable: 'baseball_daily_contract_acknowledgements',
    heartbeatTable: 'baseball_daily_contract_acknowledgements',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Coach Command Center actions complete without server errors.',
  },
  {
    key: 'baseball_coachhelm',
    label: 'Baseball CoachHelm',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/ai-governance.ts': ['approveAiOutput', 'dismissAiOutput', 'getAiAuditLog'],
      'src/app/baseball/actions/coachhelm-actions.ts': ['convertInsightToAction', 'recordActionOutcomes'],
      'src/app/baseball/actions/coachhelm.ts': ['runBaseballEngine'],
    },
    primaryTable: 'baseball_insights',
    heartbeatTable: 'baseball_insights',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'Baseball CoachHelm actions complete without server errors.',
  },
  {
    key: 'baseball_command_center',
    label: 'Baseball Command Center',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/acknowledgements.ts': ['acknowledgeEvent', 'getMyEventAcknowledgements', 'withdrawAcknowledgement'],
    },
    primaryTable: 'baseball_event_acknowledgements',
    heartbeatTable: 'baseball_event_acknowledgements',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'Baseball Command Center actions complete without server errors.',
  },
  {
    key: 'baseball_compare',
    label: 'Baseball Compare',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/(dashboard)/dashboard/compare/actions.ts': ['deleteComparison', 'getSavedComparisons', 'saveComparison'],
    },
    primaryTable: 'baseball_player_comparisons',
    heartbeatTable: 'baseball_player_comparisons',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Compare actions complete without server errors.',
  },
  {
    key: 'baseball_decision_room',
    label: 'Baseball Decision Room',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/decision-room.ts': ['convertSignalToPracticeBlock', 'createMeetingItem', 'getDecisionRoomData', 'getStaffSettingsData', 'markMeetingItemDiscussed', 'recordDecisionNote', 'reopenMeetingItem', 'resolveMeetingItem'],
    },
    primaryTable: 'baseball_meeting_items',
    heartbeatTable: 'baseball_meeting_items',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Decision Room actions complete without server errors.',
  },
  {
    key: 'baseball_demo_access',
    label: 'Baseball Demo Access',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/demo-access.ts': ['enterBaseballDemo', 'isBaseballDemoAvailable', 'isBaseballDemoSession'],
    },
    primaryTable: 'baseball_demo_sessions',
    heartbeatTable: 'baseball_demo_sessions',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal: 'Baseball Demo Access actions complete without server errors.',
  },
  {
    key: 'baseball_demo_tracking',
    label: 'Baseball Demo Tracking',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/demo-tracking.ts': ['getBaseballDemoSessions'],
    },
    primaryTable: 'baseball_demo_sessions',
    heartbeatTable: 'baseball_demo_sessions',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Demo Tracking actions complete without server errors.',
  },
  {
    key: 'baseball_dev_plans',
    label: 'Baseball Dev Plans',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/dev-plans.ts': ['completeGoal', 'completeGoalAsPlayer', 'getActiveDevPlan', 'getDevPlanForCoach', 'getPlayerDevPlans', 'uncompleteGoal', 'uncompleteGoalAsPlayer', 'updateGoalProgress'],
    },
    primaryTable: 'baseball_player_development_plans',
    heartbeatTable: 'baseball_player_development_plans',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Dev Plans actions complete without server errors.',
  },
  {
    key: 'baseball_discover',
    label: 'Baseball Discover',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/discover.ts': ['getDiscoverPlayers', 'getDiscoverTeams', 'getStateCounts', 'getWatchlistIds'],
    },
    primaryTable: null,
    heartbeatTable: null,
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Discover actions complete without server errors.',
  },
  {
    key: 'baseball_documents',
    label: 'Baseball Documents',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/documents.ts': ['createBaseballDocument', 'deleteBaseballDocument', 'getDocument', 'getPreviewUrl', 'getTeamDocuments', 'getTextFileContent', 'getVersionHistory', 'revertToVersion', 'updateBaseballDocument', 'uploadBaseballDocument', 'uploadNewVersion'],
    },
    primaryTable: 'baseball_documents',
    heartbeatTable: 'baseball_documents',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Documents actions complete without server errors.',
  },
  {
    key: 'baseball_games',
    label: 'Baseball Games',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/games.ts': ['createGame', 'deleteGame', 'getGameBoxScore', 'getMySeasonStats', 'getPlayerSeasonStats', 'getTeamGames', 'getTeamSeasonRecord', 'getTeamSeasonStats', 'importSchedule', 'loadStatsCenter', 'markGameCompleted', 'recalculateAllSeasonStats', 'resolveBoxScoreUpload', 'saveFullBoxScore', 'updateGame', 'uploadBoxScoreCSV'],
    },
    primaryTable: 'baseball_games',
    heartbeatTable: 'baseball_games',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'Baseball Games actions complete without server errors.',
  },
  {
    key: 'baseball_import',
    label: 'Baseball Imports',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/imports.ts': ['commitImport', 'getImportRunFileUrl', 'getImportRuns', 'previewImport', 'reviewImportRun', 'rollbackImport'],
      'src/app/baseball/actions/stat-event-imports.ts': ['commitEventImport', 'getEventImportRunFileUrl', 'previewEventImport', 'reviewEventImportRun', 'rollbackEventImport'],
    },
    primaryTable: 'baseball_import_runs',
    heartbeatTable: 'baseball_import_runs',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'Baseball Imports actions complete without server errors.',
  },
  {
    key: 'baseball_insights',
    label: 'Baseball Insights',
    app: 'baseballhelm',
    actions: {
      // generateTeamInsights/getTeamInsights deleted (#394 — dead code, zero
      // callers, superseded by engine-run.ts). resolveCallerCoachId relocated
      // to src/lib/baseball/insights/resolve-coach-id.ts (a plain helper, no
      // longer an exported server action of this file).
      'src/app/baseball/actions/insights.ts': ['dismissInsight', 'markInsightAddressed', 'submitInsightFeedback'],
    },
    primaryTable: 'baseball_insights',
    heartbeatTable: 'baseball_insights',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Insights actions complete without server errors.',
  },
  {
    key: 'baseball_interests',
    label: 'Baseball Interests',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/interests.ts': ['addToInterests', 'getPlayerInterests', 'removeFromInterests', 'updateInterestStatus'],
    },
    primaryTable: 'baseball_player_interests',
    heartbeatTable: 'baseball_player_interests',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Interests actions complete without server errors.',
  },
  {
    key: 'baseball_lift_onboarding',
    label: 'Baseball Lift Onboarding',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/lift-onboarding.ts': ['markLiftOnboardingComplete'],
    },
    primaryTable: null,
    heartbeatTable: null,
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Lift Onboarding actions complete without server errors.',
  },
  {
    key: 'baseball_lifting',
    label: 'Baseball Lifting',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/lift-builder.ts': ['createBuilderExercise', 'getGroupAvailabilityForWeek', 'saveLiftSessionPlan', 'updateBuilderExercise'],
      'src/app/baseball/actions/lifting-v11.ts': ['addLiftDay', 'addLiftPrescription', 'addLiftSection', 'addLiftWeek', 'completeLiftSession', 'createLiftFollowupTask', 'createLiftProgram', 'createStrengthGroup', 'deleteLiftDay', 'deleteLiftPrescription', 'deleteLiftSection', 'deleteLiftWeek', 'deleteStrengthGroup', 'duplicateLiftDay', 'duplicateLiftWeek', 'getLiveWeightRoomSnapshot', 'logBodyweight', 'logSetResult', 'markExerciseObserved', 'modifySessionExercise', 'previewDynamicGroup', 'publishLiftDay', 'recomputeDynamicGroup', 'reorderLiftPrescriptions', 'reorderLiftSections', 'saveProgramAsTemplate', 'saveSorenessMap', 'seedDefaultStrengthGroups', 'sendLiftQuickMessage', 'setAvailabilityStatus', 'setGroupMembers', 'setStrengthMax', 'startLiftSession', 'substituteSessionExercise', 'updateLiftDay', 'updateLiftPrescription', 'updateLiftProgram', 'updateLiftSection', 'updateStrengthGroup'],
      'src/app/baseball/actions/lifting.ts': ['createExercise', 'createLiftAssignment', 'logLiftResult', 'submitReadinessCheckin', 'updateAssignmentStatus'],
    },
    primaryTable: 'baseball_lift_programs',
    heartbeatTable: 'baseball_lift_programs',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'Baseball Lifting actions complete without server errors.',
  },
  {
    key: 'baseball_lineups',
    label: 'Baseball Lineups',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/lineups.ts': ['deleteLineup', 'getTeamLineups', 'saveLineup', 'updateLineup'],
    },
    primaryTable: 'baseball_lineups',
    heartbeatTable: 'baseball_lineups',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Lineups actions complete without server errors.',
  },
  {
    key: 'baseball_messages',
    label: 'Baseball Messaging',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/messages.ts': ['createConversation', 'createPlayerProfileConversation', 'getPlayerUserId', 'markMessagesAsRead', 'sendMessage'],
    },
    primaryTable: 'baseball_messages',
    heartbeatTable: 'baseball_messages',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'Baseball Messaging actions complete without server errors.',
  },
  {
    key: 'baseball_notes',
    label: 'Baseball Coach Notes',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/coach-notes.ts': ['createCoachNote', 'deleteCoachNote', 'summarizeCoachNotes', 'updateCoachNote'],
    },
    primaryTable: 'baseball_coach_notes',
    heartbeatTable: 'baseball_coach_notes',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Coach Notes actions complete without server errors.',
  },
  {
    key: 'baseball_notifications',
    label: 'Baseball Notifications',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/notifications.ts': ['getBaseballNotifications', 'getUnreadNotificationCount', 'markAllNotificationsRead', 'markNotificationRead'],
    },
    primaryTable: 'baseball_notifications',
    heartbeatTable: 'baseball_notifications',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Notifications actions complete without server errors.',
  },
  {
    key: 'baseball_onboarding',
    label: 'Baseball Onboarding',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/onboarding.ts': ['completeBaseballSignupCoach', 'completeCoachOnboarding', 'completePlayerOnboarding', 'signupAndCompleteCoachOnboarding'],
    },
    primaryTable: 'baseball_players',
    heartbeatTable: 'baseball_players',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal: 'Baseball Onboarding actions complete without server errors.',
  },
  {
    key: 'baseball_philosophy',
    label: 'Baseball Philosophy',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/philosophy.ts': ['getPhilosophySettings', 'savePhilosophySettings'],
    },
    primaryTable: null,
    heartbeatTable: null,
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Philosophy actions complete without server errors.',
  },
  {
    key: 'baseball_player_actions',
    label: 'Baseball Player Actions',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/player-actions.ts': ['updatePlayerActionStatus'],
    },
    primaryTable: 'baseball_player_actions',
    heartbeatTable: 'baseball_player_actions',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Player Actions actions complete without server errors.',
  },
  {
    key: 'baseball_player_peek',
    label: 'Baseball Player Peek',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/player-peek.ts': ['getPlayerPeekData'],
    },
    primaryTable: null,
    heartbeatTable: null,
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Player Peek actions complete without server errors.',
  },
  {
    key: 'baseball_player_today',
    label: 'Baseball Player Today',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/daily-contract.ts': ['commitContract', 'completeContract', 'saveDraftAndCommit', 'saveDraftContract', 'setContractVisibility', 'toggleContractItem'],
      'src/app/baseball/actions/passport-settings.ts': ['clearPassportFieldOverride', 'setPassportFieldVisibility', 'updatePassportVisibility'],
      'src/app/baseball/actions/player-today-lift.ts': ['getPlayerLiftTodaySummary'],
    },
    primaryTable: 'baseball_daily_contracts',
    heartbeatTable: 'baseball_daily_contracts',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'Baseball Player Today actions complete without server errors.',
  },
  {
    key: 'baseball_postgame',
    label: 'Baseball Postgame',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/postgame.ts': ['convertPostgameItemToPractice', 'convertPostgameItemToTimeline', 'generatePostgameReview', 'setPostgameItemDisposition'],
    },
    primaryTable: 'baseball_postgame_reviews',
    heartbeatTable: 'baseball_postgame_reviews',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Postgame actions complete without server errors.',
  },
  {
    key: 'baseball_practice',
    label: 'Baseball Practice',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/practice-scrimmage.ts': ['getTeamScrimmages'],
      'src/app/baseball/actions/practice.ts': ['getPlayerPractices', 'getTeamPractices', 'materializePracticeBlockFromSignal'],
    },
    primaryTable: 'baseball_practices',
    heartbeatTable: 'baseball_practices',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'Baseball Practice actions complete without server errors.',
  },
  {
    key: 'baseball_profile',
    label: 'Baseball Profile',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/player-access.ts': ['updateMyPlayerProfile'],
    },
    primaryTable: 'baseball_players',
    heartbeatTable: 'baseball_players',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Profile actions complete without server errors.',
  },
  {
    key: 'baseball_recruiting',
    label: 'Baseball Recruiting',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/player-access.ts': ['activateRecruitingExposure', 'deactivateRecruitingExposure'],
    },
    primaryTable: 'baseball_recruiting_exposure',
    heartbeatTable: 'baseball_recruiting_exposure',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Recruiting actions complete without server errors.',
  },
  {
    key: 'baseball_recruiting_philosophy',
    label: 'Baseball Recruiting Philosophy',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/recruiting-philosophy.ts': ['calculateMatchScoresForPlayers', 'getPlayerPercentile', 'getPlayerPercentiles', 'getRecruitingPhilosophy', 'recalculatePercentiles', 'resetRecruitingPhilosophy', 'saveRecruitingPhilosophy', 'updateGeographicPreferences', 'updateMinimumStandards', 'updatePositionPriorities', 'updateRecruitingWeights', 'updateTargetGradYears'],
    },
    primaryTable: 'baseball_recruiting_philosophy',
    heartbeatTable: 'baseball_recruiting_philosophy',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Recruiting Philosophy actions complete without server errors.',
  },
  {
    key: 'baseball_roster',
    label: 'Baseball Roster',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/roster.ts': ['assignPlayerToTeam', 'getTeamPlayers', 'removePlayerFromTeam'],
    },
    primaryTable: 'baseball_players',
    heartbeatTable: 'baseball_players',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Roster actions complete without server errors.',
  },
  {
    key: 'baseball_scout_packet',
    label: 'Baseball Scout Packet',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/scout-packet.ts': ['getScoutPacketPreview', 'getScoutPacketRoster', 'listScoutPacketLinks', 'mintScoutPacketLink', 'relabelScoutPacketLink', 'resolveScoutPacketByToken', 'revokeScoutPacketLink'],
    },
    primaryTable: 'baseball_scout_packet_links',
    heartbeatTable: 'baseball_scout_packet_links',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Scout Packet actions complete without server errors.',
  },
  {
    key: 'baseball_settings',
    label: 'Baseball Settings',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/program-settings.ts': ['changeProgramType', 'deleteImportSource', 'getProgramBrand', 'getProgramSettings', 'getSettingsAuditLog', 'listImportSources', 'listIntegrations', 'updateOrganizationLogoUrl', 'updateOrganizationProfile', 'updateProgramBlockOrder', 'updateProgramIdentity', 'updateProgramSettings', 'upsertImportSource', 'upsertIntegration'],
      'src/app/baseball/actions/roles-permissions.ts': ['getPermissionMatrix', 'getRoleTemplates'],
      'src/app/baseball/actions/team-season-settings.ts': ['archiveSeason', 'createSeason', 'getTeamJoinSettings', 'listSeasons', 'setCurrentSeason', 'updateSeason', 'updateTeamJoinSettings'],
      'src/app/baseball/actions/teams.ts': ['generateTeamInviteCode', 'getCoachTeamForManagement', 'regenerateTeamInviteCode'],
    },
    primaryTable: 'baseball_program_settings',
    heartbeatTable: 'baseball_program_settings',
    tier: 'med',
    seasonalEmpty: false,
    healthSignal: 'Baseball Settings actions complete without server errors.',
  },
  {
    key: 'baseball_signals',
    label: 'Baseball Signals',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/operational-signals.ts': ['runOperationalSignalDetection'],
      'src/app/baseball/actions/signals.ts': ['acknowledgeSignal', 'assignAction', 'assignSignalOwner', 'convertSignalToAction', 'recordActionOutcome', 'recordSignalFeedback', 'setSignalDisposition', 'updateActionStatus'],
    },
    primaryTable: 'baseball_signals',
    heartbeatTable: 'baseball_signals',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'Baseball Signals actions complete without server errors.',
  },
  {
    key: 'baseball_staff',
    label: 'Baseball Staff',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/staff.ts': ['acceptStaffInvite', 'inviteStaff', 'removeStaff', 'resendStaffInvite', 'revokeStaffInvite', 'updateStaffCapabilities'],
    },
    primaryTable: 'baseball_coaches',
    heartbeatTable: 'baseball_coaches',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Staff actions complete without server errors.',
  },
  {
    key: 'baseball_stats',
    label: 'Baseball Stats',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/player-access.ts': ['getTeamSeasonStatsForViewer'],
      'src/app/baseball/actions/stats.ts': ['getMyAggregates', 'getMyStats', 'getPlayerStats', 'getRecentUploads', 'recalculatePlayerAggregates', 'recalculateTeamAggregates', 'reprocessUpload', 'resolveUnmatchedPlayers', 'uploadStatsCSV'],
    },
    primaryTable: 'baseball_player_stats',
    heartbeatTable: 'baseball_player_stats',
    tier: 'high',
    seasonalEmpty: false,
    healthSignal: 'Baseball Stats actions complete without server errors.',
  },
  {
    key: 'baseball_tasks',
    label: 'Baseball Tasks',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/tasks.ts': ['completeTask', 'createTask', 'createTaskFromTemplate', 'createTaskTemplate', 'deleteTask', 'deleteTaskTemplate', 'getPlayerTasks', 'getTaskAssignments', 'getTaskTemplates', 'getTeamTasks', 'seedDefaultTemplates', 'setTaskReminder', 'uncompleteTask', 'updateTaskTemplate'],
    },
    primaryTable: 'baseball_tasks',
    heartbeatTable: 'baseball_tasks',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Tasks actions complete without server errors.',
  },
  {
    key: 'baseball_teams',
    label: 'Baseball Teams',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/teams.ts': ['createTeam', 'createTeamInvitation', 'deleteTeam', 'joinTeam', 'joinTeamByCode', 'leaveTeamAsCoach', 'processTeamInvitation', 'revokeTeamInvitation', 'updateTeam', 'validatePlayerCanJoinTeam'],
    },
    primaryTable: 'baseball_teams',
    heartbeatTable: 'baseball_teams',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Teams actions complete without server errors.',
  },
  {
    key: 'baseball_timeline',
    label: 'Baseball Timeline',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/timeline-acks.ts': ['acknowledgeTimelineEvent', 'getMyTimelineAcknowledgements', 'withdrawTimelineAcknowledgement'],
    },
    primaryTable: 'baseball_timeline_acknowledgements',
    heartbeatTable: 'baseball_timeline_acknowledgements',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Timeline actions complete without server errors.',
  },
  {
    key: 'baseball_travel',
    label: 'Baseball Travel',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/travel.ts': ['addExpense', 'createItinerary', 'deleteExpense', 'deleteItinerary', 'getExpenseSummary', 'getItineraryExpenses', 'getTeamItineraries', 'updateItinerary'],
    },
    primaryTable: 'baseball_travel_itineraries',
    heartbeatTable: 'baseball_travel_itineraries',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Travel actions complete without server errors.',
  },
  {
    key: 'baseball_video',
    label: 'Baseball Video',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/video-classes.ts': ['batchUploadStaffVideos', 'convertVideoToAction', 'deleteMyVideo', 'incrementMyVideoView', 'linkVideoEvent', 'markVideoReviewedByPlayer', 'reviewVideoEvent', 'saveMyVideo', 'setMyPrimaryVideo', 'updateMyVideo'],
      'src/app/baseball/actions/videos.ts': ['createVideoClip', 'getEventGroupedClips', 'getEvidenceClips', 'getLibraryVideos', 'getPlayerGroupedVideos', 'getTaggedClips'],
    },
    primaryTable: 'baseball_videos',
    heartbeatTable: 'baseball_videos',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Video actions complete without server errors.',
  },
  {
    key: 'baseball_watchlist',
    label: 'Baseball Watchlist',
    app: 'baseballhelm',
    actions: {
      'src/app/baseball/actions/watchlist.ts': ['addToWatchlist', 'addWatchlistNote', 'checkWatchlistStatus', 'removeFromWatchlist', 'toggleWatchlistPlayer', 'updateWatchlistPriority', 'updateWatchlistStatus'],
    },
    primaryTable: 'baseball_watchlist',
    heartbeatTable: 'baseball_watchlist',
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Baseball Watchlist actions complete without server errors.',
  },
  // ── Excluded (1) — never wrapped, never tagged, no board dot ────────────
  {
    key: 'crm_recruiting_pipeline',
    label: 'CRM Outreach (NCAA cold-email)',
    app: 'golfhelm',
    // Owner directive: CRM is NEVER touched — no wrapping, no feature tag,
    // no board presence beyond this registry row. File paths are
    // intentionally NOT listed here so no scan or tooling can mistake CRM
    // for a wrap target.
    actions: {},
    primaryTable: null,
    heartbeatTable: null,
    tier: 'low',
    seasonalEmpty: false,
    healthSignal: 'Excluded — never touch CRM.',
    excluded: 'crm',
  },
] as const;

/**
 * Derived table → feature map. First-writer wins: FEATURE_REGISTRY is
 * ordered so the canonical owner of a shared table (e.g. golf_coach_insights
 * is written by coachhelm_ai_engine, alerts_system, AND insights_management)
 * appears first, resolving collisions deterministically without a second
 * override structure.
 */
export const TABLE_TO_FEATURE: Readonly<Record<string, FeatureKey>> = (() => {
  const map: Record<string, FeatureKey> = {};
  for (const def of FEATURE_REGISTRY) {
    if (def.excluded) continue;
    if (!def.primaryTable) continue;
    if (!(def.primaryTable in map)) {
      map[def.primaryTable] = def.key;
    }
  }
  return map;
})();

export function featureForTable(table: string): FeatureKey | null {
  return TABLE_TO_FEATURE[table] ?? null;
}

/** p_features payload for get_feature_health(jsonb) — excludes the CRM row. */
export function rpcInput(): Array<{ key: FeatureKey; heartbeat_table: string | null }> {
  return FEATURE_REGISTRY.filter((def) => !def.excluded).map((def) => ({
    key: def.key,
    heartbeat_table: def.heartbeatTable,
  }));
}
