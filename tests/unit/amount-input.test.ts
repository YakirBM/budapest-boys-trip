import { describe, expect, it } from "vitest";
import { formatMinor, parseAmount } from "@/lib/utils/money";

/**
 * Phase 0 gate for AmountInput: parsing/formatting contract shared by money,
 * schedule costs and the converter (docs/14 §5.3). The component itself wraps
 * these helpers; behavior is asserted here without DOM.
 */
describe("AmountInput contract", () => {
  it("parses decimal dot and comma for ILS (2 decimals)", () => {
    expect(parseAmount("12.50", "ILS")).toBe(1250);
    expect(parseAmount("12,5", "ILS")).toBe(1250);
  });

  it("treats thousands separators correctly", () => {
    expect(parseAmount("1,250.50", "ILS")).toBe(125050);
    expect(parseAmount("45,000", "HUF")).toBe(45000);
  });

  it("HUF has zero decimals (rounds)", () => {
    expect(parseAmount("12400.6", "HUF")).toBe(12401);
  });

  it("rejects non-numeric input", () => {
    expect(parseAmount("abc", "ILS")).toBeNull();
    expect(parseAmount("", "ILS")).toBeNull();
  });

  it("formats per-currency decimals", () => {
    expect(formatMinor(45000, "HUF")).not.toContain(".");
    expect(formatMinor(1250, "ILS")).toContain("12");
  });
});
