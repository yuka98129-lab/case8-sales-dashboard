// 配られた「正解の数字」(README の集計の正解値)と、アプリの集計が、1円も違わず一致するかを確かめる。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { changePct, kpiFor, summarize } from "../src/lib/analytics";
import { parseSalesCsv } from "../src/lib/csv/parser";

const rows = parseSalesCsv(readFileSync("tests/fixtures/sample-sales.csv", "utf8")).rows;
const s = summarize(rows);
const byMonth = Object.fromEntries(s.months.map((m) => [m.month, m]));

describe("月次の売上・粗利(正解値)", () => {
  it("2025-09: 売上 ¥148,400 / 粗利 ¥93,400", () => {
    expect(byMonth["2025-09"].revenue).toBe(148_400);
    expect(byMonth["2025-09"].profit).toBe(93_400);
  });
  it("2025-10: 売上 ¥147,500 / 粗利 ¥92,600", () => {
    expect(byMonth["2025-10"].revenue).toBe(147_500);
    expect(byMonth["2025-10"].profit).toBe(92_600);
  });
  it("2025-11: 売上 ¥264,700 / 粗利 ¥163,100", () => {
    expect(byMonth["2025-11"].revenue).toBe(264_700);
    expect(byMonth["2025-11"].profit).toBe(163_100);
  });
  it("合計: 売上 ¥560,600 / 粗利 ¥349,100", () => {
    expect(s.totals.revenue).toBe(560_600);
    expect(s.totals.profit).toBe(349_100);
  });
  it("月は3つで、古い順に並ぶ", () => {
    expect(s.months.map((m) => m.month)).toEqual(["2025-09", "2025-10", "2025-11"]);
  });
});

describe("カテゴリ別の売上(正解値)", () => {
  it("アウター ¥287,400 / トップス ¥114,400 / ボトムス ¥82,200 / アクセサリー ¥76,600(売上の多い順)", () => {
    expect(s.categories.map((c) => [c.category, c.revenue])).toEqual([
      ["アウター", 287_400],
      ["トップス", 114_400],
      ["ボトムス", 82_200],
      ["アクセサリー", 76_600],
    ]);
  });
  it("カテゴリの合計 = 全体の売上(取りこぼし・二重計上がない)", () => {
    expect(s.categories.reduce((a, c) => a + c.revenue, 0)).toBe(s.totals.revenue);
    expect(s.categories.reduce((a, c) => a + c.profit, 0)).toBe(s.totals.profit);
  });
  it("月ごとのカテゴリ売上の合計も、その月の売上と一致する", () => {
    for (const m of s.months) {
      const sum = Object.values(s.categoryByMonth[m.month]).reduce((a, b) => a + b, 0);
      expect(sum).toBe(m.revenue);
    }
  });
  it("11月は、アウターが ¥198,200(10月の ¥44,600 から急増)", () => {
    expect(s.categoryByMonth["2025-11"]["アウター"]).toBe(198_200);
    expect(s.categoryByMonth["2025-10"]["アウター"]).toBe(44_600);
  });
});

describe("リピート率(正解値)", () => {
  it("総顧客 28人 / リピーター 8人 → 28.6%", () => {
    expect(s.totals.customers).toBe(28);
    expect(s.totals.repeaters).toBe(8);
    expect(s.totals.repeatRate).toBe(28.6);
  });
  it("月ごと: 9月 0/12、10月 5/13、11月 7/15(それ以前の月にも買った人)", () => {
    expect([byMonth["2025-09"].customers, byMonth["2025-09"].returningCustomers]).toEqual([12, 0]);
    expect([byMonth["2025-10"].customers, byMonth["2025-10"].returningCustomers]).toEqual([13, 5]);
    expect([byMonth["2025-11"].customers, byMonth["2025-11"].returningCustomers]).toEqual([15, 7]);
    expect(byMonth["2025-10"].returningRate).toBe(38.5);
    expect(byMonth["2025-11"].returningRate).toBe(46.7);
  });
  it("顧客IDが無いデータでは、リピート率は null(0%と、嘘をつかない)", () => {
    const x = summarize(rows.map((r) => ({ ...r, customer_id: null })));
    expect(x.totals.repeatRate).toBeNull();
    expect(x.noCustomerIdRows).toBe(40);
  });
});

describe("前月比", () => {
  it("11月の売上は、10月の約1.8倍(+79.5%)", () => {
    const k = kpiFor(s, "2025-11")!;
    expect(k.previousMonth).toBe("2025-10");
    expect(k.revenueChange).toBe(79.5);
    expect(k.profitChange).toBe(76.1);
    expect(k.profitMargin).toBe(61.6);
  });
  it("10月の売上は、9月より少し減る(-0.6%)", () => {
    expect(kpiFor(s, "2025-10")!.revenueChange).toBe(-0.6);
  });
  it("最初の月は、前月がないので、前月比は null", () => {
    const k = kpiFor(s, "2025-09")!;
    expect(k.previousMonth).toBeNull();
    expect(k.revenueChange).toBeNull();
  });
  it("リピート率の前月との差は、ポイントで出る(11月: +8.2pt)", () => {
    expect(kpiFor(s, "2025-11")!.returningRateDiffPt).toBe(8.2);
  });
  it("前月が0のときは、割り算せず null", () => {
    expect(changePct(100, 0)).toBeNull();
    expect(changePct(100, undefined)).toBeNull();
  });
});

describe("売れ筋(数量の多い順)", () => {
  it("8商品。数量が同じなら、売上が多い方が先", () => {
    expect(s.skuTop.map((x) => [x.sku, x.quantity, x.revenue])).toEqual([
      ["LUM-TOP-01", 14, 53_200],
      ["LUM-TOP-02", 9, 61_200],
      ["LUM-ACC-01", 8, 36_000],
      ["LUM-OUT-02", 7, 138_600],
      ["LUM-ACC-02", 7, 40_600],
      ["LUM-OUT-01", 6, 148_800],
      ["LUM-BTM-01", 6, 53_400],
      ["LUM-BTM-02", 4, 28_800],
    ]);
  });
  it("数量の合計は、元の行の数量の合計と一致する", () => {
    expect(s.skuTop.reduce((a, x) => a + x.quantity, 0)).toBe(rows.reduce((a, r) => a + r.quantity, 0));
  });
  it("11月の上位5件は、月の中だけで数える", () => {
    expect(s.skuTopByMonth["2025-11"]).toHaveLength(5);
    expect(s.skuTopByMonth["2025-11"][0].quantity).toBeGreaterThanOrEqual(s.skuTopByMonth["2025-11"][4].quantity);
  });
});

describe("守り", () => {
  it("行を逆順にしても、同じ集計になる(並び順に左右されない)", () => {
    expect(summarize([...rows].reverse())).toEqual(s);
  });
  it("空のデータでも、落ちない", () => {
    const e = summarize([]);
    expect(e.months).toEqual([]);
    expect(e.totals).toMatchObject({ revenue: 0, profit: 0, customers: 0, repeatRate: null });
  });
  it("カテゴリが空の行は「(カテゴリなし)」にまとまる", () => {
    const x = summarize(rows.map((r, i) => (i === 0 ? { ...r, category: null } : r)));
    expect(x.categories.find((c) => c.category === "(カテゴリなし)")?.revenue).toBe(7600);
    expect(x.categories.reduce((a, c) => a + c.revenue, 0)).toBe(560_600);
  });
});
