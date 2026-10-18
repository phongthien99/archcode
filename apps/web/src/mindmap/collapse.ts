import type { MindmapModel, MindNode } from '@archcode/core';
import { declaredCollapsed } from '@archcode/core/canvas';

/** Trạng thái mở/đóng trên giao diện, ghi đè `collapsed` trong YAML: id → true (đóng) / false (mở). */
export type MindCollapsed = Record<string, boolean>;

export function isCollapsed(
  model: MindmapModel,
  node: MindNode,
  overrides: MindCollapsed,
): boolean {
  return overrides[node.id] ?? declaredCollapsed(model, node);
}

export function walk(node: MindNode, visit: (node: MindNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

export function findMindNode(node: MindNode, id: string): MindNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findMindNode(child, id);
    if (found) return found;
  }
  return undefined;
}

/** Chuỗi node từ gốc tới node `id` (gồm cả hai đầu); rỗng nếu không có. */
export function pathTo(node: MindNode, id: string): MindNode[] {
  if (node.id === id) return [node];
  for (const child of node.children) {
    const rest = pathTo(child, id);
    if (rest.length) return [node, ...rest];
  }
  return [];
}

/** Mở mọi tổ tiên của node `id` để node hiện ra (giữ nguyên trạng thái các nhánh khác). */
export function revealPath(
  model: MindmapModel,
  id: string,
  overrides: MindCollapsed,
): MindCollapsed {
  const ancestors = pathTo(model.root, id).slice(0, -1);
  if (ancestors.every((n) => !isCollapsed(model, n, overrides))) return overrides;
  const next = { ...overrides };
  for (const n of ancestors) next[n.id] = false;
  return next;
}

/** Mọi node có con mở (`collapsed: false`) hoặc đóng hết (gốc luôn mở). */
export function setAll(model: MindmapModel, collapsed: boolean): MindCollapsed {
  const result: MindCollapsed = {};
  walk(model.root, (node) => {
    if (node.children.length) result[node.id] = collapsed && node.depth > 0;
  });
  return result;
}

/** Mở tới tầng `depth` (0 = chỉ thấy gốc, 1 = thấy nhánh chính…), đóng phần sâu hơn. */
export function expandToDepth(model: MindmapModel, depth: number): MindCollapsed {
  const result: MindCollapsed = {};
  walk(model.root, (node) => {
    if (node.children.length) result[node.id] = node.depth >= depth;
  });
  return result;
}

/** Bỏ trạng thái của id không còn tồn tại (sau khi sửa YAML). Trả về chính `overrides` nếu không đổi. */
export function pruneCollapsed(model: MindmapModel, overrides: MindCollapsed): MindCollapsed {
  const ids = new Set<string>();
  walk(model.root, (node) => ids.add(node.id));
  const keys = Object.keys(overrides);
  if (keys.every((id) => ids.has(id))) return overrides;
  return Object.fromEntries(keys.filter((id) => ids.has(id)).map((id) => [id, overrides[id]!]));
}

/** Số tầng sâu nhất của cây (gốc = 0). */
export function maxDepth(model: MindmapModel): number {
  let max = 0;
  walk(model.root, (node) => (max = Math.max(max, node.depth)));
  return max;
}
