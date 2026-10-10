/**
 * Đo text gần đúng, không cần DOM (chạy được trong Worker và Node).
 * Sai số chấp nhận được vì node có padding; quan trọng là kết quả deterministic.
 */
const NARROW = new Set("il.,:;'|!ijtfrI()[] ");
const WIDE = new Set('mwMWOQGDHNU@%&');

export function textWidth(text: string, fontSize: number, bold = false): number {
  let units = 0;
  for (const ch of text.normalize('NFC')) {
    if (NARROW.has(ch)) units += 0.32;
    else if (WIDE.has(ch)) units += 0.82;
    else if (ch >= 'A' && ch <= 'Z') units += 0.66;
    else if (ch >= '0' && ch <= '9') units += 0.56;
    else units += 0.57;
  }
  return units * fontSize * (bold ? 1.07 : 1);
}

/** Ngắt dòng theo từ; từ quá dài bị cắt theo ký tự; vượt `maxLines` thì kết thúc bằng "…". */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
  bold = false,
): string[] {
  const fits = (s: string) => textWidth(s, fontSize, bold) <= maxWidth;
  const lines: string[] = [];
  let current = '';

  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    // Từ dài hơn một dòng: cắt theo ký tự.
    while (!fits(word)) {
      let cut = word.length - 1;
      while (cut > 1 && !fits(word.slice(0, cut))) cut--;
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    current = word;
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
