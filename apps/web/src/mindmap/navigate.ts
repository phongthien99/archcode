import type { MindBox, MindmapLayout } from '@archcode/core/canvas';

export type NavKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

/** Kết quả một phím mũi tên: chọn node khác, hoặc mở nhánh đang đóng của node hiện tại. */
export type NavResult = { select: MindBox } | { expand: MindBox } | null;

/**
 * Điều hướng như cây thư mục, theo hướng mọc của nhánh:
 * phím hướng ra ngoài (→ ở phía phải, ← ở phía trái) mở nhánh đang đóng hoặc đi tới con đầu tiên;
 * phím hướng vào trong đi về cha; ↑/↓ đi tới node cùng cha, cùng phía.
 */
export function navigate(layout: MindmapLayout, box: MindBox | undefined, key: NavKey): NavResult {
  const root = layout.boxes[0];
  if (!root) return null;
  if (!box) return { select: root };

  const parentOf = (b: MindBox) => layout.branches.find((x) => x.child === b)?.parent;
  const childrenOf = (b: MindBox, side?: MindBox['side']) =>
    layout.branches
      .filter((x) => x.parent === b && (!side || x.child.side === side))
      .map((x) => x.child)
      .sort((a, c) => a.y - c.y);

  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const parent = parentOf(box);
    if (!parent) return null;
    const siblings = childrenOf(parent, box.side);
    const next = siblings[siblings.indexOf(box) + (key === 'ArrowDown' ? 1 : -1)];
    return next ? { select: next } : null;
  }

  const towardRight = key === 'ArrowRight';
  if (box.side === 'root') {
    const first = childrenOf(box, towardRight ? 'right' : 'left')[0];
    return first ? { select: first } : null;
  }
  const outward = (box.side === 'right') === towardRight;
  if (!outward) {
    const parent = parentOf(box);
    return parent ? { select: parent } : null;
  }
  if (box.hidden) return { expand: box };
  const first = childrenOf(box)[0];
  return first ? { select: first } : null;
}
