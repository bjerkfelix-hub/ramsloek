import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { recipes } from "@/content";
import { RecipePage } from "@/features/public/pages/recipe-page";
import { ROUTES } from "@/lib/public/routes";
import { pageSocialMetadata, withParentShareImage } from "@/lib/public/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return recipes.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug } = await params;
  const recipe = recipes.find((r) => r.slug === slug);
  if (!recipe) return {};
  return withParentShareImage(
    pageSocialMetadata({
    title: `${recipe.title.en} – Ramsløk.no`,
    description: recipe.intro.en,
    path: `${ROUTES.en.recipes}/${recipe.slug}`,
  }),
    parent,
  );
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const recipe = recipes.find((r) => r.slug === slug);
  if (!recipe) notFound();
  return <RecipePage recipe={recipe} locale="en" />;
}
