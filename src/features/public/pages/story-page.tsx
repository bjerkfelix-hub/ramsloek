import { getDictionary, type Locale } from "@/content";
import { LeafIllustration } from "../leaf-illustration";
import { PageHeading } from "./page-heading";

// No real photo yet: the slot stays in code but renders nothing until an image is set here.
const STORY_IMAGE: string | null = null

export function StoryPage({ locale }: { locale: Locale }) {
  const { story } = getDictionary(locale);
  return (
    <div className="flex flex-col gap-10 pb-4 pt-8 sm:pt-12">
      <PageHeading title={story.heading} lead={story.lead} />
      {STORY_IMAGE && (
        <div
          role="img"
          aria-label={story.imagePlaceholder}
          className="flex aspect-[16/9] items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-sage text-muted"
        >
          <LeafIllustration className="w-10 text-forest" />
          <span>{story.imagePlaceholder}</span>
        </div>
      )}
      {story.sections.map((section) => (
        <section
          key={section.heading}
          className="flex max-w-[65ch] flex-col gap-3 text-lg"
        >
          <h2 className="font-display text-2xl font-semibold text-forest sm:text-3xl">
            {section.heading}
          </h2>
          {section.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
      <section className="flex max-w-[65ch] flex-col gap-4 rounded-2xl border border-line bg-cream px-5 py-6 text-lg sm:px-7">
        <h2 className="font-display text-2xl font-semibold text-forest sm:text-3xl">
          {story.safetyHeading}
        </h2>
        <p>{story.safetyIntro}</p>
        <ul className="flex list-disc flex-col gap-2 pl-6">
          {story.safetyTips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
        <p>{story.safetyAdvice}</p>
      </section>
    </div>
  );
}
