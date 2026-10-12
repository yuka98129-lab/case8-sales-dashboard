import { NextResponse } from "next/server";
import { ConfigError } from "./env";
import { AnalysisError } from "./analysis/analyze";
import { DataError } from "./data";

/** どの API でも、同じ形でエラーを返す(画面には、日本語のメッセージをそのまま出す) */
export function errorResponse(e: unknown) {
  if (e instanceof DataError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ConfigError || e instanceof AnalysisError) return NextResponse.json({ error: e.message }, { status: 500 });
  console.error(e);
  return NextResponse.json({ error: (e as Error).message || "エラーが出ました。" }, { status: 500 });
}

export const unauthorized = () => NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
