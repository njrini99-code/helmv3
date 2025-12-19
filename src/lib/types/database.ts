export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      camp_registrations: {
        Row: {
          attended_at: string | null
          camp_id: string
          cancelled_at: string | null
          created_at: string
          id: string
          notes: string | null
          player_id: string
          registered_at: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          attended_at?: string | null
          camp_id: string
          cancelled_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          player_id: string
          registered_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          attended_at?: string | null
          camp_id?: string
          cancelled_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          player_id?: string
          registered_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "camp_registrations_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "camps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camp_registrations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      camps: {
        Row: {
          capacity: number | null
          coach_id: string
          created_at: string
          description: string | null
          end_date: string | null
          end_time: string | null
          id: string
          interested_count: number | null
          location: string | null
          location_address: string | null
          location_city: string | null
          location_state: string | null
          name: string
          organization_id: string | null
          price: number | null
          registration_count: number | null
          registration_deadline: string | null
          start_date: string
          start_time: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          coach_id: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          interested_count?: number | null
          location?: string | null
          location_address?: string | null
          location_city?: string | null
          location_state?: string | null
          name: string
          organization_id?: string | null
          price?: number | null
          registration_count?: number | null
          registration_deadline?: string | null
          start_date: string
          start_time?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          coach_id?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          interested_count?: number | null
          location?: string | null
          location_address?: string | null
          location_city?: string | null
          location_state?: string | null
          name?: string
          organization_id?: string | null
          price?: number | null
          registration_count?: number | null
          registration_deadline?: string | null
          start_date?: string
          start_time?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "camps_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_calendar_events: {
        Row: {
          coach_id: string
          created_at: string
          description: string | null
          end_time: string | null
          event_type: string | null
          id: string
          is_all_day: boolean | null
          location: string | null
          location_city: string | null
          location_state: string | null
          recurrence_rule: string | null
          start_time: string
          timezone: string | null
          title: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_type?: string | null
          id?: string
          is_all_day?: boolean | null
          location?: string | null
          location_city?: string | null
          location_state?: string | null
          recurrence_rule?: string | null
          start_time: string
          timezone?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_type?: string | null
          id?: string
          is_all_day?: boolean | null
          location?: string | null
          location_city?: string | null
          location_state?: string | null
          recurrence_rule?: string | null
          start_time?: string
          timezone?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_calendar_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_notes: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          is_private: boolean | null
          note_content: string
          player_id: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          is_private?: boolean | null
          note_content: string
          player_id: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          is_private?: boolean | null
          note_content?: string
          player_id?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          about: string | null
          athletic_conference: string | null
          avatar_url: string | null
          coach_title: string | null
          coach_type: Database["public"]["Enums"]["coach_type"]
          college_id: string | null
          conference: string | null
          created_at: string | null
          email_contact: string | null
          full_name: string | null
          id: string
          logo_url: string | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          organization_id: string | null
          organization_name: string | null
          phone: string | null
          primary_color: string | null
          program_division: string | null
          program_philosophy: string | null
          program_values: string | null
          recruiting_class_needs: string[] | null
          school_city: string | null
          school_name: string | null
          school_state: string | null
          secondary_color: string | null
          updated_at: string | null
          user_id: string
          what_we_look_for: string | null
        }
        Insert: {
          about?: string | null
          athletic_conference?: string | null
          avatar_url?: string | null
          coach_title?: string | null
          coach_type: Database["public"]["Enums"]["coach_type"]
          college_id?: string | null
          conference?: string | null
          created_at?: string | null
          email_contact?: string | null
          full_name?: string | null
          id?: string
          logo_url?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          organization_id?: string | null
          organization_name?: string | null
          phone?: string | null
          primary_color?: string | null
          program_division?: string | null
          program_philosophy?: string | null
          program_values?: string | null
          recruiting_class_needs?: string[] | null
          school_city?: string | null
          school_name?: string | null
          school_state?: string | null
          secondary_color?: string | null
          updated_at?: string | null
          user_id: string
          what_we_look_for?: string | null
        }
        Update: {
          about?: string | null
          athletic_conference?: string | null
          avatar_url?: string | null
          coach_title?: string | null
          coach_type?: Database["public"]["Enums"]["coach_type"]
          college_id?: string | null
          conference?: string | null
          created_at?: string | null
          email_contact?: string | null
          full_name?: string | null
          id?: string
          logo_url?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          organization_id?: string | null
          organization_name?: string | null
          phone?: string | null
          primary_color?: string | null
          program_division?: string | null
          program_philosophy?: string | null
          program_values?: string | null
          recruiting_class_needs?: string[] | null
          school_city?: string | null
          school_name?: string | null
          school_state?: string | null
          secondary_color?: string | null
          updated_at?: string | null
          user_id?: string
          what_we_look_for?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaches_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      colleges: {
        Row: {
          assistant_coaches: string[] | null
          baseball_url: string | null
          city: string | null
          conference: string | null
          created_at: string | null
          division: string | null
          email: string | null
          head_coach: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          state: string | null
          website: string | null
        }
        Insert: {
          assistant_coaches?: string[] | null
          baseball_url?: string | null
          city?: string | null
          conference?: string | null
          created_at?: string | null
          division?: string | null
          email?: string | null
          head_coach?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          state?: string | null
          website?: string | null
        }
        Update: {
          assistant_coaches?: string[] | null
          baseball_url?: string | null
          city?: string | null
          conference?: string | null
          created_at?: string | null
          division?: string | null
          email?: string | null
          head_coach?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          state?: string | null
          website?: string | null
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      developmental_plans: {
        Row: {
          coach_id: string
          created_at: string
          description: string | null
          drills: Json | null
          end_date: string | null
          goals: Json | null
          id: string
          notes: string | null
          player_id: string
          sent_at: string | null
          start_date: string | null
          status: string | null
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          description?: string | null
          drills?: Json | null
          end_date?: string | null
          goals?: Json | null
          id?: string
          notes?: string | null
          player_id: string
          sent_at?: string | null
          start_date?: string | null
          status?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          description?: string | null
          drills?: Json | null
          end_date?: string | null
          goals?: Json | null
          id?: string
          notes?: string | null
          player_id?: string
          sent_at?: string | null
          start_date?: string | null
          status?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "developmental_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developmental_plans_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developmental_plans_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          event_type: string
          home_away: string | null
          id: string
          is_all_day: boolean | null
          is_public: boolean | null
          level: string | null
          location_address: string | null
          location_city: string | null
          location_state: string | null
          location_venue: string | null
          name: string
          notes: string | null
          opponent: string | null
          organization_id: string | null
          result: string | null
          score_them: number | null
          score_us: number | null
          start_time: string
          team_id: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_type: string
          home_away?: string | null
          id?: string
          is_all_day?: boolean | null
          is_public?: boolean | null
          level?: string | null
          location_address?: string | null
          location_city?: string | null
          location_state?: string | null
          location_venue?: string | null
          name: string
          notes?: string | null
          opponent?: string | null
          organization_id?: string | null
          result?: string | null
          score_them?: number | null
          score_us?: number | null
          start_time: string
          team_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_type?: string
          home_away?: string | null
          id?: string
          is_all_day?: boolean | null
          is_public?: boolean | null
          level?: string | null
          location_address?: string | null
          location_city?: string | null
          location_state?: string | null
          location_venue?: string | null
          name?: string
          notes?: string | null
          opponent?: string | null
          organization_id?: string | null
          result?: string | null
          score_them?: number | null
          score_us?: number | null
          start_time?: string
          team_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      high_schools: {
        Row: {
          city: string | null
          created_at: string | null
          id: string
          name: string
          state: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          id?: string
          name: string
          state?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          id?: string
          name?: string
          state?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          id: string
          read: boolean | null
          sender_id: string
          sent_at: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          id?: string
          read?: boolean | null
          sender_id: string
          sent_at?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          id?: string
          read?: boolean | null
          sender_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string | null
          id: string
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          read?: boolean | null
          title?: string
          type?: string
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
          created_at: string
          description: string | null
          division: string | null
          id: string
          location_city: string | null
          location_state: string | null
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          type: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          banner_url?: string | null
          conference?: string | null
          created_at?: string
          description?: string | null
          division?: string | null
          id?: string
          location_city?: string | null
          location_state?: string | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          type: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          banner_url?: string | null
          conference?: string | null
          created_at?: string
          description?: string | null
          division?: string | null
          id?: string
          location_city?: string | null
          location_state?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          type?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      player_achievements: {
        Row: {
          achievement_date: string | null
          achievement_text: string
          achievement_type: string | null
          created_at: string
          id: string
          player_id: string
          updated_at: string
        }
        Insert: {
          achievement_date?: string | null
          achievement_text: string
          achievement_type?: string | null
          created_at?: string
          id?: string
          player_id: string
          updated_at?: string
        }
        Update: {
          achievement_date?: string | null
          achievement_text?: string
          achievement_type?: string | null
          created_at?: string
          id?: string
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_achievements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_engagement_events: {
        Row: {
          coach_id: string | null
          created_at: string
          engagement_date: string
          engagement_type: string
          id: string
          is_anonymous: boolean | null
          metadata: Json | null
          player_id: string
          video_id: string | null
          view_duration_seconds: number | null
          viewer_user_id: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          engagement_date?: string
          engagement_type: string
          id?: string
          is_anonymous?: boolean | null
          metadata?: Json | null
          player_id: string
          video_id?: string | null
          view_duration_seconds?: number | null
          viewer_user_id?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          engagement_date?: string
          engagement_type?: string
          id?: string
          is_anonymous?: boolean | null
          metadata?: Json | null
          player_id?: string
          video_id?: string | null
          view_duration_seconds?: number | null
          viewer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_engagement_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_engagement_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_engagement_events_viewer_user_id_fkey"
            columns: ["viewer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      player_metrics: {
        Row: {
          created_at: string
          id: string
          metric_label: string
          metric_type: string | null
          metric_value: string
          player_id: string
          recorded_at: string | null
          updated_at: string
          verified: boolean | null
          verified_by: string | null
          verified_date: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metric_label: string
          metric_type?: string | null
          metric_value: string
          player_id: string
          recorded_at?: string | null
          updated_at?: string
          verified?: boolean | null
          verified_by?: string | null
          verified_date?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metric_label?: string
          metric_type?: string | null
          metric_value?: string
          player_id?: string
          recorded_at?: string | null
          updated_at?: string
          verified?: boolean | null
          verified_by?: string | null
          verified_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_metrics_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_metrics_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      player_settings: {
        Row: {
          created_at: string
          email_notifications: boolean | null
          id: string
          is_discoverable: boolean | null
          notify_on_eval: boolean | null
          notify_on_interest: boolean | null
          notify_on_message: boolean | null
          notify_on_profile_view: boolean | null
          notify_on_watchlist_add: boolean | null
          player_id: string
          show_contact_info: boolean | null
          show_gpa: boolean | null
          show_location: boolean | null
          show_test_scores: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_notifications?: boolean | null
          id?: string
          is_discoverable?: boolean | null
          notify_on_eval?: boolean | null
          notify_on_interest?: boolean | null
          notify_on_message?: boolean | null
          notify_on_profile_view?: boolean | null
          notify_on_watchlist_add?: boolean | null
          player_id: string
          show_contact_info?: boolean | null
          show_gpa?: boolean | null
          show_location?: boolean | null
          show_test_scores?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_notifications?: boolean | null
          id?: string
          is_discoverable?: boolean | null
          notify_on_eval?: boolean | null
          notify_on_interest?: boolean | null
          notify_on_message?: boolean | null
          notify_on_profile_view?: boolean | null
          notify_on_watchlist_add?: boolean | null
          player_id?: string
          show_contact_info?: boolean | null
          show_gpa?: boolean | null
          show_location?: boolean | null
          show_test_scores?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_settings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          about_me: string | null
          act_score: number | null
          avatar_url: string | null
          bats: string | null
          city: string | null
          club_team: string | null
          college_org_id: string | null
          commitment_date: string | null
          committed_to: string | null
          committed_to_org_id: string | null
          created_at: string | null
          email: string | null
          exit_velo: number | null
          first_name: string | null
          full_name: string | null
          gpa: number | null
          grad_year: number | null
          has_video: boolean | null
          height_feet: number | null
          height_inches: number | null
          high_school_id: string | null
          high_school_name: string | null
          high_school_org_id: string | null
          id: string
          instagram: string | null
          last_name: string | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          phone: string | null
          pitch_velo: number | null
          player_type: Database["public"]["Enums"]["player_type"]
          pop_time: number | null
          primary_goal: string | null
          primary_position: string | null
          profile_completion_percent: number | null
          recruiting_activated: boolean | null
          recruiting_activated_at: string | null
          sat_score: number | null
          search_vector: unknown
          secondary_position: string | null
          showcase_org_id: string | null
          showcase_team_name: string | null
          sixty_time: number | null
          state: string | null
          throws: string | null
          top_schools: string[] | null
          twitter: string | null
          updated_at: string | null
          user_id: string | null
          verified_metrics: boolean | null
          weight_lbs: number | null
        }
        Insert: {
          about_me?: string | null
          act_score?: number | null
          avatar_url?: string | null
          bats?: string | null
          city?: string | null
          club_team?: string | null
          college_org_id?: string | null
          commitment_date?: string | null
          committed_to?: string | null
          committed_to_org_id?: string | null
          created_at?: string | null
          email?: string | null
          exit_velo?: number | null
          first_name?: string | null
          full_name?: string | null
          gpa?: number | null
          grad_year?: number | null
          has_video?: boolean | null
          height_feet?: number | null
          height_inches?: number | null
          high_school_id?: string | null
          high_school_name?: string | null
          high_school_org_id?: string | null
          id?: string
          instagram?: string | null
          last_name?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          phone?: string | null
          pitch_velo?: number | null
          player_type: Database["public"]["Enums"]["player_type"]
          pop_time?: number | null
          primary_goal?: string | null
          primary_position?: string | null
          profile_completion_percent?: number | null
          recruiting_activated?: boolean | null
          recruiting_activated_at?: string | null
          sat_score?: number | null
          search_vector?: unknown
          secondary_position?: string | null
          showcase_org_id?: string | null
          showcase_team_name?: string | null
          sixty_time?: number | null
          state?: string | null
          throws?: string | null
          top_schools?: string[] | null
          twitter?: string | null
          updated_at?: string | null
          user_id?: string | null
          verified_metrics?: boolean | null
          weight_lbs?: number | null
        }
        Update: {
          about_me?: string | null
          act_score?: number | null
          avatar_url?: string | null
          bats?: string | null
          city?: string | null
          club_team?: string | null
          college_org_id?: string | null
          commitment_date?: string | null
          committed_to?: string | null
          committed_to_org_id?: string | null
          created_at?: string | null
          email?: string | null
          exit_velo?: number | null
          first_name?: string | null
          full_name?: string | null
          gpa?: number | null
          grad_year?: number | null
          has_video?: boolean | null
          height_feet?: number | null
          height_inches?: number | null
          high_school_id?: string | null
          high_school_name?: string | null
          high_school_org_id?: string | null
          id?: string
          instagram?: string | null
          last_name?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          phone?: string | null
          pitch_velo?: number | null
          player_type?: Database["public"]["Enums"]["player_type"]
          pop_time?: number | null
          primary_goal?: string | null
          primary_position?: string | null
          profile_completion_percent?: number | null
          recruiting_activated?: boolean | null
          recruiting_activated_at?: string | null
          sat_score?: number | null
          search_vector?: unknown
          secondary_position?: string | null
          showcase_org_id?: string | null
          showcase_team_name?: string | null
          sixty_time?: number | null
          state?: string | null
          throws?: string | null
          top_schools?: string[] | null
          twitter?: string | null
          updated_at?: string | null
          user_id?: string | null
          verified_metrics?: boolean | null
          weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "players_college_org_id_fkey"
            columns: ["college_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_committed_to_fkey"
            columns: ["committed_to"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_committed_to_org_id_fkey"
            columns: ["committed_to_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_high_school_id_fkey"
            columns: ["high_school_id"]
            isOneToOne: false
            referencedRelation: "high_schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_high_school_org_id_fkey"
            columns: ["high_school_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_showcase_org_id_fkey"
            columns: ["showcase_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_views: {
        Row: {
          created_at: string | null
          id: string
          player_id: string
          viewer_id: string | null
          viewer_type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          player_id: string
          viewer_id?: string | null
          viewer_type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          player_id?: string
          viewer_id?: string | null
          viewer_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_views_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiting_interests: {
        Row: {
          coach_name: string | null
          conference: string | null
          created_at: string
          division: string | null
          id: string
          interest_level: string | null
          last_contact_at: string | null
          notes: string | null
          organization_id: string | null
          player_id: string
          school_name: string
          status: string
          updated_at: string
        }
        Insert: {
          coach_name?: string | null
          conference?: string | null
          created_at?: string
          division?: string | null
          id?: string
          interest_level?: string | null
          last_contact_at?: string | null
          notes?: string | null
          organization_id?: string | null
          player_id: string
          school_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          coach_name?: string | null
          conference?: string | null
          created_at?: string
          division?: string | null
          id?: string
          interest_level?: string | null
          last_contact_at?: string | null
          notes?: string | null
          organization_id?: string | null
          player_id?: string
          school_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruiting_interests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiting_interests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      team_coach_staff: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          is_primary: boolean | null
          joined_at: string | null
          role: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          joined_at?: string | null
          role?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          joined_at?: string | null
          role?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_coach_staff_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_coach_staff_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          created_at: string
          created_by: string
          current_uses: number | null
          expires_at: string | null
          id: string
          invite_code: string
          is_active: boolean | null
          max_uses: number | null
          team_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_uses?: number | null
          expires_at?: string | null
          id?: string
          invite_code: string
          is_active?: boolean | null
          max_uses?: number | null
          team_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_uses?: number | null
          expires_at?: string | null
          id?: string
          invite_code?: string
          is_active?: boolean | null
          max_uses?: number | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          jersey_number: number | null
          joined_at: string | null
          left_at: string | null
          player_id: string
          position: string | null
          role: string | null
          status: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          jersey_number?: number | null
          joined_at?: string | null
          left_at?: string | null
          player_id: string
          position?: string | null
          role?: string | null
          status?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          jersey_number?: number | null
          joined_at?: string | null
          left_at?: string | null
          player_id?: string
          position?: string | null
          role?: string | null
          status?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          age_group: string | null
          city: string | null
          created_at: string
          head_coach_id: string | null
          id: string
          logo_url: string | null
          name: string
          organization_id: string | null
          primary_color: string | null
          season_year: number | null
          secondary_color: string | null
          state: string | null
          team_type: string
          updated_at: string
        }
        Insert: {
          age_group?: string | null
          city?: string | null
          created_at?: string
          head_coach_id?: string | null
          id?: string
          logo_url?: string | null
          name: string
          organization_id?: string | null
          primary_color?: string | null
          season_year?: number | null
          secondary_color?: string | null
          state?: string | null
          team_type: string
          updated_at?: string
        }
        Update: {
          age_group?: string | null
          city?: string | null
          created_at?: string
          head_coach_id?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          organization_id?: string | null
          primary_color?: string | null
          season_year?: number | null
          secondary_color?: string | null
          state?: string | null
          team_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_head_coach_id_fkey"
            columns: ["head_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          role?: Database["public"]["Enums"]["user_role"]
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
      video_views: {
        Row: {
          created_at: string | null
          id: string
          video_id: string
          viewer_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          video_id: string
          viewer_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          video_id?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_views_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          created_at: string | null
          description: string | null
          duration: number | null
          id: string
          is_primary: boolean | null
          player_id: string
          thumbnail_url: string | null
          title: string
          url: string | null
          video_type: string | null
          view_count: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration?: number | null
          id?: string
          is_primary?: boolean | null
          player_id: string
          thumbnail_url?: string | null
          title: string
          url?: string | null
          video_type?: string | null
          view_count?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration?: number | null
          id?: string
          is_primary?: boolean | null
          player_id?: string
          thumbnail_url?: string | null
          title?: string
          url?: string | null
          video_type?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          added_at: string | null
          coach_id: string
          created_at: string | null
          id: string
          notes: string | null
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          player_id: string
          priority: number | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          added_at?: string | null
          coach_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          player_id: string
          priority?: number | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          added_at?: string | null
          coach_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          player_id?: string
          priority?: number | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlists_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_coach_completion: {
        Args: { p_coach_id: string }
        Returns: number
      }
      calculate_profile_completion:
        | {
            Args: { p: Database["public"]["Tables"]["players"]["Row"] }
            Returns: number
          }
        | { Args: { p_player_id: string }; Returns: number }
      get_active_dev_plans: {
        Args: { p_player_id: string }
        Returns: {
          coach_name: string
          plan_id: string
          progress_percent: number
          status: string
          title: string
        }[]
      }
      get_coach_profile: {
        Args: { p_coach_id: string }
        Returns: {
          about: string
          coach_id: string
          coach_title: string
          coach_type: string
          conference: string
          division: string
          email: string
          full_name: string
          logo_url: string
          organization_name: string
          philosophy: string
          phone: string
          program_values: string
          team_count: number
          what_they_look_for: string
        }[]
      }
      get_coach_teams: {
        Args: { p_coach_id: string }
        Returns: {
          is_head_coach: boolean
          player_count: number
          role: string
          team_id: string
          team_name: string
          team_type: string
        }[]
      }
      get_engagement_trends: {
        Args: { p_days?: number; p_interval?: string; p_player_id: string }
        Returns: {
          period: string
          profile_views: number
          video_views: number
          watchlist_adds: number
        }[]
      }
      get_player_engagement_summary: {
        Args: { p_days?: number; p_player_id: string }
        Returns: {
          messages_received: number
          period_end: string
          period_start: string
          total_views: number
          unique_coaches: number
          video_views: number
          watchlist_adds: number
        }[]
      }
      get_player_notes: {
        Args: { p_coach_id: string; p_player_id: string }
        Returns: {
          created_at: string
          note_content: string
          note_id: string
          tags: string[]
          updated_at: string
        }[]
      }
      get_player_teams: {
        Args: { p_player_id: string }
        Returns: {
          is_primary: boolean
          jersey_number: number
          role: string
          team_id: string
          team_name: string
          team_type: string
        }[]
      }
      get_recent_engagement: {
        Args: { p_limit?: number; p_player_id: string }
        Returns: {
          coach_name: string
          coach_school: string
          engagement_date: string
          engagement_type: string
          event_id: string
          is_anonymous: boolean
        }[]
      }
      get_upcoming_events: {
        Args: { p_coach_id: string; p_days_ahead?: number }
        Returns: {
          end_time: string
          event_id: string
          event_type: string
          location: string
          start_time: string
          title: string
        }[]
      }
      increment_video_view: { Args: { vid_id: string }; Returns: undefined }
      record_profile_view: {
        Args: {
          p_coach_id?: string
          p_duration_seconds?: number
          p_is_anonymous?: boolean
          p_player_id: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      coach_type: "college" | "high_school" | "juco" | "showcase"
      pipeline_stage:
        | "watchlist"
        | "high_priority"
        | "offer_extended"
        | "committed"
        | "uninterested"
      player_type: "high_school" | "showcase" | "juco" | "college"
      user_role: "player" | "coach" | "admin"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      coach_type: ["college", "high_school", "juco", "showcase"],
      pipeline_stage: [
        "watchlist",
        "high_priority",
        "offer_extended",
        "committed",
        "uninterested",
      ],
      player_type: ["high_school", "showcase", "juco", "college"],
      user_role: ["player", "coach", "admin"],
    },
  },
} as const

