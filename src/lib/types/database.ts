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
          creator_id: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          creator_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          creator_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_creator_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      golf_coach_philosophy: {
        Row: {
          alert_bubble_player: boolean
          alert_closing_holes: boolean
          alert_par_3_issues: boolean
          alert_plateau: boolean
          alert_recurring_weakness: boolean
          alert_scoring_decline: boolean
          alert_sensitivity: string
          alert_stat_regression: boolean
          alert_streaks: boolean
          alert_surge_player: boolean
          alert_tournament_pressure: boolean
          bubble_zone_range: number
          coach_id: string
          created_at: string | null
          decline_threshold: number
          id: string
          insight_verbosity: string
          pressure_gap_threshold: number
          priority_ball_striking: number
          priority_course_management: number
          priority_mental_game: number
          priority_putting: number
          priority_short_game: number
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
          alert_sensitivity?: string
          alert_stat_regression?: boolean
          alert_streaks?: boolean
          alert_surge_player?: boolean
          alert_tournament_pressure?: boolean
          bubble_zone_range?: number
          coach_id: string
          created_at?: string | null
          decline_threshold?: number
          id?: string
          insight_verbosity?: string
          pressure_gap_threshold?: number
          priority_ball_striking?: number
          priority_course_management?: number
          priority_mental_game?: number
          priority_putting?: number
          priority_short_game?: number
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
          alert_sensitivity?: string
          alert_stat_regression?: boolean
          alert_streaks?: boolean
          alert_surge_player?: boolean
          alert_tournament_pressure?: boolean
          bubble_zone_range?: number
          coach_id?: string
          created_at?: string | null
          decline_threshold?: number
          id?: string
          insight_verbosity?: string
          pressure_gap_threshold?: number
          priority_ball_striking?: number
          priority_course_management?: number
          priority_mental_game?: number
          priority_putting?: number
          priority_short_game?: number
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
      golf_player_availability_blocks: {
        Row: {
          created_at: string | null
          end_date: string
          end_time: string | null
          id: string
          is_recurring: boolean | null
          player_id: string
          reason: string
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
          reason: string
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
          reason?: string
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
            referencedRelation: "golf_player_attendance_stats"
            referencedColumns: ["player_id"]
          },
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
          color: string | null
          course_code: string | null
          course_name: string
          created_at: string | null
          credits: number | null
          day_of_week: number
          days: string[] | null
          end_time: string
          id: string
          instructor: string | null
          location: string | null
          notes: string | null
          player_id: string
          room: string | null
          semester: string | null
          start_time: string
          updated_at: string | null
        }
        Insert: {
          building?: string | null
          color?: string | null
          course_code?: string | null
          course_name: string
          created_at?: string | null
          credits?: number | null
          day_of_week: number
          days?: string[] | null
          end_time: string
          id?: string
          instructor?: string | null
          location?: string | null
          notes?: string | null
          player_id: string
          room?: string | null
          semester?: string | null
          start_time: string
          updated_at?: string | null
        }
        Update: {
          building?: string | null
          color?: string | null
          course_code?: string | null
          course_name?: string
          created_at?: string | null
          credits?: number | null
          day_of_week?: number
          days?: string[] | null
          end_time?: string
          id?: string
          instructor?: string | null
          location?: string | null
          notes?: string | null
          player_id?: string
          room?: string | null
          semester?: string | null
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_classes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_player_attendance_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "golf_player_classes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_player_stats: {
        Row: {
          approach_eff_100_125: number | null
          approach_eff_125_150: number | null
          approach_eff_150_175: number | null
          approach_eff_175_200: number | null
          approach_eff_200_225: number | null
          approach_eff_225_plus: number | null
          approach_eff_30_75: number | null
          approach_eff_75_100: number | null
          approach_prox_100_125: number | null
          approach_prox_125_150: number | null
          approach_prox_150_175: number | null
          approach_prox_175_200: number | null
          approach_prox_200_225: number | null
          approach_prox_225_plus: number | null
          approach_prox_30_75: number | null
          approach_prox_75_100: number | null
          approach_proximity_avg: number | null
          approach_proximity_fairway: number | null
          approach_proximity_par3: number | null
          approach_proximity_par4: number | null
          approach_proximity_par5: number | null
          approach_proximity_rough: number | null
          approach_proximity_sand: number | null
          atg_eff_fairway: number | null
          atg_eff_rough: number | null
          atg_eff_sand: number | null
          atg_efficiency_0_10: number | null
          atg_efficiency_10_20: number | null
          atg_efficiency_20_30: number | null
          atg_efficiency_avg: number | null
          best_round: number | null
          birdies_per_round: number | null
          bogeys_per_round: number | null
          created_at: string | null
          current_no_3putt_streak: number | null
          double_plus_per_round: number | null
          driving_distance_avg: number | null
          driving_distance_driver_only: number | null
          eagles_per_round: number | null
          fairway_opportunities: number | null
          fairway_pct_driver: number | null
          fairway_pct_non_driver: number | null
          fairway_pct_par4: number | null
          fairway_pct_par5: number | null
          fairway_percentage: number | null
          fairways_hit: number | null
          gir_opportunities: number | null
          gir_pct_par3: number | null
          gir_pct_par4: number | null
          gir_pct_par5: number | null
          gir_per_round: number | null
          gir_percentage: number | null
          gir_total: number | null
          holes_played: number | null
          id: string
          last_calculated_at: string | null
          longest_hole_out: number | null
          longest_no_3putt_streak: number | null
          miss_left_count: number | null
          miss_left_pct: number | null
          miss_right_count: number | null
          miss_right_pct: number | null
          most_birdies_round: number | null
          most_birdies_row: number | null
          most_pars_row: number | null
          one_putts_total: number | null
          pars_per_round: number | null
          penalties_per_round: number | null
          player_id: string
          practice_rounds: number | null
          practice_scoring_avg: number | null
          putt_efficiency_0_3: number | null
          putt_efficiency_10_15: number | null
          putt_efficiency_15_20: number | null
          putt_efficiency_20_25: number | null
          putt_efficiency_25_30: number | null
          putt_efficiency_3_5: number | null
          putt_efficiency_30_plus: number | null
          putt_efficiency_5_10: number | null
          putt_make_pct_0_3: number | null
          putt_make_pct_10_15: number | null
          putt_make_pct_15_20: number | null
          putt_make_pct_20_25: number | null
          putt_make_pct_25_30: number | null
          putt_make_pct_3_5: number | null
          putt_make_pct_30_35: number | null
          putt_make_pct_35_plus: number | null
          putt_make_pct_5_10: number | null
          putt_miss_left_pct: number | null
          putt_miss_long_pct: number | null
          putt_miss_right_pct: number | null
          putt_miss_short_pct: number | null
          putt_proximity_10_15: number | null
          putt_proximity_15_20: number | null
          putt_proximity_20_plus: number | null
          putt_proximity_5_10: number | null
          putt_proximity_avg: number | null
          putts_per_gir: number | null
          putts_per_hole: number | null
          putts_per_round: number | null
          qualifying_rounds: number | null
          qualifying_scoring_avg: number | null
          rounds_played: number | null
          sand_save_attempts: number | null
          sand_save_percentage: number | null
          sand_saves_made: number | null
          scoring_average: number | null
          scramble_attempts: number | null
          scrambles_made: number | null
          scrambling_pct_0_10: number | null
          scrambling_pct_10_20: number | null
          scrambling_pct_20_30: number | null
          scrambling_pct_fairway: number | null
          scrambling_pct_rough: number | null
          scrambling_pct_sand: number | null
          scrambling_percentage: number | null
          three_putts_per_round: number | null
          three_putts_total: number | null
          total_birdies: number | null
          total_bogeys: number | null
          total_double_plus: number | null
          total_eagles: number | null
          total_pars: number | null
          total_penalties: number | null
          total_putts: number | null
          tournament_rounds: number | null
          tournament_scoring_avg: number | null
          updated_at: string | null
          worst_round: number | null
        }
        Insert: {
          approach_eff_100_125?: number | null
          approach_eff_125_150?: number | null
          approach_eff_150_175?: number | null
          approach_eff_175_200?: number | null
          approach_eff_200_225?: number | null
          approach_eff_225_plus?: number | null
          approach_eff_30_75?: number | null
          approach_eff_75_100?: number | null
          approach_prox_100_125?: number | null
          approach_prox_125_150?: number | null
          approach_prox_150_175?: number | null
          approach_prox_175_200?: number | null
          approach_prox_200_225?: number | null
          approach_prox_225_plus?: number | null
          approach_prox_30_75?: number | null
          approach_prox_75_100?: number | null
          approach_proximity_avg?: number | null
          approach_proximity_fairway?: number | null
          approach_proximity_par3?: number | null
          approach_proximity_par4?: number | null
          approach_proximity_par5?: number | null
          approach_proximity_rough?: number | null
          approach_proximity_sand?: number | null
          atg_eff_fairway?: number | null
          atg_eff_rough?: number | null
          atg_eff_sand?: number | null
          atg_efficiency_0_10?: number | null
          atg_efficiency_10_20?: number | null
          atg_efficiency_20_30?: number | null
          atg_efficiency_avg?: number | null
          best_round?: number | null
          birdies_per_round?: number | null
          bogeys_per_round?: number | null
          created_at?: string | null
          current_no_3putt_streak?: number | null
          double_plus_per_round?: number | null
          driving_distance_avg?: number | null
          driving_distance_driver_only?: number | null
          eagles_per_round?: number | null
          fairway_opportunities?: number | null
          fairway_pct_driver?: number | null
          fairway_pct_non_driver?: number | null
          fairway_pct_par4?: number | null
          fairway_pct_par5?: number | null
          fairway_percentage?: number | null
          fairways_hit?: number | null
          gir_opportunities?: number | null
          gir_pct_par3?: number | null
          gir_pct_par4?: number | null
          gir_pct_par5?: number | null
          gir_per_round?: number | null
          gir_percentage?: number | null
          gir_total?: number | null
          holes_played?: number | null
          id?: string
          last_calculated_at?: string | null
          longest_hole_out?: number | null
          longest_no_3putt_streak?: number | null
          miss_left_count?: number | null
          miss_left_pct?: number | null
          miss_right_count?: number | null
          miss_right_pct?: number | null
          most_birdies_round?: number | null
          most_birdies_row?: number | null
          most_pars_row?: number | null
          one_putts_total?: number | null
          pars_per_round?: number | null
          penalties_per_round?: number | null
          player_id: string
          practice_rounds?: number | null
          practice_scoring_avg?: number | null
          putt_efficiency_0_3?: number | null
          putt_efficiency_10_15?: number | null
          putt_efficiency_15_20?: number | null
          putt_efficiency_20_25?: number | null
          putt_efficiency_25_30?: number | null
          putt_efficiency_3_5?: number | null
          putt_efficiency_30_plus?: number | null
          putt_efficiency_5_10?: number | null
          putt_make_pct_0_3?: number | null
          putt_make_pct_10_15?: number | null
          putt_make_pct_15_20?: number | null
          putt_make_pct_20_25?: number | null
          putt_make_pct_25_30?: number | null
          putt_make_pct_3_5?: number | null
          putt_make_pct_30_35?: number | null
          putt_make_pct_35_plus?: number | null
          putt_make_pct_5_10?: number | null
          putt_miss_left_pct?: number | null
          putt_miss_long_pct?: number | null
          putt_miss_right_pct?: number | null
          putt_miss_short_pct?: number | null
          putt_proximity_10_15?: number | null
          putt_proximity_15_20?: number | null
          putt_proximity_20_plus?: number | null
          putt_proximity_5_10?: number | null
          putt_proximity_avg?: number | null
          putts_per_gir?: number | null
          putts_per_hole?: number | null
          putts_per_round?: number | null
          qualifying_rounds?: number | null
          qualifying_scoring_avg?: number | null
          rounds_played?: number | null
          sand_save_attempts?: number | null
          sand_save_percentage?: number | null
          sand_saves_made?: number | null
          scoring_average?: number | null
          scramble_attempts?: number | null
          scrambles_made?: number | null
          scrambling_pct_0_10?: number | null
          scrambling_pct_10_20?: number | null
          scrambling_pct_20_30?: number | null
          scrambling_pct_fairway?: number | null
          scrambling_pct_rough?: number | null
          scrambling_pct_sand?: number | null
          scrambling_percentage?: number | null
          three_putts_per_round?: number | null
          three_putts_total?: number | null
          total_birdies?: number | null
          total_bogeys?: number | null
          total_double_plus?: number | null
          total_eagles?: number | null
          total_pars?: number | null
          total_penalties?: number | null
          total_putts?: number | null
          tournament_rounds?: number | null
          tournament_scoring_avg?: number | null
          updated_at?: string | null
          worst_round?: number | null
        }
        Update: {
          approach_eff_100_125?: number | null
          approach_eff_125_150?: number | null
          approach_eff_150_175?: number | null
          approach_eff_175_200?: number | null
          approach_eff_200_225?: number | null
          approach_eff_225_plus?: number | null
          approach_eff_30_75?: number | null
          approach_eff_75_100?: number | null
          approach_prox_100_125?: number | null
          approach_prox_125_150?: number | null
          approach_prox_150_175?: number | null
          approach_prox_175_200?: number | null
          approach_prox_200_225?: number | null
          approach_prox_225_plus?: number | null
          approach_prox_30_75?: number | null
          approach_prox_75_100?: number | null
          approach_proximity_avg?: number | null
          approach_proximity_fairway?: number | null
          approach_proximity_par3?: number | null
          approach_proximity_par4?: number | null
          approach_proximity_par5?: number | null
          approach_proximity_rough?: number | null
          approach_proximity_sand?: number | null
          atg_eff_fairway?: number | null
          atg_eff_rough?: number | null
          atg_eff_sand?: number | null
          atg_efficiency_0_10?: number | null
          atg_efficiency_10_20?: number | null
          atg_efficiency_20_30?: number | null
          atg_efficiency_avg?: number | null
          best_round?: number | null
          birdies_per_round?: number | null
          bogeys_per_round?: number | null
          created_at?: string | null
          current_no_3putt_streak?: number | null
          double_plus_per_round?: number | null
          driving_distance_avg?: number | null
          driving_distance_driver_only?: number | null
          eagles_per_round?: number | null
          fairway_opportunities?: number | null
          fairway_pct_driver?: number | null
          fairway_pct_non_driver?: number | null
          fairway_pct_par4?: number | null
          fairway_pct_par5?: number | null
          fairway_percentage?: number | null
          fairways_hit?: number | null
          gir_opportunities?: number | null
          gir_pct_par3?: number | null
          gir_pct_par4?: number | null
          gir_pct_par5?: number | null
          gir_per_round?: number | null
          gir_percentage?: number | null
          gir_total?: number | null
          holes_played?: number | null
          id?: string
          last_calculated_at?: string | null
          longest_hole_out?: number | null
          longest_no_3putt_streak?: number | null
          miss_left_count?: number | null
          miss_left_pct?: number | null
          miss_right_count?: number | null
          miss_right_pct?: number | null
          most_birdies_round?: number | null
          most_birdies_row?: number | null
          most_pars_row?: number | null
          one_putts_total?: number | null
          pars_per_round?: number | null
          penalties_per_round?: number | null
          player_id?: string
          practice_rounds?: number | null
          practice_scoring_avg?: number | null
          putt_efficiency_0_3?: number | null
          putt_efficiency_10_15?: number | null
          putt_efficiency_15_20?: number | null
          putt_efficiency_20_25?: number | null
          putt_efficiency_25_30?: number | null
          putt_efficiency_3_5?: number | null
          putt_efficiency_30_plus?: number | null
          putt_efficiency_5_10?: number | null
          putt_make_pct_0_3?: number | null
          putt_make_pct_10_15?: number | null
          putt_make_pct_15_20?: number | null
          putt_make_pct_20_25?: number | null
          putt_make_pct_25_30?: number | null
          putt_make_pct_3_5?: number | null
          putt_make_pct_30_35?: number | null
          putt_make_pct_35_plus?: number | null
          putt_make_pct_5_10?: number | null
          putt_miss_left_pct?: number | null
          putt_miss_long_pct?: number | null
          putt_miss_right_pct?: number | null
          putt_miss_short_pct?: number | null
          putt_proximity_10_15?: number | null
          putt_proximity_15_20?: number | null
          putt_proximity_20_plus?: number | null
          putt_proximity_5_10?: number | null
          putt_proximity_avg?: number | null
          putts_per_gir?: number | null
          putts_per_hole?: number | null
          putts_per_round?: number | null
          qualifying_rounds?: number | null
          qualifying_scoring_avg?: number | null
          rounds_played?: number | null
          sand_save_attempts?: number | null
          sand_save_percentage?: number | null
          sand_saves_made?: number | null
          scoring_average?: number | null
          scramble_attempts?: number | null
          scrambles_made?: number | null
          scrambling_pct_0_10?: number | null
          scrambling_pct_10_20?: number | null
          scrambling_pct_20_30?: number | null
          scrambling_pct_fairway?: number | null
          scrambling_pct_rough?: number | null
          scrambling_pct_sand?: number | null
          scrambling_percentage?: number | null
          three_putts_per_round?: number | null
          three_putts_total?: number | null
          total_birdies?: number | null
          total_bogeys?: number | null
          total_double_plus?: number | null
          total_eagles?: number | null
          total_pars?: number | null
          total_penalties?: number | null
          total_putts?: number | null
          tournament_rounds?: number | null
          tournament_scoring_avg?: number | null
          updated_at?: string | null
          worst_round?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "golf_player_attendance_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "golf_player_stats_player_id_fkey"
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
          calendar_feed_enabled: boolean | null
          calendar_feed_public: boolean | null
          calendar_feed_token: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          gpa: number | null
          graduation_year: number | null
          handicap: number | null
          handicap_index: number | null
          hometown: string | null
          id: string
          last_name: string | null
          major: string | null
          onboarding_completed: boolean | null
          phone: string | null
          player_year: string | null
          profile_complete: boolean | null
          scholarship_percentage: number | null
          state: string | null
          status: Database["public"]["Enums"]["golf_player_status"] | null
          team_id: string | null
          updated_at: string | null
          user_id: string | null
          year: Database["public"]["Enums"]["golf_player_year"] | null
        }
        Insert: {
          avatar_url?: string | null
          calendar_feed_enabled?: boolean | null
          calendar_feed_public?: boolean | null
          calendar_feed_token?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          gpa?: number | null
          graduation_year?: number | null
          handicap?: number | null
          handicap_index?: number | null
          hometown?: string | null
          id?: string
          last_name?: string | null
          major?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          player_year?: string | null
          profile_complete?: boolean | null
          scholarship_percentage?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["golf_player_status"] | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          year?: Database["public"]["Enums"]["golf_player_year"] | null
        }
        Update: {
          avatar_url?: string | null
          calendar_feed_enabled?: boolean | null
          calendar_feed_public?: boolean | null
          calendar_feed_token?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          gpa?: number | null
          graduation_year?: number | null
          handicap?: number | null
          handicap_index?: number | null
          hometown?: string | null
          id?: string
          last_name?: string | null
          major?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          player_year?: string | null
          profile_complete?: boolean | null
          scholarship_percentage?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["golf_player_status"] | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          year?: Database["public"]["Enums"]["golf_player_year"] | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_poll_responses: {
        Row: {
          date_option: string
          id: string
          is_available: boolean
          notes: string | null
          player_id: string
          poll_id: string
          preference_level: number | null
          responded_at: string | null
          time_option: string
        }
        Insert: {
          date_option: string
          id?: string
          is_available: boolean
          notes?: string | null
          player_id: string
          poll_id: string
          preference_level?: number | null
          responded_at?: string | null
          time_option: string
        }
        Update: {
          date_option?: string
          id?: string
          is_available?: boolean
          notes?: string | null
          player_id?: string
          poll_id?: string
          preference_level?: number | null
          responded_at?: string | null
          time_option?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_poll_responses_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_player_attendance_stats"
            referencedColumns: ["player_id"]
          },
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
      golf_qualifier_entries: {
        Row: {
          created_at: string | null
          id: string
          is_tied: boolean | null
          player_id: string
          position: number | null
          qualifier_id: string
          rounds_completed: number | null
          total_score: number | null
          total_to_par: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_tied?: boolean | null
          player_id: string
          position?: number | null
          qualifier_id: string
          rounds_completed?: number | null
          total_score?: number | null
          total_to_par?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_tied?: boolean | null
          player_id?: string
          position?: number | null
          qualifier_id?: string
          rounds_completed?: number | null
          total_score?: number | null
          total_to_par?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_qualifier_entries_qualifier_id_fkey"
            columns: ["qualifier_id"]
            isOneToOne: false
            referencedRelation: "golf_qualifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_qualifiers: {
        Row: {
          course_name: string | null
          created_at: string | null
          created_by: string
          description: string | null
          end_date: string | null
          holes_per_round: number
          id: string
          location: string | null
          name: string
          num_rounds: number
          show_live_leaderboard: boolean | null
          start_date: string
          status: Database["public"]["Enums"]["golf_qualifier_status"] | null
          team_id: string
          updated_at: string | null
        }
        Insert: {
          course_name?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          end_date?: string | null
          holes_per_round?: number
          id?: string
          location?: string | null
          name: string
          num_rounds?: number
          show_live_leaderboard?: boolean | null
          start_date: string
          status?: Database["public"]["Enums"]["golf_qualifier_status"] | null
          team_id: string
          updated_at?: string | null
        }
        Update: {
          course_name?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          end_date?: string | null
          holes_per_round?: number
          id?: string
          location?: string | null
          name?: string
          num_rounds?: number
          show_live_leaderboard?: boolean | null
          start_date?: string
          status?: Database["public"]["Enums"]["golf_qualifier_status"] | null
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
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
      golf_rounds: {
        Row: {
          birdies: number | null
          bogeys: number | null
          course_city: string | null
          course_name: string
          course_rating: number | null
          course_slope: number | null
          course_state: string | null
          created_at: string | null
          current_hole: number | null
          double_bogeys_plus: number | null
          driving_accuracy: number | null
          driving_distance_avg: number | null
          eagles: number | null
          fairways_hit: number | null
          fairways_total: number | null
          greens_in_regulation: number | null
          greens_total: number | null
          holes_to_play: number | null
          id: string
          is_verified: boolean | null
          longest_drive: number | null
          longest_hole_out: number | null
          longest_putt_made: number | null
          pars: number | null
          penalty_strokes: number | null
          player_id: string
          putts_per_gir: number | null
          round_date: string
          round_type: string | null
          sand_save_attempts: number | null
          sand_saves_made: number | null
          scrambles_made: number | null
          scrambling_attempts: number | null
          starting_hole: number | null
          status: Database["public"]["Enums"]["golf_round_status"]
          tees_played: string | null
          three_putts: number | null
          total_putts: number | null
          total_score: number | null
          total_to_par: number | null
          updated_at: string | null
        }
        Insert: {
          birdies?: number | null
          bogeys?: number | null
          course_city?: string | null
          course_name: string
          course_rating?: number | null
          course_slope?: number | null
          course_state?: string | null
          created_at?: string | null
          current_hole?: number | null
          double_bogeys_plus?: number | null
          driving_accuracy?: number | null
          driving_distance_avg?: number | null
          eagles?: number | null
          fairways_hit?: number | null
          fairways_total?: number | null
          greens_in_regulation?: number | null
          greens_total?: number | null
          holes_to_play?: number | null
          id?: string
          is_verified?: boolean | null
          longest_drive?: number | null
          longest_hole_out?: number | null
          longest_putt_made?: number | null
          pars?: number | null
          penalty_strokes?: number | null
          player_id: string
          putts_per_gir?: number | null
          round_date: string
          round_type?: string | null
          sand_save_attempts?: number | null
          sand_saves_made?: number | null
          scrambles_made?: number | null
          scrambling_attempts?: number | null
          starting_hole?: number | null
          status?: Database["public"]["Enums"]["golf_round_status"]
          tees_played?: string | null
          three_putts?: number | null
          total_putts?: number | null
          total_score?: number | null
          total_to_par?: number | null
          updated_at?: string | null
        }
        Update: {
          birdies?: number | null
          bogeys?: number | null
          course_city?: string | null
          course_name?: string
          course_rating?: number | null
          course_slope?: number | null
          course_state?: string | null
          created_at?: string | null
          current_hole?: number | null
          double_bogeys_plus?: number | null
          driving_accuracy?: number | null
          driving_distance_avg?: number | null
          eagles?: number | null
          fairways_hit?: number | null
          fairways_total?: number | null
          greens_in_regulation?: number | null
          greens_total?: number | null
          holes_to_play?: number | null
          id?: string
          is_verified?: boolean | null
          longest_drive?: number | null
          longest_hole_out?: number | null
          longest_putt_made?: number | null
          pars?: number | null
          penalty_strokes?: number | null
          player_id?: string
          putts_per_gir?: number | null
          round_date?: string
          round_type?: string | null
          sand_save_attempts?: number | null
          sand_saves_made?: number | null
          scrambles_made?: number | null
          scrambling_attempts?: number | null
          starting_hole?: number | null
          status?: Database["public"]["Enums"]["golf_round_status"]
          tees_played?: string | null
          three_putts?: number | null
          total_putts?: number | null
          total_score?: number | null
          total_to_par?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_rounds_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_player_attendance_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "golf_rounds_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_shots: {
        Row: {
          club_type: string
          created_at: string | null
          distance_to_hole_after: number | null
          distance_to_hole_before: number | null
          distance_unit_after: string | null
          distance_unit_before: string | null
          hole_id: string | null
          hole_number: number
          id: string
          is_penalty: boolean | null
          lie_before: string | null
          miss_direction: string | null
          penalty_type: string | null
          putt_break: string | null
          putt_slope: string | null
          result: string
          round_id: string
          shot_distance: number | null
          shot_number: number
          shot_type: string
          updated_at: string | null
        }
        Insert: {
          club_type: string
          created_at?: string | null
          distance_to_hole_after?: number | null
          distance_to_hole_before?: number | null
          distance_unit_after?: string | null
          distance_unit_before?: string | null
          hole_id?: string | null
          hole_number: number
          id?: string
          is_penalty?: boolean | null
          lie_before?: string | null
          miss_direction?: string | null
          penalty_type?: string | null
          putt_break?: string | null
          putt_slope?: string | null
          result: string
          round_id: string
          shot_distance?: number | null
          shot_number: number
          shot_type: string
          updated_at?: string | null
        }
        Update: {
          club_type?: string
          created_at?: string | null
          distance_to_hole_after?: number | null
          distance_to_hole_before?: number | null
          distance_unit_after?: string | null
          distance_unit_before?: string | null
          hole_id?: string | null
          hole_number?: number
          id?: string
          is_penalty?: boolean | null
          lie_before?: string | null
          miss_direction?: string | null
          penalty_type?: string | null
          putt_break?: string | null
          putt_slope?: string | null
          result?: string
          round_id?: string
          shot_distance?: number | null
          shot_number?: number
          shot_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_shots_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "golf_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_sync_conflict_rules: {
        Row: {
          created_at: string | null
          default_strategy: string | null
          description_strategy: string | null
          id: string
          location_strategy: string | null
          time_strategy: string | null
          title_strategy: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          default_strategy?: string | null
          description_strategy?: string | null
          id?: string
          location_strategy?: string | null
          time_strategy?: string | null
          title_strategy?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          default_strategy?: string | null
          description_strategy?: string | null
          id?: string
          location_strategy?: string | null
          time_strategy?: string | null
          title_strategy?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      golf_task_completions: {
        Row: {
          completed_at: string | null
          id: string
          player_id: string
          task_id: string
          upload_url: string | null
        }
        Insert: {
          completed_at?: string | null
          id?: string
          player_id: string
          task_id: string
          upload_url?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: string
          player_id?: string
          task_id?: string
          upload_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "golf_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          requires_upload: boolean | null
          team_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          requires_upload?: boolean | null
          team_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          requires_upload?: boolean | null
          team_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
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
      golf_teams: {
        Row: {
          calendar_feed_enabled: boolean | null
          calendar_feed_public: boolean | null
          calendar_feed_token: string | null
          created_at: string | null
          id: string
          invite_code: string | null
          name: string
          organization_id: string | null
          season: string | null
          updated_at: string | null
        }
        Insert: {
          calendar_feed_enabled?: boolean | null
          calendar_feed_public?: boolean | null
          calendar_feed_token?: string | null
          created_at?: string | null
          id?: string
          invite_code?: string | null
          name: string
          organization_id?: string | null
          season?: string | null
          updated_at?: string | null
        }
        Update: {
          calendar_feed_enabled?: boolean | null
          calendar_feed_public?: boolean | null
          calendar_feed_token?: string | null
          created_at?: string | null
          id?: string
          invite_code?: string | null
          name?: string
          organization_id?: string | null
          season?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "golf_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_travel_itineraries: {
        Row: {
          check_in_date: string | null
          check_out_date: string | null
          created_at: string | null
          created_by: string
          departure_date: string
          departure_location: string | null
          departure_time: string | null
          destination: string
          event_id: string | null
          event_name: string
          flight_info: string | null
          gear_list: string | null
          hotel_address: string | null
          hotel_confirmation: string | null
          hotel_name: string | null
          hotel_phone: string | null
          id: string
          notes: string | null
          return_date: string | null
          return_time: string | null
          room_assignments: string | null
          team_id: string
          transportation_type: Database["public"]["Enums"]["golf_transportation_type"]
          uniform_requirements: string | null
          updated_at: string | null
        }
        Insert: {
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string | null
          created_by: string
          departure_date: string
          departure_location?: string | null
          departure_time?: string | null
          destination: string
          event_id?: string | null
          event_name: string
          flight_info?: string | null
          gear_list?: string | null
          hotel_address?: string | null
          hotel_confirmation?: string | null
          hotel_name?: string | null
          hotel_phone?: string | null
          id?: string
          notes?: string | null
          return_date?: string | null
          return_time?: string | null
          room_assignments?: string | null
          team_id: string
          transportation_type: Database["public"]["Enums"]["golf_transportation_type"]
          uniform_requirements?: string | null
          updated_at?: string | null
        }
        Update: {
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string | null
          created_by?: string
          departure_date?: string
          departure_location?: string | null
          departure_time?: string | null
          destination?: string
          event_id?: string | null
          event_name?: string
          flight_info?: string | null
          gear_list?: string | null
          hotel_address?: string | null
          hotel_confirmation?: string | null
          hotel_name?: string | null
          hotel_phone?: string | null
          id?: string
          notes?: string | null
          return_date?: string | null
          return_time?: string | null
          room_assignments?: string | null
          team_id?: string
          transportation_type?: Database["public"]["Enums"]["golf_transportation_type"]
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
            referencedRelation: "golf_attendance_summary"
            referencedColumns: ["event_id"]
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
      login_attempts: {
        Row: {
          created_at: string
          email: string
          failed_attempts: number
          id: string
          last_attempt: string
          last_ip: string | null
          last_user_agent: string | null
          locked_until: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          failed_attempts?: number
          id?: string
          last_attempt?: string
          last_ip?: string | null
          last_user_agent?: string | null
          locked_until?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          failed_attempts?: number
          id?: string
          last_attempt?: string
          last_ip?: string | null
          last_user_agent?: string | null
          locked_until?: string | null
          updated_at?: string
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
          updated_at: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          id?: string
          read?: boolean | null
          sender_id: string
          sent_at?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          id?: string
          read?: boolean | null
          sender_id?: string
          sent_at?: string | null
          updated_at?: string | null
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
          updated_at: string | null
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
          updated_at?: string | null
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
          updated_at?: string | null
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
      player_comparisons: {
        Row: {
          coach_id: string
          comparison_data: Json | null
          created_at: string
          description: string | null
          id: string
          name: string
          player_ids: string[]
          updated_at: string
        }
        Insert: {
          coach_id: string
          comparison_data?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          player_ids: string[]
          updated_at?: string
        }
        Update: {
          coach_id?: string
          comparison_data?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          player_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_comparisons_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
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
          profile_complete: boolean | null
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
          profile_complete?: boolean | null
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
          profile_complete?: boolean | null
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
      round_holes: {
        Row: {
          created_at: string | null
          hole_number: number
          id: string
          par: number
          round_id: string
          yardage: number
        }
        Insert: {
          created_at?: string | null
          hole_number: number
          id?: string
          par: number
          round_id: string
          yardage: number
        }
        Update: {
          created_at?: string | null
          hole_number?: number
          id?: string
          par?: number
          round_id?: string
          yardage?: number
        }
        Relationships: []
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
          sport: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          sport?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          sport?: string | null
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
          updated_at: string | null
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
          updated_at?: string | null
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
          updated_at?: string | null
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
          last_contact: string | null
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
          last_contact?: string | null
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
          last_contact?: string | null
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
      golf_attendance_summary: {
        Row: {
          attendance_percentage: number | null
          checked_in_count: number | null
          event_id: string | null
          event_title: string | null
          no_show_count: number | null
          rsvp_yes: number | null
          start_date: string | null
          team_id: string | null
          total_rsvps: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_player_attendance_stats: {
        Row: {
          attendance_rate: number | null
          attended_count: number | null
          first_name: string | null
          last_name: string | null
          no_show_count: number | null
          player_id: string | null
          rsvp_yes_count: number | null
          team_id: string | null
          total_events: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_sync_status_overview: {
        Row: {
          calendar_id: string | null
          calendar_name: string | null
          calendar_type: string | null
          conflicts: number | null
          errors: number | null
          last_sync_at: string | null
          last_sync_status: string | null
          pending: number | null
          sync_enabled: boolean | null
          total_synced_events: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auto_resolve_conflict: {
        Args: { p_strategy?: string; p_sync_state_id: string }
        Returns: boolean
      }
      calculate_coach_completion: {
        Args: { p_coach_id: string }
        Returns: number
      }
      calculate_player_stats: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      calculate_poll_results: {
        Args: { p_poll_id: string }
        Returns: {
          availability_percentage: number
          available_count: number
          average_preference: number
          date_option: string
          time_option: string
          total_responses: number
        }[]
      }
      calculate_profile_completion:
        | {
            Args: { p: Database["public"]["Tables"]["players"]["Row"] }
            Returns: number
          }
        | { Args: { player_id_param: string }; Returns: number }
      can_view_golf_player: { Args: { player_uuid: string }; Returns: boolean }
      check_player_availability: {
        Args: {
          p_end_date: string
          p_end_time: string
          p_player_id: string
          p_start_date: string
          p_start_time: string
        }
        Returns: {
          block_end_date: string
          block_reason: string
          block_start_date: string
          is_blocked: boolean
        }[]
      }
      cleanup_old_login_attempts: { Args: never; Returns: undefined }
      create_conversation_with_participants:
        | {
            Args: { p_creator_id: string; p_participant_user_ids: string[] }
            Returns: string
          }
        | {
            Args: { p_participant_user_ids: string[]; p_title?: string }
            Returns: string
          }
        | { Args: { participant_user_ids: string[] }; Returns: string }
      detect_event_conflicts: {
        Args: {
          p_end_date: string
          p_end_time: string
          p_event_id: string
          p_ignore_conflicts?: boolean
          p_start_date: string
          p_start_time: string
          p_team_id: string
        }
        Returns: {
          conflict_end_date: string
          conflict_event_id: string
          conflict_event_title: string
          conflict_start_date: string
          conflict_type: string
        }[]
      }
      find_golf_team_by_invite: {
        Args: { invite_code_input: string }
        Returns: string
      }
      get_active_dev_plans: {
        Args: { p_player_id: string }
        Returns: {
          coach_id: string
          created_at: string
          id: string
          player_id: string
          status: string
          title: string
          updated_at: string
        }[]
      }
      get_coach_profile: {
        Args: { p_coach_id: string }
        Returns: {
          coach_type: string
          conference: string
          division: string
          email: string
          id: string
          name: string
          organization_id: string
          organization_name: string
          user_id: string
        }[]
      }
      get_coach_teams: {
        Args: { p_coach_id: string }
        Returns: {
          is_head_coach: boolean
          season: string
          team_id: string
          team_name: string
          team_type: string
        }[]
      }
      get_engagement_trends:
        | {
            Args: { p_days?: number; p_interval?: string; p_player_id: string }
            Returns: {
              period: string
              profile_views: number
              video_views: number
              watchlist_adds: number
            }[]
          }
        | {
            Args: { days_param?: number; player_id_param: string }
            Returns: {
              date: string
              messages: number
              profile_views: number
              total_events: number
              video_views: number
            }[]
          }
      get_events_needing_sync: {
        Args: { p_external_calendar_id: string; p_limit?: number }
        Returns: {
          event_id: string
          event_title: string
          last_modified_source: string
          sync_status: string
        }[]
      }
      get_golf_coach_id: { Args: never; Returns: string }
      get_golf_coach_team_id: { Args: never; Returns: string }
      get_golf_player_id: { Args: never; Returns: string }
      get_golf_player_team_id: { Args: never; Returns: string }
      get_player_engagement_summary: {
        Args: { p_days?: number; p_player_id: string }
        Returns: {
          recent_engagement_count: number
          total_profile_views: number
          total_video_views: number
          total_views: number
          unique_viewers: number
        }[]
      }
      get_player_notes: {
        Args: { p_coach_id: string; p_player_id: string }
        Returns: {
          coach_id: string
          created_at: string
          id: string
          note: string
          player_id: string
          tags: string[]
          updated_at: string
        }[]
      }
      get_player_teams: {
        Args: { p_player_id: string }
        Returns: {
          season: string
          team_id: string
          team_name: string
          team_type: string
        }[]
      }
      get_recent_engagement: {
        Args: { p_limit?: number; p_player_id: string }
        Returns: {
          created_at: string
          event_type: string
          id: string
          viewer_user_id: string
        }[]
      }
      get_suggested_best_times: {
        Args: { p_min_availability_percentage?: number; p_poll_id: string }
        Returns: {
          available_count: number
          date_option: string
          score: number
          time_option: string
          total_responses: number
        }[]
      }
      get_upcoming_events: {
        Args: { p_coach_id: string; p_days?: number }
        Returns: {
          end_time: string
          event_type: string
          id: string
          start_time: string
          title: string
        }[]
      }
      get_user_golf_team_id: { Args: never; Returns: string }
      get_user_team_ids: { Args: never; Returns: string[] }
      increment_video_view: { Args: { vid_id: string }; Returns: undefined }
      is_golf_coach_of_team: { Args: { team_uuid: string }; Returns: boolean }
      is_golf_player_of_team: { Args: { team_uuid: string }; Returns: boolean }
      is_golf_team_member: { Args: { team_uuid: string }; Returns: boolean }
      is_user_on_team_staff: { Args: { team_uuid: string }; Returns: boolean }
      mark_no_shows_for_past_events: { Args: never; Returns: undefined }
      needs_sync: {
        Args: { p_external_calendar_id: string; p_golf_event_id: string }
        Returns: boolean
      }
      record_profile_view:
        | {
            Args: {
              p_coach_id?: string
              p_duration_seconds?: number
              p_is_anonymous?: boolean
              p_player_id: string
            }
            Returns: string
          }
        | {
            Args: { viewed_player_id: string; viewer_id: string }
            Returns: undefined
          }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      user_is_in_conversation: {
        Args: { conv_id: string; user_id_to_check: string }
        Returns: boolean
      }
    }
    Enums: {
      coach_type: "college" | "high_school" | "juco" | "showcase"
      golf_attendance_status:
        | "attending"
        | "not_attending"
        | "maybe"
        | "pending"
        | "accepted"
        | "declined"
        | "tentative"
      golf_event_status: "draft" | "confirmed" | "cancelled"
      golf_event_type:
        | "practice"
        | "tournament"
        | "qualifier"
        | "meeting"
        | "travel"
        | "other"
        | "class"
      golf_player_status: "active" | "injured" | "redshirt" | "inactive"
      golf_player_year:
        | "freshman"
        | "sophomore"
        | "junior"
        | "senior"
        | "fifth_year"
        | "graduate"
      golf_qualifier_status: "upcoming" | "in_progress" | "completed"
      golf_round_status: "in_progress" | "completed" | "abandoned"
      golf_round_type: "tournament" | "qualifier" | "practice" | "casual"
      golf_task_status: "pending" | "completed" | "overdue"
      golf_transportation_type: "bus" | "van" | "fly" | "carpool"
      golf_urgency_level: "low" | "normal" | "high" | "urgent"
      notification_type:
        | "message"
        | "watchlist_add"
        | "profile_view"
        | "interest"
        | "offer"
        | "system"
      organization_type:
        | "college"
        | "high_school"
        | "juco"
        | "showcase_org"
        | "travel_ball"
      pipeline_stage:
        | "watchlist"
        | "high_priority"
        | "contacted"
        | "campus_visit"
        | "offer_extended"
        | "committed"
        | "uninterested"
      player_type: "high_school" | "showcase" | "juco" | "college"
      team_type: "high_school" | "showcase" | "juco" | "college" | "travel_ball"
      user_role: "player" | "coach" | "admin"
      video_type:
        | "highlight"
        | "game"
        | "practice"
        | "skills"
        | "pitching"
        | "hitting"
        | "fielding"
        | "other"
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
      coach_type: ["college", "high_school", "juco", "showcase"],
      golf_attendance_status: [
        "attending",
        "not_attending",
        "maybe",
        "pending",
        "accepted",
        "declined",
        "tentative",
      ],
      golf_event_status: ["draft", "confirmed", "cancelled"],
      golf_event_type: [
        "practice",
        "tournament",
        "qualifier",
        "meeting",
        "travel",
        "other",
        "class",
      ],
      golf_player_status: ["active", "injured", "redshirt", "inactive"],
      golf_player_year: [
        "freshman",
        "sophomore",
        "junior",
        "senior",
        "fifth_year",
        "graduate",
      ],
      golf_qualifier_status: ["upcoming", "in_progress", "completed"],
      golf_round_status: ["in_progress", "completed", "abandoned"],
      golf_round_type: ["tournament", "qualifier", "practice", "casual"],
      golf_task_status: ["pending", "completed", "overdue"],
      golf_transportation_type: ["bus", "van", "fly", "carpool"],
      golf_urgency_level: ["low", "normal", "high", "urgent"],
      notification_type: [
        "message",
        "watchlist_add",
        "profile_view",
        "interest",
        "offer",
        "system",
      ],
      organization_type: [
        "college",
        "high_school",
        "juco",
        "showcase_org",
        "travel_ball",
      ],
      pipeline_stage: [
        "watchlist",
        "high_priority",
        "contacted",
        "campus_visit",
        "offer_extended",
        "committed",
        "uninterested",
      ],
      player_type: ["high_school", "showcase", "juco", "college"],
      team_type: ["high_school", "showcase", "juco", "college", "travel_ball"],
      user_role: ["player", "coach", "admin"],
      video_type: [
        "highlight",
        "game",
        "practice",
        "skills",
        "pitching",
        "hitting",
        "fielding",
        "other",
      ],
    },
  },
} as const
