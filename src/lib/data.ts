// データベースから、売上の明細・取り込みの記録・AI の分析を読む。
// どれも「ログインした人の権限」のクライアントで呼ぶ(自分のデータしか返らない)。
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SaleLike } from "./analytics";
import type { Analysis } from "./analysis/analyze";

export type UploadRecord = { id: string; filename: string; row_count: number; skipped_count: number; uploaded_at: string };
export type ReportRecord = { id: string; analysis: Analysis; model: string | null; generated_at: string };

export class DataError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

const PAGE = 1000; // Supabase は、1回に返す行数が 1000 行まで。超える分は、ページに分けて読む

/** 取り込みの記録を1件読む。自分のものでなければ(RLSで)見えないので、404 */
export async function loadUpload(client: SupabaseClient, uploadId: string): Promise<UploadRecord> {
  const { data, error } = await client
    .from("dash_uploads")
    .select("id, filename, row_count, skipped_count, uploaded_at")
    .eq("id", uploadId)
    .maybeSingle();
  if (error) throw new DataError(`取り込みの記録を読めませんでした: ${error.message}`);
  if (!data) throw new DataError("そのデータは見つかりません(削除されたか、あなたのものではありません)。", 404);
  return data as UploadRecord;
}

/** 売上の明細を、全部読む(1000行ごとに、ページを分けて) */
export async function loadSales(client: SupabaseClient, uploadId: string): Promise<SaleLike[]> {
  const out: SaleLike[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("dash_sales_data")
      .select("order_date, customer_id, product_name, category, sku, quantity, revenue, cost")
      .eq("upload_id", uploadId)
      .order("order_date")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new DataError(`売上データを読めませんでした: ${error.message}`);
    for (const r of data ?? []) {
      out.push({
        order_date: String(r.order_date),
        customer_id: r.customer_id,
        product_name: r.product_name,
        category: r.category,
        sku: r.sku,
        quantity: Number(r.quantity),
        revenue: Number(r.revenue),
        cost: Number(r.cost),
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function loadLatestReport(client: SupabaseClient, uploadId: string): Promise<ReportRecord | null> {
  const { data, error } = await client
    .from("dash_reports")
    .select("id, analysis, model, generated_at")
    .eq("upload_id", uploadId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DataError(`分析を読めませんでした: ${error.message}`);
  return (data as ReportRecord | null) ?? null;
}
