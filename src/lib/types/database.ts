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
      baseball_academics: {
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
      baseball_coach_settings: {
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
      baseball_dream_schools: {
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
      baseball_events: {
        Row: {
          all_day: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string | null
          event_type: string
          id: string
          location: string | null
          metadata: Json | null
          recurrence_rule: string | null
          recurring: boolean | null
          start_time: string
          team_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_type: string
          id?: string
          location?: string | null
          metadata?: Json | null
          recurrence_rule?: string | null
          recurring?: boolean | null
          start_time: string
          team_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_type?: string
          id?: string
          location?: string | null
          metadata?: Json | null
          recurrence_rule?: string | null
          recurring?: boolean | null
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
          engagement_type: string
          id: string
          metadata: Json | null
          player_id: string
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          engagement_type: string
          id?: string
          metadata?: Json | null
          player_id: string
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
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
      feature_flags: {
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
      golf_availability_polls: {
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
      golf_calendar_feeds: {
        Row: {
          created_at: string | null
          feed_token: string | null
          feed_type: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          name: string | null
          player_id: string | null
          team_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          feed_token?: string | null
          feed_type?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          name?: string | null
          player_id?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          feed_token?: string | null
          feed_type?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          name?: string | null
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
          created_at: string | null
          event_id: string
          id: string
          message: string | null
          notification_type: string
          read_at: string | null
          sent_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          message?: string | null
          notification_type: string
          read_at?: string | null
          sent_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          message?: string | null
          notification_type?: string
          read_at?: string | null
          sent_at?: string | null
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
      golf_calendar_sync_log: {
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
            referencedRelation: "golf_calendar_sync_state"
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
      golf_calendar_sync_state: {
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
      golf_coach_settings: {
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
          enabled: boolean | null
          focus_areas: string[] | null
          id: string
          insight_frequency: string | null
          min_rounds_for_insights: number | null
          team_id: string | null
          trend_alerts: boolean | null
          updated_at: string | null
          weekly_summary: boolean | null
        }
        Insert: {
          auto_insights?: boolean | null
          coach_id: string
          created_at?: string | null
          enabled?: boolean | null
          focus_areas?: string[] | null
          id?: string
          insight_frequency?: string | null
          min_rounds_for_insights?: number | null
          team_id?: string | null
          trend_alerts?: boolean | null
          updated_at?: string | null
          weekly_summary?: boolean | null
        }
        Update: {
          auto_insights?: boolean | null
          coach_id?: string
          created_at?: string | null
          enabled?: boolean | null
          focus_areas?: string[] | null
          id?: string
          insight_frequency?: string | null
          min_rounds_for_insights?: number | null
          team_id?: string | null
          trend_alerts?: boolean | null
          updated_at?: string | null
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
        ]
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
      golf_documents: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          is_public: boolean | null
          team_id: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          is_public?: boolean | null
          team_id: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          is_public?: boolean | null
          team_id?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_documents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
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
      golf_event_exclusions: {
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
      golf_event_status_log: {
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
          metadata: Json | null
          parent_event_id: string | null
          recurrence_rule: string | null
          recurring: boolean | null
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
          metadata?: Json | null
          parent_event_id?: string | null
          recurrence_rule?: string | null
          recurring?: boolean | null
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
          metadata?: Json | null
          parent_event_id?: string | null
          recurrence_rule?: string | null
          recurring?: boolean | null
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
      golf_external_calendars: {
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
      golf_messages: {
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
      golf_organizations: {
        Row: {
          city: string | null
          conference: string | null
          created_at: string | null
          division: string | null
          id: string
          logo_url: string | null
          name: string
          state: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          conference?: string | null
          created_at?: string | null
          division?: string | null
          id?: string
          logo_url?: string | null
          name: string
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          conference?: string | null
          created_at?: string | null
          division?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      golf_player_availability_blocks: {
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
          id: string
          notes: string | null
          player_id: string
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
          id?: string
          notes?: string | null
          player_id: string
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
          id?: string
          notes?: string | null
          player_id?: string
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
      golf_player_insight_preferences: {
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
      golf_player_settings: {
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
          last_round_date: string | null
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
          rounds_in_calculation: number | null
          rounds_played: number | null
          sand_attempts: number | null
          sand_save_percentage: number | null
          sand_saves: number | null
          scoring_average: number | null
          scoring_average_vs_par: number | null
          scramble_attempts: number | null
          scrambles_converted: number | null
          scrambling_percentage: number | null
          strokes_gained_approach: number | null
          strokes_gained_around_green: number | null
          strokes_gained_putting: number | null
          strokes_gained_tee: number | null
          strokes_gained_total: number | null
          three_putt_percentage: number | null
          total_penalties: number | null
          total_putts: number | null
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
          last_round_date?: string | null
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
          rounds_in_calculation?: number | null
          rounds_played?: number | null
          sand_attempts?: number | null
          sand_save_percentage?: number | null
          sand_saves?: number | null
          scoring_average?: number | null
          scoring_average_vs_par?: number | null
          scramble_attempts?: number | null
          scrambles_converted?: number | null
          scrambling_percentage?: number | null
          strokes_gained_approach?: number | null
          strokes_gained_around_green?: number | null
          strokes_gained_putting?: number | null
          strokes_gained_tee?: number | null
          strokes_gained_total?: number | null
          three_putt_percentage?: number | null
          total_penalties?: number | null
          total_putts?: number | null
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
          last_round_date?: string | null
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
          rounds_in_calculation?: number | null
          rounds_played?: number | null
          sand_attempts?: number | null
          sand_save_percentage?: number | null
          sand_saves?: number | null
          scoring_average?: number | null
          scoring_average_vs_par?: number | null
          scramble_attempts?: number | null
          scrambles_converted?: number | null
          scrambling_percentage?: number | null
          strokes_gained_approach?: number | null
          strokes_gained_around_green?: number | null
          strokes_gained_putting?: number | null
          strokes_gained_tee?: number | null
          strokes_gained_total?: number | null
          three_putt_percentage?: number | null
          total_penalties?: number | null
          total_putts?: number | null
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
          city: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          gpa: number | null
          grad_year: number | null
          handicap: number | null
          handicap_index: number | null
          high_school_name: string | null
          id: string
          last_name: string | null
          onboarding_completed: boolean | null
          phone: string | null
          state: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          gpa?: number | null
          grad_year?: number | null
          handicap?: number | null
          handicap_index?: number | null
          high_school_name?: string | null
          id?: string
          last_name?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          state?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          gpa?: number | null
          grad_year?: number | null
          handicap?: number | null
          handicap_index?: number | null
          high_school_name?: string | null
          id?: string
          last_name?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
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
      golf_poll_responses: {
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
            referencedRelation: "golf_availability_polls"
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
      golf_putting_tendencies: {
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
      golf_qualifier_entries: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          player_id: string
          position: number | null
          qualifier_id: string
          round_id: string | null
          score: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          player_id: string
          position?: number | null
          qualifier_id: string
          round_id?: string | null
          score?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          player_id?: string
          position?: number | null
          qualifier_id?: string
          round_id?: string | null
          score?: number | null
          status?: string | null
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
      golf_round_reviews: {
        Row: {
          ai_model_version: string | null
          areas_count: number | null
          areas_to_review: Json | null
          coach_notes: string | null
          coach_viewed_at: string | null
          created_at: string | null
          engine_version: string | null
          highlights: Json | null
          highlights_count: number | null
          id: string
          insights_count: number | null
          last_regenerated_at: string | null
          next_practice_priority: string | null
          patterns_detected: Json | null
          player_id: string
          primary_takeaway: string | null
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
          summary: string | null
          updated_at: string | null
        }
        Insert: {
          ai_model_version?: string | null
          areas_count?: number | null
          areas_to_review?: Json | null
          coach_notes?: string | null
          coach_viewed_at?: string | null
          created_at?: string | null
          engine_version?: string | null
          highlights?: Json | null
          highlights_count?: number | null
          id?: string
          insights_count?: number | null
          last_regenerated_at?: string | null
          next_practice_priority?: string | null
          patterns_detected?: Json | null
          player_id: string
          primary_takeaway?: string | null
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
          summary?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_model_version?: string | null
          areas_count?: number | null
          areas_to_review?: Json | null
          coach_notes?: string | null
          coach_viewed_at?: string | null
          created_at?: string | null
          engine_version?: string | null
          highlights?: Json | null
          highlights_count?: number | null
          id?: string
          insights_count?: number | null
          last_regenerated_at?: string | null
          next_practice_priority?: string | null
          patterns_detected?: Json | null
          player_id?: string
          primary_takeaway?: string | null
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
          summary?: string | null
          updated_at?: string | null
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
          front_nine: number | null
          holes_played: number | null
          id: string
          notes: string | null
          player_id: string
          round_date: string
          round_type: string | null
          score_to_par: number | null
          status: string | null
          team_id: string | null
          tees_played: string | null
          total_fairways: number | null
          total_fairways_hit: number | null
          total_gir: number | null
          total_gir_possible: number | null
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
          front_nine?: number | null
          holes_played?: number | null
          id?: string
          notes?: string | null
          player_id: string
          round_date: string
          round_type?: string | null
          score_to_par?: number | null
          status?: string | null
          team_id?: string | null
          tees_played?: string | null
          total_fairways?: number | null
          total_fairways_hit?: number | null
          total_gir?: number | null
          total_gir_possible?: number | null
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
          front_nine?: number | null
          holes_played?: number | null
          id?: string
          notes?: string | null
          player_id?: string
          round_date?: string
          round_type?: string | null
          score_to_par?: number | null
          status?: string | null
          team_id?: string | null
          tees_played?: string | null
          total_fairways?: number | null
          total_fairways_hit?: number | null
          total_gir?: number | null
          total_gir_possible?: number | null
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
          club_used: string | null
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
          club_used?: string | null
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
          club_used?: string | null
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
      golf_tasks: {
        Row: {
          assigned_by: string | null
          assigned_to: string | null
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
      organization_settings: {
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
      player_dream_schools: {
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
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      player_putt_tendencies: {
        Row: {
          avg_distance_on_makes_ft: number | null
          avg_distance_on_misses_ft: number | null
          created_at: string | null
          first_name: string | null
          id: string | null
          last_calculated: string | null
          last_name: string | null
          left_to_right_attempts: number | null
          left_to_right_made: number | null
          left_to_right_pct: number | null
          make_percentage_overall: number | null
          miss_left_percentage: number | null
          miss_long_percentage: number | null
          miss_right_percentage: number | null
          miss_short_percentage: number | null
          player_id: string | null
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
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_putting_tendencies_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
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
      get_golf_conversations_with_details: {
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
      is_baseball_team_coach: { Args: { team_uuid: string }; Returns: boolean }
      is_baseball_team_player: { Args: { team_uuid: string }; Returns: boolean }
      is_golf_team_coach: { Args: { team_uuid: string }; Returns: boolean }
      is_golf_team_player: { Args: { team_uuid: string }; Returns: boolean }
    }
    Enums: {
      baseball_coach_type: "college" | "juco" | "high_school" | "showcase"
      baseball_pipeline_stage:
        | "watchlist"
        | "high_priority"
        | "offer_extended"
        | "committed"
        | "uninterested"
      baseball_player_type: "college" | "juco" | "high_school" | "showcase"
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
      organization_type: "college" | "juco" | "high_school" | "showcase"
      reminder_type: "in_app" | "email" | "push" | "all"
      team_member_status: "pending" | "active" | "inactive" | "removed"
      user_role: "coach" | "player"
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
      baseball_coach_type: ["college", "juco", "high_school", "showcase"],
      baseball_pipeline_stage: [
        "watchlist",
        "high_priority",
        "offer_extended",
        "committed",
        "uninterested",
      ],
      baseball_player_type: ["college", "juco", "high_school", "showcase"],
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
      ],
      organization_type: ["college", "juco", "high_school", "showcase"],
      reminder_type: ["in_app", "email", "push", "all"],
      team_member_status: ["pending", "active", "inactive", "removed"],
      user_role: ["coach", "player"],
    },
  },
} as const
