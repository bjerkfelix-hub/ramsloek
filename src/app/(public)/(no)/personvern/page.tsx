import type { Metadata } from "next";
import { PrivacyPage } from "@/features/public/pages/privacy-page";
import { pageMetadata } from "@/features/public/pages/metadata";

export const metadata: Metadata = pageMetadata("no", "privacy");

export default function Page() {
  return <PrivacyPage locale="no" />;
}
