import { StoryPage } from "@/features/public/pages/story-page";
import { pageMetadataFor } from "@/features/public/pages/metadata";

export const generateMetadata = pageMetadataFor("en", "story");

export default function Page() {
  return <StoryPage locale="en" />;
}
