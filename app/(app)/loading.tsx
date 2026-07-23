// Instant navigation feedback: shown the moment a nav click happens, while
// the target page's Supabase queries run. Without this file the old page
// stays frozen until the new one fully streams in, which reads as "lag".
export default function Loading() {
  return <div className="empty">Loading…</div>;
}
