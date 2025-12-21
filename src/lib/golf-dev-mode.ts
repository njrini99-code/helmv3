// Golf Dev Mode Configuration
// Enables quick access to golf dashboards without authentication

import type { GolfCoach, GolfPlayer, GolfTeam, GolfOrganization } from '@/lib/types/golf';

export const GOLF_DEV_MODE = true; // Set to false in production

// Mock organization and team for dev mode
const DEV_GOLF_ORGANIZATION: GolfOrganization = {
  id: 'dev-golf-org-1',
  name: 'State University',
  division: 'D1',
  conference: 'Big 12',
  city: 'Austin',
  state: 'TX',
  logo_url: undefined,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const DEV_GOLF_TEAM: GolfTeam = {
  id: 'dev-golf-team-1',
  organization_id: 'dev-golf-org-1',
  name: "Men's Golf",
  season: '2024-25',
  invite_code: 'DEVGOLF123',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  organization: DEV_GOLF_ORGANIZATION,
};

export const GOLF_DEV_ACCOUNTS = {
  'golf-coach': {
    id: 'dev-golf-coach-1',
    email: 'coach@golf.dev',
    role: 'coach' as const,
    coachProfile: {
      id: 'dev-golf-coach-profile-1',
      user_id: 'dev-golf-coach-1',
      team_id: 'dev-golf-team-1',
      organization_id: 'dev-golf-org-1',
      full_name: 'Coach Thompson',
      email: 'coach@golf.dev',
      phone: '555-0301',
      title: 'Head Coach',
      avatar_url: undefined,
      onboarding_completed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      team: DEV_GOLF_TEAM,
      organization: DEV_GOLF_ORGANIZATION,
    } as GolfCoach,
  },
  'golf-player-1': {
    id: 'dev-golf-player-1',
    email: 'player1@golf.dev',
    role: 'player' as const,
    playerProfile: {
      id: 'dev-golf-player-profile-1',
      user_id: 'dev-golf-player-1',
      team_id: 'dev-golf-team-1',
      first_name: 'Jake',
      last_name: 'Wilson',
      email: 'player1@golf.dev',
      phone: '555-0401',
      avatar_url: undefined,
      year: 'junior' as const,
      graduation_year: 2026,
      major: 'Business Administration',
      hometown: 'Dallas',
      state: 'TX',
      handicap: 2.4,
      scholarship_percentage: 75,
      gpa: 3.5,
      status: 'active' as const,
      onboarding_completed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      team: DEV_GOLF_TEAM,
    } as GolfPlayer,
  },
  'golf-player-2': {
    id: 'dev-golf-player-2',
    email: 'player2@golf.dev',
    role: 'player' as const,
    playerProfile: {
      id: 'dev-golf-player-profile-2',
      user_id: 'dev-golf-player-2',
      team_id: 'dev-golf-team-1',
      first_name: 'Marcus',
      last_name: 'Chen',
      email: 'player2@golf.dev',
      phone: '555-0402',
      avatar_url: undefined,
      year: 'sophomore' as const,
      graduation_year: 2027,
      major: 'Kinesiology',
      hometown: 'San Antonio',
      state: 'TX',
      handicap: 1.8,
      scholarship_percentage: 100,
      gpa: 3.7,
      status: 'active' as const,
      onboarding_completed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      team: DEV_GOLF_TEAM,
    } as GolfPlayer,
  },
  'golf-player-3': {
    id: 'dev-golf-player-3',
    email: 'player3@golf.dev',
    role: 'player' as const,
    playerProfile: {
      id: 'dev-golf-player-profile-3',
      user_id: 'dev-golf-player-3',
      team_id: 'dev-golf-team-1',
      first_name: 'Ryan',
      last_name: 'Garcia',
      email: 'player3@golf.dev',
      phone: '555-0403',
      avatar_url: undefined,
      year: 'freshman' as const,
      graduation_year: 2028,
      major: 'Undeclared',
      hometown: 'Houston',
      state: 'TX',
      handicap: 3.2,
      scholarship_percentage: 50,
      gpa: 3.3,
      status: 'active' as const,
      onboarding_completed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      team: DEV_GOLF_TEAM,
    } as GolfPlayer,
  },
};

export type GolfDevAccountType = keyof typeof GOLF_DEV_ACCOUNTS;

export function getGolfDevAccount(type: GolfDevAccountType) {
  return GOLF_DEV_ACCOUNTS[type];
}

export function isGolfDevMode() {
  return GOLF_DEV_MODE && process.env.NODE_ENV === 'development';
}

// Mock roster data for dev mode
export const DEV_GOLF_ROSTER: GolfPlayer[] = [
  GOLF_DEV_ACCOUNTS['golf-player-1'].playerProfile,
  GOLF_DEV_ACCOUNTS['golf-player-2'].playerProfile,
  GOLF_DEV_ACCOUNTS['golf-player-3'].playerProfile,
  {
    id: 'dev-golf-player-profile-4',
    user_id: 'dev-golf-player-4',
    team_id: 'dev-golf-team-1',
    first_name: 'Tyler',
    last_name: 'Johnson',
    email: 'player4@golf.dev',
    phone: '555-0404',
    avatar_url: undefined,
    year: 'senior' as const,
    graduation_year: 2025,
    major: 'Finance',
    hometown: 'Fort Worth',
    state: 'TX',
    handicap: 0.8,
    scholarship_percentage: 100,
    gpa: 3.6,
    status: 'active' as const,
    onboarding_completed: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    team: DEV_GOLF_TEAM,
  },
  {
    id: 'dev-golf-player-profile-5',
    user_id: 'dev-golf-player-5',
    team_id: 'dev-golf-team-1',
    first_name: 'David',
    last_name: 'Kim',
    email: 'player5@golf.dev',
    phone: '555-0405',
    avatar_url: undefined,
    year: 'junior' as const,
    graduation_year: 2026,
    major: 'Economics',
    hometown: 'Plano',
    state: 'TX',
    handicap: 2.1,
    scholarship_percentage: 60,
    gpa: 3.4,
    status: 'active' as const,
    onboarding_completed: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    team: DEV_GOLF_TEAM,
  },
];

// Helper to get date string (slice(0, 10) returns YYYY-MM-DD)
const getDateString = (daysAgo: number): string => {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

// Mock recent rounds for dev mode
export const DEV_GOLF_RECENT_ROUNDS: Array<{
  id: string;
  player_id: string;
  player_name: string;
  course_name: string;
  round_date: string;
  total_score: number;
  total_to_par: number;
  round_type: 'practice' | 'qualifier' | 'tournament' | 'casual';
}> = [
  {
    id: 'dev-round-1',
    player_id: 'dev-golf-player-profile-1',
    player_name: 'Jake Wilson',
    course_name: 'Austin Country Club',
    round_date: getDateString(1),
    total_score: 72,
    total_to_par: 0,
    round_type: 'practice',
  },
  {
    id: 'dev-round-2',
    player_id: 'dev-golf-player-profile-2',
    player_name: 'Marcus Chen',
    course_name: 'University Golf Club',
    round_date: getDateString(2),
    total_score: 70,
    total_to_par: -2,
    round_type: 'qualifier',
  },
  {
    id: 'dev-round-3',
    player_id: 'dev-golf-player-profile-4',
    player_name: 'Tyler Johnson',
    course_name: 'Austin Country Club',
    round_date: getDateString(3),
    total_score: 69,
    total_to_par: -3,
    round_type: 'tournament',
  },
];
