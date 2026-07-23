-- Research CRM — initial schema (BUILD.md Phase 1)
-- Tables: companies, facts, sources, enrichment_jobs, profiles
-- Security model: RLS on everything; no anon access anywhere; invite-gated
-- sign-in is the write gate. Fact/source inserts require profiles.can_enrich.

-- ============ profiles ============
-- One row per auth user, auto-created on signup/invite.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  can_enrich boolean not null default false
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ companies ============
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  newsroom_url text,
  ownership text,
  hq text,
  status text not null default 'queued' check (status in ('queued', 'in_progress', 'ready')),
  tldr text,
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ============ facts ============
-- The 8 approved brief sections (company-preview/DESIGN.md).
create table public.facts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  section text not null check (section in (
    'leadership', 'news', 'money', 'growth_signals',
    'regulatory', 'risk_flags', 'segmentation', 'market_sizing'
  )),
  text text not null,
  fact_date date,
  status text not null default 'suggested' check (status in ('suggested', 'approved', 'rejected')),
  group_key text, -- same story from newsroom + third-party press shares a key
  created_at timestamptz not null default now()
);

create index facts_company_id_idx on public.facts (company_id);

-- ============ sources ============
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  fact_id uuid not null references public.facts (id) on delete cascade,
  publisher text not null,
  title text,
  url text not null,
  year int
);

create index sources_fact_id_idx on public.sources (fact_id);

-- ============ enrichment_jobs ============
create table public.enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  requested_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text
);

create index enrichment_jobs_company_id_idx on public.enrichment_jobs (company_id);
create index enrichment_jobs_queued_idx on public.enrichment_jobs (created_at) where status = 'queued';

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.facts enable row level security;
alter table public.sources enable row level security;
alter table public.enrichment_jobs enable row level security;

-- Anonymous requests rejected everywhere: no anon policies + no anon privileges.
revoke all on public.profiles, public.companies, public.facts, public.sources, public.enrichment_jobs from anon;

-- Signed-in users read everything.
create policy "authenticated read" on public.profiles for select to authenticated using (true);
create policy "authenticated read" on public.companies for select to authenticated using (true);
create policy "authenticated read" on public.facts for select to authenticated using (true);
create policy "authenticated read" on public.sources for select to authenticated using (true);
create policy "authenticated read" on public.enrichment_jobs for select to authenticated using (true);

-- Profiles: users may edit their own display_name only (column grant below).
create policy "own profile update" on public.profiles for update to authenticated
  using (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Companies: any signed-in user adds companies; only enrichers (the runner)
-- update rows (status, tldr, newsroom_url).
create policy "authenticated insert" on public.companies for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "enricher update" on public.companies for update to authenticated
  using ((select can_enrich from public.profiles where id = (select auth.uid())));

-- Facts: inserts come from the runner's session; any signed-in user
-- approves/rejects (update).
create policy "enricher insert" on public.facts for insert to authenticated
  with check ((select can_enrich from public.profiles where id = (select auth.uid())));
create policy "authenticated update" on public.facts for update to authenticated
  using (true);

-- Sources: runner-only inserts.
create policy "enricher insert" on public.sources for insert to authenticated
  with check ((select can_enrich from public.profiles where id = (select auth.uid())));

-- Jobs: any signed-in user queues a job; the runner claims/completes it.
create policy "authenticated insert" on public.enrichment_jobs for insert to authenticated
  with check (requested_by = (select auth.uid()));
create policy "enricher update" on public.enrichment_jobs for update to authenticated
  using ((select can_enrich from public.profiles where id = (select auth.uid())));

-- No delete policies in v1: rejected facts keep their status, nothing is deleted.

-- ============ Realtime ============
-- Live spinner: companies + jobs + facts stream to signed-in browsers.
alter publication supabase_realtime add table public.companies, public.enrichment_jobs, public.facts;
