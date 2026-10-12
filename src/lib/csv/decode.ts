/** CSV のファイルを、文字にする。UTF-8 で読めなければ、Excel(日本語)で保存されやすい Shift_JIS として読む */
export function decodeCsv(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}
