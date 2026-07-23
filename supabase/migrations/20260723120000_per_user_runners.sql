-- Per-user runners: pairing codes, presence heartbeats, per-user job claims,
-- enrich-capable by default. Spec: web/docs/specs/2026-07-22-per-user-runners.md

-- 1. Everyone can enrich by default; revoking someone = flip their flag off.
alter table public.profiles alter column can_enrich set default true;
update public.profiles set can_enrich = true;

-- 2. Pairing codes: single-use, stored hashed, 10-minute expiry. Browsers
--    (authenticated) may only INSERT their own; the pair API route runs as
--    service role (bypasses RLS) to validate + mark used. No select/update
--    policies for authenticated: write-only from the user's side.
create table public.runner_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.runner_pairing_codes enable row level security;
revoke all on public.runner_pairing_codes from anon;
create policy "own codes insert" on public.runner_pairing_codes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- 3. Runner presence: one row per user, upserted by their runner every poll.
create table public.runner_heartbeats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  hostname text
);
alter table public.runner_heartbeats enable row level security;
revoke all on public.runner_heartbeats from anon;
create policy "authenticated read" on public.runner_heartbeats
  for select to authenticated using (true);
create policy "own heartbeat insert" on public.runner_heartbeats
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own heartbeat update" on public.runner_heartbeats
  for update to authenticated using (user_id = (select auth.uid()));

-- 4. Jobs: only the requester (whose runner is signed in as them) may
--    claim/update their jobs. Replaces the can_enrich-only "enricher update".
drop policy "enricher update" on public.enrichment_jobs;
create policy "requester update" on public.enrichment_jobs
  for update to authenticated
  using (
    requested_by = (select auth.uid())
    and (select can_enrich from public.profiles where id = (select auth.uid()))
  );
