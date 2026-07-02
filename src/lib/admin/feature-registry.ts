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

export type FeatureApp = 'golfhelm' | 'coachhelm';
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
}

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
        'getNextQualifierRoundNumber',
        'getQualifierLeaderboard',
      ],
    },
    primaryTable: 'golf_qualifiers',
    heartbeatTable: 'golf_qualifiers',
    tier: 'med',
    seasonalEmpty: false,
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
