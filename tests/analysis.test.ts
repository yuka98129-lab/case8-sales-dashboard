// AI 分析の品質を守るテスト。
//   ・Snapshot: 「AI に渡す指示」と「AI に渡す数字(JSON)」が、前と変わっていないか。変わったら、差分が出る
//   ・型の検査: AI の返事が、決めた JSON の型どおりか(前後に文章や ``` が付いても読めるか)
//   ・AI は、毎回、少しずつ違う文章を返す。だから、このテストは、本物の AI を呼ばない(お金もかからず、毎回同じ結果になる)
//     本物の AI の返事を確かめたいときは、手元で `npm run check:ai` を使う
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { summarize } from "../src/lib/analytics";
import { AnalysisError, analyzeSummary, extractJson, parseAnalysis } from "../src/lib/analysis/analyze";
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisInput, buildUserMessage } from "../src/lib/analysis/prompt";
import { parseSalesCsv } from "../src/lib/csv/parser";

const summary = summarize(parseSalesCsv(readFileSync("tests/fixtures/sample-sales.csv", "utf8")).rows);

const GOOD = {
  summary: "11月の売上は約264,700円で、前月比+79.5%でした。アウターが約198,200円と売上を牽引しています。",
  highlights: ["アウターが10月の約44,600円から約198,200円へ急増", "粗利も前月比+76.1%", "リピート率が上昇"],
  concerns: ["アウターへの依存が高い", "データが3か月分のみ"],
  actions: [
    { priority: "high", action: "ウールコートの在庫を12月分も確保する" },
    { priority: "medium", action: "トップスの冬向けコーディネート提案をメールで配信する" },
  ],
};

describe("Snapshot(前と変わっていないか)", () => {
  it("AI への指示(システムプロンプト)", () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatchSnapshot();
  });
  it("AI に渡す数字(サンプル CSV の集計)", () => {
    expect(buildAnalysisInput(summary)).toMatchSnapshot();
  });
});

describe("AI に渡す入力", () => {
  const input = buildAnalysisInput(summary);
  it("一番新しい月と、その前の月が、入っている", () => {
    expect(input.latestMonth).toBe("2025-11");
    expect(input.previousMonth).toBe("2025-10");
  });
  it("アウターの急増が、数字で読み取れる(+153,600円)", () => {
    const outer = input.categoryChangeLatestVsPrevious.find((c) => c.category === "アウター")!;
    expect(outer.latestMonthRevenue).toBe(198_200);
    expect(outer.previousMonthRevenue).toBe(44_600);
    expect(outer.change).toBe(153_600);
  });
  it("同じデータからは、いつも同じ文字になる", () => {
    expect(buildUserMessage(summary)).toBe(buildUserMessage(summarize([...parseSalesCsv(readFileSync("tests/fixtures/sample-sales.csv", "utf8")).rows].reverse())));
  });
});

describe("指示に、約束ごとが書かれている", () => {
  it.each(["summary", "highlights", "concerns", "actions", "priority", "JSON", "Markdown", "具体"])("「%s」", (word) => {
    expect(ANALYSIS_SYSTEM_PROMPT).toContain(word);
  });
});

describe("AI の返事の読み取り", () => {
  it("JSON だけの返事を読める", () => {
    expect(parseAnalysis(JSON.stringify(GOOD))).toEqual(GOOD);
  });
  it("```json で囲まれていても、読める", () => {
    expect(parseAnalysis("```json\n" + JSON.stringify(GOOD) + "\n```")).toEqual(GOOD);
  });
  it("前後に文章が付いていても、読める", () => {
    expect(parseAnalysis("分析しました。\n" + JSON.stringify(GOOD) + "\n以上です。")).toEqual(GOOD);
  });
  it("JSON が無い返事は、エラー", () => {
    expect(() => extractJson("すみません、分析できません")).toThrow(AnalysisError);
  });
  it("壊れた JSON は、エラー", () => {
    expect(() => extractJson('{"summary": "途中で切れ')).toThrow(AnalysisError);
  });
  it("型と違う返事(actions が無い / priority が違う / summary が空)は、エラー", () => {
    expect(() => parseAnalysis(JSON.stringify({ ...GOOD, actions: undefined }))).toThrow(AnalysisError);
    expect(() => parseAnalysis(JSON.stringify({ ...GOOD, actions: [{ priority: "urgent", action: "x" }] }))).toThrow(AnalysisError);
    expect(() => parseAnalysis(JSON.stringify({ ...GOOD, summary: "" }))).toThrow(AnalysisError);
  });
});

describe("分析の実行(AI は偽物に差し替え)", () => {
  it("型どおりの返事なら、そのまま分析になる。AI には、指示と数字が渡る", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(GOOD));
    const r = await analyzeSummary(summary, complete);
    expect(r).toEqual(GOOD);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0]).toBe(ANALYSIS_SYSTEM_PROMPT);
    expect(complete.mock.calls[0][1]).toBe(buildUserMessage(summary));
  });
  it("最初の返事が型と違っても、1回だけやり直して、成功すれば使う", async () => {
    const complete = vi.fn().mockResolvedValueOnce("JSONではありません").mockResolvedValueOnce(JSON.stringify(GOOD));
    expect(await analyzeSummary(summary, complete)).toEqual(GOOD);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][1]).toContain("JSON だけを");
  });
  it("2回続けて型と違えば、エラーにする(おかしな文章を、画面に出さない)", async () => {
    const complete = vi.fn().mockResolvedValue("JSONではありません");
    await expect(analyzeSummary(summary, complete)).rejects.toThrow(AnalysisError);
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it("売上データが空なら、AI を呼ばずに、エラーにする", async () => {
    const complete = vi.fn();
    await expect(analyzeSummary(summarize([]), complete)).rejects.toThrow("売上データがないため");
    expect(complete).not.toHaveBeenCalled();
  });
});
