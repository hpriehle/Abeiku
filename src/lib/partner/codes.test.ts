import { describe, expect, it } from "vitest";
import { codeFromName, dedupeCode } from "./codes";

describe("codeFromName", () => {
  it("keeps short names as they were", () => {
    expect(codeFromName("Carmen's Travels")).toBe("carmen-travels");
    expect(codeFromName("Kofi & Ama Tours Ltd.")).toBe("kofi-ama-tours-ltd");
    expect(codeFromName("Café Ébène")).toBe("cafe-ebene");
  });
  it("drops parentheticals (the carmen-travels-carmen-travel-and-tou bug)", () => {
    expect(codeFromName("Carmen Travels (Carmen Travel and Tours)")).toBe("carmen-travels");
    expect(codeFromName("OGVO (Our Ghana Volunteer Organisation)")).toBe("ogvo");
    expect(codeFromName("Bilson (unclosed")).toBe("bilson");
  });
  it("drops everything after a slash", () => {
    expect(codeFromName("Ama Tours / Elmina Beach Branch")).toBe("ama-tours");
    expect(codeFromName("Kofi/Ama")).toBe("kofi");
  });
  it("caps long names at a word boundary", () => {
    const code = codeFromName("Right Choice Travel and Tours Agency Limited Cape Coast");
    expect(code).toBe("right-choice-travel-and");
    expect(code.length).toBeLessThanOrEqual(24);
    expect(codeFromName("Supercalifragilisticexpialidocious Tours")).toBe("supercalifragilisticexpi");
  });
  it("falls back to 'partner' when nothing usable is left", () => {
    expect(codeFromName("(only brackets)")).toBe("partner");
    expect(codeFromName("/x")).toBe("partner");
    expect(codeFromName("é")).toBe("partner");
  });
  it("dedupes with a suffix", () => {
    expect(dedupeCode("carmen-travels", ["carmen-travels"])).toBe("carmen-travels-2");
  });
});
