# Per-user runners — design spec

**Date:** 2026-07-22 · **Status:** awaiting Carter's approval

## Decisions made (with Carter, 2026-07-22)

1. **One shared website** (king-research.vercel.app), per-user runners. Each user's
   Enrich clicks run on **their own computer** with **their own Claude subscription**.
2. **Invite-only, shared workspace.** Sign-ups stay invite-only; everyone invited sees
   the same company list (today's model). No multi-tenant work.
3. **Runner auth = pairing code** (option A). No passwords, no shared runner account.
4. **The LaunchAgent is deleted entirely.** No plist, no launchd docs, no scheduled
   ticks. The runner's continuous mode (poll every ~5s while it's open) is the only
   documented way to run it, and it works on any OS.
5. **Open-sourcing is in scope now**: repos published to GitHub (after a secrets
   scrub) and the runner published to npm as a one-command install.
6. **Accounts are enrich-capable by default** — new and existing; revoke later by
   flag flip.

## Why

The project is open source. Today research runs only on Carter's Mac via a shared
runner account whose password sits in his `.env` — nobody else can be self-sufficient.
The website can never push work onto a user's machine (browsers forbid that, by
design), so the shape is **pull**: the user's computer signs in as them and claims
only their own jobs. The user's machine is their backend.

## User experience

Onboarding page (rewritten) walks a new user through:

1. Install Claude Code CLI, run `claude login` (their subscription pays for their runs).
2. Install the King Research plugin.
3. Start the runner with one command: `npx king-research-runner` (npm-published;
   exact name pending npm availability — scoped fallback if taken). No cloning,
   no manual `npm install`.
4. First start, the runner asks for a **pairing code**. The onboarding page has a
   **"Connect this computer"** button that shows a one-time code (expires in 10
   minutes). Paste it once; the runner stores its own login locally and never asks again.

From then on: click Enrich on the site → within ~5 seconds their runner picks it up →
facts stream in live (existing realtime). Carter re-pairs his own Mac the same way.

## Architecture

### Pairing flow (new)

- New table `runner_pairing_codes`: `user_id`, `code_hash`, `expires_at` (10 min),
  `used_at`. Codes are random, shown once, stored hashed, single-use.
- "Connect this computer" (server action, signed-in users only) inserts a code row and
  displays the code.
- New API route `POST /api/runner/pair` with `{ code }`: validates an unexpired,
  unused code, marks it used, then uses the Supabase **admin API** (service-role key,
  server-side env var only, never shipped to browsers) to generate a login token for
  that user — `generateLink` creates the token directly, **no email is sent**, so the
  2-emails/hour SMTP cap is irrelevant.
- The runner exchanges that token for a session (`verifyOtp`) and saves the refresh
  token at `~/.king-research/credentials.json` (file mode 600). On every later start
  it silently refreshes. If refresh ever fails (revoked/expired): print a clear
  "re-pair this computer" error and exit non-zero — never limp along silently.

### Job routing (changed)

- `enrichment_jobs.requested_by` already exists. New RLS policy: a job may be
  claimed/updated only by its requester (`requested_by = auth.uid()`), enforced in the
  database so no runner can work someone else's jobs, buggy or malicious.
- Runner adds `requested_by = me` to its claim query. All existing hardening —
  lease claim, heartbeat_at, owner-guarded writes, retry, loud failure — unchanged.
- The shared runner account is retired: `RUNNER_EMAIL`/`RUNNER_PASSWORD` removed from
  the `.env` contract, onboarding, and runner code; the Supabase account gets disabled.
- **Everyone can enrich by default**: new accounts start enrich-capable, and all
  existing accounts (including Dad's) are backfilled to enrich-capable. Revoking a
  person = flipping their flag off (Supabase dashboard for v1).

### Runner-offline banner (new — loud-failures rule)

New silent-failure risk: Enrich clicked, no runner running → job sits "Queued" forever.

- New table `runner_heartbeats`: `user_id` (pk), `last_seen_at`, `hostname`. The
  runner upserts its row on every poll (~5s, one tiny write).
- Companies page: if the signed-in user has queued/running jobs **and** their
  heartbeat is missing or older than 2 minutes → banner: "Your runner isn't
  connected — jobs will wait until it is. Set it up →" (links to onboarding).
  Realtime refresh already re-renders the page, so the banner appears/clears live.

### LaunchAgent removal (delete list)

- `runner/launchd/` directory (plist + its logs) — deleted.
- `RUNNER_ONCE` / `--once` drain-and-exit mode — deleted, **unless** the runner's test
  suite depends on it for deterministic runs; if so it survives as an undocumented
  test-only flag (decided during implementation, stated in the PR notes).
- `runner/README.md` launchd/on-demand sections — rewritten around continuous mode.
- Onboarding page, BUILD.md runner sections, and memory notes — scrubbed of launchd.

## Open-sourcing (in scope — Carter, 2026-07-22)

- **Publish the repos to GitHub** under Carter's account: the plugin repo keeps its
  already-planned home (`ck22coding/king-research`, marketplace at root, pushed
  verbatim); `web` and `runner` publish as their own public repos. The `supabase/`
  migrations folder (currently loose at the project root) folds into the public web
  repo so self-hosters get the schema.
- **Pre-publish secrets scrub, non-negotiable**: audit the FULL git history of every
  repo for keys, passwords, and personal data before anything goes public. The
  Supabase anon key and URL are public by design (safe); the service-role key and any
  password must never have been committed — verify, don't assume. Add an MIT LICENSE
  and a short README to each repo.
- **npm-packaged runner**: publish the runner to npm with a `bin` entry so
  `npx king-research-runner` is the entire install. The shared site's Supabase URL +
  anon key ship as baked-in defaults; env vars override them for self-hosters.
  Needs Carter's npm account login at publish time (I'll ask when we get there).

## Not in this build (flagged)

- Server-side "revoke this computer" UI — v1 revocation = Supabase dashboard.
- Multi-tenant / private workspaces — explicitly rejected in design.

## Testing

- **Runner lifecycle tests** (existing 6, extended): pairing against a mocked pair
  endpoint; claims only own-user jobs (two-user fixture); heartbeat upsert.
- **RLS negative test**: user A's session cannot claim or update user B's job
  (extends the existing "anonymous writes must fail" verification pattern).
- **Playwright**: pairing code appears on onboarding; offline banner shows with a
  queued job + stale heartbeat and clears with a fresh one; full suite green.

## Rollout

1. One Supabase migration: two new tables + RLS changes on `enrichment_jobs` +
   enrich-capable default/backfill.
2. Vercel env: add `SUPABASE_SERVICE_ROLE_KEY` (production + preview).
3. Deploy web, update runner, delete launchd artifacts, rewrite docs.
4. Secrets-scrub audit → publish repos to GitHub (LICENSE + READMEs) → publish the
   runner to npm.
5. Carter re-pairs his Mac via `npx king-research-runner`; disable the old runner
   account.
