// Hand-written to match supabase/migrations/ (initial schema + the
// 20260720120000_pdf_pivot_and_job_leases migration) exactly.
// No headcount_trend column on companies — the prototype's sample data invented one.

export type CompanyStatus = "queued" | "in_progress" | "ready";

// 6 report sections (PDF pivot §A) + 2 legacy slugs kept read-only for
// History; the skill never emits legacy slugs again.
export type FactSection =
  | "leadership"
  | "acquisitions_partnerships"
  | "news"
  | "financials"
  | "growth_signals"
  | "risk_flags"
  | "segmentation"
  | "market_sizing";

// Auto-include by rule (§E): the only human action is remove (and restore).
export type FactStatus = "included" | "removed";

export type EnrichmentJobStatus = "queued" | "running" | "done" | "failed";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          can_enrich: boolean;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          can_enrich?: boolean;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          can_enrich?: boolean;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          domain: string;
          newsroom_url: string | null;
          ownership: string | null;
          hq: string | null;
          status: CompanyStatus;
          tldr: string | null;
          report_narrative: Record<string, unknown> | null;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          domain: string;
          newsroom_url?: string | null;
          ownership?: string | null;
          hq?: string | null;
          status?: CompanyStatus;
          tldr?: string | null;
          report_narrative?: Record<string, unknown> | null;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          domain?: string;
          newsroom_url?: string | null;
          ownership?: string | null;
          hq?: string | null;
          status?: CompanyStatus;
          tldr?: string | null;
          report_narrative?: Record<string, unknown> | null;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      facts: {
        Row: {
          id: string;
          company_id: string;
          section: FactSection;
          text: string;
          fact_date: string | null;
          status: FactStatus;
          group_key: string | null;
          stats: Record<string, unknown> | null;
          importance: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          section: FactSection;
          text: string;
          fact_date?: string | null;
          status?: FactStatus;
          group_key?: string | null;
          stats?: Record<string, unknown> | null;
          importance?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          section?: FactSection;
          text?: string;
          fact_date?: string | null;
          status?: FactStatus;
          group_key?: string | null;
          stats?: Record<string, unknown> | null;
          importance?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "facts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      sources: {
        Row: {
          id: string;
          fact_id: string;
          publisher: string;
          title: string | null;
          url: string;
          year: number | null;
        };
        Insert: {
          id?: string;
          fact_id: string;
          publisher: string;
          title?: string | null;
          url: string;
          year?: number | null;
        };
        Update: {
          id?: string;
          fact_id?: string;
          publisher?: string;
          title?: string | null;
          url?: string;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "sources_fact_id_fkey";
            columns: ["fact_id"];
            isOneToOne: false;
            referencedRelation: "facts";
            referencedColumns: ["id"];
          },
        ];
      };
      enrichment_jobs: {
        Row: {
          id: string;
          company_id: string;
          status: EnrichmentJobStatus;
          requested_by: string | null;
          created_at: string;
          started_at: string | null;
          finished_at: string | null;
          error: string | null;
          claimed_by: string | null;
          heartbeat_at: string | null;
          queue_name: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          status?: EnrichmentJobStatus;
          requested_by?: string | null;
          created_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
          error?: string | null;
          claimed_by?: string | null;
          heartbeat_at?: string | null;
          queue_name?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          status?: EnrichmentJobStatus;
          requested_by?: string | null;
          created_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
          error?: string | null;
          claimed_by?: string | null;
          heartbeat_at?: string | null;
          queue_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrichment_jobs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
