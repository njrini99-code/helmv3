// types/profile.ts
// Types for profile customization and privacy settings

export interface PlayerPrivacySettings {
  // Basic Info
  show_full_name: boolean;
  show_location: boolean;
  show_school: boolean;
  show_contact_email: boolean;
  show_phone: boolean;
  show_social_links: boolean;
  
  // Physical & Baseball
  show_height_weight: boolean;
  show_position: boolean;
  show_grad_year: boolean;
  show_bats_throws: boolean;
  
  // Recruiting Features
  show_videos: boolean;
  show_dream_schools: boolean;
  show_calendar: boolean;
  show_stats: boolean;
  show_gpa: boolean;
  show_test_scores: boolean;
  
  // Privacy
  allow_messages: boolean;
  show_in_discover: boolean;
  is_discoverable: boolean;
  notify_on_interest: boolean;
  notify_on_message: boolean;
}

export interface OrganizationSettings {
  // Program Info Visibility
  show_description: boolean;
  show_program_stats: boolean;
  show_conference_info: boolean;
  show_facilities: boolean;
  show_commitments: boolean;
  
  // Staff Visibility
  show_staff_bios: boolean;
  show_staff_photos: boolean;
  show_recruiting_indicators: boolean;
  
  // Contact Visibility
  show_email: boolean;
  show_phone: boolean;
  show_social_links: boolean;
  
  // Features
  show_camps: boolean;
  show_calendar: boolean;
  allow_player_messages: boolean;
}

export interface StaffMember {
  id: string;
  organization_id: string;
  coach_id: string | null;
  name: string;
  title: string;
  bio: string | null;
  headshot_url: string | null;
  email: string | null;
  phone: string | null;
  display_order: number;
  is_public: boolean;
  has_recruiting_profile?: boolean; // Computed from coach_id
}

export interface Facility {
  id: string;
  organization_id: string;
  name: string;
  facility_type: 'stadium' | 'indoor' | 'weight_room' | 'locker_room' | 'other';
  description: string | null;
  capacity: string | null;
  image_url: string | null;
  display_order: number;
}

export interface DreamSchool {
  id: string;
  player_id: string;
  college_program_id: string;
  rank: number;
  program?: {
    id: string;
    name: string;
    logo_url: string | null;
    division: string;
    state: string;
  };
}

export interface PlayerStats {
  id: string;
  player_id: string;
  source: 'PBR' | 'Perfect Game' | 'self' | 'coach';
  verified: boolean;
  season: string | null;
  
  // Pitching
  fb_velo_low: number | null;
  fb_velo_high: number | null;
  fb_velo_avg: number | null;
  era: number | null;
  strikeouts: number | null;
  innings_pitched: number | null;
  
  // Hitting
  batting_avg: number | null;
  home_runs: number | null;
  rbis: number | null;
  stolen_bases: number | null;
  
  // Athletic
  sixty_yard: number | null;
  pop_time: number | null;
  inf_velo: number | null;
  of_velo: number | null;
}

export interface PracticePlan {
  id: string;
  team_id: string;
  created_by: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  activities: PracticePlanActivity[];
  is_template: boolean;
  created_at: string;
}

export interface PracticePlanActivity {
  name: string;
  duration: number; // minutes
  description: string;
  equipment?: string[];
}

export interface Commitment {
  id: string;
  organization_id: string;
  player_id: string | null;
  player_name: string;
  position: string | null;
  grad_year: number | null;
  high_school: string | null;
  city: string | null;
  state: string | null;
  commitment_date: string | null;
  is_signed: boolean;
  is_public: boolean;
}

// Public profile data structure (filtered based on privacy settings)
export interface PublicPlayerProfile {
  id: string;
  name: string | null; // null if show_full_name is false
  first_name: string;
  avatar_url: string | null;
  
  // Location (if allowed)
  city: string | null;
  state: string | null;
  
  // School (if allowed)
  high_school: string | null;
  club_team: string | null;
  
  // Contact (if allowed)
  email: string | null;
  phone: string | null;
  twitter_handle: string | null;
  instagram_handle: string | null;
  
  // Physical (if allowed)
  height_inches: number | null;
  weight_lbs: number | null;
  
  // Baseball (if allowed)
  primary_position: string | null;
  secondary_position: string | null;
  bats: string | null;
  throws: string | null;
  grad_year: number | null;
  
  // Academics (if allowed)
  gpa: number | null;
  sat_score: number | null;
  act_score: number | null;
  
  // Recruiting
  recruiting_activated: boolean;
  
  // Computed/Related
  videos: PlayerVideo[] | null;
  dream_schools: DreamSchool[] | null;
  stats: PlayerStats[] | null;
  upcoming_events: CalendarEvent[] | null;
}

export interface PlayerVideo {
  id: string;
  title: string;
  video_url: string;
  thumbnail_url: string | null;
  video_type: string;
  duration_seconds: number | null;
  views: number;
  is_primary: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  event_category: 'practice' | 'game' | 'camp' | 'visit' | 'showcase' | 'other';
  is_public: boolean;
}

export interface PublicProgramProfile {
  id: string;
  name: string;
  university_name: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  division: string | null;
  conference: string | null;
  city: string | null;
  state: string | null;
  
  // About (if allowed)
  description: string | null;
  founded_year: number | null;
  website_url: string | null;
  
  // Contact (if allowed)
  email: string | null;
  phone: string | null;
  twitter_handle: string | null;
  instagram_handle: string | null;
  
  // Related data (filtered by settings)
  staff: StaffMember[] | null;
  facilities: Facility[] | null;
  camps: Camp[] | null;
  commitments: Commitment[] | null;
  upcoming_events: CalendarEvent[] | null;
}

export interface Camp {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  location: string | null;
  price_cents: number | null;
  capacity: number | null;
  registered_count: number;
}

// Team profile (for HS, JUCO, Showcase teams)
export interface PublicTeamProfile {
  id: string;
  name: string;
  organization_name: string;
  team_type: 'high_school' | 'juco' | 'showcase' | 'club';
  city: string | null;
  state: string | null;
  logo_url: string | null;
  
  // Staff
  staff: StaffMember[];
  
  // Roster (public players only)
  roster: PublicRosterPlayer[];
}

export interface PublicRosterPlayer {
  id: string;
  name: string;
  position: string | null;
  grad_year: number | null;
  jersey_number: string | null;
  has_recruiting_profile: boolean; // If they have recruiting_activated
}
