// Extended player types for card display
import type { Player } from './index';

// ============================================
// BASEBALL PLAYER TYPES
// ============================================

export interface BaseballStats {
  // Pitching stats
  fastball_velo?: number;
  era?: number;
  whip?: number;
  k_per_9?: number;

  // Hitting stats
  batting_avg?: number;
  home_runs?: number;
  rbi?: number;
  stolen_bases?: number;

  // Fielding stats
  fielding_pct?: number;
  pop_time?: number;
  sixty_time?: number;
}

export type BaseballPlayer = Player & {
  // Stats
  stats?: BaseballStats;

  // Commitment
  commitment_status?: 'committed' | 'interested' | 'uncommitted';
  committed_school?: string;
};

// ============================================
// GOLF PLAYER TYPES
// ============================================

export interface GolfStats {
  avg_score?: number;
  fairways_hit_pct?: number; // decimal 0-1
  gir_pct?: number; // greens in regulation, decimal 0-1
  avg_putts?: number;
  driving_distance?: number;
  scrambling_pct?: number; // decimal 0-1
}

export interface GolfRound {
  score: number;
  par: number;
  date?: string;
}

export type GolfPlayer = Player & {
  // Additional fields
  academic_year?: string; // Freshman, Sophomore, Junior, Senior
  team_name?: string;
  hometown?: string;

  // Handicap
  handicap?: number;
  handicap_change?: number; // Change this month

  // Stats
  stats?: GolfStats;

  // Recent performance
  recent_rounds?: GolfRound[];
};

// ============================================
// RECRUITING TYPES
// ============================================

import type { PipelineStage } from './index';

export type Recruit = Player & {
  // Pipeline
  pipeline_stage: PipelineStage;

  // Metadata
  notes?: string;
  last_contact?: string;
};

// ============================================
// CARD PROPS TYPES
// ============================================

export type CardVariant = 'full' | 'standard' | 'compact' | 'mini';

export interface BaseCardProps {
  variant?: CardVariant;
  selected?: boolean;
  onSelect?: () => void;
  onView?: () => void;
  onMessage?: () => void;
  onCompare?: () => void;
  showActions?: boolean;
  className?: string;
}
