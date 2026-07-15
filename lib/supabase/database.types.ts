// Hand-written to match supabase/migrations/20260715120000_initial_schema.sql exactly.
// No headcount_trend column on companies — the prototype's sample data invented one.

export type CompanyStatus = "queued" | "in_progress" | "ready";

export type FactSection =
  | "leadership"
  | "news"
  | "money"
  | "growth_signals"
  | "regulatory"
  | "risk_flags"
  | "segmentation"
  | "market_sizing";

export type FactStatus = "suggested" | "approved" | "rejected";

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
