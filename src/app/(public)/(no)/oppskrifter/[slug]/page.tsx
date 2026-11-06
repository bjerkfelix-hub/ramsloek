import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { recipes } from "@/content";
import { RecipePage } from "@/features/public/pages/recipe-page";
import { ROUTES } from "@/lib/public/routes";
import { pageAlternates } from "@/lib/public/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return recipes.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const recipe = recipes.find((r) => r.slug === slug);
  if (!recipe) return {};
  return {
    title: `${recipe.title.no} – Nesodden Ramsløk`,
    description: recipe.intro.no,
    alternates: pageAlternates(`${ROUTES.no.recipes}/${recipe.slug}`),
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const recipe = recipes.find((r) => r.slug === slug);
  if (!recipe) notFound();
  return <RecipePage recipe={recipe} locale="no" />;
}
