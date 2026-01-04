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
      demo_requests: {
        Row: {
          created_at: string | null
          email: string
          id: string
          message: string | null
          name: string | null
          organization: string | null
          product: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          message?: string | null
          name?: string | null
          organization?: string | null
          product?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          message?: string | null
          name?: string | null
          organization?: string | null
          product?: string | null
          status?: string | null
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
      golf_academic_exclusions: {
        Row: {
          created_at: string | null
          created_by: string | null
          end_date: string
          exclude_all_events: boolean | null
          exclude_matches: boolean | null
          exclude_practices: boolean | null
          id: string
          name: string
          start_date: string
          team_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          end_date: string
          exclude_all_events?: boolean | null
          exclude_matches?: boolean | null
          exclude_practices?: boolean | null
          id?: string
          name: string
          start_date: string
          team_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          exclude_all_events?: boolean | null
          exclude_matches?: boolean | null
          exclude_practices?: boolean | null
          id?: string
          name?: string
          start_date?: string
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_academic_exclusions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_academic_exclusions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
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
            referencedRelation: "golf_player_attendance_stats"
            referencedColumns: ["player_id"]
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
      golf_announcements: {
        Row: {
          body: string
          created_at: string | null
          created_by: string
          id: string
          publish_at: string | null
          published_at: string | null
          requires_acknowledgement: boolean | null
          send_email: boolean | null
          send_push: boolean | null
          team_id: string
          title: string
          updated_at: string | null
          urgency: Database["public"]["Enums"]["golf_urgency_level"] | null
        }
        Insert: {
          body: string
          created_at?: string | null
          created_by: string
          id?: string
          publish_at?: string | null
          published_at?: string | null
          requires_acknowledgement?: boolean | null
          send_email?: boolean | null
          send_push?: boolean | null
          team_id: string
          title: string
          updated_at?: string | null
          urgency?: Database["public"]["Enums"]["golf_urgency_level"] | null
        }
        Update: {
          body?: string
          created_at?: string | null
          created_by?: string
          id?: string
          publish_at?: string | null
          published_at?: string | null
          requires_acknowledgement?: boolean | null
          send_email?: boolean | null
          send_push?: boolean | null
          team_id?: string
          title?: string
          updated_at?: string | null
          urgency?: Database["public"]["Enums"]["golf_urgency_level"] | null
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
      golf_availability_polls: {
        Row: {
          created_at: string | null
          created_by: string
          created_event_id: string | null
          date_options: string[] | null
          deadline: string | null
          description: string | null
          duration_minutes: number
          id: string
          selected_date: string | null
          selected_time: string | null
          status: string | null
          team_id: string
          time_options: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          created_event_id?: string | null
          date_options?: string[] | null
          deadline?: string | null
          description?: string | null
          duration_minutes: number
          id?: string
          selected_date?: string | null
          selected_time?: string | null
          status?: string | null
          team_id: string
          time_options?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          created_event_id?: string | null
          date_options?: string[] | null
          deadline?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          selected_date?: string | null
          selected_time?: string | null
          status?: string | null
          team_id?: string
          time_options?: string[] | null
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
            foreignKeyName: "golf_availability_polls_created_event_id_fkey"
            columns: ["created_event_id"]
            isOneToOne: false
            referencedRelation: "golf_attendance_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "golf_availability_polls_created_event_id_fkey"
            columns: ["created_event_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
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
      golf_calendar_feed_access: {
        Row: {
          accessed_at: string | null
          feed_token: string
          feed_type: string
          id: string
          ip_address: unknown
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string | null
          feed_token: string
          feed_type: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string | null
          feed_token?: string
          feed_type?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
        }
        Relationships: []
      }
      golf_calendar_notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          event_id: string | null
          id: string
          message: string | null
          read: boolean | null
          title: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          message?: string | null
          read?: boolean | null
          title: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          message?: string | null
          read?: boolean | null
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_calendar_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "golf_attendance_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "golf_calendar_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_calendar_sync_log: {
        Row: {
          conflicts_detected: number | null
          created_at: string | null
          error_details: Json | null
          errors_encountered: number | null
          events_deleted: number | null
          events_exported: number | null
          events_imported: number | null
          events_updated: number | null
          external_calendar_id: string
          id: string
          sync_completed_at: string | null
          sync_started_at: string | null
          sync_status: string | null
        }
        Insert: {
          conflicts_detected?: number | null
          created_at?: string | null
          error_details?: Json | null
          errors_encountered?: number | null
          events_deleted?: number | null
          events_exported?: number | null
          events_imported?: number | null
          events_updated?: number | null
          external_calendar_id: string
          id?: string
          sync_completed_at?: string | null
          sync_started_at?: string | null
          sync_status?: string | null
        }
        Update: {
          conflicts_detected?: number | null
          created_at?: string | null
          error_details?: Json | null
          errors_encountered?: number | null
          events_deleted?: number | null
          events_exported?: number | null
          events_imported?: number | null
          events_updated?: number | null
          external_calendar_id?: string
          id?: string
          sync_completed_at?: string | null
          sync_started_at?: string | null
          sync_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_calendar_sync_log_external_calendar_id_fkey"
            columns: ["external_calendar_id"]
            isOneToOne: false
            referencedRelation: "golf_external_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_calendar_sync_log_external_calendar_id_fkey"
            columns: ["external_calendar_id"]
            isOneToOne: false
            referencedRelation: "golf_sync_status_overview"
            referencedColumns: ["calendar_id"]
          },
        ]
      }
      golf_calendar_sync_state: {
        Row: {
          conflict_data: Json | null
          created_at: string | null
          error_message: string | null
          external_calendar_id: string
          external_etag: string | null
          external_event_hash: string | null
          external_event_id: string
          external_event_url: string | null
          golf_event_hash: string | null
          golf_event_id: string | null
          id: string
          last_modified_source: string | null
          last_synced_at: string | null
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          conflict_data?: Json | null
          created_at?: string | null
          error_message?: string | null
          external_calendar_id: string
          external_etag?: string | null
          external_event_hash?: string | null
          external_event_id: string
          external_event_url?: string | null
          golf_event_hash?: string | null
          golf_event_id?: string | null
          id?: string
          last_modified_source?: string | null
          last_synced_at?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          conflict_data?: Json | null
          created_at?: string | null
          error_message?: string | null
          external_calendar_id?: string
          external_etag?: string | null
          external_event_hash?: string | null
          external_event_id?: string
          external_event_url?: string | null
          golf_event_hash?: string | null
          golf_event_id?: string | null
          id?: string
          last_modified_source?: string | null
          last_synced_at?: string | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_calendar_sync_state_external_calendar_id_fkey"
            columns: ["external_calendar_id"]
            isOneToOne: false
            referencedRelation: "golf_external_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_calendar_sync_state_external_calendar_id_fkey"
            columns: ["external_calendar_id"]
            isOneToOne: false
            referencedRelation: "golf_sync_status_overview"
            referencedColumns: ["calendar_id"]
          },
          {
            foreignKeyName: "golf_calendar_sync_state_golf_event_id_fkey"
            columns: ["golf_event_id"]
            isOneToOne: false
            referencedRelation: "golf_attendance_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "golf_calendar_sync_state_golf_event_id_fkey"
            columns: ["golf_event_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_coach_blocked_time: {
        Row: {
          all_day: boolean | null
          coach_id: string
          created_at: string | null
          description: string | null
          end_date: string
          end_time: string | null
          id: string
          recurrence_rule: string | null
          start_date: string
          start_time: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          coach_id: string
          created_at?: string | null
          description?: string | null
          end_date: string
          end_time?: string | null
          id?: string
          recurrence_rule?: string | null
          start_date: string
          start_time?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          coach_id?: string
          created_at?: string | null
          description?: string | null
          end_date?: string
          end_time?: string | null
          id?: string
          recurrence_rule?: string | null
          start_date?: string
          start_time?: string | null
          title?: string
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
      golf_coach_notes: {
        Row: {
          coach_id: string
          content: string
          created_at: string | null
          id: string
          meeting_date: string | null
          meeting_type: string | null
          player_id: string
          shared_with_player: boolean | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          coach_id: string
          content: string
          created_at?: string | null
          id?: string
          meeting_date?: string | null
          meeting_type?: string | null
          player_id: string
          shared_with_player?: boolean | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          coach_id?: string
          content?: string
          created_at?: string | null
          id?: string
          meeting_date?: string | null
          meeting_type?: string | null
          player_id?: string
          shared_with_player?: boolean | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_coach_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_coach_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_player_attendance_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "golf_coach_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_coaches: {
        Row: {
          avatar_url: string | null
          calendar_feed_enabled: boolean | null
          calendar_feed_public: boolean | null
          calendar_feed_token: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          onboarding_completed: boolean | null
          organization_id: string | null
          phone: string | null
          team_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          calendar_feed_enabled?: boolean | null
          calendar_feed_public?: boolean | null
          calendar_feed_token?: string | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          onboarding_completed?: boolean | null
          organization_id?: string | null
          phone?: string | null
          team_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          calendar_feed_enabled?: boolean | null
          calendar_feed_public?: boolean | null
          calendar_feed_token?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          onboarding_completed?: boolean | null
          organization_id?: string | null
          phone?: string | null
          team_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_coaches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "golf_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_coaches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
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
      golf_course_holes: {
        Row: {
          course_id: string
          handicap_index: number | null
          hole_number: number
          id: string
          par: number
          yardage: number
        }
        Insert: {
          course_id: string
          handicap_index?: number | null
          hole_number: number
          id?: string
          par: number
          yardage: number
        }
        Update: {
          course_id?: string
          handicap_index?: number | null
          hole_number?: number
          id?: string
          par?: number
          yardage?: number
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
      golf_course_tees: {
        Row: {
          course_id: string
          course_rating: number | null
          hole_yardages: Json | null
          id: string
          slope_rating: number | null
          tee_color: string | null
          tee_name: string
          total_yardage: number | null
        }
        Insert: {
          course_id: string
          course_rating?: number | null
          hole_yardages?: Json | null
          id?: string
          slope_rating?: number | null
          tee_color?: string | null
          tee_name: string
          total_yardage?: number | null
        }
        Update: {
          course_id?: string
          course_rating?: number | null
          hole_yardages?: Json | null
          id?: string
          slope_rating?: number | null
          tee_color?: string | null
          tee_name?: string
          total_yardage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_course_tees_course_id_fkey"
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
          created_by: string | null
          default_tee_color: string | null
          default_tee_name: string | null
          id: string
          is_public: boolean | null
          name: string
          slope_rating: number | null
          state: string | null
          total_par: number | null
          total_yardage: number | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          course_rating?: number | null
          created_at?: string | null
          created_by?: string | null
          default_tee_color?: string | null
          default_tee_name?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          slope_rating?: number | null
          state?: string | null
          total_par?: number | null
          total_yardage?: number | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          course_rating?: number | null
          created_at?: string | null
          created_by?: string | null
          default_tee_color?: string | null
          default_tee_name?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          slope_rating?: number | null
          state?: string | null
          total_par?: number | null
          total_yardage?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      golf_documents: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          file_size: number
          file_type: string
          file_url: string
          id: string
          player_visible: boolean | null
          team_id: string
          title: string
          updated_at: string | null
          uploaded_by: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_size: number
          file_type: string
          file_url: string
          id?: string
          player_visible?: boolean | null
          team_id: string
          title: string
          updated_at?: string | null
          uploaded_by: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          player_visible?: boolean | null
          team_id?: string
          title?: string
          updated_at?: string | null
          uploaded_by?: string
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
          attendance_notes: string | null
          check_in_method: string | null
          checked_in: boolean | null
          checked_in_at: string | null
          checked_in_by: string | null
          event_id: string
          id: string
          no_show: boolean | null
          no_show_marked_at: string | null
          no_show_marked_by: string | null
          notified_at: string | null
          player_id: string
          reminder_sent: boolean | null
          responded_at: string | null
          status: Database["public"]["Enums"]["golf_attendance_status"] | null
        }
        Insert: {
          attendance_notes?: string | null
          check_in_method?: string | null
          checked_in?: boolean | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          event_id: string
          id?: string
          no_show?: boolean | null
          no_show_marked_at?: string | null
          no_show_marked_by?: string | null
          notified_at?: string | null
          player_id: string
          reminder_sent?: boolean | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["golf_attendance_status"] | null
        }
        Update: {
          attendance_notes?: string | null
          check_in_method?: string | null
          checked_in?: boolean | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          event_id?: string
          id?: string
          no_show?: boolean | null
          no_show_marked_at?: string | null
          no_show_marked_by?: string | null
          notified_at?: string | null
          player_id?: string
          reminder_sent?: boolean | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["golf_attendance_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_event_attendance_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "golf_attendance_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "golf_event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_event_attendance_no_show_marked_by_fkey"
            columns: ["no_show_marked_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_event_attendance_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_player_attendance_stats"
            referencedColumns: ["player_id"]
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
          excluded_date: string
          id: string
          reason: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          excluded_date: string
          id?: string
          reason?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          excluded_date?: string
          id?: string
          reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_event_exclusions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "golf_attendance_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "golf_event_exclusions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_event_status_log: {
        Row: {
          changed_at: string | null
          changed_by: string
          event_id: string
          id: string
          new_status: Database["public"]["Enums"]["golf_event_status"]
          old_status: Database["public"]["Enums"]["golf_event_status"] | null
          reason: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by: string
          event_id: string
          id?: string
          new_status: Database["public"]["Enums"]["golf_event_status"]
          old_status?: Database["public"]["Enums"]["golf_event_status"] | null
          reason?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string
          event_id?: string
          id?: string
          new_status?: Database["public"]["Enums"]["golf_event_status"]
          old_status?: Database["public"]["Enums"]["golf_event_status"] | null
          reason?: string | null
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
            referencedRelation: "golf_attendance_summary"
            referencedColumns: ["event_id"]
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
          cancelled_by: string | null
          check_in_closes_minutes_after: number | null
          check_in_opens_minutes_before: number | null
          class_id: string | null
          conflict_override_by: string | null
          conflict_override_reason: string | null
          course_name: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          enable_check_in: boolean | null
          end_date: string | null
          end_time: string | null
          event_type: Database["public"]["Enums"]["golf_event_type"]
          id: string
          ignore_conflicts: boolean | null
          is_exception: boolean | null
          is_mandatory: boolean | null
          location: string | null
          max_attendees: number | null
          original_start_date: string | null
          player_id: string | null
          qr_code_token: string | null
          recurrence_parent_id: string | null
          recurrence_rule: string | null
          require_coach_check_in: boolean | null
          requires_rsvp: boolean | null
          rsvp_deadline: string | null
          start_date: string
          start_time: string | null
          status: Database["public"]["Enums"]["golf_event_status"] | null
          team_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          check_in_closes_minutes_after?: number | null
          check_in_opens_minutes_before?: number | null
          class_id?: string | null
          conflict_override_by?: string | null
          conflict_override_reason?: string | null
          course_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          enable_check_in?: boolean | null
          end_date?: string | null
          end_time?: string | null
          event_type: Database["public"]["Enums"]["golf_event_type"]
          id?: string
          ignore_conflicts?: boolean | null
          is_exception?: boolean | null
          is_mandatory?: boolean | null
          location?: string | null
          max_attendees?: number | null
          original_start_date?: string | null
          player_id?: string | null
          qr_code_token?: string | null
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          require_coach_check_in?: boolean | null
          requires_rsvp?: boolean | null
          rsvp_deadline?: string | null
          start_date: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["golf_event_status"] | null
          team_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          check_in_closes_minutes_after?: number | null
          check_in_opens_minutes_before?: number | null
          class_id?: string | null
          conflict_override_by?: string | null
          conflict_override_reason?: string | null
          course_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          enable_check_in?: boolean | null
          end_date?: string | null
          end_time?: string | null
          event_type?: Database["public"]["Enums"]["golf_event_type"]
          id?: string
          ignore_conflicts?: boolean | null
          is_exception?: boolean | null
          is_mandatory?: boolean | null
          location?: string | null
          max_attendees?: number | null
          original_start_date?: string | null
          player_id?: string | null
          qr_code_token?: string | null
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          require_coach_check_in?: boolean | null
          requires_rsvp?: boolean | null
          rsvp_deadline?: string | null
          start_date?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["golf_event_status"] | null
          team_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_events_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_events_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "golf_player_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_events_conflict_override_by_fkey"
            columns: ["conflict_override_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
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
            foreignKeyName: "golf_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_player_attendance_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "golf_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_events_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "golf_attendance_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "golf_events_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
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
          access_token: string | null
          calendar_home_set: string | null
          calendar_name: string
          calendar_type: string
          calendar_url: string | null
          created_at: string | null
          ctag: string | null
          id: string
          last_sync_at: string | null
          last_sync_status: string | null
          principal_url: string | null
          refresh_token: string | null
          sync_direction: string | null
          sync_enabled: boolean | null
          sync_event_types: string[] | null
          sync_interval_minutes: number | null
          sync_team_ids: string[] | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          calendar_home_set?: string | null
          calendar_name: string
          calendar_type: string
          calendar_url?: string | null
          created_at?: string | null
          ctag?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          principal_url?: string | null
          refresh_token?: string | null
          sync_direction?: string | null
          sync_enabled?: boolean | null
          sync_event_types?: string[] | null
          sync_interval_minutes?: number | null
          sync_team_ids?: string[] | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          calendar_home_set?: string | null
          calendar_name?: string
          calendar_type?: string
          calendar_url?: string | null
          created_at?: string | null
          ctag?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          principal_url?: string | null
          refresh_token?: string | null
          sync_direction?: string | null
          sync_enabled?: boolean | null
          sync_event_types?: string[] | null
          sync_interval_minutes?: number | null
          sync_team_ids?: string[] | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      golf_hole_shots: {
        Row: {
          created_at: string | null
          hole_number: number
          id: string
          round_id: string
          shots_data: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          hole_number: number
          id?: string
          round_id: string
          shots_data?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          hole_number?: number
          id?: string
          round_id?: string
          shots_data?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_hole_shots_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "golf_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_holes: {
        Row: {
          approach_distance: number | null
          approach_lie: string | null
          approach_miss_direction: string | null
          approach_proximity: number | null
          approach_result: string | null
          created_at: string | null
          drive_miss_direction: string | null
          driving_distance: number | null
          fairway_hit: boolean | null
          first_putt_break: string | null
          first_putt_distance: number | null
          first_putt_leave: number | null
          first_putt_miss_direction: string | null
          first_putt_slope: string | null
          green_in_regulation: boolean | null
          hole_number: number
          holed_out_distance: number | null
          holed_out_type: string | null
          id: string
          par: number
          penalty_strokes: number | null
          putts: number | null
          round_id: string
          sand_save_attempt: boolean | null
          sand_save_made: boolean | null
          score: number | null
          score_to_par: number | null
          scramble_attempt: boolean | null
          scramble_made: boolean | null
          up_and_down_attempt: boolean | null
          up_and_down_made: boolean | null
          updated_at: string | null
          used_driver: boolean | null
          yardage: number | null
        }
        Insert: {
          approach_distance?: number | null
          approach_lie?: string | null
          approach_miss_direction?: string | null
          approach_proximity?: number | null
          approach_result?: string | null
          created_at?: string | null
          drive_miss_direction?: string | null
          driving_distance?: number | null
          fairway_hit?: boolean | null
          first_putt_break?: string | null
          first_putt_distance?: number | null
          first_putt_leave?: number | null
          first_putt_miss_direction?: string | null
          first_putt_slope?: string | null
          green_in_regulation?: boolean | null
          hole_number: number
          holed_out_distance?: number | null
          holed_out_type?: string | null
          id?: string
          par: number
          penalty_strokes?: number | null
          putts?: number | null
          round_id: string
          sand_save_attempt?: boolean | null
          sand_save_made?: boolean | null
          score?: number | null
          score_to_par?: number | null
          scramble_attempt?: boolean | null
          scramble_made?: boolean | null
          up_and_down_attempt?: boolean | null
          up_and_down_made?: boolean | null
          updated_at?: string | null
          used_driver?: boolean | null
          yardage?: number | null
        }
        Update: {
          approach_distance?: number | null
          approach_lie?: string | null
          approach_miss_direction?: string | null
          approach_proximity?: number | null
          approach_result?: string | null
          created_at?: string | null
          drive_miss_direction?: string | null
          driving_distance?: number | null
          fairway_hit?: boolean | null
          first_putt_break?: string | null
          first_putt_distance?: number | null
          first_putt_leave?: number | null
          first_putt_miss_direction?: string | null
          first_putt_slope?: string | null
          green_in_regulation?: boolean | null
          hole_number?: number
          holed_out_distance?: number | null
          holed_out_type?: string | null
          id?: string
          par?: number
          penalty_strokes?: number | null
          putts?: number | null
          round_id?: string
          sand_save_attempt?: boolean | null
          sand_save_made?: boolean | null
          score?: number | null
          score_to_par?: number | null
          scramble_attempt?: boolean | null
          scramble_made?: boolean | null
          up_and_down_attempt?: boolean | null
          up_and_down_made?: boolean | null
          updated_at?: string | null
          used_driver?: boolean | null
 