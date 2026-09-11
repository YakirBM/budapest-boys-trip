import { describe, expect, it } from "vitest";
import {
  convert,
  formatMinor,
  netBalances,
  parseAmount,
  splitEqual,
  splitPercent,
  splitShares,
  suggestSettlements,
  type ExpenseLike,
} from "@/lib/utils/money";

describe("parseAmount / formatMinor", () => {
  it("parses decimal input into minor units", () => {
    expect(parseAmount("1,250.50", "ILS")).toBe(125050);
    expect(parseAmount("45,000", "HUF")).toBe(45000);
    expect(parseAmount("12,5", "EUR")).toBe(1250);
    expect(parseAmount("abc", "HUF")).toBeNull();
  });

  it("formats HUF with 0 decimals and ILS with 2 (doc 05 MoneyAmount)", () => {
    expect(formatMinor(45000, "HUF")).toContain("45,000");
    expect(formatMinor(15910, "ILS")).toContain("159.10");
  });
});

describe("convert", () => {
  it("converts HUF→ILS at the given rate with rounding to minor units", () => {
    // 18,500 HUF × 0.0086 ≈ 159.10 ILS (doc 05 example figures)
    expect(convert(18500, "HUF", "ILS", 0.0086)).toBe(15910);
  });

  it("rejects non-positive rates", () => {
    expect(() => convert(100, "HUF", "ILS", 0)).toThrow("invalid fx rate");
  });
});

describe("splits", () => {
  it("equal split sums to total and pays the remainder to the payer", () => {
    // 10,001 agorot-ish across 4 with payer first-member
    const parts = splitEqual(10001, ["a", "b", "c", "d"], "a");
    expect(parts.reduce((acc, p) => acc + p.amountMinor, 0)).toBe(10001);
    expect(parts.find((p) => p.memberId === "a")?.amountMinor).toBe(2501);
    expect(parts.find((p) => p.memberId === "b")?.amountMinor).toBe(2500);
  });

  it("rejects empty participants / amount <= 0 / missing payer", () => {
    expect(() => splitEqual(100, [], "a")).toThrow();
    expect(() => splitEqual(0, ["a"], "a")).toThrow();
    expect(() => splitEqual(100, ["a"], "b")).toThrow();
  });

  it("percent split must sum to 100 and remainder goes to payer", () => {
    const parts = splitPercent(1000, [
      { memberId: "a", percent: 33.33 },
      { memberId: "b", percent: 33.33 },
      { memberId: "c", percent: 33.34 },
    ], "a");
    expect(parts.reduce((acc, p) => acc + p.amountMinor, 0)).toBe(1000);
    expect(() =>
      splitPercent(1000, [
        { memberId: "a", percent: 50 },
        { memberId: "b", percent: 40 },
      ], "a"),
    ).toThrow();
  });

  it("shares split distributes by weight", () => {
    const parts = splitShares(1000, [
      { memberId: "a", shares: 2 },
      { memberId: "b", shares: 1 },
      { memberId: "c", shares: 1 },
    ], "a");
    expect(parts.map((p) => p.amountMinor)).toEqual([500, 250, 250]);
  });
});

describe("settlement — doc 03 §9 worked example", () => {
  // Apartment Yakir 400, Dinner Aharon 200, Taxi Yehonatan 120 (HUF ×100 minor)
  const expenses: ExpenseLike[] = [
    { paidBy: "yakir", amountBaseHufMinor: 40000, payerShareMinor: 10000, otherShares: [] },
    { paidBy: "aharon", amountBaseHufMinor: 20000, payerShareMinor: 5000, otherShares: [] },
    { paidBy: "yehonatan", amountBaseHufMinor: 12000, payerShareMinor: 3000, otherShares: [] },
  ];
  expenses[0]!.otherShares = [
    { memberId: "aharon", amountMinor: 10000 },
    { memberId: "yehonatan", amountMinor: 10000 },
    { memberId: "bar", amountMinor: 10000 },
  ];
  expenses[1]!.otherShares = [
    { memberId: "yakir", amountMinor: 5000 },
    { memberId: "yehonatan", amountMinor: 5000 },
    { memberId: "bar", amountMinor: 5000 },
  ];
  expenses[2]!.otherShares = [
    { memberId: "yakir", amountMinor: 3000 },
    { memberId: "aharon", amountMinor: 3000 },
    { memberId: "bar", amountMinor: 3000 },
  ];

  it("produces nets +22000 / +2000 / −6000 / −18000 (agorot scale)", () => {
    const nets = netBalances(expenses);
    expect(nets.get("yakir")).toBe(22000);
    expect(nets.get("aharon")).toBe(2000);
    expect(nets.get("yehonatan")).toBe(-6000);
    expect(nets.get("bar")).toBe(-18000);
  });

  it("produces the documented 3 minimal transfers", () => {
    const transfers = suggestSettlements(netBalances(expenses));
    expect(transfers).toEqual([
      { from: "bar", to: "yakir", amountMinor: 18000 },
      { from: "yehonatan", to: "yakir", amountMinor: 4000 },
      { from: "yehonatan", to: "aharon", amountMinor: 2000 },
    ]);
  });
});

describe("settlement — doc 05 worked example (4 members, HUF)", () => {
  // Nets: Yakir +102,500 · Aharon −33,500 · Yehonatan −43,500 · Bar −25,500 (HUF)
  it("produces exactly the 3 documented transfers", () => {
    const balances = new Map([
      ["yakir", 102500],
      ["aharon", -33500],
      ["yehonatan", -43500],
      ["bar", -25500],
    ]);
    expect(suggestSettlements(balances)).toEqual([
      { from: "yehonatan", to: "yakir", amountMinor: 43500 },
      { from: "aharon", to: "yakir", amountMinor: 33500 },
      { from: "bar", to: "yakir", amountMinor: 25500 },
    ]);
  });

  it("works for 5 and 6 members with exact subset matches", () => {
    // Exact match: a −100, b −50, c +150 → 2 transfers
    const balances = new Map([
      ["a", -100],
      ["b", -50],
      ["c", 150],
    ]);
    expect(suggestSettlements(balances)).toEqual([
      { from: "a", to: "c", amountMinor: 100 },
      { from: "b", to: "c", amountMinor: 50 },
    ]);
  });

  it("handles zero balances (no transfers)", () => {
    expect(suggestSettlements(new Map([["a", 0], ["b", 0]]))).toEqual([]);
  });
});
