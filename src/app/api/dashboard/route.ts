import { NextResponse } from "next/server";
import { summarize } from "@/lib/analytics";
import { loadLatestReport, loadSales, loadUpload } from "@/lib/data";
import { authenticate } from "@/lib/supabase-server";
import { errorResponse, unauthorized } from "@/lib/api-error";

export const maxDuration = 60;

// 取り込んだデータを集計して、画面に出す数字を返す。AI の分析が保存されていれば、それも一緒に返す
export async function GET(req: Request) {
  try {
    const session = await authenticate(req);
    if (!session) return unauthorized();
    const uploadId = new URL(req.url).searchParams.get("uploadId");
    if (!uploadId) return NextResponse.json({ error: "uploadId がありません。" }, { status: 400 });

    const upload = await loadUpload(session.client, uploadId);
    const rows = await loadSales(session.client, uploadId);
    const report = await loadLatestReport(session.client, uploadId);
    return NextResponse.json({ upload, summary: summarize(rows), report });
  } catch (e) {
    return errorResponse(e);
  }
}
