import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("allows all, disallows admin and unsubscribe, and points at the sitemap", () => {
    const r = robots();
    expect(r.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/avmelding", "/en/unsubscribe"],
    });
    expect(r.sitemap).toBe("https://xn--ramslk-fya.no/sitemap.xml");
  });
});
