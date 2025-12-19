// Profile customization types

export interface PlayerPrivacySettings {
  // Basic Information
  show_full_name?: boolean;
  show_location?: boolean;
  show_school?: boolean;
  show_contact_email?: boolean;
  show_phone?: boolean;
  show_social_links?: boolean;

  // Physical & Baseball
  show_height_weight?: boolean;
  show_position?: boolean;
  show_grad_year?: boolean;
  show_bats_throws?: boolean;

  // Recruiting Features
  show_in_discover?: boolean;
  show_videos?: boolean;
  show_dream_schools?: boolean;
  show_calendar?: boolean;
  show_stats?: boolean;

  // Academics
  show_gpa?: boolean;
  show_test_scores?: boolean;

  // Privacy
  allow_messages?: boolean;
  notify_on_interest?: boolean;
}

export interface OrganizationSettings {
  // Program Info
  show_description?: boolean;
  show_program_stats?: boolean;
  show_conference_info?: boolean;
  show_facilities?: boolean;
  show_commitments?: boolean;

  // Staff Display
  show_staff_bios?: boolean;
  show_staff_photos?: boolean;
  show_recruiting_indicators?: boolean;

  // Contact & Features
  show_email?: boolean;
  show_phone?: boolean;
  show_social_links?: boolean;
  show_camps?: boolean;
  show_calendar?: boolean;
  allow_player_messages?: boolean;
}

export interface DreamSchool {
  id: string;
  player_id: string;
  college_program_id: string;
  rank: number;
  created_at: string;
  college_program?: {
    id: string;
    name: string;
    division?: string;
    logo_url?: string;
  };
}

export interface StaffMember {
  id: string;
  organization_id: string;
  coach_id?: string;
  name: string;
  title: string;
  bio?: string;
  headshot_url?: string;
  email?: string;
  phone?: string;
  display_order: number;
  is_public: boolean;
  has_recruiting_profile?: boolean;
}

export interface OrganizationFacility {
  id: string;
  organization_id: string;
  name: string;
  facility_type?: 'stadium' | 'indoor' | 'weight_room' | 'locker_room';
  description?: string;
  capacity?: string;
  image_url?: string;
  display_order: number;
}

export interface PracticePlan {
  id: string;
  team_id: string;
  created_by: string;
  title: string;
  description?: string;
  duration_minutes?: number;
  activities: PracticePlanActivity[];
  is_template: boolean;
  created_at: string;
  updated_at: string;
}

export interface PracticePlanActivity {
  name: string;
  duration: number;
  description?: string;
}

export interface ProgramCommitment {
  id: string;
  organization_id: string;
  player_id?: string;
  player_name: string;
  position?: string;
  grad_year?: number;
  high_school?: string;
  city?: string;
  state?: string;
  commitment_date?: string;
  is_signed: boolean;
  signed_date?: string;
  is_public: boolean;
}

export interface PlayerStats {
  id: string;
  player_id: string;
  source?: string; // 'PBR', 'Perfect Game', 'self', 'coach'
  verified: boolean;
  verified_at?: string;
  season?: string;

  // Pitching Stats
  fb_velo_low?: number;
  fb_velo_high?: number;
  fb_velo_avg?: number;
  breaking_velo?: number;
  changeup_velo?: number;
  era?: number;
  wins?: number;
  losses?: number;
  saves?: number;
  innings_pitched?: number;
  strikeouts?: number;
  walks?: number;
  whip?: number;

  // Hitting Stats
  batting_avg?: number;
  on_base_pct?: number;
  slugging_pct?: number;
  home_runs?: number;
  rbis?: number;
  stolen_bases?: number;
  hits?: number;
  at_bats?: number;

  // Running/Athletic
  sixty_yard?: number;
  ten_yard_split?: number;

  // Fielding
  pop_time?: number;
  inf_velo?: number;
  of_velo?: number;

  created_at: string;
  updated_at: string;
}
