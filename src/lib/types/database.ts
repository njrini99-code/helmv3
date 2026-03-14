export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      _deprecated_baseball_academics: {
        Row: {
          created_at: string | null
          credits_attempted: number | null
          credits_earned: number | null
          eligibility_status: string | null
          gpa: number | null
          id: string
          notes: string | null
          player_id: string
          team_id: string | null
          term: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credits_attempted?: number | null
          credits_earned?: number | null
          eligibility_status?: string | null
          gpa?: number | null
          id?: string
          notes?: string | null
          player_id: string
          team_id?: string | null
          term?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credits_attempted?: number | null
          credits_earned?: number | null
          eligibility_status?: string | null
          gpa?: number | null
          id?: string
          notes?: string | null
          player_id?: string
          team_id?: string | null
          term?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_academics_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_academics_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_baseball_announcement_documents: {
        Row: {
          announcement_id: string
          document_id: string
          id: string
        }
        Insert: {
          announcement_id: string
          document_id: string
          id?: string
        }
        Update: {
          announcement_id?: string
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_announcement_documents_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "baseball_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_announcement_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "baseball_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_baseball_announcement_tasks: {
        Row: {
          announcement_id: string
          id: string
          task_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          task_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_announcement_tasks_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "baseball_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_announcement_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "baseball_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_baseball_coach_settings: {
        Row: {
          coach_id: string
          created_at: string | null
          default_view: string | null
          email_notifications: boolean | null
          id: string
          notify_messages: boolean | null
          notify_profile_views: boolean | null
          notify_team_activity: boolean | null
          push_notifications: boolean | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          default_view?: string | null
          email_notifications?: boolean | null
          id?: string
          notify_messages?: boolean | null
          notify_profile_views?: boolean | null
          notify_team_activity?: boolean | null
          push_notifications?: boolean | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          default_view?: string | null
          email_notifications?: boolean | null
          id?: string
          notify_messages?: boolean | null
          notify_profile_views?: boolean | null
          notify_team_activity?: boolean | null
          push_notifications?: boolean | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_coach_settings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_baseball_dream_schools: {
        Row: {
          created_at: string | null
          display_on_profile: boolean | null
          id: string
          organization_id: string
          player_id: string
          rank: number
        }
        Insert: {
          created_at?: string | null
          display_on_profile?: boolean | null
          id?: string
          organization_id: string
          player_id: string
          rank: number
        }
        Update: {
          created_at?: string | null
          display_on_profile?: boolean | null
          id?: string
          organization_id?: string
          player_id?: string
          rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "baseball_dream_schools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_dream_schools_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_feature_flags: {
        Row: {
          allowed_roles: Json | null
          allowed_users: Json | null
          created_at: string | null
          description: string | null
          flag_key: string
          flag_name: string
          id: string
          is_enabled: boolean | null
          metadata: Json | null
          rollout_percentage: number | null
          updated_at: string | null
        }
        Insert: {
          allowed_roles?: Json | null
          allowed_users?: Json | null
          created_at?: string | null
          description?: string | null
          flag_key: string
          flag_name: string
          id?: string
          is_enabled?: boolean | null
          metadata?: Json | null
          rollout_percentage?: number | null
          updated_at?: string | null
        }
        Update: {
          allowed_roles?: Json | null
          allowed_users?: Json | null
          created_at?: string | null
          description?: string | null
          flag_key?: string
          flag_name?: string
          id?: string
          is_enabled?: boolean | null
          metadata?: Json | null
          rollout_percentage?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      _deprecated_golf_availability_polls: {
        Row: {
          created_at: string | null
          created_by: string
          date_options: Json
          deadline: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          status: string | null
          team_id: string
          time_options: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          date_options?: Json
          deadline?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          status?: string | null
          team_id: string
          time_options?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          date_options?: Json
          deadline?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          status?: string | null
          team_id?: string
          time_options?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_availability_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_availability_polls_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_calendar_sync_log: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          events_created: number | null
          events_deleted: number | null
          events_synced: number | null
          events_updated: number | null
          id: string
          started_at: string | null
          status: string
          sync_state_id: string | null
          sync_type: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          events_created?: number | null
          events_deleted?: number | null
          events_synced?: number | null
          events_updated?: number | null
          id?: string
          started_at?: string | null
          status: string
          sync_state_id?: string | null
          sync_type: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          events_created?: number | null
          events_deleted?: number | null
          events_synced?: number | null
          events_updated?: number | null
          id?: string
          started_at?: string | null
          status?: string
          sync_state_id?: string | null
          sync_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_calendar_sync_log_sync_state_id_fkey"
            columns: ["sync_state_id"]
            isOneToOne: false
            referencedRelation: "_deprecated_golf_calendar_sync_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_calendar_sync_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_calendar_sync_state: {
        Row: {
          created_at: string | null
          external_calendar_id: string | null
          id: string
          last_sync_at: string | null
          provider: string
          sync_direction: string | null
          sync_enabled: boolean | null
          sync_token: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          external_calendar_id?: string | null
          id?: string
          last_sync_at?: string | null
          provider: string
          sync_direction?: string | null
          sync_enabled?: boolean | null
          sync_token?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          external_calendar_id?: string | null
          id?: string
          last_sync_at?: string | null
          provider?: string
          sync_direction?: string | null
          sync_enabled?: boolean | null
          sync_token?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_calendar_sync_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_coach_settings: {
        Row: {
          coach_id: string
          created_at: string | null
          default_view: string | null
          email_notifications: boolean | null
          id: string
          notify_messages: boolean | null
          notify_round_completed: boolean | null
          notify_team_activity: boolean | null
          push_notifications: boolean | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          default_view?: string | null
          email_notifications?: boolean | null
          id?: string
          notify_messages?: boolean | null
          notify_round_completed?: boolean | null
          notify_team_activity?: boolean | null
          push_notifications?: boolean | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          default_view?: string | null
          email_notifications?: boolean | null
          id?: string
          notify_messages?: boolean | null
          notify_round_completed?: boolean | null
          notify_team_activity?: boolean | null
          push_notifications?: boolean | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_coach_settings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_event_exclusions: {
        Row: {
          created_at: string | null
          event_id: string
          excluded_by: string | null
          id: string
          player_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          excluded_by?: string | null
          id?: string
          player_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          excluded_by?: string | null
          id?: string
          player_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_event_exclusions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_event_exclusions_excluded_by_fkey"
            columns: ["excluded_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_event_exclusions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_event_status_log: {
        Row: {
          change_reason: string | null
          changed_at: string | null
          changed_by: string | null
          event_id: string
          id: string
          new_status: string
          old_status: string | null
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string | null
          changed_by?: string | null
          event_id: string
          id?: string
          new_status: string
          old_status?: string | null
        }
        Update: {
          change_reason?: string | null
          changed_at?: string | null
          changed_by?: string | null
          event_id?: string
          id?: string
          new_status?: string
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_event_status_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_event_status_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_external_calendars: {
        Row: {
          calendar_name: string | null
          created_at: string | null
          id: string
          is_synced: boolean | null
          player_id: string
          provider: string
          provider_calendar_id: string | null
          sync_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          calendar_name?: string | null
          created_at?: string | null
          id?: string
          is_synced?: boolean | null
          player_id: string
          provider: string
          provider_calendar_id?: string | null
          sync_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          calendar_name?: string | null
          created_at?: string | null
          id?: string
          is_synced?: boolean | null
          player_id?: string
          provider?: string
          provider_calendar_id?: string | null
          sync_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_external_calendars_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_insight_feedback: {
        Row: {
          accuracy: string
          actual_assessment: string | null
          coach_id: string
          created_at: string | null
          error_category: string | null
          feedback_text: string | null
          id: string
          insight_id: string
          insight_type: string
          metric_name: string | null
          predicted_value: number | null
          review_id: string
          was_overconfident: boolean | null
          was_underconfident: boolean | null
        }
        Insert: {
          accuracy: string
          actual_assessment?: string | null
          coach_id: string
          created_at?: string | null
          error_category?: string | null
          feedback_text?: string | null
          id?: string
          insight_id: string
          insight_type: string
          metric_name?: string | null
          predicted_value?: number | null
          review_id: string
          was_overconfident?: boolean | null
          was_underconfident?: boolean | null
        }
        Update: {
          accuracy?: string
          actual_assessment?: string | null
          coach_id?: string
          created_at?: string | null
          error_category?: string | null
          feedback_text?: string | null
          id?: string
          insight_id?: string
          insight_type?: string
          metric_name?: string | null
          predicted_value?: number | null
          review_id?: string
          was_overconfident?: boolean | null
          was_underconfident?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_insight_feedback_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_insight_feedback_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "golf_review_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_insight_feedback_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "golf_round_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_insight_weights: {
        Row: {
          accuracy_rate: number | null
          base_weight: number | null
          coach_adjustment: number | null
          coach_id: string | null
          id: string
          insight_type: string
          last_updated_at: string | null
          metric_name: string | null
          sample_size: number | null
          team_id: string | null
          threshold_multiplier: number | null
        }
        Insert: {
          accuracy_rate?: number | null
          base_weight?: number | null
          coach_adjustment?: number | null
          coach_id?: string | null
          id?: string
          insight_type: string
          last_updated_at?: string | null
          metric_name?: string | null
          sample_size?: number | null
          team_id?: string | null
          threshold_multiplier?: number | null
        }
        Update: {
          accuracy_rate?: number | null
          base_weight?: number | null
          coach_adjustment?: number | null
          coach_id?: string | null
          id?: string
          insight_type?: string
          last_updated_at?: string | null
          metric_name?: string | null
          sample_size?: number | null
          team_id?: string | null
          threshold_multiplier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_insight_weights_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_insight_weights_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_player_availability_blocks: {
        Row: {
          created_at: string | null
          end_date: string
          end_time: string | null
          id: string
          is_recurring: boolean | null
          player_id: string
          reason: string | null
          recurrence_rule: string | null
          start_date: string
          start_time: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date: string
          end_time?: string | null
          id?: string
          is_recurring?: boolean | null
          player_id: string
          reason?: string | null
          recurrence_rule?: string | null
          start_date: string
          start_time?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string
          end_time?: string | null
          id?: string
          is_recurring?: boolean | null
          player_id?: string
          reason?: string | null
          recurrence_rule?: string | null
          start_date?: string
          start_time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_availability_blocks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_player_insight_preferences: {
        Row: {
          created_at: string | null
          enabled_insight_types: string[] | null
          id: string
          max_insights_per_week: number | null
          min_severity_level: string | null
          notify_improvement_detected: boolean | null
          notify_pattern_found: boolean | null
          notify_performance_decline: boolean | null
          notify_practice_suggestion: boolean | null
          player_id: string
          preferred_verbosity: string | null
          show_comparison_to_team: boolean | null
          show_strokes_impact: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          enabled_insight_types?: string[] | null
          id?: string
          max_insights_per_week?: number | null
          min_severity_level?: string | null
          notify_improvement_detected?: boolean | null
          notify_pattern_found?: boolean | null
          notify_performance_decline?: boolean | null
          notify_practice_suggestion?: boolean | null
          player_id: string
          preferred_verbosity?: string | null
          show_comparison_to_team?: boolean | null
          show_strokes_impact?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          enabled_insight_types?: string[] | null
          id?: string
          max_insights_per_week?: number | null
          min_severity_level?: string | null
          notify_improvement_detected?: boolean | null
          notify_pattern_found?: boolean | null
          notify_performance_decline?: boolean | null
          notify_practice_suggestion?: boolean | null
          player_id?: string
          preferred_verbosity?: string | null
          show_comparison_to_team?: boolean | null
          show_strokes_impact?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_insight_preferences_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_player_settings: {
        Row: {
          created_at: string | null
          default_tees: string | null
          email_notifications: boolean | null
          id: string
          notify_event_reminder: boolean | null
          notify_messages: boolean | null
          notify_task_assigned: boolean | null
          player_id: string
          push_notifications: boolean | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_tees?: string | null
          email_notifications?: boolean | null
          id?: string
          notify_event_reminder?: boolean | null
          notify_messages?: boolean | null
          notify_task_assigned?: boolean | null
          player_id: string
          push_notifications?: boolean | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_tees?: string | null
          email_notifications?: boolean | null
          id?: string
          notify_event_reminder?: boolean | null
          notify_messages?: boolean | null
          notify_task_assigned?: boolean | null
          player_id?: string
          push_notifications?: boolean | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_settings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_poll_responses: {
        Row: {
          created_at: string | null
          date_option: string
          id: string
          is_available: boolean
          notes: string | null
          player_id: string
          poll_id: string
          preference_level: number | null
          time_option: string | null
        }
        Insert: {
          created_at?: string | null
          date_option: string
          id?: string
          is_available: boolean
          notes?: string | null
          player_id: string
          poll_id: string
          preference_level?: number | null
          time_option?: string | null
        }
        Update: {
          created_at?: string | null
          date_option?: string
          id?: string
          is_available?: boolean
          notes?: string | null
          player_id?: string
          poll_id?: string
          preference_level?: number | null
          time_option?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_poll_responses_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_poll_responses_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "_deprecated_golf_availability_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_putting_tendencies: {
        Row: {
          avg_distance_on_makes_ft: number | null
          avg_distance_on_misses_ft: number | null
          created_at: string | null
          id: string
          last_calculated: string | null
          left_to_right_attempts: number | null
          left_to_right_made: number | null
          left_to_right_pct: number | null
          make_percentage_overall: number | null
          miss_left_percentage: number | null
          miss_long_percentage: number | null
          miss_right_percentage: number | null
          miss_short_percentage: number | null
          player_id: string
          right_to_left_attempts: number | null
          right_to_left_made: number | null
          right_to_left_pct: number | null
          rounds_in_sample: number | null
          short_putt_attempts: number | null
          short_putt_made: number | null
          short_putt_pct: number | null
          straight_attempts: number | null
          straight_made: number | null
          straight_pct: number | null
          total_putts_analyzed: number | null
          updated_at: string | null
        }
        Insert: {
          avg_distance_on_makes_ft?: number | null
          avg_distance_on_misses_ft?: number | null
          created_at?: string | null
          id?: string
          last_calculated?: string | null
          left_to_right_attempts?: number | null
          left_to_right_made?: number | null
          left_to_right_pct?: number | null
          make_percentage_overall?: number | null
          miss_left_percentage?: number | null
          miss_long_percentage?: number | null
          miss_right_percentage?: number | null
          miss_short_percentage?: number | null
          player_id: string
          right_to_left_attempts?: number | null
          right_to_left_made?: number | null
          right_to_left_pct?: number | null
          rounds_in_sample?: number | null
          short_putt_attempts?: number | null
          short_putt_made?: number | null
          short_putt_pct?: number | null
          straight_attempts?: number | null
          straight_made?: number | null
          straight_pct?: number | null
          total_putts_analyzed?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_distance_on_makes_ft?: number | null
          avg_distance_on_misses_ft?: number | null
          created_at?: string | null
          id?: string
          last_calculated?: string | null
          left_to_right_attempts?: number | null
          left_to_right_made?: number | null
          left_to_right_pct?: number | null
          make_percentage_overall?: number | null
          miss_left_percentage?: number | null
          miss_long_percentage?: number | null
          miss_right_percentage?: number | null
          miss_short_percentage?: number | null
          player_id?: string
          right_to_left_attempts?: number | null
          right_to_left_made?: number | null
          right_to_left_pct?: number | null
          rounds_in_sample?: number | null
          short_putt_attempts?: number | null
          short_putt_made?: number | null
          short_putt_pct?: number | null
          straight_attempts?: number | null
          straight_made?: number | null
          straight_pct?: number | null
          total_putts_analyzed?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_putting_tendencies_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_golf_travel_expense_splits: {
        Row: {
          amount: number
          created_at: string | null
          expense_id: string
          id: string
          paid: boolean | null
          paid_at: string | null
          player_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          expense_id: string
          id?: string
          paid?: boolean | null
          paid_at?: string | null
          player_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          expense_id?: string
          id?: string
          paid?: boolean | null
          paid_at?: string | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_travel_expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "golf_travel_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_travel_expense_splits_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_organization_settings: {
        Row: {
          allow_player_messages: boolean | null
          created_at: string | null
          id: string
          organization_id: string
          require_verified_email: boolean | null
          show_conference_info: boolean | null
          show_description: boolean | null
          show_email: boolean | null
          show_facilities: boolean | null
          show_phone: boolean | null
          show_program_stats: boolean | null
          show_recruiting_needs: boolean | null
          show_roster_spots: boolean | null
          show_social_links: boolean | null
          show_staff_bios: boolean | null
          updated_at: string | null
        }
        Insert: {
          allow_player_messages?: boolean | null
          created_at?: string | null
          id?: string
          organization_id: string
          require_verified_email?: boolean | null
          show_conference_info?: boolean | null
          show_description?: boolean | null
          show_email?: boolean | null
          show_facilities?: boolean | null
          show_phone?: boolean | null
          show_program_stats?: boolean | null
          show_recruiting_needs?: boolean | null
          show_roster_spots?: boolean | null
          show_social_links?: boolean | null
          show_staff_bios?: boolean | null
          updated_at?: string | null
        }
        Update: {
          allow_player_messages?: boolean | null
          created_at?: string | null
          id?: string
          organization_id?: string
          require_verified_email?: boolean | null
          show_conference_info?: boolean | null
          show_description?: boolean | null
          show_email?: boolean | null
          show_facilities?: boolean | null
          show_phone?: boolean | null
          show_program_stats?: boolean | null
          show_recruiting_needs?: boolean | null
          show_roster_spots?: boolean | null
          show_social_links?: boolean | null
          show_staff_bios?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_page_views: {
        Row: {
          created_at: string | null
          id: string
          path: string
          referrer: string | null
          sport: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          path: string
          referrer?: string | null
          sport?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          path?: string
          referrer?: string | null
          sport?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      _deprecated_player_dream_schools: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          organization_id: string
          player_id: string
          rank: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          player_id: string
          rank: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          player_id?: string
          rank?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_dream_schools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_dream_schools_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_analytics_events: {
        Row: {
          created_at: string
          duration_ms: number | null
          event_type: string
          feature_name: string | null
          id: string
          metadata: Json | null
          page_path: string | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          event_type: string
          feature_name?: string | null
          id?: string
          metadata?: Json | null
          page_path?: string | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          event_type?: string
          feature_name?: string | null
          id?: string
          metadata?: Json | null
          page_path?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_api_perf_log: {
        Row: {
          action_name: string
          created_at: string
          duration_ms: number
          error_message: string | null
          id: string
          metadata: Json | null
          status: string
          user_id: string | null
        }
        Insert: {
          action_name: string
          created_at?: string
          duration_ms: number
          error_message?: string | null
          id?: string
          metadata?: Json | null
          status: string
          user_id?: string | null
        }
        Update: {
          action_name?: string
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      admin_client_errors: {
        Row: {
          created_at: string
          error_message: string
          error_stack: string | null
          id: string
          metadata: Json | null
          page_url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message: string
          error_stack?: string | null
          id?: string
          metadata?: Json | null
          page_url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string
          error_stack?: string | null
          id?: string
          metadata?: Json | null
          page_url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_events: {
        Row: {
          browser_info: Json | null
          created_at: string | null
          event_type: string
          id: string
          message: string | null
          metadata: Json | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["admin_event_severity"]
          stack_trace: string | null
          title: string
          url: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          browser_info?: Json | null
          created_at?: string | null
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["admin_event_severity"]
          stack_trace?: string | null
          title: string
          url?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          browser_info?: Json | null
          created_at?: string | null
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["admin_event_severity"]
          stack_trace?: string | null
          title?: string
          url?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_events_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      api_call_logs: {
        Row: {
          avg_duration_ms: number | null
          error_count: number | null
          id: string
          method: string | null
          p50_ms: number | null
          p95_ms: number | null
          p99_ms: number | null
          recorded_at: string | null
          request_count: number | null
          route: string
        }
        Insert: {
          avg_duration_ms?: number | null
          error_count?: number | null
          id?: string
          method?: string | null
          p50_ms?: number | null
          p95_ms?: number | null
          p99_ms?: number | null
          recorded_at?: string | null
          request_count?: number | null
          route: string
        }
        Update: {
          avg_duration_ms?: number | null
          error_count?: number | null
          id?: string
          method?: string | null
          p50_ms?: number | null
          p95_ms?: number | null
          p99_ms?: number | null
          recorded_at?: string | null
          request_count?: number | null
          route?: string
        }
        Relationships: []
      }
      approach_miss_details: {
        Row: {
          created_at: string | null
          distance_from_green_yards: number | null
          id: string
          lie_type: string | null
          miss_direction: string | null
          shot_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          distance_from_green_yards?: number | null
          id?: string
          lie_type?: string | null
          miss_direction?: string | null
          shot_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          distance_from_green_yards?: number | null
          id?: string
          lie_type?: string | null
          miss_direction?: string | null
          shot_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approach_miss_details_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: true
            referencedRelation: "golf_shots"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_metrics_hourly: {
        Row: {
          active_sessions: number | null
          created_at: string | null
          failed_logins: number | null
          hour: string
          id: string
          new_sessions: number | null
          successful_logins: number | null
        }
        Insert: {
          active_sessions?: number | null
          created_at?: string | null
          failed_logins?: number | null
          hour: string
          id?: string
          new_sessions?: number | null
          successful_logins?: number | null
        }
        Update: {
          active_sessions?: number | null
          created_at?: string | null
          failed_logins?: number | null
          hour?: string
          id?: string
          new_sessions?: number | null
          successful_logins?: number | null
        }
        Relationships: []
      }
      background_job_logs: {
        Row: {
          completed_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          job_id: string | null
          job_type: string
          metadata: Json | null
          retry_count: number | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          job_type: string
          metadata?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          job_type?: string
          metadata?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      baseball_academic_eligibility: {
        Row: {
          academic_standing: string | null
          created_at: string | null
          credits_completed: number | null
          credits_required: number | null
          gpa: number | null
          id: string
          is_eligible: boolean | null
          notes: string | null
          player_id: string
          semester: string
          team_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          academic_standing?: string | null
          created_at?: string | null
          credits_completed?: number | null
          credits_required?: number | null
          gpa?: number | null
          id?: string
          is_eligible?: boolean | null
          notes?: string | null
          player_id: string
          semester: string
          team_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          academic_standing?: string | null
          created_at?: string | null
          credits_completed?: number | null
          credits_required?: number | null
          gpa?: number | null
          id?: string
          is_eligible?: boolean | null
          notes?: string | null
          player_id?: string
          semester?: string
          team_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_academic_eligibility_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_academic_eligibility_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_academic_eligibility_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_announcement_acknowledgements: {
        Row: {
          acknowledged_at: string | null
          announcement_id: string
          id: string
          player_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          announcement_id: string
          id?: string
          player_id: string
        }
        Update: {
          acknowledged_at?: string | null
          announcement_id?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_announcement_acknowledgements_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "baseball_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_announcement_acknowledgements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_announcement_recipients: {
        Row: {
          announcement_id: string
          id: string
          player_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          player_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_announcement_recipients_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "baseball_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_announcement_recipients_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_announcements: {
        Row: {
          content: string
          created_at: string | null
          created_by_id: string
          id: string
          is_pinned: boolean | null
          published_at: string | null
          team_id: string
          title: string
          updated_at: string | null
          urgency: string
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by_id: string
          id?: string
          is_pinned?: boolean | null
          published_at?: string | null
          team_id: string
          title: string
          updated_at?: string | null
          urgency?: string
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by_id?: string
          id?: string
          is_pinned?: boolean | null
          published_at?: string | null
          team_id?: string
          title?: string
          updated_at?: string | null
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_announcements_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_announcements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_box_score_batting: {
        Row: {
          ab: number
          avg: number | null
          batting_order: number | null
          bb: number
          created_at: string | null
          cs: number
          doubles: number
          game_id: string
          h: number
          hbp: number
          hr: number
          id: string
          k: number
          lob: number
          obp: number | null
          ops: number | null
          player_id: string
          r: number
          rbi: number
          sac: number
          sb: number
          sf: number
          slg: number | null
          team_id: string
          triples: number
        }
        Insert: {
          ab?: number
          avg?: number | null
          batting_order?: number | null
          bb?: number
          created_at?: string | null
          cs?: number
          doubles?: number
          game_id: string
          h?: number
          hbp?: number
          hr?: number
          id?: string
          k?: number
          lob?: number
          obp?: number | null
          ops?: number | null
          player_id: string
          r?: number
          rbi?: number
          sac?: number
          sb?: number
          sf?: number
          slg?: number | null
          team_id: string
          triples?: number
        }
        Update: {
          ab?: number
          avg?: number | null
          batting_order?: number | null
          bb?: number
          created_at?: string | null
          cs?: number
          doubles?: number
          game_id?: string
          h?: number
          hbp?: number
          hr?: number
          id?: string
          k?: number
          lob?: number
          obp?: number | null
          ops?: number | null
          player_id?: string
          r?: number
          rbi?: number
          sac?: number
          sb?: number
          sf?: number
          slg?: number | null
          team_id?: string
          triples?: number
        }
        Relationships: [
          {
            foreignKeyName: "baseball_box_score_batting_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_box_score_batting_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_box_score_batting_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_box_score_pitching: {
        Row: {
          bb: number
          bb9: number | null
          created_at: string | null
          er: number
          era: number | null
          game_id: string
          h: number
          hr: number
          id: string
          ip: number
          k: number
          k9: number | null
          pitch_count: number | null
          player_id: string
          r: number
          result: string | null
          strikes: number | null
          team_id: string
          whip: number | null
        }
        Insert: {
          bb?: number
          bb9?: number | null
          created_at?: string | null
          er?: number
          era?: number | null
          game_id: string
          h?: number
          hr?: number
          id?: string
          ip?: number
          k?: number
          k9?: number | null
          pitch_count?: number | null
          player_id: string
          r?: number
          result?: string | null
          strikes?: number | null
          team_id: string
          whip?: number | null
        }
        Update: {
          bb?: number
          bb9?: number | null
          created_at?: string | null
          er?: number
          era?: number | null
          game_id?: string
          h?: number
          hr?: number
          id?: string
          ip?: number
          k?: number
          k9?: number | null
          pitch_count?: number | null
          player_id?: string
          r?: number
          result?: string | null
          strikes?: number | null
          team_id?: string
          whip?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_box_score_pitching_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_box_score_pitching_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_box_score_pitching_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_box_score_uploads: {
        Row: {
          coach_id: string
          created_at: string | null
          error_message: string | null
          filename: string
          game_id: string | null
          id: string
          matched_players: Json | null
          parsed_data: Json | null
          raw_content: string | null
          status: string
          team_id: string
          unmatched_players: Json | null
          upload_type: string
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          error_message?: string | null
          filename: string
          game_id?: string | null
          id?: string
          matched_players?: Json | null
          parsed_data?: Json | null
          raw_content?: string | null
          status?: string
          team_id: string
          unmatched_players?: Json | null
          upload_type?: string
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          error_message?: string | null
          filename?: string
          game_id?: string | null
          id?: string
          matched_players?: Json | null
          parsed_data?: Json | null
          raw_content?: string | null
          status?: string
          team_id?: string
          unmatched_players?: Json | null
          upload_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_box_score_uploads_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_box_score_uploads_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_box_score_uploads_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_camp_registrations: {
        Row: {
          camp_id: string
          created_at: string | null
          id: string
          notes: string | null
          payment_status: string | null
          player_id: string
          status: string | null
        }
        Insert: {
          camp_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_status?: string | null
          player_id: string
          status?: string | null
        }
        Update: {
          camp_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_status?: string | null
          player_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_camp_registrations_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "baseball_camps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_camp_registrations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_camps: {
        Row: {
          capacity: number | null
          coach_id: string
          created_at: string | null
          description: string | null
          end_date: string
          id: string
          is_free: boolean | null
          location: string | null
          name: string
          organization_id: string | null
          price_cents: number | null
          registration_deadline: string | null
          start_date: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          capacity?: number | null
          coach_id: string
          created_at?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_free?: boolean | null
          location?: string | null
          name: string
          organization_id?: string | null
          price_cents?: number | null
          registration_deadline?: string | null
          start_date: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          capacity?: number | null
          coach_id?: string
          created_at?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_free?: boolean | null
          location?: string | null
          name?: string
          organization_id?: string | null
          price_cents?: number | null
          registration_deadline?: string | null
          start_date?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_camps_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_camps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_coach_insights: {
        Row: {
          body: string | null
          coach_id: string
          created_at: string | null
          id: string
          insight_type: string
          metadata: Json | null
          player_id: string | null
          priority: string | null
          resolved_at: string | null
          status: string | null
          team_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          coach_id: string
          created_at?: string | null
          id?: string
          insight_type: string
          metadata?: Json | null
          player_id?: string | null
          priority?: string | null
          resolved_at?: string | null
          status?: string | null
          team_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          coach_id?: string
          created_at?: string | null
          id?: string
          insight_type?: string
          metadata?: Json | null
          player_id?: string | null
          priority?: string | null
          resolved_at?: string | null
          status?: string | null
          team_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_coach_insights_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_coach_insights_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_coach_insights_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_coach_philosophy: {
        Row: {
          alert_sensitivity: string | null
          bubble_zone_range: number | null
          coach_id: string
          created_at: string | null
          decline_threshold: number | null
          id: string
          looking_for_defense: string | null
          looking_for_intangibles: string | null
          looking_for_offense: string | null
          pressure_gap_threshold: number | null
          priority_defense: number | null
          priority_hitting: number | null
          priority_plate_discipline: number | null
          priority_power: number | null
          priority_speed: number | null
          program_values: string | null
          updated_at: string | null
        }
        Insert: {
          alert_sensitivity?: string | null
          bubble_zone_range?: number | null
          coach_id: string
          created_at?: string | null
          decline_threshold?: number | null
          id?: string
          looking_for_defense?: string | null
          looking_for_intangibles?: string | null
          looking_for_offense?: string | null
          pressure_gap_threshold?: number | null
          priority_defense?: number | null
          priority_hitting?: number | null
          priority_plate_discipline?: number | null
          priority_power?: number | null
          priority_speed?: number | null
          program_values?: string | null
          updated_at?: string | null
        }
        Update: {
          alert_sensitivity?: string | null
          bubble_zone_range?: number | null
          coach_id?: string
          created_at?: string | null
          decline_threshold?: number | null
          id?: string
          looking_for_defense?: string | null
          looking_for_intangibles?: string | null
          looking_for_offense?: string | null
          pressure_gap_threshold?: number | null
          priority_defense?: number | null
          priority_hitting?: number | null
          priority_plate_discipline?: number | null
          priority_power?: number | null
          priority_speed?: number | null
          program_values?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_coach_philosophy_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_coach_recruiting_philosophy: {
        Row: {
          coach_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          max_distance_miles: number | null
          max_sixty_time: number | null
          min_exit_velocity: number | null
          min_gpa: number | null
          min_pitch_velocity: number | null
          position_priorities: Json | null
          preferred_states: Json | null
          target_grad_years: Json | null
          updated_at: string | null
          weight_arm_strength: number | null
          weight_exit_velocity: number | null
          weight_gpa: number | null
          weight_height: number | null
          weight_pitch_velocity: number | null
          weight_sixty_time: number | null
          weight_weight: number | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_distance_miles?: number | null
          max_sixty_time?: number | null
          min_exit_velocity?: number | null
          min_gpa?: number | null
          min_pitch_velocity?: number | null
          position_priorities?: Json | null
          preferred_states?: Json | null
          target_grad_years?: Json | null
          updated_at?: string | null
          weight_arm_strength?: number | null
          weight_exit_velocity?: number | null
          weight_gpa?: number | null
          weight_height?: number | null
          weight_pitch_velocity?: number | null
          weight_sixty_time?: number | null
          weight_weight?: number | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_distance_miles?: number | null
          max_sixty_time?: number | null
          min_exit_velocity?: number | null
          min_gpa?: number | null
          min_pitch_velocity?: number | null
          position_priorities?: Json | null
          preferred_states?: Json | null
          target_grad_years?: Json | null
          updated_at?: string | null
          weight_arm_strength?: number | null
          weight_exit_velocity?: number | null
          weight_gpa?: number | null
          weight_height?: number | null
          weight_pitch_velocity?: number | null
          weight_sixty_time?: number | null
          weight_weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_coach_recruiting_philosophy_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_coaches: {
        Row: {
          avatar_url: string | null
          bio: string | null
          coach_type: Database["public"]["Enums"]["baseball_coach_type"]
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          onboarding_completed: boolean | null
          organization_id: string | null
          phone: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          coach_type: Database["public"]["Enums"]["baseball_coach_type"]
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          organization_id?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          coach_type?: Database["public"]["Enums"]["baseball_coach_type"]
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          organization_id?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_coaches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_coaches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string | null
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "baseball_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_conversations: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          is_team_chat: boolean | null
          team_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          is_team_chat?: boolean | null
          team_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          is_team_chat?: boolean | null
          team_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_developmental_plans: {
        Row: {
          coach_id: string
          created_at: string | null
          description: string | null
          end_date: string | null
          goals: Json | null
          id: string
          player_id: string
          start_date: string | null
          status: string | null
          team_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          goals?: Json | null
          id?: string
          player_id: string
          start_date?: string | null
          status?: string | null
          team_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          goals?: Json | null
          id?: string
          player_id?: string
          start_date?: string | null
          status?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_developmental_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_developmental_plans_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_developmental_plans_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_document_versions: {
        Row: {
          change_notes: string | null
          created_at: string | null
          document_id: string
          file_name: string | null
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          storage_path: string | null
          uploaded_by: string
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          created_at?: string | null
          document_id: string
          file_name?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          storage_path?: string | null
          uploaded_by: string
          version_number?: number
        }
        Update: {
          change_notes?: string | null
          created_at?: string | null
          document_id?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          storage_path?: string | null
          uploaded_by?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "baseball_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "baseball_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_document_versions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_documents: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          folder: string | null
          id: string
          is_player_visible: boolean | null
          team_id: string
          title: string
          updated_at: string | null
          uploaded_by: string
          version_count: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          folder?: string | null
          id?: string
          is_player_visible?: boolean | null
          team_id: string
          title: string
          updated_at?: string | null
          uploaded_by: string
          version_count?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          folder?: string | null
          id?: string
          is_player_visible?: boolean | null
          team_id?: string
          title?: string
          updated_at?: string | null
          uploaded_by?: string
          version_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_documents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_event_attendance: {
        Row: {
          absence_reason: string | null
          check_in_at: string | null
          event_id: string
          id: string
          player_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          absence_reason?: string | null
          check_in_at?: string | null
          event_id: string
          id?: string
          player_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          absence_reason?: string | null
          check_in_at?: string | null
          event_id?: string
          id?: string
          player_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "baseball_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_event_attendance_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_events: {
        Row: {
          all_day: boolean | null
          cancellation_reason: string | null
          created_at: string | null
          created_by: string | null
          created_by_id: string | null
          description: string | null
          end_time: string | null
          event_type: string
          id: string
          is_mandatory: boolean | null
          is_recurring: boolean | null
          location: string | null
          max_attendees: number | null
          metadata: Json | null
          recurrence_rule: string | null
          recurring: boolean | null
          rsvp_deadline: string | null
          start_time: string
          team_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          cancellation_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_id?: string | null
          description?: string | null
          end_time?: string | null
          event_type: string
          id?: string
          is_mandatory?: boolean | null
          is_recurring?: boolean | null
          location?: string | null
          max_attendees?: number | null
          metadata?: Json | null
          recurrence_rule?: string | null
          recurring?: boolean | null
          rsvp_deadline?: string | null
          start_time: string
          team_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          cancellation_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_id?: string | null
          description?: string | null
          end_time?: string | null
          event_type?: string
          id?: string
          is_mandatory?: boolean | null
          is_recurring?: boolean | null
          location?: string | null
          max_attendees?: number | null
          metadata?: Json | null
          recurrence_rule?: string | null
          recurring?: boolean | null
          rsvp_deadline?: string | null
          start_time?: string
          team_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_games: {
        Row: {
          created_at: string | null
          created_by: string | null
          event_id: string | null
          game_date: string
          game_type: string
          home_away: string | null
          id: string
          innings_played: number | null
          location: string | null
          notes: string | null
          opponent_name: string | null
          opponent_score: number | null
          our_score: number | null
          status: string
          team_id: string
          updated_at: string | null
          weather: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          event_id?: string | null
          game_date: string
          game_type?: string
          home_away?: string | null
          id?: string
          innings_played?: number | null
          location?: string | null
          notes?: string | null
          opponent_name?: string | null
          opponent_score?: number | null
          our_score?: number | null
          status?: string
          team_id: string
          updated_at?: string | null
          weather?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          event_id?: string | null
          game_date?: string
          game_type?: string
          home_away?: string | null
          id?: string
          innings_played?: number | null
          location?: string | null
          notes?: string | null
          opponent_name?: string | null
          opponent_score?: number | null
          our_score?: number | null
          status?: string
          team_id?: string
          updated_at?: string | null
          weather?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_games_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "baseball_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_games_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lineup_positions: {
        Row: {
          batting_order: number
          created_at: string | null
          id: string
          lineup_id: string
          player_id: string
          position: string | null
        }
        Insert: {
          batting_order: number
          created_at?: string | null
          id?: string
          lineup_id: string
          player_id: string
          position?: string | null
        }
        Update: {
          batting_order?: number
          created_at?: string | null
          id?: string
          lineup_id?: string
          player_id?: string
          position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lineup_positions_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "baseball_team_lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lineup_positions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          read: boolean | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "baseball_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_notifications: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      baseball_player_aggregates: {
        Row: {
          career_avg: number | null
          created_at: string | null
          game_avg: number | null
          id: string
          last_10_avg: number | null
          last_5_avg: number | null
          last_session_at: string | null
          player_id: string
          practice_avg: number | null
          pressure_gap: number | null
          recent_trend: string | null
          team_id: string | null
          total_at_bats: number | null
          total_hits: number | null
          total_sessions: number | null
          trend_data: Json | null
          updated_at: string | null
        }
        Insert: {
          career_avg?: number | null
          created_at?: string | null
          game_avg?: number | null
          id?: string
          last_10_avg?: number | null
          last_5_avg?: number | null
          last_session_at?: string | null
          player_id: string
          practice_avg?: number | null
          pressure_gap?: number | null
          recent_trend?: string | null
          team_id?: string | null
          total_at_bats?: number | null
          total_hits?: number | null
          total_sessions?: number | null
          trend_data?: Json | null
          updated_at?: string | null
        }
        Update: {
          career_avg?: number | null
          created_at?: string | null
          game_avg?: number | null
          id?: string
          last_10_avg?: number | null
          last_5_avg?: number | null
          last_session_at?: string | null
          player_id?: string
          practice_avg?: number | null
          pressure_gap?: number | null
          recent_trend?: string | null
          team_id?: string | null
          total_at_bats?: number | null
          total_hits?: number | null
          total_sessions?: number | null
          trend_data?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_aggregates_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_aggregates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_player_classes: {
        Row: {
          building: string | null
          class_name: string
          color: string | null
          created_at: string | null
          credits: number | null
          days: string[] | null
          end_time: string | null
          id: string
          instructor: string | null
          notes: string | null
          player_id: string
          room: string | null
          semester: string | null
          start_time: string | null
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          building?: string | null
          class_name: string
          color?: string | null
          created_at?: string | null
          credits?: number | null
          days?: string[] | null
          end_time?: string | null
          id?: string
          instructor?: string | null
          notes?: string | null
          player_id: string
          room?: string | null
          semester?: string | null
          start_time?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          building?: string | null
          class_name?: string
          color?: string | null
          created_at?: string | null
          credits?: number | null
          days?: string[] | null
          end_time?: string | null
          id?: string
          instructor?: string | null
          notes?: string | null
          player_id?: string
          room?: string | null
          semester?: string | null
          start_time?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_classes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_classes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_player_comparisons: {
        Row: {
          coach_id: string
          created_at: string | null
          id: string
          name: string | null
          notes: string | null
          player_ids: string[]
          updated_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          player_ids: string[]
          updated_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          player_ids?: string[]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_comparisons_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_player_engagement_events: {
        Row: {
          coach_id: string | null
          created_at: string | null
          engagement_date: string | null
          engagement_type: string
          id: string
          metadata: Json | null
          player_id: string
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          engagement_date?: string | null
          engagement_type: string
          id?: string
          metadata?: Json | null
          player_id: string
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          engagement_date?: string | null
          engagement_type?: string
          id?: string
          metadata?: Json | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_engagement_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_engagement_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_player_percentiles: {
        Row: {
          calculated_at: string | null
          composite_academic: number | null
          composite_athletic: number | null
          created_at: string | null
          grad_year: number
          id: string
          is_stale: boolean | null
          percentile_exit_velocity: number | null
          percentile_gpa: number | null
          percentile_pitch_velocity: number | null
          percentile_sixty_time: number | null
          player_id: string
          updated_at: string | null
        }
        Insert: {
          calculated_at?: string | null
          composite_academic?: number | null
          composite_athletic?: number | null
          created_at?: string | null
          grad_year: number
          id?: string
          is_stale?: boolean | null
          percentile_exit_velocity?: number | null
          percentile_gpa?: number | null
          percentile_pitch_velocity?: number | null
          percentile_sixty_time?: number | null
          player_id: string
          updated_at?: string | null
        }
        Update: {
          calculated_at?: string | null
          composite_academic?: number | null
          composite_athletic?: number | null
          created_at?: string | null
          grad_year?: number
          id?: string
          is_stale?: boolean | null
          percentile_exit_velocity?: number | null
          percentile_gpa?: number | null
          percentile_pitch_velocity?: number | null
          percentile_sixty_time?: number | null
          player_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_percentiles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_player_season_stats: {
        Row: {
          ab: number
          avg: number | null
          bb: number
          bb_allowed: number
          bb9: number | null
          cs: number
          doubles: number
          er: number
          era: number | null
          g: number
          g_p: number
          gs: number
          h: number
          h_allowed: number
          hbp: number
          hr: number
          hr_allowed: number
          id: string
          ip: number
          k: number
          k_thrown: number
          k9: number | null
          l: number
          last_updated: string | null
          obp: number | null
          ops: number | null
          player_id: string
          r: number
          r_allowed: number
          rbi: number
          sac: number
          sb: number
          season_year: number
          sf: number
          slg: number | null
          sv: number
          team_id: string
          triples: number
          w: number
          whip: number | null
        }
        Insert: {
          ab?: number
          avg?: number | null
          bb?: number
          bb_allowed?: number
          bb9?: number | null
          cs?: number
          doubles?: number
          er?: number
          era?: number | null
          g?: number
          g_p?: number
          gs?: number
          h?: number
          h_allowed?: number
          hbp?: number
          hr?: number
          hr_allowed?: number
          id?: string
          ip?: number
          k?: number
          k_thrown?: number
          k9?: number | null
          l?: number
          last_updated?: string | null
          obp?: number | null
          ops?: number | null
          player_id: string
          r?: number
          r_allowed?: number
          rbi?: number
          sac?: number
          sb?: number
          season_year?: number
          sf?: number
          slg?: number | null
          sv?: number
          team_id: string
          triples?: number
          w?: number
          whip?: number | null
        }
        Update: {
          ab?: number
          avg?: number | null
          bb?: number
          bb_allowed?: number
          bb9?: number | null
          cs?: number
          doubles?: number
          er?: number
          era?: number | null
          g?: number
          g_p?: number
          gs?: number
          h?: number
          h_allowed?: number
          hbp?: number
          hr?: number
          hr_allowed?: number
          id?: string
          ip?: number
          k?: number
          k_thrown?: number
          k9?: number | null
          l?: number
          last_updated?: string | null
          obp?: number | null
          ops?: number | null
          player_id?: string
          r?: number
          r_allowed?: number
          rbi?: number
          sac?: number
          sb?: number
          season_year?: number
          sf?: number
          slg?: number | null
          sv?: number
          team_id?: string
          triples?: number
          w?: number
          whip?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_season_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_season_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_player_settings: {
        Row: {
          created_at: string | null
          email_notifications: boolean | null
          id: string
          notify_messages: boolean | null
          notify_profile_views: boolean | null
          notify_team_activity: boolean | null
          notify_watchlist_adds: boolean | null
          player_id: string
          profile_visibility: string | null
          push_notifications: boolean | null
          show_academics: boolean | null
          show_contact_info: boolean | null
          show_dream_schools: boolean | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email_notifications?: boolean | null
          id?: string
          notify_messages?: boolean | null
          notify_profile_views?: boolean | null
          notify_team_activity?: boolean | null
          notify_watchlist_adds?: boolean | null
          player_id: string
          profile_visibility?: string | null
          push_notifications?: boolean | null
          show_academics?: boolean | null
          show_contact_info?: boolean | null
          show_dream_schools?: boolean | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email_notifications?: boolean | null
          id?: string
          notify_messages?: boolean | null
          notify_profile_views?: boolean | null
          notify_team_activity?: boolean | null
          notify_watchlist_adds?: boolean | null
          player_id?: string
          profile_visibility?: string | null
          push_notifications?: boolean | null
          show_academics?: boolean | null
          show_contact_info?: boolean | null
          show_dream_schools?: boolean | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_settings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_player_stats: {
        Row: {
          assists: number | null
          at_bats: number | null
          coach_id: string
          created_at: string | null
          doubles: number | null
          earned_runs: number | null
          errors: number | null
          exit_velocity: number | null
          hits: number | null
          hits_allowed: number | null
          home_runs: number | null
          id: string
          innings_pitched: number | null
          notes: string | null
          pitch_velocity: number | null
          player_id: string
          putouts: number | null
          rbis: number | null
          session_date: string
          session_name: string | null
          source: string | null
          stat_type: string
          stolen_bases: number | null
          strikeouts: number | null
          strikeouts_thrown: number | null
          team_id: string
          triples: number | null
          updated_at: string | null
          walks: number | null
          walks_allowed: number | null
        }
        Insert: {
          assists?: number | null
          at_bats?: number | null
          coach_id: string
          created_at?: string | null
          doubles?: number | null
          earned_runs?: number | null
          errors?: number | null
          exit_velocity?: number | null
          hits?: number | null
          hits_allowed?: number | null
          home_runs?: number | null
          id?: string
          innings_pitched?: number | null
          notes?: string | null
          pitch_velocity?: number | null
          player_id: string
          putouts?: number | null
          rbis?: number | null
          session_date: string
          session_name?: string | null
          source?: string | null
          stat_type: string
          stolen_bases?: number | null
          strikeouts?: number | null
          strikeouts_thrown?: number | null
          team_id: string
          triples?: number | null
          updated_at?: string | null
          walks?: number | null
          walks_allowed?: number | null
        }
        Update: {
          assists?: number | null
          at_bats?: number | null
          coach_id?: string
          created_at?: string | null
          doubles?: number | null
          earned_runs?: number | null
          errors?: number | null
          exit_velocity?: number | null
          hits?: number | null
          hits_allowed?: number | null
          home_runs?: number | null
          id?: string
          innings_pitched?: number | null
          notes?: string | null
          pitch_velocity?: number | null
          player_id?: string
          putouts?: number | null
          rbis?: number | null
          session_date?: string
          session_name?: string | null
          source?: string | null
          stat_type?: string
          stolen_bases?: number | null
          strikeouts?: number | null
          strikeouts_thrown?: number | null
          team_id?: string
          triples?: number | null
          updated_at?: string | null
          walks?: number | null
          walks_allowed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_stats_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_players: {
        Row: {
          about_me: string | null
          act_score: number | null
          arm_strength: number | null
          avatar_url: string | null
          bats: string | null
          city: string | null
          created_at: string | null
          email: string | null
          exit_velo: number | null
          first_name: string | null
          gpa: number | null
          grad_year: number | null
          has_video: boolean | null
          height_feet: number | null
          height_inches: number | null
          high_school_city: string | null
          high_school_name: string | null
          high_school_state: string | null
          id: string
          instagram: string | null
          last_name: string | null
          onboarding_completed: boolean | null
          phone: string | null
          pitch_velo: number | null
          player_type: Database["public"]["Enums"]["baseball_player_type"]
          pop_time: number | null
          primary_position: string | null
          profile_completion_percent: number | null
          recruiting_activated: boolean | null
          recruiting_activated_at: string | null
          sat_score: number | null
          secondary_position: string | null
          sixty_time: number | null
          state: string | null
          throws: string | null
          twitter: string | null
          updated_at: string | null
          user_id: string
          weight_lbs: number | null
        }
        Insert: {
          about_me?: string | null
          act_score?: number | null
          arm_strength?: number | null
          avatar_url?: string | null
          bats?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          exit_velo?: number | null
          first_name?: string | null
          gpa?: number | null
          grad_year?: number | null
          has_video?: boolean | null
          height_feet?: number | null
          height_inches?: number | null
          high_school_city?: string | null
          high_school_name?: string | null
          high_school_state?: string | null
          id?: string
          instagram?: string | null
          last_name?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          pitch_velo?: number | null
          player_type: Database["public"]["Enums"]["baseball_player_type"]
          pop_time?: number | null
          primary_position?: string | null
          profile_completion_percent?: number | null
          recruiting_activated?: boolean | null
          recruiting_activated_at?: string | null
          sat_score?: number | null
          secondary_position?: string | null
          sixty_time?: number | null
          state?: string | null
          throws?: string | null
          twitter?: string | null
          updated_at?: string | null
          user_id: string
          weight_lbs?: number | null
        }
        Update: {
          about_me?: string | null
          act_score?: number | null
          arm_strength?: number | null
          avatar_url?: string | null
          bats?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          exit_velo?: number | null
          first_name?: string | null
          gpa?: number | null
          grad_year?: number | null
          has_video?: boolean | null
          height_feet?: number | null
          height_inches?: number | null
          high_school_city?: string | null
          high_school_name?: string | null
          high_school_state?: string | null
          id?: string
          instagram?: string | null
          last_name?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          pitch_velo?: number | null
          player_type?: Database["public"]["Enums"]["baseball_player_type"]
          pop_time?: number | null
          primary_position?: string | null
          profile_completion_percent?: number | null
          recruiting_activated?: boolean | null
          recruiting_activated_at?: string | null
          sat_score?: number | null
          secondary_position?: string | null
          sixty_time?: number | null
          state?: string | null
          throws?: string | null
          twitter?: string | null
          updated_at?: string | null
          user_id?: string
          weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_recruiting_interests: {
        Row: {
          created_at: string | null
          id: string
          interest_level: string | null
          notes: string | null
          organization_id: string
          player_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          interest_level?: string | null
          notes?: string | null
          organization_id: string
          player_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          interest_level?: string | null
          notes?: string | null
          organization_id?: string
          player_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_recruiting_interests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_recruiting_interests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_stat_uploads: {
        Row: {
          coach_id: string
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          file_url: string | null
          filename: string
          id: string
          processed_count: number | null
          row_count: number | null
          status: string | null
          team_id: string
        }
        Insert: {
          coach_id: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          file_url?: string | null
          filename: string
          id?: string
          processed_count?: number | null
          row_count?: number | null
          status?: string | null
          team_id: string
        }
        Update: {
          coach_id?: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          file_url?: string | null
          filename?: string
          id?: string
          processed_count?: number | null
          row_count?: number | null
          status?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_stat_uploads_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_stat_uploads_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_task_assignments: {
        Row: {
          completed_at: string | null
          id: string
          notes: string | null
          player_id: string
          status: string
          task_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          notes?: string | null
          player_id: string
          status?: string
          task_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          notes?: string | null
          player_id?: string
          status?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_task_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "baseball_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_task_templates: {
        Row: {
          category: string | null
          created_at: string | null
          created_by_id: string
          description: string | null
          id: string
          team_id: string
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by_id: string
          description?: string | null
          id?: string
          team_id: string
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by_id?: string
          description?: string | null
          id?: string
          team_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_task_templates_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_task_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_tasks: {
        Row: {
          category: string | null
          created_at: string | null
          created_by_id: string
          description: string | null
          due_date: string | null
          id: string
          is_recurring: boolean | null
          priority: string | null
          recurrence_rule: string | null
          reminder_at: string | null
          status: string
          team_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by_id: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean | null
          priority?: string | null
          recurrence_rule?: string | null
          reminder_at?: string | null
          status?: string
          team_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by_id?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean | null
          priority?: string | null
          recurrence_rule?: string | null
          reminder_at?: string | null
          status?: string
          team_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_tasks_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_team_coach_staff: {
        Row: {
          coach_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          role: string | null
          team_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          role?: string | null
          team_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          role?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_team_coach_staff_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_team_coach_staff_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_team_invitations: {
        Row: {
          code: string
          created_at: string | null
          created_by_coach_id: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          team_id: string
          updated_at: string | null
          used_count: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by_coach_id: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          team_id: string
          updated_at?: string | null
          used_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by_coach_id?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          team_id?: string
          updated_at?: string | null
          used_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_team_invitations_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_team_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_team_lineups: {
        Row: {
          created_at: string | null
          created_by_coach_id: string
          id: string
          name: string
          team_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by_coach_id: string
          id?: string
          name: string
          team_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by_coach_id?: string
          id?: string
          name?: string
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_team_lineups_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_team_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_team_members: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          id: string
          jersey_number: number | null
          joined_at: string | null
          player_id: string
          position: string | null
          status: Database["public"]["Enums"]["team_member_status"] | null
          team_id: string
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          jersey_number?: number | null
          joined_at?: string | null
          player_id: string
          position?: string | null
          status?: Database["public"]["Enums"]["team_member_status"] | null
          team_id: string
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          jersey_number?: number | null
          joined_at?: string | null
          player_id?: string
          position?: string | null
          status?: Database["public"]["Enums"]["team_member_status"] | null
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_team_members_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_team_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_teams: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          join_code: string
          logo_url: string | null
          name: string
          organization_id: string | null
          primary_color: string | null
          secondary_color: string | null
          team_type: Database["public"]["Enums"]["baseball_coach_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          join_code: string
          logo_url?: string | null
          name: string
          organization_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          team_type: Database["public"]["Enums"]["baseball_coach_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          join_code?: string
          logo_url?: string | null
          name?: string
          organization_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          team_type?: Database["public"]["Enums"]["baseball_coach_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_travel_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          expense_date: string | null
          id: string
          itinerary_id: string
          notes: string | null
          paid_by: string | null
          receipt_url: string | null
          team_id: string | null
          vendor_name: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expense_date?: string | null
          id?: string
          itinerary_id: string
          notes?: string | null
          paid_by?: string | null
          receipt_url?: string | null
          team_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expense_date?: string | null
          id?: string
          itinerary_id?: string
          notes?: string | null
          paid_by?: string | null
          receipt_url?: string | null
          team_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_travel_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_travel_expenses_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "baseball_travel_itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_travel_expenses_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_travel_itineraries: {
        Row: {
          accommodation: string | null
          created_at: string | null
          created_by: string
          departure_date: string | null
          event_name: string
          id: string
          location: string | null
          notes: string | null
          return_date: string | null
          team_id: string
          transportation: string | null
          updated_at: string | null
        }
        Insert: {
          accommodation?: string | null
          created_at?: string | null
          created_by: string
          departure_date?: string | null
          event_name: string
          id?: string
          location?: string | null
          notes?: string | null
          return_date?: string | null
          team_id: string
          transportation?: string | null
          updated_at?: string | null
        }
        Update: {
          accommodation?: string | null
          created_at?: string | null
          created_by?: string
          departure_date?: string | null
          event_name?: string
          id?: string
          location?: string | null
          notes?: string | null
          return_date?: string | null
          team_id?: string
          transportation?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_travel_itineraries_created_by_id_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_travel_itineraries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_videos: {
        Row: {
          clip_end_time: number | null
          clip_start_time: number | null
          created_at: string | null
          description: string | null
          duration: number | null
          id: string
          is_clip: boolean | null
          is_primary: boolean | null
          parent_video_id: string | null
          player_id: string
          team_id: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          url: string | null
          video_type: string | null
          view_count: number | null
        }
        Insert: {
          clip_end_time?: number | null
          clip_start_time?: number | null
          created_at?: string | null
          description?: string | null
          duration?: number | null
          id?: string
          is_clip?: boolean | null
          is_primary?: boolean | null
          parent_video_id?: string | null
          player_id: string
          team_id?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          url?: string | null
          video_type?: string | null
          view_count?: number | null
        }
        Update: {
          clip_end_time?: number | null
          clip_start_time?: number | null
          created_at?: string | null
          description?: string | null
          duration?: number | null
          id?: string
          is_clip?: boolean | null
          is_primary?: boolean | null
          parent_video_id?: string | null
          player_id?: string
          team_id?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          url?: string | null
          video_type?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_videos_parent_video_id_fkey"
            columns: ["parent_video_id"]
            isOneToOne: false
            referencedRelation: "baseball_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_videos_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_videos_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_watchlists: {
        Row: {
          added_at: string | null
          coach_id: string
          created_at: string | null
          fit_score: number | null
          id: string
          last_contact: string | null
          notes: string | null
          pipeline_stage:
            | Database["public"]["Enums"]["baseball_pipeline_stage"]
            | null
          player_id: string
          priority: number | null
          source: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          added_at?: string | null
          coach_id: string
          created_at?: string | null
          fit_score?: number | null
          id?: string
          last_contact?: string | null
          notes?: string | null
          pipeline_stage?:
            | Database["public"]["Enums"]["baseball_pipeline_stage"]
            | null
          player_id: string
          priority?: number | null
          source?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          added_at?: string | null
          coach_id?: string
          created_at?: string | null
          fit_score?: number | null
          id?: string
          last_contact?: string | null
          notes?: string | null
          pipeline_stage?:
            | Database["public"]["Enums"]["baseball_pipeline_stage"]
            | null
          player_id?: string
          priority?: number | null
          source?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_watchlists_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_watchlists_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activity_log: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activity_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_coaches: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          best_contact_method: string | null
          best_contact_time: string | null
          budget_range: string | null
          conference: string
          created_at: string | null
          created_by: string | null
          current_software: string | null
          decision_timeline: string | null
          division: Database["public"]["Enums"]["ncaa_division"]
          email: string | null
          email_status: string | null
          highlight_color: string | null
          id: string
          internal_comments: string | null
          is_archived: boolean | null
          is_starred: boolean | null
          last_contacted_at: string | null
          name: string
          next_follow_up_at: string | null
          notes: string | null
          pain_points: string[] | null
          phone: string | null
          priority: number | null
          program: Database["public"]["Enums"]["program_type"]
          school: string
          source: string | null
          status: Database["public"]["Enums"]["coach_status"]
          tags: string[] | null
          team_size: number | null
          timezone: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          best_contact_method?: string | null
          best_contact_time?: string | null
          budget_range?: string | null
          conference: string
          created_at?: string | null
          created_by?: string | null
          current_software?: string | null
          decision_timeline?: string | null
          division: Database["public"]["Enums"]["ncaa_division"]
          email?: string | null
          email_status?: string | null
          highlight_color?: string | null
          id?: string
          internal_comments?: string | null
          is_archived?: boolean | null
          is_starred?: boolean | null
          last_contacted_at?: string | null
          name: string
          next_follow_up_at?: string | null
          notes?: string | null
          pain_points?: string[] | null
          phone?: string | null
          priority?: number | null
          program?: Database["public"]["Enums"]["program_type"]
          school: string
          source?: string | null
          status?: Database["public"]["Enums"]["coach_status"]
          tags?: string[] | null
          team_size?: number | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          best_contact_method?: string | null
          best_contact_time?: string | null
          budget_range?: string | null
          conference?: string
          created_at?: string | null
          created_by?: string | null
          current_software?: string | null
          decision_timeline?: string | null
          division?: Database["public"]["Enums"]["ncaa_division"]
          email?: string | null
          email_status?: string | null
          highlight_color?: string | null
          id?: string
          internal_comments?: string | null
          is_archived?: boolean | null
          is_starred?: boolean | null
          last_contacted_at?: string | null
          name?: string
          next_follow_up_at?: string | null
          notes?: string | null
          pain_points?: string[] | null
          phone?: string | null
          priority?: number | null
          program?: Database["public"]["Enums"]["program_type"]
          school?: string
          source?: string | null
          status?: Database["public"]["Enums"]["coach_status"]
          tags?: string[] | null
          team_size?: number | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_coaches_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_coaches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contact_log: {
        Row: {
          coach_id: string
          contact_date: string
          contact_type: Database["public"]["Enums"]["contact_type"]
          created_at: string | null
          created_by: string | null
          id: string
          next_action: string | null
          next_action_date: string | null
          notes: string | null
          resend_message_id: string | null
          subject: string | null
        }
        Insert: {
          coach_id: string
          contact_date?: string
          contact_type: Database["public"]["Enums"]["contact_type"]
          created_at?: string | null
          created_by?: string | null
          id?: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          resend_message_id?: string | null
          subject?: string | null
        }
        Update: {
          coach_id?: string
          contact_date?: string
          contact_type?: Database["public"]["Enums"]["contact_type"]
          created_at?: string | null
          created_by?: string | null
          id?: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          resend_message_id?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contact_log_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "crm_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_events: {
        Row: {
          contact_log_id: string | null
          created_at: string | null
          event_type: string
          id: string
          occurred_at: string
          raw_payload: Json | null
          recipient_email: string | null
          resend_message_id: string
        }
        Insert: {
          contact_log_id?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          occurred_at: string
          raw_payload?: Json | null
          recipient_email?: string | null
          resend_message_id: string
        }
        Update: {
          contact_log_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          raw_payload?: Json | null
          recipient_email?: string | null
          resend_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_events_contact_log_id_fkey"
            columns: ["contact_log_id"]
            isOneToOne: false
            referencedRelation: "crm_contact_log"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_templates: {
        Row: {
          body: string
          category: string
          created_at: string | null
          created_by: string | null
          id: string
          is_default: boolean | null
          merge_tags: string[] | null
          name: string
          subject: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          body: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          merge_tags?: string[] | null
          name: string
          subject: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          body?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          merge_tags?: string[] | null
          name?: string
          subject?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_events: {
        Row: {
          all_day: boolean | null
          coach_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string
          event_type: Database["public"]["Enums"]["crm_event_type"]
          google_calendar_id: string | null
          google_event_id: string | null
          google_last_synced_at: string | null
          google_sync_status: string | null
          id: string
          is_recurring: boolean | null
          location: string | null
          meeting_url: string | null
          notes: string | null
          outcome: string | null
          parent_event_id: string | null
          recurrence_rule: string | null
          reminder_sent: boolean | null
          reminder_time: number | null
          start_time: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          coach_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time: string
          event_type?: Database["public"]["Enums"]["crm_event_type"]
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_last_synced_at?: string | null
          google_sync_status?: string | null
          id?: string
          is_recurring?: boolean | null
          location?: string | null
          meeting_url?: string | null
          notes?: string | null
          outcome?: string | null
          parent_event_id?: string | null
          recurrence_rule?: string | null
          reminder_sent?: boolean | null
          reminder_time?: number | null
          start_time: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          coach_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string
          event_type?: Database["public"]["Enums"]["crm_event_type"]
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_last_synced_at?: string | null
          google_sync_status?: string | null
          id?: string
          is_recurring?: boolean | null
          location?: string | null
          meeting_url?: string | null
          notes?: string | null
          outcome?: string | null
          parent_event_id?: string | null
          recurrence_rule?: string | null
          reminder_sent?: boolean | null
          reminder_time?: number | null
          start_time?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "crm_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "crm_events"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_google_calendar_tokens: {
        Row: {
          access_token: string
          calendar_id: string | null
          calendar_name: string | null
          created_at: string | null
          expires_at: string
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          calendar_id?: string | null
          calendar_name?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          calendar_id?: string | null
          calendar_name?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_google_calendar_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          contacted_at: string | null
          contacted_by: string | null
          created_at: string | null
          email: string
          id: string
          interest_type: string | null
          message: string | null
          name: string | null
          notes: string | null
          organization: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          contacted_at?: string | null
          contacted_by?: string | null
          created_at?: string | null
          email: string
          id?: string
          interest_type?: string | null
          message?: string | null
          name?: string | null
          notes?: string | null
          organization?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          contacted_at?: string | null
          contacted_by?: string | null
          created_at?: string | null
          email?: string
          id?: string
          interest_type?: string | null
          message?: string | null
          name?: string | null
          notes?: string | null
          organization?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          active: boolean | null
          created_at: string | null
          device_name: string | null
          failed_count: number | null
          id: string
          last_push_at: string | null
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          device_name?: string | null
          failed_count?: number | null
          id?: string
          last_push_at?: string | null
          platform: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          device_name?: string | null
          failed_count?: number | null
          id?: string
          last_push_at?: string | null
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          context: Json | null
          created_at: string | null
          id: string
          ip: string | null
          message: string
          severity: string | null
          stack: string | null
          timestamp: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          id?: string
          ip?: string | null
          message: string
          severity?: string | null
          stack?: string | null
          timestamp?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          id?: string
          ip?: string | null
          message?: string
          severity?: string | null
          stack?: string | null
          timestamp?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      error_rate_hourly: {
        Row: {
          affected_users: number | null
          created_at: string | null
          critical_errors: number | null
          hour: string
          id: string
          internal_errors: number | null
          total_errors: number | null
          user_facing_errors: number | null
        }
        Insert: {
          affected_users?: number | null
          created_at?: string | null
          critical_errors?: number | null
          hour: string
          id?: string
          internal_errors?: number | null
          total_errors?: number | null
          user_facing_errors?: number | null
        }
        Update: {
          affected_users?: number | null
          created_at?: string | null
          critical_errors?: number | null
          hour?: string
          id?: string
          internal_errors?: number | null
          total_errors?: number | null
          user_facing_errors?: number | null
        }
        Relationships: []
      }
      golf_academic_exclusions: {
        Row: {
          created_at: string | null
          end_date: string
          excluded_by: string | null
          id: string
          player_id: string
          reason: string | null
          start_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date: string
          excluded_by?: string | null
          id?: string
          player_id: string
          reason?: string | null
          start_date: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string
          excluded_by?: string | null
          id?: string
          player_id?: string
          reason?: string | null
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_academic_exclusions_excluded_by_fkey"
            columns: ["excluded_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_academic_exclusions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_announcement_acknowledgements: {
        Row: {
          acknowledged_at: string | null
          announcement_id: string
          id: string
          player_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          announcement_id: string
          id?: string
          player_id: string
        }
        Update: {
          acknowledged_at?: string | null
          announcement_id?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_announcement_acknowledgements_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "golf_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_announcement_acknowledgements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_announcement_documents: {
        Row: {
          announcement_id: string
          created_at: string | null
          document_id: string
          id: string
          sort_order: number | null
        }
        Insert: {
          announcement_id: string
          created_at?: string | null
          document_id: string
          id?: string
          sort_order?: number | null
        }
        Update: {
          announcement_id?: string
          created_at?: string | null
          document_id?: string
          id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_announcement_documents_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "golf_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_announcement_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "golf_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_announcement_recipients: {
        Row: {
          announcement_id: string
          created_at: string | null
          id: string
          player_id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string | null
          id?: string
          player_id: string
        }
        Update: {
          announcement_id?: string
          created_at?: string | null
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_announcement_recipients_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "golf_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_announcement_recipients_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_announcement_tasks: {
        Row: {
          announcement_id: string
          created_at: string | null
          id: string
          sort_order: number | null
          task_id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string | null
          id?: string
          sort_order?: number | null
          task_id: string
        }
        Update: {
          announcement_id?: string
          created_at?: string | null
          id?: string
          sort_order?: number | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_announcement_tasks_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "golf_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_announcement_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "golf_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_announcements: {
        Row: {
          body: string | null
          created_at: string | null
          created_by: string | null
          id: string
          publish_at: string | null
          published_at: string | null
          requires_acknowledgement: boolean | null
          send_email: boolean | null
          send_push: boolean | null
          team_id: string
          title: string
          updated_at: string | null
          urgency: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          publish_at?: string | null
          published_at?: string | null
          requires_acknowledgement?: boolean | null
          send_email?: boolean | null
          send_push?: boolean | null
          team_id: string
          title: string
          updated_at?: string | null
          urgency?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          publish_at?: string | null
          published_at?: string | null
          requires_acknowledgement?: boolean | null
          send_email?: boolean | null
          send_push?: boolean | null
          team_id?: string
          title?: string
          updated_at?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_announcements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_attendance_summary: {
        Row: {
          absent_count: number | null
          attendance_percentage: number | null
          attended_count: number | null
          created_at: string | null
          excused_count: number | null
          id: string
          period_end_date: string | null
          period_start_date: string | null
          player_id: string
          team_id: string
          total_events: number | null
          updated_at: string | null
        }
        Insert: {
          absent_count?: number | null
          attendance_percentage?: number | null
          attended_count?: number | null
          created_at?: string | null
          excused_count?: number | null
          id?: string
          period_end_date?: string | null
          period_start_date?: string | null
          player_id: string
          team_id: string
          total_events?: number | null
          updated_at?: string | null
        }
        Update: {
          absent_count?: number | null
          attendance_percentage?: number | null
          attended_count?: number | null
          created_at?: string | null
          excused_count?: number | null
          id?: string
          period_end_date?: string | null
          period_start_date?: string | null
          player_id?: string
          team_id?: string
          total_events?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_attendance_summary_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_attendance_summary_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_calendar_feeds: {
        Row: {
          created_at: string | null
          feed_token: string
          feed_type: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          name: string
          player_id: string | null
          team_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          feed_token?: string
          feed_type?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          name?: string
          player_id?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          feed_token?: string
          feed_type?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          name?: string
          player_id?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_calendar_feeds_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_calendar_feeds_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_calendar_feeds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_calendar_notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          event_id: string | null
          id: string
          message: string | null
          notification_type: string
          read_at: string | null
          sent_at: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          message?: string | null
          notification_type: string
          read_at?: string | null
          sent_at?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          message?: string | null
          notification_type?: string
          read_at?: string | null
          sent_at?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_calendar_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_calendar_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_causal_relationships: {
        Row: {
          cause: string
          cause_metric: string | null
          confidence: number
          confounders: Json
          created_at: string
          dose_response: boolean
          effect: string
          effect_metric: string | null
          evidence: Json
          id: string
          intervention_potential: number
          mechanism: string
          player_id: string | null
          relationship_type: string
          strength: number
          team_id: string | null
          updated_at: string
          validation_count: number
        }
        Insert: {
          cause: string
          cause_metric?: string | null
          confidence?: number
          confounders?: Json
          created_at?: string
          dose_response?: boolean
          effect: string
          effect_metric?: string | null
          evidence?: Json
          id?: string
          intervention_potential?: number
          mechanism: string
          player_id?: string | null
          relationship_type: string
          strength?: number
          team_id?: string | null
          updated_at?: string
          validation_count?: number
        }
        Update: {
          cause?: string
          cause_metric?: string | null
          confidence?: number
          confounders?: Json
          created_at?: string
          dose_response?: boolean
          effect?: string
          effect_metric?: string | null
          evidence?: Json
          id?: string
          intervention_potential?: number
          mechanism?: string
          player_id?: string | null
          relationship_type?: string
          strength?: number
          team_id?: string | null
          updated_at?: string
          validation_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "golf_causal_relationships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_causal_relationships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_coach_behavior_log: {
        Row: {
          action_type: string
          coach_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          target_id: string | null
        }
        Insert: {
          action_type: string
          coach_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          target_id?: string | null
        }
        Update: {
          action_type?: string
          coach_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          target_id?: string | null
        }
        Relationships: []
      }
      golf_coach_blocked_time: {
        Row: {
          coach_id: string
          created_at: string | null
          end_date: string
          end_time: string | null
          id: string
          is_recurring: boolean | null
          reason: string | null
          recurrence_rule: string | null
          start_date: string
          start_time: string | null
          updated_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          end_date: string
          end_time?: string | null
          id?: string
          is_recurring?: boolean | null
          reason?: string | null
          recurrence_rule?: string | null
          start_date: string
          start_time?: string | null
          updated_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          end_date?: string
          end_time?: string | null
          id?: string
          is_recurring?: boolean | null
          reason?: string | null
          recurrence_rule?: string | null
          start_date?: string
          start_time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_coach_blocked_time_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_coach_insights: {
        Row: {
          acknowledged_at: string | null
          action_date: string | null
          action_taken: boolean | null
          action_type: string | null
          coach_id: string | null
          content: string | null
          created_at: string | null
          dismissed: boolean | null
          dismissed_at: string | null
          id: string
          insight_type: string
          metadata: Json | null
          outcome_measured_at: string | null
          outcome_metric_after: number | null
          outcome_metric_before: number | null
          outcome_metric_name: string | null
          outcome_notes: string | null
          outcome_status: string | null
          player_id: string | null
          priority: string | null
          resolved_at: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          team_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          action_date?: string | null
          action_taken?: boolean | null
          action_type?: string | null
          coach_id?: string | null
          content?: string | null
          created_at?: string | null
          dismissed?: boolean | null
          dismissed_at?: string | null
          id?: string
          insight_type: string
          metadata?: Json | null
          outcome_measured_at?: string | null
          outcome_metric_after?: number | null
          outcome_metric_before?: number | null
          outcome_metric_name?: string | null
          outcome_notes?: string | null
          outcome_status?: string | null
          player_id?: string | null
          priority?: string | null
          resolved_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          team_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          action_date?: string | null
          action_taken?: boolean | null
          action_type?: string | null
          coach_id?: string | null
          content?: string | null
          created_at?: string | null
          dismissed?: boolean | null
          dismissed_at?: string | null
          id?: string
          insight_type?: string
          metadata?: Json | null
          outcome_measured_at?: string | null
          outcome_metric_after?: number | null
          outcome_metric_before?: number | null
          outcome_metric_name?: string | null
          outcome_notes?: string | null
          outcome_status?: string | null
          player_id?: string | null
          priority?: string | null
          resolved_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_coach_insights_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_coach_insights_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_coach_insights_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_coach_philosophy: {
        Row: {
          alert_bubble_player: boolean
          alert_closing_holes: boolean
          alert_par_3_issues: boolean
          alert_plateau: boolean
          alert_recurring_weakness: boolean
          alert_scoring_decline: boolean
          alert_sensitivity: string | null
          alert_stat_regression: boolean
          alert_streaks: boolean
          alert_surge_player: boolean
          alert_tournament_pressure: boolean
          bubble_zone_range: number | null
          coach_id: string
          coaching_philosophy: string | null
          created_at: string | null
          decline_threshold: number | null
          expectations: string | null
          id: string
          insight_verbosity: string
          pressure_gap_threshold: number | null
          priority_ball_striking: number | null
          priority_course_management: number | null
          priority_mental_game: number | null
          priority_putting: number | null
          priority_short_game: number | null
          show_advanced_stats: boolean
          show_strokes_gained: boolean
          updated_at: string | null
          weight_historical: number
          weight_qualifying: number
          weight_recent_form: number
          weight_subjective: number
          weight_tournament: number
        }
        Insert: {
          alert_bubble_player?: boolean
          alert_closing_holes?: boolean
          alert_par_3_issues?: boolean
          alert_plateau?: boolean
          alert_recurring_weakness?: boolean
          alert_scoring_decline?: boolean
          alert_sensitivity?: string | null
          alert_stat_regression?: boolean
          alert_streaks?: boolean
          alert_surge_player?: boolean
          alert_tournament_pressure?: boolean
          bubble_zone_range?: number | null
          coach_id: string
          coaching_philosophy?: string | null
          created_at?: string | null
          decline_threshold?: number | null
          expectations?: string | null
          id?: string
          insight_verbosity?: string
          pressure_gap_threshold?: number | null
          priority_ball_striking?: number | null
          priority_course_management?: number | null
          priority_mental_game?: number | null
          priority_putting?: number | null
          priority_short_game?: number | null
          show_advanced_stats?: boolean
          show_strokes_gained?: boolean
          updated_at?: string | null
          weight_historical?: number
          weight_qualifying?: number
          weight_recent_form?: number
          weight_subjective?: number
          weight_tournament?: number
        }
        Update: {
          alert_bubble_player?: boolean
          alert_closing_holes?: boolean
          alert_par_3_issues?: boolean
          alert_plateau?: boolean
          alert_recurring_weakness?: boolean
          alert_scoring_decline?: boolean
          alert_sensitivity?: string | null
          alert_stat_regression?: boolean
          alert_streaks?: boolean
          alert_surge_player?: boolean
          alert_tournament_pressure?: boolean
          bubble_zone_range?: number | null
          coach_id?: string
          coaching_philosophy?: string | null
          created_at?: string | null
          decline_threshold?: number | null
          expectations?: string | null
          id?: string
          insight_verbosity?: string
          pressure_gap_threshold?: number | null
          priority_ball_striking?: number | null
          priority_course_management?: number | null
          priority_mental_game?: number | null
          priority_putting?: number | null
          priority_short_game?: number | null
          show_advanced_stats?: boolean
          show_strokes_gained?: boolean
          updated_at?: string | null
          weight_historical?: number
          weight_qualifying?: number
          weight_recent_form?: number
          weight_subjective?: number
          weight_tournament?: number
        }
        Relationships: [
          {
            foreignKeyName: "golf_coach_philosophy_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_coaches: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          onboarding_completed: boolean | null
          organization_id: string | null
          phone: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          organization_id?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          organization_id?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_coaches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_coaches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_coachhelm_settings: {
        Row: {
          auto_insights: boolean | null
          coach_id: string
          created_at: string | null
          disabled_at: string | null
          disabled_reason: string | null
          enabled: boolean | null
          focus_areas: string[] | null
          id: string
          insight_frequency: string | null
          min_rounds_for_insights: number | null
          team_id: string | null
          trend_alerts: boolean | null
          updated_at: string | null
          user_id: string | null
          weekly_summary: boolean | null
        }
        Insert: {
          auto_insights?: boolean | null
          coach_id: string
          created_at?: string | null
          disabled_at?: string | null
          disabled_reason?: string | null
          enabled?: boolean | null
          focus_areas?: string[] | null
          id?: string
          insight_frequency?: string | null
          min_rounds_for_insights?: number | null
          team_id?: string | null
          trend_alerts?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          weekly_summary?: boolean | null
        }
        Update: {
          auto_insights?: boolean | null
          coach_id?: string
          created_at?: string | null
          disabled_at?: string | null
          disabled_reason?: string | null
          enabled?: boolean | null
          focus_areas?: string[] | null
          id?: string
          insight_frequency?: string | null
          min_rounds_for_insights?: number | null
          team_id?: string | null
          trend_alerts?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          weekly_summary?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_coachhelm_settings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_coachhelm_settings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_coachhelm_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_confidence_calibration: {
        Row: {
          actual_accuracy: number
          bucket: number
          calibration_error: number
          correct_count: number
          created_at: string
          prediction_type: string
          predictions_count: number
          sample_size: number
          updated_at: string
        }
        Insert: {
          actual_accuracy?: number
          bucket: number
          calibration_error?: number
          correct_count?: number
          created_at?: string
          prediction_type: string
          predictions_count?: number
          sample_size?: number
          updated_at?: string
        }
        Update: {
          actual_accuracy?: number
          bucket?: number
          calibration_error?: number
          correct_count?: number
          created_at?: string
          prediction_type?: string
          predictions_count?: number
          sample_size?: number
          updated_at?: string
        }
        Relationships: []
      }
      golf_conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string | null
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "golf_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_conversations: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          is_team_channel: boolean | null
          is_team_chat: boolean | null
          team_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          is_team_channel?: boolean | null
          is_team_chat?: boolean | null
          team_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          is_team_channel?: boolean | null
          is_team_chat?: boolean | null
          team_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_course_holes: {
        Row: {
          course_id: string
          created_at: string | null
          handicap_index: number | null
          hole_number: number
          id: string
          par: number
          yardage: number | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          handicap_index?: number | null
          hole_number: number
          id?: string
          par: number
          yardage?: number | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          handicap_index?: number | null
          hole_number?: number
          id?: string
          par?: number
          yardage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_course_holes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_courses: {
        Row: {
          city: string | null
          country: string | null
          course_rating: number | null
          created_at: string | null
          holes: number | null
          id: string
          name: string
          par: number | null
          slope_rating: number | null
          state: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          course_rating?: number | null
          created_at?: string | null
          holes?: number | null
          id?: string
          name: string
          par?: number | null
          slope_rating?: number | null
          state?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          course_rating?: number | null
          created_at?: string | null
          holes?: number | null
          id?: string
          name?: string
          par?: number | null
          slope_rating?: number | null
          state?: string | null
        }
        Relationships: []
      }
      golf_document_versions: {
        Row: {
          change_notes: string | null
          created_at: string | null
          document_id: string
          file_name: string | null
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          storage_path: string | null
          uploaded_by: string | null
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          created_at?: string | null
          document_id: string
          file_name?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          version_number: number
        }
        Update: {
          change_notes?: string | null
          created_at?: string | null
          document_id?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "golf_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "golf_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_documents: {
        Row: {
          category: string | null
          created_at: string | null
          current_version_id: string | null
          description: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          folder: string | null
          id: string
          is_public: boolean | null
          team_id: string
          title: string
          updated_at: string | null
          uploaded_by: string | null
          version_count: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          current_version_id?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          folder?: string | null
          id?: string
          is_public?: boolean | null
          team_id: string
          title: string
          updated_at?: string | null
          uploaded_by?: string | null
          version_count?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          current_version_id?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          folder?: string | null
          id?: string
          is_public?: boolean | null
          team_id?: string
          title?: string
          updated_at?: string | null
          uploaded_by?: string | null
          version_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_documents_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "golf_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_documents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_event_attendance: {
        Row: {
          checked_in: boolean | null
          checked_in_at: string | null
          created_at: string | null
          event_id: string
          id: string
          notes: string | null
          notified_at: string | null
          player_id: string
          rsvp_at: string | null
          status: string | null
        }
        Insert: {
          checked_in?: boolean | null
          checked_in_at?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          notes?: string | null
          notified_at?: string | null
          player_id: string
          rsvp_at?: string | null
          status?: string | null
        }
        Update: {
          checked_in?: boolean | null
          checked_in_at?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          notified_at?: string | null
          player_id?: string
          rsvp_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_event_attendance_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_events: {
        Row: {
          all_day: boolean | null
          cancellation_reason: string | null
          cancelled_at: string | null
          course_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string | null
          event_type: string
          id: string
          location: string | null
          max_attendees: number | null
          metadata: Json | null
          parent_event_id: string | null
          recurrence_rule: string | null
          recurring: boolean | null
          requires_rsvp: boolean | null
          rsvp_deadline: string | null
          start_time: string
          status: string | null
          team_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_type: string
          id?: string
          location?: string | null
          max_attendees?: number | null
          metadata?: Json | null
          parent_event_id?: string | null
          recurrence_rule?: string | null
          recurring?: boolean | null
          requires_rsvp?: boolean | null
          rsvp_deadline?: string | null
          start_time: string
          status?: string | null
          team_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          course_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_type?: string
          id?: string
          location?: string | null
          max_attendees?: number | null
          metadata?: Json | null
          parent_event_id?: string | null
          recurrence_rule?: string | null
          recurring?: boolean | null
          requires_rsvp?: boolean | null
          rsvp_deadline?: string | null
          start_time?: string
          status?: string | null
          team_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_events_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_holes: {
        Row: {
          created_at: string | null
          fairway_hit: boolean | null
          gir: boolean | null
          hole_number: number
          id: string
          notes: string | null
          par: number
          penalty_strokes: number | null
          putts: number | null
          round_id: string
          sand_save: boolean | null
          score: number | null
          up_and_down: boolean | null
          yardage: number | null
        }
        Insert: {
          created_at?: string | null
          fairway_hit?: boolean | null
          gir?: boolean | null
          hole_number: number
          id?: string
          notes?: string | null
          par: number
          penalty_strokes?: number | null
          putts?: number | null
          round_id: string
          sand_save?: boolean | null
          score?: number | null
          up_and_down?: boolean | null
          yardage?: number | null
        }
        Update: {
          created_at?: string | null
          fairway_hit?: boolean | null
          gir?: boolean | null
          hole_number?: number
          id?: string
          notes?: string | null
          par?: number
          penalty_strokes?: number | null
          putts?: number | null
          round_id?: string
          sand_save?: boolean | null
          score?: number | null
          up_and_down?: boolean | null
          yardage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_holes_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "golf_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_insight_effectiveness: {
        Row: {
          action_rate: number | null
          created_at: string | null
          effectiveness_score: number | null
          id: string
          improvement_rate: number | null
          insight_type: string
          insights_acted_upon: number | null
          insights_dismissed: number | null
          insights_generated: number | null
          insights_with_outcome: number | null
          mean_absolute_error: number | null
          outcomes_improved: number | null
          outcomes_no_change: number | null
          outcomes_worsened: number | null
          period_end: string
          period_start: string
          predictions_accurate: number | null
          predictions_made: number | null
          team_id: string
          updated_at: string | null
        }
        Insert: {
          action_rate?: number | null
          created_at?: string | null
          effectiveness_score?: number | null
          id?: string
          improvement_rate?: number | null
          insight_type: string
          insights_acted_upon?: number | null
          insights_dismissed?: number | null
          insights_generated?: number | null
          insights_with_outcome?: number | null
          mean_absolute_error?: number | null
          outcomes_improved?: number | null
          outcomes_no_change?: number | null
          outcomes_worsened?: number | null
          period_end: string
          period_start: string
          predictions_accurate?: number | null
          predictions_made?: number | null
          team_id: string
          updated_at?: string | null
        }
        Update: {
          action_rate?: number | null
          created_at?: string | null
          effectiveness_score?: number | null
          id?: string
          improvement_rate?: number | null
          insight_type?: string
          insights_acted_upon?: number | null
          insights_dismissed?: number | null
          insights_generated?: number | null
          insights_with_outcome?: number | null
          mean_absolute_error?: number | null
          outcomes_improved?: number | null
          outcomes_no_change?: number | null
          outcomes_worsened?: number | null
          period_end?: string
          period_start?: string
          predictions_accurate?: number | null
          predictions_made?: number | null
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_insight_effectiveness_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_insight_feedback_scores: {
        Row: {
          accuracy_rate: number | null
          helpfulness_rate: number | null
          id: string
          insight_type: string
          team_id: string | null
          threshold_adjustment: number | null
          total_accurate: number | null
          total_acted: number | null
          total_dismissed: number | null
          total_shown: number | null
          updated_at: string | null
        }
        Insert: {
          accuracy_rate?: number | null
          helpfulness_rate?: number | null
          id?: string
          insight_type: string
          team_id?: string | null
          threshold_adjustment?: number | null
          total_accurate?: number | null
          total_acted?: number | null
          total_dismissed?: number | null
          total_shown?: number | null
          updated_at?: string | null
        }
        Update: {
          accuracy_rate?: number | null
          helpfulness_rate?: number | null
          id?: string
          insight_type?: string
          team_id?: string | null
          threshold_adjustment?: number | null
          total_accurate?: number | null
          total_acted?: number | null
          total_dismissed?: number | null
          total_shown?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      golf_insight_generation_log: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          engine_version: string | null
          id: string
          insight_type: string | null
          insights_generated: number | null
          player_id: string | null
          rounds_analyzed: number | null
          team_id: string | null
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          engine_version?: string | null
          id?: string
          insight_type?: string | null
          insights_generated?: number | null
          player_id?: string | null
          rounds_analyzed?: number | null
          team_id?: string | null
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          engine_version?: string | null
          id?: string
          insight_type?: string | null
          insights_generated?: number | null
          player_id?: string | null
          rounds_analyzed?: number | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_insight_generation_log_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_insight_generation_log_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_learned_behavior: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          interaction_type: string
          metadata: Json | null
          target_type: string | null
          timestamp: string
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          interaction_type: string
          metadata?: Json | null
          target_type?: string | null
          timestamp?: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          interaction_type?: string
          metadata?: Json | null
          target_type?: string | null
          timestamp?: string
        }
        Relationships: []
      }
      golf_message_attachments: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          file_name: string
          file_size: number
          file_type: string
          height: number | null
          id: string
          message_id: string
          mime_type: string
          storage_path: string
          thumbnail_url: string | null
          updated_at: string | null
          url: string | null
          width: number | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          file_name: string
          file_size: number
          file_type: string
          height?: number | null
          id?: string
          message_id: string
          mime_type: string
          storage_path: string
          thumbnail_url?: string | null
          updated_at?: string | null
          url?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          file_name?: string
          file_size?: number
          file_type?: string
          height?: number | null
          id?: string
          message_id?: string
          mime_type?: string
          storage_path?: string
          thumbnail_url?: string | null
          updated_at?: string | null
          url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "golf_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          edited_at: string | null
          has_attachments: boolean | null
          id: string
          is_deleted: boolean | null
          read: boolean | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          edited_at?: string | null
          has_attachments?: boolean | null
          id?: string
          is_deleted?: boolean | null
          read?: boolean | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          edited_at?: string | null
          has_attachments?: boolean | null
          id?: string
          is_deleted?: boolean | null
          read?: boolean | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "golf_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_patterns_v2: {
        Row: {
          actionability: number | null
          conditions: Json
          confidence: number
          conviction: number | null
          created_at: string | null
          first_detected: string | null
          id: string
          is_active: boolean | null
          last_occurrence: string | null
          lifecycle_state: string | null
          lift: number | null
          metadata: Json | null
          occurrence_count: number | null
          outcome: Json | null
          pattern_type: string
          player_id: string
          resolution_notes: string | null
          resolved_at: string | null
          sample_size: number | null
          severity: string | null
          source_round_ids: string[] | null
          stroke_impact: number | null
          strokes_impact: number | null
          support: number
          trend: string | null
          updated_at: string | null
          validated_by_coach: boolean | null
          validation_date: string | null
          validator_coach_id: string | null
        }
        Insert: {
          actionability?: number | null
          conditions?: Json
          confidence?: number
          conviction?: number | null
          created_at?: string | null
          first_detected?: string | null
          id?: string
          is_active?: boolean | null
          last_occurrence?: string | null
          lifecycle_state?: string | null
          lift?: number | null
          metadata?: Json | null
          occurrence_count?: number | null
          outcome?: Json | null
          pattern_type: string
          player_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          sample_size?: number | null
          severity?: string | null
          source_round_ids?: string[] | null
          stroke_impact?: number | null
          strokes_impact?: number | null
          support?: number
          trend?: string | null
          updated_at?: string | null
          validated_by_coach?: boolean | null
          validation_date?: string | null
          validator_coach_id?: string | null
        }
        Update: {
          actionability?: number | null
          conditions?: Json
          confidence?: number
          conviction?: number | null
          created_at?: string | null
          first_detected?: string | null
          id?: string
          is_active?: boolean | null
          last_occurrence?: string | null
          lifecycle_state?: string | null
          lift?: number | null
          metadata?: Json | null
          occurrence_count?: number | null
          outcome?: Json | null
          pattern_type?: string
          player_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          sample_size?: number | null
          severity?: string | null
          source_round_ids?: string[] | null
          stroke_impact?: number | null
          strokes_impact?: number | null
          support?: number
          trend?: string | null
          updated_at?: string | null
          validated_by_coach?: boolean | null
          validation_date?: string | null
          validator_coach_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_patterns_v2_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_patterns_v2_validator_coach_id_fkey"
            columns: ["validator_coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_percentile_cache: {
        Row: {
          calculated_at: string | null
          division_percentile: number | null
          id: string
          metric_name: string
          platform_percentile: number | null
          player_id: string
          team_percentile: number | null
        }
        Insert: {
          calculated_at?: string | null
          division_percentile?: number | null
          id?: string
          metric_name: string
          platform_percentile?: number | null
          player_id: string
          team_percentile?: number | null
        }
        Update: {
          calculated_at?: string | null
          division_percentile?: number | null
          id?: string
          metric_name?: string
          platform_percentile?: number | null
          player_id?: string
          team_percentile?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_percentile_cache_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_platform_metrics_daily: {
        Row: {
          active_teams: number | null
          avg_engagement_score: number | null
          avg_rounds_per_active_player: number | null
          churn_at_risk_count: number | null
          created_at: string | null
          daily_active_users: number | null
          id: string
          insights_generated: number | null
          monthly_active_users: number | null
          new_signups: number | null
          patterns_detected: number | null
          reviews_created: number | null
          rounds_this_week: number | null
          rounds_today: number | null
          snapshot_date: string
          total_rounds: number | null
          total_users: number | null
          weekly_active_users: number | null
        }
        Insert: {
          active_teams?: number | null
          avg_engagement_score?: number | null
          avg_rounds_per_active_player?: number | null
          churn_at_risk_count?: number | null
          created_at?: string | null
          daily_active_users?: number | null
          id?: string
          insights_generated?: number | null
          monthly_active_users?: number | null
          new_signups?: number | null
          patterns_detected?: number | null
          reviews_created?: number | null
          rounds_this_week?: number | null
          rounds_today?: number | null
          snapshot_date: string
          total_rounds?: number | null
          total_users?: number | null
          weekly_active_users?: number | null
        }
        Update: {
          active_teams?: number | null
          avg_engagement_score?: number | null
          avg_rounds_per_active_player?: number | null
          churn_at_risk_count?: number | null
          created_at?: string | null
          daily_active_users?: number | null
          id?: string
          insights_generated?: number | null
          monthly_active_users?: number | null
          new_signups?: number | null
          patterns_detected?: number | null
          reviews_created?: number | null
          rounds_this_week?: number | null
          rounds_today?: number | null
          snapshot_date?: string
          total_rounds?: number | null
          total_users?: number | null
          weekly_active_users?: number | null
        }
        Relationships: []
      }
      golf_player_attendance_stats: {
        Row: {
          attendance_rate: number | null
          attended_events: number | null
          created_at: string | null
          excused_absences: number | null
          id: string
          period_end: string
          period_start: string
          player_id: string
          team_id: string
          total_events: number | null
          unexcused_absences: number | null
          updated_at: string | null
        }
        Insert: {
          attendance_rate?: number | null
          attended_events?: number | null
          created_at?: string | null
          excused_absences?: number | null
          id?: string
          period_end: string
          period_start: string
          player_id: string
          team_id: string
          total_events?: number | null
          unexcused_absences?: number | null
          updated_at?: string | null
        }
        Update: {
          attendance_rate?: number | null
          attended_events?: number | null
          created_at?: string | null
          excused_absences?: number | null
          id?: string
          period_end?: string
          period_start?: string
          player_id?: string
          team_id?: string
          total_events?: number | null
          unexcused_absences?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_attendance_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_player_attendance_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_player_baselines: {
        Row: {
          decay_factor: number | null
          ewma_value: number | null
          id: string
          last_updated_at: string | null
          metric_name: string
          player_id: string
          rolling_mean: number | null
          rolling_stddev: number | null
          sample_size: number | null
        }
        Insert: {
          decay_factor?: number | null
          ewma_value?: number | null
          id?: string
          last_updated_at?: string | null
          metric_name: string
          player_id: string
          rolling_mean?: number | null
          rolling_stddev?: number | null
          sample_size?: number | null
        }
        Update: {
          decay_factor?: number | null
          ewma_value?: number | null
          id?: string
          last_updated_at?: string | null
          metric_name?: string
          player_id?: string
          rolling_mean?: number | null
          rolling_stddev?: number | null
          sample_size?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_baselines_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_player_classes: {
        Row: {
          building: string | null
          class_name: string
          color: string | null
          created_at: string | null
          credits: number | null
          days: string[] | null
          end_time: string | null
          id: string
          instructor: string | null
          notes: string | null
          player_id: string
          room: string | null
          start_time: string | null
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          building?: string | null
          class_name: string
          color?: string | null
          created_at?: string | null
          credits?: number | null
          days?: string[] | null
          end_time?: string | null
          id?: string
          instructor?: string | null
          notes?: string | null
          player_id: string
          room?: string | null
          start_time?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          building?: string | null
          class_name?: string
          color?: string | null
          created_at?: string | null
          credits?: number | null
          days?: string[] | null
          end_time?: string | null
          id?: string
          instructor?: string | null
          notes?: string | null
          player_id?: string
          room?: string | null
          start_time?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_classes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_player_classes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_player_courses: {
        Row: {
          average_score: number | null
          best_score: number | null
          course_id: string | null
          course_name: string | null
          created_at: string | null
          id: string
          last_played_at: string | null
          notes: string | null
          player_id: string
          relationship: string | null
          rounds_played: number | null
          updated_at: string | null
        }
        Insert: {
          average_score?: number | null
          best_score?: number | null
          course_id?: string | null
          course_name?: string | null
          created_at?: string | null
          id?: string
          last_played_at?: string | null
          notes?: string | null
          player_id: string
          relationship?: string | null
          rounds_played?: number | null
          updated_at?: string | null
        }
        Update: {
          average_score?: number | null
          best_score?: number | null
          course_id?: string | null
          course_name?: string | null
          created_at?: string | null
          id?: string
          last_played_at?: string | null
          notes?: string | null
          player_id?: string
          relationship?: string | null
          rounds_played?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_player_courses_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_player_focus_areas: {
        Row: {
          area_type: string
          coach_id: string | null
          completed_at: string | null
          created_at: string | null
          current_value: number | null
          description: string | null
          from_insight_id: string | null
          from_review_id: string | null
          id: string
          notes: string | null
          player_id: string
          priority: number | null
          progress_notes: Json | null
          review_context: string | null
          started_at: string | null
          status: string | null
          target_metric: string | null
          target_value: number | null
          team_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          area_type: string
          coach_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_value?: number | null
          description?: string | null
          from_insight_id?: string | null
          from_review_id?: string | null
          id?: string
          notes?: string | null
          player_id: string
          priority?: number | null
          progress_notes?: Json | null
          review_context?: string | null
          started_at?: string | null
          status?: string | null
          target_metric?: string | null
          target_value?: number | null
          team_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          area_type?: string
          coach_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_value?: number | null
          description?: string | null
          from_insight_id?: string | null
          from_review_id?: string | null
          id?: string
          notes?: string | null
          player_id?: string
          priority?: number | null
          progress_notes?: Json | null
          review_context?: string | null
          started_at?: string | null
          status?: string | null
          target_metric?: string | null
          target_value?: number | null
          team_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_focus_areas_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_player_focus_areas_from_insight_id_fkey"
            columns: ["from_insight_id"]
            isOneToOne: false
            referencedRelation: "golf_review_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_player_focus_areas_from_review_id_fkey"
            columns: ["from_review_id"]
            isOneToOne: false
            referencedRelation: "golf_round_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_player_focus_areas_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_player_focus_areas_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_player_notification_state: {
        Row: {
          created_at: string | null
          id: string
          last_announcements_seen_at: string | null
          last_travel_seen_at: string | null
          player_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_announcements_seen_at?: string | null
          last_travel_seen_at?: string | null
          player_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_announcements_seen_at?: string | null
          last_travel_seen_at?: string | null
          player_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_notification_state_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_player_stats_cache: {
        Row: {
          approach_miss_left_pct: number | null
          approach_miss_long_pct: number | null
          approach_miss_right_pct: number | null
          approach_miss_short_pct: number | null
          approach_proximity_average: number | null
          best_round: number | null
          birdies: number | null
          bogeys: number | null
          calculation_period_end: string | null
          calculation_period_start: string | null
          created_at: string | null
          double_bogeys: number | null
          driving_accuracy_percentage: number | null
          driving_distance_average: number | null
          eagles: number | null
          engine_version: string | null
          fairways_hit: number | null
          fairways_total: number | null
          gir_percentage: number | null
          greens_hit: number | null
          greens_total: number | null
          id: string
          improvement_trend: number | null
          is_stale: boolean | null
          last_10_average: number | null
          last_5_average: number | null
          last_round_date: string | null
          next_refresh_due: string | null
          one_putt_percentage: number | null
          par3_average: number | null
          par4_average: number | null
          par5_average: number | null
          pars: number | null
          penalty_strokes_per_round: number | null
          player_id: string
          putt_make_pct_0_3ft: number | null
          putt_make_pct_10_15ft: number | null
          putt_make_pct_15_20ft: number | null
          putt_make_pct_20_plus_ft: number | null
          putt_make_pct_3_5ft: number | null
          putt_make_pct_5_10ft: number | null
          putt_make_pct_left_to_right: number | null
          putt_make_pct_right_to_left: number | null
          putt_make_pct_straight: number | null
          putts_per_gir: number | null
          putts_per_round: number | null
          round_ids_included: string[] | null
          rounds_in_calculation: number | null
          rounds_played: number | null
          rounds_this_season: number | null
          sand_attempts: number | null
          sand_save_percentage: number | null
          sand_saves: number | null
          scoring_average: number | null
          scoring_average_vs_par: number | null
          scramble_attempts: number | null
          scrambles_converted: number | null
          scrambling_percentage: number | null
          season_start_date: string | null
          sg_approach_per_round: number | null
          sg_around_green_per_round: number | null
          sg_putting_per_round: number | null
          sg_tee_per_round: number | null
          sg_total_per_round: number | null
          strokes_gained_approach: number | null
          strokes_gained_around_green: number | null
          strokes_gained_putting: number | null
          strokes_gained_tee: number | null
          strokes_gained_total: number | null
          three_putt_percentage: number | null
          total_penalties: number | null
          total_putts: number | null
          trend_direction: string | null
          triple_plus: number | null
          up_and_down_percentage: number | null
          updated_at: string | null
          worst_round: number | null
        }
        Insert: {
          approach_miss_left_pct?: number | null
          approach_miss_long_pct?: number | null
          approach_miss_right_pct?: number | null
          approach_miss_short_pct?: number | null
          approach_proximity_average?: number | null
          best_round?: number | null
          birdies?: number | null
          bogeys?: number | null
          calculation_period_end?: string | null
          calculation_period_start?: string | null
          created_at?: string | null
          double_bogeys?: number | null
          driving_accuracy_percentage?: number | null
          driving_distance_average?: number | null
          eagles?: number | null
          engine_version?: string | null
          fairways_hit?: number | null
          fairways_total?: number | null
          gir_percentage?: number | null
          greens_hit?: number | null
          greens_total?: number | null
          id?: string
          improvement_trend?: number | null
          is_stale?: boolean | null
          last_10_average?: number | null
          last_5_average?: number | null
          last_round_date?: string | null
          next_refresh_due?: string | null
          one_putt_percentage?: number | null
          par3_average?: number | null
          par4_average?: number | null
          par5_average?: number | null
          pars?: number | null
          penalty_strokes_per_round?: number | null
          player_id: string
          putt_make_pct_0_3ft?: number | null
          putt_make_pct_10_15ft?: number | null
          putt_make_pct_15_20ft?: number | null
          putt_make_pct_20_plus_ft?: number | null
          putt_make_pct_3_5ft?: number | null
          putt_make_pct_5_10ft?: number | null
          putt_make_pct_left_to_right?: number | null
          putt_make_pct_right_to_left?: number | null
          putt_make_pct_straight?: number | null
          putts_per_gir?: number | null
          putts_per_round?: number | null
          round_ids_included?: string[] | null
          rounds_in_calculation?: number | null
          rounds_played?: number | null
          rounds_this_season?: number | null
          sand_attempts?: number | null
          sand_save_percentage?: number | null
          sand_saves?: number | null
          scoring_average?: number | null
          scoring_average_vs_par?: number | null
          scramble_attempts?: number | null
          scrambles_converted?: number | null
          scrambling_percentage?: number | null
          season_start_date?: string | null
          sg_approach_per_round?: number | null
          sg_around_green_per_round?: number | null
          sg_putting_per_round?: number | null
          sg_tee_per_round?: number | null
          sg_total_per_round?: number | null
          strokes_gained_approach?: number | null
          strokes_gained_around_green?: number | null
          strokes_gained_putting?: number | null
          strokes_gained_tee?: number | null
          strokes_gained_total?: number | null
          three_putt_percentage?: number | null
          total_penalties?: number | null
          total_putts?: number | null
          trend_direction?: string | null
          triple_plus?: number | null
          up_and_down_percentage?: number | null
          updated_at?: string | null
          worst_round?: number | null
        }
        Update: {
          approach_miss_left_pct?: number | null
          approach_miss_long_pct?: number | null
          approach_miss_right_pct?: number | null
          approach_miss_short_pct?: number | null
          approach_proximity_average?: number | null
          best_round?: number | null
          birdies?: number | null
          bogeys?: number | null
          calculation_period_end?: string | null
          calculation_period_start?: string | null
          created_at?: string | null
          double_bogeys?: number | null
          driving_accuracy_percentage?: number | null
          driving_distance_average?: number | null
          eagles?: number | null
          engine_version?: string | null
          fairways_hit?: number | null
          fairways_total?: number | null
          gir_percentage?: number | null
          greens_hit?: number | null
          greens_total?: number | null
          id?: string
          improvement_trend?: number | null
          is_stale?: boolean | null
          last_10_average?: number | null
          last_5_average?: number | null
          last_round_date?: string | null
          next_refresh_due?: string | null
          one_putt_percentage?: number | null
          par3_average?: number | null
          par4_average?: number | null
          par5_average?: number | null
          pars?: number | null
          penalty_strokes_per_round?: number | null
          player_id?: string
          putt_make_pct_0_3ft?: number | null
          putt_make_pct_10_15ft?: number | null
          putt_make_pct_15_20ft?: number | null
          putt_make_pct_20_plus_ft?: number | null
          putt_make_pct_3_5ft?: number | null
          putt_make_pct_5_10ft?: number | null
          putt_make_pct_left_to_right?: number | null
          putt_make_pct_right_to_left?: number | null
          putt_make_pct_straight?: number | null
          putts_per_gir?: number | null
          putts_per_round?: number | null
          round_ids_included?: string[] | null
          rounds_in_calculation?: number | null
          rounds_played?: number | null
          rounds_this_season?: number | null
          sand_attempts?: number | null
          sand_save_percentage?: number | null
          sand_saves?: number | null
          scoring_average?: number | null
          scoring_average_vs_par?: number | null
          scramble_attempts?: number | null
          scrambles_converted?: number | null
          scrambling_percentage?: number | null
          season_start_date?: string | null
          sg_approach_per_round?: number | null
          sg_around_green_per_round?: number | null
          sg_putting_per_round?: number | null
          sg_tee_per_round?: number | null
          sg_total_per_round?: number | null
          strokes_gained_approach?: number | null
          strokes_gained_around_green?: number | null
          strokes_gained_putting?: number | null
          strokes_gained_tee?: number | null
          strokes_gained_total?: number | null
          three_putt_percentage?: number | null
          total_penalties?: number | null
          total_putts?: number | null
          trend_direction?: string | null
          triple_plus?: number | null
          up_and_down_percentage?: number | null
          updated_at?: string | null
          worst_round?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_stats_cache_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_players: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          gpa: number | null
          graduation_year: number | null
          handicap: number | null
          handicap_index: number | null
          high_school_name: string | null
          hometown: string | null
          id: string
          last_name: string | null
          onboarding_completed: boolean | null
          phone: string | null
          profile_complete: boolean | null
          state: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          gpa?: number | null
          graduation_year?: number | null
          handicap?: number | null
          handicap_index?: number | null
          high_school_name?: string | null
          hometown?: string | null
          id?: string
          last_name?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          profile_complete?: boolean | null
          state?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          gpa?: number | null
          graduation_year?: number | null
          handicap?: number | null
          handicap_index?: number | null
          high_school_name?: string | null
          hometown?: string | null
          id?: string
          last_name?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          profile_complete?: boolean | null
          state?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_prediction_model_performance: {
        Row: {
          accuracy_by_confidence: Json | null
          accuracy_rate: number | null
          calibration_score: number | null
          created_at: string | null
          error_distribution: Json | null
          id: string
          mean_absolute_error: number | null
          model_type: string
          model_version: string | null
          overconfidence_rate: number | null
          period_end: string
          period_start: string
          predictions_made: number | null
          predictions_validated: number | null
          root_mean_square_error: number | null
          systematic_bias: number | null
          team_id: string | null
          underconfidence_rate: number | null
          updated_at: string | null
        }
        Insert: {
          accuracy_by_confidence?: Json | null
          accuracy_rate?: number | null
          calibration_score?: number | null
          created_at?: string | null
          error_distribution?: Json | null
          id?: string
          mean_absolute_error?: number | null
          model_type: string
          model_version?: string | null
          overconfidence_rate?: number | null
          period_end: string
          period_start: string
          predictions_made?: number | null
          predictions_validated?: number | null
          root_mean_square_error?: number | null
          systematic_bias?: number | null
          team_id?: string | null
          underconfidence_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          accuracy_by_confidence?: Json | null
          accuracy_rate?: number | null
          calibration_score?: number | null
          created_at?: string | null
          error_distribution?: Json | null
          id?: string
          mean_absolute_error?: number | null
          model_type?: string
          model_version?: string | null
          overconfidence_rate?: number | null
          period_end?: string
          period_start?: string
          predictions_made?: number | null
          predictions_validated?: number | null
          root_mean_square_error?: number | null
          systematic_bias?: number | null
          team_id?: string | null
          underconfidence_rate?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_prediction_model_performance_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_prediction_validations: {
        Row: {
          actual_value: number | null
          direction: string | null
          error: number | null
          error_pct: number | null
          id: string
          player_id: string
          predicted_value: number | null
          prediction_id: string | null
          validated_at: string | null
          within_interval: boolean | null
        }
        Insert: {
          actual_value?: number | null
          direction?: string | null
          error?: number | null
          error_pct?: number | null
          id?: string
          player_id: string
          predicted_value?: number | null
          prediction_id?: string | null
          validated_at?: string | null
          within_interval?: boolean | null
        }
        Update: {
          actual_value?: number | null
          direction?: string | null
          error?: number | null
          error_pct?: number | null
          id?: string
          player_id?: string
          predicted_value?: number | null
          prediction_id?: string | null
          validated_at?: string | null
          within_interval?: boolean | null
        }
        Relationships: []
      }
      golf_predictions: {
        Row: {
          actual_value: number | null
          confidence: number
          confidence_factors: Json | null
          confidence_interval_high: number | null
          confidence_interval_low: number | null
          created_at: string | null
          due_date: string | null
          error_analysis: Json | null
          error_category: string | null
          id: string
          input_features: Json | null
          key_drivers: Json | null
          metric: string
          model_version: string | null
          player_id: string
          predicted_high: number | null
          predicted_low: number | null
          predicted_value: number
          prediction_context: Json | null
          prediction_window_days: number | null
          related_event_id: string | null
          related_round_id: string | null
          trend: string | null
          updated_at: string | null
          validated_at: string | null
          was_accurate: boolean | null
        }
        Insert: {
          actual_value?: number | null
          confidence?: number
          confidence_factors?: Json | null
          confidence_interval_high?: number | null
          confidence_interval_low?: number | null
          created_at?: string | null
          due_date?: string | null
          error_analysis?: Json | null
          error_category?: string | null
          id?: string
          input_features?: Json | null
          key_drivers?: Json | null
          metric: string
          model_version?: string | null
          player_id: string
          predicted_high?: number | null
          predicted_low?: number | null
          predicted_value: number
          prediction_context?: Json | null
          prediction_window_days?: number | null
          related_event_id?: string | null
          related_round_id?: string | null
          trend?: string | null
          updated_at?: string | null
          validated_at?: string | null
          was_accurate?: boolean | null
        }
        Update: {
          actual_value?: number | null
          confidence?: number
          confidence_factors?: Json | null
          confidence_interval_high?: number | null
          confidence_interval_low?: number | null
          created_at?: string | null
          due_date?: string | null
          error_analysis?: Json | null
          error_category?: string | null
          id?: string
          input_features?: Json | null
          key_drivers?: Json | null
          metric?: string
          model_version?: string | null
          player_id?: string
          predicted_high?: number | null
          predicted_low?: number | null
          predicted_value?: number
          prediction_context?: Json | null
          prediction_window_days?: number | null
          related_event_id?: string | null
          related_round_id?: string | null
          trend?: string | null
          updated_at?: string | null
          validated_at?: string | null
          was_accurate?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_predictions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_predictions_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_predictions_related_round_id_fkey"
            columns: ["related_round_id"]
            isOneToOne: false
            referencedRelation: "golf_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_qualifier_entries: {
        Row: {
          created_at: string | null
          id: string
          is_tied: boolean | null
          notes: string | null
          player_id: string
          position: number | null
          qualifier_id: string
          round_id: string | null
          rounds_completed: number | null
          score: number | null
          status: string | null
          total_score: number | null
          total_to_par: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_tied?: boolean | null
          notes?: string | null
          player_id: string
          position?: number | null
          qualifier_id: string
          round_id?: string | null
          rounds_completed?: number | null
          score?: number | null
          status?: string | null
          total_score?: number | null
          total_to_par?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_tied?: boolean | null
          notes?: string | null
          player_id?: string
          position?: number | null
          qualifier_id?: string
          round_id?: string | null
          rounds_completed?: number | null
          score?: number | null
          status?: string | null
          total_score?: number | null
          total_to_par?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_qualifier_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_qualifier_entries_qualifier_id_fkey"
            columns: ["qualifier_id"]
            isOneToOne: false
            referencedRelation: "golf_qualifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_qualifier_entries_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "golf_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_qualifiers: {
        Row: {
          course_id: string | null
          course_name: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          entry_deadline: string | null
          id: string
          name: string
          rules: string | null
          spots_available: number | null
          start_date: string
          status: string | null
          team_id: string
          updated_at: string | null
        }
        Insert: {
          course_id?: string | null
          course_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          entry_deadline?: string | null
          id?: string
          name: string
          rules?: string | null
          spots_available?: number | null
          start_date: string
          status?: string | null
          team_id: string
          updated_at?: string | null
        }
        Update: {
          course_id?: string | null
          course_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          entry_deadline?: string | null
          id?: string
          name?: string
          rules?: string | null
          spots_available?: number | null
          start_date?: string
          status?: string | null
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_qualifiers_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_qualifiers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_qualifiers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_review_events: {
        Row: {
          actor_id: string | null
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          notes: string | null
          player_id: string
          review_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          notes?: string | null
          player_id: string
          review_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          notes?: string | null
          player_id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_review_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_review_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_review_events_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "golf_round_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_review_insights: {
        Row: {
          coach_accuracy: string | null
          coach_accuracy_at: string | null
          coach_notes: string | null
          confidence: number | null
          created_at: string | null
          created_focus_area_id: string | null
          description: string
          display_order: number | null
          evidence: Json | null
          hole_numbers: number[] | null
          id: string
          insight_type: string
          is_hidden: boolean | null
          is_highlighted: boolean | null
          metric_baseline: number | null
          metric_comparison: string | null
          metric_name: string | null
          metric_value: number | null
          player_id: string
          review_id: string
          round_id: string
          severity: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          coach_accuracy?: string | null
          coach_accuracy_at?: string | null
          coach_notes?: string | null
          confidence?: number | null
          created_at?: string | null
          created_focus_area_id?: string | null
          description: string
          display_order?: number | null
          evidence?: Json | null
          hole_numbers?: number[] | null
          id?: string
          insight_type: string
          is_hidden?: boolean | null
          is_highlighted?: boolean | null
          metric_baseline?: number | null
          metric_comparison?: string | null
          metric_name?: string | null
          metric_value?: number | null
          player_id: string
          review_id: string
          round_id: string
          severity?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          coach_accuracy?: string | null
          coach_accuracy_at?: string | null
          coach_notes?: string | null
          confidence?: number | null
          created_at?: string | null
          created_focus_area_id?: string | null
          description?: string
          display_order?: number | null
          evidence?: Json | null
          hole_numbers?: number[] | null
          id?: string
          insight_type?: string
          is_hidden?: boolean | null
          is_highlighted?: boolean | null
          metric_baseline?: number | null
          metric_comparison?: string | null
          metric_name?: string | null
          metric_value?: number | null
          player_id?: string
          review_id?: string
          round_id?: string
          severity?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_review_insights_created_focus_area_id_fkey"
            columns: ["created_focus_area_id"]
            isOneToOne: false
            referencedRelation: "golf_player_focus_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_review_insights_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_review_insights_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "golf_round_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_review_insights_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "golf_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_round_reviews: {
        Row: {
          action_items: Json | null
          ai_model_version: string | null
          areas_count: number | null
          areas_to_review: Json | null
          coach_feedback_text: string | null
          coach_notes: string | null
          coach_rating: number | null
          coach_viewed_at: string | null
          created_at: string | null
          engine_version: string | null
          generation_method: string | null
          highlights: Json | null
          highlights_count: number | null
          id: string
          insights_count: number | null
          last_regenerated_at: string | null
          next_practice_priority: string | null
          patterns_detected: Json | null
          player_acknowledged_at: string | null
          player_id: string
          player_viewed_at: string | null
          primary_takeaway: string | null
          published_at: string | null
          published_by: string | null
          regeneration_count: number | null
          round_id: string
          round_score: number | null
          round_score_to_par: number | null
          round_stats: Json | null
          scoring_avg_after: number | null
          scoring_avg_before: number | null
          sentiment_score: number | null
          shared_at: string | null
          shared_with_coach: boolean | null
          shared_with_player: boolean | null
          status: string | null
          summary: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          action_items?: Json | null
          ai_model_version?: string | null
          areas_count?: number | null
          areas_to_review?: Json | null
          coach_feedback_text?: string | null
          coach_notes?: string | null
          coach_rating?: number | null
          coach_viewed_at?: string | null
          created_at?: string | null
          engine_version?: string | null
          generation_method?: string | null
          highlights?: Json | null
          highlights_count?: number | null
          id?: string
          insights_count?: number | null
          last_regenerated_at?: string | null
          next_practice_priority?: string | null
          patterns_detected?: Json | null
          player_acknowledged_at?: string | null
          player_id: string
          player_viewed_at?: string | null
          primary_takeaway?: string | null
          published_at?: string | null
          published_by?: string | null
          regeneration_count?: number | null
          round_id: string
          round_score?: number | null
          round_score_to_par?: number | null
          round_stats?: Json | null
          scoring_avg_after?: number | null
          scoring_avg_before?: number | null
          sentiment_score?: number | null
          shared_at?: string | null
          shared_with_coach?: boolean | null
          shared_with_player?: boolean | null
          status?: string | null
          summary?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          action_items?: Json | null
          ai_model_version?: string | null
          areas_count?: number | null
          areas_to_review?: Json | null
          coach_feedback_text?: string | null
          coach_notes?: string | null
          coach_rating?: number | null
          coach_viewed_at?: string | null
          created_at?: string | null
          engine_version?: string | null
          generation_method?: string | null
          highlights?: Json | null
          highlights_count?: number | null
          id?: string
          insights_count?: number | null
          last_regenerated_at?: string | null
          next_practice_priority?: string | null
          patterns_detected?: Json | null
          player_acknowledged_at?: string | null
          player_id?: string
          player_viewed_at?: string | null
          primary_takeaway?: string | null
          published_at?: string | null
          published_by?: string | null
          regeneration_count?: number | null
          round_id?: string
          round_score?: number | null
          round_score_to_par?: number | null
          round_stats?: Json | null
          scoring_avg_after?: number | null
          scoring_avg_before?: number | null
          sentiment_score?: number | null
          shared_at?: string | null
          shared_with_coach?: boolean | null
          shared_with_player?: boolean | null
          status?: string | null
          summary?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_round_reviews_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_round_reviews_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_round_reviews_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: true
            referencedRelation: "golf_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_round_stats_cache: {
        Row: {
          back_nine: number | null
          birdies: number | null
          bogeys: number | null
          created_at: string | null
          detailed_stats: Json | null
          double_bogeys: number | null
          driving_distance_avg: number | null
          eagles: number | null
          fairways_hit: number | null
          fairways_total: number | null
          front_nine: number | null
          greens_hit: number | null
          greens_total: number | null
          id: string
          one_putts: number | null
          pars: number | null
          penalty_strokes: number | null
          player_id: string
          round_id: string
          sand_attempts: number | null
          sand_saves: number | null
          score_to_par: number | null
          scramble_attempts: number | null
          scrambles_converted: number | null
          strokes_gained_approach: number | null
          strokes_gained_around_green: number | null
          strokes_gained_putting: number | null
          strokes_gained_tee: number | null
          strokes_gained_total: number | null
          three_putts: number | null
          total_putts: number | null
          total_score: number | null
          triple_plus: number | null
          updated_at: string | null
        }
        Insert: {
          back_nine?: number | null
          birdies?: number | null
          bogeys?: number | null
          created_at?: string | null
          detailed_stats?: Json | null
          double_bogeys?: number | null
          driving_distance_avg?: number | null
          eagles?: number | null
          fairways_hit?: number | null
          fairways_total?: number | null
          front_nine?: number | null
          greens_hit?: number | null
          greens_total?: number | null
          id?: string
          one_putts?: number | null
          pars?: number | null
          penalty_strokes?: number | null
          player_id: string
          round_id: string
          sand_attempts?: number | null
          sand_saves?: number | null
          score_to_par?: number | null
          scramble_attempts?: number | null
          scrambles_converted?: number | null
          strokes_gained_approach?: number | null
          strokes_gained_around_green?: number | null
          strokes_gained_putting?: number | null
          strokes_gained_tee?: number | null
          strokes_gained_total?: number | null
          three_putts?: number | null
          total_putts?: number | null
          total_score?: number | null
          triple_plus?: number | null
          updated_at?: string | null
        }
        Update: {
          back_nine?: number | null
          birdies?: number | null
          bogeys?: number | null
          created_at?: string | null
          detailed_stats?: Json | null
          double_bogeys?: number | null
          driving_distance_avg?: number | null
          eagles?: number | null
          fairways_hit?: number | null
          fairways_total?: number | null
          front_nine?: number | null
          greens_hit?: number | null
          greens_total?: number | null
          id?: string
          one_putts?: number | null
          pars?: number | null
          penalty_strokes?: number | null
          player_id?: string
          round_id?: string
          sand_attempts?: number | null
          sand_saves?: number | null
          score_to_par?: number | null
          scramble_attempts?: number | null
          scrambles_converted?: number | null
          strokes_gained_approach?: number | null
          strokes_gained_around_green?: number | null
          strokes_gained_putting?: number | null
          strokes_gained_tee?: number | null
          strokes_gained_total?: number | null
          three_putts?: number | null
          total_putts?: number | null
          total_score?: number | null
          triple_plus?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_round_stats_cache_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_round_stats_cache_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: true
            referencedRelation: "golf_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_rounds: {
        Row: {
          back_nine: number | null
          course_city: string | null
          course_id: string | null
          course_name: string | null
          course_rating: number | null
          course_slope: number | null
          course_state: string | null
          created_at: string | null
          current_hole: number | null
          draft_data: Json | null
          front_nine: number | null
          holes_played: number | null
          id: string
          notes: string | null
          player_id: string
          qualifier_id: string | null
          qualifier_round_number: number | null
          round_date: string
          round_type: string | null
          score_to_par: number | null
          status: string | null
          strokes_gained_approach: number | null
          strokes_gained_around_green: number | null
          strokes_gained_putting: number | null
          strokes_gained_tee: number | null
          strokes_gained_total: number | null
          team_id: string | null
          tees_played: string | null
          total_fairways: number | null
          total_fairways_hit: number | null
          total_gir: number | null
          total_gir_possible: number | null
          total_penalties: number | null
          total_putts: number | null
          total_score: number | null
          updated_at: string | null
          weather_conditions: string | null
        }
        Insert: {
          back_nine?: number | null
          course_city?: string | null
          course_id?: string | null
          course_name?: string | null
          course_rating?: number | null
          course_slope?: number | null
          course_state?: string | null
          created_at?: string | null
          current_hole?: number | null
          draft_data?: Json | null
          front_nine?: number | null
          holes_played?: number | null
          id?: string
          notes?: string | null
          player_id: string
          qualifier_id?: string | null
          qualifier_round_number?: number | null
          round_date: string
          round_type?: string | null
          score_to_par?: number | null
          status?: string | null
          strokes_gained_approach?: number | null
          strokes_gained_around_green?: number | null
          strokes_gained_putting?: number | null
          strokes_gained_tee?: number | null
          strokes_gained_total?: number | null
          team_id?: string | null
          tees_played?: string | null
          total_fairways?: number | null
          total_fairways_hit?: number | null
          total_gir?: number | null
          total_gir_possible?: number | null
          total_penalties?: number | null
          total_putts?: number | null
          total_score?: number | null
          updated_at?: string | null
          weather_conditions?: string | null
        }
        Update: {
          back_nine?: number | null
          course_city?: string | null
          course_id?: string | null
          course_name?: string | null
          course_rating?: number | null
          course_slope?: number | null
          course_state?: string | null
          created_at?: string | null
          current_hole?: number | null
          draft_data?: Json | null
          front_nine?: number | null
          holes_played?: number | null
          id?: string
          notes?: string | null
          player_id?: string
          qualifier_id?: string | null
          qualifier_round_number?: number | null
          round_date?: string
          round_type?: string | null
          score_to_par?: number | null
          status?: string | null
          strokes_gained_approach?: number | null
          strokes_gained_around_green?: number | null
          strokes_gained_putting?: number | null
          strokes_gained_tee?: number | null
          strokes_gained_total?: number | null
          team_id?: string | null
          tees_played?: string | null
          total_fairways?: number | null
          total_fairways_hit?: number | null
          total_gir?: number | null
          total_gir_possible?: number | null
          total_penalties?: number | null
          total_putts?: number | null
          total_score?: number | null
          updated_at?: string | null
          weather_conditions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_rounds_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_rounds_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_rounds_qualifier_id_fkey"
            columns: ["qualifier_id"]
            isOneToOne: false
            referencedRelation: "golf_qualifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_rounds_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_shots: {
        Row: {
          club_type: string | null
          created_at: string | null
          distance_to_hole_after: number | null
          distance_to_hole_before: number | null
          distance_unit: string | null
          distance_unit_after: string | null
          distance_unit_before: string | null
          hole_id: string | null
          hole_number: number
          id: string
          is_penalty: boolean | null
          lie_after: string | null
          lie_before: string | null
          miss_direction: string | null
          notes: string | null
          penalty_type: string | null
          putt_break: string | null
          putt_distance_feet: number | null
          putt_made: boolean | null
          putt_slope: string | null
          result: string | null
          round_id: string
          shot_distance: number | null
          shot_number: number
          shot_type: string | null
          updated_at: string | null
        }
        Insert: {
          club_type?: string | null
          created_at?: string | null
          distance_to_hole_after?: number | null
          distance_to_hole_before?: number | null
          distance_unit?: string | null
          distance_unit_after?: string | null
          distance_unit_before?: string | null
          hole_id?: string | null
          hole_number: number
          id?: string
          is_penalty?: boolean | null
          lie_after?: string | null
          lie_before?: string | null
          miss_direction?: string | null
          notes?: string | null
          penalty_type?: string | null
          putt_break?: string | null
          putt_distance_feet?: number | null
          putt_made?: boolean | null
          putt_slope?: string | null
          result?: string | null
          round_id: string
          shot_distance?: number | null
          shot_number: number
          shot_type?: string | null
          updated_at?: string | null
        }
        Update: {
          club_type?: string | null
          created_at?: string | null
          distance_to_hole_after?: number | null
          distance_to_hole_before?: number | null
          distance_unit?: string | null
          distance_unit_after?: string | null
          distance_unit_before?: string | null
          hole_id?: string | null
          hole_number?: number
          id?: string
          is_penalty?: boolean | null
          lie_after?: string | null
          lie_before?: string | null
          miss_direction?: string | null
          notes?: string | null
          penalty_type?: string | null
          putt_break?: string | null
          putt_distance_feet?: number | null
          putt_made?: boolean | null
          putt_slope?: string | null
          result?: string | null
          round_id?: string
          shot_distance?: number | null
          shot_number?: number
          shot_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_shots_hole_id_fkey"
            columns: ["hole_id"]
            isOneToOne: false
            referencedRelation: "golf_holes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_shots_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "golf_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_task_assignments: {
        Row: {
          assigned_at: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          notes: string | null
          player_id: string
          status: string | null
          task_id: string
          updated_at: string | null
          upload_url: string | null
        }
        Insert: {
          assigned_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          player_id: string
          status?: string | null
          task_id: string
          updated_at?: string | null
          upload_url?: string | null
        }
        Update: {
          assigned_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          player_id?: string
          status?: string | null
          task_id?: string
          updated_at?: string | null
          upload_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_task_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "golf_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_task_reminders: {
        Row: {
          created_at: string
          error: string | null
          id: string
          reminder_type: Database["public"]["Enums"]["reminder_type"]
          scheduled_for: string
          sent: boolean
          sent_at: string | null
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          reminder_type?: Database["public"]["Enums"]["reminder_type"]
          scheduled_for: string
          sent?: boolean
          sent_at?: string | null
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          reminder_type?: Database["public"]["Enums"]["reminder_type"]
          scheduled_for?: string
          sent?: boolean
          sent_at?: string | null
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_task_reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "golf_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_task_templates: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          default_assignee_type: string | null
          default_due_days: number | null
          default_priority: string | null
          description: string | null
          id: string
          team_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          default_assignee_type?: string | null
          default_due_days?: number | null
          default_priority?: string | null
          description?: string | null
          id?: string
          team_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          default_assignee_type?: string | null
          default_due_days?: number | null
          default_priority?: string | null
          description?: string | null
          id?: string
          team_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_task_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_task_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_tasks: {
        Row: {
          assigned_by: string | null
          assigned_to: string | null
          category: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string | null
          reminder_at: string | null
          reminder_sent: boolean | null
          reminder_type: Database["public"]["Enums"]["reminder_type"] | null
          status: string | null
          task_type: string | null
          team_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_by?: string | null
          assigned_to?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          reminder_at?: string | null
          reminder_sent?: boolean | null
          reminder_type?: Database["public"]["Enums"]["reminder_type"] | null
          status?: string | null
          task_type?: string | null
          team_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_by?: string | null
          assigned_to?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          reminder_at?: string | null
          reminder_sent?: boolean | null
          reminder_type?: Database["public"]["Enums"]["reminder_type"] | null
          status?: string | null
          task_type?: string | null
          team_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_team_coach_staff: {
        Row: {
          coach_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          role: string | null
          team_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          role?: string | null
          team_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          role?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_team_coach_staff_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_team_coach_staff_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_team_coachhelm_settings: {
        Row: {
          created_at: string
          disabled_at: string | null
          disabled_by: string | null
          disabled_reason: string | null
          enabled: boolean
          id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          enabled?: boolean
          id?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          enabled?: boolean
          id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_team_coachhelm_settings_disabled_by_fkey"
            columns: ["disabled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_team_coachhelm_settings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_team_join_requests: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          player_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          team_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          player_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          team_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          player_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_team_join_requests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_team_join_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_team_join_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_team_members: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          id: string
          jersey_number: number | null
          joined_at: string | null
          player_id: string
          status: Database["public"]["Enums"]["team_member_status"] | null
          team_id: string
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          jersey_number?: number | null
          joined_at?: string | null
          player_id: string
          status?: Database["public"]["Enums"]["team_member_status"] | null
          team_id: string
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          jersey_number?: number | null
          joined_at?: string | null
          player_id?: string
          status?: Database["public"]["Enums"]["team_member_status"] | null
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_team_members_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_team_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_team_settings: {
        Row: {
          created_at: string | null
          default_tees: string | null
          handicap_system: string | null
          id: string
          scoring_format: string | null
          team_id: string
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_tees?: string | null
          handicap_system?: string | null
          id?: string
          scoring_format?: string | null
          team_id: string
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_tees?: string | null
          handicap_system?: string | null
          id?: string
          scoring_format?: string | null
          team_id?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_team_settings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_teams: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          join_code: string
          logo_url: string | null
          name: string
          organization_id: string | null
          primary_color: string | null
          season: string | null
          secondary_color: string | null
          timezone: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          join_code: string
          logo_url?: string | null
          name: string
          organization_id?: string | null
          primary_color?: string | null
          season?: string | null
          secondary_color?: string | null
          timezone?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          join_code?: string
          logo_url?: string | null
          name?: string
          organization_id?: string | null
          primary_color?: string | null
          season?: string | null
          secondary_color?: string | null
          timezone?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_tracer_health_snapshot: {
        Row: {
          avg_round_quality_score: number | null
          completion_pct: number | null
          created_at: string | null
          error_count_7d: number | null
          health_score: number | null
          id: string
          players_with_stale_cache: number | null
          quality_score: number | null
          snapped_at: string | null
          stuck_rounds: number | null
          total_rounds_tracked: number | null
        }
        Insert: {
          avg_round_quality_score?: number | null
          completion_pct?: number | null
          created_at?: string | null
          error_count_7d?: number | null
          health_score?: number | null
          id?: string
          players_with_stale_cache?: number | null
          quality_score?: number | null
          snapped_at?: string | null
          stuck_rounds?: number | null
          total_rounds_tracked?: number | null
        }
        Update: {
          avg_round_quality_score?: number | null
          completion_pct?: number | null
          created_at?: string | null
          error_count_7d?: number | null
          health_score?: number | null
          id?: string
          players_with_stale_cache?: number | null
          quality_score?: number | null
          snapped_at?: string | null
          stuck_rounds?: number | null
          total_rounds_tracked?: number | null
        }
        Relationships: []
      }
      golf_travel_budgets: {
        Row: {
          budgeted_amount: number
          category: Database["public"]["Enums"]["golf_expense_category"]
          created_at: string | null
          id: string
          itinerary_id: string
          updated_at: string | null
        }
        Insert: {
          budgeted_amount: number
          category: Database["public"]["Enums"]["golf_expense_category"]
          created_at?: string | null
          id?: string
          itinerary_id: string
          updated_at?: string | null
        }
        Update: {
          budgeted_amount?: number
          category?: Database["public"]["Enums"]["golf_expense_category"]
          created_at?: string | null
          id?: string
          itinerary_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_travel_budgets_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "golf_travel_itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_travel_expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["golf_expense_category"]
          created_at: string | null
          created_by: string
          description: string
          expense_date: string | null
          id: string
          itinerary_id: string | null
          notes: string | null
          paid_by: Database["public"]["Enums"]["golf_expense_paid_by"]
          receipt_url: string | null
          team_id: string
          updated_at: string | null
          vendor_name: string | null
        }
        Insert: {
          amount: number
          category?: Database["public"]["Enums"]["golf_expense_category"]
          created_at?: string | null
          created_by: string
          description: string
          expense_date?: string | null
          id?: string
          itinerary_id?: string | null
          notes?: string | null
          paid_by?: Database["public"]["Enums"]["golf_expense_paid_by"]
          receipt_url?: string | null
          team_id: string
          updated_at?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["golf_expense_category"]
          created_at?: string | null
          created_by?: string
          description?: string
          expense_date?: string | null
          id?: string
          itinerary_id?: string | null
          notes?: string | null
          paid_by?: Database["public"]["Enums"]["golf_expense_paid_by"]
          receipt_url?: string | null
          team_id?: string
          updated_at?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_travel_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_travel_expenses_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "golf_travel_itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_travel_expenses_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_travel_itineraries: {
        Row: {
          created_at: string | null
          created_by: string | null
          departure_date: string | null
          departure_location: string | null
          departure_time: string | null
          destination: string | null
          event_id: string | null
          event_name: string | null
          flight_info: Json | null
          gear_list: string[] | null
          hotel_address: string | null
          hotel_confirmation: string | null
          hotel_name: string | null
          hotel_phone: string | null
          id: string
          notes: string | null
          return_date: string | null
          return_time: string | null
          room_assignments: Json | null
          team_id: string
          transportation_type: string | null
          uniform_requirements: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          departure_date?: string | null
          departure_location?: string | null
          departure_time?: string | null
          destination?: string | null
          event_id?: string | null
          event_name?: string | null
          flight_info?: Json | null
          gear_list?: string[] | null
          hotel_address?: string | null
          hotel_confirmation?: string | null
          hotel_name?: string | null
          hotel_phone?: string | null
          id?: string
          notes?: string | null
          return_date?: string | null
          return_time?: string | null
          room_assignments?: Json | null
          team_id: string
          transportation_type?: string | null
          uniform_requirements?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          departure_date?: string | null
          departure_location?: string | null
          departure_time?: string | null
          destination?: string | null
          event_id?: string | null
          event_name?: string | null
          flight_info?: Json | null
          gear_list?: string[] | null
          hotel_address?: string | null
          hotel_confirmation?: string | null
          hotel_name?: string | null
          hotel_phone?: string | null
          id?: string
          notes?: string | null
          return_date?: string | null
          return_time?: string | null
          room_assignments?: Json | null
          team_id?: string
          transportation_type?: string | null
          uniform_requirements?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_travel_itineraries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_travel_itineraries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_travel_itineraries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_validations: {
        Row: {
          actual_value: number | null
          calibration_bucket: string | null
          created_at: string | null
          error_margin: number | null
          id: string
          player_id: string
          predicted_value: number
          prediction_id: string | null
          stated_confidence: number
          validated_at: string | null
          was_correct: boolean | null
        }
        Insert: {
          actual_value?: number | null
          calibration_bucket?: string | null
          created_at?: string | null
          error_margin?: number | null
          id?: string
          player_id: string
          predicted_value: number
          prediction_id?: string | null
          stated_confidence: number
          validated_at?: string | null
          was_correct?: boolean | null
        }
        Update: {
          actual_value?: number | null
          calibration_bucket?: string | null
          created_at?: string | null
          error_margin?: number | null
          id?: string
          player_id?: string
          predicted_value?: number
          prediction_id?: string | null
          stated_confidence?: number
          validated_at?: string | null
          was_correct?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_validations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_validations_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "golf_predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          created_at: string | null
          email: string
          failed_attempts: number | null
          id: string
          last_attempt: string | null
          last_ip: string | null
          last_user_agent: string | null
          locked_until: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          failed_attempts?: number | null
          id?: string
          last_attempt?: string | null
          last_ip?: string | null
          last_user_agent?: string | null
          locked_until?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          failed_attempts?: number | null
          id?: string
          last_attempt?: string | null
          last_ip?: string | null
          last_user_agent?: string | null
          locked_until?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string | null
          data: Json | null
          id: string
          read: boolean | null
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          read?: boolean | null
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          read?: boolean | null
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          banner_url: string | null
          conference: string | null
          created_at: string | null
          description: string | null
          division: string | null
          id: string
          location_city: string | null
          location_state: string | null
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          type: Database["public"]["Enums"]["organization_type"]
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          banner_url?: string | null
          conference?: string | null
          created_at?: string | null
          description?: string | null
          division?: string | null
          id?: string
          location_city?: string | null
          location_state?: string | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          type: Database["public"]["Enums"]["organization_type"]
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          banner_url?: string | null
          conference?: string | null
          created_at?: string | null
          description?: string | null
          division?: string | null
          id?: string
          location_city?: string | null
          location_state?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          device_name: string | null
          endpoint: string
          expiration_time: string | null
          failed_count: number
          id: string
          keys: Json
          last_push_at: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          endpoint: string
          expiration_time?: string | null
          failed_count?: number
          id?: string
          keys: Json
          last_push_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          endpoint?: string
          expiration_time?: string | null
          failed_count?: number
          id?: string
          keys?: Json
          last_push_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      putt_details: {
        Row: {
          break_direction: string | null
          created_at: string | null
          distance_feet: number | null
          estimated_break_inches: number | null
          id: string
          made: boolean
          miss_tags: string[] | null
          shot_id: string
          updated_at: string | null
        }
        Insert: {
          break_direction?: string | null
          created_at?: string | null
          distance_feet?: number | null
          estimated_break_inches?: number | null
          id?: string
          made?: boolean
          miss_tags?: string[] | null
          shot_id: string
          updated_at?: string | null
        }
        Update: {
          break_direction?: string | null
          created_at?: string | null
          distance_feet?: number | null
          estimated_break_inches?: number | null
          id?: string
          made?: boolean
          miss_tags?: string[] | null
          shot_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "putt_details_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: true
            referencedRelation: "golf_shots"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          last_seen: string | null
          notification_preferences: Json | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          last_seen?: string | null
          notification_preferences?: Json | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          last_seen?: string | null
          notification_preferences?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_round_strokes_gained: {
        Args: { p_round_id: string }
        Returns: {
          sg_approach: number
          sg_around_green: number
          sg_putting: number
          sg_tee: number
          sg_total: number
        }[]
      }
      get_admin_event_summary: { Args: { p_days_back?: number }; Returns: Json }
      get_api_performance_summary: {
        Args: { days_back?: number }
        Returns: {
          avg_ms: number
          error_rate: number
          p50_ms: number
          p95_ms: number
          p99_ms: number
          route: string
          total_errors: number
          total_requests: number
        }[]
      }
      get_audit_log_recent: { Args: { limit_count?: number }; Returns: Json }
      get_baseball_conversations_with_details: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          creator_id: string
          id: string
          last_message_at: string
          last_message_content: string
          last_message_sender_id: string
          participant_ids: string[]
          participant_names: string[]
          unread_count: number
          updated_at: string
        }[]
      }
      get_coach_effectiveness_metrics: {
        Args: never
        Returns: {
          avg_review_time_hours: number
          coach_id: string
          coach_name: string
          effectiveness_score: number
          has_philosophy: boolean
          player_count: number
          reviews_published: number
          team_count: number
        }[]
      }
      get_crm_coach_email_events: {
        Args: { p_coach_id: string }
        Returns: {
          event_type: string
          id: string
          occurred_at: string
          recipient_email: string
          subject: string
        }[]
      }
      get_crm_email_stats: { Args: never; Returns: Json }
      get_crm_email_stats_detailed: { Args: never; Returns: Json }
      get_crm_events_in_range: {
        Args: { p_end: string; p_start: string }
        Returns: {
          all_day: boolean
          coach_id: string
          coach_name: string
          coach_school: string
          description: string
          end_time: string
          event_type: Database["public"]["Enums"]["crm_event_type"]
          google_event_id: string
          id: string
          location: string
          meeting_url: string
          start_time: string
          status: string
          title: string
        }[]
      }
      get_current_golf_player_id: { Args: never; Returns: string }
      get_current_player_team_ids: { Args: never; Returns: string[] }
      get_enhanced_system_health: {
        Args: never
        Returns: {
          detail: string
          metric_name: string
          metric_value: string
          status: string
        }[]
      }
      get_error_summary: {
        Args: { days_back?: number }
        Returns: {
          by_severity: Json
          critical_count: number
          daily_rate: Json
          top_errors: Json
          total_count: number
        }[]
      }
      get_golf_conversations_with_details: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          creator_id: string
          id: string
          is_group: boolean
          is_team_channel: boolean
          last_message_at: string
          last_message_content: string
          last_message_sender_id: string
          participant_count: number
          participant_ids: string[]
          participant_names: string[]
          title: string
          unread_count: number
          updated_at: string
        }[]
      }
      get_golf_message_attachments: {
        Args: { p_message_id: string }
        Returns: {
          created_at: string
          duration_seconds: number
          file_name: string
          file_size: number
          file_type: string
          height: number
          id: string
          mime_type: string
          storage_path: string
          thumbnail_url: string
          width: number
        }[]
      }
      get_my_baseball_conversation_ids: { Args: never; Returns: string[] }
      get_my_coach_id: { Args: never; Returns: string }
      get_my_player_id: { Args: never; Returns: string }
      get_onboarding_funnel_analysis: {
        Args: never
        Returns: {
          completed_count: number
          completion_rate: number
          step_name: string
          step_order: number
          total_count: number
        }[]
      }
      get_pending_task_reminders: {
        Args: never
        Returns: {
          assigned_to: string
          due_date: string
          reminder_at: string
          task_id: string
          team_id: string
          title: string
        }[]
      }
      get_platform_health_stats: {
        Args: never
        Returns: {
          active_connections: number
          active_sessions: number
          active_users_1h: number
          active_users_24h: number
          active_users_30d: number
          active_users_7d: number
          db_size_bytes: number
          idle_connections: number
          largest_tables: Json
          total_auth_users: number
          total_sessions: number
          users_never_signed_in: number
          users_signed_in_today: number
        }[]
      }
      get_player_stats_summary: {
        Args: { p_player_id: string }
        Returns: {
          best_round: number
          fairway_percentage: number
          gir_percentage: number
          improvement_trend: number
          is_stale: boolean
          last_10_average: number
          last_5_average: number
          last_updated: string
          putts_per_round: number
          rounds_played: number
          scoring_average: number
          scrambling_percentage: number
          trend_direction: string
          worst_round: number
        }[]
      }
      get_qualifier_leaderboard: {
        Args: { qualifier_uuid: string }
        Returns: {
          avg_score: number
          best_score: number
          first_name: string
          last_name: string
          player_id: string
          rounds_played: number
          total_score: number
        }[]
      }
      get_team_health_dashboard: {
        Args: never
        Returns: {
          active_30d: number
          active_7d: number
          avg_rounds_per_player: number
          has_ai_philosophy: boolean
          health_score: number
          health_tier: string
          member_count: number
          org_name: string
          rounds_30d: number
          team_id: string
          team_name: string
        }[]
      }
      get_user_engagement_summary: {
        Args: { time_range_days?: number }
        Returns: {
          days_since_signup: number
          email: string
          engagement_score: number
          events_attended: number
          insights_acknowledged: number
          last_active_at: string
          lifecycle_stage: string
          messages_in_period: number
          reviews_in_period: number
          role: string
          rounds_in_period: number
          user_id: string
        }[]
      }
      get_user_golf_organization_id: { Args: never; Returns: string }
      get_user_golf_team_ids: { Args: never; Returns: string[] }
      get_user_last_active: {
        Args: never
        Returns: {
          last_active_at: string
          user_id: string
        }[]
      }
      get_users_with_auth: { Args: never; Returns: Json }
      heartbeat: { Args: never; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_baseball_primary_coach: {
        Args: { p_team_id: string }
        Returns: boolean
      }
      is_baseball_team_coach: { Args: { team_uuid: string }; Returns: boolean }
      is_baseball_team_coach_v2: {
        Args: { p_team_id: string }
        Returns: boolean
      }
      is_baseball_team_member: { Args: { team_uuid: string }; Returns: boolean }
      is_baseball_team_member_v2: {
        Args: { p_team_id: string }
        Returns: boolean
      }
      is_baseball_team_player: { Args: { team_uuid: string }; Returns: boolean }
      is_golf_team_coach: { Args: { team_uuid: string }; Returns: boolean }
      is_golf_team_player: { Args: { team_uuid: string }; Returns: boolean }
      mark_player_stats_stale: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      mark_task_reminder_sent: { Args: { p_task_id: string }; Returns: boolean }
      recalculate_baseball_season_stats: {
        Args: { p_player_id: string; p_season_year?: number; p_team_id: string }
        Returns: undefined
      }
      recalculate_round_strokes_gained: {
        Args: { p_round_id: string }
        Returns: undefined
      }
      recalculate_team_baseball_season_stats: {
        Args: { p_season_year?: number; p_team_id: string }
        Returns: undefined
      }
      refresh_player_stats_cache: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      save_partial_round_atomic: {
        Args: {
          p_approach_details?: Json
          p_expected_updated_at?: string
          p_holes: Json
          p_putt_details?: Json
          p_round_data: Json
          p_round_id: string
          p_shots: Json
        }
        Returns: Json
      }
      sg_estimate_from_holes: {
        Args: { p_round_id: string }
        Returns: {
          sg_approach: number
          sg_around_green: number
          sg_off_tee: number
          sg_putting: number
        }[]
      }
      sg_expected_strokes: {
        Args: { p_distance_yards: number; p_lie: string }
        Returns: number
      }
      sg_normalize_lie: { Args: { p_lie: string }; Returns: string }
      submit_round_atomic: {
        Args: {
          p_approach_details?: Json
          p_holes: Json
          p_putt_details?: Json
          p_round_data: Json
          p_round_id: string
          p_shots: Json
        }
        Returns: Json
      }
      update_player_stats_strokes_gained: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      update_qualifier_leaderboard: {
        Args: { p_qualifier_id: string }
        Returns: undefined
      }
      update_user_last_seen: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      user_conversation_ids: { Args: { p_user_id: string }; Returns: string[] }
      user_has_pending_join_request_to_coach_team: {
        Args: { check_player_id: string }
        Returns: boolean
      }
      user_is_coach_of_golf_player: {
        Args: { check_player_id: string }
        Returns: boolean
      }
      user_is_golf_team_member: {
        Args: { check_team_id: string }
        Returns: boolean
      }
      user_is_teammate_of_golf_player: {
        Args: { check_player_id: string }
        Returns: boolean
      }
    }
    Enums: {
      admin_event_severity: "info" | "warning" | "error" | "critical"
      baseball_coach_type: "college" | "juco" | "high_school" | "showcase"
      baseball_pipeline_stage:
        | "watchlist"
        | "high_priority"
        | "offer_extended"
        | "committed"
        | "uninterested"
      baseball_player_type: "college" | "juco" | "high_school" | "showcase"
      coach_status:
        | "new_lead"
        | "contacted"
        | "engaged"
        | "proposal"
        | "won"
        | "lost"
        | "nurture"
      contact_type: "email" | "call" | "demo" | "meeting" | "note"
      crm_event_type:
        | "demo"
        | "follow_up"
        | "call"
        | "meeting"
        | "email_reminder"
        | "other"
      golf_expense_category:
        | "lodging"
        | "transportation"
        | "meals"
        | "entry_fees"
        | "equipment"
        | "other"
      golf_expense_paid_by:
        | "team"
        | "player"
        | "pending_reimbursement"
        | "split"
      ncaa_division: "D2" | "D3"
      notification_type:
        | "profile_view"
        | "watchlist_add"
        | "video_view"
        | "message"
        | "team_invite"
        | "team_join_request"
        | "team_join_approved"
        | "event_reminder"
        | "dev_plan_assigned"
        | "team_join"
        | "team_join_rejected"
      organization_type: "college" | "juco" | "high_school" | "showcase"
      program_type: "mens" | "womens" | "both"
      reminder_type: "in_app" | "email" | "push" | "all"
      team_member_status: "pending" | "active" | "inactive" | "removed"
      user_role: "coach" | "player" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_event_severity: ["info", "warning", "error", "critical"],
      baseball_coach_type: ["college", "juco", "high_school", "showcase"],
      baseball_pipeline_stage: [
        "watchlist",
        "high_priority",
        "offer_extended",
        "committed",
        "uninterested",
      ],
      baseball_player_type: ["college", "juco", "high_school", "showcase"],
      coach_status: [
        "new_lead",
        "contacted",
        "engaged",
        "proposal",
        "won",
        "lost",
        "nurture",
      ],
      contact_type: ["email", "call", "demo", "meeting", "note"],
      crm_event_type: [
        "demo",
        "follow_up",
        "call",
        "meeting",
        "email_reminder",
        "other",
      ],
      golf_expense_category: [
        "lodging",
        "transportation",
        "meals",
        "entry_fees",
        "equipment",
        "other",
      ],
      golf_expense_paid_by: [
        "team",
        "player",
        "pending_reimbursement",
        "split",
      ],
      ncaa_division: ["D2", "D3"],
      notification_type: [
        "profile_view",
        "watchlist_add",
        "video_view",
        "message",
        "team_invite",
        "team_join_request",
        "team_join_approved",
        "event_reminder",
        "dev_plan_assigned",
        "team_join",
        "team_join_rejected",
      ],
      organization_type: ["college", "juco", "high_school", "showcase"],
      program_type: ["mens", "womens", "both"],
      reminder_type: ["in_app", "email", "push", "all"],
      team_member_status: ["pending", "active", "inactive", "removed"],
      user_role: ["coach", "player", "admin"],
    },
  },
} as const
