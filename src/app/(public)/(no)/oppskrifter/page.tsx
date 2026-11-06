import { RecipesPage } from "@/features/public/pages/recipes-page";
import { pageMetadataFor } from "@/features/public/pages/metadata";

export const generateMetadata = pageMetadataFor("no", "recipes");

export default function Page() {
  return <RecipesPage locale="no" />;
}
