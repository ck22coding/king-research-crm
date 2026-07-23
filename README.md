# King Research CRM

An open-source research CRM where **your own computer is the backend**. The
hosted website only stores data and queues jobs; the actual research runs on
each user's machine via [`king-research-runner`](https://www.npmjs.com/package/king-research-runner),
signed in as that user through their own Claude subscription. No shared server
does the AI work — everyone is self-sufficient.

- **Company enrichment** — queue a company, your runner researches it and
  writes back a 7-section brief with cited sources, downloadable as a PDF.
- **Market assessment** — side-by-side TAM/SAM estimates, segmentation,
  competitive landscape, and dynamics for a market.
- **Review gate** — suggested sources are approved or denied before the
  report prose is generated, so nothing unvetted lands in the PDF.

Live instance: <https://king-research.vercel.app>

## How it works

```
┌────────────┐   insert job row    ┌──────────────┐   claim job (as you)  ┌──────────────────┐
│  Website   │ ──────────────────▶ │   Supabase   │ ◀──────────────────── │  Your runner     │
│ (Next.js)  │                     │ (DB + auth)  │   write facts back     │ (claude -p, your │
│  Vercel    │ ◀────────────────── │              │ ─────────────────────▶│  machine)        │
└────────────┘   read facts/PDF    └──────────────┘                        └──────────────────┘
```

A web click can't run research directly — Anthropic's terms forbid a hosted
backend using subscription tokens — so `claude -p` has to run on your machine.
You pair your computer once with a one-time code from the website; the runner
stores its own session and polls for jobs where `requested_by` is you.

## Stack

- **Next.js** (App Router; middleware lives in `proxy.ts`) on **Vercel**
- **Supabase** — Postgres, auth, and row-level security; migrations in `supabase/`
- **The runner** — [`king-research-runner`](https://www.npmjs.com/package/king-research-runner) (separate repo)

## Local development

1. Install deps: `npm install`
2. Create a Supabase project and apply the migrations:
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push
   ```
3. Copy the env vars into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>   # server-only, never exposed
   ```
4. Run it: `npm run dev` → <http://localhost:3000>

To do actual research locally, also run a paired runner — see the
[runner README](https://www.npmjs.com/package/king-research-runner).

## License

MIT — see [LICENSE](./LICENSE).
