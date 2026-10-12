"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getBrowserSupabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "メールアドレスまたはパスワードが違います。" : `ログインできませんでした: ${error.message}`);
  }

  return (
    <form onSubmit={submit} className="card" style={{ maxWidth: 440 }}>
      <h2>ログイン</h2>
      <label>
        メールアドレス
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        パスワード
        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <div style={{ marginTop: 14 }}>
        <button type="submit" disabled={busy}>
          {busy ? "ログインしています…" : "ログイン"}
        </button>
      </div>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
    </form>
  );
}
