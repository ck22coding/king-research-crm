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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          created_by: string | null
          domain: string
          hq: string | null
          id: string
          name: string
          newsroom_url: string | null
          ownership: string | null
          report_narrative: Json | null
          status: CompanyStatus
          tldr: string | null
          updated_at: string
        }
        Insert: {
          created_by?: string | null
          domain: string
          hq?: string | null
          id?: string
          name: string
          newsroom_url?: string | null
          ownership?: string | null
          report_narrative?: Json | null
          status?: CompanyStatus
          tldr?: string | null
          updated_at?: string
        }
        Update: {
          created_by?: string | null
          domain?: string
          hq?: string | null
          id?: string
          name?: string
          newsroom_url?: string | null
          ownership?: string | null
          report_narrative?: Json | null
          status?: CompanyStatus
          tldr?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_jobs: {
        Row: {
          claimed_by: string | null
          company_id: string
          created_at: string
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: EnrichmentJobKind
          queue_name: string
          requested_by: string | null
          started_at: string | null
          status: EnrichmentJobStatus
        }
        Insert: {
          claimed_by?: string | null
          company_id: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind?: EnrichmentJobKind
          queue_name?: string
          requested_by?: string | null
          started_at?: string | null
          status?: EnrichmentJobStatus
        }
        Update: {
          claimed_by?: string | null
          company_id?: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind?: EnrichmentJobKind
          queue_name?: string
          requested_by?: string | null
          started_at?: string | null
          status?: EnrichmentJobStatus
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facts: {
        Row: {
          company_id: string
          created_at: string
          fact_date: string | null
          group_key: string | null
          id: string
          importance: number | null
          reviewed_at: string | null
          section: FactSection
          stats: Json | null
          status: FactStatus
          text: string
        }
        Insert: {
          company_id: string
          created_at?: string
          fact_date?: string | null
          group_key?: string | null
          id?: string
          importance?: number | null
          reviewed_at?: string | null
          section: FactSection
          stats?: Json | null
          status?: FactStatus
          text: string
        }
        Update: {
          company_id?: string
          created_at?: string
          fact_date?: string | null
          group_key?: string | null
          id?: string
          importance?: number | null
          reviewed_at?: string | null
          section?: FactSection
          stats?: Json | null
          status?: FactStatus
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "facts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          can_enrich: boolean
          display_name: string | null
          email: string
          id: string
        }
        Insert: {
          can_enrich?: boolean
          display_name?: string | null
          email: string
          id: string
        }
        Update: {
          can_enrich?: boolean
          display_name?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      runner_heartbeats: {
        Row: {
          hostname: string | null
          last_seen_at: string
          user_id: string
        }
        Insert: {
          hostname?: string | null
          last_seen_at?: string
          user_id: string
        }
        Update: {
          hostname?: string | null
          last_seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runner_heartbeats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      runner_pairing_codes: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runner_pairing_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          fact_id: string
          id: string
          publisher: string
          title: string | null
          url: string
          year: number | null
        }
        Insert: {
          fact_id: string
          id?: string
          publisher: string
          title?: string | null
          url: string
          year?: number | null
        }
        Update: {
          fact_id?: string
          id?: string
          publisher?: string
          title?: string | null
          url?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sources_fact_id_fkey"
            columns: ["fact_id"]
            isOneToOne: false
            referencedRelation: "facts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
export type CompanyStatus = "queued" | "in_progress" | "ready";

export type FactSection =
  | "leadership"
  | "acquisitions_partnerships"
  | "news"
  | "financials"
  | "growth_signals"
  | "risk_flags"
  | "segmentation"
  | "market_sizing";

export type FactStatus = "included" | "removed";

export type EnrichmentJobStatus = "queued" | "running" | "done" | "failed";

export type EnrichmentJobKind = "enrich" | "generate";
