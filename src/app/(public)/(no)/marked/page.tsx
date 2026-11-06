import type { Metadata } from "next";
import { MarketsPage } from "@/features/public/pages/markets-page";
import { pageMetadata } from "@/features/public/pages/metadata";

export const metadata: Metadata = pageMetadata("no", "markets");

export default function Page() {
  return <MarketsPage locale="no" />;
}
