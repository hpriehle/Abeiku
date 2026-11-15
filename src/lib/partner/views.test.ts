import { describe, expect, it } from "vitest";
import { partnerLink, partnerSiteUrl } from "./views";

describe("partnerSiteUrl", () => {
  it("aracuya defaults to aracuya.com, or ARACUYA_URL", () => {
    expect(partnerSiteUrl("aracuya", {} as unknown as NodeJS.ProcessEnv)).toBe("https://aracuya.com");
    expect(partnerSiteUrl("aracuya", { ARACUYA_URL: "https://www.aracuya.com/" } as unknown as NodeJS.ProcessEnv)).toBe(
      "https://www.aracuya.com"
    );
  });
  it("other hotels have no link unless PARTNER_SITE_URLS lists them", () => {
    expect(partnerSiteUrl("test-hotel", {} as unknown as NodeJS.ProcessEnv)).toBeNull();
    const env = { PARTNER_SITE_URLS: '{"test-hotel":"https://test-hotel.example/","aracuya":"https://a.example"}' };
    expect(partnerSiteUrl("test-hotel", env as unknown as NodeJS.ProcessEnv)).toBe("https://test-hotel.example");
    expect(partnerSiteUrl("aracuya", env as unknown as NodeJS.ProcessEnv)).toBe("https://a.example");
  });
  it("ignores bad config instead of producing a broken link", () => {
    expect(partnerSiteUrl("x", { PARTNER_SITE_URLS: "not json" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(partnerSiteUrl("x", { PARTNER_SITE_URLS: '{"x":"javascript:alert(1)"}' } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("partnerLink", () => {
  it("adds the ref code, or is null without a site", () => {
    expect(partnerLink("kofi tours", "https://aracuya.com")).toBe("https://aracuya.com/?ref=kofi%20tours");
    expect(partnerLink("kofi", null)).toBeNull();
  });
});
