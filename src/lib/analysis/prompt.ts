// AI 分析の「型」。出力の形(JSON)と、書き方のルールを、ここで固定する。
// 指示を直したときは、tests/analysis.test.ts の Snapshot テストで「AIに渡す入力」が変わっていないか確かめる。
import { changePct, kpiFor, type Summary } from "../analytics";

export const ANALYSIS_SYSTEM_PROMPT = `あなたは EC ブランドのデータコンサルタントです。
渡された売上データ(JSON)だけをもとに分析し、次の JSON の形だけで出力してください。前後に説明文や、コードブロック(\`\`\`)は付けないでください。

{
  "summary": "今月の売上動向の総括(200字以内。コンサルのトーン)",
  "highlights": ["注目ポイント1", "注目ポイント2", "注目ポイント3"],
  "concerns": ["懸念点1", "懸念点2"],
  "actions": [
    {"priority": "high", "action": "翌月のアクション提案1"},
    {"priority": "medium", "action": "翌月のアクション提案2"}
  ]
}

守ること:
- 「今月」は、データの中で一番新しい月(latestMonth)のこと。前月(previousMonth)と比べて書く
- 数字は「約 X 円」「+Y%」のように、渡された値をもとに、具体的に書く。渡されていない数字は作らない
- 推測ではなく、データから読み取れる事実をもとに書く。原因をデータから言い切れないときは、「〜の可能性があります」と書く
- どのカテゴリ・商品が、売上の増減を押し上げたか(または下げたか)を、必ず入れる
- アクション提案は、実行できる具体策にする。「広告を強化」ではなく「カテゴリ A の Instagram 広告予算を 30% 増額」のレベルで書く
- priority は "high" / "medium" / "low" のどれか。high は最大2つまで
- 文章に、Markdown の記号(** や # など)は使わない。ふつうの文章で書く
- 売上データが少ない(月数が少ない)ときは、その限界も、懸念点に1つ書く`;

/** AI に渡す入力(JSON)。毎回、同じデータからは、同じ文字になる(Snapshot テスト用) */
export function buildAnalysisInput(summary: Summary) {
  const months = summary.months;
  const latest = months.at(-1);
  const prev = months.length > 1 ? months.at(-2) : undefined;
  const kpi = latest ? kpiFor(summary, latest.month) : null;

  const diffByCategory = latest
    ? summary.categories.map((c) => {
        const cur = summary.categoryByMonth[latest.month]?.[c.category] ?? 0;
        const before = prev ? (summary.categoryByMonth[prev.month]?.[c.category] ?? 0) : null;
        return {
          category: c.category,
          latestMonthRevenue: cur,
          previousMonthRevenue: before,
          change: before === null ? null : cur - before,
          changePct: before === null ? null : changePct(cur, before),
        };
      })
    : [];

  return {
    latestMonth: latest?.month ?? null,
    previousMonth: prev?.month ?? null,
    monthCount: months.length,
    monthly: months.map((m) => ({
      month: m.month,
      revenue: m.revenue,
      profit: m.profit,
      customers: m.customers,
      returningRate: m.returningRate,
    })),
    latestVsPrevious: kpi
      ? {
          revenueChangePct: kpi.revenueChange,
          profitChangePct: kpi.profitChange,
          profitMarginPct: kpi.profitMargin,
          returningRateDiffPt: kpi.returningRateDiffPt,
        }
      : null,
    repeatRateOverallPct: summary.totals.repeatRate,
    categoryChangeLatestVsPrevious: diffByCategory,
    categoryTotals: summary.categories.map((c) => ({ category: c.category, revenue: c.revenue, sharePct: c.share })),
    topSkusLatestMonth: latest ? (summary.skuTopByMonth[latest.month] ?? []) : [],
    topSkusAllPeriod: summary.skuTop.slice(0, 5),
  };
}

export const buildUserMessage = (summary: Summary) => `売上データ(金額は円):\n${JSON.stringify(buildAnalysisInput(summary), null, 2)}`;
