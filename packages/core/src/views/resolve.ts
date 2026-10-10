import type { ArchitectureModel, Component, Group, Relationship, View } from '../types';

export interface ResolvedView {
  view: View;
  /** Theo thứ tự khai báo trong YAML. */
  components: Component[];
  /** Chỉ gồm quan hệ có cả hai đầu nằm trong view. */
  relationships: Relationship[];
  /** Group chứa component trong view, kèm toàn bộ group cha. */
  groups: Group[];
}

/**
 * Selector:
 * - `*`            mọi component
 * - `<id>`         component có id đó, hoặc mọi component thuộc group có id đó (kể cả group con)
 * - `group:<id>`   mọi component thuộc group (kể cả group con)
 * - `type:<type>`  component theo type
 * - `tag:<tag>`    component có tag
 */
export function matchesSelector(
  model: ArchitectureModel,
  component: Component,
  selector: string,
): boolean {
  if (selector === '*') return true;
  const colon = selector.indexOf(':');
  if (colon === -1) {
    return component.id === selector || groupChain(model, component.group).includes(selector);
  }
  const prefix = selector.slice(0, colon);
  const value = selector.slice(colon + 1);
  switch (prefix) {
    case 'group':
      return groupChain(model, component.group).includes(value);
    case 'type':
      return component.type === value;
    case 'tag':
      return component.tags.includes(value);
    default:
      return false;
  }
}

export function resolveView(model: ArchitectureModel, view: View): ResolvedView {
  const components = model.components.filter(
    (c) =>
      view.include.some((s) => matchesSelector(model, c, s)) &&
      !view.exclude.some((s) => matchesSelector(model, c, s)),
  );
  const ids = new Set(components.map((c) => c.id));
  const relationships = model.relationships.filter((r) => ids.has(r.from) && ids.has(r.to));

  const groupIds = new Set(components.flatMap((c) => groupChain(model, c.group)));
  const groups = model.groups.filter((g) => groupIds.has(g.id));

  return { view, components, relationships, groups };
}

// Cache theo model (model là bất biến sau normalize): tra group cha O(1) thay vì duyệt mảng mỗi lần.
const parentCache = new WeakMap<ArchitectureModel, Map<string, string | undefined>>();
const chainCache = new WeakMap<ArchitectureModel, Map<string, readonly string[]>>();

/** Group của component và toàn bộ group cha, từ trong ra ngoài. An toàn với vòng lặp parent. */
export function groupChain(model: ArchitectureModel, groupId: string | undefined): string[] {
  if (!groupId) return [];
  let chains = chainCache.get(model);
  if (!chains) chainCache.set(model, (chains = new Map()));
  const cached = chains.get(groupId);
  if (cached) return [...cached];

  let parents = parentCache.get(model);
  if (!parents) {
    parents = new Map();
    // Trùng ID: giữ group khai báo đầu tiên (giống Array.find trước đây).
    for (const g of model.groups) if (!parents.has(g.id)) parents.set(g.id, g.parent);
    parentCache.set(model, parents);
  }
  const chain: string[] = [];
  let current: string | undefined = groupId;
  while (current && !chain.includes(current)) {
    chain.push(current);
    current = parents.get(current);
  }
  chains.set(groupId, chain);
  return [...chain];
}
