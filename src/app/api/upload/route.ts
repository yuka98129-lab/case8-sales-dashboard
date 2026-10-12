import { NextResponse } from "next/server";
import { parseSalesCsv, REQUIRED_COLUMNS } from "@/lib/csv/parser";
import { authenticate } from "@/lib/supabase-server";
import { errorResponse, unauthorized } from "@/lib/api-error";

export const maxDuration = 60;

const MAX_CHARS = 3_000_000; // Vercel は、1回に送れる大きさが 4.5MB まで
const MAX_ROWS = 5000;
const MAX_INVALID_RETURNED = 500;

const COLUMN_LABEL: Record<string, string> = {
  order_date: "日付(order_date)",
  product_name: "商品名(product_name)",
  quantity: "数量(quantity)",
  revenue: "売上(revenue)",
  cost: "原価(cost)",
};

// CSV を受け取って、読み取り・検査をして、問題のない行だけを、まとめて保存する。
// おかしい行は、捨てるのではなく「何行目が、なぜダメか」を返す。
export async function POST(req: Request) {
  try {
    const session = await authenticate(req);
    if (!session) return unauthorized();

    const body = (await req.json().catch(() => null)) as { filename?: unknown; csv?: unknown } | null;
    const csv = typeof body?.csv === "string" ? body.csv : "";
    const filename = typeof body?.filename === "string" && body.filename.trim() ? body.filename.trim().slice(0, 200) : "sales.csv";
    if (!csv.trim()) return NextResponse.json({ error: "CSV の中身が空です。" }, { status: 400 });
    if (csv.length > MAX_CHARS) return NextResponse.json({ error: "CSV が大きすぎます(3MB まで)。期間を分けて取り込んでください。" }, { status: 413 });

    const parsed = parseSalesCsv(csv);
    if (parsed.missingColumns.length > 0) {
      const missing = parsed.missingColumns.map((c) => COLUMN_LABEL[c] ?? c).join("、");
      return NextResponse.json(
        {
          error: `必要な列が足りません: ${missing}。見出し(1行目)を確認してください。必要な列: ${REQUIRED_COLUMNS.map((c) => COLUMN_LABEL[c]).join("、")}`,
        },
        { status: 400 },
      );
    }
    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: "取り込める行が1つもありませんでした。", invalid: parsed.invalid.slice(0, MAX_INVALID_RETURNED), headers: parsed.headers, totalRows: parsed.totalRows },
        { status: 400 },
      );
    }
    if (parsed.rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `行が多すぎます(${parsed.rows.length}行)。${MAX_ROWS}行までにしてください。` }, { status: 413 });
    }

    // ログインした本人の権限で、1回の処理にまとめて保存する(途中で失敗したら、全部なかったことになる)
    const { data, error } = await session.client.rpc("dash_import_sales", {
      p_filename: filename,
      p_skipped: parsed.invalid.length,
      p_rows: parsed.rows,
    });
    if (error) {
      const hint = /dash_import_sales|schema cache|does not exist/i.test(error.message) ? "(データベースの準備ができていない可能性があります。supabase/schema.sql を実行したか確認してください)" : "";
      return NextResponse.json({ error: `保存できませんでした: ${error.message}${hint}` }, { status: 500 });
    }

    return NextResponse.json({
      uploadId: data as string,
      imported: parsed.rows.length,
      skipped: parsed.invalid.length,
      totalRows: parsed.totalRows,
      invalid: parsed.invalid.slice(0, MAX_INVALID_RETURNED),
      headers: parsed.headers,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
