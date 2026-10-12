// supabase/schema.sql が、「自分のデータは自分だけ」「取り込みは全部かゼロ」を守るかを、手元で確かめるテスト。
// 本物の Supabase ではなく、PGlite(Postgres)に、Supabase の auth まわりを真似て作ってある。
// 最後のテストは「CSV → データベース → 集計」を通して、配られた正解値と一致するかも確かめる。
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { summarize, type SaleLike } from "../src/lib/analytics";
import { parseSalesCsv } from "../src/lib/csv/parser";

const SCHEMA = readFileSync("supabase/schema.sql", "utf8");
const FIXTURE = readFileSync("tests/fixtures/sample-sales.csv", "utf8");
const A = "00000000-0000-0000-0000-0000000000a1";
const B = "00000000-0000-0000-0000-0000000000b2";

let db: PGlite;

async function asUser(uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${uid ? "authenticated" : "anon"};`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}

const importSql = "select public.dash_import_sales($1, $2, $3::jsonb) as id";
const rowsJson = (rows: unknown[]) => JSON.stringify(rows);
const count = async (table: string) => Number(((await db.query(`select count(*)::int as n from ${table}`)).rows[0] as { n: number }).n);

beforeAll(async () => {
  db = new PGlite();
  // Supabase が最初から用意しているものを、真似て作る
  await db.exec(`
    create schema auth;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to anon, authenticated;
    -- Supabase は、public に作った表へ、最初から広い権限を付ける。それも真似る
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    insert into auth.users values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');
  `);
  await db.exec(SCHEMA);
}, 60_000);

describe("schema.sql", () => {
  it("もう一度実行しても、エラーにならない(何度でも実行できる)", async () => {
    await expect(db.exec(SCHEMA)).resolves.toBeDefined();
  });
});

describe("取り込み(dash_import_sales)", () => {
  const good = [
    { order_date: "2025-09-03", customer_id: "C1", product_name: "Tシャツ", category: "トップス", sku: "T-1", quantity: 2, revenue: 7600, cost: 2800 },
    { order_date: "2025-09-05", customer_id: "C2", product_name: "コート", category: "アウター", sku: "O-1", quantity: 1, revenue: 24800, cost: 9800 },
  ];

  it("ログインした人は、取り込める。行数が、取り込みの記録と明細で一致する", async () => {
    const r = await asUser(A, importSql, ["a.csv", 3, rowsJson(good)]);
    const id = (r.rows[0] as { id: string }).id;
    const up = await asUser(A, "select filename, row_count, skipped_count, user_id from dash_uploads where id = $1", [id]);
    expect(up.rows).toEqual([{ filename: "a.csv", row_count: 2, skipped_count: 3, user_id: A }]);
    const n = await asUser(A, "select count(*)::int as n from dash_sales_data where upload_id = $1", [id]);
    expect((n.rows[0] as { n: number }).n).toBe(2);
  });

  it("別の人(B)には、Aの取り込みも、明細も、見えない", async () => {
    expect((await asUser(B, "select * from dash_uploads")).rows).toHaveLength(0);
    expect((await asUser(B, "select * from dash_sales_data")).rows).toHaveLength(0);
    expect((await asUser(B, "select * from dash_reports")).rows).toHaveLength(0);
  });

  it("途中で1行でもおかしいと、全部なかったことになる(一部だけ残らない)", async () => {
    const before = [await count("dash_uploads"), await count("dash_sales_data")];
    await expect(asUser(A, importSql, ["bad.csv", 0, rowsJson([...good, { ...good[0], product_name: null }])])).rejects.toThrow();
    await expect(asUser(A, importSql, ["bad2.csv", 0, rowsJson([...good, { ...good[0], quantity: 0 }])])).rejects.toThrow();
    await expect(asUser(A, importSql, ["bad3.csv", 0, rowsJson([...good, { ...good[0], revenue: -1 }])])).rejects.toThrow();
    expect([await count("dash_uploads"), await count("dash_sales_data")]).toEqual(before);
  });

  it("空の配列は、取り込めない", async () => {
    await expect(asUser(A, importSql, ["empty.csv", 0, "[]"])).rejects.toThrow("取り込む行がありません");
  });

  it("ログインしていない人(anon)は、関数も、表も、使えない", async () => {
    await expect(asUser(null, importSql, ["x.csv", 0, rowsJson(good)])).rejects.toThrow();
    await expect(asUser(null, "select * from dash_uploads")).rejects.toThrow();
    await expect(asUser(null, "select * from dash_sales_data")).rejects.toThrow();
  });

  it("Bが、Aの取り込みに、明細を勝手に足すことはできない", async () => {
    const id = ((await asUser(A, importSql, ["own.csv", 0, rowsJson(good)])).rows[0] as { id: string }).id;
    await expect(
      asUser(B, "insert into dash_sales_data (upload_id, order_date, product_name, quantity, revenue, cost) values ($1, '2025-09-01', 'x', 1, 1, 1)", [id]),
    ).rejects.toThrow();
  });

  it("Bが、他人の user_id で、取り込みの記録を作ることはできない", async () => {
    await expect(asUser(B, "insert into dash_uploads (user_id, filename, row_count) values ($1, 'x.csv', 1)", [A])).rejects.toThrow();
  });
});

describe("AI の分析(dash_reports)と、削除", () => {
  it("自分の取り込みには、分析を保存できて、読める。別の人には見えない。他人の取り込みには保存できない", async () => {
    const id = ((await asUser(A, importSql, ["r.csv", 0, rowsJson([{ order_date: "2025-09-03", product_name: "x", quantity: 1, revenue: 1, cost: 0 }])])).rows[0] as { id: string }).id;
    await asUser(A, "insert into dash_reports (upload_id, summary, analysis) values ($1, 's', '{\"a\":1}'::jsonb)", [id]);
    expect((await asUser(A, "select summary from dash_reports where upload_id = $1", [id])).rows).toEqual([{ summary: "s" }]);
    expect((await asUser(B, "select * from dash_reports where upload_id = $1", [id])).rows).toHaveLength(0);
    await expect(asUser(B, "insert into dash_reports (upload_id, summary, analysis) values ($1, 's', '{}'::jsonb)", [id])).rejects.toThrow();
  });

  it("取り込みを削除すると、明細と分析も一緒に消える。他人のものは、消せない", async () => {
    const id = ((await asUser(A, importSql, ["del.csv", 0, rowsJson([{ order_date: "2025-09-03", product_name: "x", quantity: 1, revenue: 1, cost: 0 }])])).rows[0] as { id: string }).id;
    await asUser(A, "insert into dash_reports (upload_id, summary, analysis) values ($1, 's', '{}'::jsonb)", [id]);
    const byB = await asUser(B, "delete from dash_uploads where id = $1 returning id", [id]);
    expect(byB.rows).toHaveLength(0);
    const byA = await asUser(A, "delete from dash_uploads where id = $1 returning id", [id]);
    expect(byA.rows).toHaveLength(1);
    expect(Number(((await db.query("select count(*)::int as n from dash_sales_data where upload_id = $1", [id])).rows[0] as { n: number }).n)).toBe(0);
    expect(Number(((await db.query("select count(*)::int as n from dash_reports where upload_id = $1", [id])).rows[0] as { n: number }).n)).toBe(0);
  });
});

describe("CSV → データベース → 集計 を通して、正解値と一致する", () => {
  it("40行を取り込んで、読み戻して集計すると、売上 ¥560,600 / 粗利 ¥349,100 / リピート率 28.6%", async () => {
    const parsed = parseSalesCsv(FIXTURE);
    const id = ((await asUser(B, importSql, ["sample-sales.csv", parsed.invalid.length, rowsJson(parsed.rows)])).rows[0] as { id: string }).id;

    const read = await asUser(
      B,
      "select order_date::text as order_date, customer_id, product_name, category, sku, quantity, revenue::text as revenue, cost::text as cost from dash_sales_data where upload_id = $1 order by order_date, id",
      [id],
    );
    expect(read.rows).toHaveLength(40);
    const rows: SaleLike[] = (read.rows as Record<string, string>[]).map((r) => ({
      order_date: r.order_date,
      customer_id: r.customer_id,
      product_name: r.product_name,
      category: r.category,
      sku: r.sku,
      quantity: Number(r.quantity),
      revenue: Number(r.revenue),
      cost: Number(r.cost),
    }));
    const s = summarize(rows);
    expect(s.totals).toMatchObject({ revenue: 560_600, profit: 349_100, customers: 28, repeaters: 8, repeatRate: 28.6 });
    expect(s.months.map((m) => [m.month, m.revenue, m.profit])).toEqual([
      ["2025-09", 148_400, 93_400],
      ["2025-10", 147_500, 92_600],
      ["2025-11", 264_700, 163_100],
    ]);
    expect(s.categories.map((c) => [c.category, c.revenue])).toEqual([
      ["アウター", 287_400],
      ["トップス", 114_400],
      ["ボトムス", 82_200],
      ["アクセサリー", 76_600],
    ]);
  });
});
