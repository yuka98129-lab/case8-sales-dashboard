// 売上の集計。画面の数字も、AI に渡す数字も、全部ここで作る(1か所だけ。数字が食い違わないように)。
// 金額は「円」の整数のまま足し算する(小数にしない)。割合だけ、表示用に丸める。
export type SaleLike = {
  order_date: string; // YYYY-MM-DD
  customer_id: string | null;
  product_name: string;
  category: string | null;
  sku: string | null;
  quantity: number;
  revenue: number;
  cost: number;
};

export type MonthStat = {
  month: string; // YYYY-MM
  revenue: number;
  profit: number; // 粗利 = 売上 - 原価
  orders: number; // 明細の行数
  customers: number; // その月に買った人の数(顧客IDがあるもの)
  returningCustomers: number; // そのうち、それ以前の月にも買った人の数
  returningRate: number | null; // returningCustomers / customers (%)。顧客IDがなければ null
};

export type CategoryStat = { category: string; revenue: number; profit: number; share: number };
export type SkuStat = { product_name: string; sku: string; quantity: number; revenue: number };

export type Summary = {
  months: MonthStat[];
  totals: {
    revenue: number;
    profit: number;
    customers: number; // 顧客IDがある人の数(全期間)
    repeaters: number; // 2か月以上の月で買った人の数
    repeatRate: number | null; // repeaters / customers (%) ← 課題の「正解値」の定義
  };
  categories: CategoryStat[]; // 売上の多い順(全期間)
  categoryByMonth: Record<string, Record<string, number>>; // month → category → 売上
  skuTop: SkuStat[]; // 数量の多い順 上位10(全期間)
  skuTopByMonth: Record<string, SkuStat[]>; // month → 数量の多い順 上位5
  noCustomerIdRows: number; // 顧客IDが空の行の数(リピート率に含まれない)
};

/** 小数第1位に丸める(表示用) */
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** 前月比(%)。前月が 0 または無いときは null */
export function changePct(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return round1(((current - previous) / previous) * 100);
}

const monthOf = (d: string) => d.slice(0, 7);
const UNCATEGORIZED = "(カテゴリなし)";

function rankSku(rows: SaleLike[], limit: number): SkuStat[] {
  const map = new Map<string, SkuStat>();
  for (const r of rows) {
    const sku = r.sku ?? r.product_name;
    const key = `${sku}\u0000${r.product_name}`;
    const cur = map.get(key) ?? { product_name: r.product_name, sku, quantity: 0, revenue: 0 };
    cur.quantity += r.quantity;
    cur.revenue += r.revenue;
    map.set(key, cur);
  }
  // 数量が多い順。同じなら売上が多い順、それも同じなら商品名の順(毎回、同じ並びになるように)
  return [...map.values()]
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.product_name.localeCompare(b.product_name, "ja"))
    .slice(0, limit);
}

export function summarize(rows: SaleLike[]): Summary {
  const monthKeys = Array.from(new Set(rows.map((r) => monthOf(r.order_date)))).sort();

  const customerMonths = new Map<string, Set<string>>();
  let noCustomerIdRows = 0;
  for (const r of rows) {
    if (!r.customer_id) {
      noCustomerIdRows++;
      continue;
    }
    const set = customerMonths.get(r.customer_id) ?? new Set<string>();
    set.add(monthOf(r.order_date));
    customerMonths.set(r.customer_id, set);
  }

  const seenBefore = new Set<string>(); // 前の月までに買った人
  const months: MonthStat[] = monthKeys.map((month) => {
    const inMonth = rows.filter((r) => monthOf(r.order_date) === month);
    const revenue = inMonth.reduce((s, r) => s + r.revenue, 0);
    const cost = inMonth.reduce((s, r) => s + r.cost, 0);
    const custs = new Set(inMonth.filter((r) => r.customer_id).map((r) => r.customer_id as string));
    let returning = 0;
    for (const c of custs) if (seenBefore.has(c)) returning++;
    for (const c of custs) seenBefore.add(c);
    return {
      month,
      revenue,
      profit: revenue - cost,
      orders: inMonth.length,
      customers: custs.size,
      returningCustomers: returning,
      returningRate: custs.size > 0 ? round1((returning / custs.size) * 100) : null,
    };
  });

  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const totalProfit = months.reduce((s, m) => s + m.profit, 0);
  const customers = customerMonths.size;
  const repeaters = [...customerMonths.values()].filter((s) => s.size >= 2).length;

  const catMap = new Map<string, { revenue: number; profit: number }>();
  const categoryByMonth: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const cat = r.category ?? UNCATEGORIZED;
    const cur = catMap.get(cat) ?? { revenue: 0, profit: 0 };
    cur.revenue += r.revenue;
    cur.profit += r.revenue - r.cost;
    catMap.set(cat, cur);
    const m = monthOf(r.order_date);
    categoryByMonth[m] ??= {};
    categoryByMonth[m][cat] = (categoryByMonth[m][cat] ?? 0) + r.revenue;
  }
  const categories: CategoryStat[] = [...catMap.entries()]
    .map(([category, v]) => ({
      category,
      revenue: v.revenue,
      profit: v.profit,
      share: totalRevenue > 0 ? round1((v.revenue / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || a.category.localeCompare(b.category, "ja"));

  const skuTopByMonth: Record<string, SkuStat[]> = {};
  for (const m of monthKeys) skuTopByMonth[m] = rankSku(rows.filter((r) => monthOf(r.order_date) === m), 5);

  return {
    months,
    totals: {
      revenue: totalRevenue,
      profit: totalProfit,
      customers,
      repeaters,
      repeatRate: customers > 0 ? round1((repeaters / customers) * 100) : null,
    },
    categories,
    categoryByMonth,
    skuTop: rankSku(rows, 10),
    skuTopByMonth,
    noCustomerIdRows,
  };
}

/** 画面の KPI カード用。選んだ月と、その前の月を比べる */
export type Kpi = {
  month: string;
  previousMonth: string | null;
  revenue: number;
  revenueChange: number | null; // 前月比 %
  profit: number;
  profitChange: number | null;
  profitMargin: number | null; // 粗利率 %
  returningRate: number | null; // その月の購入者のうち、それ以前にも買った人の割合
  returningRatePrev: number | null;
  returningRateDiffPt: number | null; // 前月との差(ポイント)
};

export function kpiFor(summary: Summary, month: string): Kpi | null {
  const idx = summary.months.findIndex((m) => m.month === month);
  if (idx < 0) return null;
  const cur = summary.months[idx];
  const prev = idx > 0 ? summary.months[idx - 1] : undefined;
  return {
    month,
    previousMonth: prev?.month ?? null,
    revenue: cur.revenue,
    revenueChange: changePct(cur.revenue, prev?.revenue),
    profit: cur.profit,
    profitChange: changePct(cur.profit, prev?.profit),
    profitMargin: cur.revenue > 0 ? round1((cur.profit / cur.revenue) * 100) : null,
    returningRate: cur.returningRate,
    returningRatePrev: prev?.returningRate ?? null,
    returningRateDiffPt:
      cur.returningRate !== null && prev?.returningRate !== null && prev?.returningRate !== undefined
        ? round1(cur.returningRate - prev.returningRate)
        : null,
  };
}
