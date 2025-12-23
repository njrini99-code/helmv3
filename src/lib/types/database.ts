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
        ]
      }
      golf_coaches: {
        Row: {
          avatar_url: string | null
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
          event_id: string
          id: string
          player_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["golf_attendance_status"] | null
        }
        Insert: {
          event_id: string
          id?: string
          player_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["golf_attendance_status"] | null
        }
        Update: {
          event_id?: string
          id?: string
          player_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["golf_attendance_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_event_attendance_event_id_fkey"
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
          course_name: string | null
          created_at: string | null
          created_by: string
          description: string | null
          end_date: string | null
          end_time: string | null
          event_type: Database["public"]["Enums"]["golf_event_type"]
          id: string
          is_mandatory: boolean | null
          location: string | null
          start_date: string
          start_time: string | null
          team_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          course_name?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_type: Database["public"]["Enums"]["golf_event_type"]
          id?: string
          is_mandatory?: boolean | null
          location?: string | null
          start_date: string
          start_time?: string | null
          team_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          course_name?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_type?: Database["public"]["Enums"]["golf_event_type"]
          id?: string
          is_mandatory?: boolean | null
          location?: string | null
          start_date?: string
          start_time?: string | null
          team_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
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
          drive_result: string | null
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
          drive_result?: string | null
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
          drive_result?: string | null
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
        Relationships: []
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
          hometown: string | null
          id: string
          last_name: string | null
          major: string | null
          onboarding_completed: boolean | null
          phone: string | null
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
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          gpa?: number | null
          graduation_year?: number | null
          handicap?: number | null
          hometown?: string | null
          id?: string
          last_name?: string | null
          major?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
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
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          gpa?: number | null
          graduation_year?: number | null
          handicap?: number | null
          hometown?: string | null
          id?: string
          last_name?: string | null
          major?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
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
          double_bogeys_plus: number | null
          driving_accuracy: number | null
          driving_distance_avg: number | null
          eagles: number | null
          fairways_hit: number | null
          fairways_total: number | null
          greens_in_regulation: number | null
          greens_total: number | null
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
          double_bogeys_plus?: number | null
          driving_accuracy?: number | null
          driving_distance_avg?: number | null
          eagles?: number | null
          fairways_hit?: number | null
          fairways_total?: number | null
          greens_in_regulation?: number | null
          greens_total?: number | null
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
          double_bogeys_plus?: number | null
          driving_accuracy?: number | null
          driving_distance_avg?: number | null
          eagles?: number | null
          fairways_hit?: number | null
          fairways_total?: number | null
          greens_in_regulation?: number | null
          greens_total?: number | null
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
          created_at: string | null
          id: string
          invite_code: string | null
          name: string
          organization_id: string | null
          season: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          invite_code?: string | null
          name: string
          organization_id?: string | null
          season?: string | null
          updated_at?: string | null
        }
        Update: {
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
        Relationships: [
          {
            foreignKeyName: "round_holes_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "golf_rounds"
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
      [_ in never]: never
    }
    Functions: {
      calculate_coach_completion: {
        Args: { p_coach_id: string }
        Returns: number
      }
      calculate_player_stats: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      calculate_profile_completion:
        | {
            Args: { p: Database["public"]["Tables"]["players"]["Row"] }
            Returns: number
          }
        | { Args: { player_id_param: string }; Returns: number }
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
      get_golf_coach_id: { Args: never; Returns: string }
      get_golf_player_id: { Args: never; Returns: string }
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
      increment_video_view: { Args: { vid_id: string }; Returns: undefined }
      is_golf_coach_of_team: { Args: { team_uuid: string }; Returns: boolean }
      is_golf_player_of_team: { Args: { team_uuid: string }; Returns: boolean }
      is_golf_team_member: { Args: { team_uuid: string }; Returns: boolean }
      is_user_on_team_staff: { Args: { team_uuid: string }; Returns: boolean }
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
    }
    Enums: {
      coach_type: "college" | "high_school" | "juco" | "showcase"
      golf_attendance_status:
        | "attending"
        | "not_attending"
        | "maybe"
        | "pending"
      golf_event_type:
        | "practice"
        | "tournament"
        | "qualifier"
        | "meeting"
        | "travel"
        | "other"
      golf_player_status: "active" | "injured" | "redshirt" | "inactive"
      golf_player_year:
        | "freshman"
        | "sophomore"
        | "junior"
        | "senior"
        | "fifth_year"
        | "graduate"
      golf_qualifier_status: "upcoming" | "in_progress" | "completed"
      golf_round_type: "tournament" | "qualifier" | "practice" | "casual"
      golf_task_status: "pending" | "completed" | "overdue"
      golf_transportation_type: "bus" | "van" | "fly" | "carpool"
      golf_urgency_level: "low" | "normal" | "high" | "urgent"
      pipeline_stage:
        | "watchlist"
        | "high_priority"
        | "contacted"
        | "campus_visit"
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
  public: {
    Enums: {
      coach_type: ["college", "high_school", "juco", "showcase"],
      golf_attendance_status: [
        "attending",
        "not_attending",
        "maybe",
        "pending",
      ],
      golf_event_type: [
        "practice",
        "tournament",
        "qualifier",
        "meeting",
        "travel",
        "other",
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
      golf_round_type: ["tournament", "qualifier", "practice", "casual"],
      golf_task_status: ["pending", "completed", "overdue"],
      golf_transportation_type: ["bus", "van", "fly", "carpool"],
      golf_urgency_level: ["low", "normal", "high", "urgent"],
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
      user_role: ["player", "coach", "admin"],
    },
  },
} as const
