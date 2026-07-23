// Nearest loading boundary for company-record navigations (list → record,
// record → record) so the skeleton shows inside the shell immediately.
export default function Loading() {
  return <div className="empty">Loading company…</div>;
}
