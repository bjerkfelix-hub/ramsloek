import { MarketsPage } from "@/features/public/pages/markets-page";
import { pageMetadataFor } from "@/features/public/pages/metadata";

export const generateMetadata = pageMetadataFor("no", "markets");

export default function Page() {
  return <MarketsPage locale="no" />;
}
