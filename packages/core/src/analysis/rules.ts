import type {
  ArchitectureModel,
  Component,
  Diagnostic,
  Rule,
  RuleMatcher,
  SourceRef,
  YamlPath,
} from '../types';
import { isAsyncRelationship } from '../constants';
import { groupChain } from '../views/resolve';
import { findCycles } from './cycles';
import { buildGraph } from './graph';

export type Locate = (element: object) => { path?: YamlPath } & Partial<SourceRef>;

const defaultLocate: Locate = (el) => ({ ...(el as { source?: SourceRef }).source });

/** Chạy các rule kiến trúc khai báo trong model (hoặc rule mặc định). */
export function runRules(model: ArchitectureModel, locate: Locate = defaultLocate): Diagnostic[] {
  const graph = buildGraph(model);
  const diagnostics: Diagnostic[] = [];

  for (const rule of model.rules) {
    switch (rule.type) {
      case 'no-circular':
        for (const { cycle, size } of findCycles(
          rule.ignore === 'async' ? syncGraph(model) : graph,
        )) {
          const ids = [...cycle.map((r) => r.from), cycle[0]!.from];
          const extra =
            size > cycle.length ? ` (nhóm ${size} component phụ thuộc vòng lẫn nhau)` : '';
          diagnostics.push({
            ...base(rule),
            code: 'circular-dependency',
            message: `Vòng phụ thuộc: ${ids.join(' → ')}${extra}`,
            target: { kind: 'relationship', id: cycle[0]!.id },
            ...locate(cycle[0]!),
          });
        }
        break;

      case 'no-orphan':
        for (const component of model.components) {
          if (component.type === 'person') continue;
          if (graph.outgoing.get(component.id)!.length || graph.incoming.get(component.id)!.length)
            continue;
          diagnostics.push({
            ...base(rule),
            code: 'orphan-component',
            message: `Component "${component.id}" không có quan hệ nào`,
            target: { kind: 'component', id: component.id },
            ...locate(component),
          });
        }
        break;

      case 'forbidden':
        for (const rels of graph.outgoing.values()) {
          for (const rel of rels) {
            const from = graph.components.get(rel.from)!;
            const to = graph.components.get(rel.to)!;
            if (rule.from && !matches(model, from, rule.from)) continue;
            if (rule.to && !matches(model, to, rule.to)) continue;
            // Quyết định 2026-10-10: so sánh chính xác, group cha/con KHÔNG tính là cùng group.
            if (rule.unless === 'same-group' && from.group !== undefined && from.group === to.group)
              continue;
            diagnostics.push({
              ...base(rule),
              code: 'forbidden-dependency',
              message: `Quan hệ ${rel.from} → ${rel.to} vi phạm rule "${rule.id}"${rule.description ? `: ${rule.description}` : ''}`,
              target: { kind: 'relationship', id: rel.id },
              ...locate(rel),
            });
          }
        }
        break;
    }
  }
  return diagnostics;
}

/** Đồ thị chỉ gồm quan hệ đồng bộ. */
function syncGraph(model: ArchitectureModel) {
  return buildGraph({
    ...model,
    relationships: model.relationships.filter((r) => !isAsyncRelationship(r)),
  });
}

function base(rule: Rule) {
  return { severity: rule.severity, rule: rule.id } as const;
}

/**
 * Mọi trường khai báo trong matcher phải khớp (AND); trong một trường, khớp một giá trị là đủ (OR).
 * `group` khớp cả component nằm trong group con — khác với `unless: same-group`.
 */
export function matches(model: ArchitectureModel, component: Component, m: RuleMatcher): boolean {
  if (m.id && !m.id.includes(component.id)) return false;
  if (m.type && !m.type.includes(component.type)) return false;
  if (m.tag && !m.tag.some((t) => component.tags.includes(t))) return false;
  if (m.group) {
    const chain = groupChain(model, component.group);
    if (!m.group.some((g) => chain.includes(g))) return false;
  }
  return true;
}
