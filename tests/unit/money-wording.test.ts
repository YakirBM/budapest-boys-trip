import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import moneyJson from "@/messages/he/money.json";
import { t } from "@/lib/i18n";
import { convert, formatMinor, parseAmount } from "@/lib/utils/money";
import {
  buildBalanceBreakdownList,
  buildBalanceText,
  buildExpensePaidLine,
  buildExpenseSplitLine,
  buildTransferParticipants,
  buildTransferReason,
  resolveFxRate,
} from "@/components/feature/money/wording";

const BANNED = ["מאוזן", "מצב שווה"];

function collectLeaves(node: unknown, prefix: string, out: Array<{ path: string; value: string }>): void {
  if (typeof node === "string") {
    out.push({ path: prefix, value: node });
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      collectLeaves(v, prefix === "" ? k : `${prefix}.${k}`, out);
    }
  }
}

describe("money wording builders — docs/14 §5.1 (all net-sign cases)", () => {
  it("creditor (net > 0) names the member and the amount others owe him", () => {
    const text = buildBalanceText({ netHuf: 4133, name: "דני", amountFormatted: "4,133 Ft" });
    expect(text).toBe(t("money.balances.owedTo", { name: "דני", amount: "4,133 Ft" }));
    expect(text).toContain("דני");
    expect(text).toContain("4,133 Ft");
    for (const word of BANNED) expect(text).not.toContain(word);
  });

  it("debtor (net < 0) without breakdown names the amount owed", () => {
    const text = buildBalanceText({ netHuf: -2050, name: "יוסי", amountFormatted: "2,050 Ft" });
    expect(text).toBe(t("money.balances.owesDetail", { name: "יוסי", amount: "2,050 Ft" }));
    expect(text).toContain("יוסי");
    expect(text).toContain("2,050 Ft");
    for (const word of BANNED) expect(text).not.toContain(word);
  });

  it("debtor (net < 0) with breakdown lists every counterparty", () => {
    const list = buildBalanceBreakdownList([
      { name: "דני", amountFormatted: "1,200 Ft" },
      { name: "אבי", amountFormatted: "850 Ft" },
    ]);
    expect(list).toContain("דני");
    expect(list).toContain("אבי");
    const text = buildBalanceText({
      netHuf: -2050,
      name: "יוסי",
      amountFormatted: "2,050 Ft",
      breakdownList: list,
    });
    expect(text).toContain("יוסי");
    expect(text).toContain("2,050 Ft");
    expect(text).toContain("דני");
    expect(text).toContain("אבי");
    for (const word of BANNED) expect(text).not.toContain(word);
  });

  it("settled (net == 0) uses the clean sentence", () => {
    const text = buildBalanceText({ netHuf: 0, name: "אבי", amountFormatted: "0 Ft" });
    expect(text).toBe(t("money.balances.settledClean", { name: "אבי" }));
    expect(text).toContain("אבי");
    for (const word of BANNED) expect(text).not.toContain(word);
  });

  it("transfer reason uses repayFor with title, else the group reason", () => {
    const withTitle = buildTransferReason("מסעדת גונדל");
    expect(withTitle).toBe(t("money.transfer.repayFor", { title: "מסעדת גונדל" }));
    expect(withTitle).toContain("מסעדת גונדל");
    const fallback = buildTransferReason(null);
    expect(fallback).toBe(t("money.transfer.settlementReason"));
    for (const word of BANNED) {
      expect(withTitle).not.toContain(word);
      expect(fallback).not.toContain(word);
    }
  });

  it("transfer participants line carries the count", () => {
    const line = buildTransferParticipants(2);
    expect(line).toBe(t("money.transfer.participants", { count: 2 }));
    expect(line).toContain("2");
  });

  it("expense lines name the payer and every counterparty", () => {
    const paid = buildExpensePaidLine("דני", "12,400 Ft");
    expect(paid).toContain("דני");
    expect(paid).toContain("12,400 Ft");
    const split = buildExpenseSplitLine(["יוסי", "אבי", "דני"], 3);
    expect(split).toContain("יוסי");
    expect(split).toContain("אבי");
    expect(split).toContain("דני");
    expect(split).toContain("3");
    const single = buildExpenseSplitLine(["דני"], 1);
    expect(single).toContain("דני");
  });
});

describe("FX inverse fallback — docs/14 §5.2", () => {
  const rates = [
    { base: "HUF", quote: "ILS", rate: 0.0086, source: "frankfurter.app", fetched_at: "2026-09-11T09:00:00Z" },
  ];

  it("resolves the direct pair without the calculated flag", () => {
    const resolved = resolveFxRate("HUF", "ILS", rates);
    expect(resolved).not.toBeNull();
    expect(resolved?.rate).toBeCloseTo(0.0086, 10);
    expect(resolved?.calculated).toBe(false);
  });

  it("falls back to 1/inverse and marks it calculated", () => {
    const resolved = resolveFxRate("ILS", "HUF", rates);
    expect(resolved).not.toBeNull();
    expect(resolved?.rate).toBeCloseTo(1 / 0.0086, 6);
    expect(resolved?.calculated).toBe(true);
    expect(resolved?.source).toBe("frankfurter.app");
  });

  it("same currency is exactly 1 and never calculated", () => {
    const resolved = resolveFxRate("HUF", "HUF", rates);
    expect(resolved?.rate).toBe(1);
    expect(resolved?.calculated).toBe(false);
  });

  it("missing pair returns null", () => {
    expect(resolveFxRate("EUR", "USD", rates)).toBeNull();
  });
});

describe("decimal parsing + per-currency rounding", () => {
  it("accepts both comma and dot decimals", () => {
    expect(parseAmount("12.50", "ILS")).toBe(1250);
    expect(parseAmount("12,5", "ILS")).toBe(1250);
    expect(parseAmount("1,250.50", "ILS")).toBe(125050);
  });

  it("HUF has 0 decimals (rounds half-up)", () => {
    expect(parseAmount("45,000", "HUF")).toBe(45000);
    expect(parseAmount("12400.6", "HUF")).toBe(12401);
  });

  it("rejects non-numeric input", () => {
    expect(parseAmount("abc", "HUF")).toBeNull();
  });

  it("formats HUF with 0 decimals and ILS/EUR/USD with 2", () => {
    expect(formatMinor(45000, "HUF")).toContain("45,000");
    expect(formatMinor(15910, "ILS")).toContain("159.10");
    expect(formatMinor(1250, "EUR")).toContain("12");
  });

  it("converts with target-minor rounding", () => {
    expect(convert(18500, "HUF", "ILS", 0.0086)).toBe(15910);
  });
});

describe("no bare balanced wording in rendered strings", () => {
  it("money.json render keys (except money.even) contain no banned words", () => {
    const leaves: Array<{ path: string; value: string }> = [];
    collectLeaves((moneyJson as Record<string, unknown>)["money"], "money", leaves);
    const rendered = leaves.filter(({ path }) => path !== "money.even");
    expect(rendered.length).toBeGreaterThan(0);
    for (const { path, value } of rendered) {
      for (const word of BANNED) {
        expect(`${path}: ${value}`).not.toContain(word);
      }
    }
  });

  it("wording builders never emit banned words", () => {
    const samples = [
      buildBalanceText({ netHuf: 100, name: "א", amountFormatted: "100 Ft" }),
      buildBalanceText({ netHuf: -100, name: "ב", amountFormatted: "100 Ft" }),
      buildBalanceText({
        netHuf: -100,
        name: "ב",
        amountFormatted: "100 Ft",
        breakdownList: buildBalanceBreakdownList([{ name: "ג", amountFormatted: "100 Ft" }]),
      }),
      buildBalanceText({ netHuf: 0, name: "ד", amountFormatted: "0 Ft" }),
      buildTransferReason("ט"),
      buildTransferReason(null),
      buildTransferParticipants(3),
      buildExpensePaidLine("ה", "10 Ft"),
      buildExpenseSplitLine(["ו", "ז"], 2),
    ];
    for (const text of samples) {
      for (const word of BANNED) expect(text).not.toContain(word);
    }
  });

  it("money components do not render the bare even/owed/owes keys or banned literals", () => {
    const root = process.cwd();
    const files = [
      "components/feature/money/MoneyView.tsx",
      "components/feature/money/ConverterSheet.tsx",
      "components/feature/money/ExpenseForm.tsx",
      "components/feature/money/Reports.tsx",
      "components/feature/money/wording.ts",
    ];
    for (const file of files) {
      const src = readFileSync(join(root, file), "utf8");
      expect(src).not.toContain('"money.even"');
      expect(src).not.toContain("'money.even'");
      expect(src).not.toContain('"money.owes"');
      expect(src).not.toContain('"money.owed"');
      for (const word of BANNED) expect(src).not.toContain(word);
    }
  });
});
