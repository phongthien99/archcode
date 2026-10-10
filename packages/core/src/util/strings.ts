/** Khoảng cách Levenshtein (số thao tác thêm/xóa/sửa ký tự). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = curr;
  }
  return prev[b.length]!;
}

/** ID gần đúng nhất với `target`, hoặc undefined nếu không có ứng viên đủ gần. */
export function closestMatch(target: string, candidates: Iterable<string>): string | undefined {
  // Ngưỡng chặt để tránh gợi ý sai ("payment-service" không nên gợi ý "document-service").
  const maxDistance = Math.max(1, Math.floor(target.length / 4));
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const d = levenshtein(target.toLowerCase(), candidate.toLowerCase());
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return bestDistance <= maxDistance ? best : undefined;
}

/** Chuyển chuỗi bất kỳ thành ID hợp lệ: `Wrong_Type!` → `wrong_type`. */
export function toValidId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

export function didYouMean(target: string, candidates: Iterable<string>): string | undefined {
  const match = closestMatch(target, candidates);
  return match ? `Có phải ý bạn là "${match}"?` : undefined;
}
