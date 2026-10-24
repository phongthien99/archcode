import { COMPONENT_TYPES, SCHEMA_VERSION, VIEW_SELECTOR_PREFIXES } from '../constants';
import type { ParsedYaml } from '../parser/parse';
import { sourceRefOf } from '../parser/sourceRef';
import type { ArchitectureModel, Diagnostic, RuleMatcher, SourceRef, YamlPath } from '../types';
import { didYouMean } from '../util/strings';
import { matchesSelector, resolveView } from '../views/resolve';

interface Context {
  parsed: ParsedYaml;
  pathOf: (element: object) => YamlPath | undefined;
}

/** Kiểm tra các ràng buộc mà JSON Schema không biểu diễn được: tham chiếu, trùng ID, vòng lặp... */
export function semanticValidate(model: ArchitectureModel, ctx: Context): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  /** Vị trí của `field` trong phần tử `el` (fallback về chính phần tử). */
  const at = (el: object, ...field: YamlPath): { path?: YamlPath } & Partial<SourceRef> => {
    const base = ctx.pathOf(el);
    if (!base) return {};
    const path = [...base, ...field];
    return { path, ...sourceRefOf(ctx.parsed, path) };
  };

  const componentIds = new Set(model.components.map((c) => c.id));
  const groupIds = new Set(model.groups.map((g) => g.id));
  const nodeIds = [...componentIds, ...groupIds];

  // --- version
  if (model.version !== SCHEMA_VERSION) {
    diagnostics.push({
      severity: 'error',
      code: 'unsupported-version',
      message: `Phiên bản schema ${model.version} chưa được hỗ trợ; phiên bản hiện tại là ${SCHEMA_VERSION}`,
      ...sourceAt(ctx, ['version']),
    });
  }

  // --- trùng ID. Component và group dùng chung không gian tên vì selector `<id>` của view áp dụng cho cả hai.
  checkDuplicates(
    [
      ...model.groups.map((g) => ({ id: g.id, el: g, kind: 'group' })),
      ...model.components.map((c) => ({ id: c.id, el: c, kind: 'component' })),
    ],
    'component/group',
  );
  checkDuplicates(
    model.relationships
      .filter((r) => r.explicitId)
      .map((r) => ({ id: r.id, el: r, kind: 'relationship' })),
    'relationship',
  );
  checkDuplicates(
    model.views.filter((v) => !v.implicit).map((v) => ({ id: v.id, el: v, kind: 'view' })),
    'view',
  );
  checkDuplicates(
    model.rules.filter((r) => !r.implicit).map((r) => ({ id: r.id, el: r, kind: 'rule' })),
    'rule',
  );

  // --- groups
  for (const group of model.groups) {
    if (group.parent === undefined) continue;
    if (!groupIds.has(group.parent)) {
      diagnostics.push(
        unknownRef(
          `Group cha "${group.parent}" không tồn tại`,
          group.parent,
          groupIds,
          at(group, 'parent'),
        ),
      );
      continue;
    }
    // Vòng lặp parent: a → b → a
    const seen = [group.id];
    let current: string | undefined = group.parent;
    while (current) {
      if (seen.includes(current)) {
        if (current === group.id) {
          diagnostics.push({
            severity: 'error',
            code: 'group-cycle',
            message: `Group lồng nhau tạo thành vòng: ${[...seen, current].join(' → ')}`,
            ...at(group, 'parent'),
          });
        }
        break;
      }
      seen.push(current);
      current = model.groups.find((g) => g.id === current)?.parent;
    }
  }

  // --- components
  for (const component of model.components) {
    if (component.group !== undefined && !groupIds.has(component.group)) {
      diagnostics.push(
        unknownRef(
          `Group "${component.group}" không tồn tại`,
          component.group,
          groupIds,
          at(component, 'group'),
        ),
      );
    }
    if (
      component.type !== 'unknown' &&
      !(COMPONENT_TYPES as readonly string[]).includes(component.type)
    ) {
      diagnostics.push({
        severity: 'warning',
        code: 'unknown-component-type',
        message: `Loại component "${component.type}" không có sẵn; sẽ hiển thị với kiểu mặc định`,
        hint:
          didYouMean(component.type, COMPONENT_TYPES) ??
          `Loại có sẵn: ${COMPONENT_TYPES.join(', ')}`,
        ...at(component, 'type'),
      });
    }
  }

  // --- relationships
  for (const rel of model.relationships) {
    for (const end of ['from', 'to'] as const) {
      const target = rel[end];
      // Đầu mút là component hoặc group (connector nối vào khung group).
      if (componentIds.has(target) || groupIds.has(target)) continue;
      diagnostics.push(
        unknownRef(`Component "${target}" không tồn tại`, target, componentIds, at(rel, end)),
      );
    }
    if (rel.from === rel.to) {
      diagnostics.push({
        severity: 'warning',
        code: 'self-loop',
        message: `Quan hệ "${rel.id}" trỏ vào chính component "${rel.from}"`,
        ...at(rel),
      });
    }
  }

  // --- views
  for (const view of model.views) {
    if (view.implicit) continue;
    for (const key of ['include', 'exclude'] as const) {
      view[key].forEach((selector, i) => {
        const loc = at(view, key, i);
        if (selector === '*') return;
        const colon = selector.indexOf(':');
        if (colon === -1) {
          if (!componentIds.has(selector) && !groupIds.has(selector)) {
            diagnostics.push(
              unknownRef(
                `View "${view.id}": không có component hay group "${selector}"`,
                selector,
                nodeIds,
                loc,
              ),
            );
          }
          return;
        }
        const prefix = selector.slice(0, colon);
        const value = selector.slice(colon + 1);
        if (!(VIEW_SELECTOR_PREFIXES as readonly string[]).includes(prefix)) {
          diagnostics.push({
            severity: 'error',
            code: 'invalid-selector',
            message: `Selector "${selector}" không hợp lệ`,
            hint: `Dùng "*", "<id>", ${VIEW_SELECTOR_PREFIXES.map((p) => `"${p}:<giá trị>"`).join(', ')}`,
            ...loc,
          });
          return;
        }
        if (prefix === 'group' && !groupIds.has(value)) {
          diagnostics.push(
            unknownRef(`View "${view.id}": group "${value}" không tồn tại`, value, groupIds, loc),
          );
          return;
        }
        if (!model.components.some((c) => matchesSelector(model, c, selector))) {
          diagnostics.push({
            severity: 'warning',
            code: 'empty-selector',
            message: `Selector "${selector}" không khớp component nào`,
            ...loc,
          });
        }
      });
    }
    if (model.components.length && !resolveView(model, view).components.length) {
      diagnostics.push({
        severity: 'warning',
        code: 'empty-view',
        message: `View "${view.id}" không có component nào`,
        ...at(view),
      });
    }
  }

  // --- rules
  for (const rule of model.rules) {
    if (rule.implicit || rule.type !== 'forbidden') continue;
    if (isEmptyMatcher(rule.from) && isEmptyMatcher(rule.to)) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-rule',
        message: `Rule "${rule.id}" loại forbidden cần ít nhất "from" hoặc "to"`,
        ...at(rule),
      });
    }
    for (const end of ['from', 'to'] as const) {
      const m = rule[end];
      m?.group?.forEach((g) => {
        if (!groupIds.has(g)) {
          diagnostics.push(
            unknownRef(
              `Rule "${rule.id}": group "${g}" không tồn tại`,
              g,
              groupIds,
              at(rule, end, 'group'),
            ),
          );
        }
      });
      m?.id?.forEach((id) => {
        if (!componentIds.has(id)) {
          diagnostics.push(
            unknownRef(
              `Rule "${rule.id}": component "${id}" không tồn tại`,
              id,
              componentIds,
              at(rule, end, 'id'),
            ),
          );
        }
      });
    }
  }

  return diagnostics;

  function checkDuplicates(items: { id: string; el: object; kind: string }[], namespace: string) {
    const first = new Map<string, { el: object; kind: string }>();
    for (const item of items) {
      const prev = first.get(item.id);
      if (!prev) {
        first.set(item.id, item);
        continue;
      }
      const prevLoc = at(prev.el, 'id');
      diagnostics.push({
        severity: 'error',
        code: 'duplicate-id',
        message: `ID "${item.id}" bị trùng (${namespace})`,
        ...at(item.el, 'id'),
        related: prevLoc.line
          ? [
              {
                message: `Đã khai báo lần đầu (${prev.kind})`,
                line: prevLoc.line,
                column: prevLoc.column ?? 1,
              },
            ]
          : undefined,
      });
    }
  }
}

function unknownRef(
  message: string,
  target: string,
  candidates: Iterable<string>,
  loc: { path?: YamlPath } & Partial<SourceRef>,
): Diagnostic {
  return {
    severity: 'error',
    code: 'unknown-reference',
    message,
    hint: didYouMean(target, candidates),
    ...loc,
  };
}

function isEmptyMatcher(m: RuleMatcher | undefined): boolean {
  return !m || Object.keys(m).length === 0;
}

function sourceAt(ctx: Context, path: YamlPath) {
  return { path, ...sourceRefOf(ctx.parsed, path) };
}
