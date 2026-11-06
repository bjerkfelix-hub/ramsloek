import type { Metadata } from "next";
import { StoryPage } from "@/features/public/pages/story-page";
import { pageMetadata } from "@/features/public/pages/metadata";

export const metadata: Metadata = pageMetadata("en", "story");

export default function Page() {
  return <StoryPage locale="en" />;
}
