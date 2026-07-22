# Per-User Runners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each signed-in user's Enrich clicks run on their own computer via a paired local runner (`npx king-research-runner`), with the LaunchAgent and shared runner account fully removed, and the project published to GitHub + npm.

**Architecture:** Pull model — the website only inserts job rows; a runner on the user's machine authenticates *as that user* via a one-time pairing code exchanged for a Supabase session, claims only jobs where `requested_by = auth.uid()` (RLS-enforced), and reports presence via a heartbeats table that drives a "runner offline" banner. Spec: `docs/specs/2026-07-22-per-user-runners.md`.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` middleware convention), Supabase (hosted, RLS, `@supabase/ssr` + `@supabase/supabase-js` ^2.110), plain-Node runner (`node:test`), Playwright, npm publish, `gh` CLI.

## Global Constraints

- Repos: `web/` and `runner/` are separate git repos; `supabase/` at project root is in NO repo until Task 11 folds it into web. The dad project root is not a repo.
- Work in worktrees; web branch `per-user-runners` (exists), runner branch `per-user-runners` (create in Task 5 via `git -C /Users/carterking/Projects/dad/runner worktree add .claude/worktrees/per-user-runners -b per-user-runners`).
- `npm` is shell-aliased on this machine — always `command npm` / `command npx`.
- All tests run against the LIVE hosted Supabase project (there is no local Supabase stack). Runner tests: `cd runner && command npm test`. Web tests: `cd web && command npx playwright test`.
- The former shared runner account (`RUNNER_EMAIL`/`RUNNER_PASSWORD` in root `.env`) is NOT deleted — it is repurposed as the test-fixture user (web's `/api/test-auth` and runner tests sign in with it). Production code must never read these vars. (Delta from spec §"retired": account survives, test-only.)
- LaunchAgent + once-mode: delete `runner/launchd/`, all `RUNNER_ONCE`/`--once` code, and `test/once.test.mjs`. No signs may remain in code or docs (Carter's explicit requirement).
- Never commit secret values. `SUPABASE_SERVICE_ROLE_KEY` lives only in `web/.env.local` (dev), root `.env` (runner tests), and Vercel env vars.
- Site URL constant: `https://king-research.vercel.app`. Supabase project ref: `dtwztzbvewheadjawdnb`.
- Env names are part of the public runner contract: `KR_SITE_URL`, `KR_CREDENTIALS_PATH`, `KR_ENV_FILE`, plus existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RUNNER_QUEUE`, `RUNNER_CONCURRENCY`, `RUNNER_MODEL`, `POLL_INTERVAL_MS`, `CLAUDE_BIN`, `PLUGIN_DIR`.

---

### Task 1: Database migration — pairing codes, heartbeats, per-user claims, enrich-by-default

**Files:**
- Create: `/Users/carterking/Projects/dad/supabase/migrations/20260723120000_per_user_runners.sql`

**Interfaces:**
- Produces tables `public.runner_pairing_codes` (id, user_id, code_hash, created_at, expires_at, used_at) and `public.runner_heartbeats` (user_id PK, last_seen_at, hostname) with the RLS below; `profiles.can_enrich` defaults true; `enrichment_jobs` UPDATE policy becomes requester-only. All later tasks depend on these exact names.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Push to hosted Supabase and verify**

Run from `/Users/carterking/Projects/dad`: `supabase db push`
Expected: applies `20260723120000_per_user_runners.sql` with no error.
Then `supabase migration list` — expected: the new migration shows in both Local and Remote columns.

⚠️ From this push until Task 13's cutover, Carter's OLD manual runner (shared account) cannot claim jobs — the new policy requires requester = claimer. Acceptable per spec rollout; do not "fix" it.

- [ ] **Step 3: No commit yet** — `supabase/` joins the web repo in Task 11. Leave the file in place.

---

### Task 2: Web — pairing-code server action + "Connect this computer" card

**Files:**
- Create: `web/app/(app)/onboarding/actions.ts`
- Create: `web/app/(app)/onboarding/pair-card.tsx`
- Modify: `web/app/(app)/onboarding/page.tsx` (71 lines — add the card; full copy rewrite happens in Task 9)
- Test: `web/tests/pairing.spec.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server` (existing).
- Produces: `createPairingCode(): Promise<string>` server action returning `"XXXX-XXXX"` (alphabet `A–Z` minus `I,O` plus `2–9`); rows in `runner_pairing_codes` with sha256-hex `code_hash` of the UNDASHED 8-char code, `expires_at = now + 10min`.

- [ ] **Step 1: Write the failing Playwright test**

```ts
// web/tests/pairing.spec.ts
import { test, expect } from "@playwright/test";

test("Connect this computer issues a one-time pairing code", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Connect this computer" }).click();
  // Code renders once, grouped XXXX-XXXX, unambiguous alphabet
  await expect(page.getByTestId("pairing-code")).toHaveText(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
});
```

- [ ] **Step 2: Run it, verify it fails** — `command npx playwright test tests/pairing.spec.ts` → FAIL (button not found).

- [ ] **Step 3: Implement action + card**

```ts
// web/app/(app)/onboarding/actions.ts
"use server";

import { randomBytes, createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";

// 8 chars from a 32-symbol alphabet (no 0/O/1/I) = 40 bits of entropy —
// plenty for a single-use code that expires in 10 minutes.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function createPairingCode(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[bytes[i] % 32];

  const { error } = await supabase.from("runner_pairing_codes").insert({
    user_id: user.id,
    code_hash: createHash("sha256").update(code).digest("hex"),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
```

```tsx
// web/app/(app)/onboarding/pair-card.tsx
"use client";

import { useState, useTransition } from "react";
import { createPairingCode } from "./actions";

export default function PairCard() {
  const [code, setCode] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="card">
      <h3>Connect this computer</h3>
      <p style={{ marginBottom: 8 }}>
        Generates a one-time code (valid 10 minutes). Paste it into the runner
        when it asks — that links the runner to your account, once.
      </p>
      {code ? (
        <div className="chips">
          <span className="chip">
            <code data-testid="pairing-code">{code}</code>
          </span>
        </div>
      ) : (
        <button className="btn" disabled={pending} onClick={() => start(async () => setCode(await createPairingCode()))}>
          Connect this computer
        </button>
      )}
    </div>
  );
}
```

In `page.tsx`, import and render `<PairCard />` after the existing step-3 card (full copy rewrite waits for Task 9).

- [ ] **Step 4: Run test, verify pass** — `command npx playwright test tests/pairing.spec.ts` → PASS. Regenerate DB types so `runner_pairing_codes` exists in `lib/supabase/database.types.ts`: `supabase gen types typescript --project-id dtwztzbvewheadjawdnb --schema public > lib/supabase/database.types.ts` (run from `web/`).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: pairing-code issuance on onboarding"`

---

### Task 3: Web — `/api/runner/pair` exchange route (service role)

**Files:**
- Create: `web/app/api/runner/pair/route.ts`
- Modify: `web/proxy.ts:44` (matcher — add `api/runner/pair` to the exclusion list: the runner calls it unauthenticated)
- Test: `web/tests/pair-api.spec.ts`

**Interfaces:**
- Consumes: `runner_pairing_codes` (Task 1); env `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `POST /api/runner/pair` body `{ code: string }` → `200 { token_hash: string }` | `400/401 { error: string }`. The runner (Task 5) exchanges `token_hash` via `supabase.auth.verifyOtp({ type: "email", token_hash })`.

- [ ] **Step 1: GATE — get the service-role key.** Ask Carter to paste the service_role key from Supabase dashboard → Project Settings → API into `web/.env.local` as `SUPABASE_SERVICE_ROLE_KEY=…` and into root `.env` (runner tests use it in Task 6). Do not proceed without it; do not echo it anywhere.

- [ ] **Step 2: Write the failing test**

```ts
// web/tests/pair-api.spec.ts
import { test, expect } from "@playwright/test";

test("pair route exchanges a fresh code and burns it", async ({ page, request }) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Connect this computer" }).click();
  const code = await page.getByTestId("pairing-code").textContent();

  const res = await request.post("/api/runner/pair", { data: { code } });
  expect(res.status()).toBe(200);
  expect((await res.json()).token_hash).toBeTruthy();

  // single-use: same code again must fail
  const again = await request.post("/api/runner/pair", { data: { code } });
  expect(again.status()).toBe(401);
});

test("pair route rejects garbage", async ({ request }) => {
  const res = await request.post("/api/runner/pair", { data: { code: "NOPE-NOPE" } });
  expect(res.status()).toBe(401);
});
```

- [ ] **Step 3: Run, verify fails** — 404 (route missing).

- [ ] **Step 4: Implement the route**

```ts
// web/app/api/runner/pair/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// Unauthenticated by design (runner has no session yet); the pairing code IS
// the credential: single-use, hashed at rest, 10-minute expiry, minted only
// by a signed-in browser. Service role never leaves this server handler.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const raw = typeof body?.code === "string" ? body.code : "";
  const code = raw.trim().toUpperCase().replace(/[^A-Z2-9]/g, "");
  if (code.length !== 8) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Atomic single-use claim: mark used only if still unused and unexpired.
  const { data: rows, error } = await admin
    .from("runner_pairing_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", createHash("sha256").update(code).digest("hex"))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = rows?.[0];
  if (!row) return NextResponse.json({ error: "Code invalid, already used, or expired" }, { status: 401 });

  const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(row.user_id);
  if (userErr || !userRes.user?.email) {
    return NextResponse.json({ error: "User not found" }, { status: 500 });
  }

  // generateLink creates the token WITHOUT sending an email — the hosted
  // SMTP 2-emails/hour cap is not involved.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userRes.user.email,
  });
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  return NextResponse.json({ token_hash: link.properties.hashed_token });
}
```

Note for the implementer: confirm the exact `generateLink` return shape against the installed types in `web/node_modules/@supabase/supabase-js` (`GenerateLinkResponse` → `data.properties.hashed_token`) before assuming; supabase-js is ^2.110.6.

In `proxy.ts`, change the matcher line to:

```ts
    "/((?!login|auth/callback|api/test-auth|api/runner/pair|_next/static|_next/image|favicon.ico).*)",
```

- [ ] **Step 5: Run tests, verify pass** — both pair-api tests + pairing.spec.ts still green.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: runner pairing exchange route (service role)"`

---

### Task 4: Web — "runner offline" banner

**Files:**
- Modify: `web/app/(app)/companies/page.tsx` (jobs select + banner)
- Test: `web/tests/runner-offline-banner.spec.ts`

**Interfaces:**
- Consumes: `runner_heartbeats` (Task 1); existing jobs query in `CompaniesPage`.
- Produces: banner div `data-testid="runner-offline"` shown iff the signed-in user has a `queued`/`running` job AND their heartbeat row is absent or older than 120s. Links to `/onboarding`.

- [ ] **Step 1: Write the failing test**

```ts
// web/tests/runner-offline-banner.spec.ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Test user = the fixture account global-setup signs in as (see tests/global-setup.ts).
function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

test("banner shows with a queued job and no fresh heartbeat, clears with one", async ({ page }) => {
  const supabase = db();
  const { data: auth } = await supabase.auth.signInWithPassword({
    email: process.env.RUNNER_EMAIL!,
    password: process.env.RUNNER_PASSWORD!,
  });
  const uid = auth.user!.id;

  // Ensure NO fresh heartbeat, and one queued job owned by the test user.
  await supabase.from("runner_heartbeats").upsert({
    user_id: uid, last_seen_at: new Date(Date.now() - 10 * 60_000).toISOString(), hostname: "stale-test",
  });
  const { data: co } = await supabase.from("companies").select("id").eq("domain", "runner-test.example").single();
  const { data: job } = await supabase.from("enrichment_jobs")
    .insert({ company_id: co!.id, requested_by: uid }).select("id").single();

  try {
    await page.goto("/companies");
    await expect(page.getByTestId("runner-offline")).toBeVisible();

    await supabase.from("runner_heartbeats").upsert({
      user_id: uid, last_seen_at: new Date().toISOString(), hostname: "fresh-test",
    });
    await page.reload();
    await expect(page.getByTestId("runner-offline")).toHaveCount(0);
  } finally {
    await supabase.from("enrichment_jobs").update({ status: "failed", error: "test cleanup", finished_at: new Date().toISOString() }).eq("id", job!.id);
  }
});
```

(Company `runner-test.example` already exists from runner tests; if `.single()` errors locally, create it first with `insert({ name: "Runner Test Co", domain: "runner-test.example", created_by: uid })` — mirror `runner/test/helpers.mjs`'s `findOrCreateRunnerTestCo`.)

- [ ] **Step 2: Run, verify fails** — banner testid not found while job queued.

- [ ] **Step 3: Implement in `companies/page.tsx`**

Extend the existing `Promise.all` (page.tsx:9-25): change the jobs select to `"company_id, status, error, requested_by"`, and add two more parallel queries — `supabase.auth.getUser()` and the user's heartbeat. Then compute and render:

```tsx
const [{ data: companies }, { data: jobs }, { data: { user } }] = await Promise.all([
  /* companies query unchanged */,
  supabase.from("enrichment_jobs").select("company_id, status, error, requested_by")
    .order("created_at", { ascending: false }).limit(1000),
  supabase.auth.getUser(),
]);
const { data: hb } = user
  ? await supabase.from("runner_heartbeats").select("last_seen_at").eq("user_id", user.id).maybeSingle()
  : { data: null };

const myPending = (jobs ?? []).some(
  (j) => j.requested_by === user?.id && (j.status === "queued" || j.status === "running"),
);
const runnerOffline =
  myPending && (!hb || Date.now() - new Date(hb.last_seen_at).getTime() > 120_000);
```

```tsx
{runnerOffline && (
  <div className="empty" data-testid="runner-offline">
    Your runner isn&rsquo;t connected — jobs will wait until it is.{" "}
    <a href="/onboarding">Set it up →</a>
  </div>
)}
<RealtimeRefresh />
```

(`RealtimeRefresh` already re-renders this server component on job changes, so the banner appears/clears live.)

- [ ] **Step 4: Run, verify pass**, and run the FULL web suite: `command npx playwright test` → all green.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: loud runner-offline banner"`

---

### Task 5: Runner — pairing client + stored session (replaces password auth)

**Files:**
- Create runner worktree: `git -C /Users/carterking/Projects/dad/runner worktree add .claude/worktrees/per-user-runners -b per-user-runners`; work there.
- Modify: `runner/index.mjs:21` (env load), `:30-40` (required-env check), `:96-100` (auth)
- Test: `runner/test/pairing.test.mjs`, modify `runner/test/helpers.mjs`

**Interfaces:**
- Consumes: `POST ${KR_SITE_URL}/api/runner/pair` (Task 3 contract).
- Produces: credentials file `{ "refresh_token": string }` at `KR_CREDENTIALS_PATH` (default `~/.king-research/credentials.json`, mode 600); exported behavior: on start, refresh stored session → else prompt for pairing code on TTY → else loud exit(1). Global `ME` (the signed-in user, `{ id, email }`) used by Tasks 6.
- Test helper produced: `writeCredsFor(session, path)` in `helpers.mjs`.

- [ ] **Step 1: Write the failing test**

```js
// runner/test/pairing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnRunner, signInTestUser, writeCredsFor } from './helpers.mjs';

test('runner starts from a stored refresh token (no password vars)', async () => {
  const session = await signInTestUser();          // password sign-in, test-only
  const dir = mkdtempSync(join(tmpdir(), 'kr-'));
  const credPath = join(dir, 'credentials.json');
  writeCredsFor(session, credPath);

  const child = spawnRunner({
    env: { KR_CREDENTIALS_PATH: credPath, RUNNER_EMAIL: '', RUNNER_PASSWORD: '' },
  });
  const line = await child.waitForLine(/signed in as /, 15_000);
  assert.match(line, /signed in as .+@/);
  child.kill();
});

test('runner exits loudly with bad credentials and no TTY', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kr-'));
  const credPath = join(dir, 'credentials.json');
  writeFileSync(credPath, JSON.stringify({ refresh_token: 'garbage' }));

  const child = spawnRunner({ env: { KR_CREDENTIALS_PATH: credPath } });
  const code = await child.waitForExit(15_000);
  assert.equal(code, 1);
  assert.match(child.stderr(), /re-pair this computer/i);
});
```

Add to `helpers.mjs` (reusing its existing spawn/env plumbing — implementer: read `helpers.mjs` first and match its existing child-process helper style; if it has no `waitForLine`/`waitForExit`/`stderr` utilities, add them there, not in the test):

```js
export async function signInTestUser() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.RUNNER_EMAIL,      // fixture account, test-only
    password: process.env.RUNNER_PASSWORD,
  });
  if (error) throw error;
  return data.session;
}

export function writeCredsFor(session, path) {
  writeFileSync(path, JSON.stringify({ refresh_token: session.refresh_token }), { mode: 0o600 });
}
```

- [ ] **Step 2: Run, verify fails** — `command npm test` (or `node --test test/pairing.test.mjs`): runner still demands RUNNER_EMAIL/RUNNER_PASSWORD, no "signed in as" line.

- [ ] **Step 3: Implement in `index.mjs`**

Replace line 21's hardcoded `process.loadEnvFile('/Users/carterking/Projects/dad/.env')` with:

```js
// Optional env file: dev/tests point KR_ENV_FILE at the project .env;
// npx users have neither and that's fine — defaults below cover them.
try { process.loadEnvFile(process.env.KR_ENV_FILE ?? '.env'); } catch {}
```

Replace the required-env check (lines 30-40) — `RUNNER_EMAIL`/`RUNNER_PASSWORD` are gone; URL + anon key get baked public defaults (they are public by design; RLS is the security boundary):

```js
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dtwztzbvewheadjawdnb.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'PASTE_PUBLIC_ANON_KEY_HERE'; // implementer: copy from web/.env.local — this value is public by design
const SITE_URL = process.env.KR_SITE_URL || 'https://king-research.vercel.app';
```

Replace the auth block (lines 96-100) with pairing/session logic:

```js
import { homedir, hostname } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const CRED_PATH = process.env.KR_CREDENTIALS_PATH || join(homedir(), '.king-research', 'credentials.json');

function saveCreds(session) {
  mkdirSync(dirname(CRED_PATH), { recursive: true });
  writeFileSync(CRED_PATH, JSON.stringify({ refresh_token: session.refresh_token }), { mode: 0o600 });
}

async function ensureSession() {
  let stored = null;
  try { stored = JSON.parse(readFileSync(CRED_PATH, 'utf8')); } catch {}
  if (stored?.refresh_token) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: stored.refresh_token });
    if (!error) { saveCreds(data.session); return data.session.user; }
    console.error(`Stored login rejected (${error.message}).`);
  }
  if (!process.stdin.isTTY) {
    console.error('No valid login. Run this command in a terminal and re-pair this computer (Onboarding page → Connect this computer).');
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const code = (await rl.question('Paste the pairing code from the website (Onboarding → Connect this computer): ')).trim();
  rl.close();
  const res = await fetch(new URL('/api/runner/pair', SITE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    console.error(`Pairing failed: ${(await res.json().catch(() => ({}))).error ?? res.status}`);
    process.exit(1);
  }
  const { token_hash } = await res.json();
  const { data, error } = await supabase.auth.verifyOtp({ type: 'email', token_hash });
  if (error) { console.error(`Pairing failed: ${error.message}`); process.exit(1); }
  saveCreds(data.session);
  return data.session.user;
}

const ME = await ensureSession();
console.log(`signed in as ${ME.email}`);
```

(Implementer: `verifyOtp` type — check the installed supabase-js union; `'email'` is the token_hash type for magiclink-generated tokens in v2. If the types disagree, `'magiclink'` is the fallback; the test will tell you.)

- [ ] **Step 4: Run tests, verify the two new tests pass.**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: pairing-code auth, stored session replaces password auth"`

---

### Task 6: Runner — per-user claims, heartbeat, RLS negative test

**Files:**
- Modify: `runner/index.mjs` — `worker()` poll query (~lines 531-537), `runJob()` claim update (~lines 582-593), main startup (~lines 966-972)
- Modify: `runner/test/helpers.mjs` (admin user factory), `runner/test/lifecycle.test.mjs` (fixture jobs get `requested_by`)
- Test: `runner/test/per-user.test.mjs`

**Interfaces:**
- Consumes: `ME` from Task 5; `runner_heartbeats` from Task 1; `SUPABASE_SERVICE_ROLE_KEY` (root `.env`, tests only — never in index.mjs).
- Produces: poll + claim filtered by `requested_by = ME.id`; heartbeat upsert every `POLL_INTERVAL_MS`; helpers export `adminCreateThrowawayUser()` / `adminDeleteUser(id)`.

- [ ] **Step 1: Write the failing tests**

```js
// runner/test/per-user.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { supabase, signInTestUser, adminCreateThrowawayUser, adminDeleteUser, findOrCreateRunnerTestCo } from './helpers.mjs';
import { createClient } from '@supabase/supabase-js';

test('RLS: user B cannot claim user A job', async () => {
  const a = await signInTestUser();
  const co = await findOrCreateRunnerTestCo();
  const { data: job } = await supabase.from('enrichment_jobs')
    .insert({ company_id: co.id, requested_by: a.user.id }).select().single();

  const b = await adminCreateThrowawayUser();
  try {
    const asB = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await asB.auth.signInWithPassword({ email: b.email, password: b.password });
    const { data: stolen } = await asB.from('enrichment_jobs')
      .update({ status: 'running', claimed_by: 'thief' })
      .eq('id', job.id).eq('status', 'queued').select();
    assert.equal(stolen.length, 0, 'RLS must hide A\'s job from B\'s UPDATE');
  } finally {
    await supabase.from('enrichment_jobs').update({ status: 'failed', error: 'test cleanup', finished_at: new Date().toISOString() }).eq('id', job.id);
    await adminDeleteUser(b.id);
  }
});

test('runner heartbeats while polling', async () => {
  const a = await signInTestUser();
  // spawn via helpers with creds file (Task 5 pattern), let it poll ~2 cycles
  // then assert runner_heartbeats.last_seen_at for a.user.id is < 15s old.
  // (Reuse spawnRunner + writeCredsFor; POLL_INTERVAL_MS: '1000' in env.)
  const before = new Date().toISOString();
  const { spawnPaired } = await import('./helpers.mjs');
  const child = await spawnPaired(a, { POLL_INTERVAL_MS: '1000' });
  await new Promise((r) => setTimeout(r, 4000));
  child.kill();
  const { data: hb } = await supabase.from('runner_heartbeats').select('last_seen_at').eq('user_id', a.user.id).single();
  assert.ok(hb && hb.last_seen_at > before, 'heartbeat row must be freshly upserted');
});
```

Helpers additions (service role client is TEST-ONLY):

```js
// helpers.mjs
import { randomUUID } from 'node:crypto';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export async function adminCreateThrowawayUser() {
  const email = `runner-test-${randomUUID().slice(0, 8)}@runner-test.example`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email, password };
}
export async function adminDeleteUser(id) {
  await admin.auth.admin.deleteUser(id);
}
export async function spawnPaired(session, extraEnv = {}) { /* writeCredsFor to a tmp file + spawnRunner with KR_CREDENTIALS_PATH + extraEnv */ }
```

(`spawnPaired` composes Task 5's `writeCredsFor` + the existing spawn helper — implement it fully in helpers.mjs, matching the file's existing style.)

- [ ] **Step 2: Run, verify** — RLS test PASSES already (Task 1 policy — good, it locks the contract); heartbeat test FAILS (no upsert yet).

- [ ] **Step 3: Implement**

In `worker()` poll select, add `.eq('requested_by', ME.id)` after `.eq('queue_name', RUNNER_QUEUE)`. Same addition in `runJob()`'s claim update chain. In main startup (before the workers `Promise.all`):

```js
// Presence: one row per user; the web banner treats >120s stale as offline.
async function beatOnce() {
  const { error } = await supabase.from('runner_heartbeats').upsert({
    user_id: ME.id,
    last_seen_at: new Date().toISOString(),
    hostname: hostname(),
  });
  if (error) console.error(`heartbeat failed: ${error.message}`);
}
await beatOnce();
const heartbeatTimer = setInterval(beatOnce, POLL_INTERVAL_MS);
```

Clear `heartbeatTimer` in the existing drain-and-exit shutdown path (find the SIGINT/SIGTERM handler; add `clearInterval(heartbeatTimer)`).

Also update `lifecycle.test.mjs` fixture inserts to set `requested_by` to the test user's id (they already sign in as the fixture user, so `auth.uid()` matches).

- [ ] **Step 4: Run the full runner suite** — `command npm test` → per-user + pairing + startup + lifecycle + timeout all pass (once.test.mjs still exists until Task 7).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: per-user job claims + presence heartbeat"`

---

### Task 7: Runner — delete LaunchAgent + once-mode, fix rotted test statuses

**Files:**
- Delete: `runner/launchd/` (entire directory), `runner/test/once.test.mjs`
- Modify: `runner/index.mjs:65` (RUNNER_ONCE const), `~553-556` (once-mode worker exit), `~966-972` (once-mode drain log); `runner/package.json` (test script); `runner/test/lifecycle.test.mjs:58,90`, `runner/test/timeout.test.mjs:57`
- Modify: `runner/index.mjs` spawn args (~451-469): make `--plugin-dir` conditional

**Interfaces:**
- Produces: runner has exactly one mode (continuous poll). `PLUGIN_DIR` env optional: set → pass `--plugin-dir` + cwd (dev); unset → omit both (plugin installed via marketplace).

- [ ] **Step 1: Delete once-mode + launchd**

Remove `RUNNER_ONCE` const (line 65), the once-mode branch in `worker()` (lines 553-556 — the empty-poll path now always sleeps `POLL_INTERVAL_MS`), the drain log at the bottom (lines 966-972 keep only the `Promise.all`). `git rm -r launchd test/once.test.mjs`. package.json test script becomes:

```json
"test": "node --test --test-concurrency=1 test/startup.test.mjs test/lifecycle.test.mjs test/timeout.test.mjs test/pairing.test.mjs test/per-user.test.mjs"
```

- [ ] **Step 2: Fix pre-pivot status rot** (these violate the live `facts_status_check (included|removed)` — Explore found tests already broken against current schema): in `lifecycle.test.mjs` line 58 and `timeout.test.mjs` line 57 change cleanup `.update({ status: 'rejected' })` → `.update({ status: 'removed' })`; in `lifecycle.test.mjs` line 90 change `.eq('status', 'suggested')` → `.eq('status', 'included')`.

- [ ] **Step 3: Conditional plugin dir** in `runClaude` spawn:

```js
const args = ['-p', prompt, '--output-format', 'json', '--tools', 'WebSearch,WebFetch', '--permission-mode', 'dontAsk', ...(RUNNER_MODEL ? ['--model', RUNNER_MODEL] : []), '--json-schema', schemaText];
if (PLUGIN_DIR) args.splice(2, 0, '--plugin-dir', PLUGIN_DIR);
const child = spawn(CLAUDE_BIN, args, PLUGIN_DIR ? { cwd: PLUGIN_DIR } : {});
```

(`PLUGIN_DIR = process.env.PLUGIN_DIR || null` — remove any hardcoded default pointing into `/Users/carterking`.)

- [ ] **Step 4: Verify zero remaining references**

Run: `grep -rn -iE "launchd|launchagent|RUNNER_ONCE|--once|once-mode" /Users/carterking/Projects/dad/runner/.claude/worktrees/per-user-runners --include="*.mjs" --include="*.json" --include="*.md"`
Expected: no matches. Then `command npm test` → full suite green.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat!: single continuous mode — LaunchAgent and once-mode removed"`

---

### Task 8: Runner — npm packaging + README rewrite

**Files:**
- Modify: `runner/package.json`, `runner/index.mjs` (line 1 shebang), `runner/README.md` (full rewrite)

**Interfaces:**
- Produces: `command npx king-research-runner` runs the runner. Package name decided here feeds Task 9's onboarding copy.

- [ ] **Step 1: Check name availability** — `command npm view king-research-runner` → expect 404 (free). If taken, use `@ck22coding/king-research-runner` and carry that name through Task 9 + README.

- [ ] **Step 2: Package it**

`index.mjs` line 1: `#!/usr/bin/env node`

```json
{
  "name": "king-research-runner",
  "version": "0.1.0",
  "description": "Local research runner for King Research CRM — your computer is the backend.",
  "type": "module",
  "bin": { "king-research-runner": "./index.mjs" },
  "files": ["index.mjs", "README.md"],
  "engines": { "node": ">=20.12" },
  "license": "MIT",
  "scripts": { "test": "node --test --test-concurrency=1 test/startup.test.mjs test/lifecycle.test.mjs test/timeout.test.mjs test/pairing.test.mjs test/per-user.test.mjs" },
  "dependencies": { "@supabase/supabase-js": "^2.110.6" }
}
```

- [ ] **Step 3: README rewrite** — continuous mode only; sections: What it is (pull model, one paragraph), Install & pair (the 4 onboarding steps incl. `claude login` + `npx king-research-runner`), Env overrides table (`KR_SITE_URL`, `KR_CREDENTIALS_PATH`, `KR_ENV_FILE`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RUNNER_QUEUE`, `RUNNER_CONCURRENCY`, `RUNNER_MODEL`, `POLL_INTERVAL_MS`, `CLAUDE_BIN`, `PLUGIN_DIR`), Self-hosting (point env at your own Supabase/site), Testing (fixture account env vars are test-only). Zero mention of launchd/once/password auth.

- [ ] **Step 4: Smoke it** — `command npm pack --dry-run` lists exactly index.mjs, README.md, package.json; `node index.mjs` with `KR_CREDENTIALS_PATH` pointing at a paired creds file starts and logs `signed in as …`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: npm-packaged one-command runner"`

---

### Task 9: Web — onboarding page final copy

**Files:**
- Modify: `web/app/(app)/onboarding/page.tsx`

**Interfaces:** Consumes the package name from Task 8 and `<PairCard />` from Task 2.

- [ ] **Step 1: Rewrite the four cards** (keep existing `card`/`chips`/`chip` markup style):
  1. Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`, then `claude login` — copy: "Research runs with YOUR Claude subscription."
  2. Install the research plugin: `claude plugin marketplace add ck22coding/king-research` then `claude plugin install king-research@king-research` (implementer: verify exact install command against the plugin repo's README in `company-preview/skill/`).
  3. Start the runner: `npx king-research-runner` — copy: "Leave it running; it checks for your jobs every few seconds."
  4. `<PairCard />` (from Task 2).
  Remove the old step-3 card entirely (clone/copy runner folder, `.env` RUNNER_EMAIL/RUNNER_PASSWORD instructions). Sidebar link text "Set up the runner →" in `app/(app)/layout.tsx:58-60` stays.

- [ ] **Step 2: Verify** — pairing.spec.ts still green; `grep -rn -iE "RUNNER_EMAIL|RUNNER_PASSWORD|launchd|clone" app/\(app\)/onboarding/` → only `<PairCard />`-related copy, no hits for those terms. Full Playwright suite green.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: onboarding = 4-step per-user runner setup"`

---

### Task 10: Project docs scrub (outside the repos)

**Files:**
- Modify: `/Users/carterking/Projects/dad/BUILD.md` — runner/launchd passages
- Modify: `/Users/carterking/Projects/dad/.env` — no changes to values; this task only documents the contract change in BUILD.md (RUNNER_EMAIL/RUNNER_PASSWORD = test fixture only; add SUPABASE_SERVICE_ROLE_KEY note)

- [ ] **Step 1:** In BUILD.md, update the "On-demand" / launchd decision section (~line 151) and the Phase-4/5 runner notes: state the current shape (per-user paired runners, continuous mode; pointer to `web/docs/specs/2026-07-22-per-user-runners.md`). Historical phase logs may mention what was shipped THEN, but every forward-looking/how-it-works passage must describe only the new shape — no launchd, no `--once`, no shared runner account as a live mechanism.
- [ ] **Step 2:** `grep -n -iE "launchd|launchagent|--once" /Users/carterking/Projects/dad/BUILD.md` → hits only inside clearly-dated historical log lines, none in current-state sections.
- [ ] **Step 3:** No commit (BUILD.md is not in a git repo).

---

### Task 11: Publish — secrets audit, fold supabase/ into web, LICENSE + README, GitHub

**Files:**
- Create: `web/supabase/` (moved from root), `web/LICENSE`, `runner/LICENSE`, `web/README.md`
- Remotes: create `ck22coding/king-research-web`, `ck22coding/king-research-runner`, `ck22coding/king-research` (plugin, name already planned in BUILD.md Phase 5)

- [ ] **Step 1: Secrets history audit — hard gate for everything below.** For each of the three repos, from its root:

```bash
git log -p --all | grep -nEi "(service_role|sb_secret|SUPABASE_DB_PASSWORD|RUNNER_PASSWORD[[:space:]]*=|BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{30,}\.eyJ)" | head -50
```

Expected: zero hits, EXCEPT JWT-looking strings that are the public anon key (verify any `eyJ…` hit decodes to `"role":"anon"` — anon is public by design; a `"role":"service_role"` hit ABORTS publishing until history is rewritten). Also check `git log --all --diff-filter=A --name-only | grep -E "\.env"` → expect no .env files ever added.

- [ ] **Step 2: Fold supabase/ into web** — `cp -R /Users/carterking/Projects/dad/supabase <web-worktree>/supabase` (includes config.toml, migrations/, seed.sql; exclude any `.temp/` CLI cache). Commit: `git add supabase && git commit -m "feat: fold supabase schema into web repo"`. Verify CLI still works from the new home: `cd <web-worktree> && supabase link --project-ref dtwztzbvewheadjawdnb && supabase migration list` → matches. Then delete the root copy: `rm -rf /Users/carterking/Projects/dad/supabase` (AFTER the verify passes, never before).

- [ ] **Step 3: LICENSE + README** — MIT LICENSE (copyright 2026 Carter King) in web + runner (plugin repo: check for an existing LICENSE, add if missing). `web/README.md`: what the app is (3 sentences), the shared-site model, self-hosting pointer (own Supabase + Vercel + env vars list), link to spec/docs. Commit each repo.

- [ ] **Step 4: Publish** — `gh auth status` first (gate: if not logged in, ask Carter). Then merge each repo's `per-user-runners` branch to its local `main` FIRST (this is the reviewed-code gate — do not publish unreviewed branches; coordinate with Carter's Codex review), then from each repo's main checkout:

```bash
gh repo create ck22coding/king-research-web    --public --source /Users/carterking/Projects/dad/web    --push
gh repo create ck22coding/king-research-runner --public --source /Users/carterking/Projects/dad/runner --push
gh repo create ck22coding/king-research        --public --source /Users/carterking/Projects/dad/company-preview/skill --push
```

Expected: three public repos; `git remote -v` shows origin in each.

---

### Task 12: npm publish (gated on Carter)

- [ ] **Step 1:** `command npm whoami` — if not logged in, GATE: ask Carter to run `! command npm login` (interactive).
- [ ] **Step 2:** From the runner repo main checkout (post-merge): `command npm publish --access public` (drop `--access` if unscoped name). Expected: `+ king-research-runner@0.1.0`.
- [ ] **Step 3:** Verify cold-start UX on this very machine: `cd /tmp && command npx king-research-runner@latest` → prompts for a pairing code (Ctrl-C out; full pair happens in Task 13).

---

### Task 13: Cutover + end-to-end verification

- [ ] **Step 1: Vercel env** — add `SUPABASE_SERVICE_ROLE_KEY` to Production + Preview scopes (`vercel env add SUPABASE_SERVICE_ROLE_KEY production` etc., run from `web/`; value pasted by Carter or from `.env.local`).
- [ ] **Step 2: Deploy** — from web main checkout: `vercel deploy --prod`. Smoke: `/login` 200s; `/api/runner/pair` with garbage code → 401 JSON (not a redirect — proves the matcher exclusion deployed).
- [ ] **Step 3: Carter pairs his Mac** — `command npx king-research-runner`, paste code from production /onboarding. Expected: `signed in as carter…`, heartbeat row appears.
- [ ] **Step 4: Live smoke** — Carter (or the session, signed in as Carter is NOT possible — use the site) clicks Enrich on a real company; within ~5s the runner claims it; facts stream; banner never shows while the runner runs; stop the runner with jobs queued → banner appears within one refresh.
- [ ] **Step 5: Full suites** — web `command npx playwright test` green; runner `command npm test` green — run BOTH from main checkouts post-merge.
- [ ] **Step 6: Memory + BUILD.md status lines** — record shipped state in `dad-crm-per-user-runners` memory; update BUILD.md status header.

---

## Self-Review (done at write time)

- **Spec coverage:** pairing flow (T2/T3/T5), per-user claims + RLS (T1/T6), heartbeat banner (T4/T6), LaunchAgent total deletion (T7/T10), enrich-by-default (T1), GitHub publish + secrets scrub + supabase fold (T11), npm one-command runner (T8/T12), onboarding rewrite (T9), cutover (T13). Revocation UI + multi-tenant: out of scope per spec. ✓
- **Known deltas from spec, carried deliberately:** shared runner account survives as TEST fixture (global constraint note); `--once` deleted outright (its only test tested the mode itself). Flag both in the PR/review notes.
- **Type consistency:** `createPairingCode(): Promise<string>`; pair route `{code} → {token_hash}` consumed verbatim in T5; `ME.id` filters in T6 match T5's export; heartbeat column `last_seen_at` consistent across T1/T4/T6. ✓
- **Placeholder scan:** one deliberate implementer action ("PASTE_PUBLIC_ANON_KEY_HERE" with exact source stated), two verify-against-installed-types notes, one verify-plugin-install-command note — each states exactly where to look. No TBDs. ✓
