"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Summary } from "@/lib/analytics";
import { CHART_COLORS } from "@/lib/colors";
import { monthShort, yen } from "@/lib/format";

const man = (v: number) => `${Math.round(v / 10000)}万`;
const tip = (v: unknown) => yen(Number(v));

export function MonthlyChart({ summary }: { summary: Summary }) {
  const data = summary.months.map((m) => ({ month: monthShort(m.month), 売上: m.revenue, 粗利: m.profit }));
  return (
    <section className="card" aria-label="月次推移のグラフ">
      <h2>月次推移</h2>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e8f0" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={man} width={48} />
            <Tooltip formatter={tip} />
            <Legend />
            <Line type="monotone" dataKey="売上" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="粗利" stroke={CHART_COLORS[2]} strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function CategoryChart({ summary }: { summary: Summary }) {
  const data = summary.categories.map((c) => ({ category: c.category, 売上: c.revenue }));
  return (
    <section className="card" aria-label="カテゴリ別売上のグラフ">
      <h2>カテゴリ別の売上(全期間)</h2>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e8f0" horizontal={false} />
            <XAxis type="number" tickFormatter={man} />
            <YAxis type="category" dataKey="category" width={96} />
            <Tooltip formatter={tip} />
            <Bar dataKey="売上" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[Math.min(i, CHART_COLORS.length - 1)]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
