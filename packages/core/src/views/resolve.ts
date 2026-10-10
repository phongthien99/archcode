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

/** Group của component và toàn bộ group cha, từ trong ra ngoài. An toàn với vòng lặp parent. */
export function groupChain(model: ArchitectureModel, groupId: string | undefined): string[] {
  const chain: string[] = [];
  let current = groupId;
  while (current && !chain.includes(current)) {
    chain.push(current);
    current = model.groups.find((g) => g.id === current)?.parent;
  }
  return chain;
}
