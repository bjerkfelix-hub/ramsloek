import { RecipesPage } from "@/features/public/pages/recipes-page";
import { pageMetadataFor } from "@/features/public/pages/metadata";

export const generateMetadata = pageMetadataFor("en", "recipes");

export default function Page() {
  return <RecipesPage locale="en" />;
}
