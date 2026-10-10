import type { ArchitectureModel, Component, Relationship } from '../types';

export interface DependencyGraph {
  components: Map<string, Component>;
  /** Quan hệ đi ra, theo thứ tự khai báo. */
  outgoing: Map<string, Relationship[]>;
  /** Quan hệ đi vào, theo thứ tự khai báo. */
  incoming: Map<string, Relationship[]>;
}

/** Đồ thị phụ thuộc. Bỏ qua quan hệ có đầu không phải component (đã được báo lỗi ở bước validate). */
export function buildGraph(model: ArchitectureModel): DependencyGraph {
  const components = new Map(model.components.map((c) => [c.id, c]));
  const outgoing = new Map<string, Relationship[]>(model.components.map((c) => [c.id, []]));
  const incoming = new Map<string, Relationship[]>(model.components.map((c) => [c.id, []]));
  for (const rel of model.relationships) {
    if (!components.has(rel.from) || !components.has(rel.to)) continue;
    outgoing.get(rel.from)!.push(rel);
    incoming.get(rel.to)!.push(rel);
  }
  return { components, outgoing, incoming };
}

/** Component mà `id` phụ thuộc trực tiếp (không trùng lặp, theo thứ tự khai báo quan hệ). */
export function dependsOn(graph: DependencyGraph, id: string): Component[] {
  return unique((graph.outgoing.get(id) ?? []).map((r) => graph.components.get(r.to)!));
}

/** Component phụ thuộc trực tiếp vào `id`. */
export function usedBy(graph: DependencyGraph, id: string): Component[] {
  return unique((graph.incoming.get(id) ?? []).map((r) => graph.components.get(r.from)!));
}

function unique(components: Component[]): Component[] {
  return [...new Map(components.map((c) => [c.id, c])).values()];
}
