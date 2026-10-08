# Golf server actions: who owns what

One line per file in `src/app/golf/actions/**`, with the async functions it
exports. Find the domain first, then the file. `rg "export async function <name>"`
is the fallback when a name is not listed.

Rules that keep this surface safe:

- A file that starts with `'use server'` may export **only async functions**
  (types and interfaces declared with `export type` / `export interface` are
  erased and fine). Everything else lives in a plain module beside it
  (`*-shared.ts`, `*-types.ts`, `*-helpers.ts`).
- No barrel re-exports. Import from the file that owns the function. Next.js
  registers every name in an export list of a server file as an action, and
  `src/test/use-server-type-reexport.test.ts` fails on `export type { ... }`.
- Every exported action is wrapped with `withAdminObserved` and mapped in
  `src/lib/admin/feature-registry.ts`; the coverage-contract tests enforce it.
- Keep a file under 2,500 lines. Two files still exceed that: `stats-data.ts`
  (2,954) and `teams.ts` (2,919). Both were below the 3,000-line split
  threshold of plan phase 7a.

Where the old oversized files went (plan phase 7a):

| Former file | Now |
| --- | --- |
| `golf.ts` (10,644 lines) | `round-submit.ts`, `round-partial.ts`, `shot-actions.ts`, `qualifier-actions.ts`, `saved-courses.ts`, `calendar-events.ts`, `calendar-notifications.ts`, `calendar-blocked-time.ts`, `team-management.ts`, plus shared helpers in `golf-action-shared.ts` |
| `admin-data.ts` (4,054) | `admin-dashboard-data.ts`, `admin-incidents-data.ts`, `admin-dashboard-assemble.ts`, `admin-data-shared.ts` |
| `insights.ts` (4,027) | `insights-feed.ts`, `insights-player-analysis.ts`, `insights-coachhelm.ts`, `insights-shared.ts` |

Side-effect import to remember: `insights-coachhelm.ts` registers the
post-round trigger with `src/lib/coachhelm/v2/trigger-insights-bridge.ts` at
module load. `post-round-trigger.ts` and the roster-sweep cron import it for
that effect.

## Rounds

- `course-library.ts`: listCourses, listCoursesStrict, getRecentlyPlayedCourses, getCourseTeeCounts, getCourseTeeCountsStrict, getCourseDetail, getCourseTeeHoles, getTeeWithHoles, getTeeRoundDefaults, getCourseEditHistory, getTeamSavedCourses, getTeamSavedCoursesStrict, createCourse, updateCourse, softDeleteCourse, restoreCourse, setCourseImageUrl, removeCourseImage, createTee, contributeCourseFromRound, updateTee, softDeleteTee, restoreTee, saveTeamCourse, unsaveTeamCourse, setTeamCourseDefaultTee, setTeamCoursePinned
- `golf-action-shared.ts`: resolveCourseId, getCoachTeamId, getPlayerTeamId, createSafeFlightRecorder
- `round-drafts.ts`: saveRoundDraft, loadRoundDraft, clearRoundDraft, checkRoundStaleness
- `round-partial.ts`: savePartialRound, deleteInProgressRound
- `round-recap.ts`: generateRoundRecap
- `round-review-content.ts`: helpers/types (no server directive)
- `round-review-narrative.ts`: getRoundReviewNarrative
- `round-review-sequence-attribution.ts`: getRoundReviewSequenceAttribution
- `round-review-system.ts`: getRoundReview, generateAndStoreRoundReview, shareRoundReviewWithCoach, getStatAverages, getPlayerStandingForReview
- `round-reviews.ts`: generateRoundReview, getReviewById, getReviewByRoundId, saveCoachFeedback, shareReviewWithPlayer, getTeamReviews, getPendingCoachReviews, getPlayerReviewHistory, markReviewAsViewed, addPlayerFeedback, retryReviewGeneration, getReviewGenerationStatus, annotateReview, publishReview, markReviewViewedByPlayer, acknowledgeReview, markReviewViewedByCoach
- `round-submit.ts`: submitGolfRoundComprehensive
- `round-type.ts`: updateRoundType
- `saved-courses.ts`: getPlayerSavedCourses, savePlayerCourse, touchSavedCourse, getRecentCoursesForPlayer

## Holes and shots

- `player-fingerprint-types.ts`: helpers/types (no server directive)
- `player-fingerprint.ts`: getPlayerFingerprint
- `shot-actions.ts`: deleteShot, updateShot, getRoundShotDetails
- `shot-analytics.ts`: getPlayerShotAnalytics

## Stats

- `dashboard-data.ts`: getCoachDashboardData, getPlayerDashboardData, getCachedCoachDashboardData, getCachedPlayerDashboardData
- `player-effectiveness.ts`: getPlayerEffectiveness
- `player-hub-data.ts`: getPlayerHubSummaryData
- `player-profile-stats.ts`: getPlayerProfileStats, getPlayerQuickSummary
- `stats-dashboard.ts`: getPlayerStatsDashboardBundle, getPlayerStatsDashboardCritical, getPlayerStatsDashboardDeferred
- `stats-data-types.ts`: helpers/types (no server directive)
- `stats-data.ts`: verifyPlayerAccess, getPlayerDisplayName, getStatsSummary, getDetailedStats, getSprayChartData, getTrendAnalysis, getTeamComparison, getFilterOptions, getPlayerRoundOptions, getCourseBreakdown, getWorstHoleAnalysis, getPlayerStrengthsWeaknesses, getCoachRosterStats
- `stats-intelligence.ts`: getPlayerStatsIntelligence, getTeamStatsIntelligence
- `stats-leak-maps-types.ts`: helpers/types (no server directive)
- `stats-leak-maps.ts`: getTeamLeakMaps, getPuttMakeLeakMap, getApproachProximityLeakMap, getPlayerLeakMaps, getPlayerStandingRows
- `stats.ts`: getPlayerStatsSummaryAction, getFullPlayerStatsAction, refreshStatsCacheAction, getTeamStatsAction, getTeamTopPlayersAction, onRoundCompleteAction, markStatsStaleAction, getPlayerStatsDirectAction
- `team-sg-baseline.ts`: getTeamSgBaseline, setTeamSgBaseline

## Insights

- `alerts.ts`: getAlertCounts, generateAlerts
- `causal-relationships.ts`: getPlayerCausalRelationships, getTeamCausalRelationships
- `insight-attribution.ts`: getInsightAttributionReadout, getPlayerAttributionReadouts
- `insight-celebration.ts`: markCelebrationShown
- `insight-delivery-ranking.ts`: rankEvidenceInsightsScored, rankEvidenceInsights
- `insight-delivery.ts`: getTopInsightForPlayer, getInsightsForPlayer, getInsightsForCoach, getInsightsForCoachWithMeta, getTopInsightsForPlayers, getRoundTakeawayInsight, getThemesForPlayer, getThemesForCoach
- `insight-management.ts`: searchInsights, exportInsights, getInsightFilterOptions, getInsightsStats
- `insights-coachhelm.ts`: getCoachHelmStatus, getPlayerCoachHelmDashboard, refreshPlayerAnalysisAsCoach, refreshTeamAnalysisAsCoach, getTeamCoachHelmAccess, getOrCreateTeamCoachHelmSettings, updateTeamCoachHelmSettings
- `insights-feed.ts`: getTopInsightsByStrokeImpact, generateTeamInsights, getActiveInsights, acknowledgeInsight, dismissInsight, reactivateInsight, resolveInsight, rateInsight
- `insights-player-analysis.ts`: getPlayerFocusAreas, analyzePlayer, generatePlayerInsight, generatePracticeRecommendations, getPlayerTrajectory, getPlayerPatterns, generateRoundReview, recordInteraction
- `insights-shared.ts`: getCoachPhilosophy, verifyPlayerAccessForInsights
- `intelligence-dashboard.ts`: getTeamInsightsSummary, generateTeamCorrelations, dismissInsight, acknowledgeInsight
- `pattern-management.ts`: getTeamPatterns, validatePattern, dismissPattern, markPatternAddressed, resolvePattern, reopenPattern, getPatternStats
- `signal-groups.ts`: getSignalGroups, reviewSignal, dismissSignal
- `team-category-insights-helpers.ts`: helpers/types (no server directive)
- `team-category-insights.ts`: getTeamOverview, getTeamCategoryInsights

## CoachHelm

- `coachhelm-analytics.ts`: getInsightEffectiveness, getPredictionPerformance, getPatternImpact, getCoachHelmOverview, getInsightTrustSignals
- `coachhelm-data.ts`: getPlayerProfile, getPlayerTrendAnalysis, getPlayerShotContext, getTeamSimulation, getPlayerWhatIf
- `coaching-philosophy.ts`: revalidateCoachingPhilosophyPaths, saveCoachingPhilosophy
- `v3/focus-area-progress.ts`: helpers/types (no server directive)
- `v3/goal-progress.ts`: helpers/types (no server directive)
- `v3/goals.ts`: createGoal, suggestGoalTarget, pauseGoal, abandonGoal, resumeGoal, acceptGoalSuggestion, dismissGoalSuggestion, createTeamGoal
- `v3/intent.ts`: setIntent, bulkSetIntent
- `v3/llm.ts`: generateHeroNarrative
- `v3/notification-prefs.ts`: loadMyNotificationPrefs, setCategoryChannel, setAllChannels, setQuietMode
- `v3/practice-rx.ts`: generatePracticeRx
- `v3/qualifying.ts`: advanceSelectionState, setQualifierCoachPick, removeQualifierCoachPick, chooseQualifierTiePlace, confirmQualifierSelection
- `v3/team-practice-rx.ts`: generateTeamPracticeRx

## Practice and development

- `class-detail.ts`: getClassOccurrenceDetail
- `conflict-inbox.ts`: getConflictInbox
- `development.ts`: createFocusArea, createPlayerFocusArea, acceptFocusArea, declineFocusArea, updateFocusArea, deleteFocusArea, updateFocusAreaProgress, completeFocusArea, reactivateFocusArea, createFocusAreaFromReview, createFocusAreaFromInsightV2, createFocusAreaFromInsight, recordFocusAreaOutcome
- `drills.ts`: getDrillsForInsight, getDrillsForInsights, recordDrillView, recordDrillAddedToPlan
- `focus-area-practice-log.ts`: logFocusAreaPracticeSession, addFocusAreaCriterion, setFocusAreaCriterionMet
- `player-feedback.ts`: rateInsightAsPlayer
- `scheduling.ts`: getScheduleWindow
- `task-reminders.ts`: setTaskReminder, cancelTaskReminder, getUpcomingReminders, getDueReminders, markReminderSent, processReminders, getReminderStats
- `tasks.ts`: completeTask, uncompleteTask, createTask, createRecurringTask, deleteTask, setTaskReminder, clearTaskReminder, getTaskTemplates, createTaskTemplate, updateTaskTemplate, deleteTaskTemplate, createTaskFromTemplate, seedDefaultTemplates

## Qualifiers

- `qualifier-actions.ts`: createGolfQualifier, getQualifierRoundCourses, setQualifierRoundCourses, updateQualifierStatus, updateGolfQualifierDetails, getPlayerQualifiers, getNextQualifierRoundNumber, getQualifierLeaderboard
- `qualifier-progress.ts`: helpers/types (no server directive)
- `qualifier-setup.ts`: setQualifierSquadSize, setQualifierEntrants

## Teams and roster

- `access-code.ts`: validateAccessCode
- `announcements.ts`: createEnrichedAnnouncement, getAnnouncementsWithMeta, getAnnouncementDetail, completeAnnouncementTask, deleteAnnouncement, updateAnnouncement
- `attendance.ts`: markAttendance, checkInPlayer, markNoShow, bulkCheckIn, getAttendanceReport, getPlayerAttendanceStats, updateAttendanceNote
- `auth.ts`: loginAction, signupAction, requestPasswordResetAction, signupWithStaffInviteAction
- `coach-entry.ts`: getGolfCoachEntry
- `communication.ts`: acknowledgeAnnouncement, getAnnouncementAcknowledgements, hasPlayerAcknowledged
- `demo-access.ts`: enterDemo
- `demo-tracking.ts`: getDemoSessions
- `documents.ts`: getDocuments, getDocument, createDocument, saveTextDocument, updateDocument, deleteDocument, uploadNewVersion, getDocumentVersions, revertToVersion, compareVersions, getPreviewUrl, uploadGolfDocument, createGolfDocument, deleteGolfDocument, updateGolfDocument, getVersionHistory, deleteVersion, getTextFileContent
- `event-documents.ts`: getEventDocuments, attachDocumentToEvent, detachDocumentFromEvent
- `message-attachments.ts`: sendGolfMessageWithAttachments, getGolfMessageAttachments, getGolfConversationFiles, deleteGolfMessageAttachment, getSignedUrlsForAttachments
- `message-mute.ts`: getGolfConversationMute, setGolfConversationMute
- `messages.ts`: getGolfConversationParticipantIdentities
- `onboarding.ts`: completeCoachOnboarding, ensurePlayerRecord, completePlayerOnboarding
- `recruit-documents-categories.ts`: helpers/types (no server directive)
- `recruit-documents-limits.ts`: helpers/types (no server directive)
- `recruit-documents.ts`: getRecruitDocuments, prepareRecruitDocumentUpload, completeRecruitDocumentUpload, deleteRecruitDocument, getRecruitDocumentUrl
- `recruiting.ts`: getRecruits, createRecruit, updateRecruit, deleteRecruit
- `roster.ts`: removePlayerFromTeam, getTeamPlayers
- `team-management.ts`: createAnnouncement, invitePlayerToTeam, updatePlayerStatus
- `team-switcher.constants.ts`: helpers/types (no server directive)
- `team-switcher.ts`: setActiveTeam, listCoachTeams, getActiveTeamCookie, clearActiveTeam
- `teams.ts`: validateGolfPlayerCanJoinTeam, joinGolfTeam, processGolfTeamInvitation, createTeam, updateTeam, regenerateJoinCode, createTeamJoinRequest, getTeamJoinRequests, acceptJoinRequest, rejectJoinRequest, cancelJoinRequest, getPlayerJoinRequests, addSecondTeam, createStaffInvite, redeemStaffInvite, previewStaffInvite, listTeamCoachingStaff, listPendingAssistantCoaches, approvePendingAssistantCoach, declinePendingAssistantCoach
- `travel.ts`: createGolfTravelItinerary, updateGolfTravelItinerary, deleteGolfTravelItinerary, createTravelExpense, updateTravelExpense, deleteTravelExpense, getExpensesForItinerary, getExpensesForTeam, getExpenseSummary, uploadExpenseReceipt, exportExpensesToCSV, setBudget, getBudgetsForItinerary, getItineraryForEvent, getTravelerClassConflicts

## Calendar

- `calendar-blocked-time.ts`: addCoachBlockedTime, deleteCoachBlockedTime, updateCoachBlockedTime, getCoachBlockedTime
- `calendar-events.ts`: createGolfEvent, updateGolfEvent, deleteGolfEvent, deleteGolfEventPermanently, respondToEvent, sendEventReminderToPlayers, checkScheduleConflicts, getPlayerAvailability, getCurrentUserBusyPeriods, getPendingInvitations, getPlayerEventRSVP, getEventRSVP
- `calendar-feeds.ts`: getCalendarFeeds, createCalendarFeed, regenerateCalendarFeed, deleteCalendarFeed, getOrCreateCalendarFeedToken, regenerateCalendarFeedToken
- `calendar-notifications.ts`: getNotifications, markNotificationRead, markAllNotificationsRead
- `calendar-sync.ts`: syncClassToCalendar, removeClassFromCalendar
- `recurring-events.ts`: createRecurringEvent, editRecurringEvent, deleteRecurringEvent, getExpandedEvents, createAcademicExclusion, deleteAcademicExclusion
- `schedule-image.ts`: extractClassesFromScheduleImage

## Notifications

- `coach-notifications.ts`: getCoachNotificationCounts
- `notification-badges-types.ts`: helpers/types (no server directive)
- `notification-badges.ts`: getNotificationBadgeBundle
- `player-notifications.ts`: getPlayerNotificationCounts, markAnnouncementsSeen, markTravelSeen, getPlayerHubAnnouncements
- `push-notifications.ts`: registerDeviceToken, unregisterDeviceToken, getDeviceTokens
- `unified-notifications-model.ts`: helpers/types (no server directive)
- `unified-notifications.ts`: getUnifiedNotifications, getNotificationsUnreadCount, markNotificationRead, markAllNotificationsRead

## Admin

- `admin-bi-data.ts`: getEnhancedBIData
- `admin-dashboard-assemble.ts`: helpers/types (no server directive)
- `admin-dashboard-data.ts`: checkAdminAccess, getAdminDashboardRollup, getAdminDashboardData
- `admin-data-shared.ts`: helpers/types (no server directive)
- `admin-incidents-data.ts`: resolveDashboardIncident, getAdminIncidents, getAdminStuckRounds
- `admin-people-data.ts`: getPeopleTabData
- `admin-system-data.ts`: getSystemTabData
- `admin-tracer-data.ts`: getTracerData, getTracerEnrichedData, getTracerRoundDiagnostic, fixRoundData
- `admin/demo-teams.ts`: helpers/types (no server directive)
- `admin/rollup-a.ts`: fetchAdminRollupA
- `admin/rollup-b.ts`: fetchAdminRollupB
- `admin/rollup-c.shared.ts`: helpers/types (no server directive)
- `admin/rollup-c.ts`: fetchAdminRollupC

## CRM and outbound email

- `crm-assignee.ts`: setCoachAssignee
- `crm-automations.ts`: listAutomations, getAutomation, createAutomation, updateAutomation, deleteAutomation
- `crm-dedup.ts`: findDuplicateCoaches, mergeCoaches
- `crm-demo-sessions.ts`: getCrmDemoSessions
- `crm-engagement.ts`: getCoachEngagement, getEngagementLeaderboard
- `crm-foundations.ts`: getSuppressions, addSuppression, removeSuppression, listCoachNotes, createCoachNote, updateCoachNote, deleteCoachNote, listCoachTasks, listMyDueTasks, createCrmTask, updateCrmTask, completeCrmTask, listSegments, createSegment, updateSegment, deleteSegment
- `crm-gmail-send.ts`: getGmailSendStatus, getDomainAuthStatus, sendCoachViaGmail, sendNextBatchViaGmail
- `crm-insights.ts`: getTemplatePerformance, getTimeToOpenDistribution, getClickDestinations, getDeliverabilitySummary, getCrmFunnel
- `crm-intent.ts`: getIntentRanking
- `crm-kpis.ts`: getWeeklyKpis
- `crm-manual-send.ts`: logManualGmailTouch
- `crm-replies.ts`: listReplies, getCoachReplies, markReplyRead, getInboxFeed, getReplyContext
- `crm-sequences.ts`: listSequences, getSequence, getSequenceEnrollmentCounts, createSequence, updateSequence, deleteSequence, upsertSequenceStep, deleteSequenceStep, enrollCoachesInSequence, enrollSegmentInSequence, listEnrollments, getCoachSequenceEnrollmentStatuses, pauseEnrollment, resumeEnrollment, stopEnrollment, getSequencePerformance
- `crm-signals.ts`: getEngagementSignals, setNextFollowUp
- `crm-stage-ages.ts`: getStageAges
- `crm-stage-history.ts`: getCoachStageHistory
- `crm-templates.ts`: listTemplates, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate, setDefaultTemplate, sendTestTemplate
- `crm-timeline.ts`: getCoachTimeline
- `resend-activity.ts`: getResendActivityStats, getEmailsList, getEmailDetail, getDomainBreakdown, getRecentActivityFeed, getEmailClicks, getCoachLastEmailActivity, getFailedEmails

## Other

- `command-palette.ts`: getCommandPaletteData
- `whats-new.ts`: getWhatsNewForCoach
