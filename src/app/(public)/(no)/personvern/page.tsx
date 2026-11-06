import { PrivacyPage } from "@/features/public/pages/privacy-page";
import { pageMetadataFor } from "@/features/public/pages/metadata";

export const generateMetadata = pageMetadataFor("no", "privacy");

export default function Page() {
  return <PrivacyPage locale="no" />;
}
