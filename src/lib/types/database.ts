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
      auth_rate_limits: {
        Row: {
          blocked_until: string | null
          count: number
          key: string
          updated_at: string
          window_start: string
        }
        Insert: {
          blocked_until?: string | null
          count?: number
          key: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          blocked_until?: string | null
          count?: number
          key?: string
          updated_at?: string
          window_start?: string
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
      baseball_actions: {
        Row: {
          action_type: string
          assignee_coach_id: string | null
          assignee_player_id: string | null
          body: string | null
          completed_at: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          detail: string | null
          due_date: string | null
          event_id: string | null
          id: string
          outcome: string | null
          outcome_baseline_value: number | null
          outcome_metric: string | null
          outcome_movement: string | null
          outcome_observed_value: number | null
          outcome_recorded_at: string | null
          outcome_sample_n: number | null
          outcome_verdict: string | null
          owner_coach_id: string | null
          player_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          signal_id: string | null
          source_refs: Json
          status: string
          target_id: string | null
          target_table: string | null
          team_id: string
          title: string
          updated_at: string
          visibility: string | null
        }
        Insert: {
          action_type?: string
          assignee_coach_id?: string | null
          assignee_player_id?: string | null
          body?: string | null
          completed_at?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          due_date?: string | null
          event_id?: string | null
          id?: string
          outcome?: string | null
          outcome_baseline_value?: number | null
          outcome_metric?: string | null
          outcome_movement?: string | null
          outcome_observed_value?: number | null
          outcome_recorded_at?: string | null
          outcome_sample_n?: number | null
          outcome_verdict?: string | null
          owner_coach_id?: string | null
          player_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signal_id?: string | null
          source_refs?: Json
          status?: string
          target_id?: string | null
          target_table?: string | null
          team_id: string
          title: string
          updated_at?: string
          visibility?: string | null
        }
        Update: {
          action_type?: string
          assignee_coach_id?: string | null
          assignee_player_id?: string | null
          body?: string | null
          completed_at?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          due_date?: string | null
          event_id?: string | null
          id?: string
          outcome?: string | null
          outcome_baseline_value?: number | null
          outcome_metric?: string | null
          outcome_movement?: string | null
          outcome_observed_value?: number | null
          outcome_recorded_at?: string | null
          outcome_sample_n?: number | null
          outcome_verdict?: string | null
          owner_coach_id?: string | null
          player_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signal_id?: string | null
          source_refs?: Json
          status?: string
          target_id?: string | null
          target_table?: string | null
          team_id?: string
          title?: string
          updated_at?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_actions_assignee_coach_id_fkey"
            columns: ["assignee_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_actions_assignee_coach_id_fkey"
            columns: ["assignee_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_actions_assignee_player_id_fkey"
            columns: ["assignee_player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_actions_owner_coach_id_fkey"
            columns: ["owner_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_actions_owner_coach_id_fkey"
            columns: ["owner_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_actions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_actions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "baseball_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_actions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_ai_audit: {
        Row: {
          confidence: number | null
          cost_usd: number | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          desired_visibility: string | null
          disposition: string | null
          error_message: string | null
          generated_at: string
          generator: string | null
          guardrail_academic: boolean
          guardrail_medical: boolean
          guardrail_redacted: boolean
          id: string
          input_token_count: number | null
          latency_ms: number | null
          metadata: Json
          model: string | null
          model_id: string | null
          outcome: string | null
          outcome_at: string | null
          outcome_by: string | null
          output_hash: string | null
          output_id: string | null
          output_kind: string
          output_table: string | null
          output_token_count: number | null
          player_id: string | null
          prompt_hash: string | null
          prompt_version: string | null
          provider: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_refs: Json
          team_id: string
          updated_at: string
          visibility: string | null
          withheld_reason: string | null
        }
        Insert: {
          confidence?: number | null
          cost_usd?: number | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          desired_visibility?: string | null
          disposition?: string | null
          error_message?: string | null
          generated_at?: string
          generator?: string | null
          guardrail_academic?: boolean
          guardrail_medical?: boolean
          guardrail_redacted?: boolean
          id?: string
          input_token_count?: number | null
          latency_ms?: number | null
          metadata?: Json
          model?: string | null
          model_id?: string | null
          outcome?: string | null
          outcome_at?: string | null
          outcome_by?: string | null
          output_hash?: string | null
          output_id?: string | null
          output_kind: string
          output_table?: string | null
          output_token_count?: number | null
          player_id?: string | null
          prompt_hash?: string | null
          prompt_version?: string | null
          provider?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_refs?: Json
          team_id: string
          updated_at?: string
          visibility?: string | null
          withheld_reason?: string | null
        }
        Update: {
          confidence?: number | null
          cost_usd?: number | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          desired_visibility?: string | null
          disposition?: string | null
          error_message?: string | null
          generated_at?: string
          generator?: string | null
          guardrail_academic?: boolean
          guardrail_medical?: boolean
          guardrail_redacted?: boolean
          id?: string
          input_token_count?: number | null
          latency_ms?: number | null
          metadata?: Json
          model?: string | null
          model_id?: string | null
          outcome?: string | null
          outcome_at?: string | null
          outcome_by?: string | null
          output_hash?: string | null
          output_id?: string | null
          output_kind?: string
          output_table?: string | null
          output_token_count?: number | null
          player_id?: string | null
          prompt_hash?: string | null
          prompt_version?: string | null
          provider?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_refs?: Json
          team_id?: string
          updated_at?: string
          visibility?: string | null
          withheld_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_ai_audit_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_ai_audit_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
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
            foreignKeyName: "baseball_announcements_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
      baseball_availability_statuses: {
        Row: {
          created_at: string
          created_by_coach_id: string | null
          ends_at: string | null
          id: string
          note: string | null
          player_id: string
          reason_category: string | null
          starts_at: string
          status: string
          team_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by_coach_id?: string | null
          ends_at?: string | null
          id?: string
          note?: string | null
          player_id: string
          reason_category?: string | null
          starts_at?: string
          status?: string
          team_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by_coach_id?: string | null
          ends_at?: string | null
          id?: string
          note?: string | null
          player_id?: string
          reason_category?: string | null
          starts_at?: string
          status?: string
          team_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_availability_statuses_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_availability_statuses_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_availability_statuses_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_availability_statuses_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_baserunning_events: {
        Row: {
          created_at: string
          event_type: string | null
          from_base: string | null
          game_id: string | null
          id: string
          pa_id: string | null
          player_id: string
          reaction_time: number | null
          result: string | null
          source_refs: Json
          sprint_speed: number | null
          stolen_base_attempt: boolean
          team_id: string
          to_base: string | null
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          from_base?: string | null
          game_id?: string | null
          id?: string
          pa_id?: string | null
          player_id: string
          reaction_time?: number | null
          result?: string | null
          source_refs?: Json
          sprint_speed?: number | null
          stolen_base_attempt?: boolean
          team_id: string
          to_base?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string | null
          from_base?: string | null
          game_id?: string | null
          id?: string
          pa_id?: string | null
          player_id?: string
          reaction_time?: number | null
          result?: string | null
          source_refs?: Json
          sprint_speed?: number | null
          stolen_base_attempt?: boolean
          team_id?: string
          to_base?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_baserunning_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_baserunning_events_pa_id_fkey"
            columns: ["pa_id"]
            isOneToOne: false
            referencedRelation: "baseball_plate_appearances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_baserunning_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_baserunning_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_batted_ball_events: {
        Row: {
          batted_ball_type: string | null
          created_at: string
          exit_velocity: number | null
          field_region: string | null
          game_id: string | null
          hit_distance: number | null
          hit_result: string | null
          id: string
          launch_angle: number | null
          pa_id: string | null
          player_id: string
          source_refs: Json
          spray_angle: number | null
          superseded_at: string | null
          superseded_by_run_id: string | null
          team_id: string
          xba: number | null
          xslg: number | null
        }
        Insert: {
          batted_ball_type?: string | null
          created_at?: string
          exit_velocity?: number | null
          field_region?: string | null
          game_id?: string | null
          hit_distance?: number | null
          hit_result?: string | null
          id?: string
          launch_angle?: number | null
          pa_id?: string | null
          player_id: string
          source_refs?: Json
          spray_angle?: number | null
          superseded_at?: string | null
          superseded_by_run_id?: string | null
          team_id: string
          xba?: number | null
          xslg?: number | null
        }
        Update: {
          batted_ball_type?: string | null
          created_at?: string
          exit_velocity?: number | null
          field_region?: string | null
          game_id?: string | null
          hit_distance?: number | null
          hit_result?: string | null
          id?: string
          launch_angle?: number | null
          pa_id?: string | null
          player_id?: string
          source_refs?: Json
          spray_angle?: number | null
          superseded_at?: string | null
          superseded_by_run_id?: string | null
          team_id?: string
          xba?: number | null
          xslg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_batted_ball_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_batted_ball_events_pa_id_fkey"
            columns: ["pa_id"]
            isOneToOne: false
            referencedRelation: "baseball_plate_appearances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_batted_ball_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_batted_ball_events_superseded_by_run_id_fkey"
            columns: ["superseded_by_run_id"]
            isOneToOne: false
            referencedRelation: "baseball_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_batted_ball_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_bodyweight_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          player_id: string
          source: string
          team_id: string
          weight_lbs: number
        }
        Insert: {
          created_at?: string
          entry_date: string
          id?: string
          player_id: string
          source?: string
          team_id: string
          weight_lbs: number
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          player_id?: string
          source?: string
          team_id?: string
          weight_lbs?: number
        }
        Relationships: [
          {
            foreignKeyName: "baseball_bodyweight_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_bodyweight_entries_team_id_fkey"
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
          ci: number | null
          created_at: string | null
          cs: number
          def_position: string | null
          doubles: number
          game_id: string
          gidp: number | null
          h: number
          hbp: number
          hr: number
          ibb: number | null
          id: string
          k: number
          lob: number
          obp: number | null
          ops: number | null
          ph_ab: number | null
          ph_h: number | null
          pickoffs: number | null
          player_id: string
          pr_app: number | null
          productive_outs: number | null
          r: number
          rbi: number
          roe: number | null
          runners_advanced: number | null
          sac: number
          sb: number
          sf: number
          slg: number | null
          team_id: string
          triples: number
          two_out_rbi: number | null
        }
        Insert: {
          ab?: number
          avg?: number | null
          batting_order?: number | null
          bb?: number
          ci?: number | null
          created_at?: string | null
          cs?: number
          def_position?: string | null
          doubles?: number
          game_id: string
          gidp?: number | null
          h?: number
          hbp?: number
          hr?: number
          ibb?: number | null
          id?: string
          k?: number
          lob?: number
          obp?: number | null
          ops?: number | null
          ph_ab?: number | null
          ph_h?: number | null
          pickoffs?: number | null
          player_id: string
          pr_app?: number | null
          productive_outs?: number | null
          r?: number
          rbi?: number
          roe?: number | null
          runners_advanced?: number | null
          sac?: number
          sb?: number
          sf?: number
          slg?: number | null
          team_id: string
          triples?: number
          two_out_rbi?: number | null
        }
        Update: {
          ab?: number
          avg?: number | null
          batting_order?: number | null
          bb?: number
          ci?: number | null
          created_at?: string | null
          cs?: number
          def_position?: string | null
          doubles?: number
          game_id?: string
          gidp?: number | null
          h?: number
          hbp?: number
          hr?: number
          ibb?: number | null
          id?: string
          k?: number
          lob?: number
          obp?: number | null
          ops?: number | null
          ph_ab?: number | null
          ph_h?: number | null
          pickoffs?: number | null
          player_id?: string
          pr_app?: number | null
          productive_outs?: number | null
          r?: number
          rbi?: number
          roe?: number | null
          runners_advanced?: number | null
          sac?: number
          sb?: number
          sf?: number
          slg?: number | null
          team_id?: string
          triples?: number
          two_out_rbi?: number | null
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
          balk: number | null
          bb: number
          bb9: number | null
          bf: number | null
          blown_saves: number | null
          complete_game: boolean | null
          created_at: string | null
          doubles_allowed: number | null
          er: number
          era: number | null
          first_pitch_strikes: number | null
          game_id: string
          gf: number | null
          gs: number | null
          h: number
          hbp: number | null
          holds: number | null
          hr: number
          ibb: number | null
          id: string
          inherited_runners: number | null
          inherited_runners_scored: number | null
          ip: number
          k: number
          k9: number | null
          pitch_count: number | null
          player_id: string
          r: number
          result: string | null
          shutout: boolean | null
          strikes: number | null
          team_id: string
          triples_allowed: number | null
          whip: number | null
          wp: number | null
        }
        Insert: {
          balk?: number | null
          bb?: number
          bb9?: number | null
          bf?: number | null
          blown_saves?: number | null
          complete_game?: boolean | null
          created_at?: string | null
          doubles_allowed?: number | null
          er?: number
          era?: number | null
          first_pitch_strikes?: number | null
          game_id: string
          gf?: number | null
          gs?: number | null
          h?: number
          hbp?: number | null
          holds?: number | null
          hr?: number
          ibb?: number | null
          id?: string
          inherited_runners?: number | null
          inherited_runners_scored?: number | null
          ip?: number
          k?: number
          k9?: number | null
          pitch_count?: number | null
          player_id: string
          r?: number
          result?: string | null
          shutout?: boolean | null
          strikes?: number | null
          team_id: string
          triples_allowed?: number | null
          whip?: number | null
          wp?: number | null
        }
        Update: {
          balk?: number | null
          bb?: number
          bb9?: number | null
          bf?: number | null
          blown_saves?: number | null
          complete_game?: boolean | null
          created_at?: string | null
          doubles_allowed?: number | null
          er?: number
          era?: number | null
          first_pitch_strikes?: number | null
          game_id?: string
          gf?: number | null
          gs?: number | null
          h?: number
          hbp?: number | null
          holds?: number | null
          hr?: number
          ibb?: number | null
          id?: string
          inherited_runners?: number | null
          inherited_runners_scored?: number | null
          ip?: number
          k?: number
          k9?: number | null
          pitch_count?: number | null
          player_id?: string
          r?: number
          result?: string | null
          shutout?: boolean | null
          strikes?: number | null
          team_id?: string
          triples_allowed?: number | null
          whip?: number | null
          wp?: number | null
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
            foreignKeyName: "baseball_box_score_uploads_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
            foreignKeyName: "baseball_camps_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
      baseball_catching_events: {
        Row: {
          blocking_result: string | null
          caught_stealing: boolean
          created_at: string
          framing_result: string | null
          framing_value: number | null
          game_id: string | null
          id: string
          pitch_event_id: string | null
          player_id: string
          pop_time_seconds: number | null
          source_refs: Json
          stolen_base_attempt: boolean
          team_id: string
          throw_velocity: number | null
        }
        Insert: {
          blocking_result?: string | null
          caught_stealing?: boolean
          created_at?: string
          framing_result?: string | null
          framing_value?: number | null
          game_id?: string | null
          id?: string
          pitch_event_id?: string | null
          player_id: string
          pop_time_seconds?: number | null
          source_refs?: Json
          stolen_base_attempt?: boolean
          team_id: string
          throw_velocity?: number | null
        }
        Update: {
          blocking_result?: string | null
          caught_stealing?: boolean
          created_at?: string
          framing_result?: string | null
          framing_value?: number | null
          game_id?: string | null
          id?: string
          pitch_event_id?: string | null
          player_id?: string
          pop_time_seconds?: number | null
          source_refs?: Json
          stolen_base_attempt?: boolean
          team_id?: string
          throw_velocity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_catching_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_catching_events_pitch_event_id_fkey"
            columns: ["pitch_event_id"]
            isOneToOne: false
            referencedRelation: "baseball_pitch_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_catching_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_catching_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_class_conflicts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          class_day: string | null
          class_end: string | null
          class_id: string | null
          class_name: string | null
          class_start: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          disposition: string
          event_id: string | null
          expires_at: string | null
          game_id: string | null
          id: string
          is_mandatory: boolean | null
          obligation_end: string | null
          obligation_kind: string
          obligation_label: string | null
          obligation_start: string | null
          overlap_minutes: number | null
          player_id: string
          practice_id: string | null
          recommended_action_label: string | null
          recommended_action_type: string | null
          resolved_at: string | null
          severity: string
          signal_id: string | null
          source_refs: Json
          team_id: string
          updated_at: string
          visibility: string
          why_it_matters: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          class_day?: string | null
          class_end?: string | null
          class_id?: string | null
          class_name?: string | null
          class_start?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          disposition?: string
          event_id?: string | null
          expires_at?: string | null
          game_id?: string | null
          id?: string
          is_mandatory?: boolean | null
          obligation_end?: string | null
          obligation_kind?: string
          obligation_label?: string | null
          obligation_start?: string | null
          overlap_minutes?: number | null
          player_id: string
          practice_id?: string | null
          recommended_action_label?: string | null
          recommended_action_type?: string | null
          resolved_at?: string | null
          severity?: string
          signal_id?: string | null
          source_refs?: Json
          team_id: string
          updated_at?: string
          visibility?: string
          why_it_matters?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          class_day?: string | null
          class_end?: string | null
          class_id?: string | null
          class_name?: string | null
          class_start?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          disposition?: string
          event_id?: string | null
          expires_at?: string | null
          game_id?: string | null
          id?: string
          is_mandatory?: boolean | null
          obligation_end?: string | null
          obligation_kind?: string
          obligation_label?: string | null
          obligation_start?: string | null
          overlap_minutes?: number | null
          player_id?: string
          practice_id?: string | null
          recommended_action_label?: string | null
          recommended_action_type?: string | null
          resolved_at?: string | null
          severity?: string
          signal_id?: string | null
          source_refs?: Json
          team_id?: string
          updated_at?: string
          visibility?: string
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_class_conflicts_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "baseball_player_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_class_conflicts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_class_conflicts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_coach_insights: {
        Row: {
          body: string | null
          coach_id: string
          confidence: number | null
          created_at: string | null
          dedupe_key: string | null
          first_detected_at: string | null
          generated_by: string | null
          id: string
          insight_type: string
          last_generated_at: string | null
          last_seen_at: string | null
          lifecycle_state: string | null
          metadata: Json | null
          observation_count: number
          player_id: string | null
          player_visible: boolean
          priority: string | null
          rank_score: number | null
          ranked_at: string | null
          resolved_at: string | null
          source_refs: Json
          status: string | null
          team_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          coach_id: string
          confidence?: number | null
          created_at?: string | null
          dedupe_key?: string | null
          first_detected_at?: string | null
          generated_by?: string | null
          id?: string
          insight_type: string
          last_generated_at?: string | null
          last_seen_at?: string | null
          lifecycle_state?: string | null
          metadata?: Json | null
          observation_count?: number
          player_id?: string | null
          player_visible?: boolean
          priority?: string | null
          rank_score?: number | null
          ranked_at?: string | null
          resolved_at?: string | null
          source_refs?: Json
          status?: string | null
          team_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          coach_id?: string
          confidence?: number | null
          created_at?: string | null
          dedupe_key?: string | null
          first_detected_at?: string | null
          generated_by?: string | null
          id?: string
          insight_type?: string
          last_generated_at?: string | null
          last_seen_at?: string | null
          lifecycle_state?: string | null
          metadata?: Json | null
          observation_count?: number
          player_id?: string | null
          player_visible?: boolean
          priority?: string | null
          rank_score?: number | null
          ranked_at?: string | null
          resolved_at?: string | null
          source_refs?: Json
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
            foreignKeyName: "baseball_coach_insights_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
      baseball_coach_notes: {
        Row: {
          archived_at: string | null
          author_coach_id: string | null
          body: string
          created_at: string
          created_by: string | null
          id: string
          pinned: boolean
          player_id: string | null
          scope: Database["public"]["Enums"]["baseball_note_scope"]
          source_refs: Json
          tags: string[] | null
          team_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          author_coach_id?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          player_id?: string | null
          scope?: Database["public"]["Enums"]["baseball_note_scope"]
          source_refs?: Json
          tags?: string[] | null
          team_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          author_coach_id?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          player_id?: string | null
          scope?: Database["public"]["Enums"]["baseball_note_scope"]
          source_refs?: Json
          tags?: string[] | null
          team_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_coach_notes_author_coach_id_fkey"
            columns: ["author_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_coach_notes_author_coach_id_fkey"
            columns: ["author_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_coach_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_coach_notes_team_id_fkey"
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
          {
            foreignKeyName: "baseball_coach_philosophy_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_coach_player_notes: {
        Row: {
          author_coach_id: string | null
          body: string
          created_at: string
          created_by: string | null
          id: string
          player_id: string
          source_action_id: string | null
          source_refs: Json
          source_signal_id: string | null
          team_id: string
          title: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          author_coach_id?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          player_id: string
          source_action_id?: string | null
          source_refs?: Json
          source_signal_id?: string | null
          team_id: string
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_coach_id?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          player_id?: string
          source_action_id?: string | null
          source_refs?: Json
          source_signal_id?: string | null
          team_id?: string
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_coach_player_notes_author_coach_id_fkey"
            columns: ["author_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_coach_player_notes_author_coach_id_fkey"
            columns: ["author_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_coach_player_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_coach_player_notes_source_action_id_fkey"
            columns: ["source_action_id"]
            isOneToOne: false
            referencedRelation: "baseball_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_coach_player_notes_source_signal_id_fkey"
            columns: ["source_signal_id"]
            isOneToOne: false
            referencedRelation: "baseball_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_coach_player_notes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
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
          {
            foreignKeyName: "baseball_coach_recruiting_philosophy_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "baseball_coaches_public"
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
      baseball_decision_log: {
        Row: {
          action_id: string | null
          created_at: string
          created_by: string | null
          decided_at: string
          decided_by: string | null
          decision_kind: string
          id: string
          meeting_item_id: string | null
          outcome_summary: string | null
          participants: string[] | null
          player_id: string | null
          rationale: string | null
          signal_id: string | null
          source_refs: Json
          tags: string[] | null
          team_id: string
          title: string
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string
          decided_by?: string | null
          decision_kind?: string
          id?: string
          meeting_item_id?: string | null
          outcome_summary?: string | null
          participants?: string[] | null
          player_id?: string | null
          rationale?: string | null
          signal_id?: string | null
          source_refs?: Json
          tags?: string[] | null
          team_id: string
          title: string
        }
        Update: {
          action_id?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string
          decided_by?: string | null
          decision_kind?: string
          id?: string
          meeting_item_id?: string | null
          outcome_summary?: string | null
          participants?: string[] | null
          player_id?: string | null
          rationale?: string | null
          signal_id?: string | null
          source_refs?: Json
          tags?: string[] | null
          team_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_decision_log_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "baseball_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_decision_log_meeting_item_id_fkey"
            columns: ["meeting_item_id"]
            isOneToOne: false
            referencedRelation: "baseball_meeting_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_decision_log_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_decision_log_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "baseball_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_decision_log_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_demo_sessions: {
        Row: {
          email: string
          entered_at: string
          id: string
          ip: string | null
          metadata: Json
          name: string
          program: string | null
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          email: string
          entered_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          name: string
          program?: string | null
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          email?: string
          entered_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          name?: string
          program?: string | null
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: []
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
            foreignKeyName: "baseball_developmental_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
      baseball_event_acknowledgements: {
        Row: {
          acknowledged_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_event_acknowledgements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "baseball_events"
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
          cancelled_at: string | null
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
          status: string | null
          team_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
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
          status?: string | null
          team_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
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
          status?: string | null
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
            foreignKeyName: "baseball_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
      baseball_exercises: {
        Row: {
          category: string | null
          created_at: string
          created_by_coach_id: string | null
          description: string | null
          id: string
          is_global: boolean
          name: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          id?: string
          is_global?: boolean
          name: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          id?: string
          is_global?: boolean
          name?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_exercises_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_exercises_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_exercises_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_fielding_events: {
        Row: {
          arm_velocity: number | null
          created_at: string
          error_type: string | null
          event_type: string | null
          exchange_time: number | null
          game_id: string | null
          id: string
          inning: number | null
          player_id: string
          pop_time: number | null
          position: string | null
          result: string | null
          source_refs: Json
          team_id: string
        }
        Insert: {
          arm_velocity?: number | null
          created_at?: string
          error_type?: string | null
          event_type?: string | null
          exchange_time?: number | null
          game_id?: string | null
          id?: string
          inning?: number | null
          player_id: string
          pop_time?: number | null
          position?: string | null
          result?: string | null
          source_refs?: Json
          team_id: string
        }
        Update: {
          arm_velocity?: number | null
          created_at?: string
          error_type?: string | null
          event_type?: string | null
          exchange_time?: number | null
          game_id?: string | null
          id?: string
          inning?: number | null
          player_id?: string
          pop_time?: number | null
          position?: string | null
          result?: string | null
          source_refs?: Json
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_fielding_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_fielding_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_fielding_events_team_id_fkey"
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
            foreignKeyName: "baseball_games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
      baseball_import_field_mappings: {
        Row: {
          created_at: string
          id: string
          source_field: string
          source_id: string | null
          target_field: string
          team_id: string
          transform_json: Json
        }
        Insert: {
          created_at?: string
          id?: string
          source_field: string
          source_id?: string | null
          target_field: string
          team_id: string
          transform_json?: Json
        }
        Update: {
          created_at?: string
          id?: string
          source_field?: string
          source_id?: string | null
          target_field?: string
          team_id?: string
          transform_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "baseball_import_field_mappings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "baseball_stat_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_import_field_mappings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_import_runs: {
        Row: {
          committed_at: string | null
          created_at: string
          created_by: string
          error_count: number
          file_bytes: number | null
          file_hash: string | null
          file_name: string | null
          file_url: string | null
          id: string
          import_type: string
          matched_rows: number
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          rolled_back_at: string | null
          source_config_id: string | null
          source_id: string
          source_label: string
          status: string
          team_id: string
          total_rows: number
          unmatched_rows: number
          valid_row_count: number
          warning_count: number
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          created_by: string
          error_count?: number
          file_bytes?: number | null
          file_hash?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          import_type?: string
          matched_rows?: number
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rolled_back_at?: string | null
          source_config_id?: string | null
          source_id: string
          source_label?: string
          status?: string
          team_id: string
          total_rows?: number
          unmatched_rows?: number
          valid_row_count?: number
          warning_count?: number
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          created_by?: string
          error_count?: number
          file_bytes?: number | null
          file_hash?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          import_type?: string
          matched_rows?: number
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rolled_back_at?: string | null
          source_config_id?: string | null
          source_id?: string
          source_label?: string
          status?: string
          team_id?: string
          total_rows?: number
          unmatched_rows?: number
          valid_row_count?: number
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "baseball_import_runs_source_config_id_fkey"
            columns: ["source_config_id"]
            isOneToOne: false
            referencedRelation: "baseball_import_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_import_runs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_import_sources: {
        Row: {
          adapter_key: string
          config_json: Json
          created_at: string
          dedupe_strictness: string
          default_visibility: string
          external_id_namespace: string | null
          id: string
          is_active: boolean
          player_match_strategy: string
          required_review: boolean
          source_name: string
          team_id: string
          trust_level: string
          updated_at: string
        }
        Insert: {
          adapter_key: string
          config_json?: Json
          created_at?: string
          dedupe_strictness?: string
          default_visibility?: string
          external_id_namespace?: string | null
          id?: string
          is_active?: boolean
          player_match_strategy?: string
          required_review?: boolean
          source_name: string
          team_id: string
          trust_level?: string
          updated_at?: string
        }
        Update: {
          adapter_key?: string
          config_json?: Json
          created_at?: string
          dedupe_strictness?: string
          default_visibility?: string
          external_id_namespace?: string | null
          id?: string
          is_active?: boolean
          player_match_strategy?: string
          required_review?: boolean
          source_name?: string
          team_id?: string
          trust_level?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_import_sources_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_integration_configs: {
        Row: {
          config_json: Json
          created_at: string
          id: string
          integration_key: string
          is_active: boolean
          last_sync_at: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          config_json?: Json
          created_at?: string
          id?: string
          integration_key: string
          is_active?: boolean
          last_sync_at?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          config_json?: Json
          created_at?: string
          id?: string
          integration_key?: string
          is_active?: boolean
          last_sync_at?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_integration_configs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_assignments: {
        Row: {
          assigned_by_coach_id: string | null
          created_at: string
          due_date: string | null
          exercise_id: string | null
          group_scope: string[] | null
          id: string
          player_id: string | null
          prescription: Json
          source_reason: string | null
          source_signal_id: string | null
          status: string
          team_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          assigned_by_coach_id?: string | null
          created_at?: string
          due_date?: string | null
          exercise_id?: string | null
          group_scope?: string[] | null
          id?: string
          player_id?: string | null
          prescription?: Json
          source_reason?: string | null
          source_signal_id?: string | null
          status?: string
          team_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          assigned_by_coach_id?: string | null
          created_at?: string
          due_date?: string | null
          exercise_id?: string | null
          group_scope?: string[] | null
          id?: string
          player_id?: string | null
          prescription?: Json
          source_reason?: string | null
          source_signal_id?: string | null
          status?: string
          team_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_assignments_assigned_by_coach_id_fkey"
            columns: ["assigned_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_assignments_assigned_by_coach_id_fkey"
            columns: ["assigned_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_assignments_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "baseball_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_days: {
        Row: {
          baseball_context: string | null
          created_at: string
          day_number: number
          day_type: string
          estimated_minutes: number | null
          id: string
          name: string | null
          week_id: string
        }
        Insert: {
          baseball_context?: string | null
          created_at?: string
          day_number: number
          day_type?: string
          estimated_minutes?: number | null
          id?: string
          name?: string | null
          week_id: string
        }
        Update: {
          baseball_context?: string | null
          created_at?: string
          day_number?: number
          day_type?: string
          estimated_minutes?: number | null
          id?: string
          name?: string | null
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_days_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_exercise_substitutions: {
        Row: {
          created_at: string
          created_by_coach_id: string | null
          exercise_id: string
          id: string
          reason: string | null
          substitute_exercise_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          created_by_coach_id?: string | null
          exercise_id: string
          id?: string
          reason?: string | null
          substitute_exercise_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          created_by_coach_id?: string | null
          exercise_id?: string
          id?: string
          reason?: string | null
          substitute_exercise_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_exercise_substitution_substitute_exercise_id_fkey"
            columns: ["substitute_exercise_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_exercise_substitutions_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_exercise_substitutions_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_exercise_substitutions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_exercise_substitutions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_exercises: {
        Row: {
          baseball_constraints: Json
          baseball_tags: string[]
          body_region: string | null
          category: string
          coaching_cues: string[]
          contraindication_notes: string | null
          created_at: string
          created_by_coach_id: string | null
          default_unit: string
          equipment: string | null
          id: string
          instructions: string | null
          is_active: boolean
          is_global: boolean
          name: string
          primary_pattern: string | null
          team_id: string | null
          track_distance: boolean
          track_load: boolean
          track_reps: boolean
          track_rpe: boolean
          track_sets: boolean
          track_time: boolean
          track_velocity: boolean
          unilateral: boolean
          updated_at: string
          video_url: string | null
        }
        Insert: {
          baseball_constraints?: Json
          baseball_tags?: string[]
          body_region?: string | null
          category?: string
          coaching_cues?: string[]
          contraindication_notes?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          default_unit?: string
          equipment?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          is_global?: boolean
          name: string
          primary_pattern?: string | null
          team_id?: string | null
          track_distance?: boolean
          track_load?: boolean
          track_reps?: boolean
          track_rpe?: boolean
          track_sets?: boolean
          track_time?: boolean
          track_velocity?: boolean
          unilateral?: boolean
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          baseball_constraints?: Json
          baseball_tags?: string[]
          body_region?: string | null
          category?: string
          coaching_cues?: string[]
          contraindication_notes?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          default_unit?: string
          equipment?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          is_global?: boolean
          name?: string
          primary_pattern?: string | null
          team_id?: string | null
          track_distance?: boolean
          track_load?: boolean
          track_reps?: boolean
          track_rpe?: boolean
          track_sets?: boolean
          track_time?: boolean
          track_velocity?: boolean
          unilateral?: boolean
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_exercises_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_exercises_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_exercises_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_import_rows: {
        Row: {
          created_at: string
          id: string
          import_run_id: string
          match_status: string
          matched_player_id: string | null
          raw_json: Json
          row_number: number
          team_id: string
          validation_error: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          import_run_id: string
          match_status?: string
          matched_player_id?: string | null
          raw_json?: Json
          row_number: number
          team_id: string
          validation_error?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          import_run_id?: string
          match_status?: string
          matched_player_id?: string | null
          raw_json?: Json
          row_number?: number
          team_id?: string
          validation_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_import_rows_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_import_rows_matched_player_id_fkey"
            columns: ["matched_player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_import_rows_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_import_runs: {
        Row: {
          committed_at: string | null
          created_at: string
          created_by_coach_id: string | null
          file_hash: string | null
          file_name: string | null
          id: string
          import_kind: string
          mapping_json: Json
          matched_rows: number
          rolled_back_at: string | null
          source: string
          source_confidence: string
          status: string
          team_id: string
          total_rows: number
          units_json: Json
          unmatched_rows: number
          updated_at: string
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          file_hash?: string | null
          file_name?: string | null
          id?: string
          import_kind?: string
          mapping_json?: Json
          matched_rows?: number
          rolled_back_at?: string | null
          source?: string
          source_confidence?: string
          status?: string
          team_id: string
          total_rows?: number
          units_json?: Json
          unmatched_rows?: number
          updated_at?: string
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          file_hash?: string | null
          file_name?: string | null
          id?: string
          import_kind?: string
          mapping_json?: Json
          matched_rows?: number
          rolled_back_at?: string | null
          source?: string
          source_confidence?: string
          status?: string
          team_id?: string
          total_rows?: number
          units_json?: Json
          unmatched_rows?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_import_runs_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_import_runs_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_import_runs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_prescriptions: {
        Row: {
          coaching_note: string | null
          created_at: string
          exercise_id: string | null
          id: string
          load_unit: string | null
          load_value: number | null
          order_index: number
          percent_1rm: number | null
          prescription_type: string
          reps: number | null
          rest_seconds: number | null
          section_id: string
          sets: number | null
          substitution_group_id: string | null
          target_rir: number | null
          target_rpe: number | null
          target_velocity_max: number | null
          target_velocity_min: number | null
          tempo: string | null
        }
        Insert: {
          coaching_note?: string | null
          created_at?: string
          exercise_id?: string | null
          id?: string
          load_unit?: string | null
          load_value?: number | null
          order_index?: number
          percent_1rm?: number | null
          prescription_type?: string
          reps?: number | null
          rest_seconds?: number | null
          section_id: string
          sets?: number | null
          substitution_group_id?: string | null
          target_rir?: number | null
          target_rpe?: number | null
          target_velocity_max?: number | null
          target_velocity_min?: number | null
          tempo?: string | null
        }
        Update: {
          coaching_note?: string | null
          created_at?: string
          exercise_id?: string | null
          id?: string
          load_unit?: string | null
          load_value?: number | null
          order_index?: number
          percent_1rm?: number | null
          prescription_type?: string
          reps?: number | null
          rest_seconds?: number | null
          section_id?: string
          sets?: number | null
          substitution_group_id?: string | null
          target_rir?: number | null
          target_rpe?: number | null
          target_velocity_max?: number | null
          target_velocity_min?: number | null
          tempo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_prescriptions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_prescriptions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_prescriptions_substitution_group_id_fkey"
            columns: ["substitution_group_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_exercise_substitutions"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_program_assignments: {
        Row: {
          assigned_by_coach_id: string | null
          assignment_type: string
          created_at: string
          event_id: string | null
          group_id: string | null
          id: string
          lift_day_id: string
          player_id: string | null
          player_visible_at: string | null
          program_id: string
          scheduled_date: string
          scheduled_end: string | null
          scheduled_start: string | null
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          assigned_by_coach_id?: string | null
          assignment_type?: string
          created_at?: string
          event_id?: string | null
          group_id?: string | null
          id?: string
          lift_day_id: string
          player_id?: string | null
          player_visible_at?: string | null
          program_id: string
          scheduled_date: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          assigned_by_coach_id?: string | null
          assignment_type?: string
          created_at?: string
          event_id?: string | null
          group_id?: string | null
          id?: string
          lift_day_id?: string
          player_id?: string | null
          player_visible_at?: string | null
          program_id?: string
          scheduled_date?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_program_assignments_assigned_by_coach_id_fkey"
            columns: ["assigned_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_program_assignments_assigned_by_coach_id_fkey"
            columns: ["assigned_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_program_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "baseball_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_program_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "baseball_strength_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_program_assignments_lift_day_id_fkey"
            columns: ["lift_day_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_program_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_program_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_program_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_programs: {
        Row: {
          created_at: string
          created_by_coach_id: string | null
          description: string | null
          end_date: string | null
          goal: string
          id: string
          is_template: boolean
          name: string
          phase: string
          start_date: string | null
          status: string
          team_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          end_date?: string | null
          goal?: string
          id?: string
          is_template?: boolean
          name: string
          phase?: string
          start_date?: string | null
          status?: string
          team_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          end_date?: string | null
          goal?: string
          id?: string
          is_template?: boolean
          name?: string
          phase?: string
          start_date?: string | null
          status?: string
          team_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_programs_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_programs_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_programs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_results: {
        Row: {
          assignment_id: string | null
          created_at: string
          exercise_id: string | null
          id: string
          import_run_id: string | null
          notes: string | null
          performed_at: string
          player_id: string
          reps: number | null
          rpe: number | null
          sets: number | null
          source: string
          team_id: string
          weight: number | null
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          exercise_id?: string | null
          id?: string
          import_run_id?: string | null
          notes?: string | null
          performed_at?: string
          player_id: string
          reps?: number | null
          rpe?: number | null
          sets?: number | null
          source?: string
          team_id: string
          weight?: number | null
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          exercise_id?: string | null
          id?: string
          import_run_id?: string | null
          notes?: string | null
          performed_at?: string
          player_id?: string
          reps?: number | null
          rpe?: number | null
          sets?: number | null
          source?: string
          team_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_results_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_results_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "baseball_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_results_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "baseball_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_results_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_sections: {
        Row: {
          created_at: string
          id: string
          instructions: string | null
          lift_day_id: string
          name: string
          section_order: number
          section_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string | null
          lift_day_id: string
          name: string
          section_order?: number
          section_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string | null
          lift_day_id?: string
          name?: string
          section_order?: number
          section_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_sections_lift_day_id_fkey"
            columns: ["lift_day_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_days"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_session_exercises: {
        Row: {
          created_at: string
          exercise_id: string | null
          exercise_name_snapshot: string
          id: string
          modification_reason: string | null
          modified_by_coach_id: string | null
          order_index: number
          prescribed_load: number | null
          prescribed_load_unit: string | null
          prescribed_reps: number | null
          prescribed_rpe: number | null
          prescribed_sets: number | null
          prescription_id: string | null
          section_name_snapshot: string | null
          section_type_snapshot: string | null
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exercise_id?: string | null
          exercise_name_snapshot: string
          id?: string
          modification_reason?: string | null
          modified_by_coach_id?: string | null
          order_index?: number
          prescribed_load?: number | null
          prescribed_load_unit?: string | null
          prescribed_reps?: number | null
          prescribed_rpe?: number | null
          prescribed_sets?: number | null
          prescription_id?: string | null
          section_name_snapshot?: string | null
          section_type_snapshot?: string | null
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exercise_id?: string | null
          exercise_name_snapshot?: string
          id?: string
          modification_reason?: string | null
          modified_by_coach_id?: string | null
          order_index?: number
          prescribed_load?: number | null
          prescribed_load_unit?: string | null
          prescribed_reps?: number | null
          prescribed_rpe?: number | null
          prescribed_sets?: number | null
          prescription_id?: string | null
          section_name_snapshot?: string | null
          section_type_snapshot?: string | null
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_session_exercises_modified_by_coach_id_fkey"
            columns: ["modified_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_session_exercises_modified_by_coach_id_fkey"
            columns: ["modified_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_session_exercises_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_session_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_sessions: {
        Row: {
          baseball_context: string | null
          coach_note: string | null
          coach_review_status: string
          completed_at: string | null
          created_at: string
          day_type: string | null
          estimated_minutes: number | null
          event_id: string | null
          id: string
          player_id: string
          player_note: string | null
          program_assignment_id: string | null
          readiness_checkin_id: string | null
          scheduled_date: string
          started_at: string | null
          status: string
          team_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          baseball_context?: string | null
          coach_note?: string | null
          coach_review_status?: string
          completed_at?: string | null
          created_at?: string
          day_type?: string | null
          estimated_minutes?: number | null
          event_id?: string | null
          id?: string
          player_id: string
          player_note?: string | null
          program_assignment_id?: string | null
          readiness_checkin_id?: string | null
          scheduled_date: string
          started_at?: string | null
          status?: string
          team_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          baseball_context?: string | null
          coach_note?: string | null
          coach_review_status?: string
          completed_at?: string | null
          created_at?: string
          day_type?: string | null
          estimated_minutes?: number | null
          event_id?: string | null
          id?: string
          player_id?: string
          player_note?: string | null
          program_assignment_id?: string | null
          readiness_checkin_id?: string | null
          scheduled_date?: string
          started_at?: string | null
          status?: string
          team_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "baseball_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_sessions_program_assignment_id_fkey"
            columns: ["program_assignment_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_program_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_sessions_readiness_checkin_id_fkey"
            columns: ["readiness_checkin_id"]
            isOneToOne: false
            referencedRelation: "baseball_readiness_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_sessions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_set_results: {
        Row: {
          actual_load: number | null
          actual_reps: number | null
          coach_observed: boolean
          completed_at: string | null
          created_at: string
          id: string
          load_unit: string | null
          player_id: string
          player_note: string | null
          prescribed_load: number | null
          prescribed_reps: number | null
          rir: number | null
          rpe: number | null
          session_exercise_id: string
          set_number: number
          team_id: string
          velocity: number | null
        }
        Insert: {
          actual_load?: number | null
          actual_reps?: number | null
          coach_observed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          load_unit?: string | null
          player_id: string
          player_note?: string | null
          prescribed_load?: number | null
          prescribed_reps?: number | null
          rir?: number | null
          rpe?: number | null
          session_exercise_id: string
          set_number: number
          team_id: string
          velocity?: number | null
        }
        Update: {
          actual_load?: number | null
          actual_reps?: number | null
          coach_observed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          load_unit?: string | null
          player_id?: string
          player_note?: string | null
          prescribed_load?: number | null
          prescribed_reps?: number | null
          rir?: number | null
          rpe?: number | null
          session_exercise_id?: string
          set_number?: number
          team_id?: string
          velocity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_set_results_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_set_results_session_exercise_id_fkey"
            columns: ["session_exercise_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_session_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_lift_set_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_lift_weeks: {
        Row: {
          created_at: string
          deload: boolean
          id: string
          name: string | null
          program_id: string
          theme: string | null
          week_number: number
        }
        Insert: {
          created_at?: string
          deload?: boolean
          id?: string
          name?: string | null
          program_id: string
          theme?: string | null
          week_number: number
        }
        Update: {
          created_at?: string
          deload?: boolean
          id?: string
          name?: string | null
          program_id?: string
          theme?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "baseball_lift_weeks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_programs"
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
      baseball_meeting_items: {
        Row: {
          created_at: string
          created_by: string | null
          detail: string | null
          discussed_at: string | null
          discussed_by: string | null
          id: string
          owner_coach_id: string | null
          player_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_action_id: string | null
          source_refs: Json
          source_signal_id: string | null
          status: string
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          discussed_at?: string | null
          discussed_by?: string | null
          id?: string
          owner_coach_id?: string | null
          player_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_action_id?: string | null
          source_refs?: Json
          source_signal_id?: string | null
          status?: string
          team_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          discussed_at?: string | null
          discussed_by?: string | null
          id?: string
          owner_coach_id?: string | null
          player_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_action_id?: string | null
          source_refs?: Json
          source_signal_id?: string | null
          status?: string
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_meeting_items_owner_coach_id_fkey"
            columns: ["owner_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_meeting_items_owner_coach_id_fkey"
            columns: ["owner_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_meeting_items_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_meeting_items_source_action_id_fkey"
            columns: ["source_action_id"]
            isOneToOne: false
            referencedRelation: "baseball_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_meeting_items_source_signal_id_fkey"
            columns: ["source_signal_id"]
            isOneToOne: false
            referencedRelation: "baseball_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_meeting_items_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
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
      baseball_pitch_events: {
        Row: {
          called_strike: boolean
          created_at: string
          foul: boolean
          game_id: string | null
          id: string
          in_play: boolean
          location_x: number | null
          location_y: number | null
          pa_id: string | null
          pitch_number: number | null
          pitch_type: string | null
          player_id: string
          result: string | null
          source_refs: Json
          source_trust_level: string | null
          spin_rate: number | null
          superseded_at: string | null
          superseded_by_run_id: string | null
          swinging_strike: boolean
          team_id: string
          velocity: number | null
        }
        Insert: {
          called_strike?: boolean
          created_at?: string
          foul?: boolean
          game_id?: string | null
          id?: string
          in_play?: boolean
          location_x?: number | null
          location_y?: number | null
          pa_id?: string | null
          pitch_number?: number | null
          pitch_type?: string | null
          player_id: string
          result?: string | null
          source_refs?: Json
          source_trust_level?: string | null
          spin_rate?: number | null
          superseded_at?: string | null
          superseded_by_run_id?: string | null
          swinging_strike?: boolean
          team_id: string
          velocity?: number | null
        }
        Update: {
          called_strike?: boolean
          created_at?: string
          foul?: boolean
          game_id?: string | null
          id?: string
          in_play?: boolean
          location_x?: number | null
          location_y?: number | null
          pa_id?: string | null
          pitch_number?: number | null
          pitch_type?: string | null
          player_id?: string
          result?: string | null
          source_refs?: Json
          source_trust_level?: string | null
          spin_rate?: number | null
          superseded_at?: string | null
          superseded_by_run_id?: string | null
          swinging_strike?: boolean
          team_id?: string
          velocity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_pitch_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_pitch_events_pa_id_fkey"
            columns: ["pa_id"]
            isOneToOne: false
            referencedRelation: "baseball_plate_appearances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_pitch_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_pitch_events_superseded_by_run_id_fkey"
            columns: ["superseded_by_run_id"]
            isOneToOne: false
            referencedRelation: "baseball_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_pitch_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_plate_appearances: {
        Row: {
          created_at: string
          game_id: string | null
          id: string
          import_run_id: string | null
          inning: number | null
          inning_half: string | null
          men_on_base: number
          outs_before: number
          pa_number: number | null
          pitcher_id: string | null
          player_id: string
          rbi: number
          result: string | null
          runs_scored: number
          source_refs: Json
          source_trust_level: string | null
          source_visibility: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          game_id?: string | null
          id?: string
          import_run_id?: string | null
          inning?: number | null
          inning_half?: string | null
          men_on_base?: number
          outs_before?: number
          pa_number?: number | null
          pitcher_id?: string | null
          player_id: string
          rbi?: number
          result?: string | null
          runs_scored?: number
          source_refs?: Json
          source_trust_level?: string | null
          source_visibility?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          game_id?: string | null
          id?: string
          import_run_id?: string | null
          inning?: number | null
          inning_half?: string | null
          men_on_base?: number
          outs_before?: number
          pa_number?: number | null
          pitcher_id?: string | null
          player_id?: string
          rbi?: number
          result?: string | null
          runs_scored?: number
          source_refs?: Json
          source_trust_level?: string | null
          source_visibility?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_plate_appearances_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_plate_appearances_pitcher_id_fkey"
            columns: ["pitcher_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_plate_appearances_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_plate_appearances_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
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
          {
            foreignKeyName: "baseball_player_comparisons_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_player_daily_contracts: {
        Row: {
          coach_acknowledged_at: string | null
          coach_acknowledged_by: string | null
          committed_at: string | null
          completed_at: string | null
          contract_date: string
          created_at: string
          id: string
          items: Json
          missed_at: string | null
          player_id: string
          reflection: string | null
          status: string
          team_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          coach_acknowledged_at?: string | null
          coach_acknowledged_by?: string | null
          committed_at?: string | null
          completed_at?: string | null
          contract_date?: string
          created_at?: string
          id?: string
          items?: Json
          missed_at?: string | null
          player_id: string
          reflection?: string | null
          status?: string
          team_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          coach_acknowledged_at?: string | null
          coach_acknowledged_by?: string | null
          committed_at?: string | null
          completed_at?: string | null
          contract_date?: string
          created_at?: string
          id?: string
          items?: Json
          missed_at?: string | null
          player_id?: string
          reflection?: string | null
          status?: string
          team_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_daily_contracts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_daily_contracts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_player_development_metrics: {
        Row: {
          created_at: string
          id: string
          measured_at: string | null
          metric_context: Json
          metric_key: string
          metric_value: number
          player_id: string
          source_refs: Json
          team_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          measured_at?: string | null
          metric_context?: Json
          metric_key: string
          metric_value: number
          player_id: string
          source_refs?: Json
          team_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          measured_at?: string | null
          metric_context?: Json
          metric_key?: string
          metric_value?: number
          player_id?: string
          source_refs?: Json
          team_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_development_metrics_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_development_metrics_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
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
            foreignKeyName: "baseball_player_engagement_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
      baseball_player_external_ids: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          external_id: string
          id: string
          player_id: string
          source_display_name: string | null
          source_id: string
          team_id: string
          updated_at: string | null
          verified: boolean
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          external_id: string
          id?: string
          player_id: string
          source_display_name?: string | null
          source_id: string
          team_id: string
          updated_at?: string | null
          verified?: boolean
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          external_id?: string
          id?: string
          player_id?: string
          source_display_name?: string | null
          source_id?: string
          team_id?: string
          updated_at?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_external_ids_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_external_ids_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_player_passport_settings: {
        Row: {
          created_at: string
          field_visibility: Json
          headline: string | null
          id: string
          player_id: string
          team_id: string
          updated_at: string
          updated_by: string | null
          visibility_state: string
        }
        Insert: {
          created_at?: string
          field_visibility?: Json
          headline?: string | null
          id?: string
          player_id: string
          team_id: string
          updated_at?: string
          updated_by?: string | null
          visibility_state?: string
        }
        Update: {
          created_at?: string
          field_visibility?: Json
          headline?: string | null
          id?: string
          player_id?: string
          team_id?: string
          updated_at?: string
          updated_by?: string | null
          visibility_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_passport_settings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_passport_settings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_player_passport_share_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string | null
          last_viewed_at: string | null
          max_views: number | null
          packet_kind: string
          player_id: string
          revoked_at: string | null
          section_allowlist: string[] | null
          team_id: string
          token: string
          updated_at: string
          view_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          last_viewed_at?: string | null
          max_views?: number | null
          packet_kind?: string
          player_id: string
          revoked_at?: string | null
          section_allowlist?: string[] | null
          team_id: string
          token?: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          last_viewed_at?: string | null
          max_views?: number | null
          packet_kind?: string
          player_id?: string
          revoked_at?: string | null
          section_allowlist?: string[] | null
          team_id?: string
          token?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_passport_share_tokens_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_passport_share_tokens_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
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
          bf: number | null
          blown_saves: number | null
          cs: number
          doubles: number
          er: number
          era: number | null
          g: number
          g_p: number
          gf: number | null
          gidp: number | null
          gs: number
          h: number
          h_allowed: number
          hbp: number
          holds: number | null
          hr: number
          hr_allowed: number
          ibb: number | null
          id: string
          ip: number
          k: number
          k_thrown: number
          k9: number | null
          l: number
          last_updated: string | null
          lob: number | null
          obp: number | null
          ops: number | null
          p_hbp: number | null
          player_id: string
          r: number
          r_allowed: number
          rbi: number
          roe: number | null
          sac: number
          sb: number
          season_year: number
          sf: number
          slg: number | null
          sv: number
          team_id: string
          triples: number
          two_out_rbi: number | null
          w: number
          whip: number | null
          wp: number | null
        }
        Insert: {
          ab?: number
          avg?: number | null
          bb?: number
          bb_allowed?: number
          bb9?: number | null
          bf?: number | null
          blown_saves?: number | null
          cs?: number
          doubles?: number
          er?: number
          era?: number | null
          g?: number
          g_p?: number
          gf?: number | null
          gidp?: number | null
          gs?: number
          h?: number
          h_allowed?: number
          hbp?: number
          holds?: number | null
          hr?: number
          hr_allowed?: number
          ibb?: number | null
          id?: string
          ip?: number
          k?: number
          k_thrown?: number
          k9?: number | null
          l?: number
          last_updated?: string | null
          lob?: number | null
          obp?: number | null
          ops?: number | null
          p_hbp?: number | null
          player_id: string
          r?: number
          r_allowed?: number
          rbi?: number
          roe?: number | null
          sac?: number
          sb?: number
          season_year?: number
          sf?: number
          slg?: number | null
          sv?: number
          team_id: string
          triples?: number
          two_out_rbi?: number | null
          w?: number
          whip?: number | null
          wp?: number | null
        }
        Update: {
          ab?: number
          avg?: number | null
          bb?: number
          bb_allowed?: number
          bb9?: number | null
          bf?: number | null
          blown_saves?: number | null
          cs?: number
          doubles?: number
          er?: number
          era?: number | null
          g?: number
          g_p?: number
          gf?: number | null
          gidp?: number | null
          gs?: number
          h?: number
          h_allowed?: number
          hbp?: number
          holds?: number | null
          hr?: number
          hr_allowed?: number
          ibb?: number | null
          id?: string
          ip?: number
          k?: number
          k_thrown?: number
          k9?: number | null
          l?: number
          last_updated?: string | null
          lob?: number | null
          obp?: number | null
          ops?: number | null
          p_hbp?: number | null
          player_id?: string
          r?: number
          r_allowed?: number
          rbi?: number
          roe?: number | null
          sac?: number
          sb?: number
          season_year?: number
          sf?: number
          slg?: number | null
          sv?: number
          team_id?: string
          triples?: number
          two_out_rbi?: number | null
          w?: number
          whip?: number | null
          wp?: number | null
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
          import_run_id: string | null
          innings_pitched: number | null
          notes: string | null
          pitch_velocity: number | null
          player_id: string
          putouts: number | null
          rbis: number | null
          session_date: string
          session_name: string | null
          source: string | null
          source_external_id: string | null
          source_match_confidence: number | null
          source_match_tier: string | null
          source_trust_level: string | null
          source_visibility: string
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
          import_run_id?: string | null
          innings_pitched?: number | null
          notes?: string | null
          pitch_velocity?: number | null
          player_id: string
          putouts?: number | null
          rbis?: number | null
          session_date: string
          session_name?: string | null
          source?: string | null
          source_external_id?: string | null
          source_match_confidence?: number | null
          source_match_tier?: string | null
          source_trust_level?: string | null
          source_visibility?: string
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
          import_run_id?: string | null
          innings_pitched?: number | null
          notes?: string | null
          pitch_velocity?: number | null
          player_id?: string
          putouts?: number | null
          rbis?: number | null
          session_date?: string
          session_name?: string | null
          source?: string | null
          source_external_id?: string | null
          source_match_confidence?: number | null
          source_match_tier?: string | null
          source_trust_level?: string | null
          source_visibility?: string
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
            foreignKeyName: "baseball_player_stats_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_stats_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "baseball_import_runs"
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
      baseball_player_timeline_events: {
        Row: {
          body: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          occurred_at: string
          player_id: string
          source_id: string | null
          source_type: string | null
          team_id: string
          title: string
          visibility: string
        }
        Insert: {
          body?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          player_id: string
          source_id?: string | null
          source_type?: string | null
          team_id: string
          title: string
          visibility?: string
        }
        Update: {
          body?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          player_id?: string
          source_id?: string | null
          source_type?: string | null
          team_id?: string
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_player_timeline_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_player_timeline_events_team_id_fkey"
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
      baseball_postgame_review_items: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          item_type: string
          player_id: string | null
          review_id: string
          source_refs: Json
          team_id: string
          visibility: string
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          id?: string
          item_type?: string
          player_id?: string | null
          review_id: string
          source_refs?: Json
          team_id: string
          visibility?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          item_type?: string
          player_id?: string | null
          review_id?: string
          source_refs?: Json
          team_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_postgame_review_items_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_postgame_review_items_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "baseball_postgame_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_postgame_review_items_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_postgame_reviews: {
        Row: {
          created_at: string
          created_by_coach_id: string | null
          game_id: string
          id: string
          notes: string | null
          overall_grade: string | null
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_coach_id?: string | null
          game_id: string
          id?: string
          notes?: string | null
          overall_grade?: string | null
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_coach_id?: string | null
          game_id?: string
          id?: string
          notes?: string | null
          overall_grade?: string | null
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_postgame_reviews_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_postgame_reviews_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_postgame_reviews_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_postgame_reviews_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_practice_attendance: {
        Row: {
          created_at: string
          id: string
          player_id: string
          practice_id: string
          reason: string | null
          status: string
          team_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          practice_id: string
          reason?: string | null
          status: string
          team_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          practice_id?: string
          reason?: string | null
          status?: string
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_practice_attendance_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_attendance_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "baseball_practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_attendance_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_practice_block_objectives: {
        Row: {
          block_id: string
          created_at: string
          focus_area: string | null
          id: string
          objective: string
          order_index: number
          player_group_ids: string[] | null
          team_id: string
        }
        Insert: {
          block_id: string
          created_at?: string
          focus_area?: string | null
          id?: string
          objective: string
          order_index?: number
          player_group_ids?: string[] | null
          team_id: string
        }
        Update: {
          block_id?: string
          created_at?: string
          focus_area?: string | null
          id?: string
          objective?: string
          order_index?: number
          player_group_ids?: string[] | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_practice_block_objectives_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "baseball_practice_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_block_objectives_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_practice_blocks: {
        Row: {
          activity: string
          actual_duration_minutes: number | null
          coach_owner_id: string | null
          completion_notes: string | null
          completion_status: string
          created_at: string
          duration_min: number
          id: string
          location: string | null
          practice_id: string
          quality_grade: string | null
          reps_completed: number | null
          source_insight_id: string | null
          source_postgame_item_id: string | null
          source_reason: string | null
          source_signal_id: string | null
          start_offset_min: number
          target_group_ids: string[] | null
          team_id: string
          updated_at: string | null
          visibility: string
        }
        Insert: {
          activity: string
          actual_duration_minutes?: number | null
          coach_owner_id?: string | null
          completion_notes?: string | null
          completion_status?: string
          created_at?: string
          duration_min: number
          id?: string
          location?: string | null
          practice_id: string
          quality_grade?: string | null
          reps_completed?: number | null
          source_insight_id?: string | null
          source_postgame_item_id?: string | null
          source_reason?: string | null
          source_signal_id?: string | null
          start_offset_min: number
          target_group_ids?: string[] | null
          team_id: string
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          activity?: string
          actual_duration_minutes?: number | null
          coach_owner_id?: string | null
          completion_notes?: string | null
          completion_status?: string
          created_at?: string
          duration_min?: number
          id?: string
          location?: string | null
          practice_id?: string
          quality_grade?: string | null
          reps_completed?: number | null
          source_insight_id?: string | null
          source_postgame_item_id?: string | null
          source_reason?: string | null
          source_signal_id?: string | null
          start_offset_min?: number
          target_group_ids?: string[] | null
          team_id?: string
          updated_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_practice_blocks_coach_owner_id_fkey"
            columns: ["coach_owner_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_blocks_coach_owner_id_fkey"
            columns: ["coach_owner_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_blocks_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "baseball_practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_blocks_source_postgame_item_id_fkey"
            columns: ["source_postgame_item_id"]
            isOneToOne: false
            referencedRelation: "baseball_postgame_review_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_blocks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_practice_effectiveness_reviews: {
        Row: {
          block_id: string | null
          created_at: string
          energy_level: number | null
          focus_level: number | null
          id: string
          notes: string | null
          objective_completion_pct: number | null
          overall_grade: string | null
          practice_id: string
          reps_quality: number | null
          reviewed_at: string
          reviewed_by_coach_id: string | null
          signal_raised: boolean
          source_refs: Json
          team_id: string
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          energy_level?: number | null
          focus_level?: number | null
          id?: string
          notes?: string | null
          objective_completion_pct?: number | null
          overall_grade?: string | null
          practice_id: string
          reps_quality?: number | null
          reviewed_at?: string
          reviewed_by_coach_id?: string | null
          signal_raised?: boolean
          source_refs?: Json
          team_id: string
        }
        Update: {
          block_id?: string | null
          created_at?: string
          energy_level?: number | null
          focus_level?: number | null
          id?: string
          notes?: string | null
          objective_completion_pct?: number | null
          overall_grade?: string | null
          practice_id?: string
          reps_quality?: number | null
          reviewed_at?: string
          reviewed_by_coach_id?: string | null
          signal_raised?: boolean
          source_refs?: Json
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_practice_effectiveness_revie_reviewed_by_coach_id_fkey"
            columns: ["reviewed_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_effectiveness_revie_reviewed_by_coach_id_fkey"
            columns: ["reviewed_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_effectiveness_reviews_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "baseball_practice_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_effectiveness_reviews_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "baseball_practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_effectiveness_reviews_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_practice_lineup_slots: {
        Row: {
          batting_order: number | null
          created_at: string
          id: string
          notes: string | null
          player_id: string
          position: string | null
          scrimmage_id: string
          side: string
          team_id: string
        }
        Insert: {
          batting_order?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          player_id: string
          position?: string | null
          scrimmage_id: string
          side?: string
          team_id: string
        }
        Update: {
          batting_order?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          player_id?: string
          position?: string | null
          scrimmage_id?: string
          side?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_practice_lineup_slots_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_lineup_slots_scrimmage_id_fkey"
            columns: ["scrimmage_id"]
            isOneToOne: false
            referencedRelation: "baseball_practice_scrimmages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_lineup_slots_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_practice_scrimmages: {
        Row: {
          block_id: string | null
          blue_score: number | null
          completed_at: string | null
          created_at: string
          format: string
          id: string
          innings_planned: number | null
          innings_played: number | null
          notes: string | null
          practice_id: string
          result_note: string | null
          status: string
          team_id: string
          title: string | null
          updated_at: string
          white_score: number | null
        }
        Insert: {
          block_id?: string | null
          blue_score?: number | null
          completed_at?: string | null
          created_at?: string
          format?: string
          id?: string
          innings_planned?: number | null
          innings_played?: number | null
          notes?: string | null
          practice_id: string
          result_note?: string | null
          status?: string
          team_id: string
          title?: string | null
          updated_at?: string
          white_score?: number | null
        }
        Update: {
          block_id?: string | null
          blue_score?: number | null
          completed_at?: string | null
          created_at?: string
          format?: string
          id?: string
          innings_planned?: number | null
          innings_played?: number | null
          notes?: string | null
          practice_id?: string
          result_note?: string | null
          status?: string
          team_id?: string
          title?: string | null
          updated_at?: string
          white_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_practice_scrimmages_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "baseball_practice_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_scrimmages_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "baseball_practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practice_scrimmages_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_practices: {
        Row: {
          created_at: string
          event_id: string | null
          focus: string | null
          id: string
          is_backlog: boolean
          published_at: string | null
          status: string
          team_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          focus?: string | null
          id?: string
          is_backlog?: boolean
          published_at?: string | null
          status?: string
          team_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string | null
          focus?: string | null
          id?: string
          is_backlog?: boolean
          published_at?: string | null
          status?: string
          team_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_practices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "baseball_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_practices_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_program_settings: {
        Row: {
          ai_enabled: boolean
          ai_stale_after_days: number
          announcement_tone: string
          created_at: string
          default_task_priority: string
          id: string
          max_roster_size: number | null
          notification_defaults: Json
          player_visible_ai_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          recruiting_active: boolean
          require_coach_review: boolean
          required_document_categories: string[]
          team_id: string
          updated_at: string
        }
        Insert: {
          ai_enabled?: boolean
          ai_stale_after_days?: number
          announcement_tone?: string
          created_at?: string
          default_task_priority?: string
          id?: string
          max_roster_size?: number | null
          notification_defaults?: Json
          player_visible_ai_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          recruiting_active?: boolean
          require_coach_review?: boolean
          required_document_categories?: string[]
          team_id: string
          updated_at?: string
        }
        Update: {
          ai_enabled?: boolean
          ai_stale_after_days?: number
          announcement_tone?: string
          created_at?: string
          default_task_priority?: string
          id?: string
          max_roster_size?: number | null
          notification_defaults?: Json
          player_visible_ai_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          recruiting_active?: boolean
          require_coach_review?: boolean
          required_document_categories?: string[]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_program_settings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_readiness_checkins: {
        Row: {
          arm_status: string | null
          check_date: string
          created_at: string
          energy_level: number | null
          id: string
          illness_flag: boolean
          lift_session_id: string | null
          lower_body_status: number | null
          mood: string | null
          notes: string | null
          player_id: string
          readiness_band: string | null
          readiness_score: number | null
          sleep_hours: number | null
          soreness_level: number | null
          stress_level: number | null
          team_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          arm_status?: string | null
          check_date: string
          created_at?: string
          energy_level?: number | null
          id?: string
          illness_flag?: boolean
          lift_session_id?: string | null
          lower_body_status?: number | null
          mood?: string | null
          notes?: string | null
          player_id: string
          readiness_band?: string | null
          readiness_score?: number | null
          sleep_hours?: number | null
          soreness_level?: number | null
          stress_level?: number | null
          team_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          arm_status?: string | null
          check_date?: string
          created_at?: string
          energy_level?: number | null
          id?: string
          illness_flag?: boolean
          lift_session_id?: string | null
          lower_body_status?: number | null
          mood?: string | null
          notes?: string | null
          player_id?: string
          readiness_band?: string | null
          readiness_score?: number | null
          sleep_hours?: number | null
          soreness_level?: number | null
          stress_level?: number | null
          team_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_readiness_checkins_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_readiness_checkins_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
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
      baseball_seasons: {
        Row: {
          created_at: string
          created_by_coach_id: string | null
          end_date: string | null
          id: string
          lifting_enabled: boolean
          phase: string
          public_profiles_enabled: boolean
          recruiting_enabled: boolean
          season_name: string | null
          season_year: number
          start_date: string | null
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_coach_id?: string | null
          end_date?: string | null
          id?: string
          lifting_enabled?: boolean
          phase?: string
          public_profiles_enabled?: boolean
          recruiting_enabled?: boolean
          season_name?: string | null
          season_year: number
          start_date?: string | null
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_coach_id?: string | null
          end_date?: string | null
          id?: string
          lifting_enabled?: boolean
          phase?: string
          public_profiles_enabled?: boolean
          recruiting_enabled?: boolean
          season_name?: string | null
          season_year?: number
          start_date?: string | null
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_seasons_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_seasons_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_seasons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_settings_audit_log: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          setting_key: string
          team_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          setting_key: string
          team_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          setting_key?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_settings_audit_log_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_signals: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          body: string | null
          category: string
          confidence: number | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          disposition: string
          event_id: string | null
          evidence: string | null
          expires_at: string | null
          feedback: string | null
          generated_by: string | null
          id: string
          owner_coach_id: string | null
          player_id: string | null
          recommended_action_label: string | null
          recommended_action_type: string | null
          recommended_owner_role: string | null
          resolved_at: string | null
          sample_n: number | null
          severity: string
          signal_type: string
          source_kind: string
          source_refs: Json
          status: string
          team_id: string
          title: string
          updated_at: string
          visibility: string
          why_it_matters: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body?: string | null
          category?: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          disposition?: string
          event_id?: string | null
          evidence?: string | null
          expires_at?: string | null
          feedback?: string | null
          generated_by?: string | null
          id?: string
          owner_coach_id?: string | null
          player_id?: string | null
          recommended_action_label?: string | null
          recommended_action_type?: string | null
          recommended_owner_role?: string | null
          resolved_at?: string | null
          sample_n?: number | null
          severity?: string
          signal_type: string
          source_kind?: string
          source_refs?: Json
          status?: string
          team_id: string
          title: string
          updated_at?: string
          visibility?: string
          why_it_matters?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body?: string | null
          category?: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          disposition?: string
          event_id?: string | null
          evidence?: string | null
          expires_at?: string | null
          feedback?: string | null
          generated_by?: string | null
          id?: string
          owner_coach_id?: string | null
          player_id?: string | null
          recommended_action_label?: string | null
          recommended_action_type?: string | null
          recommended_owner_role?: string | null
          resolved_at?: string | null
          sample_n?: number | null
          severity?: string
          signal_type?: string
          source_kind?: string
          source_refs?: Json
          status?: string
          team_id?: string
          title?: string
          updated_at?: string
          visibility?: string
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_signals_owner_coach_id_fkey"
            columns: ["owner_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_signals_owner_coach_id_fkey"
            columns: ["owner_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_signals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_signals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_soreness_maps: {
        Row: {
          body_region: string
          checkin_id: string
          created_at: string
          id: string
          note: string | null
          player_id: string
          severity: number
          side: string
          team_id: string
        }
        Insert: {
          body_region: string
          checkin_id: string
          created_at?: string
          id?: string
          note?: string | null
          player_id: string
          severity?: number
          side?: string
          team_id: string
        }
        Update: {
          body_region?: string
          checkin_id?: string
          created_at?: string
          id?: string
          note?: string | null
          player_id?: string
          severity?: number
          side?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_soreness_maps_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "baseball_readiness_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_soreness_maps_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_soreness_maps_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_staff_audit_events: {
        Row: {
          actor_coach_id: string | null
          coach_id: string | null
          created_at: string
          detail: Json
          event_type: string
          id: string
          team_id: string
        }
        Insert: {
          actor_coach_id?: string | null
          coach_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          team_id: string
        }
        Update: {
          actor_coach_id?: string | null
          coach_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_staff_audit_events_actor_coach_id_fkey"
            columns: ["actor_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_staff_audit_events_actor_coach_id_fkey"
            columns: ["actor_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_staff_audit_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_staff_audit_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_staff_audit_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_staff_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          capabilities: Json
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          invited_by_coach_id: string | null
          invitee_name: string | null
          message: string | null
          role: string | null
          status: string
          team_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          capabilities?: Json
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_by_coach_id?: string | null
          invitee_name?: string | null
          message?: string | null
          role?: string | null
          status?: string
          team_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          capabilities?: Json
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_by_coach_id?: string | null
          invitee_name?: string | null
          message?: string | null
          role?: string | null
          status?: string
          team_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_staff_invitations_invited_by_coach_id_fkey"
            columns: ["invited_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_staff_invitations_invited_by_coach_id_fkey"
            columns: ["invited_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_staff_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_staff_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_staff_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_stat_facts: {
        Row: {
          created_at: string
          game_id: string | null
          id: string
          import_run_id: string | null
          period_end: string | null
          period_start: string | null
          period_type: string
          player_id: string
          source_refs: Json
          source_trust_level: string | null
          source_visibility: string | null
          stat_context: Json
          stat_key: string
          stat_value: number
          team_id: string
        }
        Insert: {
          created_at?: string
          game_id?: string | null
          id?: string
          import_run_id?: string | null
          period_end?: string | null
          period_start?: string | null
          period_type?: string
          player_id: string
          source_refs?: Json
          source_trust_level?: string | null
          source_visibility?: string | null
          stat_context?: Json
          stat_key: string
          stat_value: number
          team_id: string
        }
        Update: {
          created_at?: string
          game_id?: string | null
          id?: string
          import_run_id?: string | null
          period_end?: string | null
          period_start?: string | null
          period_type?: string
          player_id?: string
          source_refs?: Json
          source_trust_level?: string | null
          source_visibility?: string | null
          stat_context?: Json
          stat_key?: string
          stat_value?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_stat_facts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_stat_facts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_stat_facts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_stat_sources: {
        Row: {
          config_json: Json
          created_at: string
          external_id_namespace: string | null
          id: string
          is_active: boolean
          name: string
          source_type: string
          team_id: string
          trust_level: string
        }
        Insert: {
          config_json?: Json
          created_at?: string
          external_id_namespace?: string | null
          id?: string
          is_active?: boolean
          name: string
          source_type?: string
          team_id: string
          trust_level?: string
        }
        Update: {
          config_json?: Json
          created_at?: string
          external_id_namespace?: string | null
          id?: string
          is_active?: boolean
          name?: string
          source_type?: string
          team_id?: string
          trust_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_stat_sources_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
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
          import_run_id: string | null
          mapping_config: Json | null
          match_confidence: number | null
          matched_rows: number | null
          processed_count: number | null
          row_count: number | null
          session_date: string | null
          session_name: string | null
          source_id: string | null
          stat_type: string | null
          status: string | null
          team_id: string
          total_rows: number | null
          unmatched_data: Json | null
          unmatched_rows: number | null
        }
        Insert: {
          coach_id: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          file_url?: string | null
          filename: string
          id?: string
          import_run_id?: string | null
          mapping_config?: Json | null
          match_confidence?: number | null
          matched_rows?: number | null
          processed_count?: number | null
          row_count?: number | null
          session_date?: string | null
          session_name?: string | null
          source_id?: string | null
          stat_type?: string | null
          status?: string | null
          team_id: string
          total_rows?: number | null
          unmatched_data?: Json | null
          unmatched_rows?: number | null
        }
        Update: {
          coach_id?: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          file_url?: string | null
          filename?: string
          id?: string
          import_run_id?: string | null
          mapping_config?: Json | null
          match_confidence?: number | null
          matched_rows?: number | null
          processed_count?: number | null
          row_count?: number | null
          session_date?: string | null
          session_name?: string | null
          source_id?: string | null
          stat_type?: string | null
          status?: string | null
          team_id?: string
          total_rows?: number | null
          unmatched_data?: Json | null
          unmatched_rows?: number | null
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
            foreignKeyName: "baseball_stat_uploads_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
      baseball_stat_visual_views: {
        Row: {
          config_json: Json
          created_at: string
          created_by_coach_id: string | null
          id: string
          is_pinned: boolean
          is_template: boolean
          period_type: string
          player_id: string | null
          stat_keys: string[]
          team_id: string
          updated_at: string
          view_name: string
          view_type: string
          visibility: string
        }
        Insert: {
          config_json?: Json
          created_at?: string
          created_by_coach_id?: string | null
          id?: string
          is_pinned?: boolean
          is_template?: boolean
          period_type?: string
          player_id?: string | null
          stat_keys?: string[]
          team_id: string
          updated_at?: string
          view_name: string
          view_type?: string
          visibility?: string
        }
        Update: {
          config_json?: Json
          created_at?: string
          created_by_coach_id?: string | null
          id?: string
          is_pinned?: boolean
          is_template?: boolean
          period_type?: string
          player_id?: string | null
          stat_keys?: string[]
          team_id?: string
          updated_at?: string
          view_name?: string
          view_type?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_stat_visual_views_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_stat_visual_views_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_stat_visual_views_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_stat_visual_views_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_strength_group_audit: {
        Row: {
          action: string
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          group_id: string | null
          id: string
          note: string | null
          target_player_id: string | null
          team_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          group_id?: string | null
          id?: string
          note?: string | null
          target_player_id?: string | null
          team_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          group_id?: string | null
          id?: string
          note?: string | null
          target_player_id?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_strength_group_audit_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "baseball_strength_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_group_audit_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_group_audit_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_strength_group_members: {
        Row: {
          added_by_coach_id: string | null
          created_at: string
          ends_at: string | null
          group_id: string
          id: string
          player_id: string
          source: string
          starts_at: string | null
        }
        Insert: {
          added_by_coach_id?: string | null
          created_at?: string
          ends_at?: string | null
          group_id: string
          id?: string
          player_id: string
          source?: string
          starts_at?: string | null
        }
        Update: {
          added_by_coach_id?: string | null
          created_at?: string
          ends_at?: string | null
          group_id?: string
          id?: string
          player_id?: string
          source?: string
          starts_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_strength_group_members_added_by_coach_id_fkey"
            columns: ["added_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_group_members_added_by_coach_id_fkey"
            columns: ["added_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "baseball_strength_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_group_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_strength_groups: {
        Row: {
          created_at: string
          created_by_coach_id: string | null
          description: string | null
          group_type: string
          id: string
          is_active: boolean
          name: string
          rule_json: Json
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          group_type?: string
          id?: string
          is_active?: boolean
          name: string
          rule_json?: Json
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          group_type?: string
          id?: string
          is_active?: boolean
          name?: string
          rule_json?: Json
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_strength_groups_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_groups_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_strength_maxes: {
        Row: {
          confidence: number | null
          created_at: string
          exercise_id: string
          id: string
          max_type: string
          player_id: string
          source: string
          team_id: string
          test_date: string | null
          unit: string
          updated_at: string
          value: number
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          exercise_id: string
          id?: string
          max_type?: string
          player_id: string
          source?: string
          team_id: string
          test_date?: string | null
          unit?: string
          updated_at?: string
          value: number
        }
        Update: {
          confidence?: number | null
          created_at?: string
          exercise_id?: string
          id?: string
          max_type?: string
          player_id?: string
          source?: string
          team_id?: string
          test_date?: string | null
          unit?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "baseball_strength_maxes_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_maxes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_maxes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_strength_prs: {
        Row: {
          achieved_at: string
          created_at: string
          exercise_id: string
          id: string
          lift_session_id: string | null
          player_id: string
          pr_type: string
          team_id: string
          unit: string
          value: number
          verified_by_coach_id: string | null
        }
        Insert: {
          achieved_at?: string
          created_at?: string
          exercise_id: string
          id?: string
          lift_session_id?: string | null
          player_id: string
          pr_type?: string
          team_id: string
          unit?: string
          value: number
          verified_by_coach_id?: string | null
        }
        Update: {
          achieved_at?: string
          created_at?: string
          exercise_id?: string
          id?: string
          lift_session_id?: string | null
          player_id?: string
          pr_type?: string
          team_id?: string
          unit?: string
          value?: number
          verified_by_coach_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_strength_prs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_prs_lift_session_id_fkey"
            columns: ["lift_session_id"]
            isOneToOne: false
            referencedRelation: "baseball_lift_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_prs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_prs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_prs_verified_by_coach_id_fkey"
            columns: ["verified_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_strength_prs_verified_by_coach_id_fkey"
            columns: ["verified_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
            referencedColumns: ["id"]
          },
        ]
      }
      baseball_swing_events: {
        Row: {
          attack_angle: number | null
          bat_speed: number | null
          chase_swing: boolean
          contact_rate: number | null
          created_at: string
          id: string
          pa_id: string | null
          pitch_event_id: string | null
          player_id: string
          source_refs: Json
          superseded_at: string | null
          superseded_by_run_id: string | null
          team_id: string
        }
        Insert: {
          attack_angle?: number | null
          bat_speed?: number | null
          chase_swing?: boolean
          contact_rate?: number | null
          created_at?: string
          id?: string
          pa_id?: string | null
          pitch_event_id?: string | null
          player_id: string
          source_refs?: Json
          superseded_at?: string | null
          superseded_by_run_id?: string | null
          team_id: string
        }
        Update: {
          attack_angle?: number | null
          bat_speed?: number | null
          chase_swing?: boolean
          contact_rate?: number | null
          created_at?: string
          id?: string
          pa_id?: string | null
          pitch_event_id?: string | null
          player_id?: string
          source_refs?: Json
          superseded_at?: string | null
          superseded_by_run_id?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_swing_events_pa_id_fkey"
            columns: ["pa_id"]
            isOneToOne: false
            referencedRelation: "baseball_plate_appearances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_swing_events_pitch_event_id_fkey"
            columns: ["pitch_event_id"]
            isOneToOne: false
            referencedRelation: "baseball_pitch_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_swing_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_swing_events_superseded_by_run_id_fkey"
            columns: ["superseded_by_run_id"]
            isOneToOne: false
            referencedRelation: "baseball_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_swing_events_team_id_fkey"
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
            foreignKeyName: "baseball_task_templates_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
          reminder_sent: boolean
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
          reminder_sent?: boolean
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
          reminder_sent?: boolean
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
            foreignKeyName: "baseball_tasks_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
          bio: string | null
          can_export_reports: boolean
          can_invite_staff: boolean
          can_manage_calendar: boolean
          can_manage_documents: boolean
          can_manage_imports: boolean
          can_manage_lifting: boolean
          can_manage_lineups: boolean
          can_manage_practice: boolean
          can_manage_roster: boolean
          can_manage_settings: boolean
          can_manage_stats: boolean
          can_message_players: boolean
          can_message_team: boolean
          can_modify_availability: boolean
          can_view_academics: boolean
          can_view_medical: boolean
          can_view_private_notes: boolean
          can_view_readiness: boolean
          capabilities: Json
          coach_id: string
          created_at: string | null
          id: string
          is_head_coach: boolean
          is_primary: boolean | null
          phone: string | null
          role: string | null
          scope_group_ids: string[] | null
          scope_player_ids: string[] | null
          status: string
          team_id: string
          title: string | null
          visible_to_players: boolean
        }
        Insert: {
          bio?: string | null
          can_export_reports?: boolean
          can_invite_staff?: boolean
          can_manage_calendar?: boolean
          can_manage_documents?: boolean
          can_manage_imports?: boolean
          can_manage_lifting?: boolean
          can_manage_lineups?: boolean
          can_manage_practice?: boolean
          can_manage_roster?: boolean
          can_manage_settings?: boolean
          can_manage_stats?: boolean
          can_message_players?: boolean
          can_message_team?: boolean
          can_modify_availability?: boolean
          can_view_academics?: boolean
          can_view_medical?: boolean
          can_view_private_notes?: boolean
          can_view_readiness?: boolean
          capabilities?: Json
          coach_id: string
          created_at?: string | null
          id?: string
          is_head_coach?: boolean
          is_primary?: boolean | null
          phone?: string | null
          role?: string | null
          scope_group_ids?: string[] | null
          scope_player_ids?: string[] | null
          status?: string
          team_id: string
          title?: string | null
          visible_to_players?: boolean
        }
        Update: {
          bio?: string | null
          can_export_reports?: boolean
          can_invite_staff?: boolean
          can_manage_calendar?: boolean
          can_manage_documents?: boolean
          can_manage_imports?: boolean
          can_manage_lifting?: boolean
          can_manage_lineups?: boolean
          can_manage_practice?: boolean
          can_manage_roster?: boolean
          can_manage_settings?: boolean
          can_manage_stats?: boolean
          can_message_players?: boolean
          can_message_team?: boolean
          can_modify_availability?: boolean
          can_view_academics?: boolean
          can_view_medical?: boolean
          can_view_private_notes?: boolean
          can_view_readiness?: boolean
          capabilities?: Json
          coach_id?: string
          created_at?: string | null
          id?: string
          is_head_coach?: boolean
          is_primary?: boolean | null
          phone?: string | null
          role?: string | null
          scope_group_ids?: string[] | null
          scope_player_ids?: string[] | null
          status?: string
          team_id?: string
          title?: string | null
          visible_to_players?: boolean
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
            foreignKeyName: "baseball_team_coach_staff_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
            foreignKeyName: "baseball_team_invitations_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
            foreignKeyName: "baseball_team_lineups_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
            foreignKeyName: "baseball_team_members_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
          allow_player_self_join: boolean
          conference: string | null
          created_at: string | null
          created_by: string | null
          default_team_id: string | null
          description: string | null
          division: string | null
          id: string
          invite_policy: string
          join_code: string
          logo_url: string | null
          name: string
          organization_id: string | null
          player_account_policy: string
          primary_color: string | null
          public_profile_mode: string
          require_coach_approval: boolean
          season_end_date: string | null
          season_start_date: string | null
          season_year: number | null
          secondary_color: string | null
          team_type: Database["public"]["Enums"]["baseball_coach_type"]
          timezone: string
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          allow_player_self_join?: boolean
          conference?: string | null
          created_at?: string | null
          created_by?: string | null
          default_team_id?: string | null
          description?: string | null
          division?: string | null
          id?: string
          invite_policy?: string
          join_code: string
          logo_url?: string | null
          name: string
          organization_id?: string | null
          player_account_policy?: string
          primary_color?: string | null
          public_profile_mode?: string
          require_coach_approval?: boolean
          season_end_date?: string | null
          season_start_date?: string | null
          season_year?: number | null
          secondary_color?: string | null
          team_type: Database["public"]["Enums"]["baseball_coach_type"]
          timezone?: string
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          allow_player_self_join?: boolean
          conference?: string | null
          created_at?: string | null
          created_by?: string | null
          default_team_id?: string | null
          description?: string | null
          division?: string | null
          id?: string
          invite_policy?: string
          join_code?: string
          logo_url?: string | null
          name?: string
          organization_id?: string | null
          player_account_policy?: string
          primary_color?: string | null
          public_profile_mode?: string
          require_coach_approval?: boolean
          season_end_date?: string | null
          season_start_date?: string | null
          season_year?: number | null
          secondary_color?: string | null
          team_type?: Database["public"]["Enums"]["baseball_coach_type"]
          timezone?: string
          updated_at?: string | null
          website_url?: string | null
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
            foreignKeyName: "baseball_teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
      baseball_timeline_event_acks: {
        Row: {
          acked_at: string
          acked_by: string
          id: string
          note: string | null
          player_id: string
          reaction: string | null
          team_id: string
          timeline_event_id: string
        }
        Insert: {
          acked_at?: string
          acked_by: string
          id?: string
          note?: string | null
          player_id: string
          reaction?: string | null
          team_id: string
          timeline_event_id: string
        }
        Update: {
          acked_at?: string
          acked_by?: string
          id?: string
          note?: string | null
          player_id?: string
          reaction?: string | null
          team_id?: string
          timeline_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_timeline_event_acks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_timeline_event_acks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_timeline_event_acks_timeline_event_id_fkey"
            columns: ["timeline_event_id"]
            isOneToOne: false
            referencedRelation: "baseball_player_timeline_events"
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
            foreignKeyName: "baseball_travel_itineraries_created_by_id_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
      baseball_video_events: {
        Row: {
          annotation_author_id: string | null
          captured_at: string | null
          clip_title: string | null
          created_at: string
          created_by: string | null
          disposition: string | null
          duration_seconds: number | null
          frame_end: number | null
          frame_start: number | null
          game_id: string | null
          id: string
          linked_action_id: string | null
          linked_dev_plan_item_id: string | null
          linked_meeting_item_id: string | null
          linked_signal_id: string | null
          notes: string | null
          owner_coach_id: string | null
          owner_kind: string | null
          owner_player_id: string | null
          pitch_event_id: string | null
          plate_appearance_id: string | null
          player_id: string
          player_requested_feedback: boolean | null
          players_tagged: string[] | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_player_at: string | null
          source_confidence: number | null
          source_external_id: string | null
          source_label: string | null
          source_refs: Json
          source_vendor: string | null
          tags: string[]
          team_id: string
          thumbnail_url: string | null
          timestamp_end: number | null
          timestamp_start: number | null
          transcript: string | null
          updated_at: string | null
          video_type: string
          video_url: string
          visibility: string
        }
        Insert: {
          annotation_author_id?: string | null
          captured_at?: string | null
          clip_title?: string | null
          created_at?: string
          created_by?: string | null
          disposition?: string | null
          duration_seconds?: number | null
          frame_end?: number | null
          frame_start?: number | null
          game_id?: string | null
          id?: string
          linked_action_id?: string | null
          linked_dev_plan_item_id?: string | null
          linked_meeting_item_id?: string | null
          linked_signal_id?: string | null
          notes?: string | null
          owner_coach_id?: string | null
          owner_kind?: string | null
          owner_player_id?: string | null
          pitch_event_id?: string | null
          plate_appearance_id?: string | null
          player_id: string
          player_requested_feedback?: boolean | null
          players_tagged?: string[] | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_player_at?: string | null
          source_confidence?: number | null
          source_external_id?: string | null
          source_label?: string | null
          source_refs?: Json
          source_vendor?: string | null
          tags?: string[]
          team_id: string
          thumbnail_url?: string | null
          timestamp_end?: number | null
          timestamp_start?: number | null
          transcript?: string | null
          updated_at?: string | null
          video_type?: string
          video_url: string
          visibility?: string
        }
        Update: {
          annotation_author_id?: string | null
          captured_at?: string | null
          clip_title?: string | null
          created_at?: string
          created_by?: string | null
          disposition?: string | null
          duration_seconds?: number | null
          frame_end?: number | null
          frame_start?: number | null
          game_id?: string | null
          id?: string
          linked_action_id?: string | null
          linked_dev_plan_item_id?: string | null
          linked_meeting_item_id?: string | null
          linked_signal_id?: string | null
          notes?: string | null
          owner_coach_id?: string | null
          owner_kind?: string | null
          owner_player_id?: string | null
          pitch_event_id?: string | null
          plate_appearance_id?: string | null
          player_id?: string
          player_requested_feedback?: boolean | null
          players_tagged?: string[] | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_player_at?: string | null
          source_confidence?: number | null
          source_external_id?: string | null
          source_label?: string | null
          source_refs?: Json
          source_vendor?: string | null
          tags?: string[]
          team_id?: string
          thumbnail_url?: string | null
          timestamp_end?: number | null
          timestamp_start?: number | null
          transcript?: string | null
          updated_at?: string | null
          video_type?: string
          video_url?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseball_video_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_video_events_pitch_event_id_fkey"
            columns: ["pitch_event_id"]
            isOneToOne: false
            referencedRelation: "baseball_pitch_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_video_events_plate_appearance_id_fkey"
            columns: ["plate_appearance_id"]
            isOneToOne: false
            referencedRelation: "baseball_plate_appearances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_video_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_video_events_team_id_fkey"
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
            foreignKeyName: "baseball_watchlists_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "baseball_coaches_public"
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
      baseball_workload_events: {
        Row: {
          avg_velocity: number | null
          created_at: string
          event_date: string
          event_type: string
          game_id: string | null
          id: string
          innings_pitched: number | null
          max_velocity: number | null
          pitch_count: number | null
          player_id: string
          source_refs: Json
          team_id: string
          throw_count: number | null
        }
        Insert: {
          avg_velocity?: number | null
          created_at?: string
          event_date: string
          event_type?: string
          game_id?: string | null
          id?: string
          innings_pitched?: number | null
          max_velocity?: number | null
          pitch_count?: number | null
          player_id: string
          source_refs?: Json
          team_id: string
          throw_count?: number | null
        }
        Update: {
          avg_velocity?: number | null
          created_at?: string
          event_date?: string
          event_type?: string
          game_id?: string | null
          id?: string
          innings_pitched?: number | null
          max_velocity?: number | null
          pitch_count?: number | null
          player_id?: string
          source_refs?: Json
          team_id?: string
          throw_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseball_workload_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "baseball_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_workload_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "baseball_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseball_workload_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "baseball_teams"
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
      crm_automations: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          priority: number
          trigger_event: string
          updated_at: string
        }
        Insert: {
          actions: Json
          conditions?: Json
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          trigger_event: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          trigger_event?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_coaches: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          assigned_to: string | null
          athletics_url: string | null
          best_contact_method: string | null
          best_contact_time: string | null
          budget_range: string | null
          conference: string | null
          created_at: string | null
          created_by: string | null
          current_software: string | null
          decision_timeline: string | null
          division: Database["public"]["Enums"]["ncaa_division"]
          email: string | null
          email_status: Database["public"]["Enums"]["email_status"]
          highlight_color: string | null
          id: string
          internal_comments: string | null
          is_archived: boolean | null
          is_primary_contact: boolean
          is_starred: boolean | null
          last_contacted_at: string | null
          last_email_event_at: string | null
          last_email_event_type: string | null
          name: string
          next_follow_up_at: string | null
          notes: string | null
          pain_points: string[] | null
          phone: string | null
          priority: number | null
          program: Database["public"]["Enums"]["program_type"]
          role_level: string | null
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
          assigned_to?: string | null
          athletics_url?: string | null
          best_contact_method?: string | null
          best_contact_time?: string | null
          budget_range?: string | null
          conference?: string | null
          created_at?: string | null
          created_by?: string | null
          current_software?: string | null
          decision_timeline?: string | null
          division: Database["public"]["Enums"]["ncaa_division"]
          email?: string | null
          email_status?: Database["public"]["Enums"]["email_status"]
          highlight_color?: string | null
          id?: string
          internal_comments?: string | null
          is_archived?: boolean | null
          is_primary_contact?: boolean
          is_starred?: boolean | null
          last_contacted_at?: string | null
          last_email_event_at?: string | null
          last_email_event_type?: string | null
          name: string
          next_follow_up_at?: string | null
          notes?: string | null
          pain_points?: string[] | null
          phone?: string | null
          priority?: number | null
          program?: Database["public"]["Enums"]["program_type"]
          role_level?: string | null
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
          assigned_to?: string | null
          athletics_url?: string | null
          best_contact_method?: string | null
          best_contact_time?: string | null
          budget_range?: string | null
          conference?: string | null
          created_at?: string | null
          created_by?: string | null
          current_software?: string | null
          decision_timeline?: string | null
          division?: Database["public"]["Enums"]["ncaa_division"]
          email?: string | null
          email_status?: Database["public"]["Enums"]["email_status"]
          highlight_color?: string | null
          id?: string
          internal_comments?: string | null
          is_archived?: boolean | null
          is_primary_contact?: boolean
          is_starred?: boolean | null
          last_contacted_at?: string | null
          last_email_event_at?: string | null
          last_email_event_type?: string | null
          name?: string
          next_follow_up_at?: string | null
          notes?: string | null
          pain_points?: string[] | null
          phone?: string | null
          priority?: number | null
          program?: Database["public"]["Enums"]["program_type"]
          role_level?: string | null
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
          metadata: Json | null
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
          metadata?: Json | null
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
          metadata?: Json | null
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
            referencedRelation: "crm_coach_engagement"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "crm_contact_log_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "crm_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_log_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "v_crm_coaches_by_school"
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
      crm_email_suppressions: {
        Row: {
          email: string
          id: string
          metadata: Json | null
          reason: string
          source: string
          suppressed_at: string
          suppressed_by: string | null
        }
        Insert: {
          email: string
          id?: string
          metadata?: Json | null
          reason: string
          source: string
          suppressed_at?: string
          suppressed_by?: string | null
        }
        Update: {
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
          source?: string
          suppressed_at?: string
          suppressed_by?: string | null
        }
        Relationships: []
      }
      crm_email_templates: {
        Row: {
          body: string
          category: string
          created_at: string | null
          created_by: string | null
          format: string
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
          format?: string
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
          format?: string
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
            referencedRelation: "crm_coach_engagement"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "crm_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "crm_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "v_crm_coaches_by_school"
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
      crm_notes: {
        Row: {
          author_id: string
          body: string
          coach_id: string
          created_at: string
          id: string
          is_pinned: boolean
          kind: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          coach_id: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          kind?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          coach_id?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "crm_coach_engagement"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "crm_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "crm_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "v_crm_coaches_by_school"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_replies: {
        Row: {
          body_html: string | null
          body_text: string | null
          coach_id: string | null
          contact_log_id: string | null
          from_address: string
          id: string
          in_reply_to: string | null
          is_read: boolean
          message_id: string
          raw_payload: Json | null
          received_at: string
          subject: string | null
          thread_id: string | null
          to_addresses: string[]
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          coach_id?: string | null
          contact_log_id?: string | null
          from_address: string
          id?: string
          in_reply_to?: string | null
          is_read?: boolean
          message_id: string
          raw_payload?: Json | null
          received_at?: string
          subject?: string | null
          thread_id?: string | null
          to_addresses?: string[]
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          coach_id?: string | null
          contact_log_id?: string | null
          from_address?: string
          id?: string
          in_reply_to?: string | null
          is_read?: boolean
          message_id?: string
          raw_payload?: Json | null
          received_at?: string
          subject?: string | null
          thread_id?: string | null
          to_addresses?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "crm_replies_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "crm_coach_engagement"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "crm_replies_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "crm_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_replies_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "v_crm_coaches_by_school"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_replies_contact_log_id_fkey"
            columns: ["contact_log_id"]
            isOneToOne: false
            referencedRelation: "crm_contact_log"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_segments: {
        Row: {
          created_at: string
          created_by: string
          definition: Json
          description: string | null
          id: string
          is_shared: boolean
          name: string
          pin_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          definition: Json
          description?: string | null
          id?: string
          is_shared?: boolean
          name: string
          pin_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: Json
          description?: string | null
          id?: string
          is_shared?: boolean
          name?: string
          pin_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_sequence_enrollments: {
        Row: {
          coach_id: string
          completed_at: string | null
          current_step: number
          enrolled_at: string
          enrolled_by: string
          id: string
          metadata: Json | null
          next_send_at: string | null
          sequence_id: string
          status: string
          stop_reason: string | null
          stopped_at: string | null
        }
        Insert: {
          coach_id: string
          completed_at?: string | null
          current_step?: number
          enrolled_at?: string
          enrolled_by: string
          id?: string
          metadata?: Json | null
          next_send_at?: string | null
          sequence_id: string
          status?: string
          stop_reason?: string | null
          stopped_at?: string | null
        }
        Update: {
          coach_id?: string
          completed_at?: string | null
          current_step?: number
          enrolled_at?: string
          enrolled_by?: string
          id?: string
          metadata?: Json | null
          next_send_at?: string | null
          sequence_id?: string
          status?: string
          stop_reason?: string | null
          stopped_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_sequence_enrollments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "crm_coach_engagement"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "crm_sequence_enrollments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "crm_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_enrollments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "v_crm_coaches_by_school"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "crm_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sequence_steps: {
        Row: {
          body_override: string | null
          condition: Json | null
          created_at: string
          delay_hours: number
          id: string
          sequence_id: string
          step_order: number
          subject_override: string | null
          template_id: string | null
        }
        Insert: {
          body_override?: string | null
          condition?: Json | null
          created_at?: string
          delay_hours?: number
          id?: string
          sequence_id: string
          step_order: number
          subject_override?: string | null
          template_id?: string | null
        }
        Update: {
          body_override?: string | null
          condition?: Json | null
          created_at?: string
          delay_hours?: number
          id?: string
          sequence_id?: string
          step_order?: number
          subject_override?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "crm_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "crm_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sequences: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          trigger_kind: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          trigger_kind?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          trigger_kind?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_tasks: {
        Row: {
          assignee_id: string | null
          coach_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          id: string
          kind: string | null
          metadata: Json | null
          priority: string
          reminder_at: string | null
          reminder_sent: boolean
          source: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          coach_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_at?: string | null
          id?: string
          kind?: string | null
          metadata?: Json | null
          priority?: string
          reminder_at?: string | null
          reminder_sent?: boolean
          source?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          coach_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          kind?: string | null
          metadata?: Json | null
          priority?: string
          reminder_at?: string | null
          reminder_sent?: boolean
          source?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "crm_coach_engagement"
            referencedColumns: ["coach_id"]
          },
          {
            foreignKeyName: "crm_tasks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "crm_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "v_crm_coaches_by_school"
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
      email_clicks: {
        Row: {
          clicked_url: string | null
          email_event_id: string
          id: string
          inserted_at: string
          ip_address: string | null
          occurred_at: string
          recipient_email: string
          resend_message_id: string
          user_agent: string | null
        }
        Insert: {
          clicked_url?: string | null
          email_event_id: string
          id?: string
          inserted_at?: string
          ip_address?: string | null
          occurred_at: string
          recipient_email: string
          resend_message_id: string
          user_agent?: string | null
        }
        Update: {
          clicked_url?: string | null
          email_event_id?: string
          id?: string
          inserted_at?: string
          ip_address?: string | null
          occurred_at?: string
          recipient_email?: string
          resend_message_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_clicks_email_event_id_fkey"
            columns: ["email_event_id"]
            isOneToOne: false
            referencedRelation: "crm_email_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_clicks_email_event_id_fkey"
            columns: ["email_event_id"]
            isOneToOne: false
            referencedRelation: "email_events"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
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
      emails: {
        Row: {
          bounced_at: string | null
          click_count: number
          clicked_at: string | null
          complained_at: string | null
          contact_log_id: string | null
          delivered_at: string | null
          delivery_delayed_at: string | null
          first_seen_at: string
          from_address: string | null
          last_event_at: string | null
          last_event_type: string | null
          open_count: number
          opened_at: string | null
          resend_message_id: string
          sent_at: string | null
          source: string
          subject: string | null
          tags: Json | null
          to_addresses: string[]
          updated_at: string
        }
        Insert: {
          bounced_at?: string | null
          click_count?: number
          clicked_at?: string | null
          complained_at?: string | null
          contact_log_id?: string | null
          delivered_at?: string | null
          delivery_delayed_at?: string | null
          first_seen_at?: string
          from_address?: string | null
          last_event_at?: string | null
          last_event_type?: string | null
          open_count?: number
          opened_at?: string | null
          resend_message_id: string
          sent_at?: string | null
          source?: string
          subject?: string | null
          tags?: Json | null
          to_addresses?: string[]
          updated_at?: string
        }
        Update: {
          bounced_at?: string | null
          click_count?: number
          clicked_at?: string | null
          complained_at?: string | null
          contact_log_id?: string | null
          delivered_at?: string | null
          delivery_delayed_at?: string | null
          first_seen_at?: string
          from_address?: string | null
          last_event_at?: string | null
          last_event_type?: string | null
          open_count?: number
          opened_at?: string | null
          resend_message_id?: string
          sent_at?: string | null
          source?: string
          subject?: string | null
          tags?: Json | null
          to_addresses?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_contact_log_id_fkey"
            columns: ["contact_log_id"]
            isOneToOne: false
            referencedRelation: "crm_contact_log"
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
          is_active: boolean
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
          is_active?: boolean
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
          is_active?: boolean
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
          all_day: boolean | null
          coach_id: string
          created_at: string | null
          description: string | null
          end_date: string
          end_time: string | null
          id: string
          is_recurring: boolean | null
          reason: string | null
          recurrence_rule: string | null
          start_date: string
          start_time: string | null
          title: string | null
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
          is_recurring?: boolean | null
          reason?: string | null
          recurrence_rule?: string | null
          start_date: string
          start_time?: string | null
          title?: string | null
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
          is_recurring?: boolean | null
          reason?: string | null
          recurrence_rule?: string | null
          start_date?: string
          start_time?: string | null
          title?: string | null
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
          addressed_at: string | null
          archived_at: string | null
          category: string | null
          coach_id: string | null
          content: string | null
          created_at: string | null
          dismissed: boolean | null
          dismissed_at: string | null
          engine_version: string
          evidence: Json | null
          id: string
          insight_type: string
          lifecycle_state: string
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
          signature: string | null
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
          addressed_at?: string | null
          archived_at?: string | null
          category?: string | null
          coach_id?: string | null
          content?: string | null
          created_at?: string | null
          dismissed?: boolean | null
          dismissed_at?: string | null
          engine_version?: string
          evidence?: Json | null
          id?: string
          insight_type: string
          lifecycle_state?: string
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
          signature?: string | null
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
          addressed_at?: string | null
          archived_at?: string | null
          category?: string | null
          coach_id?: string | null
          content?: string | null
          created_at?: string | null
          dismissed?: boolean | null
          dismissed_at?: string | null
          engine_version?: string
          evidence?: Json | null
          id?: string
          insight_type?: string
          lifecycle_state?: string
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
          signature?: string | null
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
          email_digest_enabled: boolean
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
          email_digest_enabled?: boolean
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
          email_digest_enabled?: boolean
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
      golf_coach_player_intent: {
        Row: {
          alert_posture: string
          coach_id: string
          highlight_categories: string[]
          narrative_goal: string
          notes: string | null
          player_id: string
          updated_at: string
        }
        Insert: {
          alert_posture?: string
          coach_id: string
          highlight_categories?: string[]
          narrative_goal?: string
          notes?: string | null
          player_id: string
          updated_at?: string
        }
        Update: {
          alert_posture?: string
          coach_id?: string
          highlight_categories?: string[]
          narrative_goal?: string
          notes?: string | null
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_coach_player_intent_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_coach_player_intent_player_id_fkey"
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
      golf_coachhelm_chat_conversations: {
        Row: {
          archived_at: string | null
          coach_id: string
          created_at: string
          id: string
          pinned: boolean
          title: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          coach_id: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          coach_id?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_coachhelm_chat_conversations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_coachhelm_chat_messages: {
        Row: {
          client_turn_id: string | null
          content: string | null
          conversation_id: string
          cost_usd: number | null
          created_at: string
          id: string
          role: string
          status: string | null
          tool_calls: Json | null
          tool_results: Json | null
        }
        Insert: {
          client_turn_id?: string | null
          content?: string | null
          conversation_id: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          role: string
          status?: string | null
          tool_calls?: Json | null
          tool_results?: Json | null
        }
        Update: {
          client_turn_id?: string | null
          content?: string | null
          conversation_id?: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          role?: string
          status?: string | null
          tool_calls?: Json | null
          tool_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_coachhelm_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "golf_coachhelm_chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_coachhelm_coach_weights: {
        Row: {
          coach_id: string
          insight_type: string
          intent: string
          sample_n: number
          updated_at: string
          weight: number
        }
        Insert: {
          coach_id: string
          insight_type: string
          intent: string
          sample_n?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          coach_id?: string
          insight_type?: string
          intent?: string
          sample_n?: number
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "golf_coachhelm_coach_weights_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_coachhelm_llm_budget: {
        Row: {
          budget_usd: number
          coach_id: string
          date: string
          spent_usd: number
          task_class_usage: Json
          updated_at: string
        }
        Insert: {
          budget_usd: number
          coach_id: string
          date: string
          spent_usd?: number
          task_class_usage?: Json
          updated_at?: string
        }
        Update: {
          budget_usd?: number
          coach_id?: string
          date?: string
          spent_usd?: number
          task_class_usage?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_coachhelm_llm_budget_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_coachhelm_llm_calls: {
        Row: {
          citations: Json | null
          coach_id: string | null
          completion_tokens: number
          cost_usd: number
          created_at: string
          fallback_to_template: boolean
          id: string
          model_id: string
          player_id: string | null
          prompt_hash: string
          prompt_tokens: number
          task: string
          verified: boolean
        }
        Insert: {
          citations?: Json | null
          coach_id?: string | null
          completion_tokens: number
          cost_usd: number
          created_at?: string
          fallback_to_template?: boolean
          id?: string
          model_id: string
          player_id?: string | null
          prompt_hash: string
          prompt_tokens: number
          task: string
          verified: boolean
        }
        Update: {
          citations?: Json | null
          coach_id?: string | null
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          fallback_to_template?: boolean
          id?: string
          model_id?: string
          player_id?: string | null
          prompt_hash?: string
          prompt_tokens?: number
          task?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "golf_coachhelm_llm_calls_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_coachhelm_llm_calls_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
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
          goal_assignment_default: string
          id: string
          insight_frequency: string | null
          llm_budget_usd_per_day: number | null
          llm_narrative_enabled: boolean
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
          goal_assignment_default?: string
          id?: string
          insight_frequency?: string | null
          llm_budget_usd_per_day?: number | null
          llm_narrative_enabled?: boolean
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
          goal_assignment_default?: string
          id?: string
          insight_frequency?: string | null
          llm_budget_usd_per_day?: number | null
          llm_narrative_enabled?: boolean
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
      golf_course_edit_history: {
        Row: {
          action: string
          changes: Json | null
          course_id: string
          created_at: string
          edited_by_team_id: string | null
          edited_by_user_id: string | null
          id: string
        }
        Insert: {
          action: string
          changes?: Json | null
          course_id: string
          created_at?: string
          edited_by_team_id?: string | null
          edited_by_user_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          changes?: Json | null
          course_id?: string
          created_at?: string
          edited_by_team_id?: string | null
          edited_by_user_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_course_edit_history_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_course_edit_history_edited_by_team_id_fkey"
            columns: ["edited_by_team_id"]
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
      golf_course_tee_edit_history: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          edited_by_team_id: string | null
          edited_by_user_id: string | null
          id: string
          tee_id: string
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          edited_by_team_id?: string | null
          edited_by_user_id?: string | null
          id?: string
          tee_id: string
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          edited_by_team_id?: string | null
          edited_by_user_id?: string | null
          id?: string
          tee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_course_tee_edit_history_edited_by_team_id_fkey"
            columns: ["edited_by_team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_course_tee_edit_history_tee_id_fkey"
            columns: ["tee_id"]
            isOneToOne: false
            referencedRelation: "golf_course_tees"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_course_tee_holes: {
        Row: {
          created_at: string
          handicap_index: number | null
          hole_number: number
          id: string
          par: number
          tee_id: string
          updated_at: string
          yardage: number | null
        }
        Insert: {
          created_at?: string
          handicap_index?: number | null
          hole_number: number
          id?: string
          par: number
          tee_id: string
          updated_at?: string
          yardage?: number | null
        }
        Update: {
          created_at?: string
          handicap_index?: number | null
          hole_number?: number
          id?: string
          par?: number
          tee_id?: string
          updated_at?: string
          yardage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_course_tee_holes_tee_id_fkey"
            columns: ["tee_id"]
            isOneToOne: false
            referencedRelation: "golf_course_tees"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_course_tees: {
        Row: {
          category: string | null
          course_id: string
          course_rating: number | null
          created_at: string
          created_by_team_id: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          holes_count: number
          id: string
          is_draft: boolean
          last_edited_at: string | null
          last_edited_by_team_id: string | null
          last_edited_by_user_id: string | null
          normalized_tee_name: string
          slope_rating: number | null
          source: string | null
          tee_color: string | null
          tee_name: string
          total_par: number | null
          total_yards: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          course_id: string
          course_rating?: number | null
          created_at?: string
          created_by_team_id?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          holes_count?: number
          id?: string
          is_draft?: boolean
          last_edited_at?: string | null
          last_edited_by_team_id?: string | null
          last_edited_by_user_id?: string | null
          normalized_tee_name: string
          slope_rating?: number | null
          source?: string | null
          tee_color?: string | null
          tee_name: string
          total_par?: number | null
          total_yards?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          course_id?: string
          course_rating?: number | null
          created_at?: string
          created_by_team_id?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          holes_count?: number
          id?: string
          is_draft?: boolean
          last_edited_at?: string | null
          last_edited_by_team_id?: string | null
          last_edited_by_user_id?: string | null
          normalized_tee_name?: string
          slope_rating?: number | null
          source?: string | null
          tee_color?: string | null
          tee_name?: string
          total_par?: number | null
          total_yards?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_course_tees_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_course_tees_created_by_team_id_fkey"
            columns: ["created_by_team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_course_tees_last_edited_by_team_id_fkey"
            columns: ["last_edited_by_team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_courses: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          course_rating: number | null
          created_at: string | null
          created_by_team_id: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          holes: number | null
          id: string
          image_url: string | null
          last_edited_at: string | null
          last_edited_by_team_id: string | null
          last_edited_by_user_id: string | null
          name: string
          normalized_name: string | null
          par: number | null
          slope_rating: number | null
          slug: string | null
          source: string | null
          state: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          course_rating?: number | null
          created_at?: string | null
          created_by_team_id?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          holes?: number | null
          id?: string
          image_url?: string | null
          last_edited_at?: string | null
          last_edited_by_team_id?: string | null
          last_edited_by_user_id?: string | null
          name: string
          normalized_name?: string | null
          par?: number | null
          slope_rating?: number | null
          slug?: string | null
          source?: string | null
          state?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          course_rating?: number | null
          created_at?: string | null
          created_by_team_id?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          holes?: number | null
          id?: string
          image_url?: string | null
          last_edited_at?: string | null
          last_edited_by_team_id?: string | null
          last_edited_by_user_id?: string | null
          name?: string
          normalized_name?: string | null
          par?: number | null
          slope_rating?: number | null
          slug?: string | null
          source?: string | null
          state?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_courses_created_by_team_id_fkey"
            columns: ["created_by_team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_courses_last_edited_by_team_id_fkey"
            columns: ["last_edited_by_team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_demo_sessions: {
        Row: {
          email: string
          entered_at: string
          id: string
          ip: string | null
          metadata: Json
          name: string
          referrer: string | null
          school: string | null
          user_agent: string | null
        }
        Insert: {
          email: string
          entered_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          name: string
          referrer?: string | null
          school?: string | null
          user_agent?: string | null
        }
        Update: {
          email?: string
          entered_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          name?: string
          referrer?: string | null
          school?: string | null
          user_agent?: string | null
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
      golf_drills: {
        Row: {
          category: string
          created_at: string | null
          description: string
          difficulty: string
          duration_min: number
          id: string
          impacts_metric_id: string | null
          slug: string
          tags: string[]
          title: string
          video_url: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description: string
          difficulty: string
          duration_min: number
          id?: string
          impacts_metric_id?: string | null
          slug: string
          tags?: string[]
          title: string
          video_url?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          difficulty?: string
          duration_min?: number
          id?: string
          impacts_metric_id?: string | null
          slug?: string
          tags?: string[]
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_drills_impacts_metric_id_fkey"
            columns: ["impacts_metric_id"]
            isOneToOne: false
            referencedRelation: "golf_metrics"
            referencedColumns: ["metric_id"]
          },
        ]
      }
      golf_event_attendance: {
        Row: {
          attendance_status: string | null
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
          attendance_status?: string | null
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
          attendance_status?: string | null
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
      golf_event_documents: {
        Row: {
          attached_at: string
          attached_by: string | null
          document_id: string
          event_id: string
          note: string | null
        }
        Insert: {
          attached_at?: string
          attached_by?: string | null
          document_id: string
          event_id: string
          note?: string | null
        }
        Update: {
          attached_at?: string
          attached_by?: string | null
          document_id?: string
          event_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_event_documents_attached_by_fkey"
            columns: ["attached_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_event_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "golf_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_event_documents_event_id_fkey"
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
      golf_global_patterns: {
        Row: {
          average_impact: number
          conditions: Json
          confidence: number
          contributing_players: string[]
          created_at: string
          id: string
          instance_count: number
          outcomes: Json
          pattern_type: string
          player_count: number
          prevalence: number
          signature: string
          updated_at: string
          varied_by_handicap: Json
          varied_by_tier: Json
        }
        Insert: {
          average_impact?: number
          conditions?: Json
          confidence?: number
          contributing_players?: string[]
          created_at?: string
          id?: string
          instance_count?: number
          outcomes?: Json
          pattern_type: string
          player_count?: number
          prevalence?: number
          signature: string
          updated_at?: string
          varied_by_handicap?: Json
          varied_by_tier?: Json
        }
        Update: {
          average_impact?: number
          conditions?: Json
          confidence?: number
          contributing_players?: string[]
          created_at?: string
          id?: string
          instance_count?: number
          outcomes?: Json
          pattern_type?: string
          player_count?: number
          prevalence?: number
          signature?: string
          updated_at?: string
          varied_by_handicap?: Json
          varied_by_tier?: Json
        }
        Relationships: []
      }
      golf_goal_suggestions: {
        Row: {
          acted_at: string | null
          expires_at: string
          id: string
          metric_id: string
          origin_insight_id: string | null
          player_id: string
          snooze_until: string | null
          state: string
          suggested_at: string
          suggested_target_value: number | null
          suggested_window_days: number
        }
        Insert: {
          acted_at?: string | null
          expires_at?: string
          id?: string
          metric_id: string
          origin_insight_id?: string | null
          player_id: string
          snooze_until?: string | null
          state?: string
          suggested_at?: string
          suggested_target_value?: number | null
          suggested_window_days?: number
        }
        Update: {
          acted_at?: string | null
          expires_at?: string
          id?: string
          metric_id?: string
          origin_insight_id?: string | null
          player_id?: string
          snooze_until?: string | null
          state?: string
          suggested_at?: string
          suggested_target_value?: number | null
          suggested_window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "golf_goal_suggestions_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "golf_metrics"
            referencedColumns: ["metric_id"]
          },
          {
            foreignKeyName: "golf_goal_suggestions_origin_insight_id_fkey"
            columns: ["origin_insight_id"]
            isOneToOne: false
            referencedRelation: "golf_coach_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_goal_suggestions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_goals: {
        Row: {
          baseline_value: number | null
          category: string
          coach_assignment_mode: string | null
          coach_id_if_assigned: string | null
          created_at: string
          created_by_user_id: string
          creator_role: string
          current_value: number | null
          ends_at: string
          id: string
          metric_id: string
          origin: string
          origin_insight_id: string | null
          outcome_evaluated_at: string | null
          player_accepted_at: string | null
          player_decline_reason: string | null
          player_declined_at: string | null
          player_id: string
          shared_at: string | null
          shared_with_coach: boolean
          snapshots: Json
          started_at: string
          state: string
          target_source: string | null
          target_value: number | null
          team_id: string | null
          title: string
          transfer_reason: string | null
          updated_at: string
          window_days: number | null
        }
        Insert: {
          baseline_value?: number | null
          category: string
          coach_assignment_mode?: string | null
          coach_id_if_assigned?: string | null
          created_at?: string
          created_by_user_id: string
          creator_role: string
          current_value?: number | null
          ends_at: string
          id?: string
          metric_id: string
          origin?: string
          origin_insight_id?: string | null
          outcome_evaluated_at?: string | null
          player_accepted_at?: string | null
          player_decline_reason?: string | null
          player_declined_at?: string | null
          player_id: string
          shared_at?: string | null
          shared_with_coach?: boolean
          snapshots?: Json
          started_at?: string
          state?: string
          target_source?: string | null
          target_value?: number | null
          team_id?: string | null
          title: string
          transfer_reason?: string | null
          updated_at?: string
          window_days?: number | null
        }
        Update: {
          baseline_value?: number | null
          category?: string
          coach_assignment_mode?: string | null
          coach_id_if_assigned?: string | null
          created_at?: string
          created_by_user_id?: string
          creator_role?: string
          current_value?: number | null
          ends_at?: string
          id?: string
          metric_id?: string
          origin?: string
          origin_insight_id?: string | null
          outcome_evaluated_at?: string | null
          player_accepted_at?: string | null
          player_decline_reason?: string | null
          player_declined_at?: string | null
          player_id?: string
          shared_at?: string | null
          shared_with_coach?: boolean
          snapshots?: Json
          started_at?: string
          state?: string
          target_source?: string | null
          target_value?: number | null
          team_id?: string | null
          title?: string
          transfer_reason?: string | null
          updated_at?: string
          window_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_goals_coach_id_if_assigned_fkey"
            columns: ["coach_id_if_assigned"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_goals_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_goals_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "golf_metrics"
            referencedColumns: ["metric_id"]
          },
          {
            foreignKeyName: "golf_goals_origin_insight_id_fkey"
            columns: ["origin_insight_id"]
            isOneToOne: false
            referencedRelation: "golf_coach_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_goals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_goals_team_id_fkey"
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
      golf_ingest_connections: {
        Row: {
          access_token_encrypted: string
          created_at: string
          expires_at: string | null
          last_synced_at: string | null
          player_id: string
          provider: string
          refresh_token_encrypted: string | null
          state: string
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          created_at?: string
          expires_at?: string | null
          last_synced_at?: string | null
          player_id: string
          provider: string
          refresh_token_encrypted?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          created_at?: string
          expires_at?: string | null
          last_synced_at?: string | null
          player_id?: string
          provider?: string
          refresh_token_encrypted?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_ingest_connections_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_ingest_sync_log: {
        Row: {
          error_detail: string | null
          errors_count: number
          id: string
          player_id: string
          provider: string
          ran_at: string
          rounds_inserted: number
          shots_inserted: number
        }
        Insert: {
          error_detail?: string | null
          errors_count?: number
          id?: string
          player_id: string
          provider: string
          ran_at?: string
          rounds_inserted?: number
          shots_inserted?: number
        }
        Update: {
          error_detail?: string | null
          errors_count?: number
          id?: string
          player_id?: string
          provider?: string
          ran_at?: string
          rounds_inserted?: number
          shots_inserted?: number
        }
        Relationships: []
      }
      golf_insight_action: {
        Row: {
          action_type: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          id: string
          insight_id: string
          metadata: Json | null
          player_id: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: string
          insight_id: string
          metadata?: Json | null
          player_id: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: string
          insight_id?: string
          metadata?: Json | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_insight_action_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "golf_coach_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_insight_action_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_insight_drill_attachments: {
        Row: {
          drill_id: string
          insight_id: string
          rank: number
        }
        Insert: {
          drill_id: string
          insight_id: string
          rank?: number
        }
        Update: {
          drill_id?: string
          insight_id?: string
          rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "golf_insight_drill_attachments_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "golf_drills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_insight_drill_attachments_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "golf_coach_insights"
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
      golf_insight_exposure: {
        Row: {
          coach_id: string | null
          created_at: string
          id: string
          insight_id: string
          player_id: string
          rank_position: number | null
          rank_score: number | null
          shown_at: string
          surface: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          id?: string
          insight_id: string
          player_id: string
          rank_position?: number | null
          rank_score?: number | null
          shown_at?: string
          surface?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          id?: string
          insight_id?: string
          player_id?: string
          rank_position?: number | null
          rank_score?: number | null
          shown_at?: string
          surface?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_insight_exposure_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "golf_coach_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_insight_exposure_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
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
      golf_insight_outcome: {
        Row: {
          baseline_value: number | null
          created_at: string
          id: string
          improvement: number | null
          insight_id: string
          measured_at: string
          metric: string | null
          outcome_value: number | null
          player_id: string
          related_round_id: string | null
          window_days: number | null
        }
        Insert: {
          baseline_value?: number | null
          created_at?: string
          id?: string
          improvement?: number | null
          insight_id: string
          measured_at?: string
          metric?: string | null
          outcome_value?: number | null
          player_id: string
          related_round_id?: string | null
          window_days?: number | null
        }
        Update: {
          baseline_value?: number | null
          created_at?: string
          id?: string
          improvement?: number | null
          insight_id?: string
          measured_at?: string
          metric?: string | null
          outcome_value?: number | null
          player_id?: string
          related_round_id?: string | null
          window_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_insight_outcome_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "golf_coach_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_insight_outcome_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_insight_outcome_attribution: {
        Row: {
          attributed_at: string
          baseline_value: number
          delta: number
          insight_id: string
          lift: number | null
          n_rounds_after: number
          n_rounds_before: number
          post_value: number
          surfaced_at: string
          target_metric_id: string
        }
        Insert: {
          attributed_at?: string
          baseline_value: number
          delta: number
          insight_id: string
          lift?: number | null
          n_rounds_after: number
          n_rounds_before: number
          post_value: number
          surfaced_at: string
          target_metric_id: string
        }
        Update: {
          attributed_at?: string
          baseline_value?: number
          delta?: number
          insight_id?: string
          lift?: number | null
          n_rounds_after?: number
          n_rounds_before?: number
          post_value?: number
          surfaced_at?: string
          target_metric_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_insight_outcome_attribution_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: true
            referencedRelation: "golf_coach_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_insight_player_feedback: {
        Row: {
          created_at: string
          id: string
          insight_id: string
          note: string | null
          player_id: string
          rating: string
        }
        Insert: {
          created_at?: string
          id?: string
          insight_id: string
          note?: string | null
          player_id: string
          rating: string
        }
        Update: {
          created_at?: string
          id?: string
          insight_id?: string
          note?: string | null
          player_id?: string
          rating?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_insight_player_feedback_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "golf_coach_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_insight_player_feedback_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
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
      golf_metrics: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string | null
          direction: string
          display_label: string
          introduced_in_wave: string
          metric_id: string
          unit: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          description?: string | null
          direction: string
          display_label: string
          introduced_in_wave?: string
          metric_id: string
          unit: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string | null
          direction?: string
          display_label?: string
          introduced_in_wave?: string
          metric_id?: string
          unit?: string
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
          dismissed_at: string | null
          dismissed_reason: string | null
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
          dismissed_at?: string | null
          dismissed_reason?: string | null
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
          dismissed_at?: string | null
          dismissed_reason?: string | null
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
      golf_pga_standards: {
        Row: {
          display_label: string
          div1_avg_value: number | null
          div2_avg_value: number | null
          div3_avg_value: number | null
          hs_avg_value: number | null
          korn_ferry_value: number | null
          metric_id: string
          pga_p25: number | null
          pga_p50: number | null
          pga_p75: number | null
          pga_tour_value: number | null
          season: string
          source: string | null
          tour: string
          updated_at: string
        }
        Insert: {
          display_label: string
          div1_avg_value?: number | null
          div2_avg_value?: number | null
          div3_avg_value?: number | null
          hs_avg_value?: number | null
          korn_ferry_value?: number | null
          metric_id: string
          pga_p25?: number | null
          pga_p50?: number | null
          pga_p75?: number | null
          pga_tour_value?: number | null
          season: string
          source?: string | null
          tour?: string
          updated_at?: string
        }
        Update: {
          display_label?: string
          div1_avg_value?: number | null
          div2_avg_value?: number | null
          div3_avg_value?: number | null
          hs_avg_value?: number | null
          korn_ferry_value?: number | null
          metric_id?: string
          pga_p25?: number | null
          pga_p50?: number | null
          pga_p75?: number | null
          pga_tour_value?: number | null
          season?: string
          source?: string | null
          tour?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_pga_standards_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "golf_metrics"
            referencedColumns: ["metric_id"]
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
          outcome_status: string | null
          player_id: string
          priority: number | null
          progress_notes: Json | null
          review_context: string | null
          started_at: string | null
          status: string | null
          target_date: string | null
          target_kind: string | null
          target_metric: string | null
          target_rounds: number | null
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
          outcome_status?: string | null
          player_id: string
          priority?: number | null
          progress_notes?: Json | null
          review_context?: string | null
          started_at?: string | null
          status?: string | null
          target_date?: string | null
          target_kind?: string | null
          target_metric?: string | null
          target_rounds?: number | null
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
          outcome_status?: string | null
          player_id?: string
          priority?: number | null
          progress_notes?: Json | null
          review_context?: string | null
          started_at?: string | null
          status?: string | null
          target_date?: string | null
          target_kind?: string | null
          target_metric?: string | null
          target_rounds?: number | null
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
      golf_player_genome: {
        Row: {
          computed_at: string
          player_id: string
          rounds_basis: number
          vector: Json
        }
        Insert: {
          computed_at?: string
          player_id: string
          rounds_basis: number
          vector: Json
        }
        Update: {
          computed_at?: string
          player_id?: string
          rounds_basis?: number
          vector?: Json
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_genome_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "golf_players"
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
          prefs: Json
          quiet_mode: boolean
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_announcements_seen_at?: string | null
          last_travel_seen_at?: string | null
          player_id: string
          prefs?: Json
          quiet_mode?: boolean
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_announcements_seen_at?: string | null
          last_travel_seen_at?: string | null
          player_id?: string
          prefs?: Json
          quiet_mode?: boolean
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
      golf_player_standing: {
        Row: {
          computed_at: string
          level_avg: number | null
          level_n: number
          level_pct: number | null
          metric_id: string
          pga_delta: number | null
          pga_value: number
          player_id: string
          player_value: number
          team_avg: number | null
          team_n: number
          team_pct: number | null
        }
        Insert: {
          computed_at?: string
          level_avg?: number | null
          level_n?: number
          level_pct?: number | null
          metric_id: string
          pga_delta?: number | null
          pga_value: number
          player_id: string
          player_value: number
          team_avg?: number | null
          team_n?: number
          team_pct?: number | null
        }
        Update: {
          computed_at?: string
          level_avg?: number | null
          level_n?: number
          level_pct?: number | null
          metric_id?: string
          pga_delta?: number | null
          pga_value?: number
          player_id?: string
          player_value?: number
          team_avg?: number | null
          team_n?: number
          team_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_player_standing_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "golf_metrics"
            referencedColumns: ["metric_id"]
          },
          {
            foreignKeyName: "golf_player_standing_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
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
          first_round_date: string | null
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
          putt_attempts_10_15ft: number | null
          putt_attempts_15_25ft: number | null
          putt_attempts_25_plus_ft: number | null
          putt_attempts_3_5ft: number | null
          putt_attempts_5_10ft: number | null
          putt_make_pct_0_3ft: number | null
          putt_make_pct_10_15ft: number | null
          putt_make_pct_15_20ft: number | null
          putt_make_pct_15_25ft: number | null
          putt_make_pct_20_plus_ft: number | null
          putt_make_pct_25_plus_ft: number | null
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
          first_round_date?: string | null
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
          putt_attempts_10_15ft?: number | null
          putt_attempts_15_25ft?: number | null
          putt_attempts_25_plus_ft?: number | null
          putt_attempts_3_5ft?: number | null
          putt_attempts_5_10ft?: number | null
          putt_make_pct_0_3ft?: number | null
          putt_make_pct_10_15ft?: number | null
          putt_make_pct_15_20ft?: number | null
          putt_make_pct_15_25ft?: number | null
          putt_make_pct_20_plus_ft?: number | null
          putt_make_pct_25_plus_ft?: number | null
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
          first_round_date?: string | null
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
          putt_attempts_10_15ft?: number | null
          putt_attempts_15_25ft?: number | null
          putt_attempts_25_plus_ft?: number | null
          putt_attempts_3_5ft?: number | null
          putt_attempts_5_10ft?: number | null
          putt_make_pct_0_3ft?: number | null
          putt_make_pct_10_15ft?: number | null
          putt_make_pct_15_20ft?: number | null
          putt_make_pct_15_25ft?: number | null
          putt_make_pct_20_plus_ft?: number | null
          putt_make_pct_25_plus_ft?: number | null
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
      golf_practice_sessions: {
        Row: {
          created_at: string
          id: string
          player_id: string
          session_date: string
          shots_data: Json
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          session_date: string
          shots_data: Json
          source: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          session_date?: string
          shots_data?: Json
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_practice_sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
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
        Relationships: [
          {
            foreignKeyName: "golf_prediction_validations_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "golf_predictions"
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
      golf_qualifier_round_courses: {
        Row: {
          course_id: string | null
          course_name: string | null
          created_at: string
          id: string
          qualifier_id: string
          round_number: number
          tee_id: string | null
        }
        Insert: {
          course_id?: string | null
          course_name?: string | null
          created_at?: string
          id?: string
          qualifier_id: string
          round_number: number
          tee_id?: string | null
        }
        Update: {
          course_id?: string | null
          course_name?: string | null
          created_at?: string
          id?: string
          qualifier_id?: string
          round_number?: number
          tee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_qualifier_round_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_qualifier_round_courses_qualifier_id_fkey"
            columns: ["qualifier_id"]
            isOneToOne: false
            referencedRelation: "golf_qualifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_qualifier_selections: {
        Row: {
          coach_reasoning: string | null
          player_id: string
          qualifier_id: string
          selected_at: string
          selected_by_user_id: string
          selection_type: string
        }
        Insert: {
          coach_reasoning?: string | null
          player_id: string
          qualifier_id: string
          selected_at?: string
          selected_by_user_id: string
          selection_type: string
        }
        Update: {
          coach_reasoning?: string | null
          player_id?: string
          qualifier_id?: string
          selected_at?: string
          selected_by_user_id?: string
          selection_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_qualifier_selections_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "golf_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_qualifier_selections_qualifier_id_fkey"
            columns: ["qualifier_id"]
            isOneToOne: false
            referencedRelation: "golf_qualifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_qualifier_selections_selected_by_user_id_fkey"
            columns: ["selected_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          num_rounds: number
          rules: string | null
          selection_slots_coach_pick: number
          selection_slots_total: number
          selection_state: string
          spots_available: number | null
          start_date: string
          status: string | null
          target_tournament_id: string | null
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
          num_rounds?: number
          rules?: string | null
          selection_slots_coach_pick?: number
          selection_slots_total?: number
          selection_state?: string
          spots_available?: number | null
          start_date: string
          status?: string | null
          target_tournament_id?: string | null
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
          num_rounds?: number
          rules?: string | null
          selection_slots_coach_pick?: number
          selection_slots_total?: number
          selection_state?: string
          spots_available?: number | null
          start_date?: string
          status?: string | null
          target_tournament_id?: string | null
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
            foreignKeyName: "golf_qualifiers_target_tournament_id_fkey"
            columns: ["target_tournament_id"]
            isOneToOne: false
            referencedRelation: "golf_events"
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
      golf_recruit_documents: {
        Row: {
          category: string
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          recruit_id: string
          storage_path: string
          team_id: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          recruit_id: string
          storage_path: string
          team_id: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          recruit_id?: string
          storage_path?: string
          team_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_recruit_documents_recruit_id_fkey"
            columns: ["recruit_id"]
            isOneToOne: false
            referencedRelation: "golf_recruits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_recruit_documents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "golf_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_recruits: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string
          hometown: string | null
          hs_class: number | null
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          state: string | null
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name: string
          hometown?: string | null
          hs_class?: number | null
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          hometown?: string | null
          hs_class?: number | null
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_recruits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "golf_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_recruits_team_id_fkey"
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
          ai_recap: string | null
          ai_recap_generated_at: string | null
          back_nine: number | null
          coachhelm_analyzed_at: string | null
          coachhelm_failed_at: string | null
          coachhelm_failure_reason: string | null
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
          tee_id: string | null
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
          ai_recap?: string | null
          ai_recap_generated_at?: string | null
          back_nine?: number | null
          coachhelm_analyzed_at?: string | null
          coachhelm_failed_at?: string | null
          coachhelm_failure_reason?: string | null
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
          tee_id?: string | null
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
          ai_recap?: string | null
          ai_recap_generated_at?: string | null
          back_nine?: number | null
          coachhelm_analyzed_at?: string | null
          coachhelm_failed_at?: string | null
          coachhelm_failure_reason?: string | null
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
          tee_id?: string | null
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
          {
            foreignKeyName: "golf_rounds_tee_id_fkey"
            columns: ["tee_id"]
            isOneToOne: false
            referencedRelation: "golf_course_tees"
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
          preferences: Json
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
          preferences?: Json
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
          preferences?: Json
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
      golf_team_saved_courses: {
        Row: {
          course_id: string
          created_at: string
          created_by_user_id: string | null
          default_tee_id: string | null
          id: string
          last_played_at: string | null
          pinned: boolean
          team_id: string
          times_played: number
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by_user_id?: string | null
          default_tee_id?: string | null
          id?: string
          last_played_at?: string | null
          pinned?: boolean
          team_id: string
          times_played?: number
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by_user_id?: string | null
          default_tee_id?: string | null
          id?: string
          last_played_at?: string | null
          pinned?: boolean
          team_id?: string
          times_played?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "golf_team_saved_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_team_saved_courses_default_tee_id_fkey"
            columns: ["default_tee_id"]
            isOneToOne: false
            referencedRelation: "golf_course_tees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golf_team_saved_courses_team_id_fkey"
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
          sg_baseline: string | null
          sg_benchmark_level: string
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
          sg_baseline?: string | null
          sg_benchmark_level?: string
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
          sg_baseline?: string | null
          sg_benchmark_level?: string
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
          gender: string
          id: string
          join_code: string
          logo_url: string | null
          name: string
          organization_id: string | null
          primary_color: string | null
          season: string | null
          season_active: boolean
          secondary_color: string | null
          timezone: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          gender?: string
          id?: string
          join_code: string
          logo_url?: string | null
          name: string
          organization_id?: string | null
          primary_color?: string | null
          season?: string | null
          season_active?: boolean
          secondary_color?: string | null
          timezone?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          gender?: string
          id?: string
          join_code?: string
          logo_url?: string | null
          name?: string
          organization_id?: string | null
          primary_color?: string | null
          season?: string | null
          season_active?: boolean
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
      helm_lifting_athletes: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          is_active: boolean
          last_name: string | null
          organization_id: string
          position: string | null
          sport: string
          sport_player_id: string | null
          team_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          organization_id: string
          position?: string | null
          sport: string
          sport_player_id?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          organization_id?: string
          position?: string | null
          sport?: string
          sport_player_id?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_athletes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_athletes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_availability_statuses: {
        Row: {
          athlete_id: string
          created_at: string
          created_by_coach_id: string | null
          ends_at: string | null
          id: string
          legacy_baseball_id: string | null
          note: string | null
          organization_id: string
          reason_category: string | null
          sport: string
          starts_at: string
          status: string
          visibility: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          created_by_coach_id?: string | null
          ends_at?: string | null
          id?: string
          legacy_baseball_id?: string | null
          note?: string | null
          organization_id: string
          reason_category?: string | null
          sport: string
          starts_at?: string
          status?: string
          visibility?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by_coach_id?: string | null
          ends_at?: string | null
          id?: string
          legacy_baseball_id?: string | null
          note?: string | null
          organization_id?: string
          reason_category?: string | null
          sport?: string
          starts_at?: string
          status?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_availability_statuses_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_availability_statuses_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_availability_statuses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_bodyweight_entries: {
        Row: {
          athlete_id: string
          created_at: string
          entry_date: string
          id: string
          legacy_baseball_id: string | null
          organization_id: string
          source: string
          sport: string
          weight_lbs: number
        }
        Insert: {
          athlete_id: string
          created_at?: string
          entry_date: string
          id?: string
          legacy_baseball_id?: string | null
          organization_id: string
          source?: string
          sport: string
          weight_lbs: number
        }
        Update: {
          athlete_id?: string
          created_at?: string
          entry_date?: string
          id?: string
          legacy_baseball_id?: string | null
          organization_id?: string
          source?: string
          sport?: string
          weight_lbs?: number
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_bodyweight_entries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_bodyweight_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_coach_assignments: {
        Row: {
          assigned_by_user_id: string | null
          coach_id: string
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          sport: string
          team_id: string | null
          team_name_snapshot: string | null
          updated_at: string
        }
        Insert: {
          assigned_by_user_id?: string | null
          coach_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          sport: string
          team_id?: string | null
          team_name_snapshot?: string | null
          updated_at?: string
        }
        Update: {
          assigned_by_user_id?: string | null
          coach_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          sport?: string
          team_id?: string | null
          team_name_snapshot?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_coach_assignments_assigned_by_user_id_fkey"
            columns: ["assigned_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_coach_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_coach_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_coach_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_sport: string
          invited_by_user_id: string | null
          organization_id: string
          role_title: string | null
          source_team_id: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by_sport: string
          invited_by_user_id?: string | null
          organization_id: string
          role_title?: string | null
          source_team_id?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_sport?: string
          invited_by_user_id?: string | null
          organization_id?: string
          role_title?: string | null
          source_team_id?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_coach_invites_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_coach_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_coaches: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          onboarding_completed: boolean
          organization_id: string
          phone: string | null
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          organization_id: string
          phone?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          organization_id?: string
          phone?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_coaches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_coaches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_days: {
        Row: {
          created_at: string
          day_number: number
          day_type: string
          estimated_minutes: number | null
          id: string
          legacy_baseball_id: string | null
          name: string | null
          sport_context: string | null
          week_id: string
        }
        Insert: {
          created_at?: string
          day_number: number
          day_type?: string
          estimated_minutes?: number | null
          id?: string
          legacy_baseball_id?: string | null
          name?: string | null
          sport_context?: string | null
          week_id: string
        }
        Update: {
          created_at?: string
          day_number?: number
          day_type?: string
          estimated_minutes?: number | null
          id?: string
          legacy_baseball_id?: string | null
          name?: string | null
          sport_context?: string | null
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_days_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_exercise_substitutions: {
        Row: {
          created_at: string
          created_by_coach_id: string | null
          exercise_id: string
          id: string
          legacy_baseball_id: string | null
          organization_id: string
          reason: string | null
          sport: string
          substitute_exercise_id: string
        }
        Insert: {
          created_at?: string
          created_by_coach_id?: string | null
          exercise_id: string
          id?: string
          legacy_baseball_id?: string | null
          organization_id: string
          reason?: string | null
          sport: string
          substitute_exercise_id: string
        }
        Update: {
          created_at?: string
          created_by_coach_id?: string | null
          exercise_id?: string
          id?: string
          legacy_baseball_id?: string | null
          organization_id?: string
          reason?: string | null
          sport?: string
          substitute_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_exercise_substitutions_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_exercise_substitutions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_exercise_substitutions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_exercise_substitutions_substitute_exercise_id_fkey"
            columns: ["substitute_exercise_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_exercises: {
        Row: {
          body_region: string | null
          category: string
          coaching_cues: string[]
          contraindication_notes: string | null
          created_at: string
          created_by_coach_id: string | null
          default_unit: string
          equipment: string | null
          grip_stress: string
          id: string
          instructions: string | null
          is_active: boolean
          is_global: boolean
          is_pitcher_sensitive: boolean
          legacy_baseball_id: string | null
          lower_body_loading: string
          name: string
          organization_id: string
          primary_body_regions: string[]
          primary_pattern: string | null
          rotational_stress: string
          secondary_body_regions: string[]
          spine_loading: string
          sport: string
          sport_constraints: Json
          sport_tags: string[]
          stress_regions: string[]
          throwing_arm_stress: string
          track_distance: boolean
          track_load: boolean
          track_reps: boolean
          track_rpe: boolean
          track_sets: boolean
          track_time: boolean
          track_velocity: boolean
          unilateral: boolean
          updated_at: string
          video_url: string | null
        }
        Insert: {
          body_region?: string | null
          category?: string
          coaching_cues?: string[]
          contraindication_notes?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          default_unit?: string
          equipment?: string | null
          grip_stress?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          is_global?: boolean
          is_pitcher_sensitive?: boolean
          legacy_baseball_id?: string | null
          lower_body_loading?: string
          name: string
          organization_id: string
          primary_body_regions?: string[]
          primary_pattern?: string | null
          rotational_stress?: string
          secondary_body_regions?: string[]
          spine_loading?: string
          sport: string
          sport_constraints?: Json
          sport_tags?: string[]
          stress_regions?: string[]
          throwing_arm_stress?: string
          track_distance?: boolean
          track_load?: boolean
          track_reps?: boolean
          track_rpe?: boolean
          track_sets?: boolean
          track_time?: boolean
          track_velocity?: boolean
          unilateral?: boolean
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          body_region?: string | null
          category?: string
          coaching_cues?: string[]
          contraindication_notes?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          default_unit?: string
          equipment?: string | null
          grip_stress?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          is_global?: boolean
          is_pitcher_sensitive?: boolean
          legacy_baseball_id?: string | null
          lower_body_loading?: string
          name?: string
          organization_id?: string
          primary_body_regions?: string[]
          primary_pattern?: string | null
          rotational_stress?: string
          secondary_body_regions?: string[]
          spine_loading?: string
          sport?: string
          sport_constraints?: Json
          sport_tags?: string[]
          stress_regions?: string[]
          throwing_arm_stress?: string
          track_distance?: boolean
          track_load?: boolean
          track_reps?: boolean
          track_rpe?: boolean
          track_sets?: boolean
          track_time?: boolean
          track_velocity?: boolean
          unilateral?: boolean
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_exercises_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_exercises_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_group_members: {
        Row: {
          added_by_coach_id: string | null
          athlete_id: string
          created_at: string
          ends_at: string | null
          group_id: string
          id: string
          legacy_baseball_id: string | null
          source: string
          starts_at: string | null
        }
        Insert: {
          added_by_coach_id?: string | null
          athlete_id: string
          created_at?: string
          ends_at?: string | null
          group_id: string
          id?: string
          legacy_baseball_id?: string | null
          source?: string
          starts_at?: string | null
        }
        Update: {
          added_by_coach_id?: string | null
          athlete_id?: string
          created_at?: string
          ends_at?: string | null
          group_id?: string
          id?: string
          legacy_baseball_id?: string | null
          source?: string
          starts_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_group_members_added_by_coach_id_fkey"
            columns: ["added_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_group_members_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_groups: {
        Row: {
          created_at: string
          created_by_coach_id: string | null
          description: string | null
          group_type: string
          id: string
          is_active: boolean
          legacy_baseball_id: string | null
          name: string
          organization_id: string
          rule_json: Json
          sport: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          group_type?: string
          id?: string
          is_active?: boolean
          legacy_baseball_id?: string | null
          name: string
          organization_id: string
          rule_json?: Json
          sport: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          group_type?: string
          id?: string
          is_active?: boolean
          legacy_baseball_id?: string | null
          name?: string
          organization_id?: string
          rule_json?: Json
          sport?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_groups_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_import_rows: {
        Row: {
          created_at: string
          id: string
          import_run_id: string
          legacy_baseball_id: string | null
          match_status: string
          matched_athlete_id: string | null
          organization_id: string
          raw_json: Json
          row_number: number
          sport: string
          validation_error: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          import_run_id: string
          legacy_baseball_id?: string | null
          match_status?: string
          matched_athlete_id?: string | null
          organization_id: string
          raw_json?: Json
          row_number: number
          sport: string
          validation_error?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          import_run_id?: string
          legacy_baseball_id?: string | null
          match_status?: string
          matched_athlete_id?: string | null
          organization_id?: string
          raw_json?: Json
          row_number?: number
          sport?: string
          validation_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_import_rows_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_import_rows_matched_athlete_id_fkey"
            columns: ["matched_athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_import_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_import_runs: {
        Row: {
          committed_at: string | null
          created_at: string
          created_by_coach_id: string | null
          file_hash: string | null
          file_name: string | null
          id: string
          import_kind: string
          legacy_baseball_id: string | null
          mapping_json: Json
          matched_rows: number
          organization_id: string
          rolled_back_at: string | null
          source: string
          source_confidence: string
          sport: string
          status: string
          total_rows: number
          units_json: Json
          unmatched_rows: number
          updated_at: string
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          file_hash?: string | null
          file_name?: string | null
          id?: string
          import_kind?: string
          legacy_baseball_id?: string | null
          mapping_json?: Json
          matched_rows?: number
          organization_id: string
          rolled_back_at?: string | null
          source?: string
          source_confidence?: string
          sport: string
          status?: string
          total_rows?: number
          units_json?: Json
          unmatched_rows?: number
          updated_at?: string
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          file_hash?: string | null
          file_name?: string | null
          id?: string
          import_kind?: string
          legacy_baseball_id?: string | null
          mapping_json?: Json
          matched_rows?: number
          organization_id?: string
          rolled_back_at?: string | null
          source?: string
          source_confidence?: string
          sport?: string
          status?: string
          total_rows?: number
          units_json?: Json
          unmatched_rows?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_import_runs_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_import_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_maxes: {
        Row: {
          athlete_id: string
          confidence: number | null
          created_at: string
          exercise_id: string
          id: string
          legacy_baseball_id: string | null
          max_type: string
          organization_id: string
          source: string
          sport: string
          test_date: string | null
          unit: string
          updated_at: string
          value: number
        }
        Insert: {
          athlete_id: string
          confidence?: number | null
          created_at?: string
          exercise_id: string
          id?: string
          legacy_baseball_id?: string | null
          max_type?: string
          organization_id: string
          source?: string
          sport: string
          test_date?: string | null
          unit?: string
          updated_at?: string
          value: number
        }
        Update: {
          athlete_id?: string
          confidence?: number | null
          created_at?: string
          exercise_id?: string
          id?: string
          legacy_baseball_id?: string | null
          max_type?: string
          organization_id?: string
          source?: string
          sport?: string
          test_date?: string | null
          unit?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_maxes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_maxes_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_maxes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_nutrition_plan_assignments: {
        Row: {
          acknowledged_at: string | null
          assigned_at: string
          assigned_by_coach_id: string | null
          assignment_type: string
          athlete_id: string | null
          created_at: string
          group_id: string | null
          id: string
          organization_id: string
          plan_id: string
          sport: string
          team_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          assigned_at?: string
          assigned_by_coach_id?: string | null
          assignment_type: string
          athlete_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          organization_id: string
          plan_id: string
          sport: string
          team_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          assigned_at?: string
          assigned_by_coach_id?: string | null
          assignment_type?: string
          athlete_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          sport?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_nutrition_plan_assignmen_assigned_by_coach_id_fkey"
            columns: ["assigned_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_nutrition_plan_assignments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_nutrition_plan_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_nutrition_plan_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_nutrition_plan_assignments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_nutrition_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_nutrition_plans: {
        Row: {
          created_at: string
          created_by_coach_id: string | null
          description: string | null
          external_url: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          id: string
          organization_id: string
          plan_type: string
          published_at: string | null
          sport: string
          status: string
          storage_path: string | null
          team_id: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          external_url?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          organization_id: string
          plan_type?: string
          published_at?: string | null
          sport: string
          status?: string
          storage_path?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          external_url?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          organization_id?: string
          plan_type?: string
          published_at?: string | null
          sport?: string
          status?: string
          storage_path?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_nutrition_plans_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_nutrition_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_org_viewers: {
        Row: {
          can_edit: boolean
          created_at: string
          granted_by: string
          id: string
          organization_id: string
          source_team_id: string | null
          sport: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          created_at?: string
          granted_by?: string
          id?: string
          organization_id: string
          source_team_id?: string | null
          sport: string
          user_id: string
        }
        Update: {
          can_edit?: boolean
          created_at?: string
          granted_by?: string
          id?: string
          organization_id?: string
          source_team_id?: string | null
          sport?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_org_viewers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_org_viewers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_prescriptions: {
        Row: {
          coaching_note: string | null
          created_at: string
          exercise_id: string | null
          id: string
          legacy_baseball_id: string | null
          load_unit: string | null
          load_value: number | null
          order_index: number
          percent_1rm: number | null
          prescription_type: string
          reps: number | null
          rest_seconds: number | null
          section_id: string
          sets: number | null
          substitution_group_id: string | null
          target_rir: number | null
          target_rpe: number | null
          target_velocity_max: number | null
          target_velocity_min: number | null
          tempo: string | null
        }
        Insert: {
          coaching_note?: string | null
          created_at?: string
          exercise_id?: string | null
          id?: string
          legacy_baseball_id?: string | null
          load_unit?: string | null
          load_value?: number | null
          order_index?: number
          percent_1rm?: number | null
          prescription_type?: string
          reps?: number | null
          rest_seconds?: number | null
          section_id: string
          sets?: number | null
          substitution_group_id?: string | null
          target_rir?: number | null
          target_rpe?: number | null
          target_velocity_max?: number | null
          target_velocity_min?: number | null
          tempo?: string | null
        }
        Update: {
          coaching_note?: string | null
          created_at?: string
          exercise_id?: string | null
          id?: string
          legacy_baseball_id?: string | null
          load_unit?: string | null
          load_value?: number | null
          order_index?: number
          percent_1rm?: number | null
          prescription_type?: string
          reps?: number | null
          rest_seconds?: number | null
          section_id?: string
          sets?: number | null
          substitution_group_id?: string | null
          target_rir?: number | null
          target_rpe?: number | null
          target_velocity_max?: number | null
          target_velocity_min?: number | null
          tempo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_prescriptions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_prescriptions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_prescriptions_substitution_group_id_fkey"
            columns: ["substitution_group_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_exercise_substitutions"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_program_assignments: {
        Row: {
          assigned_by_coach_id: string | null
          assignment_type: string
          athlete_id: string | null
          created_at: string
          group_id: string | null
          id: string
          legacy_baseball_id: string | null
          lift_day_id: string
          organization_id: string
          player_visible_at: string | null
          program_id: string
          scheduled_date: string
          scheduled_end: string | null
          scheduled_start: string | null
          sport: string
          status: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_by_coach_id?: string | null
          assignment_type?: string
          athlete_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          legacy_baseball_id?: string | null
          lift_day_id: string
          organization_id: string
          player_visible_at?: string | null
          program_id: string
          scheduled_date: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          sport: string
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_by_coach_id?: string | null
          assignment_type?: string
          athlete_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          legacy_baseball_id?: string | null
          lift_day_id?: string
          organization_id?: string
          player_visible_at?: string | null
          program_id?: string
          scheduled_date?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          sport?: string
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_program_assignments_assigned_by_coach_id_fkey"
            columns: ["assigned_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_program_assignments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_program_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_program_assignments_lift_day_id_fkey"
            columns: ["lift_day_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_program_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_program_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_programs: {
        Row: {
          created_at: string
          created_by_coach_id: string | null
          description: string | null
          end_date: string | null
          goal: string
          id: string
          is_template: boolean
          legacy_baseball_id: string | null
          name: string
          organization_id: string
          phase: string
          sport: string
          start_date: string | null
          status: string
          team_id: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          end_date?: string | null
          goal?: string
          id?: string
          is_template?: boolean
          legacy_baseball_id?: string | null
          name: string
          organization_id: string
          phase?: string
          sport: string
          start_date?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          end_date?: string | null
          goal?: string
          id?: string
          is_template?: boolean
          legacy_baseball_id?: string | null
          name?: string
          organization_id?: string
          phase?: string
          sport?: string
          start_date?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_programs_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_programs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_prs: {
        Row: {
          achieved_at: string
          athlete_id: string
          created_at: string
          exercise_id: string
          id: string
          legacy_baseball_id: string | null
          lift_session_id: string | null
          organization_id: string
          pr_type: string
          sport: string
          unit: string
          value: number
          verified_by_coach_id: string | null
        }
        Insert: {
          achieved_at?: string
          athlete_id: string
          created_at?: string
          exercise_id: string
          id?: string
          legacy_baseball_id?: string | null
          lift_session_id?: string | null
          organization_id: string
          pr_type?: string
          sport: string
          unit?: string
          value: number
          verified_by_coach_id?: string | null
        }
        Update: {
          achieved_at?: string
          athlete_id?: string
          created_at?: string
          exercise_id?: string
          id?: string
          legacy_baseball_id?: string | null
          lift_session_id?: string | null
          organization_id?: string
          pr_type?: string
          sport?: string
          unit?: string
          value?: number
          verified_by_coach_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_prs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_prs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_prs_lift_session_id_fkey"
            columns: ["lift_session_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_prs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_prs_verified_by_coach_id_fkey"
            columns: ["verified_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_readiness_checkins: {
        Row: {
          athlete_id: string
          checkin_date: string
          created_at: string
          energy_level: number | null
          id: string
          illness_flag: boolean
          legacy_baseball_id: string | null
          lift_session_id: string | null
          lower_body_status: number | null
          mood: number | null
          notes: string | null
          organization_id: string
          readiness_band: string | null
          readiness_score: number | null
          sleep_quality: number | null
          soreness_overall: number | null
          soreness_status: string | null
          sport: string
          stress_level: number | null
          submitted_from: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          athlete_id: string
          checkin_date: string
          created_at?: string
          energy_level?: number | null
          id?: string
          illness_flag?: boolean
          legacy_baseball_id?: string | null
          lift_session_id?: string | null
          lower_body_status?: number | null
          mood?: number | null
          notes?: string | null
          organization_id: string
          readiness_band?: string | null
          readiness_score?: number | null
          sleep_quality?: number | null
          soreness_overall?: number | null
          soreness_status?: string | null
          sport: string
          stress_level?: number | null
          submitted_from?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          athlete_id?: string
          checkin_date?: string
          created_at?: string
          energy_level?: number | null
          id?: string
          illness_flag?: boolean
          legacy_baseball_id?: string | null
          lift_session_id?: string | null
          lower_body_status?: number | null
          mood?: number | null
          notes?: string | null
          organization_id?: string
          readiness_band?: string | null
          readiness_score?: number | null
          sleep_quality?: number | null
          soreness_overall?: number | null
          soreness_status?: string | null
          sport?: string
          stress_level?: number | null
          submitted_from?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_readiness_checkins_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_readiness_checkins_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_sections: {
        Row: {
          created_at: string
          id: string
          instructions: string | null
          legacy_baseball_id: string | null
          lift_day_id: string
          name: string
          section_order: number
          section_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string | null
          legacy_baseball_id?: string | null
          lift_day_id: string
          name: string
          section_order?: number
          section_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string | null
          legacy_baseball_id?: string | null
          lift_day_id?: string
          name?: string
          section_order?: number
          section_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_sections_lift_day_id_fkey"
            columns: ["lift_day_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_days"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_session_exercises: {
        Row: {
          created_at: string
          exercise_id: string | null
          exercise_name_snapshot: string
          id: string
          legacy_baseball_id: string | null
          modification_reason: string | null
          modified_by_coach_id: string | null
          order_index: number
          prescribed_load: number | null
          prescribed_load_unit: string | null
          prescribed_reps: number | null
          prescribed_rpe: number | null
          prescribed_sets: number | null
          prescription_id: string | null
          section_name_snapshot: string | null
          section_type_snapshot: string | null
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exercise_id?: string | null
          exercise_name_snapshot: string
          id?: string
          legacy_baseball_id?: string | null
          modification_reason?: string | null
          modified_by_coach_id?: string | null
          order_index?: number
          prescribed_load?: number | null
          prescribed_load_unit?: string | null
          prescribed_reps?: number | null
          prescribed_rpe?: number | null
          prescribed_sets?: number | null
          prescription_id?: string | null
          section_name_snapshot?: string | null
          section_type_snapshot?: string | null
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exercise_id?: string | null
          exercise_name_snapshot?: string
          id?: string
          legacy_baseball_id?: string | null
          modification_reason?: string | null
          modified_by_coach_id?: string | null
          order_index?: number
          prescribed_load?: number | null
          prescribed_load_unit?: string | null
          prescribed_reps?: number | null
          prescribed_rpe?: number | null
          prescribed_sets?: number | null
          prescription_id?: string | null
          section_name_snapshot?: string | null
          section_type_snapshot?: string | null
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_session_exercises_modified_by_coach_id_fkey"
            columns: ["modified_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_session_exercises_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_session_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_sessions: {
        Row: {
          athlete_id: string
          coach_note: string | null
          coach_review_status: string
          completed_at: string | null
          created_at: string
          day_type: string | null
          estimated_minutes: number | null
          id: string
          legacy_baseball_id: string | null
          organization_id: string
          player_note: string | null
          program_assignment_id: string | null
          readiness_checkin_id: string | null
          scheduled_date: string
          sport: string
          sport_context: string | null
          started_at: string | null
          status: string
          team_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          coach_note?: string | null
          coach_review_status?: string
          completed_at?: string | null
          created_at?: string
          day_type?: string | null
          estimated_minutes?: number | null
          id?: string
          legacy_baseball_id?: string | null
          organization_id: string
          player_note?: string | null
          program_assignment_id?: string | null
          readiness_checkin_id?: string | null
          scheduled_date: string
          sport: string
          sport_context?: string | null
          started_at?: string | null
          status?: string
          team_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          coach_note?: string | null
          coach_review_status?: string
          completed_at?: string | null
          created_at?: string
          day_type?: string | null
          estimated_minutes?: number | null
          id?: string
          legacy_baseball_id?: string | null
          organization_id?: string
          player_note?: string | null
          program_assignment_id?: string | null
          readiness_checkin_id?: string | null
          scheduled_date?: string
          sport?: string
          sport_context?: string | null
          started_at?: string | null
          status?: string
          team_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_sessions_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_sessions_program_assignment_id_fkey"
            columns: ["program_assignment_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_program_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_set_results: {
        Row: {
          actual_load: number | null
          actual_reps: number | null
          athlete_id: string
          coach_observed: boolean
          completed_at: string | null
          created_at: string
          id: string
          legacy_baseball_id: string | null
          load_unit: string | null
          organization_id: string
          player_note: string | null
          prescribed_load: number | null
          prescribed_reps: number | null
          rir: number | null
          rpe: number | null
          session_exercise_id: string
          set_number: number
          sport: string
          velocity: number | null
        }
        Insert: {
          actual_load?: number | null
          actual_reps?: number | null
          athlete_id: string
          coach_observed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          legacy_baseball_id?: string | null
          load_unit?: string | null
          organization_id: string
          player_note?: string | null
          prescribed_load?: number | null
          prescribed_reps?: number | null
          rir?: number | null
          rpe?: number | null
          session_exercise_id: string
          set_number: number
          sport: string
          velocity?: number | null
        }
        Update: {
          actual_load?: number | null
          actual_reps?: number | null
          athlete_id?: string
          coach_observed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          legacy_baseball_id?: string | null
          load_unit?: string | null
          organization_id?: string
          player_note?: string | null
          prescribed_load?: number | null
          prescribed_reps?: number | null
          rir?: number | null
          rpe?: number | null
          session_exercise_id?: string
          set_number?: number
          sport?: string
          velocity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_set_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_set_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_set_results_session_exercise_id_fkey"
            columns: ["session_exercise_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_session_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_soreness_check_requests: {
        Row: {
          athlete_id: string
          completed_at: string | null
          created_at: string
          due_at: string | null
          due_date: string
          id: string
          organization_id: string
          readiness_checkin_id: string | null
          reminder_sent_at: string | null
          schedule_id: string | null
          sport: string
          status: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          due_date: string
          id?: string
          organization_id: string
          readiness_checkin_id?: string | null
          reminder_sent_at?: string | null
          schedule_id?: string | null
          sport: string
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          due_date?: string
          id?: string
          organization_id?: string
          readiness_checkin_id?: string | null
          reminder_sent_at?: string | null
          schedule_id?: string | null
          sport?: string
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_soreness_check_requests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_soreness_check_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_soreness_check_requests_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_soreness_check_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_soreness_check_schedules: {
        Row: {
          assignment_type: string
          athlete_id: string | null
          body_focus: string
          created_at: string
          created_by_coach_id: string | null
          custom_regions: string[] | null
          days_of_week: number[] | null
          due_time: string | null
          due_window_end: string | null
          due_window_start: string | null
          end_date: string | null
          frequency_type: string
          group_id: string | null
          id: string
          instructions: string | null
          organization_id: string
          sport: string
          start_date: string
          status: string
          team_id: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          assignment_type: string
          athlete_id?: string | null
          body_focus?: string
          created_at?: string
          created_by_coach_id?: string | null
          custom_regions?: string[] | null
          days_of_week?: number[] | null
          due_time?: string | null
          due_window_end?: string | null
          due_window_start?: string | null
          end_date?: string | null
          frequency_type: string
          group_id?: string | null
          id?: string
          instructions?: string | null
          organization_id: string
          sport: string
          start_date: string
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          assignment_type?: string
          athlete_id?: string | null
          body_focus?: string
          created_at?: string
          created_by_coach_id?: string | null
          custom_regions?: string[] | null
          days_of_week?: number[] | null
          due_time?: string | null
          due_window_end?: string | null
          due_window_start?: string | null
          end_date?: string | null
          frequency_type?: string
          group_id?: string | null
          id?: string
          instructions?: string | null
          organization_id?: string
          sport?: string
          start_date?: string
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_soreness_check_schedules_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_soreness_check_schedules_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_soreness_check_schedules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_soreness_check_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_soreness_maps: {
        Row: {
          athlete_id: string
          body_region: string
          checkin_id: string
          created_at: string
          id: string
          legacy_baseball_id: string | null
          note: string | null
          organization_id: string
          severity: number
          side: string
          sport: string
        }
        Insert: {
          athlete_id: string
          body_region: string
          checkin_id: string
          created_at?: string
          id?: string
          legacy_baseball_id?: string | null
          note?: string | null
          organization_id: string
          severity?: number
          side?: string
          sport: string
        }
        Update: {
          athlete_id?: string
          body_region?: string
          checkin_id?: string
          created_at?: string
          id?: string
          legacy_baseball_id?: string | null
          note?: string | null
          organization_id?: string
          severity?: number
          side?: string
          sport?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_soreness_maps_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_soreness_maps_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_readiness_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_soreness_maps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_weeks: {
        Row: {
          created_at: string
          deload: boolean
          id: string
          legacy_baseball_id: string | null
          name: string | null
          program_id: string
          theme: string | null
          week_number: number
        }
        Insert: {
          created_at?: string
          deload?: boolean
          id?: string
          legacy_baseball_id?: string | null
          name?: string | null
          program_id: string
          theme?: string | null
          week_number: number
        }
        Update: {
          created_at?: string
          deload?: boolean
          id?: string
          legacy_baseball_id?: string | null
          name?: string | null
          program_id?: string
          theme?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_weeks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_weight_checkin_requests: {
        Row: {
          athlete_id: string
          bodyweight_entry_id: string | null
          completed_at: string | null
          created_at: string
          due_at: string | null
          due_date: string
          id: string
          organization_id: string
          reminder_sent_at: string | null
          schedule_id: string | null
          sport: string
          status: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          bodyweight_entry_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          due_date: string
          id?: string
          organization_id: string
          reminder_sent_at?: string | null
          schedule_id?: string | null
          sport: string
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          bodyweight_entry_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          due_date?: string
          id?: string
          organization_id?: string
          reminder_sent_at?: string | null
          schedule_id?: string | null
          sport?: string
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_weight_checkin_requests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_weight_checkin_requests_bodyweight_entry_id_fkey"
            columns: ["bodyweight_entry_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_bodyweight_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_weight_checkin_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_weight_checkin_requests_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_weight_checkin_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      helm_lifting_weight_checkin_schedules: {
        Row: {
          assignment_type: string
          athlete_id: string | null
          created_at: string
          created_by_coach_id: string | null
          days_of_week: number[] | null
          due_time: string | null
          due_window_end: string | null
          due_window_start: string | null
          end_date: string | null
          frequency_type: string
          group_id: string | null
          id: string
          instructions: string | null
          organization_id: string
          sport: string
          start_date: string
          status: string
          team_id: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          assignment_type: string
          athlete_id?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          days_of_week?: number[] | null
          due_time?: string | null
          due_window_end?: string | null
          due_window_start?: string | null
          end_date?: string | null
          frequency_type: string
          group_id?: string | null
          id?: string
          instructions?: string | null
          organization_id: string
          sport: string
          start_date: string
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          assignment_type?: string
          athlete_id?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          days_of_week?: number[] | null
          due_time?: string | null
          due_window_end?: string | null
          due_window_start?: string | null
          end_date?: string | null
          frequency_type?: string
          group_id?: string | null
          id?: string
          instructions?: string | null
          organization_id?: string
          sport?: string
          start_date?: string
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "helm_lifting_weight_checkin_schedules_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_weight_checkin_schedules_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_weight_checkin_schedules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "helm_lifting_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helm_lifting_weight_checkin_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      baseball_coaches_public: {
        Row: {
          avatar_url: string | null
          coach_type: Database["public"]["Enums"]["baseball_coach_type"] | null
          full_name: string | null
          id: string | null
          organization_id: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          coach_type?: Database["public"]["Enums"]["baseball_coach_type"] | null
          full_name?: string | null
          id?: string | null
          organization_id?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          coach_type?: Database["public"]["Enums"]["baseball_coach_type"] | null
          full_name?: string | null
          id?: string | null
          organization_id?: string | null
          title?: string | null
          user_id?: string | null
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
      crm_coach_engagement: {
        Row: {
          clicks_90d: number | null
          coach_id: string | null
          last_event_at: string | null
          opens_90d: number | null
          replied_90d: number | null
          score: number | null
          temperature: string | null
        }
        Relationships: []
      }
      crm_email_events: {
        Row: {
          contact_log_id: string | null
          created_at: string | null
          event_type: string | null
          id: string | null
          occurred_at: string | null
          raw_payload: Json | null
          recipient_email: string | null
          resend_message_id: string | null
        }
        Insert: {
          contact_log_id?: string | null
          created_at?: string | null
          event_type?: string | null
          id?: string | null
          occurred_at?: string | null
          raw_payload?: Json | null
          recipient_email?: string | null
          resend_message_id?: string | null
        }
        Update: {
          contact_log_id?: string | null
          created_at?: string | null
          event_type?: string | null
          id?: string | null
          occurred_at?: string | null
          raw_payload?: Json | null
          recipient_email?: string | null
          resend_message_id?: string | null
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
      v_crm_coaches_by_school: {
        Row: {
          coaches_at_school: number | null
          conference: string | null
          division: Database["public"]["Enums"]["ncaa_division"] | null
          email: string | null
          email_status: Database["public"]["Enums"]["email_status"] | null
          id: string | null
          is_primary_contact: boolean | null
          is_starred: boolean | null
          name: string | null
          phone: string | null
          priority: number | null
          program: Database["public"]["Enums"]["program_type"] | null
          role_level: string | null
          school: string | null
          status: Database["public"]["Enums"]["coach_status"] | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      __admin_rollup_b_gate: { Args: never; Returns: undefined }
      baseball_accept_staff_invite: { Args: { p_token: string }; Returns: Json }
      baseball_can_invite_staff: {
        Args: { p_team_id: string }
        Returns: boolean
      }
      baseball_replace_lineup_positions: {
        Args: { p_lineup_id: string; p_name: string; p_positions: Json }
        Returns: Json
      }
      baseball_staff_has_note_capability: {
        Args: { p_capability: string; p_team_id: string }
        Returns: boolean
      }
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
      can_insert_baseball_team_member: {
        Args: {
          p_status: Database["public"]["Enums"]["team_member_status"]
          p_team_id: string
        }
        Returns: boolean
      }
      can_manage_baseball_lift_group: {
        Args: { p_group_id: string; p_team_id: string }
        Returns: boolean
      }
      can_view_baseball_player:
        | { Args: { p_player_id: string }; Returns: boolean }
        | { Args: { p_player_id: string; p_team_id: string }; Returns: boolean }
      coach_id_for_team: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: string
      }
      current_coach_id: { Args: never; Returns: string }
      current_player_id: { Args: never; Returns: string }
      get_admin_analytics_rollup: {
        Args: { p_ago12w: string; p_ago30d: string; p_ago7d: string }
        Returns: Json
      }
      get_admin_baseball_rollup: { Args: { p_ago30d?: string }; Returns: Json }
      get_admin_coachhelm_rollup: {
        Args: { p_ago12w: string; p_ago30d: string; p_ago7d: string }
        Returns: Json
      }
      get_admin_dashboard_rollup: { Args: never; Returns: Json }
      get_admin_errors_rollup: {
        Args: { p_ago24h?: string; p_ago7d?: string }
        Returns: Json
      }
      get_admin_event_summary: { Args: { p_days_back?: number }; Returns: Json }
      get_admin_feature_adoption_rollup: {
        Args: { p_ago30d: string }
        Returns: Json
      }
      get_admin_platform_stat_averages: { Args: never; Returns: Json }
      get_admin_rounds_rollup: {
        Args: {
          p_ago12w: string
          p_ago14d: string
          p_ago24h: string
          p_ago30d: string
          p_ago60d: string
          p_ago7d: string
          p_today: string
        }
        Returns: Json
      }
      get_admin_teams_scoring_rollup: {
        Args: { p_ago7d?: string }
        Returns: Json
      }
      get_admin_users_rollup: {
        Args: {
          p_ago12w: string
          p_ago14d: string
          p_ago30d: string
          p_ago7d: string
        }
        Returns: Json
      }
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
      get_baseball_public_player_stats: {
        Args: { p_player_id: string; p_season_year?: number }
        Returns: Json
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
      get_coach_today_schedule: {
        Args: { p_team_id: string; p_today_end: string; p_today_start: string }
        Returns: Json
      }
      get_crm_click_destinations: {
        Args: { p_limit?: number; p_window?: string }
        Returns: {
          click_count: number
          clicked_url: string
          unique_recipients: number
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
      get_crm_template_performance: {
        Args: { p_window?: string }
        Returns: {
          bounced_count: number
          click_rate: number
          clicked_count: number
          delivered_count: number
          open_rate: number
          opened_count: number
          sent_count: number
          template_id: string
          template_name: string
        }[]
      }
      get_crm_time_to_open: {
        Args: { p_window?: string }
        Returns: {
          bucket_max: number
          bucket_min: number
          count: number
        }[]
      }
      get_current_golf_player_id: { Args: never; Returns: string }
      get_current_player_team_ids: { Args: never; Returns: string[] }
      get_db_telemetry: { Args: never; Returns: Json }
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
      get_my_baseball_player_id: { Args: never; Returns: string }
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
      get_player_hub_announcements: {
        Args: { p_player_id: string; p_team_id: string }
        Returns: Json
      }
      get_player_hub_events: {
        Args: { p_player_id: string; p_since: string; p_team_id: string }
        Returns: Json
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
      get_resend_activity_stats: { Args: { p_window?: string }; Returns: Json }
      get_resend_domain_breakdown: {
        Args: { p_window?: string }
        Returns: Json
      }
      get_shot_data_quality: { Args: never; Returns: Json }
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
      golf_normalize_name: { Args: { p: string }; Returns: string }
      has_baseball_staff_capability: {
        Args: { p_capability: string; p_team_id: string }
        Returns: boolean
      }
      heartbeat: { Args: never; Returns: undefined }
      helm_lifting_accept_invite: { Args: { p_token: string }; Returns: Json }
      helm_lifting_assign_team: {
        Args: {
          p_org: string
          p_sport: string
          p_team_id: string
          p_team_name?: string
        }
        Returns: string
      }
      helm_lifting_can_edit_org: { Args: { p_org: string }; Returns: boolean }
      helm_lifting_can_view_org: {
        Args: { p_org: string; p_sport: string }
        Returns: boolean
      }
      helm_lifting_coach_for_org: { Args: { p_org: string }; Returns: boolean }
      helm_lifting_is_head_coach_viewer: {
        Args: { p_org: string }
        Returns: boolean
      }
      helm_lifting_is_my_athlete: {
        Args: { p_athlete: string }
        Returns: boolean
      }
      helm_lifting_sync_org_athletes: {
        Args: { p_org: string; p_sport: string; p_team_id: string }
        Returns: number
      }
      hypopg_reset: { Args: never; Returns: undefined }
      ingest_external_round_atomic: {
        Args: { p_holes: Json; p_round: Json; p_shots: Json }
        Returns: Json
      }
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
      is_baseball_team_staff: { Args: { p_team_id: string }; Returns: boolean }
      is_golf_team_coach: { Args: { team_uuid: string }; Returns: boolean }
      is_golf_team_head_coach: { Args: { team_uuid: string }; Returns: boolean }
      is_golf_team_player: { Args: { team_uuid: string }; Returns: boolean }
      is_golf_team_primary_coach: {
        Args: { team_uuid: string }
        Returns: boolean
      }
      is_in_team: { Args: { team_uuid: string }; Returns: boolean }
      is_team_coach: { Args: { team_uuid: string }; Returns: boolean }
      is_team_player: { Args: { team_uuid: string }; Returns: boolean }
      is_user_on_team: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: boolean
      }
      mark_player_stats_stale: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      mark_task_reminder_sent: { Args: { p_task_id: string }; Returns: boolean }
      prune_stale_player_standing: {
        Args: { p_cutoff: string; p_team_ids: string[] }
        Returns: number
      }
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
      recompute_golf_round_totals: {
        Args: { p_round_id: string }
        Returns: undefined
      }
      recompute_team_sg: { Args: { p_team_id: string }; Returns: undefined }
      refresh_crm_coach_engagement: { Args: never; Returns: undefined }
      refresh_player_standing: {
        Args: { p_team_ids: string[] }
        Returns: {
          metric_id: string
          rows_upserted: number
        }[]
      }
      refresh_player_standing_round_metrics: {
        Args: { p_team_ids: string[] }
        Returns: {
          out_metric_id: string
          out_rows_upserted: number
        }[]
      }
      refresh_player_standing_shot_metrics: {
        Args: { p_team_ids: string[] }
        Returns: {
          out_metric_id: string
          out_rows_upserted: number
        }[]
      }
      refresh_player_stats_cache: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      release_baseball_team_invitation_redemption: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      save_baseball_full_box_score: {
        Args: {
          p_batting: Json
          p_game_id: string
          p_opponent_score: number
          p_our_score: number
          p_pitching: Json
        }
        Returns: Json
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
      select_stalest_teams: {
        Args: { p_limit: number }
        Returns: {
          team_id: string
        }[]
      }
      sg_baseline_scale: { Args: { p_key: string }; Returns: number }
      sg_estimate_from_holes: {
        Args: { p_round_id: string }
        Returns: {
          sg_approach: number
          sg_around_green: number
          sg_off_tee: number
          sg_putting: number
        }[]
      }
      sg_expected_strokes:
        | { Args: { p_distance_yards: number; p_lie: string }; Returns: number }
        | {
            Args: { p_distance_yards: number; p_lie: string; p_scale?: number }
            Returns: number
          }
      sg_normalize_lie: { Args: { p_lie: string }; Returns: string }
      sg_scale_for_player: { Args: { p_player_id: string }; Returns: number }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
      try_redeem_baseball_team_invitation: {
        Args: { p_invitation_id: string }
        Returns: boolean
      }
      update_player_distance_proximity: {
        Args: { p_player_id: string }
        Returns: undefined
      }
      update_player_putt_make_pct: {
        Args: { p_player_id: string }
        Returns: undefined
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
      verify_coach_owns_player: {
        Args: { p_player_id: string; p_user_id: string }
        Returns: boolean
      }
      verify_coach_owns_team: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      admin_event_severity: "info" | "warning" | "error" | "critical"
      baseball_coach_type: "college" | "juco" | "high_school" | "showcase"
      baseball_note_scope:
        | "staff_public"
        | "coach_group"
        | "strength"
        | "academic"
        | "player_visible"
        | "hidden_from_player"
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
      email_status:
        | "valid"
        | "bounced"
        | "complained"
        | "unknown"
        | "unsubscribed"
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
      ncaa_division:
        | "D2"
        | "D3"
        | "D1"
        | "NAIA"
        | "JUCO"
        | "JUCO_D1"
        | "JUCO_D2"
        | "JUCO_D3"
        | "CCCAA"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_event_severity: ["info", "warning", "error", "critical"],
      baseball_coach_type: ["college", "juco", "high_school", "showcase"],
      baseball_note_scope: [
        "staff_public",
        "coach_group",
        "strength",
        "academic",
        "player_visible",
        "hidden_from_player",
      ],
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
      email_status: [
        "valid",
        "bounced",
        "complained",
        "unknown",
        "unsubscribed",
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
      ncaa_division: [
        "D2",
        "D3",
        "D1",
        "NAIA",
        "JUCO",
        "JUCO_D1",
        "JUCO_D2",
        "JUCO_D3",
        "CCCAA",
      ],
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
