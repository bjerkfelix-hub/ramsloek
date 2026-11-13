import { describe, expect, it } from "vitest";
import { getDictionary, recipes } from "@/content";
import type { MarketDay } from "@/lib/domain/season";
import {
  jsonLdString,
  localBusinessJsonLd,
  marketEventJsonLd,
  osloIso,
  recipeJsonLd,
} from "./structured-data";

describe("osloIso", () => {
  it("uses +01:00 in winter and +02:00 in summer", () => {
    expect(osloIso("2027-01-15", "10:00")).toBe("2027-01-15T10:00:00+01:00");
    expect(osloIso("2027-05-08", "10:00")).toBe("2027-05-08T10:00:00+02:00");
  });
  it("handles the days the clocks change", () => {
    expect(osloIso("2027-03-28", "10:00")).toBe("2027-03-28T10:00:00+02:00");
    expect(osloIso("2027-03-27", "10:00")).toBe("2027-03-27T10:00:00+01:00");
    expect(osloIso("2027-10-31", "10:00")).toBe("2027-10-31T10:00:00+01:00");
    expect(osloIso("2027-10-30", "10:00")).toBe("2027-10-30T10:00:00+02:00");
  });
});

describe("jsonLdString", () => {
  it("escapes closing tags so the script element cannot be ended early", () => {
    const s = jsonLdString({ a: "</script><b>" });
    expect(s).not.toContain("</");
    expect(JSON.parse(s)).toEqual({ a: "</script><b>" });
  });
  it("escapes every < and the U+2028/U+2029 separators", () => {
    const value = { a: "<!-- <script> \u2028 \u2029 x" };
    const s = jsonLdString(value);
    expect(s).not.toContain("<");
    expect(s).not.toContain("\u2028");
    expect(s).not.toContain("\u2029");
    expect(JSON.parse(s)).toEqual(value);
  });
});

describe("recipeJsonLd", () => {
  it("describes a recipe in the given language", () => {
    const r = recipes[0];
    const ld = recipeJsonLd(r, "en") as Record<string, unknown>;
    expect(ld["@type"]).toBe("Recipe");
    expect(ld.inLanguage).toBe("en");
    expect(ld.name).toBe(r.title.en);
    expect(ld.recipeIngredient).toEqual(r.ingredients.en);
    expect(ld.totalTime).toBe("PT15M");
    expect((ld.recipeInstructions as { "@type": string }[])[0]["@type"]).toBe(
      "HowToStep",
    );
    expect(ld.recipeYield).toBe("4 servings");
  });
  it("omits totalTime when there is no exact duration", () => {
    const r = recipes.find((x) => !x.durationIso)!;
    expect(recipeJsonLd(r, "no")).not.toHaveProperty("totalTime");
    expect(recipeJsonLd(r, "no")).toHaveProperty("inLanguage", "nb");
  });
});

const day: MarketDay = {
  id: "1",
  marketDate: "2027-05-08",
  startsAt: "10:00",
  endsAt: "15:00",
  placeName: "Torget",
  address: "Torget 1, Oslo",
  noteNo: null,
  noteEn: null,
  cancelled: false,
};

describe("marketEventJsonLd", () => {
  it("builds an Event with Oslo-offset times and place", () => {
    const ld = marketEventJsonLd(day, "no") as Record<string, unknown>;
    expect(ld["@type"]).toBe("Event");
    expect(ld.name).toBe("Torget");
    expect(ld.startDate).toBe("2027-05-08T10:00:00+02:00");
    expect(ld.endDate).toBe("2027-05-08T15:00:00+02:00");
    expect(ld.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(ld.eventAttendanceMode).toBe(
      "https://schema.org/OfflineEventAttendanceMode",
    );
    expect(ld.location).toEqual({
      "@type": "Place",
      name: "Torget",
      address: "Torget 1, Oslo",
    });
  });
  it("marks cancelled days", () => {
    expect(marketEventJsonLd({ ...day, cancelled: true }, "en")).toHaveProperty(
      "eventStatus",
      "https://schema.org/EventCancelled",
    );
  });
});

describe("localBusinessJsonLd", () => {
  it("describes the business without invented address, phone or hours", () => {
    const d = localBusinessJsonLd("en");
    expect(d).toMatchObject({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Ramsløk.no",
      url: "https://xn--ramslk-fya.no/en",
      email: "felix@dontpanic.no",
      areaServed: "Oslo",
      inLanguage: "en",
    });
    expect(d.description).toBe(getDictionary("en").pages.home.description);
    for (const k of ["address", "telephone", "openingHours", "openingHoursSpecification"]) {
      expect(d).not.toHaveProperty(k);
    }
    expect(localBusinessJsonLd("no").url).toBe("https://xn--ramslk-fya.no/");
  });
});
