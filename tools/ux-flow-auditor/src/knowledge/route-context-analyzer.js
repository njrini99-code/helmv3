/**
 * ROUTE CONTEXT ANALYZER
 * 
 * Provides deep context about each route including:
 * - What data it should display
 * - What user actions are expected
 * - What components should be present
 * - What patterns to check for
 * - What anti-patterns to flag
 */

import { HelmProjectKnowledge } from './helm-project-knowledge.js';
import { ComponentPatterns } from './component-patterns.js';

export const RouteContextAnalyzer = {
  
  // Get full context for a route
  getRouteContext(routePath) {
    const normalized = routePath.replace(/\\/g, '/');
    
    // Determine domain
    const domain = normalized.includes('/golf/') ? 'golf' : 'baseball';
    
    // Determine route type
    const routeType = this.getRouteType(normalized);
    
    // Get specific route config
    const routeConfig = this.routeConfigs[normalized] || this.getDefaultConfig(normalized, domain, routeType);
    
    return {
      path: normalized,
      domain,
      routeType,
      ...routeConfig,
      expectedPatterns: this.getExpectedPatterns(routeType, domain),
      antiPatterns: this.getAntiPatterns(routeType),
      accessibilityChecks: this.getA11yChecks(routeType),
    };
  },
  
  // Determine route type from path
  getRouteType(path) {
    if (path.includes('/login') || path.includes('/signup') || path.includes('/forgot-password') || path.includes('/reset-password')) {
      return 'auth';
    }
    if (path.includes('/onboarding') || path === '/baseball/player' || path === '/baseball/coach' || path === '/golf/player' || path === '/golf/coach') {
      return 'onboarding';
    }
    if (path.includes('/dashboard/')) {
      const segment = path.split('/dashboard/')[1]?.split('/')[0];
      return segment || 'dashboard-home';
    }
    if (path === '/baseball/dashboard' || path === '/golf/dashboard') {
      return 'dashboard-home';
    }
    if (path.includes('/player/') || path.includes('/program/')) {
      return 'public-profile';
    }
    if (path === '/baseball' || path === '/golf') {
      return 'landing';
    }
    return 'page';
  },
  
  // Route-specific configurations
  routeConfigs: {
    // ===================== BASEBALL ROUTES =====================
    
    '/baseball/dashboard': {
      title: 'Dashboard Home',
      purpose: 'Coach/Player main dashboard with overview stats and quick actions',
      expectedData: ['user profile', 'recent activity', 'key metrics', 'notifications'],
      expectedComponents: ['MetricCards', 'QuickActions', 'RecentActivity', 'WelcomeMessage'],
      userActions: ['navigate to features', 'view notifications', 'quick add player to watchlist'],
      mustHave: ['greeting with user name', 'role-specific content (coach vs player)', 'loading state'],
    },
    
    '/baseball/dashboard/discover': {
      title: 'Discover Players',
      purpose: 'Search and filter players for recruiting',
      expectedData: ['player list', 'filter options', 'map data'],
      expectedComponents: ['FilterPanel', 'PlayerCardGrid', 'USAMap', 'CompareBar', 'EmptyState'],
      userActions: ['search players', 'apply filters', 'add to watchlist', 'compare players', 'view player details'],
      mustHave: ['search input', 'filter panel', 'player cards', 'pagination or infinite scroll', 'empty state'],
      specificChecks: [
        'Filter panel should use glass-subtle, not glass-standard',
        'Player cards should have hover lift effect',
        'Compare mode should show selection checkboxes',
      ],
    },
    
    '/baseball/dashboard/watchlist': {
      title: 'Watchlist',
      purpose: 'View and manage saved players',
      expectedData: ['watchlist items with player data', 'pipeline stages'],
      expectedComponents: ['PlayerCards', 'FilterTabs', 'EmptyState', 'PipelineStageSelector'],
      userActions: ['filter by stage', 'remove from watchlist', 'change stage', 'add notes', 'view player'],
      mustHave: ['stage filters', 'player list', 'bulk actions', 'empty state'],
    },
    
    '/baseball/dashboard/pipeline': {
      title: 'Recruiting Pipeline',
      purpose: 'Kanban-style view of recruiting stages',
      expectedData: ['players grouped by pipeline_stage'],
      expectedComponents: ['PipelineColumn', 'PlayerCard', 'DragDropContext'],
      userActions: ['drag player between stages', 'view player details', 'add notes'],
      mustHave: ['7 columns for 7 stages', 'drag and drop', 'player counts per stage'],
      stages: ['watchlist', 'high_priority', 'contacted', 'campus_visit', 'offer_extended', 'committed', 'uninterested'],
    },
    
    '/baseball/dashboard/messages': {
      title: 'Messages',
      purpose: 'Direct messaging between coaches and players',
      expectedData: ['conversations', 'messages', 'participants'],
      expectedComponents: ['ConversationList', 'ChatWindow', 'NewMessageModal', 'EmptyChatState'],
      userActions: ['select conversation', 'send message', 'start new conversation'],
      mustHave: ['conversation list sidebar', 'message thread', 'message input', 'unread indicators'],
    },
    
    '/baseball/dashboard/profile': {
      title: 'Player Profile',
      purpose: 'Player profile management',
      expectedData: ['player profile', 'metrics', 'videos', 'achievements'],
      expectedComponents: ['ProfileEditor', 'MetricsSection', 'VideoShowcase', 'AchievementsList'],
      userActions: ['edit profile', 'upload video', 'add metrics', 'toggle recruiting'],
      mustHave: ['profile completion indicator', 'edit forms', 'video upload', 'metrics display'],
    },
    
    '/baseball/dashboard/colleges': {
      title: 'Colleges',
      purpose: 'Browse and research college programs',
      expectedData: ['colleges/organizations', 'division filters'],
      expectedComponents: ['CollegeCard', 'FilterPanel', 'SearchBar'],
      userActions: ['search colleges', 'filter by division', 'view college details'],
      mustHave: ['search', 'filters', 'college grid', 'division badges'],
    },
    
    '/baseball/dashboard/compare': {
      title: 'Player Comparison',
      purpose: 'Side-by-side player comparison',
      expectedData: ['selected players', 'metrics', 'saved comparisons'],
      expectedComponents: ['PlayerComparison', 'StatBar', 'SaveComparisonModal'],
      userActions: ['select players', 'compare stats', 'save comparison'],
      mustHave: ['player selector', 'comparison table', 'stat visualization', 'save functionality'],
    },
    
    '/baseball/dashboard/videos': {
      title: 'Video Management',
      purpose: 'Upload and manage player videos',
      expectedData: ['videos', 'player data'],
      expectedComponents: ['VideoPlayer', 'VideoUpload', 'VideoCard'],
      userActions: ['upload video', 'set primary video', 'delete video', 'play video'],
      mustHave: ['upload area', 'video grid', 'video player', 'primary video indicator'],
    },
    
    '/baseball/dashboard/settings': {
      title: 'Settings',
      purpose: 'Account and preferences settings',
      expectedData: ['user settings', 'notification preferences'],
      expectedComponents: ['SettingsForm', 'NotificationToggles', 'PasswordChange'],
      userActions: ['update settings', 'change password', 'toggle notifications'],
      mustHave: ['form sections', 'save button', 'success feedback'],
    },
    
    // ===================== GOLF ROUTES =====================
    
    '/golf/dashboard': {
      title: 'Golf Dashboard',
      purpose: 'Coach/Player golf team dashboard',
      expectedData: ['team stats', 'recent rounds', 'upcoming events', 'top performers'],
      expectedComponents: ['MetricCard', 'QuickActionCard', 'RoundRow', 'TopPerformers'],
      userActions: ['navigate to features', 'view recent rounds', 'access quick actions'],
      mustHave: ['greeting', 'metrics grid', 'recent rounds', 'quick actions'],
      specificChecks: [
        'Should show different content for coach vs player',
        'Metrics should use glass-standard cards with ShineEffect',
        'Staggered animations on cards',
      ],
    },
    
    '/golf/dashboard/roster': {
      title: 'Team Roster',
      purpose: 'Manage golf team players',
      expectedData: ['golf_players', 'player stats', 'team info'],
      expectedComponents: ['PlayerList', 'InvitePlayerButton', 'PlayerStatusBadge'],
      userActions: ['view players', 'invite player', 'view player stats'],
      mustHave: ['player list', 'invite functionality', 'player status', 'stats preview'],
    },
    
    '/golf/dashboard/rounds': {
      title: 'Rounds',
      purpose: 'View and log golf rounds',
      expectedData: ['golf_rounds', 'course info'],
      expectedComponents: ['RoundList', 'RoundCard', 'NewRoundButton'],
      userActions: ['view rounds', 'log new round', 'view round details'],
      mustHave: ['rounds list', 'new round button', 'score display', 'date sorting'],
    },
    
    '/golf/dashboard/rounds/new': {
      title: 'Log New Round',
      purpose: 'Enter a new golf round with hole-by-hole data',
      expectedData: ['golf_courses', 'course holes'],
      expectedComponents: ['CourseSelector', 'HoleConfigurationForm', 'LiveScorecard'],
      userActions: ['select course', 'enter scores', 'enter stats per hole', 'submit round'],
      mustHave: ['course selection', 'hole-by-hole entry', 'running total', 'save button'],
      complexity: 'HIGH - multi-step form with complex data entry',
    },
    
    '/golf/dashboard/stats': {
      title: 'Statistics',
      purpose: 'View golf performance statistics',
      expectedData: ['golf_player_stats', 'rounds data'],
      expectedComponents: ['GolfStatsDisplay', 'ProgressStats', 'Charts'],
      userActions: ['view stats', 'filter by date range', 'compare stats'],
      mustHave: ['key stats display', 'trend indicators', 'stat breakdown by category'],
      stats: ['scoring_average', 'fairway_percentage', 'gir_percentage', 'putts_per_round', 'scrambling'],
    },
    
    '/golf/dashboard/qualifiers': {
      title: 'Qualifiers',
      purpose: 'Manage team qualifiers',
      expectedData: ['golf_qualifiers', 'qualifier_entries'],
      expectedComponents: ['QualifierList', 'CreateQualifierButton', 'Leaderboard'],
      userActions: ['view qualifiers', 'create qualifier', 'view leaderboard'],
      mustHave: ['qualifier list', 'status indicators', 'create button (coach only)'],
    },
    
    '/golf/dashboard/calendar': {
      title: 'Calendar',
      purpose: 'View team events and schedule',
      expectedData: ['golf_events'],
      expectedComponents: ['CalendarView', 'EventsList', 'CreateEventButton'],
      userActions: ['view events', 'create event (coach)', 'view event details'],
      mustHave: ['calendar or list view', 'event types color coded', 'date navigation'],
    },
    
    '/golf/dashboard/classes': {
      title: 'Class Schedule',
      purpose: 'Manage player class schedules',
      expectedData: ['golf_player_classes'],
      expectedComponents: ['ClassSchedule', 'AddClassModal', 'WeeklyView'],
      userActions: ['view schedule', 'add class', 'edit class'],
      mustHave: ['weekly view', 'time blocks', 'add functionality'],
    },
    
    '/golf/dashboard/messages': {
      title: 'Messages',
      purpose: 'Team messaging',
      expectedData: ['conversations', 'messages'],
      expectedComponents: ['GolfConversationList', 'GolfChatWindow', 'GolfNewMessageModal'],
      userActions: ['select conversation', 'send message', 'start new conversation'],
      mustHave: ['conversation list', 'message thread', 'compose input'],
    },
    
    '/golf/dashboard/announcements': {
      title: 'Announcements',
      purpose: 'Team announcements',
      expectedData: ['golf_announcements'],
      expectedComponents: ['AnnouncementCard', 'CreateAnnouncementButton'],
      userActions: ['view announcements', 'create announcement (coach)', 'acknowledge'],
      mustHave: ['announcement list', 'urgency indicators', 'create button'],
    },
    
    '/golf/dashboard/tasks': {
      title: 'Tasks',
      purpose: 'Player tasks and assignments',
      expectedData: ['golf_tasks', 'task_completions'],
      expectedComponents: ['TasksList', 'TaskCard', 'CreateTaskModal'],
      userActions: ['view tasks', 'complete task', 'create task (coach)'],
      mustHave: ['task list', 'completion status', 'due dates', 'completion button'],
    },
    
    '/golf/dashboard/travel': {
      title: 'Travel',
      purpose: 'Travel itineraries for team events',
      expectedData: ['golf_travel_itineraries'],
      expectedComponents: ['TravelCard', 'TravelDetails'],
      userActions: ['view itineraries', 'create itinerary (coach)'],
      mustHave: ['itinerary list', 'hotel info', 'transportation', 'dates'],
    },
    
    '/golf/dashboard/documents': {
      title: 'Documents',
      purpose: 'Team documents and files',
      expectedData: ['golf_documents'],
      expectedComponents: ['DocumentList', 'UploadButton', 'DocumentCard'],
      userActions: ['view documents', 'download', 'upload (coach)'],
      mustHave: ['document list', 'file type icons', 'upload functionality'],
    },
    
    '/golf/dashboard/settings': {
      title: 'Settings',
      purpose: 'User and team settings',
      expectedData: ['user settings', 'team settings'],
      expectedComponents: ['SettingsSections', 'SettingsModals'],
      userActions: ['update settings', 'change password', 'team settings (coach)'],
      mustHave: ['settings sections', 'save confirmation'],
    },
  },
  
  // Get expected patterns for route type
  getExpectedPatterns(routeType, domain) {
    const patterns = {
      'dashboard-home': [
        'MetricCard with glass-standard',
        'QuickActionCard',
        'Staggered fade-in animations',
        'Greeting with user name',
        'Role-specific content',
      ],
      'discover': [
        'FilterPanel with glass-subtle',
        'PlayerCard grid with hover effects',
        'Search input with debounce',
        'Pagination or infinite scroll',
        'Compare mode with checkboxes',
      ],
      'messages': [
        'Split layout (list + detail)',
        'Real-time updates',
        'Unread indicators',
        'Message input with send button',
      ],
      'settings': [
        'Form sections with labels',
        'Input validation',
        'Save button with loading state',
        'Success/error feedback',
      ],
      'auth': [
        'Centered card layout',
        'Form validation',
        'Loading states',
        'Error messages',
        'Link to alternative auth action',
      ],
      'onboarding': [
        'Step indicator',
        'Progress tracking',
        'Form validation',
        'Back/next buttons',
        'Skip option where appropriate',
      ],
    };
    
    return patterns[routeType] || ['loading state', 'error handling', 'responsive design'];
  },
  
  // Get anti-patterns to check for route type
  getAntiPatterns(routeType) {
    const antiPatterns = {
      'dashboard-home': [
        'Too many metrics (more than 4)',
        'No loading state',
        'Hardcoded user name',
        'Glass effect on every element',
      ],
      'discover': [
        'No empty state',
        'Filters that don\'t update URL',
        'Missing loading skeletons',
        'No debounce on search',
      ],
      'messages': [
        'No empty chat state',
        'Missing real-time updates',
        'No loading indicator for messages',
      ],
      'settings': [
        'No save confirmation',
        'Missing validation',
        'No loading state on save',
      ],
      'auth': [
        'Exposed password in console',
        'No validation feedback',
        'Missing error handling',
      ],
    };
    
    return antiPatterns[routeType] || ['no loading state', 'no error handling', 'hardcoded data'];
  },
  
  // Get accessibility checks for route type
  getA11yChecks(routeType) {
    const checks = {
      'discover': [
        'Filter panel keyboard accessible',
        'Player cards have accessible names',
        'Compare mode announces selection',
      ],
      'messages': [
        'Message input has label',
        'Conversation list has role="list"',
        'Focus management on conversation switch',
      ],
      'auth': [
        'Form has accessible labels',
        'Error messages linked to inputs',
        'Focus on first input on load',
      ],
    };
    
    return checks[routeType] || ['keyboard navigation', 'focus management', 'aria labels'];
  },
  
  // Get default config for unknown routes
  getDefaultConfig(path, domain, routeType) {
    return {
      title: path.split('/').pop() || 'Page',
      purpose: 'Page in ' + domain + ' ' + routeType,
      expectedData: [],
      expectedComponents: [],
      userActions: [],
      mustHave: ['loading state', 'error handling'],
    };
  },
};

// Export helper functions
export function getRouteContext(path) {
  return RouteContextAnalyzer.getRouteContext(path);
}

export function getExpectedComponents(path) {
  const context = RouteContextAnalyzer.getRouteContext(path);
  return context.expectedComponents || [];
}

export function getRouteChecks(path) {
  const context = RouteContextAnalyzer.getRouteContext(path);
  return {
    mustHave: context.mustHave || [],
    antiPatterns: context.antiPatterns || [],
    a11y: context.accessibilityChecks || [],
    specific: context.specificChecks || [],
  };
}

export default RouteContextAnalyzer;
