-- 案件8: 売上分析ダッシュボードの、データベース(Supabase の SQL Editor で実行する)
--
-- 何度実行しても壊れません(2回目以降は、すでにあるものを、そのまま使います)。
-- 案件7のデータ(kb_ で始まる表)には、さわりません。
--
-- 表の名前は、課題の uploads / sales_data / reports の前に、dash_ を付けています
-- (同じ Supabase のプロジェクトに、別の案件の表があっても、ぶつからないように)。
--
-- 「自分が取り込んだデータは、自分だけが見られる」を、データベース側(RLS)で守ります。

-- ① 取り込みの記録(いつ、誰が、どのファイルを、何行取り込んだか)
create table if not exists public.dash_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  filename text not null,
  row_count integer not null check (row_count > 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  uploaded_at timestamptz not null default now()
);

-- ② 売上の明細(1行1行)
create table if not exists public.dash_sales_data (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.dash_uploads(id) on delete cascade,
  order_date date not null,
  customer_id text,
  product_name text not null,
  category text,
  sku text,
  quantity integer not null check (quantity > 0),
  revenue numeric not null check (revenue >= 0),
  cost numeric not null check (cost >= 0)
);
create index if not exists dash_sales_data_upload_date_idx on public.dash_sales_data (upload_id, order_date);
create index if not exists dash_sales_data_upload_category_idx on public.dash_sales_data (upload_id, category);

-- ③ AI が作った分析コメント(作り直すたびに1行増える。画面には、一番新しいものを出す)
create table if not exists public.dash_reports (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.dash_uploads(id) on delete cascade,
  summary text not null,
  action_items text,
  analysis jsonb not null,
  model text,
  generated_at timestamptz not null default now()
);
create index if not exists dash_reports_upload_idx on public.dash_reports (upload_id, generated_at desc);

-- ④ 権限(RLS)。ログインしていない人(anon)には、何も見せない。ログインした人は、自分の分だけ
alter table public.dash_uploads enable row level security;
alter table public.dash_sales_data enable row level security;
alter table public.dash_reports enable row level security;

revoke all on public.dash_uploads, public.dash_sales_data, public.dash_reports from anon;
grant select, insert, delete on public.dash_uploads to authenticated;
grant select, insert on public.dash_sales_data to authenticated;
grant select, insert, delete on public.dash_reports to authenticated;

drop policy if exists dash_uploads_select on public.dash_uploads;
create policy dash_uploads_select on public.dash_uploads for select to authenticated using (user_id = auth.uid());
drop policy if exists dash_uploads_insert on public.dash_uploads;
create policy dash_uploads_insert on public.dash_uploads for insert to authenticated with check (user_id = auth.uid());
drop policy if exists dash_uploads_delete on public.dash_uploads;
create policy dash_uploads_delete on public.dash_uploads for delete to authenticated using (user_id = auth.uid());

drop policy if exists dash_sales_select on public.dash_sales_data;
create policy dash_sales_select on public.dash_sales_data for select to authenticated
  using (exists (select 1 from public.dash_uploads u where u.id = upload_id and u.user_id = auth.uid()));
drop policy if exists dash_sales_insert on public.dash_sales_data;
create policy dash_sales_insert on public.dash_sales_data for insert to authenticated
  with check (exists (select 1 from public.dash_uploads u where u.id = upload_id and u.user_id = auth.uid()));

drop policy if exists dash_reports_select on public.dash_reports;
create policy dash_reports_select on public.dash_reports for select to authenticated
  using (exists (select 1 from public.dash_uploads u where u.id = upload_id and u.user_id = auth.uid()));
drop policy if exists dash_reports_insert on public.dash_reports;
create policy dash_reports_insert on public.dash_reports for insert to authenticated
  with check (exists (select 1 from public.dash_uploads u where u.id = upload_id and u.user_id = auth.uid()));
drop policy if exists dash_reports_delete on public.dash_reports;
create policy dash_reports_delete on public.dash_reports for delete to authenticated
  using (exists (select 1 from public.dash_uploads u where u.id = upload_id and u.user_id = auth.uid()));

-- ⑤ 取り込みを「全部か、ゼロか」にする関数
--    途中で失敗したときに、一部の行だけが残って、合計がずれることを防ぐ(1回の処理で、まとめて入れる)。
--    security invoker: 呼んだ人の権限で動く(だから、④の権限がそのまま効く)
create or replace function public.dash_import_sales(p_filename text, p_skipped integer, p_rows jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_expected integer;
  v_inserted integer;
begin
  if auth.uid() is null then
    raise exception 'ログインしてください';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception '取り込む行がありません';
  end if;
  v_expected := jsonb_array_length(p_rows);

  insert into public.dash_uploads (user_id, filename, row_count, skipped_count)
  values (auth.uid(), p_filename, v_expected, coalesce(p_skipped, 0))
  returning id into v_id;

  insert into public.dash_sales_data (upload_id, order_date, customer_id, product_name, category, sku, quantity, revenue, cost)
  select v_id, x.order_date, x.customer_id, x.product_name, x.category, x.sku, x.quantity, x.revenue, x.cost
  from jsonb_to_recordset(p_rows) as x(
    order_date date, customer_id text, product_name text, category text, sku text,
    quantity integer, revenue numeric, cost numeric
  );
  get diagnostics v_inserted = row_count;

  if v_inserted <> v_expected then
    raise exception '取り込んだ行数(%)が、送られた行数(%)と合いませんでした', v_inserted, v_expected;
  end if;
  return v_id;
end;
$$;

revoke all on function public.dash_import_sales(text, integer, jsonb) from public, anon;
grant execute on function public.dash_import_sales(text, integer, jsonb) to authenticated;
