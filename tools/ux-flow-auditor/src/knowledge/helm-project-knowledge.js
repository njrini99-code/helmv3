/**
 * HELM SPORTS LABS - COMPLETE PROJECT KNOWLEDGE
 * 
 * This file contains synthesized knowledge about the entire helmv3 codebase.
 * The Ship Command Hub agents use this to understand:
 * - Domain concepts (baseball recruiting, golf team management)
 * - Database schema and relationships
 * - Design system and UI patterns
 * - Code patterns and anti-patterns
 * - Route structure and navigation flows
 * - Component library and usage
 * 
 * This makes the agents 100x smarter by giving them deep context.
 */

export const HelmProjectKnowledge = {

  // ============================================================
  // PRODUCT OVERVIEW
  // ============================================================
  
  product: {
    name: 'Helm Sports Labs',
    tagline: 'Premium multi-sport SaaS platform',
    products: [
      {
        name: 'BaseballHelm',
        description: 'College baseball recruiting platform connecting high school players with college coaches',
        users: ['College Coaches', 'HS Coaches', 'JUCO Coaches', 'Showcase Coaches', 'Players'],
        keyFeatures: [
          'Player discovery and search',
          'Watchlist/Pipeline management',
          'Video showcase',
          'Messaging between coaches and players',
          'Player profile with metrics',
          'Recruiting activation',
          'Player comparison tool',
        ],
      },
      {
        name: 'GolfHelm',
        description: 'College golf team management platform',
        users: ['Golf Coaches', 'Golf Players'],
        keyFeatures: [
          'Round tracking and scoring',
          'Shot-by-shot tracking',
          'Advanced statistics',
          'Qualifier management',
          'Team roster',
          'Class schedule management',
          'Travel itineraries',
          'Announcements',
          'Tasks and documents',
        ],
      },
    ],
    techStack: {
      framework: 'Next.js 14 (App Router)',
      language: 'TypeScript',
      database: 'Supabase (PostgreSQL)',
      styling: 'Tailwind CSS',
      stateManagement: 'Zustand (minimal)',
      animations: 'Framer Motion',
      icons: 'Lucide React',
    },
  },

  // ============================================================
  // DATABASE SCHEMA
  // ============================================================
  
  database: {
    // CRITICAL: Correct table names (agents must use these)
    tables: {
      // Core user tables
      users: { description: 'Auth users with role', fields: ['id', 'email', 'role', 'created_at'] },
      coaches: { description: 'Coach profiles', fields: ['id', 'user_id', 'coach_type', 'organization_id', 'full_name', 'school_name'] },
      players: { description: 'Player profiles', fields: ['id', 'user_id', 'player_type', 'first_name', 'last_name', 'grad_year', 'primary_position'] },
      
      // Organizations and teams
      organizations: { description: 'Schools, clubs, programs', fields: ['id', 'name', 'type', 'division', 'conference'] },
      teams: { description: 'Individual teams', fields: ['id', 'name', 'team_type', 'organization_id', 'head_coach_id'] },
      team_members: { description: 'Player-team relationships', fields: ['id', 'team_id', 'player_id', 'status'] },
      team_coach_staff: { description: 'Coach-team relationships', fields: ['id', 'team_id', 'coach_id', 'role'] },
      
      // Recruiting (Baseball)
      watchlists: { description: 'Coach watchlist of players', fields: ['id', 'coach_id', 'player_id', 'pipeline_stage', 'notes', 'tags'] },
      videos: { description: 'Player highlight videos', fields: ['id', 'player_id', 'title', 'url', 'thumbnail_url', 'is_primary'] },
      player_metrics: { description: 'Athletic measurements', fields: ['id', 'player_id', 'metric_label', 'metric_value', 'verified'] },
      recruiting_interests: { description: 'Player interest from schools', fields: ['id', 'player_id', 'school_name', 'status', 'interest_level'] },
      
      // Messaging
      conversations: { description: 'Message threads', fields: ['id', 'created_at', 'updated_at'] },
      conversation_participants: { description: 'Who is in a conversation', fields: ['id', 'conversation_id', 'user_id'] },
      messages: { description: 'Individual messages', fields: ['id', 'conversation_id', 'sender_id', 'content', 'sent_at'] },
      
      // Events
      events: { description: 'Games, practices, etc', fields: ['id', 'name', 'event_type', 'start_time', 'team_id'] },
      camps: { description: 'Recruiting camps', fields: ['id', 'name', 'coach_id', 'start_date', 'capacity'] },
      coach_calendar_events: { description: 'Coach calendar', fields: ['id', 'coach_id', 'title', 'start_time'] },
      
      // Golf-specific tables (prefixed with golf_)
      golf_coaches: { description: 'Golf coach profiles', fields: ['id', 'user_id', 'team_id', 'full_name'] },
      golf_players: { description: 'Golf player profiles', fields: ['id', 'user_id', 'team_id', 'first_name', 'last_name', 'handicap', 'year'] },
      golf_teams: { description: 'Golf teams', fields: ['id', 'name', 'organization_id', 'invite_code'] },
      golf_rounds: { description: 'Golf round scores', fields: ['id', 'player_id', 'course_name', 'round_date', 'total_score', 'total_to_par'] },
      golf_holes: { description: 'Hole-by-hole data', fields: ['id', 'round_id', 'hole_number', 'par', 'score', 'putts', 'fairway_hit', 'green_in_regulation'] },
      golf_shots: { description: 'Shot-by-shot tracking', fields: ['id', 'round_id', 'hole_number', 'shot_number', 'club_type', 'result'] },
      golf_player_stats: { description: 'Calculated stats', fields: ['id', 'player_id', 'scoring_average', 'fairway_percentage', 'gir_percentage', 'putts_per_round'] },
      golf_qualifiers: { description: 'Qualifier events', fields: ['id', 'team_id', 'name', 'start_date', 'status'] },
      golf_events: { description: 'Golf team events', fields: ['id', 'team_id', 'title', 'event_type', 'start_date'] },
      golf_announcements: { description: 'Team announcements', fields: ['id', 'team_id', 'title', 'body', 'urgency'] },
      golf_tasks: { description: 'Player tasks', fields: ['id', 'team_id', 'title', 'due_date', 'assigned_to'] },
      golf_player_classes: { description: 'Class schedules', fields: ['id', 'player_id', 'course_name', 'day_of_week', 'start_time', 'end_time'] },
      golf_travel_itineraries: { description: 'Travel plans', fields: ['id', 'team_id', 'event_name', 'departure_date', 'hotel_name'] },
      golf_documents: { description: 'Team documents', fields: ['id', 'team_id', 'title', 'file_url'] },
      golf_courses: { description: 'Golf courses', fields: ['id', 'name', 'course_rating', 'slope_rating'] },
    },
    
    // CRITICAL: Enums with exact valid values
    enums: {
      user_role: ['player', 'coach', 'admin'],
      coach_type: ['college', 'high_school', 'juco', 'showcase'],
      player_type: ['high_school', 'showcase', 'juco', 'college'],
      // IMPORTANT: Only these 7 pipeline stages exist (not 5 as CLAUDE.md says - it's outdated)
      pipeline_stage: ['watchlist', 'high_priority', 'contacted', 'campus_visit', 'offer_extended', 'committed', 'uninterested'],
      golf_player_status: ['active', 'injured', 'redshirt', 'inactive'],
      golf_player_year: ['freshman', 'sophomore', 'junior', 'senior', 'fifth_year', 'graduate'],
      golf_event_type: ['practice', 'tournament', 'qualifier', 'meeting', 'travel', 'other'],
      golf_qualifier_status: ['upcoming', 'in_progress', 'completed'],
      golf_urgency_level: ['low', 'normal', 'high', 'urgent'],
    },
    
    // Common wrong table names to flag
    wrongTableNames: {
      'recruit_watchlist': 'Use "watchlists"',
      'player_videos': 'Use "videos"',
      'colleges': 'Use "organizations" (colleges table is legacy)',
      'high_schools': 'Use "organizations" (high_schools is legacy)',
    },
  },

  // ============================================================
  // DESIGN SYSTEM
  // ============================================================
  
  designSystem: {
    // Spacing scale - ONLY use these values
    spacing: {
      scale: [4, 8, 12, 16, 24, 32, 48, 64],
      cssVars: {
        '--space-1': '4px',
        '--space-2': '8px',
        '--space-3': '12px',
        '--space-4': '16px',
        '--space-6': '24px',
        '--space-8': '32px',
        '--space-12': '48px',
        '--space-16': '64px',
      },
      usage: 'gap-2 = 8px, p-4 = 16px, m-6 = 24px',
    },
    
    // Border radius - match element type
    borderRadius: {
      inputs: '8px (rounded-lg)',
      buttons: '12px (rounded-xl) or 8px (rounded-lg)',
      cards: '16px (rounded-2xl)',
      modals: '24px (rounded-3xl)',
      badges: '9999px (rounded-full)',
    },
    
    // Glassmorphism rules
    glass: {
      allowed: [
        'Navigation bars',
        'Toolbars',
        'Modal backdrops',
        'Side panels',
        'Filter bars',
        'Floating action buttons',
      ],
      forbidden: [
        'Data tables',
        'Forms',
        'KPI card data areas',
        'Long text content',
        'Every card (box soup)',
      ],
      levels: {
        subtle: { bg: 'rgba(255, 255, 255, 0.55)', blur: '12px', use: 'large surfaces, filter panels' },
        standard: { bg: 'rgba(255, 255, 255, 0.7)', blur: '16px', use: 'cards, metrics' },
        prominent: { bg: 'rgba(255, 255, 255, 0.8)', blur: '20px', use: 'navigation, modals' },
      },
      classes: ['glass-subtle', 'glass-standard', 'glass-prominent'],
    },
    
    // Motion timing
    motion: {
      fast: '150ms (hover, micro-interactions)',
      base: '220ms (dropdowns, small transitions)',
      slow: '320ms (modals, page transitions)',
      slower: '500ms (marketing animations)',
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    },
    
    // Color system
    colors: {
      primary: 'green-600 (#16a34a)',
      primaryHover: 'green-500 (#22c55e)',
      background: 'slate-50',
      text: 'slate-900',
      textSecondary: 'slate-600',
      textTertiary: 'slate-400',
      border: 'slate-200',
      borderHover: 'slate-300',
      // Dashboard gradient
      dashboardGradient: 'linear-gradient from warm cream to field green',
    },
    
    // Typography
    typography: {
      font: 'Inter',
      letterSpacing: {
        h1: '-0.025em',
        h2: '-0.02em',
        h3: '-0.015em',
        body: '-0.011em',
      },
      weights: [400, 450, 500, 550, 600, 700],
    },
    
    // Component classes from globals.css
    componentClasses: {
      buttons: ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger', 'btn-cta'],
      cards: ['card', 'card-lift', 'card-interactive', 'glass-card'],
      badges: ['badge-default', 'badge-success', 'badge-warning', 'badge-error', 'badge-info'],
      inputs: ['input', 'input-lg', 'input-error', 'textarea', 'checkbox'],
      skeletons: ['skeleton', 'skeleton-shimmer', 'skeleton-text', 'skeleton-card'],
    },
    
    // Anti-patterns to flag
    antiPatterns: [
      'Glass effect on every card (box soup)',
      'Small text over busy backgrounds',
      'Different blur values on same page',
      'Carousel in hero section',
      'Multiple equal-weight CTAs',
      'Inconsistent border-radius',
      'Missing hover transitions',
      'Non-standard spacing values',
      'Non-standard border-radius values',
    ],
  },

  // ============================================================
  // CODE PATTERNS
  // ============================================================
  
  codePatterns: {
    // Type imports - ALWAYS use this path
    typeImports: {
      correct: "import type { Player, Coach, Watchlist } from '@/lib/types';",
      wrong: [
        "import { Player } from '@/types/database';",
        "import { Player } from '@/types/supabase';",
        "import type { Player } from '@/lib/types/database';", // Use index.ts
      ],
    },
    
    // Supabase client imports
    supabaseImports: {
      serverComponents: "import { createClient } from '@/lib/supabase/server';",
      clientComponents: "import { createClient } from '@/lib/supabase/client';",
      serverActions: "import { createClient } from '@/lib/supabase/server';",
    },
    
    // Client component directive
    clientComponents: {
      rule: "Add 'use client' at top of file if using useState, useEffect, event handlers",
      required: ['useState', 'useEffect', 'useRef', 'onClick', 'onChange', 'onSubmit'],
    },
    
    // File structure
    fileStructure: {
      'src/app/': 'Pages and routes (Next.js App Router)',
      'src/app/actions/': 'Server actions ONLY',
      'src/app/api/': 'API routes',
      'src/components/ui/': 'UI primitives (Button, Input, Modal)',
      'src/components/features/': 'Feature components (PlayerCard, CollegeCard)',
      'src/components/coach/': 'Coach-only components',
      'src/components/player/': 'Player-only components',
      'src/components/golf/': 'Golf-specific components',
      'src/components/layout/': 'Layout components (Header, Sidebar)',
      'src/hooks/': 'Custom React hooks',
      'src/lib/types/': 'ALL TypeScript types (use index.ts)',
      'src/lib/supabase/': 'Supabase client (server.ts, client.ts)',
      'src/lib/queries/': 'Server query functions',
      'src/stores/': 'Zustand stores',
    },
    
    // Route structure
    routes: {
      baseball: {
        landing: '/baseball',
        auth: ['/baseball/login', '/baseball/signup', '/baseball/forgot-password', '/baseball/reset-password'],
        onboarding: ['/baseball/player', '/baseball/coach', '/baseball/coach-onboarding'],
        dashboard: '/baseball/dashboard/*',
        dashboardPages: [
          '/baseball/dashboard (home)',
          '/baseball/dashboard/discover (player search)',
          '/baseball/dashboard/watchlist (saved players)',
          '/baseball/dashboard/pipeline (recruiting stages)',
          '/baseball/dashboard/messages (messaging)',
          '/baseball/dashboard/profile (player profile)',
          '/baseball/dashboard/colleges (college search)',
          '/baseball/dashboard/compare (player comparison)',
          '/baseball/dashboard/videos (video management)',
          '/baseball/dashboard/settings (account settings)',
          '/baseball/dashboard/calendar (events)',
          '/baseball/dashboard/camps (camp management)',
          '/baseball/dashboard/journey (player timeline)',
        ],
        public: ['/baseball/player/[id]', '/baseball/program/[id]'],
      },
      golf: {
        landing: '/golf',
        auth: ['/golf/login', '/golf/signup', '/golf/forgot-password', '/golf/reset-password'],
        onboarding: ['/golf/coach', '/golf/player'],
        dashboard: '/golf/dashboard/*',
        dashboardPages: [
          '/golf/dashboard (home)',
          '/golf/dashboard/roster (team roster)',
          '/golf/dashboard/rounds (round tracking)',
          '/golf/dashboard/rounds/new (log round)',
          '/golf/dashboard/rounds/[id] (round detail)',
          '/golf/dashboard/stats (statistics)',
          '/golf/dashboard/qualifiers (qualifier events)',
          '/golf/dashboard/qualifiers/[id] (qualifier detail)',
          '/golf/dashboard/calendar (events)',
          '/golf/dashboard/classes (class schedules)',
          '/golf/dashboard/travel (travel plans)',
          '/golf/dashboard/messages (messaging)',
          '/golf/dashboard/announcements (team announcements)',
          '/golf/dashboard/tasks (player tasks)',
          '/golf/dashboard/documents (team files)',
          '/golf/dashboard/team (team settings)',
          '/golf/dashboard/settings (user settings)',
        ],
      },
    },
    
    // Server actions pattern
    serverActions: {
      pattern: `'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function actionName(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Not authenticated' };
  }
  
  // ... action logic
  
  revalidatePath('/path');
  return { success: true };
}`,
    },
    
    // Hook pattern
    hookPattern: {
      pattern: `'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useHookName() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    async function fetch() {
      const supabase = createClient();
      const { data, error } = await supabase.from('table').select('*');
      if (error) setError(error);
      else setData(data);
      setLoading(false);
    }
    fetch();
  }, []);
  
  return { data, loading, error };
}`,
    },
  },

  // ============================================================
  // UI COMPONENT PATTERNS
  // ============================================================
  
  uiPatterns: {
    // Button usage
    button: {
      primaryCTA: 'Green background, shadow, lift on hover',
      secondary: 'White bg, border, subtle hover',
      ghost: 'Transparent, text only',
      loading: 'Show spinner, disable interaction',
      sizes: ['sm (px-3 py-1.5)', 'md (px-4 py-2)', 'lg (px-6 py-3)'],
    },
    
    // Card patterns
    card: {
      basic: 'card class - white bg, subtle shadow, rounded-2xl',
      interactive: 'card-lift class - lifts on hover',
      glass: 'glass-card - glassmorphism effect',
      padding: 'p-6 is standard card padding',
    },
    
    // Form patterns
    forms: {
      input: 'input class - border, focus ring, placeholder styling',
      validation: 'Use Zod for validation, show inline errors',
      errorState: 'input-error class - red border',
      label: 'label class - font-medium, mb-1.5',
    },
    
    // Loading patterns
    loading: {
      skeleton: 'skeleton-shimmer for content placeholders',
      spinner: 'Loader2 icon with animate-spin',
      fullPage: 'loading.tsx in route folder',
    },
    
    // Empty states
    emptyState: {
      icon: 'Large muted icon',
      title: 'Short explanatory title',
      description: 'Brief helpful message',
      action: 'Primary button to take action',
    },
    
    // Modal patterns
    modal: {
      backdrop: 'Fixed overlay with glass blur',
      container: 'Centered, rounded-3xl, max-w-lg',
      header: 'Title + close button',
      footer: 'Action buttons right-aligned',
      animation: 'Scale in with fade',
    },
    
    // Navigation patterns
    navigation: {
      sidebar: 'Fixed left, collapsible, glass effect',
      header: 'Sticky top, glass-nav class',
      breadcrumbs: 'Show current location',
      mobileNav: 'Bottom tab bar',
    },
    
    // Data display patterns
    dataDisplay: {
      table: 'table-premium class, hover rows, action opacity',
      list: 'Vertical stack, divide-y',
      grid: 'CSS grid, gap-4 or gap-6',
      stats: 'stat-number + stat-label',
    },
  },

  // ============================================================
  // BASEBALL DOMAIN KNOWLEDGE
  // ============================================================
  
  baseballDomain: {
    // Player positions
    positions: ['C', '1B', '2B', '3B', 'SS', 'OF', 'LHP', 'RHP', 'UTL'],
    
    // Divisions
    divisions: ['D1', 'D2', 'D3', 'NAIA', 'JUCO'],
    
    // Graduation years (current range)
    gradYears: [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032],
    
    // Player metrics labels
    metrics: [
      'exit_velo (Exit Velocity - mph)',
      'pitch_velo (Pitch Velocity - mph)',
      'pop_time (Pop Time - seconds)',
      'sixty_time (60-yard dash - seconds)',
      'gpa (Grade Point Average)',
      'sat_score (SAT Score)',
      'act_score (ACT Score)',
    ],
    
    // Pipeline stages (recruiting workflow)
    pipelineStages: {
      watchlist: 'Initial interest - tracking player',
      high_priority: 'Very interested - top of list',
      contacted: 'Made contact with player',
      campus_visit: 'Player visited campus',
      offer_extended: 'Scholarship offer made',
      committed: 'Player committed to program',
      uninterested: 'Not pursuing - passed',
    },
    
    // User flows
    userFlows: {
      coachRecruiting: [
        '1. Search players on /discover',
        '2. Add to watchlist',
        '3. Move through pipeline stages',
        '4. Send messages',
        '5. Extend offer',
        '6. Track commitment',
      ],
      playerActivation: [
        '1. Complete profile',
        '2. Add videos',
        '3. Add metrics',
        '4. Activate recruiting',
        '5. Track views/interest',
        '6. Respond to coaches',
      ],
    },
  },

  // ============================================================
  // GOLF DOMAIN KNOWLEDGE
  // ============================================================
  
  golfDomain: {
    // Player years
    playerYears: ['freshman', 'sophomore', 'junior', 'senior', 'fifth_year', 'graduate'],
    
    // Player statuses
    playerStatuses: ['active', 'injured', 'redshirt', 'inactive'],
    
    // Round types
    roundTypes: ['tournament', 'qualifier', 'practice', 'casual'],
    
    // Key statistics
    keyStats: [
      'scoring_average',
      'fairway_percentage',
      'gir_percentage (Greens in Regulation)',
      'putts_per_round',
      'scrambling_percentage',
      'sand_save_percentage',
      'driving_distance_avg',
    ],
    
    // Hole tracking fields
    holeTracking: [
      'score',
      'par',
      'putts',
      'fairway_hit (boolean)',
      'green_in_regulation (boolean)',
      'penalty_strokes',
      'drive_result',
      'approach_result',
      'approach_proximity',
    ],
    
    // Shot tracking (detailed)
    shotTracking: [
      'shot_number',
      'club_type',
      'shot_type (drive, approach, chip, putt)',
      'result (fairway, rough, sand, green, hole)',
      'distance_to_hole_before',
      'distance_to_hole_after',
      'lie_before',
      'miss_direction',
    ],
    
    // Coach workflows
    coachFlows: {
      roundManagement: [
        '1. Create/manage roster',
        '2. View player rounds',
        '3. Analyze statistics',
        '4. Create qualifiers',
        '5. Track standings',
      ],
      teamManagement: [
        '1. Manage roster',
        '2. Create announcements',
        '3. Assign tasks',
        '4. View class schedules',
        '5. Plan travel',
        '6. Upload documents',
      ],
    },
  },

  // ============================================================
  // COMMON ISSUES TO CHECK
  // ============================================================
  
  commonIssues: {
    security: [
      { id: 'env-leak', title: 'Hardcoded API keys or secrets', severity: 'blocker', pattern: /SUPABASE_KEY|API_KEY|SECRET/ },
      { id: 'password-leak', title: 'Hardcoded passwords', severity: 'blocker', pattern: /password\s*=\s*['"]/ },
    ],
    codeQuality: [
      { id: 'console-log', title: 'Console statements in production', severity: 'warning', pattern: /console\.(log|warn|error|debug)/ },
      { id: 'todo-comment', title: 'TODO/FIXME comments', severity: 'info', pattern: /TODO|FIXME|HACK|XXX/ },
      { id: 'any-type', title: 'TypeScript any type', severity: 'warning', pattern: /:\s*any/ },
    ],
    ux: [
      { id: 'missing-loading', title: 'Route without loading.tsx', severity: 'warning' },
      { id: 'missing-error', title: 'Route without error handling', severity: 'warning' },
      { id: 'missing-alt', title: 'Image without alt text', severity: 'warning', pattern: /<img[^>]+(?!alt=)/ },
      { id: 'empty-handler', title: 'Empty click handler', severity: 'warning', pattern: /onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/ },
    ],
    patterns: [
      { id: 'wrong-import', title: 'Wrong type import path', severity: 'error', pattern: /from\s+['"]@\/types\// },
      { id: 'missing-use-client', title: 'Hook without use client', severity: 'error' },
      { id: 'wrong-table', title: 'Wrong database table name', severity: 'error' },
    ],
  },

  // ============================================================
  // PRODUCTION READINESS CHECKLIST
  // ============================================================
  
  productionChecklist: {
    security: [
      'No hardcoded secrets or API keys',
      'No exposed passwords',
      'Auth checks on all protected routes',
      'RLS policies in Supabase',
    ],
    codeQuality: [
      'No console.log statements',
      'No TODO/FIXME comments',
      'No TypeScript any types',
      'All imports correct',
    ],
    ux: [
      'All routes have loading.tsx',
      'All routes have error.tsx',
      'All pages have metadata for SEO',
      'All images have alt text',
      'All forms have validation',
      'All buttons have loading states',
    ],
    performance: [
      'Images optimized (next/image)',
      'Code splitting working',
      'No large bundle sizes',
      'Database queries optimized',
    ],
    accessibility: [
      'All interactive elements keyboard accessible',
      'Focus states visible',
      'Color contrast adequate',
      'Screen reader friendly',
    ],
  },

  // ============================================================
  // FIX TEMPLATES
  // ============================================================
  
  fixTemplates: {
    addLoadingState: `// loading.tsx
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    </div>
  );
}`,
    
    addErrorBoundary: `'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <h2 className="text-xl font-semibold text-slate-900">Something went wrong</h2>
      <p className="text-slate-600">Please try again</p>
      <button onClick={reset} className="btn-primary">Try again</button>
    </div>
  );
}`,

    addMetadata: `import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page Title | Helm Sports',
  description: 'Page description for SEO',
};`,

    fixTypeImport: `// Change from:
import { Player } from '@/types/database';
// To:
import type { Player } from '@/lib/types';`,

    addUseClient: `// Add at the very top of the file:
'use client';`,
  },
};

// Export helper function to get knowledge by category
export function getKnowledge(category) {
  return HelmProjectKnowledge[category] || null;
}

// Export validation functions
export function isValidTableName(name) {
  return Object.keys(HelmProjectKnowledge.database.tables).includes(name);
}

export function isValidPipelineStage(stage) {
  return HelmProjectKnowledge.database.enums.pipeline_stage.includes(stage);
}

export function isValidSpacing(value) {
  return HelmProjectKnowledge.designSystem.spacing.scale.includes(value);
}

export function getFixTemplate(templateName) {
  return HelmProjectKnowledge.fixTemplates[templateName] || null;
}

export default HelmProjectKnowledge;
