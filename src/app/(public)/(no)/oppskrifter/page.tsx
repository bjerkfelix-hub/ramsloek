import type { Metadata } from "next";
import { RecipesPage } from "@/features/public/pages/recipes-page";
import { pageMetadata } from "@/features/public/pages/metadata";

export const metadata: Metadata = pageMetadata("no", "recipes");

export default function Page() {
  return <RecipesPage locale="no" />;
}
