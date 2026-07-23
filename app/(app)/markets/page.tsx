import { markets } from "@/lib/markets-data";
import MarketsTable from "./markets-table";
import DeckView from "./deck-view";

// Server component: the whole array is passed to the client filter
// component in one shot — no fetch, it's static sample data (BUILD.md,
// no markets table in v1). ?view=deck swaps the table for the shared
// market-assessment deck (same query-view pattern the company page uses).
export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  if (view === "deck") return <DeckView />;
  return <MarketsTable markets={markets} />;
}
