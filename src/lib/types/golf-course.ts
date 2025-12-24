// ============================================================================
// Golf Course Types
// ============================================================================

export interface GolfCourse {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  course_rating: number | null;
  slope_rating: number | null;
  default_tee_name: string | null;
  default_tee_color: string | null;
  total_yardage: number | null;
  total_par: number | null;
  created_by: string | null;
  is_public: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface GolfCourseHole {
  id: string;
  course_id: string;
  hole_number: number;
  par: number;
  yardage: number;
  handicap_index: number | null;
}

export interface HoleConfig {
  holeNumber: number;
  par: number;
  yardage: number;
}

export interface CourseSetupData {
  name: string;
  city: string | null;
  state: string | null;
  courseRating: number | null;
  slopeRating: number | null;
  teeName: string | null;
  holes: HoleConfig[];
}
