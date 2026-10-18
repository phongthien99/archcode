import type { MindBox, MindmapLayout } from '@archcode/core/canvas';

/** Một node đang hiển thị: vị trí (góc trên trái, tọa độ flow) và độ mờ ở frame hiện tại. */
export interface Placed {
  key: string;
  box: MindBox;
  x: number;
  y: number;
  opacity: number;
}

export interface Transition {
  start: Map<string, Placed>;
  end: Map<string, Placed>;
  /** Node đang biến mất: giữ tới hết chuyển động rồi mới gỡ. */
  exiting: Set<string>;
}

/** Khóa duy nhất cho từng box (id trùng do YAML lỗi → thêm hậu tố) và quan hệ cha → con theo khóa. */
export function keyLayout(layout: MindmapLayout): {
  keys: Map<MindBox, string>;
  parentOf: Map<string, string>;
} {
  const keys = new Map<MindBox, string>();
  const used = new Set<string>();
  for (const box of layout.boxes) {
    let key = box.node.id;
    for (let i = 1; used.has(key); i++) key = `${box.node.id}#${i}`;
    used.add(key);
    keys.set(box, key);
  }
  const parentOf = new Map<string, string>();
  for (const b of layout.branches) parentOf.set(keys.get(b.child)!, keys.get(b.parent)!);
  return { keys, parentOf };
}

/**
 * Điểm đầu/cuối của chuyển động từ trạng thái đang hiển thị `prev` sang `next`.
 * Node mới mọc ra từ tổ tiên gần nhất đang hiển thị; node bị ẩn thu về tổ tiên gần nhất còn lại.
 */
export function planTransition(
  prev: Map<string, Placed>,
  next: Placed[],
  prevParentOf: Map<string, string>,
  nextParentOf: Map<string, string>,
): Transition {
  const end = new Map(next.map((p) => [p.key, p]));
  const start = new Map<string, Placed>();
  const exiting = new Set<string>();

  const ancestorIn = (key: string, parentOf: Map<string, string>, pool: Map<string, Placed>) => {
    let p = parentOf.get(key);
    while (p !== undefined && !pool.has(p)) p = parentOf.get(p);
    return p === undefined ? undefined : pool.get(p);
  };

  for (const target of next) {
    const before = prev.get(target.key);
    if (before) {
      start.set(target.key, { ...target, x: before.x, y: before.y, opacity: before.opacity });
      continue;
    }
    const anc = ancestorIn(target.key, nextParentOf, prev);
    start.set(
      target.key,
      anc ? { ...centeredOn(target, anc), opacity: 0 } : { ...target, opacity: 0 },
    );
  }
  for (const [key, before] of prev) {
    if (end.has(key)) continue;
    const anc = ancestorIn(key, prevParentOf, end);
    exiting.add(key);
    start.set(key, before);
    end.set(key, anc ? { ...centeredOn(before, anc), opacity: 0 } : { ...before, opacity: 0 });
  }
  return { start, end, exiting };
}

/** Frame tại thời điểm `t` (0 → 1, đã qua easing). Thứ tự giữ ổn định: node của `end` trước. */
export function frameAt(tr: Transition, t: number): Placed[] {
  const out: Placed[] = [];
  for (const [key, to] of tr.end) {
    const from = tr.start.get(key) ?? to;
    out.push({
      ...to,
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      opacity: from.opacity + (to.opacity - from.opacity) * t,
    });
  }
  return out;
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Đặt `item` sao cho tâm trùng tâm của `anchor`. */
function centeredOn(item: Placed, anchor: Placed): Placed {
  return {
    ...item,
    x: anchor.x + anchor.box.width / 2 - item.box.width / 2,
    y: anchor.y + anchor.box.height / 2 - item.box.height / 2,
  };
}
