import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "売上分析ダッシュボード",
  description: "売上 CSV を取り込むと、KPI・グラフ・AI の分析コメントを自動で作る(案件8の学習用)",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
