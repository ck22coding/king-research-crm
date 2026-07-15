import { markets } from "@/lib/markets-data";
import MarketsTable from "./markets-table";

// Server component: the whole array is passed to the client filter
// component in one shot — no fetch, it's static sample data (BUILD.md,
// no markets table in v1).
export default function MarketsPage() {
  return <MarketsTable markets={markets} />;
}
