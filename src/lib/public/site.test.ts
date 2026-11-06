import { describe, expect, it } from "vitest";
import { absoluteUrl, pageAlternates, SITE_URL } from "./site";

describe("absoluteUrl", () => {
  it("prefixes paths with the site origin", () => {
    expect(SITE_URL).toBe("https://xn--ramslk-fya.no");
    expect(absoluteUrl("/historien")).toBe(
      "https://xn--ramslk-fya.no/historien",
    );
    expect(absoluteUrl("/")).toBe("https://xn--ramslk-fya.no/");
  });
});

describe("pageAlternates", () => {
  it("maps a Norwegian page to nb, en and x-default", () => {
    expect(pageAlternates("/oppskrifter/ramslokpesto")).toEqual({
      canonical: "https://xn--ramslk-fya.no/oppskrifter/ramslokpesto",
      languages: {
        nb: "https://xn--ramslk-fya.no/oppskrifter/ramslokpesto",
        en: "https://xn--ramslk-fya.no/en/recipes/ramslokpesto",
        "x-default": "https://xn--ramslk-fya.no/oppskrifter/ramslokpesto",
      },
    });
  });
  it("has the same alternates for the English page, canonical being itself", () => {
    const a = pageAlternates("/en/markets");
    expect(a.canonical).toBe("https://xn--ramslk-fya.no/en/markets");
    expect(a.languages).toEqual({
      nb: "https://xn--ramslk-fya.no/marked",
      en: "https://xn--ramslk-fya.no/en/markets",
      "x-default": "https://xn--ramslk-fya.no/marked",
    });
  });
});
