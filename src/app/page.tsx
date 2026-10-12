"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { CategoryChart, MonthlyChart } from "@/components/Charts";
import { KpiCards } from "@/components/KpiCards";
import { LoginForm } from "@/components/LoginForm";
import { SkuTable } from "@/components/SkuTable";
import { UploadPanel } from "@/components/UploadPanel";
import { kpiFor, type Summary } from "@/lib/analytics";
import type { ReportRecord, UploadRecord } from "@/lib/data";
import { monthLabel } from "@/lib/format";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { authHeader, useSession } from "@/lib/use-session";

type DashboardData = { upload: UploadRecord; summary: Summary; report: ReportRecord | null };

function Dashboard({ session }: { session: Session }) {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const headers = authHeader(session);

  const refreshUploads = useCallback(async (select?: string) => {
    const res = await fetch("/api/uploads", { headers: authHeader(session) });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "一覧を読めませんでした。");
      return;
    }
    setUploads(json.uploads);
    setSelected((cur) => select ?? cur ?? json.uploads[0]?.id ?? null);
  }, [session]);

  useEffect(() => {
    void refreshUploads();
  }, [refreshUploads]);

  useEffect(() => {
    if (!selected) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard?uploadId=${encodeURIComponent(selected)}`, { headers: authHeader(session) })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? "集計できませんでした。");
        setData(json);
        setMonth(json.summary.months.at(-1)?.month ?? null);
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected, session]);

  async function remove() {
    if (!selected) return;
    const res = await fetch(`/api/uploads?id=${encodeURIComponent(selected)}`, { method: "DELETE", headers });
    const json = await res.json();
    setConfirmDelete(false);
    if (!res.ok) {
      setError(json.error ?? "削除できませんでした。");
      return;
    }
    setSelected(null);
    setData(null);
    await refreshUploads(); // 削除したあとは、残っている一番新しいデータが選ばれる
  }

  const kpi = data && month ? kpiFor(data.summary, month) : null;

  return (
    <>
      <UploadPanel
        session={session}
        onUploaded={(id) => {
          setSelected(id);
          void refreshUploads(id);
        }}
      />

      {uploads.length > 0 && (
        <section className="card" aria-label="取り込んだデータの選択">
          <div className="row">
            <select aria-label="データを選ぶ" value={selected ?? ""} onChange={(e) => { setSelected(e.target.value); setConfirmDelete(false); }}>
              {uploads.map((u) => (
                <option key={u.id} value={u.id}>
                  {new Date(u.uploaded_at).toLocaleString("ja-JP")} — {u.filename}({u.row_count}行)
                </option>
              ))}
            </select>
            {data && data.summary.months.length > 0 && (
              <select aria-label="月を選ぶ" value={month ?? ""} onChange={(e) => setMonth(e.target.value)}>
                {data.summary.months.map((m) => (
                  <option key={m.month} value={m.month}>
                    {monthLabel(m.month)}
                  </option>
                ))}
              </select>
            )}
            {!confirmDelete ? (
              <button type="button" className="danger" onClick={() => setConfirmDelete(true)} disabled={!selected}>
                このデータを削除
              </button>
            ) : (
              <>
                <button type="button" className="danger" onClick={remove}>
                  本当に削除する
                </button>
                <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>
                  やめる
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {loading && <p className="muted">集計しています…</p>}

      {!loading && uploads.length === 0 && <p className="muted">まだデータがありません。上から、売上の CSV を取り込んでください。</p>}

      {data && kpi && !loading && (
        <>
          {data.upload.skipped_count > 0 && (
            <p className="alert warn">
              このデータは、{data.upload.skipped_count}行をスキップして取り込んでいます。合計は、スキップした行をのぞいた数字です。
            </p>
          )}
          {data.summary.noCustomerIdRows > 0 && (
            <p className="alert warn">顧客IDが空の行が {data.summary.noCustomerIdRows}行あります。リピート率には、含まれません。</p>
          )}
          <KpiCards kpi={kpi} totals={data.summary.totals} />
          <MonthlyChart summary={data.summary} />
          <div className="charts">
            <CategoryChart summary={data.summary} />
            <SkuTable summary={data.summary} />
          </div>
          <AnalysisPanel
            session={session}
            uploadId={data.upload.id}
            report={data.report}
            onReport={(r) => setData((d) => (d ? { ...d, report: r } : d))}
          />
        </>
      )}
    </>
  );
}

export default function Home() {
  const { loading, session, configured } = useSession();

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>売上分析ダッシュボード</h1>
          <div className="muted">売上 CSV を取り込むと、KPI・グラフ・AI の分析コメントを作ります</div>
        </div>
        {session && (
          <div className="who">
            <span>{session.user.email}</span>
            <button type="button" className="secondary" style={{ padding: "4px 12px" }} onClick={() => getBrowserSupabase().auth.signOut()}>
              ログアウト
            </button>
          </div>
        )}
      </header>

      {!configured && (
        <p className="alert error" role="alert">
          Supabase の設定がありません。環境変数 NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を登録して、再公開(Redeploy)してください。
        </p>
      )}
      {configured && loading && <p className="muted">読み込んでいます…</p>}
      {configured && !loading && !session && <LoginForm />}
      {configured && session && <Dashboard session={session} />}
    </main>
  );
}
