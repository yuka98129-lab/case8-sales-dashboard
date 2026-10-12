// 売上 CSV を読み取って、検査する。
//   ・列の名前のゆれ("Order Date" / "Created at" / 注文日 …)を、先に1つの名前にそろえる
//   ・日付の書き方のゆれ(2025/9/3、2025年9月3日、2025-09-03 10:00:00 +0900 …)を、YYYY-MM-DD にそろえる
//   ・おかしい行は、黙って捨てない。「何行目が、なぜダメか」を必ず返す(合計がずれる原因になるため)
// ブラウザでもサーバーでも動く、ふつうの関数(ファイルの読み込みは、呼ぶ側でやる)。
import Papa from "papaparse";

export type SaleRow = {
  order_date: string; // YYYY-MM-DD
  customer_id: string | null;
  product_name: string;
  category: string | null;
  sku: string | null;
  quantity: number;
  revenue: number;
  cost: number;
};

export type InvalidRow = {
  row: number; // CSV の行番号(1行目=見出し。Excel で開いたときの行番号と同じ)
  reason: string;
  raw: Record<string, string>;
};

export type ParseResult = {
  rows: SaleRow[];
  invalid: InvalidRow[];
  totalRows: number; // 空行をのぞいた、データ行の数(rows + invalid)
  headers: string[]; // 見出し(そろえたあと)
  missingColumns: string[]; // 足りない必須の列
};

export const REQUIRED_COLUMNS = ["order_date", "product_name", "quantity", "revenue", "cost"] as const;

// 列の名前のゆれ。左が「そろえたあとの名前」、右が「同じ意味として扱う名前」
const ALIASES: Record<string, string[]> = {
  order_date: ["order_date", "order date", "created at", "created_at", "processed at", "processed_at", "date", "注文日", "注文日時", "日付", "購入日"],
  customer_id: ["customer_id", "customer id", "customer", "customer email", "email", "顧客id", "顧客", "顧客番号", "会員id"],
  product_name: ["product_name", "product name", "product", "lineitem name", "line item name", "title", "item name", "商品名", "商品"],
  category: ["category", "product type", "type", "カテゴリ", "カテゴリー", "商品カテゴリ"],
  sku: ["sku", "lineitem sku", "line item sku", "品番", "商品コード"],
  quantity: ["quantity", "lineitem quantity", "line item quantity", "qty", "数量", "個数"],
  revenue: ["revenue", "sales", "line total", "total", "売上", "売上金額", "金額"],
  cost: ["cost", "cost per item", "原価", "仕入れ値", "仕入原価"],
};

const ALIAS_LOOKUP = new Map<string, string>();
for (const [canonical, names] of Object.entries(ALIASES)) for (const n of names) ALIAS_LOOKUP.set(normalizeKey(n), canonical);

function normalizeKey(h: string): string {
  return h
    .replace(/^﻿/, "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, " ");
}

/** "Order Date" → "order_date" のように、見出しを、そろえた名前に直す。知らない見出しは、そのまま(小文字・_ つなぎ)にする */
export function normalizeHeader(h: string): string {
  const key = normalizeKey(h);
  return ALIAS_LOOKUP.get(key) ?? key.replace(/ /g, "_");
}

const FULL_TO_HALF = (s: string) => s.normalize("NFKC");

/** 日付を YYYY-MM-DD にそろえる。読めなければ null。存在しない日付(2月30日など)も null */
export function normalizeDate(input: string): string | null {
  const s = FULL_TO_HALF(input).trim();
  if (!s) return null;
  // 2025-09-03 / 2025/9/3 / 2025.9.3 / 2025-09-03 10:00:00 +0900 / 2025-09-03T10:00:00+09:00 (時刻以降は読まない)
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  // 2025年9月3日
  if (!m) m = s.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?(?:\s.*)?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "¥7,600" "7600円" "１，２００" のような書き方を、数字にする。読めなければ null */
export function parseNumber(input: string): number | null {
  const s = FULL_TO_HALF(input)
    .trim()
    .replace(/[¥￥円,\s]/g, "");
  if (!s) return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const clean = (v: string | undefined): string | null => {
  const t = (v ?? "").normalize("NFKC").trim();
  return t === "" ? null : t;
};

const isEmptyRow = (r: Record<string, string>) => Object.values(r).every((v) => (v ?? "").trim() === "");

export function parseSalesCsv(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: false, // 空行を消すと、行番号がずれるので、自分で読み飛ばす
    transformHeader: normalizeHeader,
  });
  const headers = (parsed.meta.fields ?? []).filter((h) => h !== "");
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));

  const rows: SaleRow[] = [];
  const invalid: InvalidRow[] = [];
  let totalRows = 0;
  if (missingColumns.length > 0) return { rows, invalid, totalRows, headers, missingColumns: [...missingColumns] };

  parsed.data.forEach((raw, i) => {
    if (isEmptyRow(raw)) return;
    totalRows++;
    const row = i + 2; // 1行目は見出し
    const reasons: string[] = [];

    const dateRaw = clean(raw.order_date);
    const order_date = dateRaw ? normalizeDate(dateRaw) : null;
    if (!dateRaw) reasons.push("日付が空です");
    else if (!order_date) reasons.push(`日付「${dateRaw}」を読めません(例: 2025-09-03)`);

    const product_name = clean(raw.product_name);
    if (!product_name) reasons.push("商品名が空です");

    const qRaw = clean(raw.quantity);
    const q = qRaw ? parseNumber(qRaw) : null;
    if (qRaw === null) reasons.push("数量が空です");
    else if (q === null || !Number.isInteger(q) || q <= 0) reasons.push(`数量「${qRaw}」は、1以上の整数にしてください`);

    const rRaw = clean(raw.revenue);
    const revenue = rRaw ? parseNumber(rRaw) : null;
    if (rRaw === null) reasons.push("売上が空です");
    else if (revenue === null || revenue < 0) reasons.push(`売上「${rRaw}」は、0以上の数字にしてください`);

    const cRaw = clean(raw.cost);
    const cost = cRaw ? parseNumber(cRaw) : null;
    if (cRaw === null) reasons.push("原価が空です");
    else if (cost === null || cost < 0) reasons.push(`原価「${cRaw}」は、0以上の数字にしてください`);

    if (reasons.length > 0) {
      invalid.push({ row, reason: reasons.join(" / "), raw });
      return;
    }
    rows.push({
      order_date: order_date!,
      customer_id: clean(raw.customer_id),
      product_name: product_name!,
      category: clean(raw.category),
      sku: clean(raw.sku),
      quantity: q!,
      revenue: revenue!,
      cost: cost!,
    });
  });

  return { rows, invalid, totalRows, headers, missingColumns: [] };
}

/** スキップした行を、ダウンロードできる CSV の文字にする(Excel で開けるよう、先頭に BOM を付ける) */
export function invalidRowsToCsv(invalid: InvalidRow[], headers: string[]): string {
  const cols = headers.length > 0 ? headers : Array.from(new Set(invalid.flatMap((r) => Object.keys(r.raw))));
  const body = invalid.map((r) => ({ 行番号: r.row, 理由: r.reason, ...Object.fromEntries(cols.map((c) => [c, r.raw[c] ?? ""])) }));
  return "﻿" + Papa.unparse(body, { columns: ["行番号", "理由", ...cols] });
}
