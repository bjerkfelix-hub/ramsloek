import { expect, test } from "@playwright/test";
import {
  adminClient,
  deleteTestMarketDays,
  E2E_PLACE_PREFIX,
  isoInDays,
} from "./helpers";

const place = `${E2E_PLACE_PREFIX}Sidetorget ${Date.now()}`;

test.beforeAll(async () => {
  await deleteTestMarketDays();
  const { error } = await adminClient()
    .from("market_days")
    .insert([
      {
        market_date: isoInDays(5),
        starts_at: "10:00",
        ends_at: "15:00",
        place_name: place,
        address: "Torget 9, Oslo",
        cancelled: false,
      },
      {
        market_date: isoInDays(6),
        starts_at: "10:00",
        ends_at: "14:00",
        place_name: `${place} avlyst`,
        address: "Torget 8, Oslo",
        cancelled: true,
      },
    ]);
  if (error) throw error;
});
test.afterAll(deleteTestMarketDays);

const SITE = "https://xn--ramslk-fya.no";
const pages = [
  {
    path: "/historien",
    h1: "Historien vår",
    lang: "nb",
    no: "/historien",
    en: "/en/story",
  },
  {
    path: "/oppskrifter",
    h1: "Oppskrifter",
    lang: "nb",
    no: "/oppskrifter",
    en: "/en/recipes",
  },
  {
    path: "/marked",
    h1: "Marked",
    lang: "nb",
    no: "/marked",
    en: "/en/markets",
  },
  {
    path: "/personvern",
    h1: "Personvern",
    lang: "nb",
    no: "/personvern",
    en: "/en/privacy",
  },
  {
    path: "/en/story",
    h1: "Our story",
    lang: "en",
    no: "/historien",
    en: "/en/story",
  },
  {
    path: "/en/recipes",
    h1: "Recipes",
    lang: "en",
    no: "/oppskrifter",
    en: "/en/recipes",
  },
  {
    path: "/en/markets",
    h1: "Markets",
    lang: "en",
    no: "/marked",
    en: "/en/markets",
  },
  {
    path: "/en/privacy",
    h1: "Privacy",
    lang: "en",
    no: "/personvern",
    en: "/en/privacy",
  },
];

for (const p of pages) {
  test(`${p.path} renders with heading and hreflang links`, async ({
    page,
  }) => {
    const res = await page.goto(p.path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", p.lang);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.h1);
    await expect(
      page.locator('link[rel="alternate"][hreflang="nb"]'),
    ).toHaveAttribute("href", SITE + p.no);
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]'),
    ).toHaveAttribute("href", SITE + p.en);
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]'),
    ).toHaveAttribute("href", SITE + p.no);
  });
}

test("recipe list has six cards linking to detail pages (NO and EN)", async ({
  page,
}) => {
  await page.goto("/oppskrifter");
  const links = page
    .getByRole("main")
    .getByRole("link", { name: "Se oppskrift" });
  await expect(links).toHaveCount(6);
  await expect(links.first()).toHaveAttribute(
    "href",
    /^\/oppskrifter\/[a-z0-9-]+$/,
  );
  await page.goto("/en/recipes");
  const en = page.getByRole("main").getByRole("link", { name: "View recipe" });
  await expect(en).toHaveCount(6);
  await expect(en.first()).toHaveAttribute(
    "href",
    /^\/en\/recipes\/[a-z0-9-]+$/,
  );
});

test("recipe detail has Recipe JSON-LD and alternates for the slug", async ({
  page,
}) => {
  await page.goto("/oppskrifter/ramslokpesto");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Ramsløkpesto",
  );
  const ld = JSON.parse(
    (await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent()) ?? "{}",
  );
  expect(ld["@type"]).toBe("Recipe");
  expect(ld.inLanguage).toBe("nb");
  expect(ld.recipeIngredient.length).toBeGreaterThan(3);
  await expect(
    page.locator('link[rel="alternate"][hreflang="en"]'),
  ).toHaveAttribute("href", `${SITE}/en/recipes/ramslokpesto`);
  await page.goto("/en/recipes/ramslokpesto");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Wild garlic pesto",
  );
  const en = JSON.parse(
    (await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent()) ?? "{}",
  );
  expect(en["@type"]).toBe("Recipe");
  expect(en.inLanguage).toBe("en");
});

test("unknown recipe slug is a 404 in both languages", async ({ page }) => {
  expect((await page.goto("/oppskrifter/finnes-ikke"))?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Siden finnes ikke",
  );
  expect((await page.goto("/en/recipes/does-not-exist"))?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Page not found",
  );
});

test("markets page lists seeded days and has Event JSON-LD", async ({
  page,
}) => {
  await page.goto("/marked");
  await expect(
    page.getByRole("listitem").filter({ hasText: place }).first(),
  ).toContainText("kl. 10–15");
  await expect(
    page.getByRole("listitem").filter({ hasText: `${place} avlyst` }),
  ).toContainText("Avlyst");
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  const events = blocks
    .map((b) => JSON.parse(b))
    .filter((o) => o["@type"] === "Event");
  const mine = events.find((e) => e.name === place);
  expect(mine.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T10:00:00\+0[12]:00$/);
  expect(mine.eventStatus).toBe("https://schema.org/EventScheduled");
  expect(events.find((e) => e.name === `${place} avlyst`).eventStatus).toBe(
    "https://schema.org/EventCancelled",
  );
  await page.goto("/en/markets");
  await expect(
    page.getByRole("listitem").filter({ hasText: place }).first(),
  ).toContainText("10–15");
});

test("privacy page shows contact email and no unsubscribe-in-every-notice promise", async ({
  page,
}) => {
  await page.goto("/personvern");
  await expect(
    page.getByRole("main").getByRole("link", { name: "post@ramsløk.no" }),
  ).toHaveAttribute("href", "mailto:post@xn--ramslk-fya.no");
  await expect(page.getByRole("main")).not.toContainText("hver beskjed");
});
