// AI 分析が、本物の Claude で、ちゃんと動くかを確かめる(手動用。CI では動かさない=お金がかかるため)
// 使い方: ANTHROPIC_API_KEY=sk-ant-... npm run check:ai
import { readFileSync } from "node:fs";
import { summarize } from "../src/lib/analytics";
import { analyzeSummary, currentModel } from "../src/lib/analysis/analyze";
import { parseSalesCsv } from "../src/lib/csv/parser";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY が設定されていません。");
    process.exit(1);
  }
  const summary = summarize(parseSalesCsv(readFileSync("tests/fixtures/sample-sales.csv", "utf8")).rows);
  console.log(`モデル: ${currentModel()}`);
  const a = await analyzeSummary(summary);
  console.log(JSON.stringify(a, null, 2));

  const all = [a.summary, ...a.highlights, ...a.concerns, ...a.actions.map((x) => x.action)].join("\n");
  const checks: [string, boolean][] = [
    ["型どおり(analyzeSummary が検査済み)", true],
    ["アウターに触れている(11月の売上増の主因)", all.includes("アウター")],
    ["Markdown の記号(** / #)が無い", !/\*\*|^#/m.test(all)],
    ["high は2つまで", a.actions.filter((x) => x.priority === "high").length <= 2],
    ["総括が 200 字ほど以内", a.summary.length <= 250],
  ];
  let ng = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "OK" : "NG"}: ${name}`);
    if (!ok) ng++;
  }
  process.exit(ng ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
