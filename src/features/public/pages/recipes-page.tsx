import Link from "next/link";
import { format, getDictionary, recipes, type Locale } from "@/content";
import { ROUTES } from "@/lib/public/routes";
import { PageHeading } from "./page-heading";

export function RecipesPage({ locale }: { locale: Locale }) {
  const { recipes: t } = getDictionary(locale);
  const base = ROUTES[locale].recipes;
  return (
    <div className="flex flex-col gap-8 pb-4 pt-8 sm:pt-12">
      <PageHeading title={t.heading} lead={t.lead} />
      <ul className="grid gap-4 sm:grid-cols-2">
        {recipes.map((r) => (
          <li
            key={r.slug}
            className="flex flex-col gap-2 rounded-xl border border-line bg-cream px-5 py-5"
          >
            <h2 className="font-display text-xl font-semibold text-forest">
              {r.title[locale]}
            </h2>
            <p className="text-sm text-muted">
              {r.time[locale]} · {format(t.servings, { count: r.servings })}
            </p>
            <p>{r.intro[locale]}</p>
            <p className="mt-auto pt-1">
              <Link
                href={`${base}/${r.slug}`}
                className="inline-block py-1 font-medium text-forest underline"
              >
                {t.readRecipe}
                <span className="sr-only">: {r.title[locale]}</span>
              </Link>
            </p>
          </li>
        ))}
      </ul>
      <p className="max-w-[65ch] text-muted">{t.safetyNote}</p>
    </div>
  );
}
