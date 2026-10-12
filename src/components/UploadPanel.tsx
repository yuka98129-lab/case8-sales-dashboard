"use client";

import { useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { decodeCsv } from "@/lib/csv/decode";
import { invalidRowsToCsv, type InvalidRow } from "@/lib/csv/parser";
import { authHeader } from "@/lib/use-session";

type UploadResult = { imported: number; skipped: number; totalRows: number; invalid: InvalidRow[]; headers: string[]; uploadId?: string };

export function UploadPanel({ session, onUploaded }: { session: Session | null; onUploaded: (uploadId: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error("CSV ファイル(.csv)を選んでください。");
      const csv = decodeCsv(await file.arrayBuffer());
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader(session) },
        body: JSON.stringify({ filename: file.name, csv }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (Array.isArray(json.invalid)) setResult({ imported: 0, skipped: json.invalid.length, totalRows: json.totalRows ?? 0, invalid: json.invalid, headers: json.headers ?? [] });
        throw new Error(json.error ?? "取り込めませんでした。");
      }
      setResult(json);
      onUploaded(json.uploadId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function downloadSkipped() {
    if (!result) return;
    const blob = new Blob([invalidRowsToCsv(result.invalid, result.headers)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skipped-rows.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card" aria-label="CSV の取り込み">
      <h2>売上 CSV を取り込む</h2>
      <div
        className={`dropzone${over ? " over" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void send(f);
        }}
      >
        <strong>{busy ? "取り込んでいます…" : "ここに CSV をドラッグ、または、クリックして選ぶ"}</strong>
        <div className="muted">必要な列: order_date / product_name / quantity / revenue / cost(customer_id・category・sku もあれば使います)</div>
      </div>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && void send(e.target.files[0])} />

      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {result && (result.imported > 0 || result.skipped > 0) && (
        <div className={`alert ${result.skipped > 0 ? "warn" : "ok"}`} role="status">
          <strong>
            {result.imported}行 取り込みました / {result.skipped}行 スキップしました
          </strong>
          {result.skipped > 0 && (
            <>
              <ul>
                {result.invalid.slice(0, 5).map((r) => (
                  <li key={r.row}>
                    {r.row}行目: {r.reason}
                  </li>
                ))}
                {result.invalid.length > 5 && <li>ほか {result.skipped - 5}行(ダウンロードして確認できます)</li>}
              </ul>
              <div style={{ marginTop: 8 }}>
                <button type="button" className="secondary" onClick={downloadSkipped}>
                  スキップした行をダウンロード(CSV)
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
