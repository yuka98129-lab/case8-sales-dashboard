import { NextResponse } from "next/server";
import { summarize } from "@/lib/analytics";
import { analyzeSummary, currentModel } from "@/lib/analysis/analyze";
import { DataError, loadSales, loadUpload } from "@/lib/data";
import { authenticate } from "@/lib/supabase-server";
import { errorResponse, unauthorized } from "@/lib/api-error";

export const maxDuration = 60;

// AI に分析させて、型どおりか検査して、保存する(作り直すたびに、新しいものが保存される)
export async function POST(req: Request) {
  try {
    const session = await authenticate(req);
    if (!session) return unauthorized();
    const body = (await req.json().catch(() => null)) as { uploadId?: unknown } | null;
    const uploadId = typeof body?.uploadId === "string" ? body.uploadId : "";
    if (!uploadId) return NextResponse.json({ error: "uploadId がありません。" }, { status: 400 });

    await loadUpload(session.client, uploadId); // 自分のデータか確かめる
    const summary = summarize(await loadSales(session.client, uploadId));
    const analysis = await analyzeSummary(summary);

    const { data, error } = await session.client
      .from("dash_reports")
      .insert({
        upload_id: uploadId,
        summary: analysis.summary,
        action_items: JSON.stringify(analysis.actions),
        analysis,
        model: currentModel(),
      })
      .select("id, analysis, model, generated_at")
      .single();
    if (error) throw new DataError(`分析を保存できませんでした: ${error.message}`);
    return NextResponse.json({ report: data });
  } catch (e) {
    return errorResponse(e);
  }
}
