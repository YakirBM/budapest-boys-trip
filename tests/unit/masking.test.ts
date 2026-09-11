import { describe, expect, it } from "vitest";
import { maskIdentifier, maskPolicyNumber, maskReservation } from "@/lib/utils/masking";

describe("maskReservation", () => {
  it("masks the Arkia reservation as 1385•••93 (doc 04 §5.1 snapshot)", () => {
    expect(maskReservation("13859993")).toBe("1385•••93");
  });
});

describe("maskIdentifier", () => {
  it("masks e-ticket serials as 4210•••••06 (doc 02 §Masking)", () => {
    expect(maskIdentifier("42103929206")).toBe("4210•••••06");
    expect(maskIdentifier("42103929195")).toBe("4210•••••95");
  });

  it("never returns the original value", () => {
    const masked = maskIdentifier("42103929206");
    expect(masked).not.toContain("42103929206");
    expect(masked).toContain("•");
  });
});

describe("maskPolicyNumber", () => {
  it("shows only the last 4 chars (doc 08 Card 2)", () => {
    expect(maskPolicyNumber("IL-482144821")).toBe("•••• 4821");
    expect(maskPolicyNumber("1234")).toBe("••••");
  });
});
