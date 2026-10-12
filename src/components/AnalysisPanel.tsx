"use client";

import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ReportRecord } from "@/lib/data";
import { authHeader } from "@/lib/use-session";

// AI の文章に、強調の記号(** や # など)が混ざっても、そのまま見えないようにする
const plain = (t: string) => t.replace(/\*\*/g, "").replace(/^#+\s*/gm, "");
const PRIORITY: Record<string, string> = { high: "優先度 高", medium: "優先度 中", low: "優先度 低" };

export function AnalysisPanel({
  session,
  uploadId,
  report,
  onReport,
}: {
  session: Session | null;
  uploadId: string;
  report: ReportRecord | null;
  onReport: (r: ReportRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader(session) },
        body: JSON.stringify({ uploadId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "分析を作れませんでした。");
      onReport(json.report);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const a = report?.analysis;
  return (
    <section className="card analysis" aria-label="AI の分析コメント">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>AI の分析コメント</h2>
        <button type="button" onClick={run} disabled={busy}>
          {busy ? "分析しています…(30秒ほど)" : a ? "分析を作り直す" : "AI 分析を作る"}
        </button>
      </div>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {!a && !busy && <p className="muted">ボタンを押すと、AI が、売上の動きと、次にやることをまとめます。</p>}
      {a && (
        <>
          <h3>まとめ</h3>
          <p>{plain(a.summary)}</p>
          <h3>注目ポイント</h3>
          <ul>
            {a.highlights.map((h, i) => (
              <li key={i}>{plain(h)}</li>
            ))}
          </ul>
          {a.concerns.length > 0 && (
            <>
              <h3>懸念点</h3>
              <ul>
                {a.concerns.map((c, i) => (
                  <li key={i}>{plain(c)}</li>
                ))}
              </ul>
            </>
          )}
          <h3>翌月のアクション提案</h3>
          <ul className="actions">
            {a.actions.map((x, i) => (
              <li key={i}>
                <span className={`badge ${x.priority}`}>{PRIORITY[x.priority]}</span>
                {plain(x.action)}
              </li>
            ))}
          </ul>
          <p className="muted">
            作成: {new Date(report!.generated_at).toLocaleString("ja-JP")}
            {report!.model ? `(モデル: ${report!.model})` : ""}。AI の文章です。数字は、上の KPI やグラフと見比べて使ってください。
          </p>
        </>
      )}
    </section>
  );
}
