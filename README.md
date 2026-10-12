# 案件8 AI搭載売上分析ダッシュボード

売上 CSV を取り込むと、月次の売上・粗利・リピート率(KPI)、グラフ、売れ筋ランキング、そして Claude による分析コメント(総括・注目点・懸念点・翌月のアクション提案)を表示する Web アプリです。

公開URL: https://case8-sales-dashboard-psi.vercel.app

## できること

- CSV の取り込み(ドラッグ&ドロップ)。文字コードは UTF-8 / Shift_JIS(Excel 保存)を自動判別。列名の揺れ(`Created at`、`注文日` など)にも対応
- 読めなかった行は黙って捨てず、「○行取り込みました / ×行スキップしました」と理由を表示。スキップ行は CSV でダウンロード可能(行番号は Excel と同じ)
- KPI カード(売上・粗利・リピート率)、月次推移グラフ、カテゴリ別グラフ、売れ筋トップ10
- AI 分析コメント(「分析を作り直す」で再生成。結果は保存され、次回開いたときも表示)
- ログイン(メール+パスワード)。自分が取り込んだデータは自分だけが見られる(Supabase の RLS)

## 技術

Next.js(App Router)/ TypeScript / Supabase(認証・PostgreSQL・RLS)/ Recharts / Anthropic SDK(既定モデル `claude-sonnet-4-6`)/ vitest / GitHub Actions / Vercel

## 表(課題の uploads / sales_data / reports に対応)

| この README の表 | 課題での呼び名 | 内容 |
|---|---|---|
| `dash_uploads` | uploads | 取り込みの記録 |
| `dash_sales_data` | sales_data | 売上の明細 |
| `dash_reports` | reports | AI の分析コメント |

同じ Supabase プロジェクトに他の案件の表があっても、ぶつからないように `dash_` を付けています。作成用の SQL は `supabase/schema.sql`(何度実行しても壊れません)。

## セットアップ

1. Supabase の SQL Editor で `supabase/schema.sql` を実行
2. `.env.example` を `.env.local` にコピーして、値を入れる
3. `npm install` → `npm run dev` → http://localhost:3000

Vercel に公開するときは、同じ3つの値(`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `ANTHROPIC_API_KEY`)を Environment Variables に登録します。

## テスト

```
npm test          # 自動テスト(CSV 読み取り・集計・AI 出力の検査・DB の権限)
npm run type-check
npm run check:ai  # 本物の Claude で動作確認(手動。ANTHROPIC_API_KEY が必要)
```

GitHub Actions(`.github/workflows/ci.yml`)が、push / プルリクエストのたびに、型チェック・テスト・ビルドを自動で実行します。公開は Vercel が GitHub と連携して自動で行います。

## 集計の正解値との一致

サンプル(`tests/fixtures/sample-sales.csv`)の集計が、課題 README の正解値と円単位で一致することを、自動テストで確認しています。

| 月 | 売上 | 粗利 |
|---|---|---|
| 2025-09 | ¥148,400 | ¥93,400 |
| 2025-10 | ¥147,500 | ¥92,600 |
| 2025-11 | ¥264,700 | ¥163,100 |

リピート率(全期間)は 28.6%(顧客IDのある 28人のうち、2か月以上で購入した 8人)。

## 定義

- 粗利 = 売上 - 原価
- リピート率(全期間)= 2つ以上の月で購入した顧客 ÷ 顧客IDのある顧客
- 月ごとのリピート率 = その月の購入者のうち、それ以前の月にも購入した人の割合
- 顧客IDが空の行は、リピート率に含めません(画面に件数を表示)

## 制限(Phase 2 として未実装)

- Slack 通知、Shopify などの API 連携、PDF レポート出力
- 1回の取り込みは 5,000 行まで
- AI の文章は参考情報です。数字は、画面の KPI やグラフと見比べて使ってください
