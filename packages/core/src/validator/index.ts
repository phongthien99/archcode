import { runRules } from '../analysis/rules';
import { normalize, isObj } from '../parser/normalize';
import { parseYaml } from '../parser/parse';
import { sourceRefOf } from '../parser/sourceRef';
import type {
  ArchitectureModel,
  Diagnostic,
  DiagnosticTarget,
  ElementKind,
  ValidationResult,
  YamlPath,
} from '../types';
import { schemaValidate } from './schema';
import { semanticValidate } from './semantic';

/**
 * Pipeline validate đầy đủ: YAML → schema → model → semantic → rule kiến trúc.
 * Một hàm duy nhất dùng chung cho web và CLI.
 */
export function validate(text: string): ValidationResult {
  const parsed = parseYaml(text);
  if (!parsed.ok) return { model: null, diagnostics: sortDiagnostics(parsed.diagnostics) };

  const data: unknown = parsed.doc.toJS();
  if (!isObj(data)) {
    return {
      model: null,
      diagnostics: sortDiagnostics([
        ...parsed.diagnostics,
        {
          severity: 'error',
          code: 'empty-document',
          message: 'File rỗng hoặc gốc không phải object YAML (cần có "version" và "system")',
          line: 1,
          column: 1,
        },
      ]),
    };
  }

  const schemaDiagnostics = schemaValidate(data, parsed);
  const { model, pathOf, diagnostics: normalizeDiagnostics } = normalize(data, parsed);
  const semanticDiagnostics = semanticValidate(model, { parsed, pathOf });
  const ruleDiagnostics = runRules(model, (el) => {
    const path = pathOf(el);
    return path ? { path, ...sourceRefOf(parsed, path) } : {};
  });

  const diagnostics = [
    ...parsed.diagnostics,
    ...schemaDiagnostics,
    ...normalizeDiagnostics,
    ...semanticDiagnostics,
    ...ruleDiagnostics,
  ];
  attachTargets(diagnostics, model, pathOf);
  return { model, diagnostics: sortDiagnostics(diagnostics) };
}

/** Gắn `target` cho diagnostic chưa có, dựa trên phần tử có đường dẫn YAML là tiền tố dài nhất. */
function attachTargets(
  diagnostics: Diagnostic[],
  model: ArchitectureModel,
  pathOf: (el: object) => YamlPath | undefined,
) {
  const entries: { path: YamlPath; target: DiagnosticTarget }[] = [];
  const add = (kind: ElementKind, items: { id: string }[]) => {
    for (const el of items) {
      const path = pathOf(el);
      if (path) entries.push({ path, target: { kind, id: el.id } });
    }
  };
  add('group', model.groups);
  add('component', model.components);
  add('relationship', model.relationships);
  add('view', model.views);
  add('rule', model.rules);

  for (const d of diagnostics) {
    if (d.target || !d.path) continue;
    let best: (typeof entries)[number] | undefined;
    for (const entry of entries) {
      const isPrefix = entry.path.every((seg, i) => d.path![i] === seg);
      if (isPrefix && (!best || entry.path.length > best.path.length)) best = entry;
    }
    if (best) d.target = best.target;
  }
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

/** Sắp theo dòng, cột, rồi mức độ; diagnostic không có vị trí xếp cuối. */
export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) =>
      (a.line ?? Infinity) - (b.line ?? Infinity) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}
