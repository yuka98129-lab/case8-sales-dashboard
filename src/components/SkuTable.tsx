"use client";

import type { Summary } from "@/lib/analytics";
import { yen } from "@/lib/format";

export function SkuTable({ summary }: { summary: Summary }) {
  return (
    <section className="card" aria-label="売れ筋トップ10">
      <h2>売れ筋トップ10(数量が多い順・全期間)</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>順位</th>
              <th>商品</th>
              <th>SKU</th>
              <th className="num">数量</th>
              <th className="num">売上</th>
            </tr>
          </thead>
          <tbody>
            {summary.skuTop.map((s, i) => (
              <tr key={`${s.sku}-${s.product_name}`}>
                <td>{i + 1}</td>
                <td>{s.product_name}</td>
                <td>{s.sku}</td>
                <td className="num">{s.quantity}</td>
                <td className="num">{yen(s.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
