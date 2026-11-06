import { describe, expect, it } from "vitest";
import { recipes } from "@/content";
import sitemap from "./sitemap";

const SITE = "https://xn--ramslk-fya.no";

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("lists every public page in both languages", () => {
    for (const p of [
      "/",
      "/historien",
      "/oppskrifter",
      "/marked",
      "/personvern",
      "/en",
      "/en/story",
      "/en/recipes",
      "/en/markets",
      "/en/privacy",
    ]) {
      expect(urls).toContain(`${SITE}${p}`);
    }
  });
  it("lists every recipe in both languages", () => {
    for (const r of recipes) {
      expect(urls).toContain(`${SITE}/oppskrifter/${r.slug}`);
      expect(urls).toContain(`${SITE}/en/recipes/${r.slug}`);
    }
  });
  it("excludes admin and unsubscribe pages", () => {
    expect(urls.some((u) => /admin|avmelding|unsubscribe/.test(u))).toBe(false);
  });
  it("has hreflang alternates on each entry", () => {
    const story = entries.find((e) => e.url === `${SITE}/historien`);
    expect(story?.alternates?.languages).toEqual({
      nb: `${SITE}/historien`,
      en: `${SITE}/en/story`,
      "x-default": `${SITE}/historien`,
    });
  });
});
