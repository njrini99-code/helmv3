/**
 * FeatureKnowledge - COMPREHENSIVE Feature Intelligence System
 * 
 * This is the BRAIN that makes agents as smart as a senior PM + engineer.
 * 
 * For each feature type, it knows:
 * - How to DETECT it (routes, components, data patterns)
 * - What CAPABILITIES it should have (core → expected → advanced)
 * - WHY each capability matters (user pain points)
 * - WHO needs it (personas and workflows)
 * - WHAT competitors do (industry standards)
 * - HOW to implement it (code patterns, libraries)
 * - WHAT to measure (success metrics)
 * 
 * USAGE:
 * 1. Agent detects feature type from code
 * 2. Gets expected capabilities
 * 3. Scans code for capability signals
 * 4. Gap analysis: expected - found = suggestions
 * 5. Prioritizes by user impact and effort
 */

export const FeatureKnowledge = {
  // ==========================================
  // META: Feature Categories
  // ==========================================
  categories: {
    core: 'Essential platform features',
    engagement: 'User engagement and retention',
    operations: 'Day-to-day team operations',
    analytics: 'Data and insights',
    communication: 'Team communication',
    monetization: 'Revenue and payments',
  },

  // ==========================================
  // FEATURE DEFINITIONS
  // ==========================================
  features: {

    // ==========================================
    // 📅 CALENDAR / SCHEDULE
    // ==========================================
    calendar: {
      name: 'Calendar / Schedule',
      category: 'operations',
      description: 'Event scheduling, team calendar, and time management',
      competitors: ['Google Calendar', 'Calendly', 'TeamSnap', 'SportsEngine'],
      
      indicators: {
        routes: ['calendar', 'schedule', 'events', 'agenda'],
        components: ['CalendarView', 'EventModal', 'DatePicker', 'ScheduleGrid', 'WeekView', 'MonthView'],
        imports: ['date-fns', 'dayjs', 'moment', 'FullCalendar', 'react-big-calendar', '@fullcalendar'],
        dataPatterns: ['start_time', 'end_time', 'event_type', 'start_date', 'end_date', 'recurrence'],
        hooks: ['useEvents', 'useCalendar', 'useSchedule'],
      },

      capabilities: {
        core: [
          {
            id: 'event-crud',
            name: 'Event CRUD',
            description: 'Create, read, update, delete events',
            codeSignals: ['createEvent', 'updateEvent', 'deleteEvent', 'insert', 'update', 'delete', 'onSubmit'],
            priority: 'critical',
            effort: 'low',
          },
          {
            id: 'calendar-views',
            name: 'Multiple Calendar Views',
            description: 'Month, week, day, and list views',
            codeSignals: ['month', 'week', 'day', 'list', 'view', 'setView', 'viewMode'],
            priority: 'critical',
            effort: 'medium',
          },
          {
            id: 'event-types',
            name: 'Event Type Categorization',
            description: 'Different event types with colors (practice, game, meeting)',
            codeSignals: ['event_type', 'eventType', 'category', 'type', 'getEventColor'],
            priority: 'high',
            effort: 'low',
          },
          {
            id: 'date-navigation',
            name: 'Date Navigation',
            description: 'Navigate between months/weeks, go to today',
            codeSignals: ['nextMonth', 'prevMonth', 'goToToday', 'setCurrentDate', 'navigate'],
            priority: 'critical',
            effort: 'low',
          },
        ],
        expected: [
          {
            id: 'recurring-events',
            name: 'Recurring Events',
            description: 'Create events that repeat daily/weekly/monthly/yearly',
            codeSignals: ['recurrence', 'recurring', 'repeat', 'rrule', 'frequency', 'interval', 'repeatType'],
            priority: 'high',
            effort: 'medium',
            why: 'Coaches create the same practice every Tuesday/Thursday. Without this, they manually create 50+ individual events per season.',
            result: 'Create one event, automatically generates all occurrences. Edit series or single occurrence.',
            industryExample: 'Google Calendar, Outlook, TeamSnap',
            implementation: {
              approach: 'Store recurrence rule (RRULE) on event, expand on read',
              libraries: ['rrule', 'date-fns'],
              schema: 'Add recurrence_rule, recurrence_end_date, parent_event_id columns',
              uiComponents: ['RecurrenceSelector', 'EditSeriesModal'],
            },
            metrics: ['% of events that are recurring', 'time saved per event creation'],
          },
          {
            id: 'drag-drop-reschedule',
            name: 'Drag-and-Drop Rescheduling',
            description: 'Drag events to new dates/times to reschedule',
            codeSignals: ['onDrag', 'onDrop', 'draggable', 'react-dnd', 'useDrag', 'useDrop', 'onEventDrop', 'handleDrop'],
            priority: 'high',
            effort: 'medium',
            why: 'Current flow: click event → open modal → change date → save → close. With drag-drop: just drag.',
            result: 'Reschedule events in 2 seconds instead of 15 seconds.',
            industryExample: 'Google Calendar, Calendly, FullCalendar',
            implementation: {
              approach: 'Use react-dnd or built-in calendar drag, update on drop',
              libraries: ['react-dnd', '@fullcalendar/interaction'],
              uiComponents: ['DraggableEvent', 'DroppableDay'],
            },
            metrics: ['avg time to reschedule', 'reschedule frequency'],
          },
          {
            id: 'event-notifications',
            name: 'Event Notifications & Reminders',
            description: 'Push/email/SMS notifications before events',
            codeSignals: ['notification', 'reminder', 'alert', 'notify', 'push', 'sendReminder', 'reminderTime'],
            priority: 'high',
            effort: 'medium',
            why: 'Players miss practices and games because they forget. Coaches waste time texting reminders manually.',
            result: 'Automatic reminders 24h, 2h, 30min before events. Coaches never chase players.',
            industryExample: 'Every calendar app ever',
            implementation: {
              approach: 'Background job checks upcoming events, sends via preferred channel',
              libraries: ['node-cron', 'bull', 'Supabase Edge Functions'],
              services: ['SendGrid', 'Twilio', 'Firebase Cloud Messaging'],
              schema: 'Add reminder_settings JSONB, notification_preferences table',
            },
            metrics: ['attendance rate before/after', 'notification open rate'],
          },
          {
            id: 'attendance-tracking',
            name: 'Attendance Tracking',
            description: 'Track who attended each event (RSVP, present/absent)',
            codeSignals: ['attendance', 'rsvp', 'attendee', 'present', 'absent', 'checkIn', 'markAttendance'],
            priority: 'high',
            effort: 'medium',
            why: 'Coaches track attendance on paper or spreadsheets. No visibility into patterns.',
            result: 'Mark attendance in-app, see attendance stats per player, identify chronic absences.',
            industryExample: 'TeamSnap, SportsEngine, Band',
            implementation: {
              approach: 'Junction table event_attendance with status enum',
              schema: 'event_attendance(event_id, player_id, status, checked_in_at, notes)',
              uiComponents: ['AttendanceList', 'RSVPButtons', 'AttendanceStats'],
            },
            metrics: ['team attendance rate', 'RSVP response rate'],
          },
          {
            id: 'calendar-sync',
            name: 'Calendar Sync (iCal/Google)',
            description: 'Export/subscribe to external calendars',
            codeSignals: ['ical', 'ics', 'google calendar', 'caldav', 'subscribe', 'webcal', 'export'],
            priority: 'medium',
            effort: 'low',
            why: 'Users want team events in their personal calendar app without manual entry.',
            result: 'One-click subscribe URL that syncs to Google/Apple/Outlook Calendar.',
            industryExample: 'Calendly, TeamSnap, every SaaS with events',
            implementation: {
              approach: 'Generate iCal feed endpoint, user subscribes via URL',
              libraries: ['ical-generator', 'ics'],
              endpoint: 'GET /api/calendar/[teamId]/feed.ics',
            },
            metrics: ['% users who subscribe', 'sync errors'],
          },
          {
            id: 'conflict-detection',
            name: 'Scheduling Conflict Detection',
            description: 'Warn when creating overlapping events',
            codeSignals: ['conflict', 'overlap', 'double-book', 'collision', 'checkConflict', 'isOverlapping'],
            priority: 'medium',
            effort: 'low',
            why: 'Nothing prevents scheduling two events at the same time. Coaches discover conflicts too late.',
            result: 'Warning appears when creating conflicting events, option to proceed or adjust.',
            industryExample: 'Google Calendar, Calendly',
            implementation: {
              approach: 'Query for overlapping events before insert, show warning modal',
              query: 'WHERE start_time < $end AND end_time > $start',
            },
            metrics: ['conflicts prevented', 'conflicts ignored'],
          },
          {
            id: 'event-location',
            name: 'Event Location with Map',
            description: 'Location field with map preview and directions',
            codeSignals: ['location', 'venue', 'address', 'map', 'directions', 'MapView', 'google-maps'],
            priority: 'medium',
            effort: 'low',
            why: 'Away games have unfamiliar locations. Players need directions.',
            result: 'See map preview on event, one-click directions to venue.',
            industryExample: 'Google Calendar, Eventbrite',
            implementation: {
              libraries: ['@react-google-maps/api', 'mapbox-gl'],
              uiComponents: ['LocationPicker', 'MapPreview', 'DirectionsLink'],
            },
          },
        ],
        advanced: [
          {
            id: 'weather-integration',
            name: 'Weather Integration',
            description: 'Show weather forecast for outdoor events',
            codeSignals: ['weather', 'forecast', 'rain', 'temperature', 'openweathermap'],
            priority: 'low',
            effort: 'low',
            why: 'Outdoor practices/games affected by weather. Helps plan ahead.',
            result: 'See 5-day forecast on event, rain alerts for game days.',
            implementation: {
              services: ['OpenWeatherMap API', 'Weather.gov'],
              trigger: 'Fetch forecast for events with outdoor venues',
            },
          },
          {
            id: 'bulk-event-creation',
            name: 'Bulk Event Creation / Season Schedule',
            description: 'Create entire season schedule at once',
            codeSignals: ['bulk', 'import', 'csv', 'batch', 'season', 'schedule wizard'],
            priority: 'medium',
            effort: 'medium',
            why: 'Coaches receive season schedule as spreadsheet, must enter each event manually.',
            result: 'Import CSV or use wizard to generate full season in minutes.',
            implementation: {
              uiComponents: ['CSVImporter', 'SeasonWizard', 'BulkEventPreview'],
              libraries: ['papaparse', 'xlsx'],
            },
          },
          {
            id: 'event-templates',
            name: 'Event Templates',
            description: 'Save and reuse common event configurations',
            codeSignals: ['template', 'preset', 'quick-add', 'saveAsTemplate'],
            priority: 'low',
            effort: 'low',
            why: 'Standard Practice is always 2 hours at home field. Reduce repetitive entry.',
            result: 'One-click create from template, customize as needed.',
          },
          {
            id: 'availability-polling',
            name: 'Availability Polling',
            description: 'Poll team for available times before scheduling',
            codeSignals: ['availability', 'poll', 'when2meet', 'doodle', 'timeSlot'],
            priority: 'low',
            effort: 'high',
            why: 'Hard to find times that work for everyone.',
            result: 'Send poll, see overlap, schedule at best time.',
            industryExample: 'When2Meet, Doodle, Calendly',
          },
        ],
      },

      // Real user scenarios that drive requirements
      userWorkflows: [
        {
          persona: 'Head Coach',
          task: 'Schedule weekly practices for the season',
          frequency: 'Once per season',
          currentPain: 'Create 20+ individual events manually, each taking 2 minutes',
          idealFlow: 'Create one recurring event or import season schedule CSV',
          requiredCapabilities: ['recurring-events', 'bulk-event-creation'],
          timeImpact: 'Save 40+ minutes per season',
        },
        {
          persona: 'Head Coach',
          task: 'Reschedule rained-out practice',
          frequency: 'Few times per season',
          currentPain: 'Open event → edit → change date → save → notify team separately',
          idealFlow: 'Drag event to new day, auto-notify team',
          requiredCapabilities: ['drag-drop-reschedule', 'event-notifications'],
          timeImpact: 'Save 10 minutes per reschedule',
        },
        {
          persona: 'Player',
          task: 'Know when and where practice is',
          frequency: 'Daily',
          currentPain: 'Must open app and check calendar manually',
          idealFlow: 'Get reminder notification with location and directions',
          requiredCapabilities: ['event-notifications', 'calendar-sync', 'event-location'],
          timeImpact: 'Never miss practice',
        },
        {
          persona: 'Head Coach',
          task: 'Track who came to practice',
          frequency: 'Every practice',
          currentPain: 'Mental notes or paper roster, no historical data',
          idealFlow: 'Pull up attendance list, tap present/absent, see trends over time',
          requiredCapabilities: ['attendance-tracking'],
          timeImpact: 'Identify commitment issues early',
        },
        {
          persona: 'Parent',
          task: 'See all games in my personal calendar',
          frequency: 'Once to set up, always available',
          currentPain: 'Manually add each event to phone calendar',
          idealFlow: 'One-click subscribe, all events sync automatically',
          requiredCapabilities: ['calendar-sync'],
          timeImpact: 'Save 30 minutes per season',
        },
      ],

      // Success metrics to measure after implementing
      successMetrics: [
        { metric: 'Event creation time', baseline: '2 min/event', target: '30 sec/event' },
        { metric: 'Team attendance rate', baseline: '75%', target: '90%' },
        { metric: 'Calendar sync adoption', baseline: '0%', target: '50%' },
        { metric: 'Missed events due to no reminder', baseline: 'Unknown', target: '<5%' },
      ],
    },

    // ==========================================
    // 👥 ROSTER / TEAM MANAGEMENT
    // ==========================================
    roster: {
      name: 'Roster / Team Management',
      category: 'operations',
      description: 'Player list, team composition, and player management',
      competitors: ['TeamSnap', 'SportsEngine', 'LeagueApps', 'GameChanger'],
      
      indicators: {
        routes: ['roster', 'team', 'players', 'members', 'squad'],
        components: ['PlayerCard', 'RosterTable', 'PlayerList', 'TeamRoster', 'PlayerRow'],
        dataPatterns: ['player_id', 'jersey_number', 'position', 'roster', 'team_id', 'player'],
        hooks: ['usePlayers', 'useRoster', 'useTeam', 'useTeamMembers'],
      },

      capabilities: {
        core: [
          {
            id: 'player-list',
            name: 'Player List Display',
            codeSignals: ['PlayerCard', 'PlayerRow', 'roster', 'players.map', 'PlayerList'],
            priority: 'critical',
          },
          {
            id: 'player-crud',
            name: 'Add/Edit/Remove Players',
            codeSignals: ['addPlayer', 'removePlayer', 'editPlayer', 'createPlayer', 'deletePlayer'],
            priority: 'critical',
          },
          {
            id: 'player-detail',
            name: 'Player Detail View',
            codeSignals: ['PlayerProfile', 'PlayerDetail', '/player/', '[playerId]'],
            priority: 'high',
          },
        ],
        expected: [
          {
            id: 'bulk-import',
            name: 'Bulk Player Import',
            description: 'Import roster from CSV/Excel',
            codeSignals: ['import', 'csv', 'xlsx', 'upload', 'bulk', 'importRoster', 'parseCSV'],
            priority: 'high',
            effort: 'medium',
            why: 'Coaches have existing rosters in spreadsheets. Manual entry of 15+ players is tedious.',
            result: 'Upload spreadsheet, map columns, import entire team in 2 minutes.',
            implementation: {
              libraries: ['papaparse', 'xlsx', 'react-dropzone'],
              uiComponents: ['CSVUploader', 'ColumnMapper', 'ImportPreview'],
            },
          },
          {
            id: 'position-filtering',
            name: 'Filter/Sort by Position',
            description: 'View players by position (pitchers, infielders, etc.)',
            codeSignals: ['filter', 'position', 'filterBy', 'sortBy', 'groupBy'],
            priority: 'medium',
            effort: 'low',
            why: 'Coaches work with position groups - need to see all pitchers together.',
            result: 'One-click filter to see position groups, sort by any attribute.',
          },
          {
            id: 'jersey-management',
            name: 'Jersey Number Management',
            description: 'Assign numbers, prevent duplicates, see available numbers',
            codeSignals: ['jersey', 'number', 'duplicate', 'jerseyNumber', 'availableNumbers'],
            priority: 'medium',
            effort: 'low',
            why: 'Two players cannot have the same number. Currently no validation.',
            result: 'See available numbers, warning on duplicate, easy reassignment.',
          },
          {
            id: 'contact-info',
            name: 'Player & Parent Contact Info',
            description: 'Store phone, email, emergency contacts',
            codeSignals: ['phone', 'email', 'contact', 'parent', 'guardian', 'emergency'],
            priority: 'high',
            effort: 'low',
            why: 'Youth sports require parent contacts. Emergency info is critical.',
            result: 'Quick access to player and parent contacts, emergency info visible.',
          },
          {
            id: 'player-photo',
            name: 'Player Photos',
            description: 'Upload and display player headshots',
            codeSignals: ['photo', 'avatar', 'image', 'headshot', 'uploadPhoto'],
            priority: 'medium',
            effort: 'low',
            why: 'Coaches learning new team need faces with names.',
            result: 'Visual roster with photos, easier player recognition.',
          },
          {
            id: 'player-notes',
            name: 'Private Coach Notes',
            description: 'Add notes visible only to coaching staff',
            codeSignals: ['notes', 'private', 'coach_notes', 'internalNotes'],
            priority: 'medium',
            effort: 'low',
            why: 'Track player-specific info (injury history, behavioral notes).',
            result: 'Confidential notes attached to player, searchable.',
          },
          {
            id: 'roster-export',
            name: 'Roster Export',
            description: 'Export to PDF/Excel for printing',
            codeSignals: ['export', 'pdf', 'print', 'download', 'generatePDF'],
            priority: 'medium',
            effort: 'low',
            why: 'Coaches need physical copies for games, tournaments.',
            result: 'One-click export formatted roster ready for printing.',
            implementation: {
              libraries: ['jspdf', 'xlsx', 'react-pdf'],
            },
          },
          {
            id: 'player-status',
            name: 'Player Status Tracking',
            description: 'Active, injured, inactive, suspended status',
            codeSignals: ['status', 'active', 'injured', 'inactive', 'suspended', 'playerStatus'],
            priority: 'medium',
            effort: 'low',
            why: 'Need to know who is available for games.',
            result: 'Visual indicators for player availability.',
          },
        ],
        advanced: [
          {
            id: 'eligibility-tracking',
            name: 'Eligibility Tracking',
            description: 'Track academic eligibility, waivers, age verification',
            codeSignals: ['eligibility', 'eligible', 'waiver', 'academic', 'age', 'birthdate'],
            priority: 'medium',
            effort: 'medium',
            why: 'College/high school sports have eligibility requirements.',
            result: 'Dashboard showing eligibility status, alerts before expiration.',
          },
          {
            id: 'lineup-builder',
            name: 'Lineup Builder',
            description: 'Drag players into batting order / starting lineup',
            codeSignals: ['lineup', 'batting_order', 'starting', 'benchOrder', 'fieldPositions'],
            priority: 'high',
            effort: 'high',
            why: 'Coaches build lineups for every game, currently on paper.',
            result: 'Visual lineup builder with drag-drop, save/share lineups.',
            implementation: {
              libraries: ['react-dnd', '@dnd-kit/core'],
              uiComponents: ['LineupBuilder', 'FieldPositions', 'BattingOrder'],
            },
          },
          {
            id: 'player-comparison',
            name: 'Player Comparison',
            description: 'Compare stats side-by-side',
            codeSignals: ['compare', 'comparison', 'versus', 'sideBySide'],
            priority: 'low',
            effort: 'medium',
            why: 'Making roster decisions requires comparing players.',
            result: 'Select multiple players, see stats comparison table.',
          },
          {
            id: 'uniform-tracking',
            name: 'Uniform/Equipment Tracking',
            description: 'Track who has what equipment',
            codeSignals: ['uniform', 'equipment', 'gear', 'issued', 'returned'],
            priority: 'low',
            effort: 'medium',
            why: 'Teams issue uniforms and equipment, need accountability.',
            result: 'Know who has what, track returns at end of season.',
          },
          {
            id: 'player-documents',
            name: 'Document Storage',
            description: 'Store waivers, medical forms, birth certificates',
            codeSignals: ['document', 'waiver', 'form', 'upload', 'file', 'attachment'],
            priority: 'medium',
            effort: 'medium',
            why: 'Teams collect many documents per player.',
            result: 'All player documents in one place, expiration reminders.',
          },
        ],
      },

      userWorkflows: [
        {
          persona: 'Head Coach',
          task: 'Add new team roster at start of season',
          frequency: 'Once per season',
          currentPain: 'Enter 15-25 players manually, one by one',
          idealFlow: 'Upload existing spreadsheet, map columns, import all',
          requiredCapabilities: ['bulk-import'],
          timeImpact: 'Save 30+ minutes',
        },
        {
          persona: 'Head Coach',
          task: 'Build starting lineup for game',
          frequency: 'Every game (30+ per season)',
          currentPain: 'Write on whiteboard or paper, no digital record',
          idealFlow: 'Drag players to positions, save lineup, share with team',
          requiredCapabilities: ['lineup-builder'],
          timeImpact: 'Save 5 min/game, have historical lineup data',
        },
        {
          persona: 'Assistant Coach',
          task: 'Contact a player\'s parent about pickup change',
          frequency: 'Weekly',
          currentPain: 'Search phone for contact, may not have it',
          idealFlow: 'Tap player → see parent contact → call/text',
          requiredCapabilities: ['contact-info'],
          timeImpact: 'Immediate access vs. 5 min search',
        },
        {
          persona: 'Team Admin',
          task: 'Print roster for tournament registration',
          frequency: 'Few times per season',
          currentPain: 'Manually type into tournament system',
          idealFlow: 'Export formatted PDF with all required info',
          requiredCapabilities: ['roster-export'],
          timeImpact: 'Save 20 minutes per tournament',
        },
      ],
    },

    // ==========================================
    // 💬 MESSAGING / COMMUNICATION
    // ==========================================
    messaging: {
      name: 'Messaging / Communication',
      category: 'communication',
      description: 'Direct messaging, team chat, and announcements',
      competitors: ['Slack', 'Discord', 'TeamSnap', 'Band', 'WhatsApp Groups'],
      
      indicators: {
        routes: ['messages', 'inbox', 'chat', 'conversations', 'communicate'],
        components: ['MessageThread', 'ConversationList', 'ChatInput', 'MessageBubble', 'Inbox'],
        dataPatterns: ['message', 'thread', 'sender', 'recipient', 'conversation', 'chat'],
        hooks: ['useMessages', 'useConversation', 'useChat'],
      },

      capabilities: {
        core: [
          {
            id: 'send-receive',
            name: 'Send and Receive Messages',
            codeSignals: ['sendMessage', 'messages', 'insert', 'from_user', 'to_user'],
            priority: 'critical',
          },
          {
            id: 'conversation-list',
            name: 'Conversation List',
            codeSignals: ['conversations', 'threads', 'inbox', 'ConversationList'],
            priority: 'critical',
          },
          {
            id: 'message-input',
            name: 'Message Composition',
            codeSignals: ['ChatInput', 'MessageInput', 'textarea', 'sendButton'],
            priority: 'critical',
          },
        ],
        expected: [
          {
            id: 'real-time',
            name: 'Real-time Updates',
            description: 'Messages appear instantly without refresh',
            codeSignals: ['realtime', 'subscribe', 'websocket', 'onInsert', 'socket', 'pusher'],
            priority: 'high',
            effort: 'medium',
            why: 'Modern messaging is instant. Requiring refresh feels broken.',
            result: 'Messages appear within 500ms of sending.',
            implementation: {
              approach: 'Supabase Realtime subscription on messages table',
              libraries: ['@supabase/realtime-js', 'pusher', 'socket.io'],
            },
          },
          {
            id: 'read-receipts',
            name: 'Read Receipts',
            description: 'Know when messages are read',
            codeSignals: ['read_at', 'seen', 'read_receipt', 'is_read', 'readAt', 'markAsRead'],
            priority: 'high',
            effort: 'low',
            why: 'Coaches need to know if players saw important messages.',
            result: 'See checkmarks/timestamp when message was read.',
            implementation: {
              schema: 'Add read_at timestamp column to messages',
              trigger: 'Update read_at when message enters viewport',
            },
          },
          {
            id: 'unread-count',
            name: 'Unread Message Badge',
            description: 'Badge showing unread message count',
            codeSignals: ['unread', 'badge', 'count', 'is_read: false', 'unreadCount'],
            priority: 'high',
            effort: 'low',
            why: 'Users need to know they have unread messages at a glance.',
            result: 'Badge on nav item, per-conversation unread counts.',
          },
          {
            id: 'team-broadcast',
            name: 'Team Broadcast / Announcements',
            description: 'Send message to entire team at once',
            codeSignals: ['broadcast', 'team_message', 'bulk_send', 'announcement', 'allPlayers'],
            priority: 'high',
            effort: 'medium',
            why: 'Coaches often need to reach the whole team (schedule change, reminder).',
            result: 'One message reaches everyone, see who has read it.',
            implementation: {
              approach: 'Message type "broadcast", create recipient row for each team member',
            },
          },
          {
            id: 'file-attachments',
            name: 'File Attachments',
            description: 'Send images, documents, videos',
            codeSignals: ['attachment', 'upload', 'file', 'media', 'FileUpload', 'attachFile'],
            priority: 'medium',
            effort: 'medium',
            why: 'Share practice plans, game film, permission slips.',
            result: 'Drag-drop or click to attach files, preview in chat.',
            implementation: {
              libraries: ['react-dropzone', 'Supabase Storage'],
              fileTypes: ['image/*', 'video/*', 'application/pdf'],
            },
          },
          {
            id: 'typing-indicator',
            name: 'Typing Indicator',
            description: 'Show when other person is typing',
            codeSignals: ['typing', 'isTyping', 'typingIndicator', 'presence'],
            priority: 'low',
            effort: 'low',
            why: 'Standard messaging UX expectation.',
            result: '"Coach is typing..." indicator.',
            implementation: {
              approach: 'Presence channel with typing state, debounce 2 seconds',
            },
          },
          {
            id: 'message-search',
            name: 'Message Search',
            description: 'Search through message history',
            codeSignals: ['search', 'searchMessages', 'query', 'findMessages'],
            priority: 'medium',
            effort: 'medium',
            why: 'Find that address the coach sent last month.',
            result: 'Full-text search across all conversations.',
          },
        ],
        advanced: [
          {
            id: 'message-templates',
            name: 'Message Templates / Quick Replies',
            description: 'Pre-written messages for common scenarios',
            codeSignals: ['template', 'quick_reply', 'canned', 'savedReplies'],
            priority: 'low',
            effort: 'low',
            why: 'Coaches send similar messages often (game reminder, practice cancelled).',
            result: 'One-click insert common messages.',
          },
          {
            id: 'scheduled-messages',
            name: 'Scheduled Messages',
            description: 'Write now, send later',
            codeSignals: ['scheduled', 'send_at', 'delay', 'scheduledAt'],
            priority: 'low',
            effort: 'medium',
            why: 'Write game-day reminder on Monday, send Saturday morning.',
            result: 'Schedule send time, edit before it goes out.',
          },
          {
            id: 'group-chat',
            name: 'Group Chat Channels',
            description: 'Topic-based group conversations',
            codeSignals: ['group', 'channel', 'room', 'groupChat'],
            priority: 'medium',
            effort: 'high',
            why: 'Separate channels for varsity, JV, parents, coaches.',
            result: 'Create channels, control membership, organized discussions.',
          },
          {
            id: 'push-notifications',
            name: 'Push Notifications',
            description: 'Mobile push for new messages',
            codeSignals: ['push', 'FCM', 'firebase', 'pushNotification', 'serviceWorker'],
            priority: 'high',
            effort: 'high',
            why: 'Users need to know about messages without opening app.',
            result: 'Phone buzz when new message arrives.',
            implementation: {
              services: ['Firebase Cloud Messaging', 'OneSignal'],
              requirements: ['Service worker', 'Push permission'],
            },
          },
          {
            id: 'message-reactions',
            name: 'Message Reactions',
            description: 'React to messages with emoji',
            codeSignals: ['reaction', 'emoji', 'react', 'like'],
            priority: 'low',
            effort: 'low',
            why: 'Quick acknowledgment without cluttering chat.',
            result: 'Thumbs up, check mark, etc. on messages.',
          },
        ],
      },

      userWorkflows: [
        {
          persona: 'Head Coach',
          task: 'Notify team about schedule change',
          frequency: 'Few times per month',
          currentPain: 'Send individual messages or use WhatsApp group (not in app)',
          idealFlow: 'One-click broadcast to team, see who has read',
          requiredCapabilities: ['team-broadcast', 'read-receipts'],
        },
        {
          persona: 'Player',
          task: 'Ask coach about schedule conflict',
          frequency: 'Occasionally',
          currentPain: 'Find coach email, send formal email, wait for response',
          idealFlow: 'Quick chat message, get response in-app',
          requiredCapabilities: ['send-receive', 'real-time', 'push-notifications'],
        },
        {
          persona: 'Coach',
          task: 'Share practice plan document',
          frequency: 'Weekly',
          currentPain: 'Email separately, not in context of conversation',
          idealFlow: 'Drop file into message, everyone can access',
          requiredCapabilities: ['file-attachments'],
        },
      ],
    },

    // ==========================================
    // 🔍 DISCOVER / SEARCH
    // ==========================================
    discover: {
      name: 'Discover / Search',
      category: 'engagement',
      description: 'Search, filter, and discover items (coaches, programs, etc.)',
      competitors: ['Zillow', 'LinkedIn', 'Indeed', 'Airbnb'],
      
      indicators: {
        routes: ['discover', 'search', 'browse', 'find', 'explore', 'directory'],
        components: ['SearchBar', 'FilterPanel', 'SearchResults', 'ResultCard', 'FilterChip'],
        dataPatterns: ['query', 'search', 'filter', 'results', 'matches'],
        hooks: ['useSearch', 'useFilter', 'useDiscover'],
      },

      capabilities: {
        core: [
          {
            id: 'search-input',
            name: 'Search Input',
            codeSignals: ['search', 'query', 'SearchBar', 'input', 'searchTerm'],
            priority: 'critical',
          },
          {
            id: 'results-display',
            name: 'Results Display',
            codeSignals: ['results', 'matches', 'Grid', 'List', 'ResultCard'],
            priority: 'critical',
          },
        ],
        expected: [
          {
            id: 'advanced-filters',
            name: 'Advanced Filters',
            description: 'Filter by multiple criteria (location, division, etc.)',
            codeSignals: ['filter', 'FilterPanel', 'criteria', 'facet', 'filterBy'],
            priority: 'high',
            effort: 'medium',
            why: 'Users need to narrow down from hundreds of results.',
            result: 'Multi-select filters, clear all, see active filter count.',
          },
          {
            id: 'saved-searches',
            name: 'Saved Searches',
            description: 'Save filter combinations for reuse',
            codeSignals: ['saved_search', 'save_filter', 'preset', 'saveSearch'],
            priority: 'medium',
            effort: 'low',
            why: 'Users repeat the same search criteria often.',
            result: 'One-click load saved search parameters.',
          },
          {
            id: 'map-view',
            name: 'Map View',
            description: 'See results on a geographic map',
            codeSignals: ['map', 'MapView', 'location', 'geo', 'mapbox', 'google-maps', 'marker'],
            priority: 'high',
            effort: 'medium',
            why: 'Location is critical for recruiting - see geographic distribution.',
            result: 'Toggle between list and map, click pins for details.',
            implementation: {
              libraries: ['@react-google-maps/api', 'mapbox-gl', 'react-map-gl'],
            },
          },
          {
            id: 'favorites',
            name: 'Favorites / Shortlist',
            description: 'Save items for later comparison',
            codeSignals: ['favorite', 'save', 'bookmark', 'shortlist', 'wishlist', 'saved'],
            priority: 'high',
            effort: 'low',
            why: 'Users want to track interesting items without committing.',
            result: 'Heart/star to save, view all favorites, compare shortlist.',
          },
          {
            id: 'comparison-mode',
            name: 'Side-by-Side Comparison',
            description: 'Compare multiple items in detail',
            codeSignals: ['compare', 'comparison', 'side-by-side', 'versus', 'CompareTable'],
            priority: 'medium',
            effort: 'medium',
            why: 'Decision-making requires comparing options.',
            result: 'Select items, see attributes side by side.',
          },
          {
            id: 'sort-options',
            name: 'Multiple Sort Options',
            description: 'Sort by different attributes',
            codeSignals: ['sort', 'sortBy', 'orderBy', 'SortDropdown'],
            priority: 'medium',
            effort: 'low',
            why: 'Different users prioritize different attributes.',
            result: 'Sort by distance, rating, name, etc.',
          },
          {
            id: 'pagination',
            name: 'Pagination / Infinite Scroll',
            description: 'Handle large result sets efficiently',
            codeSignals: ['pagination', 'page', 'limit', 'offset', 'infinite', 'loadMore'],
            priority: 'high',
            effort: 'low',
            why: 'Can\'t load 1000 results at once.',
            result: 'Smooth browsing through many results.',
          },
          {
            id: 'result-preview',
            name: 'Quick Preview / Hover Card',
            description: 'Preview details without leaving results',
            codeSignals: ['preview', 'hover', 'quickView', 'HoverCard', 'Popover'],
            priority: 'medium',
            effort: 'low',
            why: 'Reduce back-and-forth between list and detail views.',
            result: 'Hover/click for expanded preview inline.',
          },
        ],
        advanced: [
          {
            id: 'smart-recommendations',
            name: 'Smart Recommendations',
            description: 'AI-powered suggestions based on preferences',
            codeSignals: ['recommend', 'suggestion', 'forYou', 'personalized', 'ML'],
            priority: 'low',
            effort: 'high',
            why: 'Help users discover relevant items they haven\'t searched for.',
            result: '"Recommended for you" section based on history.',
          },
          {
            id: 'recent-searches',
            name: 'Recent Searches',
            description: 'Quick access to previous searches',
            codeSignals: ['recent', 'history', 'recentSearches'],
            priority: 'low',
            effort: 'low',
            why: 'Users often repeat searches.',
            result: 'Dropdown showing recent search terms.',
          },
          {
            id: 'search-alerts',
            name: 'Search Alerts',
            description: 'Get notified when new items match criteria',
            codeSignals: ['alert', 'notify', 'watchlist', 'savedAlert'],
            priority: 'medium',
            effort: 'medium',
            why: 'New programs/coaches matching criteria appear over time.',
            result: 'Email/push when new matches found.',
          },
        ],
      },

      userWorkflows: [
        {
          persona: 'High School Player',
          task: 'Find D2 baseball programs in Texas',
          frequency: 'Weekly during recruiting',
          currentPain: 'Google search, visit each school website individually',
          idealFlow: 'Filter by division + state, see on map, save favorites',
          requiredCapabilities: ['advanced-filters', 'map-view', 'favorites'],
        },
        {
          persona: 'High School Player',
          task: 'Compare top 3 schools I\'m interested in',
          frequency: 'Few times during recruiting',
          currentPain: 'Open multiple tabs, manually compare',
          idealFlow: 'Select 3 programs, see side-by-side comparison',
          requiredCapabilities: ['comparison-mode', 'favorites'],
        },
      ],
    },

    // ==========================================
    // 🏆 TOURNAMENTS / COMPETITIONS
    // ==========================================
    tournaments: {
      name: 'Tournaments / Competitions',
      category: 'operations',
      description: 'Tournament management, brackets, and live scoring',
      competitors: ['GameChanger', 'Scorebook Live', 'MaxPreps', 'iScore'],
      
      indicators: {
        routes: ['tournaments', 'competitions', 'events', 'leagues', 'bracket'],
        components: ['TournamentCard', 'Leaderboard', 'Bracket', 'ScoreEntry', 'Standings'],
        dataPatterns: ['tournament', 'round', 'score', 'bracket', 'standings', 'match'],
        hooks: ['useTournament', 'useScores', 'useStandings'],
      },

      capabilities: {
        core: [
          {
            id: 'tournament-list',
            name: 'Tournament List',
            codeSignals: ['tournaments', 'TournamentCard', 'TournamentList'],
            priority: 'critical',
          },
          {
            id: 'tournament-detail',
            name: 'Tournament Detail View',
            codeSignals: ['TournamentDetail', '/tournament/', '[tournamentId]'],
            priority: 'critical',
          },
        ],
        expected: [
          {
            id: 'live-scoring',
            name: 'Live Score Entry',
            description: 'Enter scores in real-time during tournament',
            codeSignals: ['score', 'entry', 'live', 'realtime', 'ScoreInput', 'enterScore'],
            priority: 'high',
            effort: 'medium',
            why: 'Scores are entered after the fact, missing live experience.',
            result: 'Coaches/scorers enter scores during games, updates instantly.',
          },
          {
            id: 'leaderboard',
            name: 'Live Leaderboard',
            description: 'Auto-updating standings and rankings',
            codeSignals: ['leaderboard', 'standings', 'ranking', 'Leaderboard'],
            priority: 'high',
            effort: 'medium',
            why: 'Everyone wants to see current standings.',
            result: 'Real-time leaderboard updates as scores are entered.',
          },
          {
            id: 'bracket-view',
            name: 'Tournament Bracket Visualization',
            description: 'Visual bracket for elimination tournaments',
            codeSignals: ['bracket', 'elimination', 'matchup', 'BracketView', 'knockout'],
            priority: 'medium',
            effort: 'high',
            why: 'Standard way to visualize tournament progress.',
            result: 'Interactive bracket showing all matchups and results.',
            implementation: {
              libraries: ['react-brackets', '@g-loot/react-tournament-brackets'],
            },
          },
          {
            id: 'team-registration',
            name: 'Online Team Registration',
            description: 'Teams register and pay for tournaments online',
            codeSignals: ['register', 'registration', 'signup', 'entry', 'RegisterTeam'],
            priority: 'high',
            effort: 'medium',
            why: 'Currently done via email/phone, manual tracking.',
            result: 'Self-service registration, automatic confirmation.',
          },
          {
            id: 'schedule-builder',
            name: 'Tournament Schedule Builder',
            description: 'Generate pool play schedules, field assignments',
            codeSignals: ['schedule', 'pool', 'field', 'assignField', 'generateSchedule'],
            priority: 'medium',
            effort: 'high',
            why: 'Tournament directors spend hours building schedules.',
            result: 'Auto-generate balanced schedules with constraints.',
          },
          {
            id: 'game-notifications',
            name: 'Game Time Notifications',
            description: 'Alert teams when their game is coming up',
            codeSignals: ['notify', 'alert', 'upcoming', 'gameAlert'],
            priority: 'medium',
            effort: 'medium',
            why: 'Teams miss game times at busy tournaments.',
            result: '"Your game starts in 15 minutes on Field 3"',
          },
        ],
        advanced: [
          {
            id: 'stats-tracking',
            name: 'Individual Stats Tracking',
            description: 'Track player stats during tournament',
            codeSignals: ['stats', 'statistics', 'playerStats', 'batting', 'pitching'],
            priority: 'medium',
            effort: 'high',
            why: 'Players want stats from tournaments.',
            result: 'Enter play-by-play, auto-calculate stats.',
          },
          {
            id: 'results-sharing',
            name: 'Results Sharing / Public Page',
            description: 'Public tournament page for spectators',
            codeSignals: ['public', 'share', 'spectator', 'embed'],
            priority: 'medium',
            effort: 'medium',
            why: 'Families not at tournament want to follow along.',
            result: 'Shareable link with live scores and standings.',
          },
          {
            id: 'awards',
            name: 'Awards / All-Tournament Team',
            description: 'Select and announce award winners',
            codeSignals: ['award', 'mvp', 'allTournament', 'winner'],
            priority: 'low',
            effort: 'low',
            why: 'Tournaments recognize top performers.',
            result: 'Vote/select awards, display on results page.',
          },
        ],
      },

      userWorkflows: [
        {
          persona: 'Tournament Director',
          task: 'Set up tournament schedule for 16 teams',
          frequency: 'Per tournament',
          currentPain: 'Excel spreadsheet, manual balancing, hours of work',
          idealFlow: 'Enter constraints, auto-generate schedule, adjust as needed',
          requiredCapabilities: ['schedule-builder'],
        },
        {
          persona: 'Parent',
          task: 'Follow my kid\'s team at tournament',
          frequency: 'Every tournament',
          currentPain: 'Text updates from other parent, no scores',
          idealFlow: 'Live scores and standings on phone',
          requiredCapabilities: ['live-scoring', 'leaderboard', 'results-sharing'],
        },
      ],
    },

    // ==========================================
    // 📈 ANALYTICS / STATS
    // ==========================================
    analytics: {
      name: 'Analytics / Statistics',
      category: 'analytics',
      description: 'Performance tracking, metrics, and data visualization',
      competitors: ['GameChanger', 'Hudl', 'Rapsodo', 'TrackMan'],
      
      indicators: {
        routes: ['analytics', 'stats', 'statistics', 'performance', 'metrics', 'reports'],
        components: ['Chart', 'Graph', 'StatsCard', 'MetricsGrid', 'Dashboard'],
        imports: ['recharts', 'chart.js', 'd3', 'victory', 'nivo'],
        dataPatterns: ['stats', 'metrics', 'average', 'total', 'trend'],
        hooks: ['useStats', 'useAnalytics', 'useMetrics'],
      },

      capabilities: {
        core: [
          {
            id: 'stats-display',
            name: 'Basic Stats Display',
            codeSignals: ['StatsCard', 'MetricsGrid', 'stats', 'average'],
            priority: 'critical',
          },
        ],
        expected: [
          {
            id: 'trend-charts',
            name: 'Trend Visualization',
            description: 'Charts showing performance over time',
            codeSignals: ['chart', 'graph', 'trend', 'LineChart', 'AreaChart'],
            priority: 'high',
            effort: 'medium',
            why: 'Numbers alone don\'t show progress. Trends reveal patterns.',
            result: 'Visual charts showing improvement over time.',
            implementation: {
              libraries: ['recharts', '@nivo/line', 'chart.js'],
            },
          },
          {
            id: 'date-range',
            name: 'Date Range Selection',
            description: 'Filter stats by time period',
            codeSignals: ['dateRange', 'DatePicker', 'fromDate', 'toDate', 'period'],
            priority: 'high',
            effort: 'low',
            why: 'Compare this month vs last month, this season vs last.',
            result: 'Flexible date filtering for all stats.',
          },
          {
            id: 'leaderboards',
            name: 'Team Leaderboards',
            description: 'Rank players by various metrics',
            codeSignals: ['leaderboard', 'ranking', 'topPlayers', 'sortBy'],
            priority: 'medium',
            effort: 'low',
            why: 'Coaches want to see top performers at a glance.',
            result: 'Leaderboard for batting avg, ERA, goals, etc.',
          },
          {
            id: 'export-reports',
            name: 'Export Reports',
            description: 'Download stats as PDF/CSV',
            codeSignals: ['export', 'download', 'pdf', 'csv', 'report'],
            priority: 'medium',
            effort: 'low',
            why: 'Share stats with players, parents, scouts.',
            result: 'One-click export formatted reports.',
          },
          {
            id: 'comparison',
            name: 'Player Comparison',
            description: 'Compare two players\' stats',
            codeSignals: ['compare', 'versus', 'sideBySide', 'comparison'],
            priority: 'medium',
            effort: 'medium',
            why: 'Making lineup decisions requires comparison.',
            result: 'Select players, see stats side by side.',
          },
        ],
        advanced: [
          {
            id: 'predictive',
            name: 'Predictive Analytics',
            description: 'Project future performance',
            codeSignals: ['predict', 'projection', 'forecast', 'ML'],
            priority: 'low',
            effort: 'high',
            why: 'Help coaches make data-driven decisions.',
            result: '"Based on current trajectory, projected end-of-season stats"',
          },
          {
            id: 'video-integration',
            name: 'Video + Stats Integration',
            description: 'Link video clips to stat events',
            codeSignals: ['video', 'clip', 'highlight', 'playback'],
            priority: 'medium',
            effort: 'high',
            why: 'Stats without video lack context.',
            result: 'Click on at-bat, see the video.',
          },
        ],
      },
    },

    // ==========================================
    // 👤 PROFILE / PLAYER SHOWCASE
    // ==========================================
    profile: {
      name: 'Profile / Player Showcase',
      category: 'engagement',
      description: 'Player profiles for recruiting, showcasing abilities',
      competitors: ['NCSA', 'BeRecruited', 'Perfect Game', 'Prep Baseball Report'],
      
      indicators: {
        routes: ['profile', 'player', 'showcase', 'recruit', 'portfolio'],
        components: ['ProfileHeader', 'ProfileCard', 'StatsDisplay', 'VideoGallery', 'Highlights'],
        dataPatterns: ['profile', 'bio', 'height', 'weight', 'gpa', 'highlights'],
        hooks: ['useProfile', 'usePlayerProfile'],
      },

      capabilities: {
        core: [
          {
            id: 'basic-info',
            name: 'Basic Profile Info',
            codeSignals: ['ProfileHeader', 'name', 'position', 'height', 'weight'],
            priority: 'critical',
          },
        ],
        expected: [
          {
            id: 'video-highlights',
            name: 'Video Highlights',
            description: 'Upload and showcase video clips',
            codeSignals: ['video', 'highlight', 'clip', 'VideoGallery', 'uploadVideo'],
            priority: 'high',
            effort: 'medium',
            why: 'Coaches want to see players in action.',
            result: 'Upload highlights, they appear on profile.',
            implementation: {
              services: ['Mux', 'Cloudinary', 'Supabase Storage'],
            },
          },
          {
            id: 'academic-info',
            name: 'Academic Information',
            description: 'GPA, test scores, graduation year',
            codeSignals: ['gpa', 'academic', 'sat', 'act', 'graduation', 'classOf'],
            priority: 'high',
            effort: 'low',
            why: 'College coaches need academic eligibility info.',
            result: 'Academic profile section with relevant metrics.',
          },
          {
            id: 'measurables',
            name: 'Athletic Measurables',
            description: '60 time, velocity, exit velo, etc.',
            codeSignals: ['measurable', 'velocity', '60time', 'exitVelo', 'popTime'],
            priority: 'high',
            effort: 'low',
            why: 'Objective metrics coaches look for.',
            result: 'Display verified measurables prominently.',
          },
          {
            id: 'profile-views',
            name: 'Profile View Tracking',
            description: 'See who viewed your profile',
            codeSignals: ['views', 'viewedBy', 'profileViews', 'trackView'],
            priority: 'high',
            effort: 'low',
            why: 'Players want to know which coaches are interested.',
            result: '"Your profile was viewed by Coach Smith from State U"',
          },
          {
            id: 'shareable-link',
            name: 'Shareable Profile Link',
            description: 'Public URL to share with coaches',
            codeSignals: ['share', 'publicUrl', 'slug', 'shareProfile'],
            priority: 'high',
            effort: 'low',
            why: 'Easy way to send profile to coaches.',
            result: 'Clean URL like /players/john-smith-2025',
          },
          {
            id: 'contact-preferences',
            name: 'Contact Preferences',
            description: 'How coaches should reach out',
            codeSignals: ['contact', 'preference', 'reachOut', 'allowContact'],
            priority: 'medium',
            effort: 'low',
            why: 'Some players prefer email vs phone.',
            result: 'Coaches see preferred contact method.',
          },
        ],
        advanced: [
          {
            id: 'recruiting-status',
            name: 'Recruiting Status',
            description: 'Committed, looking, offer list',
            codeSignals: ['committed', 'offer', 'recruitingStatus', 'verbal'],
            priority: 'medium',
            effort: 'low',
            why: 'Coaches need to know availability.',
            result: 'Status badge (Open, Committed to X)',
          },
          {
            id: 'recommendations',
            name: 'Coach Recommendations',
            description: 'References from coaches',
            codeSignals: ['recommendation', 'reference', 'endorsement', 'testimonial'],
            priority: 'medium',
            effort: 'medium',
            why: 'Third-party validation matters.',
            result: 'Display coach quotes/recommendations.',
          },
          {
            id: 'schedule-integration',
            name: 'Upcoming Events',
            description: 'Show where player will be playing',
            codeSignals: ['upcoming', 'schedule', 'whereToSee', 'events'],
            priority: 'medium',
            effort: 'low',
            why: 'Coaches want to see players in person.',
            result: '"See me at XYZ Tournament June 15-17"',
          },
        ],
      },

      userWorkflows: [
        {
          persona: 'High School Player',
          task: 'Send profile to college coach',
          frequency: 'Weekly during recruiting',
          currentPain: 'Compile info into email, attach videos separately',
          idealFlow: 'Share profile link, coach sees everything in one place',
          requiredCapabilities: ['shareable-link', 'video-highlights', 'academic-info'],
        },
        {
          persona: 'High School Player',
          task: 'Know which coaches are interested',
          frequency: 'Checking regularly',
          currentPain: 'No visibility until coach reaches out',
          idealFlow: 'See profile views with coach names and schools',
          requiredCapabilities: ['profile-views'],
        },
      ],
    },

    // ==========================================
    // ⚙️ SETTINGS / PREFERENCES
    // ==========================================
    settings: {
      name: 'Settings / Preferences',
      category: 'core',
      description: 'User preferences, account settings, notifications',
      competitors: ['Any SaaS product'],
      
      indicators: {
        routes: ['settings', 'preferences', 'account', 'profile/edit'],
        components: ['SettingsForm', 'PreferencesPanel', 'AccountSettings', 'ToggleSwitch'],
        dataPatterns: ['settings', 'preferences', 'config', 'notification_settings'],
        hooks: ['useSettings', 'usePreferences'],
      },

      capabilities: {
        core: [
          {
            id: 'profile-edit',
            name: 'Edit Profile Information',
            codeSignals: ['editProfile', 'updateProfile', 'ProfileForm'],
            priority: 'critical',
          },
          {
            id: 'password-change',
            name: 'Change Password',
            codeSignals: ['changePassword', 'updatePassword', 'newPassword'],
            priority: 'critical',
          },
        ],
        expected: [
          {
            id: 'notification-prefs',
            name: 'Notification Preferences',
            description: 'Control what notifications you receive',
            codeSignals: ['notification', 'email_notifications', 'push_notifications', 'preferences'],
            priority: 'high',
            effort: 'low',
            why: 'Users get overwhelmed by notifications.',
            result: 'Granular control over notification types and channels.',
          },
          {
            id: 'timezone',
            name: 'Timezone Setting',
            description: 'Set preferred timezone for events',
            codeSignals: ['timezone', 'timeZone', 'tz'],
            priority: 'high',
            effort: 'low',
            why: 'Teams span timezones, events must show in local time.',
            result: 'All times displayed in user\'s timezone.',
          },
          {
            id: 'theme',
            name: 'Theme Preference',
            description: 'Light/dark mode selection',
            codeSignals: ['theme', 'darkMode', 'lightMode', 'colorScheme'],
            priority: 'low',
            effort: 'low',
            why: 'User preference for visual comfort.',
            result: 'Toggle between light and dark themes.',
          },
          {
            id: 'delete-account',
            name: 'Delete Account',
            description: 'Self-service account deletion',
            codeSignals: ['deleteAccount', 'removeAccount', 'closeAccount'],
            priority: 'medium',
            effort: 'medium',
            why: 'GDPR/privacy compliance, user control.',
            result: 'User can delete their data and account.',
          },
          {
            id: 'export-data',
            name: 'Export My Data',
            description: 'Download all personal data',
            codeSignals: ['exportData', 'downloadData', 'myData'],
            priority: 'medium',
            effort: 'medium',
            why: 'GDPR compliance, data portability.',
            result: 'Download all data as JSON/CSV.',
          },
        ],
        advanced: [
          {
            id: 'connected-accounts',
            name: 'Connected Accounts',
            description: 'Link Google, Apple, etc.',
            codeSignals: ['connected', 'oauth', 'google', 'apple', 'linkAccount'],
            priority: 'low',
            effort: 'medium',
            why: 'Easier login, integration possibilities.',
            result: 'See and manage connected accounts.',
          },
          {
            id: 'api-keys',
            name: 'API Keys',
            description: 'Generate API keys for integrations',
            codeSignals: ['apiKey', 'token', 'integration'],
            priority: 'low',
            effort: 'medium',
            why: 'Power users want API access.',
            result: 'Generate and manage API keys.',
          },
        ],
      },
    },

    // ==========================================
    // 🎓 ONBOARDING / GETTING STARTED
    // ==========================================
    onboarding: {
      name: 'Onboarding / Getting Started',
      category: 'engagement',
      description: 'New user onboarding, setup wizards, and tutorials',
      competitors: ['Notion', 'Linear', 'Figma'],
      
      indicators: {
        routes: ['onboarding', 'welcome', 'getting-started', 'setup', 'tour'],
        components: ['OnboardingWizard', 'WelcomeModal', 'SetupStep', 'ProgressBar', 'Tour'],
        dataPatterns: ['onboarding_complete', 'setup_step', 'first_login'],
        hooks: ['useOnboarding', 'useTour'],
      },

      capabilities: {
        expected: [
          {
            id: 'welcome-flow',
            name: 'Welcome Flow',
            description: 'Guided setup for new users',
            codeSignals: ['welcome', 'onboarding', 'setup', 'wizard', 'getStarted'],
            priority: 'high',
            effort: 'medium',
            why: 'New users are lost without guidance.',
            result: 'Step-by-step setup: create team, add players, etc.',
          },
          {
            id: 'progress-tracking',
            name: 'Setup Progress Tracking',
            description: 'Show progress through setup steps',
            codeSignals: ['progress', 'step', 'complete', 'ProgressBar', 'setupProgress'],
            priority: 'medium',
            effort: 'low',
            why: 'Users need to know how much is left.',
            result: 'Progress bar and checklist.',
          },
          {
            id: 'feature-tours',
            name: 'Feature Tours',
            description: 'Interactive tooltips explaining features',
            codeSignals: ['tour', 'tooltip', 'walkthrough', 'intro.js', 'shepherd'],
            priority: 'medium',
            effort: 'medium',
            why: 'Features are discovered slowly without guidance.',
            result: 'Guided tours highlighting key features.',
            implementation: {
              libraries: ['intro.js', 'shepherd.js', '@reactour/tour'],
            },
          },
          {
            id: 'empty-states',
            name: 'Helpful Empty States',
            description: 'Actionable messages when no data exists',
            codeSignals: ['empty', 'noData', 'EmptyState', 'getStarted'],
            priority: 'high',
            effort: 'low',
            why: 'Empty pages feel broken.',
            result: 'Every empty state has clear CTA.',
          },
          {
            id: 'skip-option',
            name: 'Skip Onboarding',
            description: 'Allow experienced users to skip',
            codeSignals: ['skip', 'skipOnboarding', 'later'],
            priority: 'medium',
            effort: 'low',
            why: 'Power users don\'t need hand-holding.',
            result: '"Skip for now" option on all steps.',
          },
        ],
        advanced: [
          {
            id: 'video-tutorials',
            name: 'Video Tutorials',
            description: 'Embedded video guides',
            codeSignals: ['video', 'tutorial', 'howTo', 'loom'],
            priority: 'low',
            effort: 'medium',
            why: 'Some users prefer watching over reading.',
            result: 'Short videos for complex features.',
          },
          {
            id: 'sample-data',
            name: 'Sample Data',
            description: 'Pre-populated demo data to explore',
            codeSignals: ['sample', 'demo', 'example', 'seedData'],
            priority: 'low',
            effort: 'medium',
            why: 'Hard to understand features without data.',
            result: 'Toggle to load sample team/data.',
          },
        ],
      },
    },

    // ==========================================
    // 🔔 NOTIFICATIONS CENTER
    // ==========================================
    notifications: {
      name: 'Notifications Center',
      category: 'communication',
      description: 'In-app notifications and activity feed',
      competitors: ['Facebook', 'LinkedIn', 'GitHub'],
      
      indicators: {
        routes: ['notifications', 'activity', 'alerts', 'updates'],
        components: ['NotificationList', 'NotificationBell', 'ActivityFeed', 'AlertBadge'],
        dataPatterns: ['notification', 'unread', 'alert', 'activity'],
        hooks: ['useNotifications', 'useAlerts'],
      },

      capabilities: {
        core: [
          {
            id: 'notification-list',
            name: 'Notification List',
            codeSignals: ['NotificationList', 'notifications', 'alerts'],
            priority: 'critical',
          },
          {
            id: 'unread-badge',
            name: 'Unread Badge',
            codeSignals: ['badge', 'unread', 'count', 'NotificationBell'],
            priority: 'critical',
          },
        ],
        expected: [
          {
            id: 'mark-read',
            name: 'Mark as Read',
            description: 'Mark individual or all as read',
            codeSignals: ['markRead', 'markAsRead', 'markAllRead'],
            priority: 'high',
            effort: 'low',
            why: 'Clear notification clutter.',
            result: 'One-click mark read.',
          },
          {
            id: 'notification-types',
            name: 'Notification Categorization',
            description: 'Different types with icons/colors',
            codeSignals: ['type', 'category', 'notificationType'],
            priority: 'medium',
            effort: 'low',
            why: 'Visual differentiation helps scanning.',
            result: 'Icons for message, event, system, etc.',
          },
          {
            id: 'notification-actions',
            name: 'Quick Actions',
            description: 'Take action directly from notification',
            codeSignals: ['action', 'onClick', 'handleAction'],
            priority: 'medium',
            effort: 'low',
            why: 'Reduce clicks to complete tasks.',
            result: '"Accept invite" button right in notification.',
          },
          {
            id: 'real-time',
            name: 'Real-time Updates',
            description: 'New notifications appear instantly',
            codeSignals: ['realtime', 'subscribe', 'websocket'],
            priority: 'high',
            effort: 'medium',
            why: 'Stale notification counts are confusing.',
            result: 'Badge updates without refresh.',
          },
        ],
      },
    },

    // ==========================================
    // 💳 PAYMENTS / BILLING
    // ==========================================
    payments: {
      name: 'Payments / Billing',
      category: 'monetization',
      description: 'Payment processing, subscriptions, invoicing',
      competitors: ['Stripe Billing', 'TeamSnap Payments'],
      
      indicators: {
        routes: ['billing', 'payments', 'subscription', 'pricing', 'checkout'],
        components: ['PricingTable', 'CheckoutForm', 'PaymentMethod', 'Invoice'],
        imports: ['@stripe/stripe-js', 'stripe'],
        dataPatterns: ['subscription', 'payment', 'invoice', 'plan'],
        hooks: ['useSubscription', 'useBilling'],
      },

      capabilities: {
        expected: [
          {
            id: 'subscription-management',
            name: 'Subscription Management',
            description: 'View and change subscription plan',
            codeSignals: ['subscription', 'plan', 'upgrade', 'downgrade', 'changePlan'],
            priority: 'high',
            effort: 'medium',
            why: 'Users need self-service subscription control.',
            result: 'See current plan, upgrade/downgrade easily.',
          },
          {
            id: 'payment-methods',
            name: 'Payment Method Management',
            description: 'Add/remove credit cards',
            codeSignals: ['paymentMethod', 'card', 'addCard', 'updatePayment'],
            priority: 'high',
            effort: 'medium',
            why: 'Cards expire, need to update.',
            result: 'Manage payment methods in settings.',
          },
          {
            id: 'invoice-history',
            name: 'Invoice History',
            description: 'View and download past invoices',
            codeSignals: ['invoice', 'receipt', 'history', 'downloadInvoice'],
            priority: 'medium',
            effort: 'low',
            why: 'Teams need invoices for reimbursement.',
            result: 'List of all invoices with download links.',
          },
          {
            id: 'team-dues',
            name: 'Team Dues Collection',
            description: 'Collect payments from team members',
            codeSignals: ['dues', 'collect', 'fee', 'teamPayment'],
            priority: 'high',
            effort: 'high',
            why: 'Coaches chase parents for money manually.',
            result: 'Request payment, track who paid, send reminders.',
            industryExample: 'TeamSnap Payments',
          },
        ],
      },
    },

    // ==========================================
    // 🏠 DASHBOARD / HOME
    // ==========================================
    dashboard: {
      name: 'Dashboard / Home',
      category: 'core',
      description: 'Central hub with key metrics and quick actions',
      competitors: ['Linear', 'Notion', 'Stripe Dashboard'],
      
      indicators: {
        routes: ['dashboard', 'home', 'overview', '/app'],
        components: ['Dashboard', 'StatsCard', 'ActivityFeed', 'QuickActions', 'MetricsGrid'],
        dataPatterns: ['metrics', 'stats', 'recent', 'activity'],
        hooks: ['useDashboard', 'useMetrics'],
      },

      capabilities: {
        core: [
          {
            id: 'key-metrics',
            name: 'Key Metrics Display',
            codeSignals: ['StatsCard', 'MetricsGrid', 'KPI', 'metric'],
            priority: 'critical',
          },
        ],
        expected: [
          {
            id: 'activity-feed',
            name: 'Recent Activity Feed',
            description: 'Show latest team activity',
            codeSignals: ['activity', 'feed', 'recent', 'ActivityFeed'],
            priority: 'high',
            effort: 'medium',
            why: 'Users want to see what\'s happening.',
            result: 'Chronological feed of team events.',
          },
          {
            id: 'quick-actions',
            name: 'Quick Actions',
            description: 'Shortcuts to common tasks',
            codeSignals: ['quickAction', 'shortcut', 'QuickActions'],
            priority: 'high',
            effort: 'low',
            why: 'Reduce clicks for frequent tasks.',
            result: 'Buttons for add event, message team, etc.',
          },
          {
            id: 'upcoming-events',
            name: 'Upcoming Events Widget',
            description: 'Show next few events',
            codeSignals: ['upcoming', 'nextEvents', 'UpcomingEvents'],
            priority: 'high',
            effort: 'low',
            why: 'Users need to know what\'s next.',
            result: 'Widget showing next 3-5 events.',
          },
          {
            id: 'customizable',
            name: 'Customizable Layout',
            description: 'Rearrange dashboard widgets',
            codeSignals: ['customize', 'layout', 'drag', 'widget', 'grid-layout'],
            priority: 'low',
            effort: 'high',
            why: 'Different users prioritize different info.',
            result: 'Drag-drop widget arrangement.',
          },
        ],
      },
    },

    // ==========================================
    // 📝 FORMS / DATA ENTRY
    // ==========================================
    forms: {
      name: 'Forms / Data Entry',
      category: 'core',
      description: 'Data input forms with validation',
      competitors: ['Typeform', 'JotForm'],
      
      indicators: {
        routes: ['new', 'create', 'edit', 'add', 'form'],
        components: ['Form', 'Input', 'Select', 'Textarea', 'FormField'],
        imports: ['react-hook-form', 'formik', 'zod', 'yup'],
        dataPatterns: ['onSubmit', 'handleSubmit', 'formData', 'validation'],
        hooks: ['useForm'],
      },

      capabilities: {
        core: [
          {
            id: 'form-fields',
            name: 'Form Fields',
            codeSignals: ['Input', 'Select', 'Textarea', 'FormField'],
            priority: 'critical',
          },
          {
            id: 'submit-handling',
            name: 'Form Submission',
            codeSignals: ['onSubmit', 'handleSubmit', 'submit'],
            priority: 'critical',
          },
        ],
        expected: [
          {
            id: 'validation',
            name: 'Form Validation',
            description: 'Client-side validation with error messages',
            codeSignals: ['validation', 'error', 'required', 'zod', 'yup', 'validate'],
            priority: 'high',
            effort: 'low',
            why: 'Prevent invalid data submission.',
            result: 'Inline error messages on invalid fields.',
          },
          {
            id: 'loading-state',
            name: 'Submit Loading State',
            description: 'Show loading while submitting',
            codeSignals: ['loading', 'isSubmitting', 'disabled', 'spinner'],
            priority: 'high',
            effort: 'low',
            why: 'User needs feedback that action is processing.',
            result: 'Button shows loading state, prevents double-submit.',
          },
          {
            id: 'success-feedback',
            name: 'Success Feedback',
            description: 'Toast/message on successful submit',
            codeSignals: ['toast', 'success', 'notification', 'showToast'],
            priority: 'high',
            effort: 'low',
            why: 'User needs confirmation action succeeded.',
            result: 'Toast message "Saved successfully".',
          },
          {
            id: 'autosave',
            name: 'Autosave Draft',
            description: 'Automatically save form progress',
            codeSignals: ['autosave', 'draft', 'localStorage', 'saveDraft'],
            priority: 'medium',
            effort: 'medium',
            why: 'Prevent data loss from accidental navigation.',
            result: 'Form state preserved if user leaves page.',
          },
          {
            id: 'unsaved-warning',
            name: 'Unsaved Changes Warning',
            description: 'Warn before navigating away with changes',
            codeSignals: ['unsaved', 'beforeunload', 'isDirty', 'prompt'],
            priority: 'medium',
            effort: 'low',
            why: 'Prevent accidental data loss.',
            result: 'Browser prompt "You have unsaved changes".',
          },
        ],
      },
    },
  },

  // ==========================================
  // CROSS-FEATURE SYNERGIES
  // ==========================================
  synergies: [
    {
      features: ['calendar', 'roster'],
      synergy: 'attendance-tracking',
      description: 'Calendar events + roster = attendance tracking',
      implementation: 'Link event_attendance table to both',
    },
    {
      features: ['calendar', 'messaging'],
      synergy: 'event-notifications',
      description: 'Events trigger message reminders',
      implementation: 'Cron job checks upcoming events, sends messages',
    },
    {
      features: ['roster', 'messaging'],
      synergy: 'team-broadcast',
      description: 'Message all players on roster',
      implementation: 'Get roster IDs, bulk insert message recipients',
    },
    {
      features: ['profile', 'discover'],
      synergy: 'recruiting-visibility',
      description: 'Player profiles appear in coach searches',
      implementation: 'Index profiles for search, track views',
    },
    {
      features: ['tournaments', 'analytics'],
      synergy: 'tournament-stats',
      description: 'Stats from tournament play',
      implementation: 'Link game stats to tournament context',
    },
  ],

  // ==========================================
  // IMPLEMENTATION PRIORITIES
  // ==========================================
  implementationOrder: {
    mvp: [
      'event-crud', 'calendar-views', 'player-list', 'player-crud',
      'send-receive', 'conversation-list', 'basic-info',
    ],
    growth: [
      'recurring-events', 'attendance-tracking', 'event-notifications',
      'bulk-import', 'team-broadcast', 'read-receipts', 'video-highlights',
    ],
    scale: [
      'drag-drop-reschedule', 'calendar-sync', 'lineup-builder',
      'push-notifications', 'live-scoring', 'leaderboard',
    ],
  },

  // ==========================================
  // HELPER METHODS
  // ==========================================

  /**
   * Detect which feature this code represents
   */
  detectFeature(routePath, code) {
    const scores = {};
    
    for (const [featureId, feature] of Object.entries(this.features)) {
      let score = 0;
      
      // Route indicators (highest weight)
      for (const route of feature.indicators.routes || []) {
        if (routePath.toLowerCase().includes(route)) score += 15;
      }
      
      // Component indicators
      for (const comp of feature.indicators.components || []) {
        if (code.includes(comp)) score += 8;
      }
      
      // Import indicators
      for (const imp of feature.indicators.imports || []) {
        if (code.includes(imp)) score += 6;
      }
      
      // Data pattern indicators
      for (const pattern of feature.indicators.dataPatterns || []) {
        if (code.includes(pattern)) score += 4;
      }
      
      // Hook indicators
      for (const hook of feature.indicators.hooks || []) {
        if (code.includes(hook)) score += 5;
      }
      
      if (score > 0) {
        scores[featureId] = score;
      }
    }
    
    // Return highest scoring feature (minimum threshold of 10)
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 && sorted[0][1] >= 10 ? sorted[0][0] : null;
  },

  /**
   * Get all capabilities for a feature (core + expected + advanced)
   */
  getAllCapabilities(featureId) {
    const feature = this.features[featureId];
    if (!feature) return [];
    
    return [
      ...(feature.capabilities.core || []),
      ...(feature.capabilities.expected || []),
      ...(feature.capabilities.advanced || []),
    ];
  },

  /**
   * Analyze code for capability gaps
   */
  analyzeCapabilityGaps(featureId, code) {
    const feature = this.features[featureId];
    if (!feature) return { found: [], missing: [], advanced: [] };
    
    const found = [];
    const missing = [];
    const advanced = [];
    
    const codeLower = code.toLowerCase();
    
    // Check core and expected capabilities
    const requiredCapabilities = [
      ...(feature.capabilities.core || []),
      ...(feature.capabilities.expected || []),
    ];
    
    for (const capability of requiredCapabilities) {
      const hasCapability = capability.codeSignals.some(signal => 
        codeLower.includes(signal.toLowerCase())
      );
      
      if (hasCapability) {
        found.push(capability);
      } else {
        missing.push(capability);
      }
    }
    
    // Check advanced (nice-to-have)
    for (const capability of (feature.capabilities.advanced || [])) {
      const hasCapability = capability.codeSignals.some(signal => 
        codeLower.includes(signal.toLowerCase())
      );
      
      if (!hasCapability) {
        advanced.push(capability);
      }
    }
    
    return { found, missing, advanced };
  },

  /**
   * Generate smart suggestions based on gaps
   */
  generateSmartSuggestions(featureId, code) {
    const { found, missing, advanced } = this.analyzeCapabilityGaps(featureId, code);
    const feature = this.features[featureId];
    
    const suggestions = [];
    
    // High priority: missing expected capabilities
    for (const cap of missing) {
      if (cap.priority === 'high' || cap.priority === 'critical') {
        suggestions.push({
          id: cap.id,
          title: cap.name,
          description: cap.description,
          category: 'feature-gap',
          severity: cap.priority === 'critical' ? 'error' : 'warning',
          priority: cap.priority,
          effort: cap.effort || 'medium',
          why: cap.why || `Standard capability for ${feature.name}`,
          result: cap.result || `Users can ${cap.description?.toLowerCase()}`,
          industryExample: cap.industryExample,
          implementation: cap.implementation,
          metrics: cap.metrics,
          source: 'feature-knowledge',
          context: {
            featureType: featureId,
            featureName: feature.name,
            capability: cap.name,
            codeSignals: cap.codeSignals,
          },
        });
      }
    }
    
    // Medium priority: remaining missing
    for (const cap of missing) {
      if (cap.priority === 'medium' && suggestions.length < 8) {
        suggestions.push({
          id: cap.id,
          title: cap.name,
          description: cap.description,
          category: 'feature-gap',
          severity: 'info',
          priority: cap.priority,
          effort: cap.effort || 'medium',
          why: cap.why || `Enhances ${feature.name} functionality`,
          result: cap.result,
          industryExample: cap.industryExample,
          implementation: cap.implementation,
          source: 'feature-knowledge',
          context: {
            featureType: featureId,
            featureName: feature.name,
            capability: cap.name,
          },
        });
      }
    }
    
    // Low priority: advanced features (if we have room)
    for (const cap of advanced) {
      if (cap.priority === 'medium' && suggestions.length < 10) {
        suggestions.push({
          id: cap.id,
          title: cap.name,
          description: cap.description,
          category: 'advanced-feature',
          severity: 'info',
          priority: 'low',
          effort: cap.effort || 'high',
          why: cap.why || 'Nice-to-have enhancement',
          result: cap.result,
          industryExample: cap.industryExample,
          source: 'feature-knowledge',
          context: {
            featureType: featureId,
            featureName: feature.name,
            capability: cap.name,
          },
        });
      }
    }
    
    return suggestions;
  },

  /**
   * Get user workflows blocked by missing capabilities
   */
  getBlockedWorkflows(featureId, missingCapabilities) {
    const feature = this.features[featureId];
    if (!feature?.userWorkflows) return [];
    
    const missingIds = new Set(missingCapabilities.map(c => c.id));
    
    return feature.userWorkflows
      .filter(workflow =>
        workflow.requiredCapabilities?.some(cap => missingIds.has(cap))
      )
      .map(w => ({
        ...w,
        blockedBy: w.requiredCapabilities.filter(cap => missingIds.has(cap)),
      }));
  },

  /**
   * Get full analysis for a route
   */
  getFullAnalysis(routePath, code) {
    const featureId = this.detectFeature(routePath, code);
    if (!featureId) {
      return {
        feature: null,
        message: 'Could not detect feature type',
        suggestions: [],
      };
    }
    
    const feature = this.features[featureId];
    const { found, missing, advanced } = this.analyzeCapabilityGaps(featureId, code);
    const suggestions = this.generateSmartSuggestions(featureId, code);
    const blockedWorkflows = this.getBlockedWorkflows(featureId, missing);
    
    const totalCapabilities = found.length + missing.length;
    const completeness = totalCapabilities > 0 
      ? Math.round((found.length / totalCapabilities) * 100)
      : 0;
    
    return {
      feature: {
        id: featureId,
        name: feature.name,
        category: feature.category,
        description: feature.description,
        competitors: feature.competitors,
      },
      capabilities: {
        found: found.map(c => ({ id: c.id, name: c.name, priority: c.priority })),
        missing: missing.map(c => ({ 
          id: c.id, 
          name: c.name, 
          priority: c.priority,
          why: c.why,
          effort: c.effort,
        })),
        advanced: advanced.map(c => ({ id: c.id, name: c.name })),
        completeness,
      },
      suggestions,
      blockedWorkflows,
      industryComparison: feature.competitors,
      successMetrics: feature.successMetrics,
      synergies: this.getSynergiesFor(featureId),
    };
  },

  /**
   * Get synergies involving a feature
   */
  getSynergiesFor(featureId) {
    return this.synergies.filter(s => s.features.includes(featureId));
  },

  /**
   * Get recommended implementation order
   */
  getImplementationPriority(capabilityId) {
    if (this.implementationOrder.mvp.includes(capabilityId)) return 'mvp';
    if (this.implementationOrder.growth.includes(capabilityId)) return 'growth';
    if (this.implementationOrder.scale.includes(capabilityId)) return 'scale';
    return 'future';
  },
};

export default FeatureKnowledge;
