export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      advantage_holders: {
        Row: {
          advantage_id: string;
          created_at: string;
          from_day: number | null;
          id: string;
          is_original: boolean;
          ordinal: number;
          published_at: string | null;
          season_contestant_id: string;
          source_document_id: string | null;
          to_day: number | null;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          advantage_id: string;
          created_at?: string;
          from_day?: number | null;
          id?: string;
          is_original?: boolean;
          ordinal?: number;
          published_at?: string | null;
          season_contestant_id: string;
          source_document_id?: string | null;
          to_day?: number | null;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          advantage_id?: string;
          created_at?: string;
          from_day?: number | null;
          id?: string;
          is_original?: boolean;
          ordinal?: number;
          published_at?: string | null;
          season_contestant_id?: string;
          source_document_id?: string | null;
          to_day?: number | null;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'advantage_holders_advantage_id_fkey';
            columns: ['advantage_id'];
            isOneToOne: false;
            referencedRelation: 'advantages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'advantage_holders_season_contestant_id_fkey';
            columns: ['season_contestant_id'];
            isOneToOne: false;
            referencedRelation: 'season_contestants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'advantage_holders_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      advantages: {
        Row: {
          annulled_votes: number | null;
          annulled_votes_total: number | null;
          created_at: string;
          effect: string | null;
          found_day: number | null;
          id: string;
          kind: Database['public']['Enums']['advantage_kind'];
          label: string | null;
          natural_key: string | null;
          played_day: number | null;
          played_episode_id: string | null;
          published_at: string | null;
          season_id: string;
          source_document_id: string | null;
          status: string | null;
          updated_at: string;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          annulled_votes?: number | null;
          annulled_votes_total?: number | null;
          created_at?: string;
          effect?: string | null;
          found_day?: number | null;
          id?: string;
          kind: Database['public']['Enums']['advantage_kind'];
          label?: string | null;
          natural_key?: string | null;
          played_day?: number | null;
          played_episode_id?: string | null;
          published_at?: string | null;
          season_id: string;
          source_document_id?: string | null;
          status?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          annulled_votes?: number | null;
          annulled_votes_total?: number | null;
          created_at?: string;
          effect?: string | null;
          found_day?: number | null;
          id?: string;
          kind?: Database['public']['Enums']['advantage_kind'];
          label?: string | null;
          natural_key?: string | null;
          played_day?: number | null;
          played_episode_id?: string | null;
          published_at?: string | null;
          season_id?: string;
          source_document_id?: string | null;
          status?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'advantages_played_episode_id_fkey';
            columns: ['played_episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'advantages_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'advantages_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: number;
          occurred_at: string;
          summary: string | null;
          target_id: string | null;
          target_type: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          occurred_at?: string;
          summary?: string | null;
          target_id?: string | null;
          target_type?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          occurred_at?: string;
          summary?: string | null;
          target_id?: string | null;
          target_type?: string | null;
        };
        Relationships: [];
      };
      challenge_results: {
        Row: {
          challenge_id: string;
          created_at: string;
          id: string;
          is_winner: boolean;
          notes: string | null;
          pair_id: string | null;
          published_at: string | null;
          rank: number | null;
          reward: string | null;
          season_contestant_id: string | null;
          source_document_id: string | null;
          team_id: string | null;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          challenge_id: string;
          created_at?: string;
          id?: string;
          is_winner?: boolean;
          notes?: string | null;
          pair_id?: string | null;
          published_at?: string | null;
          rank?: number | null;
          reward?: string | null;
          season_contestant_id?: string | null;
          source_document_id?: string | null;
          team_id?: string | null;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          challenge_id?: string;
          created_at?: string;
          id?: string;
          is_winner?: boolean;
          notes?: string | null;
          pair_id?: string | null;
          published_at?: string | null;
          rank?: number | null;
          reward?: string | null;
          season_contestant_id?: string | null;
          source_document_id?: string | null;
          team_id?: string | null;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_results_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'challenges';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_results_pair_id_fkey';
            columns: ['pair_id'];
            isOneToOne: false;
            referencedRelation: 'pairs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_results_season_contestant_id_fkey';
            columns: ['season_contestant_id'];
            isOneToOne: false;
            referencedRelation: 'season_contestants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_results_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_results_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      challenges: {
        Row: {
          created_at: string;
          episode_id: string;
          format: Database['public']['Enums']['challenge_format'];
          id: string;
          kind: Database['public']['Enums']['challenge_kind'];
          name: string | null;
          ordinal: number;
          published_at: string | null;
          reward: string | null;
          source_document_id: string | null;
          updated_at: string;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          created_at?: string;
          episode_id: string;
          format?: Database['public']['Enums']['challenge_format'];
          id?: string;
          kind: Database['public']['Enums']['challenge_kind'];
          name?: string | null;
          ordinal?: number;
          published_at?: string | null;
          reward?: string | null;
          source_document_id?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          created_at?: string;
          episode_id?: string;
          format?: Database['public']['Enums']['challenge_format'];
          id?: string;
          kind?: Database['public']['Enums']['challenge_kind'];
          name?: string | null;
          ordinal?: number;
          published_at?: string | null;
          reward?: string | null;
          source_document_id?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'challenges_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenges_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      contestant_previous_seasons: {
        Row: {
          id: string;
          label: string;
          ordinal: number;
          season_contestant_id: string;
          season_id: string | null;
        };
        Insert: {
          id?: string;
          label: string;
          ordinal?: number;
          season_contestant_id: string;
          season_id?: string | null;
        };
        Update: {
          id?: string;
          label?: string;
          ordinal?: number;
          season_contestant_id?: string;
          season_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contestant_previous_seasons_season_contestant_id_fkey';
            columns: ['season_contestant_id'];
            isOneToOne: false;
            referencedRelation: 'season_contestants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contestant_previous_seasons_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      contestants: {
        Row: {
          created_at: string;
          display_name: string;
          gender: string | null;
          id: string;
          published_at: string | null;
          slug: string;
          source_document_id: string | null;
          updated_at: string;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          created_at?: string;
          display_name: string;
          gender?: string | null;
          id?: string;
          published_at?: string | null;
          slug: string;
          source_document_id?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          created_at?: string;
          display_name?: string;
          gender?: string | null;
          id?: string;
          published_at?: string | null;
          slug?: string;
          source_document_id?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'contestants_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      council_rounds: {
        Row: {
          council_id: string;
          created_at: string;
          id: string;
          notes: string | null;
          outcome: Database['public']['Enums']['council_round_outcome'];
          published_at: string | null;
          reported_votes_for: number | null;
          reported_votes_total: number | null;
          round_number: number;
          source_document_id: string | null;
          validation_status: Database['public']['Enums']['validation_status'];
          votes_complete: boolean;
        };
        Insert: {
          council_id: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          outcome?: Database['public']['Enums']['council_round_outcome'];
          published_at?: string | null;
          reported_votes_for?: number | null;
          reported_votes_total?: number | null;
          round_number?: number;
          source_document_id?: string | null;
          validation_status?: Database['public']['Enums']['validation_status'];
          votes_complete?: boolean;
        };
        Update: {
          council_id?: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          outcome?: Database['public']['Enums']['council_round_outcome'];
          published_at?: string | null;
          reported_votes_for?: number | null;
          reported_votes_total?: number | null;
          round_number?: number;
          source_document_id?: string | null;
          validation_status?: Database['public']['Enums']['validation_status'];
          votes_complete?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'council_rounds_council_id_fkey';
            columns: ['council_id'];
            isOneToOne: false;
            referencedRelation: 'councils';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'council_rounds_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      council_votes: {
        Row: {
          created_at: string;
          did_not_vote: boolean;
          id: string;
          is_annulled: boolean;
          notes: string | null;
          published_at: string | null;
          round_id: string;
          source_document_id: string | null;
          target_id: string | null;
          validation_status: Database['public']['Enums']['validation_status'];
          voter_id: string;
        };
        Insert: {
          created_at?: string;
          did_not_vote?: boolean;
          id?: string;
          is_annulled?: boolean;
          notes?: string | null;
          published_at?: string | null;
          round_id: string;
          source_document_id?: string | null;
          target_id?: string | null;
          validation_status?: Database['public']['Enums']['validation_status'];
          voter_id: string;
        };
        Update: {
          created_at?: string;
          did_not_vote?: boolean;
          id?: string;
          is_annulled?: boolean;
          notes?: string | null;
          published_at?: string | null;
          round_id?: string;
          source_document_id?: string | null;
          target_id?: string | null;
          validation_status?: Database['public']['Enums']['validation_status'];
          voter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'council_votes_round_id_fkey';
            columns: ['round_id'];
            isOneToOne: false;
            referencedRelation: 'council_rounds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'council_votes_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'council_votes_target_id_fkey';
            columns: ['target_id'];
            isOneToOne: false;
            referencedRelation: 'season_contestants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'council_votes_voter_id_fkey';
            columns: ['voter_id'];
            isOneToOne: false;
            referencedRelation: 'season_contestants';
            referencedColumns: ['id'];
          },
        ];
      };
      councils: {
        Row: {
          created_at: string;
          day: number | null;
          episode_id: string;
          host_present: boolean | null;
          id: string;
          notes: string | null;
          ordinal: number;
          published_at: string | null;
          source_document_id: string | null;
          updated_at: string;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          created_at?: string;
          day?: number | null;
          episode_id: string;
          host_present?: boolean | null;
          id?: string;
          notes?: string | null;
          ordinal?: number;
          published_at?: string | null;
          source_document_id?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          created_at?: string;
          day?: number | null;
          episode_id?: string;
          host_present?: boolean | null;
          id?: string;
          notes?: string | null;
          ordinal?: number;
          published_at?: string | null;
          source_document_id?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'councils_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'councils_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      departures: {
        Row: {
          caused_by_departure_id: string | null;
          council_id: string | null;
          created_at: string;
          day: number | null;
          episode_id: string | null;
          id: string;
          kind: Database['public']['Enums']['departure_kind'];
          ordinal: number | null;
          published_at: string | null;
          reason: string | null;
          round_id: string | null;
          season_contestant_id: string;
          source_document_id: string | null;
          updated_at: string;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          caused_by_departure_id?: string | null;
          council_id?: string | null;
          created_at?: string;
          day?: number | null;
          episode_id?: string | null;
          id?: string;
          kind: Database['public']['Enums']['departure_kind'];
          ordinal?: number | null;
          published_at?: string | null;
          reason?: string | null;
          round_id?: string | null;
          season_contestant_id: string;
          source_document_id?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          caused_by_departure_id?: string | null;
          council_id?: string | null;
          created_at?: string;
          day?: number | null;
          episode_id?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['departure_kind'];
          ordinal?: number | null;
          published_at?: string | null;
          reason?: string | null;
          round_id?: string | null;
          season_contestant_id?: string;
          source_document_id?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'departures_caused_by_departure_id_fkey';
            columns: ['caused_by_departure_id'];
            isOneToOne: false;
            referencedRelation: 'departures';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'departures_council_id_fkey';
            columns: ['council_id'];
            isOneToOne: false;
            referencedRelation: 'councils';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'departures_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'departures_round_id_fkey';
            columns: ['round_id'];
            isOneToOne: false;
            referencedRelation: 'council_rounds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'departures_season_contestant_id_fkey';
            columns: ['season_contestant_id'];
            isOneToOne: true;
            referencedRelation: 'season_contestants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'departures_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      episodes: {
        Row: {
          air_date: string | null;
          created_at: string;
          day_end: number | null;
          day_start: number | null;
          id: string;
          number: number;
          published_at: string | null;
          season_id: string;
          source_document_id: string | null;
          summary: string | null;
          title: string | null;
          updated_at: string;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          air_date?: string | null;
          created_at?: string;
          day_end?: number | null;
          day_start?: number | null;
          id?: string;
          number: number;
          published_at?: string | null;
          season_id: string;
          source_document_id?: string | null;
          summary?: string | null;
          title?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          air_date?: string | null;
          created_at?: string;
          day_end?: number | null;
          day_start?: number | null;
          id?: string;
          number?: number;
          published_at?: string | null;
          season_id?: string;
          source_document_id?: string | null;
          summary?: string | null;
          title?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'episodes_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'episodes_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      import_differences: {
        Row: {
          after_value: Json | null;
          before_value: Json | null;
          changed_fields: string[];
          class: Database['public']['Enums']['difference_class'];
          created_at: string;
          entity: Database['public']['Enums']['referential_entity'];
          id: string;
          natural_key: string;
          operation: Database['public']['Enums']['difference_operation'];
          publication_id: string | null;
          record_id: string | null;
          review_comment: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          run_id: string;
          status: Database['public']['Enums']['validation_status'];
          target_id: string | null;
        };
        Insert: {
          after_value?: Json | null;
          before_value?: Json | null;
          changed_fields?: string[];
          class?: Database['public']['Enums']['difference_class'];
          created_at?: string;
          entity: Database['public']['Enums']['referential_entity'];
          id?: string;
          natural_key: string;
          operation: Database['public']['Enums']['difference_operation'];
          publication_id?: string | null;
          record_id?: string | null;
          review_comment?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          run_id: string;
          status?: Database['public']['Enums']['validation_status'];
          target_id?: string | null;
        };
        Update: {
          after_value?: Json | null;
          before_value?: Json | null;
          changed_fields?: string[];
          class?: Database['public']['Enums']['difference_class'];
          created_at?: string;
          entity?: Database['public']['Enums']['referential_entity'];
          id?: string;
          natural_key?: string;
          operation?: Database['public']['Enums']['difference_operation'];
          publication_id?: string | null;
          record_id?: string | null;
          review_comment?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          run_id?: string;
          status?: Database['public']['Enums']['validation_status'];
          target_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'import_differences_publication_fkey';
            columns: ['publication_id'];
            isOneToOne: false;
            referencedRelation: 'publications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'import_differences_record_id_fkey';
            columns: ['record_id'];
            isOneToOne: false;
            referencedRelation: 'import_records';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'import_differences_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'import_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      import_policies: {
        Row: {
          auto_validate_retroactive: boolean;
          auto_validate_unambiguous: boolean;
          entity: Database['public']['Enums']['referential_entity'] | null;
          id: string;
          max_auto_changes: number;
          source_document_id: string;
          updated_at: string;
        };
        Insert: {
          auto_validate_retroactive?: boolean;
          auto_validate_unambiguous?: boolean;
          entity?: Database['public']['Enums']['referential_entity'] | null;
          id?: string;
          max_auto_changes?: number;
          source_document_id: string;
          updated_at?: string;
        };
        Update: {
          auto_validate_retroactive?: boolean;
          auto_validate_unambiguous?: boolean;
          entity?: Database['public']['Enums']['referential_entity'] | null;
          id?: string;
          max_auto_changes?: number;
          source_document_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'import_policies_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      import_records: {
        Row: {
          anomalies: string[];
          created_at: string;
          entity: Database['public']['Enums']['referential_entity'];
          id: string;
          natural_key: string;
          payload: Json;
          raw_excerpt: string | null;
          run_id: string;
          source_section: string | null;
        };
        Insert: {
          anomalies?: string[];
          created_at?: string;
          entity: Database['public']['Enums']['referential_entity'];
          id?: string;
          natural_key: string;
          payload: Json;
          raw_excerpt?: string | null;
          run_id: string;
          source_section?: string | null;
        };
        Update: {
          anomalies?: string[];
          created_at?: string;
          entity?: Database['public']['Enums']['referential_entity'];
          id?: string;
          natural_key?: string;
          payload?: Json;
          raw_excerpt?: string | null;
          run_id?: string;
          source_section?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'import_records_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'import_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      import_runs: {
        Row: {
          differences_ambiguous: number;
          differences_total: number;
          error_message: string | null;
          extract_hash: string | null;
          extractor_version: string | null;
          finished_at: string | null;
          http_status: number | null;
          id: string;
          notes: string | null;
          source_document_id: string;
          source_revision: string | null;
          source_revision_at: string | null;
          started_at: string;
          status: Database['public']['Enums']['import_run_status'];
          trigger: Database['public']['Enums']['import_trigger'];
          triggered_by: string | null;
        };
        Insert: {
          differences_ambiguous?: number;
          differences_total?: number;
          error_message?: string | null;
          extract_hash?: string | null;
          extractor_version?: string | null;
          finished_at?: string | null;
          http_status?: number | null;
          id?: string;
          notes?: string | null;
          source_document_id: string;
          source_revision?: string | null;
          source_revision_at?: string | null;
          started_at?: string;
          status?: Database['public']['Enums']['import_run_status'];
          trigger?: Database['public']['Enums']['import_trigger'];
          triggered_by?: string | null;
        };
        Update: {
          differences_ambiguous?: number;
          differences_total?: number;
          error_message?: string | null;
          extract_hash?: string | null;
          extractor_version?: string | null;
          finished_at?: string | null;
          http_status?: number | null;
          id?: string;
          notes?: string | null;
          source_document_id?: string;
          source_revision?: string | null;
          source_revision_at?: string | null;
          started_at?: string;
          status?: Database['public']['Enums']['import_run_status'];
          trigger?: Database['public']['Enums']['import_trigger'];
          triggered_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'import_runs_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      keep_alive: {
        Row: {
          id: number;
          pinged_at: string;
        };
        Insert: {
          id?: never;
          pinged_at?: string;
        };
        Update: {
          id?: never;
          pinged_at?: string;
        };
        Relationships: [];
      };
      pairs: {
        Row: {
          created_at: string;
          dissolved_episode_number: number | null;
          formed_episode_number: number | null;
          id: string;
          label: string | null;
          member_a_id: string;
          member_b_id: string;
          published_at: string | null;
          season_id: string;
          source_document_id: string | null;
          updated_at: string;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          created_at?: string;
          dissolved_episode_number?: number | null;
          formed_episode_number?: number | null;
          id?: string;
          label?: string | null;
          member_a_id: string;
          member_b_id: string;
          published_at?: string | null;
          season_id: string;
          source_document_id?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          created_at?: string;
          dissolved_episode_number?: number | null;
          formed_episode_number?: number | null;
          id?: string;
          label?: string | null;
          member_a_id?: string;
          member_b_id?: string;
          published_at?: string | null;
          season_id?: string;
          source_document_id?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'pairs_member_a_id_fkey';
            columns: ['member_a_id'];
            isOneToOne: false;
            referencedRelation: 'season_contestants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pairs_member_b_id_fkey';
            columns: ['member_b_id'];
            isOneToOne: false;
            referencedRelation: 'season_contestants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pairs_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pairs_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      personal_notes: {
        Row: {
          body: string;
          challenge_id: string | null;
          council_id: string | null;
          created_at: string;
          deleted_at: string | null;
          departure_id: string | null;
          episode_id: string | null;
          id: string;
          is_draft: boolean;
          is_pinned: boolean;
          rating: number | null;
          season_contestant_id: string | null;
          season_id: string | null;
          shared_at: string | null;
          tags: string[];
          team_id: string | null;
          title: string | null;
          updated_at: string;
          user_id: string;
          visibility: Database['public']['Enums']['visibility_level'];
        };
        Insert: {
          body?: string;
          challenge_id?: string | null;
          council_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          departure_id?: string | null;
          episode_id?: string | null;
          id?: string;
          is_draft?: boolean;
          is_pinned?: boolean;
          rating?: number | null;
          season_contestant_id?: string | null;
          season_id?: string | null;
          shared_at?: string | null;
          tags?: string[];
          team_id?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id: string;
          visibility?: Database['public']['Enums']['visibility_level'];
        };
        Update: {
          body?: string;
          challenge_id?: string | null;
          council_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          departure_id?: string | null;
          episode_id?: string | null;
          id?: string;
          is_draft?: boolean;
          is_pinned?: boolean;
          rating?: number | null;
          season_contestant_id?: string | null;
          season_id?: string | null;
          shared_at?: string | null;
          tags?: string[];
          team_id?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
          visibility?: Database['public']['Enums']['visibility_level'];
        };
        Relationships: [
          {
            foreignKeyName: 'personal_notes_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'challenges';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_notes_council_id_fkey';
            columns: ['council_id'];
            isOneToOne: false;
            referencedRelation: 'councils';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_notes_departure_id_fkey';
            columns: ['departure_id'];
            isOneToOne: false;
            referencedRelation: 'departures';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_notes_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_notes_season_contestant_id_fkey';
            columns: ['season_contestant_id'];
            isOneToOne: false;
            referencedRelation: 'season_contestants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_notes_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_notes_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          accent_colour: string | null;
          avatar_seed: string | null;
          avatar_style: string;
          avatar_url: string | null;
          banner_style: string | null;
          bio: string | null;
          created_at: string;
          id: string;
          pseudonym: string;
          public_handle: string | null;
          show_favorites: boolean;
          show_notes: boolean;
          show_stats: boolean;
          theme: string;
          updated_at: string;
          visibility: Database['public']['Enums']['visibility_level'];
        };
        Insert: {
          accent_colour?: string | null;
          avatar_seed?: string | null;
          avatar_style?: string;
          avatar_url?: string | null;
          banner_style?: string | null;
          bio?: string | null;
          created_at?: string;
          id: string;
          pseudonym: string;
          public_handle?: string | null;
          show_favorites?: boolean;
          show_notes?: boolean;
          show_stats?: boolean;
          theme?: string;
          updated_at?: string;
          visibility?: Database['public']['Enums']['visibility_level'];
        };
        Update: {
          accent_colour?: string | null;
          avatar_seed?: string | null;
          avatar_style?: string;
          avatar_url?: string | null;
          banner_style?: string | null;
          bio?: string | null;
          created_at?: string;
          id?: string;
          pseudonym?: string;
          public_handle?: string | null;
          show_favorites?: boolean;
          show_notes?: boolean;
          show_stats?: boolean;
          theme?: string;
          updated_at?: string;
          visibility?: Database['public']['Enums']['visibility_level'];
        };
        Relationships: [];
      };
      publications: {
        Row: {
          differences_applied: number;
          id: string;
          notes: string | null;
          published_at: string;
          published_by: string | null;
          rang: number;
          revert_reason: string | null;
          reverted_at: string | null;
          reverted_by: string | null;
          rollback_snapshot: Json;
          run_id: string;
        };
        Insert: {
          differences_applied?: number;
          id?: string;
          notes?: string | null;
          published_at?: string;
          published_by?: string | null;
          rang?: number;
          revert_reason?: string | null;
          reverted_at?: string | null;
          reverted_by?: string | null;
          rollback_snapshot?: Json;
          run_id: string;
        };
        Update: {
          differences_applied?: number;
          id?: string;
          notes?: string | null;
          published_at?: string;
          published_by?: string | null;
          rang?: number;
          revert_reason?: string | null;
          reverted_at?: string | null;
          reverted_by?: string | null;
          rollback_snapshot?: Json;
          run_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'publications_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'import_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      reference_sources: {
        Row: {
          api_url: string | null;
          base_url: string;
          created_at: string;
          id: string;
          label: string;
          notes: string | null;
          terms_url: string | null;
        };
        Insert: {
          api_url?: string | null;
          base_url: string;
          created_at?: string;
          id: string;
          label: string;
          notes?: string | null;
          terms_url?: string | null;
        };
        Update: {
          api_url?: string | null;
          base_url?: string;
          created_at?: string;
          id?: string;
          label?: string;
          notes?: string | null;
          terms_url?: string | null;
        };
        Relationships: [];
      };
      referential_versions: {
        Row: {
          created_at: string;
          id: number;
          publication_id: string | null;
          season_id: string | null;
          summary: string | null;
        };
        Insert: {
          created_at?: string;
          id?: never;
          publication_id?: string | null;
          season_id?: string | null;
          summary?: string | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          publication_id?: string | null;
          season_id?: string | null;
          summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'referential_versions_publication_id_fkey';
            columns: ['publication_id'];
            isOneToOne: false;
            referencedRelation: 'publications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'referential_versions_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      reinstatements: {
        Row: {
          created_at: string;
          day: number | null;
          departure_id: string;
          episode_id: string | null;
          id: string;
          published_at: string | null;
          reason: string | null;
          source_document_id: string | null;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          created_at?: string;
          day?: number | null;
          departure_id: string;
          episode_id?: string | null;
          id?: string;
          published_at?: string | null;
          reason?: string | null;
          source_document_id?: string | null;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          created_at?: string;
          day?: number | null;
          departure_id?: string;
          episode_id?: string | null;
          id?: string;
          published_at?: string | null;
          reason?: string | null;
          source_document_id?: string | null;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'reinstatements_departure_id_fkey';
            columns: ['departure_id'];
            isOneToOne: false;
            referencedRelation: 'departures';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reinstatements_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reinstatements_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      reserved_handles: {
        Row: {
          created_at: string;
          handle: string;
          reason: string | null;
        };
        Insert: {
          created_at?: string;
          handle: string;
          reason?: string | null;
        };
        Update: {
          created_at?: string;
          handle?: string;
          reason?: string | null;
        };
        Relationships: [];
      };
      season_contestants: {
        Row: {
          age_at_season: number | null;
          contestant_id: string;
          created_at: string;
          display_name: string;
          final_jury: boolean | null;
          id: string;
          published_at: string | null;
          season_id: string;
          source_document_id: string | null;
          updated_at: string;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          age_at_season?: number | null;
          contestant_id: string;
          created_at?: string;
          display_name: string;
          final_jury?: boolean | null;
          id?: string;
          published_at?: string | null;
          season_id: string;
          source_document_id?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          age_at_season?: number | null;
          contestant_id?: string;
          created_at?: string;
          display_name?: string;
          final_jury?: boolean | null;
          id?: string;
          published_at?: string | null;
          season_id?: string;
          source_document_id?: string | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'season_contestants_contestant_id_fkey';
            columns: ['contestant_id'];
            isOneToOne: false;
            referencedRelation: 'contestants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'season_contestants_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'season_contestants_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      season_rules: {
        Row: {
          created_at: string;
          description: string | null;
          from_episode_number: number | null;
          id: string;
          kind: Database['public']['Enums']['season_rule_kind'];
          label: string;
          parameters: Json;
          published_at: string | null;
          season_id: string;
          source_document_id: string | null;
          to_episode_number: number | null;
          updated_at: string;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          from_episode_number?: number | null;
          id?: string;
          kind: Database['public']['Enums']['season_rule_kind'];
          label: string;
          parameters?: Json;
          published_at?: string | null;
          season_id: string;
          source_document_id?: string | null;
          to_episode_number?: number | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          created_at?: string;
          description?: string | null;
          from_episode_number?: number | null;
          id?: string;
          kind?: Database['public']['Enums']['season_rule_kind'];
          label?: string;
          parameters?: Json;
          published_at?: string | null;
          season_id?: string;
          source_document_id?: string | null;
          to_episode_number?: number | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'season_rules_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'season_rules_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      seasons: {
        Row: {
          contestant_count: number | null;
          created_at: string;
          edition_label: string | null;
          first_air_date: string | null;
          id: string;
          last_air_date: string | null;
          location_lat: number | null;
          location_lon: number | null;
          location_name: string | null;
          location_page_title: string | null;
          name: string;
          published_at: string | null;
          slug: string;
          source_document_id: string | null;
          status: Database['public']['Enums']['season_status'];
          updated_at: string;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          contestant_count?: number | null;
          created_at?: string;
          edition_label?: string | null;
          first_air_date?: string | null;
          id?: string;
          last_air_date?: string | null;
          location_lat?: number | null;
          location_lon?: number | null;
          location_name?: string | null;
          location_page_title?: string | null;
          name: string;
          published_at?: string | null;
          slug: string;
          source_document_id?: string | null;
          status?: Database['public']['Enums']['season_status'];
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          contestant_count?: number | null;
          created_at?: string;
          edition_label?: string | null;
          first_air_date?: string | null;
          id?: string;
          last_air_date?: string | null;
          location_lat?: number | null;
          location_lon?: number | null;
          location_name?: string | null;
          location_page_title?: string | null;
          name?: string;
          published_at?: string | null;
          slug?: string;
          source_document_id?: string | null;
          status?: Database['public']['Enums']['season_status'];
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'seasons_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      share_links: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          label: string | null;
          last_viewed_at: string | null;
          note_id: string | null;
          owner_id: string;
          revoked_at: string | null;
          scope: Database['public']['Enums']['share_scope'];
          season_id: string | null;
          token: string;
          view_count: number;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          label?: string | null;
          last_viewed_at?: string | null;
          note_id?: string | null;
          owner_id: string;
          revoked_at?: string | null;
          scope: Database['public']['Enums']['share_scope'];
          season_id?: string | null;
          token?: string;
          view_count?: number;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          label?: string | null;
          last_viewed_at?: string | null;
          note_id?: string | null;
          owner_id?: string;
          revoked_at?: string | null;
          scope?: Database['public']['Enums']['share_scope'];
          season_id?: string | null;
          token?: string;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'share_links_note_id_fkey';
            columns: ['note_id'];
            isOneToOne: false;
            referencedRelation: 'personal_notes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'share_links_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      source_documents: {
        Row: {
          created_at: string;
          external_id: string | null;
          id: string;
          last_seen_at: string | null;
          last_seen_revision: string | null;
          source_id: string;
          title: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          external_id?: string | null;
          id?: string;
          last_seen_at?: string | null;
          last_seen_revision?: string | null;
          source_id: string;
          title: string;
          url: string;
        };
        Update: {
          created_at?: string;
          external_id?: string | null;
          id?: string;
          last_seen_at?: string | null;
          last_seen_revision?: string | null;
          source_id?: string;
          title?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'source_documents_source_id_fkey';
            columns: ['source_id'];
            isOneToOne: false;
            referencedRelation: 'reference_sources';
            referencedColumns: ['id'];
          },
        ];
      };
      team_memberships: {
        Row: {
          created_at: string;
          from_day: number | null;
          from_episode_number: number | null;
          id: string;
          published_at: string | null;
          season_contestant_id: string;
          source_document_id: string | null;
          team_id: string;
          to_day: number | null;
          to_episode_number: number | null;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          created_at?: string;
          from_day?: number | null;
          from_episode_number?: number | null;
          id?: string;
          published_at?: string | null;
          season_contestant_id: string;
          source_document_id?: string | null;
          team_id: string;
          to_day?: number | null;
          to_episode_number?: number | null;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          created_at?: string;
          from_day?: number | null;
          from_episode_number?: number | null;
          id?: string;
          published_at?: string | null;
          season_contestant_id?: string;
          source_document_id?: string | null;
          team_id?: string;
          to_day?: number | null;
          to_episode_number?: number | null;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'team_memberships_season_contestant_id_fkey';
            columns: ['season_contestant_id'];
            isOneToOne: false;
            referencedRelation: 'season_contestants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_memberships_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_memberships_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      teams: {
        Row: {
          colour: string | null;
          created_at: string;
          from_episode_number: number | null;
          id: string;
          kind: Database['public']['Enums']['team_kind'];
          name: string;
          published_at: string | null;
          season_id: string;
          source_document_id: string | null;
          to_episode_number: number | null;
          updated_at: string;
          validation_status: Database['public']['Enums']['validation_status'];
        };
        Insert: {
          colour?: string | null;
          created_at?: string;
          from_episode_number?: number | null;
          id?: string;
          kind?: Database['public']['Enums']['team_kind'];
          name: string;
          published_at?: string | null;
          season_id: string;
          source_document_id?: string | null;
          to_episode_number?: number | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Update: {
          colour?: string | null;
          created_at?: string;
          from_episode_number?: number | null;
          id?: string;
          kind?: Database['public']['Enums']['team_kind'];
          name?: string;
          published_at?: string | null;
          season_id?: string;
          source_document_id?: string | null;
          to_episode_number?: number | null;
          updated_at?: string;
          validation_status?: Database['public']['Enums']['validation_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'teams_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teams_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      user_favorites: {
        Row: {
          created_at: string;
          season_contestant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          season_contestant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          season_contestant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_favorites_season_contestant_id_fkey';
            columns: ['season_contestant_id'];
            isOneToOne: false;
            referencedRelation: 'season_contestants';
            referencedColumns: ['id'];
          },
        ];
      };
      user_preferences: {
        Row: {
          analytics_consent_at: string | null;
          animations_enabled: boolean;
          created_at: string;
          default_season_id: string | null;
          locale: string;
          public_sharing_consent_at: string | null;
          reduce_motion: boolean;
          spoiler: Database['public']['Enums']['spoiler_mode'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          analytics_consent_at?: string | null;
          animations_enabled?: boolean;
          created_at?: string;
          default_season_id?: string | null;
          locale?: string;
          public_sharing_consent_at?: string | null;
          reduce_motion?: boolean;
          spoiler?: Database['public']['Enums']['spoiler_mode'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          analytics_consent_at?: string | null;
          animations_enabled?: boolean;
          created_at?: string;
          default_season_id?: string | null;
          locale?: string;
          public_sharing_consent_at?: string | null;
          reduce_motion?: boolean;
          spoiler?: Database['public']['Enums']['spoiler_mode'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_preferences_default_season_id_fkey';
            columns: ['default_season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      user_ratings: {
        Row: {
          created_at: string;
          episode_id: string | null;
          rating: number;
          season_contestant_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          episode_id?: string | null;
          rating: number;
          season_contestant_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          episode_id?: string | null;
          rating?: number;
          season_contestant_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_ratings_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_ratings_season_contestant_id_fkey';
            columns: ['season_contestant_id'];
            isOneToOne: false;
            referencedRelation: 'season_contestants';
            referencedColumns: ['id'];
          },
        ];
      };
      user_roles: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          role: Database['public']['Enums']['app_role'];
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          role: Database['public']['Enums']['app_role'];
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          role?: Database['public']['Enums']['app_role'];
          user_id?: string;
        };
        Relationships: [];
      };
      watched_episodes: {
        Row: {
          episode_id: string;
          user_id: string;
          watched_at: string;
        };
        Insert: {
          episode_id: string;
          user_id: string;
          watched_at?: string;
        };
        Update: {
          episode_id?: string;
          user_id?: string;
          watched_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'watched_episodes_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      pg_all_foreign_keys: {
        Row: {
          fk_columns: unknown[] | null;
          fk_constraint_name: unknown;
          fk_schema_name: unknown;
          fk_table_name: unknown;
          fk_table_oid: unknown;
          is_deferrable: boolean | null;
          is_deferred: boolean | null;
          match_type: string | null;
          on_delete: string | null;
          on_update: string | null;
          pk_columns: unknown[] | null;
          pk_constraint_name: unknown;
          pk_index_name: unknown;
          pk_schema_name: unknown;
          pk_table_name: unknown;
          pk_table_oid: unknown;
        };
        Relationships: [];
      };
      public_import_status: {
        Row: {
          last_published_at: string | null;
          last_run_at: string | null;
          last_status: Database['public']['Enums']['import_run_status'] | null;
          pending_review_count: number | null;
          source_document_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'import_runs_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'source_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      tap_funky: {
        Row: {
          args: string | null;
          is_definer: boolean | null;
          is_strict: boolean | null;
          is_visible: boolean | null;
          kind: unknown;
          langoid: unknown;
          name: unknown;
          oid: unknown;
          owner: unknown;
          returns: string | null;
          returns_set: boolean | null;
          schema: unknown;
          volatility: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      _cleanup: { Args: never; Returns: boolean };
      _contract_on: { Args: { '': string }; Returns: unknown };
      _currtest: { Args: never; Returns: number };
      _db_privs: { Args: never; Returns: unknown[] };
      _extensions: { Args: never; Returns: unknown[] };
      _get: { Args: { '': string }; Returns: number };
      _get_latest: { Args: { '': string }; Returns: number[] };
      _get_note: { Args: { '': string }; Returns: string };
      _is_verbose: { Args: never; Returns: boolean };
      _prokind: { Args: { p_oid: unknown }; Returns: unknown };
      _query: { Args: { '': string }; Returns: string };
      _refine_vol: { Args: { '': string }; Returns: string };
      _retval: { Args: { '': string }; Returns: string };
      _table_privs: { Args: never; Returns: unknown[] };
      _temptypes: { Args: { '': string }; Returns: string };
      _todo: { Args: never; Returns: string };
      col_is_null:
        | {
            Args: {
              column_name: unknown;
              description?: string;
              schema_name: unknown;
              table_name: unknown;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: unknown;
              description?: string;
              table_name: unknown;
            };
            Returns: string;
          };
      col_not_null:
        | {
            Args: {
              column_name: unknown;
              description?: string;
              schema_name: unknown;
              table_name: unknown;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: unknown;
              description?: string;
              table_name: unknown;
            };
            Returns: string;
          };
      diag:
        | {
            Args: { msg: unknown };
            Returns: {
              error: true;
            } & 'Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved';
          }
        | {
            Args: { msg: string };
            Returns: {
              error: true;
            } & 'Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved';
          };
      diag_test_name: { Args: { '': string }; Returns: string };
      do_tap:
        | { Args: never; Returns: string[] }
        | { Args: { '': string }; Returns: string[] };
      export_my_data: { Args: never; Returns: Json };
      fail:
        | { Args: never; Returns: string }
        | { Args: { '': string }; Returns: string };
      findfuncs: { Args: { '': string }; Returns: string[] };
      finish: { Args: { exception_on_failure?: boolean }; Returns: string[] };
      format_type_string: { Args: { '': string }; Returns: string };
      generate_share_token: { Args: never; Returns: string };
      get_shared_note: {
        Args: { share_token: string };
        Returns: {
          author_handle: string;
          author_pseudonym: string;
          body: string;
          created_at: string;
          note_id: string;
          rating: number;
          tags: string[];
          title: string;
          updated_at: string;
        }[];
      };
      get_shared_profile: {
        Args: { share_token: string };
        Returns: {
          accent_colour: string;
          avatar_seed: string;
          avatar_style: string;
          banner_style: string;
          bio: string;
          pseudonym: string;
          public_handle: string;
          show_favorites: boolean;
          show_stats: boolean;
        }[];
      };
      handle_is_available: { Args: { candidate: string }; Returns: boolean };
      has_role: {
        Args: { wanted: Database['public']['Enums']['app_role'] };
        Returns: boolean;
      };
      has_unique: { Args: { '': string }; Returns: string };
      in_todo: { Args: never; Returns: boolean };
      is_empty: { Args: { '': string }; Returns: string };
      is_staff: { Args: never; Returns: boolean };
      isnt_empty: { Args: { '': string }; Returns: string };
      lives_ok: { Args: { '': string }; Returns: string };
      log_event: {
        Args: {
          p_action: string;
          p_summary: string;
          p_target_id: string;
          p_target_type: string;
        };
        Returns: undefined;
      };
      no_plan: { Args: never; Returns: boolean[] };
      num_failed: { Args: never; Returns: number };
      os_name: { Args: never; Returns: string };
      pass:
        | { Args: never; Returns: string }
        | { Args: { '': string }; Returns: string };
      pg_version: { Args: never; Returns: string };
      pg_version_num: { Args: never; Returns: number };
      pgtap_version: { Args: never; Returns: number };
      publish_run: {
        Args: { p_notes?: string; p_run_id: string };
        Returns: string;
      };
      publishable_table: { Args: { p_table: string }; Returns: boolean };
      restore_row: {
        Args: { p_before: Json; p_table: string };
        Returns: undefined;
      };
      revert_publication: {
        Args: { p_publication_id: string; p_reason: string };
        Returns: number;
      };
      review_difference: {
        Args: {
          comment_text?: string;
          decision: Database['public']['Enums']['validation_status'];
          difference_id: string;
        };
        Returns: undefined;
      };
      round_outcome: {
        Args: { p_kind: string };
        Returns: Database['public']['Enums']['council_round_outcome'];
      };
      row_snapshot: { Args: { p_id: string; p_table: string }; Returns: Json };
      runtests:
        | { Args: never; Returns: string[] }
        | { Args: { '': string }; Returns: string[] };
      skip:
        | { Args: { '': string }; Returns: string }
        | { Args: { how_many: number; why: string }; Returns: string };
      slugify_fr: { Args: { p_input: string }; Returns: string };
      team_kind_of: {
        Args: { p_name: string };
        Returns: Database['public']['Enums']['team_kind'];
      };
      throws_ok: { Args: { '': string }; Returns: string };
      todo:
        | { Args: { how_many: number }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
        | { Args: { why: string }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] };
      todo_end: { Args: never; Returns: boolean[] };
      todo_start:
        | { Args: never; Returns: boolean[] }
        | { Args: { '': string }; Returns: boolean[] };
    };
    Enums: {
      advantage_kind:
        'immunity_necklace' | 'vote_advantage' | 'comfort_advantage' | 'other';
      app_role: 'admin' | 'validator';
      challenge_format: 'individual' | 'team' | 'pair' | 'unknown';
      challenge_kind: 'comfort' | 'immunity' | 'combined' | 'other';
      council_round_outcome:
        'elimination' | 'tie' | 'annulled' | 'no_elimination' | 'unknown';
      departure_kind:
        | 'vote'
        | 'linked_pair'
        | 'quit'
        | 'medical'
        | 'banned'
        | 'jury_exit'
        | 'final_ranking'
        | 'other';
      difference_class:
        | 'unambiguous'
        | 'ambiguous'
        | 'retroactive'
        | 'conflicting'
        | 'suspicious';
      difference_operation: 'insert' | 'update' | 'delete';
      import_run_status:
        | 'running'
        | 'unchanged'
        | 'extracted'
        | 'diffed'
        | 'published'
        | 'failed'
        | 'reverted';
      import_trigger: 'manual' | 'scheduled' | 'backfill';
      referential_entity:
        | 'season'
        | 'season_rule'
        | 'contestant'
        | 'season_contestant'
        | 'team'
        | 'team_membership'
        | 'pair'
        | 'episode'
        | 'challenge'
        | 'challenge_result'
        | 'council'
        | 'council_round'
        | 'council_vote'
        | 'departure'
        | 'reinstatement'
        | 'advantage';
      season_rule_kind:
        | 'linked_pair_departure'
        | 'pair_composition'
        | 'council_without_host'
        | 'comfort_island'
        | 'other';
      season_status: 'announced' | 'airing' | 'completed' | 'unknown';
      share_scope:
        'profile' | 'note' | 'note_collection' | 'favorites' | 'ranking';
      spoiler_mode: 'reveal_all' | 'hide_unwatched' | 'hide_future';
      team_kind: 'initial' | 'reshuffled' | 'merged' | 'ambassador' | 'other';
      validation_status:
        'pending_review' | 'validated' | 'rejected' | 'published';
      visibility_level: 'private' | 'link' | 'public';
    };
    CompositeTypes: {
      _time_trial_type: {
        a_time: number | null;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      advantage_kind: [
        'immunity_necklace',
        'vote_advantage',
        'comfort_advantage',
        'other',
      ],
      app_role: ['admin', 'validator'],
      challenge_format: ['individual', 'team', 'pair', 'unknown'],
      challenge_kind: ['comfort', 'immunity', 'combined', 'other'],
      council_round_outcome: [
        'elimination',
        'tie',
        'annulled',
        'no_elimination',
        'unknown',
      ],
      departure_kind: [
        'vote',
        'linked_pair',
        'quit',
        'medical',
        'banned',
        'jury_exit',
        'final_ranking',
        'other',
      ],
      difference_class: [
        'unambiguous',
        'ambiguous',
        'retroactive',
        'conflicting',
        'suspicious',
      ],
      difference_operation: ['insert', 'update', 'delete'],
      import_run_status: [
        'running',
        'unchanged',
        'extracted',
        'diffed',
        'published',
        'failed',
        'reverted',
      ],
      import_trigger: ['manual', 'scheduled', 'backfill'],
      referential_entity: [
        'season',
        'season_rule',
        'contestant',
        'season_contestant',
        'team',
        'team_membership',
        'pair',
        'episode',
        'challenge',
        'challenge_result',
        'council',
        'council_round',
        'council_vote',
        'departure',
        'reinstatement',
        'advantage',
      ],
      season_rule_kind: [
        'linked_pair_departure',
        'pair_composition',
        'council_without_host',
        'comfort_island',
        'other',
      ],
      season_status: ['announced', 'airing', 'completed', 'unknown'],
      share_scope: [
        'profile',
        'note',
        'note_collection',
        'favorites',
        'ranking',
      ],
      spoiler_mode: ['reveal_all', 'hide_unwatched', 'hide_future'],
      team_kind: ['initial', 'reshuffled', 'merged', 'ambassador', 'other'],
      validation_status: [
        'pending_review',
        'validated',
        'rejected',
        'published',
      ],
      visibility_level: ['private', 'link', 'public'],
    },
  },
} as const;
