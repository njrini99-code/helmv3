export type UserRole = 'player' | 'coach' | 'admin';
export type CoachType = 'college' | 'high_school' | 'juco' | 'showcase';
export type PlayerType = 'high_school' | 'showcase' | 'juco' | 'college';
export type PipelineStage = 'watchlist' | 'high_priority' | 'contacted' | 'campus_visit' | 'offer_extended' | 'committed' | 'uninterested';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  created_at: string | null;
  updated_at?: string | null;
}

export interface Coach {
  id: string;
  user_id: string;
  coach_type: CoachType;
  full_name: string | null;
  email_contact: string | null;
  phone: string | null;
  avatar_url: string | null;
  coach_title: string | null;
  college_id: string | null;
  school_name: string | null;
  school_city: string | null;
  school_state: string | null;
  program_division: string | null;
  conference: string | null;
  athletic_conference: string | null;
  about: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
  program_philosophy: string | null;
  program_values: string | null;
  what_we_look_for: string | null;
  recruiting_class_needs: string[] | null;
  organization_id: string | null;
  organization_name: string | null;
  onboarding_completed: boolean | null;
  onboarding_step: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Player {
  id: string;
  user_id: string | null;
  player_type: PlayerType;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  city: string | null;
  state: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
  bats: string | null;
  throws: string | null;
  height_feet: number | null;
  height_inches: number | null;
  weight_lbs: number | null;
  high_school_name: string | null;
  high_school_id: string | null;
  high_school_org_id: string | null;
  club_team: string | null;
  showcase_team_name: string | null;
  showcase_org_id: string | null;
  college_org_id: string | null;
  pitch_velo: number | null;
  exit_velo: number | null;
  sixty_time: number | null;
  pop_time: number | null;
  gpa: number | null;
  sat_score: number | null;
  act_score: number | null;
  instagram: string | null;
  twitter: string | null;
  about_me: string | null;
  primary_goal: string | null;
  top_schools: string[] | null;
  has_video: boolean | null;
  recruiting_activated: boolean | null;
  recruiting_activated_at: string | null;
  committed_to: string | null;
  committed_to_org_id: string | null;
  commitment_date: string | null;
  verified_metrics: boolean | null;
  onboarding_completed: boolean | null;
  onboarding_step: number | null;
  profile_completion_percent: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface College {
  id: string;
  name: string;
  division: string | null;
  conference: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  website: string | null;
  head_coach: string | null;
  email: string | null;
  phone: string | null;
}

export interface Watchlist {
  id: string;
  coach_id: string;
  player_id: string;
  pipeline_stage: PipelineStage;
  notes: string | null;
  priority: number | null;
  tags: string[] | null;
  last_contact: string | null;
  added_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  player?: Player;
}

export interface Video {
  id: string;
  player_id: string;
  title: string;
  description: string | null;
  video_type: string | null;
  url: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  view_count: number | null;
  is_primary: boolean | null;
  created_at: string | null;
}

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  participants?: ConversationParticipant[];
  messages?: Message[];
  other_user?: User & { coach?: Coach; player?: Player };
  last_message?: Message;
  unread_count?: number;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  last_read_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read: boolean;
  sent_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  read: boolean;
  created_at: string;
}

export interface ProfileView {
  id: string;
  player_id: string;
  viewer_id: string | null;
  viewer_type: string | null;
  created_at: string;
}

