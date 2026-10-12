// AI(Claude)に分析させて、答えが「決めた型」になっているか検査する。
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireEnv } from "../env";
import type { Summary } from "../analytics";
import { ANALYSIS_SYSTEM_PROMPT, buildUserMessage } from "./prompt";

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export const AnalysisSchema = z.object({
  summary: z.string().min(1).max(500),
  highlights: z.array(z.string().min(1)).min(1).max(5),
  concerns: z.array(z.string().min(1)).max(4),
  actions: z
    .array(z.object({ priority: z.enum(["high", "medium", "low"]), action: z.string().min(1) }))
    .min(1)
    .max(5),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export class AnalysisError extends Error {}

/** AI の返事から、JSON の部分を取り出す(前後に文章や ``` が付いていても読めるように) */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new AnalysisError("AI の返事に、JSON が見つかりませんでした。");
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new AnalysisError("AI の返事の JSON を読み取れませんでした。");
  }
}

/** 返事の文字を、検査して、型どおりの分析にする。型と違えば AnalysisError */
export function parseAnalysis(text: string): Analysis {
  const json = extractJson(text);
  const r = AnalysisSchema.safeParse(json);
  if (!r.success) throw new AnalysisError(`AI の返事が、決めた型と違いました: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / ")}`);
  return r.data;
}

/** AI に1回聞く部分。テストでは、これを偽物に差し替える */
export type Complete = (system: string, user: string) => Promise<string>;

export const completeWithClaude: Complete = async (system, user) => {
  const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  try {
    const res = await client.messages.create({ model, max_tokens: 2048, system, messages: [{ role: "user", content: user }] });
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401) throw new AnalysisError("Claude のAPIキーが正しくありません。ANTHROPIC_API_KEY を確認してください。");
    if (status === 404) throw new AnalysisError(`Claude のモデル名「${model}」が見つかりません。Vercel の環境変数 ANTHROPIC_MODEL に、使えるモデル名を入れて、再公開してください。`);
    if (status === 429 || status === 529) throw new AnalysisError("Claude が混み合っているか、利用上限です。少し待ってから、もう一度試してください。");
    throw new AnalysisError(`Claude でエラーが出ました: ${(e as Error).message}`);
  }
};

export function currentModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

/** 集計を渡して、分析を作る。型と違う返事のときは、1回だけ、やり直す */
export async function analyzeSummary(summary: Summary, complete: Complete = completeWithClaude): Promise<Analysis> {
  if (summary.months.length === 0) throw new AnalysisError("売上データがないため、分析できません。");
  const user = buildUserMessage(summary);
  let lastError: AnalysisError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const retryNote = attempt === 0 ? "" : "\n\n(前回の返事は、決めた JSON の型と違いました。JSON だけを、型どおりに返してください。)";
    const text = await complete(ANALYSIS_SYSTEM_PROMPT, user + retryNote);
    try {
      return parseAnalysis(text);
    } catch (e) {
      if (!(e instanceof AnalysisError)) throw e;
      lastError = e;
    }
  }
  throw lastError ?? new AnalysisError("分析を作れませんでした。");
}
