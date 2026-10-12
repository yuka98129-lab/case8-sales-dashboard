export const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

export const pct = (n: number | null, digits = 1) => (n === null ? "—" : `${n.toFixed(digits)}%`);

export const signedPct = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

export const signedPt = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}pt`);

/** "2025-11" → "2025年11月" */
export const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  return `${y}年${Number(mo)}月`;
};

/** "2025-11" → "11月"(グラフの目盛り用) */
export const monthShort = (m: string) => `${Number(m.split("-")[1])}月`;
