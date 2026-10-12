import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeCsv } from "../src/lib/csv/decode";
import { invalidRowsToCsv, normalizeDate, normalizeHeader, parseNumber, parseSalesCsv } from "../src/lib/csv/parser";

const FIXTURE = readFileSync("tests/fixtures/sample-sales.csv", "utf8");
const HEAD = "order_date,customer_id,product_name,category,sku,quantity,revenue,cost";

describe("配られたサンプル CSV(40行)", () => {
  it("40行すべてが読み取れて、スキップは0行", () => {
    const r = parseSalesCsv(FIXTURE);
    expect(r.missingColumns).toEqual([]);
    expect(r.totalRows).toBe(40);
    expect(r.rows).toHaveLength(40);
    expect(r.invalid).toHaveLength(0);
  });

  it("1行目の中身が、そのまま正しく読まれる", () => {
    const [first] = parseSalesCsv(FIXTURE).rows;
    expect(first).toEqual({
      order_date: "2025-09-03",
      customer_id: "C001",
      product_name: "オーガニックコットンTシャツ",
      category: "トップス",
      sku: "LUM-TOP-01",
      quantity: 2,
      revenue: 7600,
      cost: 2800,
    });
  });
});

describe("列の名前のゆれ", () => {
  it.each([
    ["Order Date", "order_date"],
    ["Created at", "order_date"],
    ["created_at", "order_date"],
    ["注文日", "order_date"],
    ["Lineitem name", "product_name"],
    ["Lineitem quantity", "quantity"],
    ["Lineitem sku", "sku"],
    ["Product Type", "category"],
    ["  SKU  ", "sku"],
    ["﻿order_date", "order_date"],
    ["売上", "revenue"],
    ["原価", "cost"],
    ["Something Else", "something_else"],
  ])("「%s」→ %s", (input, expected) => {
    expect(normalizeHeader(input)).toBe(expected);
  });

  it("Shopify 風の見出しでも、読み取れる", () => {
    const csv = ["Created at,Customer,Lineitem name,Product Type,Lineitem sku,Lineitem quantity,Line Total,Cost per item", "2025-09-03 10:15:00 +0900,C1,Tシャツ,トップス,T-1,2,\"7,600\",2800"].join("\n");
    const r = parseSalesCsv(csv);
    expect(r.invalid).toEqual([]);
    expect(r.rows[0]).toMatchObject({ order_date: "2025-09-03", customer_id: "C1", product_name: "Tシャツ", quantity: 2, revenue: 7600, cost: 2800 });
  });

  it("先頭に BOM が付いた CSV(Excel で保存したもの)でも、読み取れる", () => {
    const r = parseSalesCsv("﻿" + FIXTURE);
    expect(r.rows).toHaveLength(40);
  });
});

describe("日付のゆれ", () => {
  it.each([
    ["2025-09-03", "2025-09-03"],
    ["2025/9/3", "2025-09-03"],
    ["2025/09/03", "2025-09-03"],
    ["2025.9.3", "2025-09-03"],
    ["2025年9月3日", "2025-09-03"],
    ["2025-09-03 10:15:00 +0900", "2025-09-03"],
    ["2025-09-03T10:15:00+09:00", "2025-09-03"],
    ["２０２５／９／３".replace(/／/g, "/"), "2025-09-03"],
  ])("「%s」→ %s", (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });

  it.each(["", "abc", "2025-13-01", "2025-02-30", "2025-00-10", "9/3/2025", "2025-9"])("読めない日付「%s」は null", (input) => {
    expect(normalizeDate(input)).toBeNull();
  });

  it("うるう年の2月29日は、2024年は読めて、2025年は読めない", () => {
    expect(normalizeDate("2024-02-29")).toBe("2024-02-29");
    expect(normalizeDate("2025-02-29")).toBeNull();
  });
});

describe("数字のゆれ", () => {
  it.each([
    ["7600", 7600],
    ["7,600", 7600],
    ["¥7,600", 7600],
    ["7600円", 7600],
    ["１２００", 1200],
    [" 12.5 ", 12.5],
    ["0", 0],
  ])("「%s」→ %s", (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
  it.each(["", "abc", "1.2.3", "12abc"])("読めない数字「%s」は null", (input) => {
    expect(parseNumber(input)).toBeNull();
  });
});

describe("おかしい行は、捨てずに、行番号と理由を返す", () => {
  const csv = [
    HEAD,
    "2025-09-03,C1,Tシャツ,トップス,T-1,2,7600,2800", // 2行目: 正常
    "2025-13-40,C2,パンツ,ボトムス,B-1,1,8900,3400", // 3行目: 日付が不正
    "2025-09-05,C3,スカーフ,アクセサリー,A-1,0,5800,1900", // 4行目: 数量が 0
    "2025-09-06,C4,コート,アウター,O-1,1,abc,9800", // 5行目: 売上が数字ではない
    "", // 6行目: 空行(数えない。でも、行番号はずらさない)
    "2025-09-07,C5,,トップス,T-2,1,6800,2600", // 7行目: 商品名が空
    "2025-09-08,C6,ベルト,アクセサリー,A-2,1,4500,-1", // 8行目: 原価がマイナス
    "2025-09-09,C7,ブラウス,トップス,T-3,1,6800,2600", // 9行目: 正常
  ].join("\n");
  const r = parseSalesCsv(csv);

  it("正常な行だけが、rows に入る", () => {
    expect(r.rows.map((x) => x.customer_id)).toEqual(["C1", "C7"]);
  });

  it("スキップした行が、Excel と同じ行番号で、理由つきで返る(空行があっても、ずれない)", () => {
    expect(r.invalid.map((x) => x.row)).toEqual([3, 4, 5, 7, 8]);
    expect(r.invalid[0].reason).toContain("日付");
    expect(r.invalid[1].reason).toContain("数量");
    expect(r.invalid[2].reason).toContain("売上");
    expect(r.invalid[3].reason).toContain("商品名");
    expect(r.invalid[4].reason).toContain("原価");
  });

  it("「成功 + スキップ = 全部の行(空行をのぞく)」が、いつも成り立つ", () => {
    expect(r.rows.length + r.invalid.length).toBe(r.totalRows);
    expect(r.totalRows).toBe(7);
  });

  it("スキップした行を、CSV としてダウンロードできる(行番号・理由・元の列)", () => {
    const out = invalidRowsToCsv(r.invalid, r.headers);
    expect(out.startsWith("﻿行番号,理由,")).toBe(true);
    const lines = out.replace("﻿", "").split("\r\n");
    expect(lines).toHaveLength(1 + 5);
    expect(lines[1]).toContain("3,");
    expect(lines[1]).toContain("2025-13-40");
  });
});

describe("必須の列が足りないとき", () => {
  it("足りない列の名前を返して、行は1つも処理しない", () => {
    const r = parseSalesCsv("order_date,product_name,quantity\n2025-09-03,Tシャツ,2");
    expect(r.missingColumns).toEqual(["revenue", "cost"]);
    expect(r.rows).toEqual([]);
    expect(r.totalRows).toBe(0);
  });
  it("customer_id・sku・category が無くても、取り込める(空として扱う)", () => {
    const r = parseSalesCsv("order_date,product_name,quantity,revenue,cost\n2025-09-03,Tシャツ,2,7600,2800");
    expect(r.invalid).toEqual([]);
    expect(r.rows[0]).toMatchObject({ customer_id: null, sku: null, category: null });
  });
});

describe("文字コード", () => {
  it("UTF-8 は、そのまま読める", () => {
    const buf = new TextEncoder().encode("商品名");
    expect(decodeCsv(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)).toBe("商品名");
  });
  it("Shift_JIS(Excel で保存した日本語の CSV)も、読める", () => {
    // 「商品」を Shift_JIS にした並び: 8F A4 95 69
    const sjis = new Uint8Array([0x8f, 0xa4, 0x95, 0x69]);
    expect(decodeCsv(sjis.buffer as ArrayBuffer)).toBe("商品");
  });
});
