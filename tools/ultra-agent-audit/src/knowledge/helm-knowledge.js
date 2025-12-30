/**
 * Helm Sports Labs - Complete Knowledge Base
 *
 * REAL DATA extracted from actual Helm app
 * Generated: 2025-12-30T07:46:03.311Z
 * Routes: 69
 */

export const HelmKnowledge = {
  flowGraph: {
    // All 69 routes from Helm app
    nodes: [
      {
            "id": "golf-coach",
            "label": "Welcome to GolfHelm!",
            "path": "/golf/coach",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 900,
            "y": 650,
            "userRoles": [
                  "coach"
            ],
            "features": [
                  "calendar",
                  "messages",
                  "videos"
            ],
            "description": "Coach page",
            "imports": [
                  "button",
                  "input",
                  "select",
                  "icons"
            ]
      },
      {
            "id": "golf-player",
            "label": "Welcome to GolfHelm!",
            "path": "/golf/player",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 1080,
            "y": 650,
            "userRoles": [
                  "player"
            ],
            "features": [
                  "calendar",
                  "messages",
                  "videos"
            ],
            "description": "Player page",
            "imports": [
                  "button",
                  "input",
                  "select",
                  "loading",
                  "icons"
            ]
      },
      {
            "id": "golf-signup",
            "label": "Welcome to GolfHelm",
            "path": "/golf/signup",
            "icon": "✍️",
            "type": "auth",
            "domain": "golf",
            "x": 1050,
            "y": 350,
            "userRoles": [],
            "features": [
                  "calendar",
                  "messages"
            ],
            "description": "Signup page",
            "imports": [
                  "button",
                  "input",
                  "icons"
            ]
      },
      {
            "id": "golf-forgot-password",
            "label": "Check your email",
            "path": "/golf/forgot-password",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 1260,
            "y": 650,
            "userRoles": [],
            "features": [
                  "calendar",
                  "messages"
            ],
            "description": "Forgot-password page",
            "imports": [
                  "button",
                  "input"
            ]
      },
      {
            "id": "golf-reset-password",
            "label": "Reset password",
            "path": "/golf/reset-password",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 1440,
            "y": 650,
            "userRoles": [],
            "features": [
                  "calendar",
                  "messages"
            ],
            "description": "Reset-password page",
            "imports": [
                  "button",
                  "input"
            ]
      },
      {
            "id": "golf-login",
            "label": "Welcome to GolfHelm",
            "path": "/golf/login",
            "icon": "🔐",
            "type": "auth",
            "domain": "golf",
            "x": 1210,
            "y": 350,
            "userRoles": [],
            "features": [
                  "search",
                  "calendar",
                  "messages",
                  "url-params"
            ],
            "description": "Login page",
            "imports": [
                  "button",
                  "input",
                  "shine-effect"
            ]
      },
      {
            "id": "golf-dashboard-settings",
            "label": "Settings",
            "path": "/golf/dashboard/settings",
            "icon": "⚙️",
            "type": "feature",
            "domain": "golf",
            "x": 1620,
            "y": 650,
            "userRoles": [],
            "features": [],
            "description": "Account and preferences settings",
            "imports": [
                  "shine-effect",
                  "avatar",
                  "toast",
                  "icons",
                  "PersonalInfoModal",
                  "EmailModal",
                  "PasswordModal",
                  "NotificationsModal",
                  "AppearanceModal",
                  "LocationModal"
            ]
      },
      {
            "id": "golf-dashboard-tasks",
            "label": "Tasks",
            "path": "/golf/dashboard/tasks",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 900,
            "y": 770,
            "userRoles": [],
            "features": [
                  "search"
            ],
            "description": "Tasks page",
            "imports": [
                  "button",
                  "icons",
                  "CreateTaskModal",
                  "TasksList",
                  "TaskSkeleton"
            ]
      },
      {
            "id": "golf-dashboard-messages",
            "label": "Messages",
            "path": "/golf/dashboard/messages",
            "icon": "💬",
            "type": "feature",
            "domain": "golf",
            "x": 1080,
            "y": 770,
            "userRoles": [],
            "features": [
                  "calendar",
                  "messages"
            ],
            "description": "Send and receive messages",
            "imports": [
                  "avatar",
                  "button",
                  "icons",
                  "toast",
                  "GolfNewMessageModal"
            ]
      },
      {
            "id": "golf-dashboard-calendar",
            "label": "Calendar",
            "path": "/golf/dashboard/calendar",
            "icon": "📅",
            "type": "feature",
            "domain": "golf",
            "x": 1260,
            "y": 770,
            "userRoles": [],
            "features": [
                  "search",
                  "calendar"
            ],
            "description": "View and manage events",
            "imports": [
                  "CalendarContainer",
                  "EventsList",
                  "CreateEventButton",
                  "CalendarClassesList"
            ]
      },
      {
            "id": "golf-dashboard-roster",
            "label": "Team Roster",
            "path": "/golf/dashboard/roster",
            "icon": "👥",
            "type": "feature",
            "domain": "golf",
            "x": 1440,
            "y": 770,
            "userRoles": [
                  "hs-coach",
                  "juco-coach-team",
                  "showcase-coach"
            ],
            "features": [
                  "search",
                  "messages",
                  "analytics",
                  "roster"
            ],
            "description": "View and manage team roster",
            "imports": [
                  "InvitePlayerButton",
                  "PlayerStatusBadge",
                  "shine-effect",
                  "icons"
            ]
      },
      {
            "id": "golf-dashboard-classes",
            "label": "My Classes",
            "path": "/golf/dashboard/classes",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 1620,
            "y": 770,
            "userRoles": [],
            "features": [
                  "search",
                  "comparison",
                  "calendar",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "description": "Classes page",
            "imports": [
                  "card",
                  "button",
                  "icons",
                  "AddClassModal",
                  "UploadScheduleModal",
                  "ConfirmClassesModal",
                  "ClassDetailModal"
            ]
      },
      {
            "id": "golf-dashboard-qualifiers-id",
            "label": "{qualifierData.name}",
            "path": "/golf/dashboard/qualifiers/[id]",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 900,
            "y": 890,
            "userRoles": [],
            "features": [
                  "search"
            ],
            "description": "[id] page",
            "imports": [
                  "shine-effect",
                  "icons"
            ]
      },
      {
            "id": "golf-dashboard-qualifiers",
            "label": "Qualifiers",
            "path": "/golf/dashboard/qualifiers",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 1080,
            "y": 890,
            "userRoles": [],
            "features": [
                  "search",
                  "calendar"
            ],
            "description": "Qualifiers page",
            "imports": [
                  "shine-effect",
                  "CreateQualifierButton",
                  "icons"
            ]
      },
      {
            "id": "golf-dashboard-announcements",
            "label": "Announcements",
            "path": "/golf/dashboard/announcements",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 1260,
            "y": 890,
            "userRoles": [],
            "features": [
                  "search"
            ],
            "description": "Announcements page",
            "imports": [
                  "shine-effect",
                  "CreateAnnouncementButton",
                  "AnnouncementCard",
                  "icons"
            ]
      },
      {
            "id": "golf-dashboard-team",
            "label": "Team Info",
            "path": "/golf/dashboard/team",
            "icon": "🏆",
            "type": "feature",
            "domain": "golf",
            "x": 1440,
            "y": 890,
            "userRoles": [
                  "player"
            ],
            "features": [
                  "roster"
            ],
            "description": "Team hub and information",
            "imports": [
                  "card",
                  "icons"
            ]
      },
      {
            "id": "golf-dashboard-rounds-new",
            "label": "new",
            "path": "/golf/dashboard/rounds/new",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 1620,
            "y": 890,
            "userRoles": [],
            "features": [],
            "description": "New page",
            "imports": []
      },
      {
            "id": "golf-dashboard-rounds-id",
            "label": "{roundData.course_name}",
            "path": "/golf/dashboard/rounds/[id]",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 900,
            "y": 1010,
            "userRoles": [],
            "features": [
                  "calendar",
                  "analytics"
            ],
            "description": "[id] page",
            "imports": [
                  "button",
                  "card",
                  "icons"
            ]
      },
      {
            "id": "golf-dashboard-rounds",
            "label": "Rounds",
            "path": "/golf/dashboard/rounds",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 1080,
            "y": 1010,
            "userRoles": [],
            "features": [
                  "calendar",
                  "analytics"
            ],
            "description": "Rounds page",
            "imports": [
                  "shine-effect",
                  "icons"
            ]
      },
      {
            "id": "golf-dashboard-documents",
            "label": "Documents",
            "path": "/golf/dashboard/documents",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 1260,
            "y": 1010,
            "userRoles": [],
            "features": [
                  "videos"
            ],
            "description": "Documents page",
            "imports": [
                  "shine-effect",
                  "icons"
            ]
      },
      {
            "id": "golf-dashboard",
            "label": "{greeting}, {firstName}",
            "path": "/golf/dashboard",
            "icon": "📄",
            "type": "dashboard",
            "domain": "golf",
            "x": 1300,
            "y": 500,
            "userRoles": [],
            "features": [
                  "search",
                  "calendar",
                  "messages",
                  "analytics",
                  "roster"
            ],
            "description": "Dashboard page",
            "imports": [
                  "EmptyState",
                  "RecentActivityFeed",
                  "loading",
                  "shine-effect",
                  "icons"
            ]
      },
      {
            "id": "golf-dashboard-travel",
            "label": "Travel",
            "path": "/golf/dashboard/travel",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 1440,
            "y": 1010,
            "userRoles": [],
            "features": [],
            "description": "Travel page",
            "imports": [
                  "shine-effect",
                  "icons"
            ]
      },
      {
            "id": "golf-dashboard-stats",
            "label": "Team Stats",
            "path": "/golf/dashboard/stats",
            "icon": "📄",
            "type": "feature",
            "domain": "golf",
            "x": 1620,
            "y": 1010,
            "userRoles": [],
            "features": [
                  "search",
                  "analytics",
                  "roster"
            ],
            "description": "Stats page",
            "imports": [
                  "shine-effect",
                  "GolfStatsDisplay",
                  "icons"
            ]
      },
      {
            "id": "golf",
            "label": "golf",
            "path": "/golf",
            "icon": "⛳",
            "type": "entry",
            "domain": "golf",
            "x": 1300,
            "y": 200,
            "userRoles": [],
            "features": [
                  "analytics",
                  "roster"
            ],
            "description": "Golf page",
            "imports": []
      },
      {
            "id": "baseball-coach-onboarding",
            "label": "coach onboarding",
            "path": "/baseball/coach-onboarding",
            "icon": "📄",
            "type": "onboarding",
            "domain": "baseball",
            "x": 200,
            "y": 350,
            "userRoles": [
                  "coach"
            ],
            "features": [
                  "messages"
            ],
            "description": "Coach-onboarding page",
            "imports": []
      },
      {
            "id": "baseball-coach",
            "label": "coach",
            "path": "/baseball/coach",
            "icon": "📄",
            "type": "feature",
            "domain": "baseball",
            "x": 100,
            "y": 650,
            "userRoles": [
                  "coach"
            ],
            "features": [],
            "description": "Coach page",
            "imports": []
      },
      {
            "id": "baseball-player",
            "label": "Let's build your profile",
            "path": "/baseball/player",
            "icon": "📄",
            "type": "feature",
            "domain": "baseball",
            "x": 280,
            "y": 650,
            "userRoles": [
                  "player"
            ],
            "features": [
                  "calendar",
                  "messages",
                  "videos"
            ],
            "description": "Player page",
            "imports": [
                  "button",
                  "input",
                  "select",
                  "loading",
                  "icons"
            ]
      },
      {
            "id": "baseball-program-id",
            "label": "{organization.name}",
            "path": "/baseball/program/[id]",
            "icon": "🏫",
            "type": "feature",
            "domain": "baseball",
            "x": 460,
            "y": 650,
            "userRoles": [],
            "features": [
                  "search"
            ],
            "description": "[id] page",
            "imports": [
                  "card",
                  "badge",
                  "button",
                  "avatar",
                  "icons"
            ]
      },
      {
            "id": "baseball-player-id",
            "label": "[id]",
            "path": "/baseball/player/[id]",
            "icon": "📄",
            "type": "feature",
            "domain": "baseball",
            "x": 640,
            "y": 650,
            "userRoles": [
                  "player"
            ],
            "features": [
                  "watchlist",
                  "calendar",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "description": "[id] page",
            "imports": [
                  "PlayerCard",
                  "card",
                  "badge",
                  "button",
                  "icons"
            ]
      },
      {
            "id": "baseball-signup",
            "label": "signup",
            "path": "/baseball/signup",
            "icon": "✍️",
            "type": "auth",
            "domain": "baseball",
            "x": 360,
            "y": 350,
            "userRoles": [],
            "features": [],
            "description": "Signup page",
            "imports": []
      },
      {
            "id": "baseball-complete-signup",
            "label": "Email Verified!",
            "path": "/baseball/complete-signup",
            "icon": "✍️",
            "type": "feature",
            "domain": "baseball",
            "x": 820,
            "y": 650,
            "userRoles": [],
            "features": [
                  "messages"
            ],
            "description": "Complete-signup page",
            "imports": [
                  "button",
                  "icons"
            ]
      },
      {
            "id": "baseball-forgot-password",
            "label": "Check your email",
            "path": "/baseball/forgot-password",
            "icon": "📄",
            "type": "feature",
            "domain": "baseball",
            "x": 100,
            "y": 770,
            "userRoles": [],
            "features": [
                  "calendar",
                  "messages"
            ],
            "description": "Forgot-password page",
            "imports": [
                  "button",
                  "input"
            ]
      },
      {
            "id": "baseball-reset-password",
            "label": "Set new password",
            "path": "/baseball/reset-password",
            "icon": "📄",
            "type": "feature",
            "domain": "baseball",
            "x": 280,
            "y": 770,
            "userRoles": [],
            "features": [
                  "calendar",
                  "messages"
            ],
            "description": "Reset-password page",
            "imports": [
                  "button",
                  "input"
            ]
      },
      {
            "id": "baseball-login",
            "label": "Welcome back",
            "path": "/baseball/login",
            "icon": "🔐",
            "type": "auth",
            "domain": "baseball",
            "x": 520,
            "y": 350,
            "userRoles": [],
            "features": [
                  "search",
                  "calendar",
                  "messages",
                  "url-params"
            ],
            "description": "Login page",
            "imports": [
                  "button",
                  "input",
                  "shine-effect"
            ]
      },
      {
            "id": "baseball-dashboard-academics",
            "label": "Track student-athlete academic",
            "path": "/baseball/dashboard/academics",
            "icon": "📄",
            "type": "feature",
            "domain": "baseball",
            "x": 460,
            "y": 770,
            "userRoles": [
                  "coach-team",
                  "juco-coach-team"
            ],
            "features": [
                  "search",
                  "analytics",
                  "roster"
            ],
            "description": "Academics page",
            "imports": [
                  "header",
                  "card",
                  "button",
                  "badge",
                  "avatar",
                  "loading",
                  "empty-state",
                  "input",
                  "select",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-settings-privacy",
            "label": "Privacy Settings",
            "path": "/baseball/dashboard/settings/privacy",
            "icon": "⚙️",
            "type": "feature",
            "domain": "baseball",
            "x": 640,
            "y": 770,
            "userRoles": [],
            "features": [],
            "description": "Privacy page",
            "imports": [
                  "PrivacySettingsForm"
            ]
      },
      {
            "id": "baseball-dashboard-settings",
            "label": "Manage your account settings",
            "path": "/baseball/dashboard/settings",
            "icon": "⚙️",
            "type": "feature",
            "domain": "baseball",
            "x": 820,
            "y": 770,
            "userRoles": [],
            "features": [
                  "calendar",
                  "messages"
            ],
            "description": "Account and preferences settings",
            "imports": [
                  "header",
                  "card",
                  "input",
                  "button",
                  "loading",
                  "toast",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-pipeline",
            "label": "Manage your recruiting pipelin",
            "path": "/baseball/dashboard/pipeline",
            "icon": "📊",
            "type": "feature",
            "domain": "baseball",
            "x": 100,
            "y": 890,
            "userRoles": [
                  "coach-recruiting",
                  "college-coach",
                  "juco-coach-recruiting"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "pipeline",
                  "calendar",
                  "drag-drop"
            ],
            "description": "Drag-and-drop recruiting pipeline management",
            "imports": [
                  "shine-effect",
                  "header",
                  "pipeline-column",
                  "pipeline-card",
                  "empty-state",
                  "loading",
                  "skeleton-loader",
                  "button",
                  "select",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-messages-id",
            "label": "[id]",
            "path": "/baseball/dashboard/messages/[id]",
            "icon": "💬",
            "type": "feature",
            "domain": "baseball",
            "x": 280,
            "y": 890,
            "userRoles": [],
            "features": [
                  "calendar",
                  "messages"
            ],
            "description": "[id] page",
            "imports": [
                  "header",
                  "avatar",
                  "button",
                  "loading",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-messages",
            "label": "messages",
            "path": "/baseball/dashboard/messages",
            "icon": "💬",
            "type": "feature",
            "domain": "baseball",
            "x": 460,
            "y": 890,
            "userRoles": [],
            "features": [
                  "search",
                  "messages",
                  "url-params"
            ],
            "description": "Send and receive messages",
            "imports": [
                  "loading",
                  "EmptyChatState",
                  "NewMessageModal",
                  "toast"
            ]
      },
      {
            "id": "baseball-dashboard-discover",
            "label": "Coach access required",
            "path": "/baseball/dashboard/discover",
            "icon": "🔍",
            "type": "feature",
            "domain": "baseball",
            "x": 640,
            "y": 890,
            "userRoles": [
                  "coach-recruiting",
                  "college-coach",
                  "juco-coach-recruiting"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "videos",
                  "filtering",
                  "preview",
                  "url-params"
            ],
            "description": "Search and filter players with advanced criteria",
            "imports": [
                  "FilterPanel",
                  "DiscoverResults",
                  "PlayerPeekPanel",
                  "header",
                  "loading",
                  "skeleton-loader"
            ]
      },
      {
            "id": "baseball-dashboard-calendar",
            "label": "Calendar",
            "path": "/baseball/dashboard/calendar",
            "icon": "📅",
            "type": "feature",
            "domain": "baseball",
            "x": 820,
            "y": 890,
            "userRoles": [
                  "coach-team"
            ],
            "features": [
                  "search",
                  "calendar",
                  "messages",
                  "analytics"
            ],
            "description": "View and manage events",
            "imports": [
                  "header",
                  "card",
                  "button",
                  "badge",
                  "loading",
                  "skeleton-loader",
                  "icons",
                  "EventModal",
                  "CalendarView",
                  "toast"
            ]
      },
      {
            "id": "baseball-dashboard-comparisons",
            "label": "Saved Comparisons",
            "path": "/baseball/dashboard/comparisons",
            "icon": "📄",
            "type": "feature",
            "domain": "baseball",
            "x": 100,
            "y": 1010,
            "userRoles": [
                  "college-coach",
                  "juco-coach-recruiting"
            ],
            "features": [
                  "comparison"
            ],
            "description": "Comparisons page",
            "imports": [
                  "saved-comparisons-list",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-roster",
            "label": "Roster",
            "path": "/baseball/dashboard/roster",
            "icon": "👥",
            "type": "feature",
            "domain": "baseball",
            "x": 280,
            "y": 1010,
            "userRoles": [
                  "coach-team",
                  "hs-coach",
                  "juco-coach-team",
                  "showcase-coach"
            ],
            "features": [
                  "search",
                  "roster"
            ],
            "description": "View and manage team roster",
            "imports": [
                  "header",
                  "card",
                  "button",
                  "input",
                  "badge",
                  "avatar",
                  "loading",
                  "skeleton-loader",
                  "icons",
                  "InviteModal"
            ]
      },
      {
            "id": "baseball-dashboard-players-id-profile",
            "label": "profile",
            "path": "/baseball/dashboard/players/[id]/profile",
            "icon": "👤",
            "type": "feature",
            "domain": "baseball",
            "x": 460,
            "y": 1010,
            "userRoles": [
                  "player"
            ],
            "features": [
                  "watchlist",
                  "messages",
                  "analytics"
            ],
            "description": "Edit your profile information",
            "imports": [
                  "PlayerCard",
                  "button",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-players-id",
            "label": "Player Profile",
            "path": "/baseball/dashboard/players/[id]",
            "icon": "📄",
            "type": "feature",
            "domain": "baseball",
            "x": 640,
            "y": 1010,
            "userRoles": [
                  "player"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "description": "[id] page",
            "imports": [
                  "header",
                  "button",
                  "avatar",
                  "loading",
                  "bento-grid",
                  "filter-chips",
                  "VideoShowcase",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-colleges",
            "label": "Discover Colleges",
            "path": "/baseball/dashboard/colleges",
            "icon": "🎓",
            "type": "feature",
            "domain": "baseball",
            "x": 820,
            "y": 1010,
            "userRoles": [
                  "player-recruiting"
            ],
            "features": [
                  "search"
            ],
            "description": "Discover and research colleges",
            "imports": [
                  "shine-effect",
                  "header",
                  "college-card",
                  "select",
                  "input",
                  "empty-state",
                  "loading",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-journey",
            "label": "Track your recruiting progress",
            "path": "/baseball/dashboard/journey",
            "icon": "🗺️",
            "type": "feature",
            "domain": "baseball",
            "x": 100,
            "y": 1130,
            "userRoles": [
                  "player-recruiting"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "calendar",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "description": "Track your recruiting journey and milestones",
            "imports": [
                  "header",
                  "card",
                  "badge",
                  "button",
                  "select",
                  "loading",
                  "empty-state",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-camps",
            "label": "camps",
            "path": "/baseball/dashboard/camps",
            "icon": "⛺",
            "type": "feature",
            "domain": "baseball",
            "x": 280,
            "y": 1130,
            "userRoles": [
                  "college-coach"
            ],
            "features": [
                  "search",
                  "calendar",
                  "messages"
            ],
            "description": "Browse and register for camps",
            "imports": [
                  "header",
                  "card",
                  "button",
                  "badge",
                  "loading",
                  "empty-state",
                  "confirm-dialog",
                  "icons",
                  "CreateCampModal",
                  "toast"
            ]
      },
      {
            "id": "baseball-dashboard-videos",
            "label": "Videos",
            "path": "/baseball/dashboard/videos",
            "icon": "🎥",
            "type": "feature",
            "domain": "baseball",
            "x": 460,
            "y": 1130,
            "userRoles": [
                  "coach-team",
                  "hs-coach",
                  "juco-coach-team",
                  "showcase-coach"
            ],
            "features": [
                  "search",
                  "messages",
                  "videos",
                  "roster"
            ],
            "description": "Upload and manage videos",
            "imports": [
                  "header",
                  "video-upload",
                  "video-player",
                  "card",
                  "button",
                  "badge",
                  "input",
                  "avatar",
                  "icons",
                  "loading"
            ]
      },
      {
            "id": "baseball-dashboard-profile",
            "label": "Update your information and sh",
            "path": "/baseball/dashboard/profile",
            "icon": "👤",
            "type": "feature",
            "domain": "baseball",
            "x": 640,
            "y": 1130,
            "userRoles": [
                  "player"
            ],
            "features": [],
            "description": "Edit your profile information",
            "imports": [
                  "header",
                  "button",
                  "loading",
                  "profile-editor",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-team-high-school",
            "label": "High School Team Overview",
            "path": "/baseball/dashboard/team/high-school",
            "icon": "🏆",
            "type": "feature",
            "domain": "baseball",
            "x": 820,
            "y": 1130,
            "userRoles": [
                  "player"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "calendar",
                  "analytics",
                  "videos",
                  "roster",
                  "devPlans"
            ],
            "description": "High-school page",
            "imports": [
                  "header",
                  "stat-card",
                  "card",
                  "avatar",
                  "badge",
                  "button",
                  "loading",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-team",
            "label": "Team Dashboard",
            "path": "/baseball/dashboard/team",
            "icon": "🏆",
            "type": "feature",
            "domain": "baseball",
            "x": 100,
            "y": 1250,
            "userRoles": [
                  "coach-team",
                  "player"
            ],
            "features": [
                  "search",
                  "calendar",
                  "analytics",
                  "videos",
                  "roster",
                  "devPlans"
            ],
            "description": "Team hub and information",
            "imports": [
                  "header",
                  "stat-card",
                  "card",
                  "avatar",
                  "badge",
                  "button",
                  "loading",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-compare",
            "label": "Side-by-side player comparison",
            "path": "/baseball/dashboard/compare",
            "icon": "⚖️",
            "type": "feature",
            "domain": "baseball",
            "x": 280,
            "y": 1250,
            "userRoles": [
                  "coach-recruiting",
                  "college-coach",
                  "juco-coach-recruiting"
            ],
            "features": [
                  "search",
                  "comparison",
                  "url-params"
            ],
            "description": "Side-by-side player comparison tool",
            "imports": [
                  "header",
                  "card",
                  "button",
                  "input",
                  "avatar",
                  "loading",
                  "empty-state",
                  "player-comparison",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-teams",
            "label": "Showcase coach access required",
            "path": "/baseball/dashboard/teams",
            "icon": "🏆",
            "type": "feature",
            "domain": "baseball",
            "x": 460,
            "y": 1250,
            "userRoles": [
                  "showcase-coach"
            ],
            "features": [
                  "calendar",
                  "analytics",
                  "videos",
                  "roster",
                  "devPlans"
            ],
            "description": "Teams page",
            "imports": [
                  "header",
                  "loading",
                  "button",
                  "input",
                  "select",
                  "badge",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-program",
            "label": "Coach access required",
            "path": "/baseball/dashboard/program",
            "icon": "🏫",
            "type": "feature",
            "domain": "baseball",
            "x": 640,
            "y": 1250,
            "userRoles": [],
            "features": [
                  "calendar",
                  "messages",
                  "videos"
            ],
            "description": "Program profile and settings",
            "imports": [
                  "header",
                  "card",
                  "button",
                  "input",
                  "loading",
                  "toast",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-dev-plan",
            "label": "Track your progress and comple",
            "path": "/baseball/dashboard/dev-plan",
            "icon": "📋",
            "type": "feature",
            "domain": "baseball",
            "x": 820,
            "y": 1250,
            "userRoles": [
                  "hs-coach",
                  "juco-coach-team",
                  "showcase-coach"
            ],
            "features": [
                  "devPlans"
            ],
            "description": "Create and track development plans",
            "imports": [
                  "header",
                  "card",
                  "loading",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-activate",
            "label": "Get discovered by college coac",
            "path": "/baseball/dashboard/activate",
            "icon": "📄",
            "type": "feature",
            "domain": "baseball",
            "x": 100,
            "y": 1370,
            "userRoles": [
                  "player"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "description": "Activate recruiting features",
            "imports": [
                  "header",
                  "card",
                  "button",
                  "badge",
                  "loading",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-college-interest",
            "label": "Track which colleges are viewi",
            "path": "/baseball/dashboard/college-interest",
            "icon": "🎓",
            "type": "feature",
            "domain": "baseball",
            "x": 280,
            "y": 1370,
            "userRoles": [
                  "hs-coach",
                  "juco-coach-team"
            ],
            "features": [
                  "search",
                  "comparison",
                  "watchlist",
                  "calendar",
                  "analytics",
                  "videos",
                  "roster"
            ],
            "description": "College-interest page",
            "imports": [
                  "header",
                  "card",
                  "button",
                  "badge",
                  "avatar",
                  "loading",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-events",
            "label": "Showcase coach access required",
            "path": "/baseball/dashboard/events",
            "icon": "📄",
            "type": "feature",
            "domain": "baseball",
            "x": 460,
            "y": 1370,
            "userRoles": [],
            "features": [
                  "search",
                  "calendar"
            ],
            "description": "Events page",
            "imports": [
                  "header",
                  "loading",
                  "button",
                  "input",
                  "select",
                  "badge",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard",
            "label": "Dashboard",
            "path": "/baseball/dashboard",
            "icon": "📄",
            "type": "dashboard",
            "domain": "baseball",
            "x": 500,
            "y": 500,
            "userRoles": [],
            "features": [
                  "search",
                  "watchlist",
                  "pipeline",
                  "calendar",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "description": "Dashboard page",
            "imports": [
                  "header",
                  "avatar",
                  "badge",
                  "button",
                  "loading",
                  "icons",
                  "EngagementChart",
                  "USAMap",
                  "shine-effect"
            ]
      },
      {
            "id": "baseball-dashboard-watchlist",
            "label": "Coach access required",
            "path": "/baseball/dashboard/watchlist",
            "icon": "⭐",
            "type": "feature",
            "domain": "baseball",
            "x": 640,
            "y": 1370,
            "userRoles": [
                  "coach-recruiting",
                  "college-coach",
                  "juco-coach-recruiting"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "pipeline",
                  "messages",
                  "modals",
                  "preview"
            ],
            "description": "Manage your recruiting watchlist and pipeline",
            "imports": [
                  "shine-effect",
                  "header",
                  "button",
                  "select",
                  "empty-state",
                  "loading",
                  "avatar",
                  "icons",
                  "PlayerDetailModal",
                  "PlayerPeekPanel"
            ]
      },
      {
            "id": "baseball-dashboard-analytics",
            "label": "Track your recruiting activity",
            "path": "/baseball/dashboard/analytics",
            "icon": "📈",
            "type": "feature",
            "domain": "baseball",
            "x": 820,
            "y": 1370,
            "userRoles": [
                  "player-recruiting"
            ],
            "features": [
                  "watchlist",
                  "calendar",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "description": "Recruiting analytics and insights",
            "imports": [
                  "header",
                  "card",
                  "loading",
                  "icons"
            ]
      },
      {
            "id": "baseball-dashboard-dev-plans",
            "label": "Create and track player develo",
            "path": "/baseball/dashboard/dev-plans",
            "icon": "📋",
            "type": "feature",
            "domain": "baseball",
            "x": 100,
            "y": 1490,
            "userRoles": [
                  "coach-team",
                  "hs-coach",
                  "juco-coach-team",
                  "showcase-coach"
            ],
            "features": [
                  "search",
                  "analytics",
                  "videos",
                  "devPlans"
            ],
            "description": "Create and track development plans",
            "imports": [
                  "header",
                  "card",
                  "button",
                  "badge",
                  "avatar",
                  "loading",
                  "icons",
                  "CreateDevPlanModal"
            ]
      },
      {
            "id": "baseball",
            "label": "baseball",
            "path": "/baseball",
            "icon": "⚾",
            "type": "entry",
            "domain": "baseball",
            "x": 500,
            "y": 200,
            "userRoles": [],
            "features": [
                  "pipeline",
                  "videos"
            ],
            "description": "Baseball page",
            "imports": []
      },
      {
            "id": "about",
            "label": "about",
            "path": "/about",
            "icon": "📄",
            "type": "feature",
            "domain": null,
            "x": 900,
            "y": 650,
            "userRoles": [],
            "features": [
                  "search",
                  "analytics"
            ],
            "description": "About page",
            "imports": []
      },
      {
            "id": "player-golf",
            "label": "Dashboard",
            "path": "/player-golf",
            "icon": "📄",
            "type": "feature",
            "domain": null,
            "x": 1080,
            "y": 650,
            "userRoles": [],
            "features": [
                  "analytics"
            ],
            "description": "Player-golf page",
            "imports": [
                  "card",
                  "button",
                  "icons"
            ]
      },
      {
            "id": "page.tsx",
            "label": "page.tsx",
            "path": "/page.tsx",
            "icon": "📄",
            "type": "feature",
            "domain": null,
            "x": 1260,
            "y": 650,
            "userRoles": [],
            "features": [
                  "analytics"
            ],
            "description": "Page.tsx page",
            "imports": [
                  "Navigation",
                  "Hero",
                  "ProductShowcases",
                  "Features",
                  "SocialProof",
                  "FinalCTA",
                  "Footer",
                  "ScrollProgress"
            ]
      },
      {
            "id": "help",
            "label": "Help Center",
            "path": "/help",
            "icon": "📄",
            "type": "feature",
            "domain": null,
            "x": 1440,
            "y": 650,
            "userRoles": [],
            "features": [
                  "search",
                  "watchlist",
                  "pipeline",
                  "calendar",
                  "messages",
                  "analytics",
                  "videos",
                  "roster"
            ],
            "description": "Help page",
            "imports": []
      }
],

    // 35 connections between routes
    edges: [
      {
            "from": "home",
            "to": "baseball",
            "label": "Select Baseball"
      },
      {
            "from": "home",
            "to": "golf",
            "label": "Select Golf"
      },
      {
            "from": "baseball",
            "to": "baseball-login",
            "label": "Login"
      },
      {
            "from": "baseball",
            "to": "baseball-signup",
            "label": "Sign Up"
      },
      {
            "from": "baseball-login",
            "to": "baseball-dashboard",
            "label": "Authenticate"
      },
      {
            "from": "baseball-signup",
            "to": "baseball-coach-onboarding",
            "label": "Coach Onboarding"
      },
      {
            "from": "baseball-signup",
            "to": "baseball-player",
            "label": "Player Onboarding"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-discover",
            "label": "College Coach, JUCO Coach (Recruiting Mode)"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-watchlist",
            "label": "College Coach, JUCO Coach (Recruiting Mode)"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-pipeline",
            "label": "College Coach, JUCO Coach (Recruiting Mode)"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-compare",
            "label": "College Coach, JUCO Coach (Recruiting Mode)"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-camps",
            "label": "College Coach"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-messages",
            "label": "Navigate"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-roster",
            "label": "High School Coach, JUCO Coach (Team Mode), Showcase Coach"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-videos",
            "label": "High School Coach, JUCO Coach (Team Mode), Showcase Coach"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-dev-plans",
            "label": "High School Coach, JUCO Coach (Team Mode), Showcase Coach"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-analytics",
            "label": "HS Player (Recruiting Active), Showcase Player (Recruiting Active), JUCO Player (Recruiting Active)"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-journey",
            "label": "HS Player (Recruiting Active), Showcase Player (Recruiting Active), JUCO Player (Recruiting Active)"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-colleges",
            "label": "HS Player (Recruiting Active), Showcase Player (Recruiting Active), JUCO Player (Recruiting Active)"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-profile",
            "label": "All Players"
      },
      {
            "from": "baseball-dashboard",
            "to": "baseball-dashboard-settings",
            "label": "Navigate"
      },
      {
            "from": "golf",
            "to": "golf-login",
            "label": "Login"
      },
      {
            "from": "golf",
            "to": "golf-signup",
            "label": "Sign Up"
      },
      {
            "from": "golf-login",
            "to": "golf-dashboard",
            "label": "Authenticate"
      },
      {
            "from": "golf-signup",
            "to": "golf-coach",
            "label": "Coach Onboarding"
      },
      {
            "from": "golf-signup",
            "to": "golf-player",
            "label": "Player Onboarding"
      },
      {
            "from": "golf-dashboard",
            "to": "golf-dashboard-roster",
            "label": "High School Coach, JUCO Coach (Team Mode), Showcase Coach"
      },
      {
            "from": "golf-dashboard",
            "to": "golf-dashboard-rounds",
            "label": "Navigate"
      },
      {
            "from": "golf-dashboard",
            "to": "golf-dashboard-stats",
            "label": "Navigate"
      },
      {
            "from": "golf-dashboard",
            "to": "golf-dashboard-qualifiers",
            "label": "Navigate"
      },
      {
            "from": "golf-dashboard",
            "to": "golf-dashboard-classes",
            "label": "Navigate"
      },
      {
            "from": "golf-dashboard",
            "to": "golf-dashboard-messages",
            "label": "Navigate"
      },
      {
            "from": "golf-dashboard",
            "to": "golf-dashboard-calendar",
            "label": "Navigate"
      },
      {
            "from": "golf-dashboard",
            "to": "golf-dashboard-team",
            "label": "All Players"
      },
      {
            "from": "golf-dashboard",
            "to": "golf-dashboard-settings",
            "label": "Navigate"
      }
],

    // Detailed metadata for each route
    routeInfo: {
      "golf-coach": {
            "description": "Coach page",
            "userRoles": [
                  "coach"
            ],
            "features": [
                  "calendar",
                  "messages",
                  "videos"
            ],
            "userJourneys": [
                  "User viewing coach page"
            ],
            "coachTypes": [
                  "All Coaches"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "button",
                  "input",
                  "select",
                  "icons"
            ]
      },
      "golf-player": {
            "description": "Player page",
            "userRoles": [
                  "player"
            ],
            "features": [
                  "calendar",
                  "messages",
                  "videos"
            ],
            "userJourneys": [
                  "User viewing player page"
            ],
            "coachTypes": [],
            "playerTypes": [
                  "All Players"
            ],
            "keyComponents": [
                  "button",
                  "input",
                  "select",
                  "loading",
                  "icons"
            ]
      },
      "golf-signup": {
            "description": "Signup page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "calendar",
                  "messages"
            ],
            "userJourneys": [
                  "User logging in or signing up"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "button",
                  "input",
                  "icons"
            ]
      },
      "golf-forgot-password": {
            "description": "Forgot-password page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "calendar",
                  "messages"
            ],
            "userJourneys": [
                  "User viewing forgot-password page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "button",
                  "input"
            ]
      },
      "golf-reset-password": {
            "description": "Reset-password page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "calendar",
                  "messages"
            ],
            "userJourneys": [
                  "User viewing reset-password page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "button",
                  "input"
            ]
      },
      "golf-login": {
            "description": "Login page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search",
                  "calendar",
                  "messages",
                  "url-params"
            ],
            "userJourneys": [
                  "User logging in or signing up",
                  "User searching for content"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "button",
                  "input",
                  "shine-effect"
            ]
      },
      "golf-dashboard-settings": {
            "description": "Account and preferences settings",
            "userRoles": [
                  "public"
            ],
            "features": [],
            "userJourneys": [
                  "User viewing account and preferences settings"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "shine-effect",
                  "avatar",
                  "toast",
                  "icons",
                  "PersonalInfoModal"
            ]
      },
      "golf-dashboard-tasks": {
            "description": "Tasks page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "button",
                  "icons",
                  "CreateTaskModal",
                  "TasksList",
                  "TaskSkeleton"
            ]
      },
      "golf-dashboard-messages": {
            "description": "Send and receive messages",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "calendar",
                  "messages"
            ],
            "userJourneys": [
                  "User viewing send and receive messages"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "avatar",
                  "button",
                  "icons",
                  "toast",
                  "GolfNewMessageModal"
            ]
      },
      "golf-dashboard-calendar": {
            "description": "View and manage events",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search",
                  "calendar"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "CalendarContainer",
                  "EventsList",
                  "CreateEventButton",
                  "CalendarClassesList"
            ]
      },
      "golf-dashboard-roster": {
            "description": "View and manage team roster",
            "userRoles": [
                  "hs-coach",
                  "juco-coach-team",
                  "showcase-coach"
            ],
            "features": [
                  "search",
                  "messages",
                  "analytics",
                  "roster"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [
                  "High School Coach",
                  "JUCO Coach (Team Mode)",
                  "Showcase Coach"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "InvitePlayerButton",
                  "PlayerStatusBadge",
                  "shine-effect",
                  "icons"
            ]
      },
      "golf-dashboard-classes": {
            "description": "Classes page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search",
                  "comparison",
                  "calendar",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "userJourneys": [
                  "User searching for content",
                  "User comparing multiple items"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "card",
                  "button",
                  "icons",
                  "AddClassModal",
                  "UploadScheduleModal"
            ]
      },
      "golf-dashboard-qualifiers-id": {
            "description": "[id] page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "shine-effect",
                  "icons"
            ]
      },
      "golf-dashboard-qualifiers": {
            "description": "Qualifiers page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search",
                  "calendar"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "shine-effect",
                  "CreateQualifierButton",
                  "icons"
            ]
      },
      "golf-dashboard-announcements": {
            "description": "Announcements page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "shine-effect",
                  "CreateAnnouncementButton",
                  "AnnouncementCard",
                  "icons"
            ]
      },
      "golf-dashboard-team": {
            "description": "Team hub and information",
            "userRoles": [
                  "player"
            ],
            "features": [
                  "roster"
            ],
            "userJourneys": [
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [],
            "playerTypes": [
                  "All Players"
            ],
            "keyComponents": [
                  "card",
                  "icons"
            ]
      },
      "golf-dashboard-rounds-new": {
            "description": "New page",
            "userRoles": [
                  "public"
            ],
            "features": [],
            "userJourneys": [
                  "User viewing new page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": []
      },
      "golf-dashboard-rounds-id": {
            "description": "[id] page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "calendar",
                  "analytics"
            ],
            "userJourneys": [
                  "User viewing [id] page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "button",
                  "card",
                  "icons"
            ]
      },
      "golf-dashboard-rounds": {
            "description": "Rounds page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "calendar",
                  "analytics"
            ],
            "userJourneys": [
                  "User viewing rounds page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "shine-effect",
                  "icons"
            ]
      },
      "golf-dashboard-documents": {
            "description": "Documents page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "videos"
            ],
            "userJourneys": [
                  "User viewing documents page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "shine-effect",
                  "icons"
            ]
      },
      "golf-dashboard": {
            "description": "Dashboard page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search",
                  "calendar",
                  "messages",
                  "analytics",
                  "roster"
            ],
            "userJourneys": [
                  "User viewing dashboard overview",
                  "User accessing main features",
                  "User searching for content",
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "EmptyState",
                  "RecentActivityFeed",
                  "loading",
                  "shine-effect",
                  "icons"
            ]
      },
      "golf-dashboard-travel": {
            "description": "Travel page",
            "userRoles": [
                  "public"
            ],
            "features": [],
            "userJourneys": [
                  "User viewing travel page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "shine-effect",
                  "icons"
            ]
      },
      "golf-dashboard-stats": {
            "description": "Stats page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search",
                  "analytics",
                  "roster"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "shine-effect",
                  "GolfStatsDisplay",
                  "icons"
            ]
      },
      "golf": {
            "description": "Golf page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "analytics",
                  "roster"
            ],
            "userJourneys": [
                  "New visitor selecting sport",
                  "Returning user navigating to sport",
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": []
      },
      "baseball-coach-onboarding": {
            "description": "Coach-onboarding page",
            "userRoles": [
                  "coach"
            ],
            "features": [
                  "messages"
            ],
            "userJourneys": [
                  "User viewing coach-onboarding page"
            ],
            "coachTypes": [
                  "All Coaches"
            ],
            "playerTypes": [],
            "keyComponents": []
      },
      "baseball-coach": {
            "description": "Coach page",
            "userRoles": [
                  "coach"
            ],
            "features": [],
            "userJourneys": [
                  "User viewing coach page"
            ],
            "coachTypes": [
                  "All Coaches"
            ],
            "playerTypes": [],
            "keyComponents": []
      },
      "baseball-player": {
            "description": "Player page",
            "userRoles": [
                  "player"
            ],
            "features": [
                  "calendar",
                  "messages",
                  "videos"
            ],
            "userJourneys": [
                  "User viewing player page"
            ],
            "coachTypes": [],
            "playerTypes": [
                  "All Players"
            ],
            "keyComponents": [
                  "button",
                  "input",
                  "select",
                  "loading",
                  "icons"
            ]
      },
      "baseball-program-id": {
            "description": "[id] page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "card",
                  "badge",
                  "button",
                  "avatar",
                  "icons"
            ]
      },
      "baseball-player-id": {
            "description": "[id] page",
            "userRoles": [
                  "player"
            ],
            "features": [
                  "watchlist",
                  "calendar",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "userJourneys": [
                  "Coach managing recruiting watchlist"
            ],
            "coachTypes": [],
            "playerTypes": [
                  "All Players"
            ],
            "keyComponents": [
                  "PlayerCard",
                  "card",
                  "badge",
                  "button",
                  "icons"
            ]
      },
      "baseball-signup": {
            "description": "Signup page",
            "userRoles": [
                  "public"
            ],
            "features": [],
            "userJourneys": [
                  "User logging in or signing up"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": []
      },
      "baseball-complete-signup": {
            "description": "Complete-signup page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "messages"
            ],
            "userJourneys": [
                  "User viewing complete-signup page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "button",
                  "icons"
            ]
      },
      "baseball-forgot-password": {
            "description": "Forgot-password page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "calendar",
                  "messages"
            ],
            "userJourneys": [
                  "User viewing forgot-password page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "button",
                  "input"
            ]
      },
      "baseball-reset-password": {
            "description": "Reset-password page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "calendar",
                  "messages"
            ],
            "userJourneys": [
                  "User viewing reset-password page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "button",
                  "input"
            ]
      },
      "baseball-login": {
            "description": "Login page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search",
                  "calendar",
                  "messages",
                  "url-params"
            ],
            "userJourneys": [
                  "User logging in or signing up",
                  "User searching for content"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "button",
                  "input",
                  "shine-effect"
            ]
      },
      "baseball-dashboard-academics": {
            "description": "Academics page",
            "userRoles": [
                  "coach-team",
                  "juco-coach-team"
            ],
            "features": [
                  "search",
                  "analytics",
                  "roster"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [
                  "JUCO Coach (Team Mode)"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "card",
                  "button",
                  "badge",
                  "avatar"
            ]
      },
      "baseball-dashboard-settings-privacy": {
            "description": "Privacy page",
            "userRoles": [
                  "public"
            ],
            "features": [],
            "userJourneys": [
                  "User viewing privacy page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "PrivacySettingsForm"
            ]
      },
      "baseball-dashboard-settings": {
            "description": "Account and preferences settings",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "calendar",
                  "messages"
            ],
            "userJourneys": [
                  "User viewing account and preferences settings"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "card",
                  "input",
                  "button",
                  "loading"
            ]
      },
      "baseball-dashboard-pipeline": {
            "description": "Drag-and-drop recruiting pipeline management",
            "userRoles": [
                  "coach-recruiting",
                  "college-coach",
                  "juco-coach-recruiting"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "pipeline",
                  "calendar",
                  "drag-drop"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach managing recruiting watchlist",
                  "Coach organizing recruiting pipeline"
            ],
            "coachTypes": [
                  "College Coach",
                  "JUCO Coach (Recruiting Mode)"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "shine-effect",
                  "header",
                  "pipeline-column",
                  "pipeline-card",
                  "empty-state"
            ]
      },
      "baseball-dashboard-messages-id": {
            "description": "[id] page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "calendar",
                  "messages"
            ],
            "userJourneys": [
                  "User viewing [id] page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "avatar",
                  "button",
                  "loading",
                  "icons"
            ]
      },
      "baseball-dashboard-messages": {
            "description": "Send and receive messages",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search",
                  "messages",
                  "url-params"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "loading",
                  "EmptyChatState",
                  "NewMessageModal",
                  "toast"
            ]
      },
      "baseball-dashboard-discover": {
            "description": "Search and filter players with advanced criteria",
            "userRoles": [
                  "coach-recruiting",
                  "college-coach",
                  "juco-coach-recruiting"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "videos",
                  "filtering",
                  "preview",
                  "url-params"
            ],
            "userJourneys": [
                  "User searching for content",
                  "User filtering results with criteria",
                  "Coach managing recruiting watchlist"
            ],
            "coachTypes": [
                  "College Coach",
                  "JUCO Coach (Recruiting Mode)"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "FilterPanel",
                  "DiscoverResults",
                  "PlayerPeekPanel",
                  "header",
                  "loading"
            ]
      },
      "baseball-dashboard-calendar": {
            "description": "View and manage events",
            "userRoles": [
                  "coach-team"
            ],
            "features": [
                  "search",
                  "calendar",
                  "messages",
                  "analytics"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [
                  "High School Coach",
                  "JUCO Coach (Team Mode)",
                  "Showcase Coach"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "card",
                  "button",
                  "badge",
                  "loading"
            ]
      },
      "baseball-dashboard-comparisons": {
            "description": "Comparisons page",
            "userRoles": [
                  "college-coach",
                  "juco-coach-recruiting"
            ],
            "features": [
                  "comparison"
            ],
            "userJourneys": [
                  "User comparing multiple items"
            ],
            "coachTypes": [
                  "College Coach",
                  "JUCO Coach (Recruiting Mode)"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "saved-comparisons-list",
                  "icons"
            ]
      },
      "baseball-dashboard-roster": {
            "description": "View and manage team roster",
            "userRoles": [
                  "coach-team",
                  "hs-coach",
                  "juco-coach-team",
                  "showcase-coach"
            ],
            "features": [
                  "search",
                  "roster"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [
                  "High School Coach",
                  "JUCO Coach (Team Mode)",
                  "Showcase Coach"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "card",
                  "button",
                  "input",
                  "badge"
            ]
      },
      "baseball-dashboard-players-id-profile": {
            "description": "Edit your profile information",
            "userRoles": [
                  "player"
            ],
            "features": [
                  "watchlist",
                  "messages",
                  "analytics"
            ],
            "userJourneys": [
                  "Coach managing recruiting watchlist"
            ],
            "coachTypes": [],
            "playerTypes": [
                  "All Players"
            ],
            "keyComponents": [
                  "PlayerCard",
                  "button",
                  "icons"
            ]
      },
      "baseball-dashboard-players-id": {
            "description": "[id] page",
            "userRoles": [
                  "player"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach managing recruiting watchlist"
            ],
            "coachTypes": [],
            "playerTypes": [
                  "All Players"
            ],
            "keyComponents": [
                  "header",
                  "button",
                  "avatar",
                  "loading",
                  "bento-grid"
            ]
      },
      "baseball-dashboard-colleges": {
            "description": "Discover and research colleges",
            "userRoles": [
                  "player-recruiting"
            ],
            "features": [
                  "search"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [],
            "playerTypes": [
                  "HS Player (Recruiting Active)",
                  "Showcase Player (Recruiting Active)",
                  "JUCO Player (Recruiting Active)"
            ],
            "keyComponents": [
                  "shine-effect",
                  "header",
                  "college-card",
                  "select",
                  "input"
            ]
      },
      "baseball-dashboard-journey": {
            "description": "Track your recruiting journey and milestones",
            "userRoles": [
                  "player-recruiting"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "calendar",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach managing recruiting watchlist"
            ],
            "coachTypes": [],
            "playerTypes": [
                  "HS Player (Recruiting Active)",
                  "Showcase Player (Recruiting Active)",
                  "JUCO Player (Recruiting Active)"
            ],
            "keyComponents": [
                  "header",
                  "card",
                  "badge",
                  "button",
                  "select"
            ]
      },
      "baseball-dashboard-camps": {
            "description": "Browse and register for camps",
            "userRoles": [
                  "college-coach"
            ],
            "features": [
                  "search",
                  "calendar",
                  "messages"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [
                  "College Coach"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "card",
                  "button",
                  "badge",
                  "loading"
            ]
      },
      "baseball-dashboard-videos": {
            "description": "Upload and manage videos",
            "userRoles": [
                  "coach-team",
                  "hs-coach",
                  "juco-coach-team",
                  "showcase-coach"
            ],
            "features": [
                  "search",
                  "messages",
                  "videos",
                  "roster"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [
                  "High School Coach",
                  "JUCO Coach (Team Mode)",
                  "Showcase Coach"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "video-upload",
                  "video-player",
                  "card",
                  "button"
            ]
      },
      "baseball-dashboard-profile": {
            "description": "Edit your profile information",
            "userRoles": [
                  "player"
            ],
            "features": [],
            "userJourneys": [
                  "User viewing edit your profile information"
            ],
            "coachTypes": [],
            "playerTypes": [
                  "All Players"
            ],
            "keyComponents": [
                  "header",
                  "button",
                  "loading",
                  "profile-editor",
                  "icons"
            ]
      },
      "baseball-dashboard-team-high-school": {
            "description": "High-school page",
            "userRoles": [
                  "player"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "calendar",
                  "analytics",
                  "videos",
                  "roster",
                  "devPlans"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach managing recruiting watchlist",
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [],
            "playerTypes": [
                  "All Players"
            ],
            "keyComponents": [
                  "header",
                  "stat-card",
                  "card",
                  "avatar",
                  "badge"
            ]
      },
      "baseball-dashboard-team": {
            "description": "Team hub and information",
            "userRoles": [
                  "coach-team",
                  "player"
            ],
            "features": [
                  "search",
                  "calendar",
                  "analytics",
                  "videos",
                  "roster",
                  "devPlans"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [
                  "High School Coach",
                  "JUCO Coach (Team Mode)",
                  "Showcase Coach"
            ],
            "playerTypes": [
                  "All Players"
            ],
            "keyComponents": [
                  "header",
                  "stat-card",
                  "card",
                  "avatar",
                  "badge"
            ]
      },
      "baseball-dashboard-compare": {
            "description": "Side-by-side player comparison tool",
            "userRoles": [
                  "coach-recruiting",
                  "college-coach",
                  "juco-coach-recruiting"
            ],
            "features": [
                  "search",
                  "comparison",
                  "url-params"
            ],
            "userJourneys": [
                  "User searching for content",
                  "User comparing multiple items"
            ],
            "coachTypes": [
                  "College Coach",
                  "JUCO Coach (Recruiting Mode)"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "card",
                  "button",
                  "input",
                  "avatar"
            ]
      },
      "baseball-dashboard-teams": {
            "description": "Teams page",
            "userRoles": [
                  "showcase-coach"
            ],
            "features": [
                  "calendar",
                  "analytics",
                  "videos",
                  "roster",
                  "devPlans"
            ],
            "userJourneys": [
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [
                  "Showcase Coach"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "loading",
                  "button",
                  "input",
                  "select"
            ]
      },
      "baseball-dashboard-program": {
            "description": "Program profile and settings",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "calendar",
                  "messages",
                  "videos"
            ],
            "userJourneys": [
                  "User viewing program profile and settings"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "card",
                  "button",
                  "input",
                  "loading"
            ]
      },
      "baseball-dashboard-dev-plan": {
            "description": "Create and track development plans",
            "userRoles": [
                  "hs-coach",
                  "juco-coach-team",
                  "showcase-coach"
            ],
            "features": [
                  "devPlans"
            ],
            "userJourneys": [
                  "User viewing create and track development plans"
            ],
            "coachTypes": [
                  "High School Coach",
                  "JUCO Coach (Team Mode)",
                  "Showcase Coach"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "card",
                  "loading",
                  "icons"
            ]
      },
      "baseball-dashboard-activate": {
            "description": "Activate recruiting features",
            "userRoles": [
                  "player"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach managing recruiting watchlist"
            ],
            "coachTypes": [],
            "playerTypes": [
                  "All Players"
            ],
            "keyComponents": [
                  "header",
                  "card",
                  "button",
                  "badge",
                  "loading"
            ]
      },
      "baseball-dashboard-college-interest": {
            "description": "College-interest page",
            "userRoles": [
                  "hs-coach",
                  "juco-coach-team"
            ],
            "features": [
                  "search",
                  "comparison",
                  "watchlist",
                  "calendar",
                  "analytics",
                  "videos",
                  "roster"
            ],
            "userJourneys": [
                  "User searching for content",
                  "User comparing multiple items",
                  "Coach managing recruiting watchlist",
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [
                  "High School Coach",
                  "JUCO Coach (Team Mode)"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "card",
                  "button",
                  "badge",
                  "avatar"
            ]
      },
      "baseball-dashboard-events": {
            "description": "Events page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search",
                  "calendar"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "loading",
                  "button",
                  "input",
                  "select"
            ]
      },
      "baseball-dashboard": {
            "description": "Dashboard page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "pipeline",
                  "calendar",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "userJourneys": [
                  "User viewing dashboard overview",
                  "User accessing main features",
                  "User searching for content",
                  "Coach managing recruiting watchlist",
                  "Coach organizing recruiting pipeline"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "avatar",
                  "badge",
                  "button",
                  "loading"
            ]
      },
      "baseball-dashboard-watchlist": {
            "description": "Manage your recruiting watchlist and pipeline",
            "userRoles": [
                  "coach-recruiting",
                  "college-coach",
                  "juco-coach-recruiting"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "pipeline",
                  "messages",
                  "modals",
                  "preview"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach managing recruiting watchlist",
                  "Coach organizing recruiting pipeline"
            ],
            "coachTypes": [
                  "College Coach",
                  "JUCO Coach (Recruiting Mode)"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "shine-effect",
                  "header",
                  "button",
                  "select",
                  "empty-state"
            ]
      },
      "baseball-dashboard-analytics": {
            "description": "Recruiting analytics and insights",
            "userRoles": [
                  "player-recruiting"
            ],
            "features": [
                  "watchlist",
                  "calendar",
                  "messages",
                  "analytics",
                  "videos"
            ],
            "userJourneys": [
                  "Coach managing recruiting watchlist"
            ],
            "coachTypes": [],
            "playerTypes": [
                  "HS Player (Recruiting Active)",
                  "Showcase Player (Recruiting Active)",
                  "JUCO Player (Recruiting Active)"
            ],
            "keyComponents": [
                  "header",
                  "card",
                  "loading",
                  "icons"
            ]
      },
      "baseball-dashboard-dev-plans": {
            "description": "Create and track development plans",
            "userRoles": [
                  "coach-team",
                  "hs-coach",
                  "juco-coach-team",
                  "showcase-coach"
            ],
            "features": [
                  "search",
                  "analytics",
                  "videos",
                  "devPlans"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [
                  "High School Coach",
                  "JUCO Coach (Team Mode)",
                  "Showcase Coach"
            ],
            "playerTypes": [],
            "keyComponents": [
                  "header",
                  "card",
                  "button",
                  "badge",
                  "avatar"
            ]
      },
      "baseball": {
            "description": "Baseball page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "pipeline",
                  "videos"
            ],
            "userJourneys": [
                  "New visitor selecting sport",
                  "Returning user navigating to sport",
                  "Coach organizing recruiting pipeline"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": []
      },
      "about": {
            "description": "About page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search",
                  "analytics"
            ],
            "userJourneys": [
                  "User searching for content"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": []
      },
      "player-golf": {
            "description": "Player-golf page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "analytics"
            ],
            "userJourneys": [
                  "User viewing player-golf page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "card",
                  "button",
                  "icons"
            ]
      },
      "page.tsx": {
            "description": "Page.tsx page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "analytics"
            ],
            "userJourneys": [
                  "User viewing page.tsx page"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": [
                  "Navigation",
                  "Hero",
                  "ProductShowcases",
                  "Features",
                  "SocialProof"
            ]
      },
      "help": {
            "description": "Help page",
            "userRoles": [
                  "public"
            ],
            "features": [
                  "search",
                  "watchlist",
                  "pipeline",
                  "calendar",
                  "messages",
                  "analytics",
                  "videos",
                  "roster"
            ],
            "userJourneys": [
                  "User searching for content",
                  "Coach managing recruiting watchlist",
                  "Coach organizing recruiting pipeline",
                  "Coach viewing team roster",
                  "Coach adding/removing players"
            ],
            "coachTypes": [],
            "playerTypes": [],
            "keyComponents": []
      }
},
  },

  // Helper methods
  getFlowGraph() {
    return this.flowGraph;
  },

  getRouteContext(routePath) {
    // Find node by path
    const node = this.flowGraph.nodes.find(n => n.path === routePath);
    if (!node) return null;

    // Get routeInfo
    const info = this.flowGraph.routeInfo[node.id];
    if (!info) return null;

    return {
      ...info,
      node,
    };
  },

  getRouteDomain(routePath) {
    const node = this.flowGraph.nodes.find(n => n.path === routePath);
    return node?.domain || null;
  },

  getDomain(domainName) {
    return {
      nodes: this.flowGraph.nodes.filter(n => n.domain === domainName),
      edges: this.flowGraph.edges.filter(e => {
        const fromNode = this.flowGraph.nodes.find(n => n.id === e.from);
        const toNode = this.flowGraph.nodes.find(n => n.id === e.to);
        return fromNode?.domain === domainName || toNode?.domain === domainName;
      }),
    };
  },

  getDesignSystem() {
    return {
      colors: {
        background: '#FAF6F1',
        surface: '#FFFFFF',
        accent: '#16A34A',
        success: '#16A34A',
        error: '#DC2626',
        text: {
          primary: '#0F172A',
          secondary: '#475569',
          muted: '#94A3B8',
        },
      },
      spacing: {
        rules: [
          'Use Tailwind spacing scale (p-1, p-2, p-4, p-6, p-8)',
          'Card padding: p-6 minimum',
          'Section spacing: space-y-8',
          'Component gaps: gap-4',
        ],
      },
      borderRadius: {
        input: 'rounded-lg (12px)',
        button: 'rounded-lg (12px)',
        card: 'rounded-2xl (16px)',
        modal: 'rounded-3xl (24px)',
      },
      glass: {
        when: 'Modals, floating panels, popovers',
        notWhen: 'Main content, cards, forms',
      },
      typography: {
        fontFamily: 'Inter, system-ui, sans-serif',
        sizes: {
          h1: 'text-2xl (24px)',
          h2: 'text-xl (20px)',
          body: 'text-sm (14px)',
          small: 'text-xs (12px)',
        },
      },
      transitions: {
        micro: 'transition-all duration-150',
        normal: 'transition-all duration-300',
        reveal: 'transition-all duration-500',
      },
    };
  },
};

export default HelmKnowledge;
