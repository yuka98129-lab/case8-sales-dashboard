"use client";

import type { Kpi } from "@/lib/analytics";
import type { Summary } from "@/lib/analytics";
import { monthLabel, pct, signedPct, signedPt, yen } from "@/lib/format";

function Change({ value, text }: { value: number | null; text: string }) {
  const cls = value === null || value === 0 ? "flat" : value > 0 ? "up" : "down";
  return <span className={cls}>{text}</span>;
}

export function KpiCards({ kpi, totals }: { kpi: Kpi; totals: Summary["totals"] }) {
  const prev = kpi.previousMonth ? `(${monthLabel(kpi.previousMonth)}と比べて)` : "(比べる前月がありません)";
  return (
    <section className="kpis" aria-label={`${monthLabel(kpi.month)}の KPI`}>
      <div className="kpi">
        <div className="label">売上({monthLabel(kpi.month)})</div>
        <div className="value">{yen(kpi.revenue)}</div>
        <div className="sub">
          前月比 <Change value={kpi.revenueChange} text={signedPct(kpi.revenueChange)} /> <span className="muted">{prev}</span>
        </div>
      </div>
      <div className="kpi">
        <div className="label">粗利({monthLabel(kpi.month)})</div>
        <div className="value">{yen(kpi.profit)}</div>
        <div className="sub">
          前月比 <Change value={kpi.profitChange} text={signedPct(kpi.profitChange)} /> <span className="muted">粗利率 {pct(kpi.profitMargin)}</span>
        </div>
      </div>
      <div className="kpi">
        <div className="label">リピート率(全期間)</div>
        <div className="value">{pct(totals.repeatRate)}</div>
        <div className="sub">
          <span className="muted">
            {totals.customers}人中 {totals.repeaters}人が、2か月以上で購入
          </span>
          <br />
          {monthLabel(kpi.month)}の購入者のリピート率 {pct(kpi.returningRate)}{" "}
          <Change value={kpi.returningRateDiffPt} text={`(前月比 ${signedPt(kpi.returningRateDiffPt)})`} />
        </div>
      </div>
    </section>
  );
}
