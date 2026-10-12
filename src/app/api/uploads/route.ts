import { NextResponse } from "next/server";
import { authenticate } from "@/lib/supabase-server";
import { DataError } from "@/lib/data";
import { errorResponse, unauthorized } from "@/lib/api-error";

// 自分が取り込んだデータの一覧(新しい順)
export async function GET(req: Request) {
  try {
    const session = await authenticate(req);
    if (!session) return unauthorized();
    const { data, error } = await session.client
      .from("dash_uploads")
      .select("id, filename, row_count, skipped_count, uploaded_at")
      .order("uploaded_at", { ascending: false })
      .limit(50);
    if (error) throw new DataError(`一覧を読めませんでした: ${error.message}`);
    return NextResponse.json({ uploads: data ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
}

// 取り込んだデータを削除する(売上の明細と、AI の分析も、一緒に消える)
export async function DELETE(req: Request) {
  try {
    const session = await authenticate(req);
    if (!session) return unauthorized();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "削除するデータの id がありません。" }, { status: 400 });
    const { data, error } = await session.client.from("dash_uploads").delete().eq("id", id).select("id");
    if (error) throw new DataError(`削除できませんでした: ${error.message}`);
    if (!data || data.length === 0) return NextResponse.json({ error: "そのデータは見つかりません。" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
