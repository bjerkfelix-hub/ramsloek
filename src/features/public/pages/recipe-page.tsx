import Link from "next/link";
import { format, getDictionary, type Locale, type Recipe } from "@/content";
import { ROUTES } from "@/lib/public/routes";
import { recipeJsonLd } from "@/lib/public/structured-data";
import { JsonLd } from "../json-ld";

export function RecipePage({
  recipe,
  locale,
}: {
  recipe: Recipe;
  locale: Locale;
}) {
  const { recipes: t } = getDictionary(locale);
  return (
    <article className="flex flex-col gap-8 pb-4 pt-8 sm:pt-12">
      <JsonLd data={recipeJsonLd(recipe, locale)} />
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-[2.25rem] font-semibold text-ink sm:text-5xl">
          {recipe.title[locale]}
        </h1>
        <p className="max-w-[60ch] text-lg text-muted">
          {recipe.intro[locale]}
        </p>
        <p className="flex flex-wrap gap-x-6 gap-y-1 font-medium">
          <span>
            {t.time}: {recipe.time[locale]}
          </span>
          <span>{format(t.servings, { count: recipe.servings })}</span>
        </p>
      </header>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-semibold text-forest">
          {t.ingredients}
        </h2>
        <ul className="flex max-w-[65ch] list-disc flex-col gap-1 pl-6 text-lg">
          {recipe.ingredients[locale].map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-semibold text-forest">
          {t.steps}
        </h2>
        <ol className="flex max-w-[65ch] list-decimal flex-col gap-3 pl-6 text-lg">
          {recipe.steps[locale].map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
      <p className="max-w-[65ch] rounded-xl bg-sage px-4 py-3 text-muted">
        {t.safetyNote}
      </p>
      <p>
        <Link
          href={ROUTES[locale].recipes}
          className="inline-block py-1 font-medium text-forest underline"
        >
          {t.allRecipes}
        </Link>
      </p>
    </article>
  );
}
