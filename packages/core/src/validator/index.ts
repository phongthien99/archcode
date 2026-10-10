import { normalize, isObj } from '../parser/normalize';
import { parseYaml } from '../parser/parse';
import type { Diagnostic, ValidationResult } from '../types';
import { schemaValidate } from './schema';
import { semanticValidate } from './semantic';

/**
 * Pipeline validate đầy đủ: YAML → schema → model → semantic.
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

  return {
    model,
    diagnostics: sortDiagnostics([
      ...parsed.diagnostics,
      ...schemaDiagnostics,
      ...normalizeDiagnostics,
      ...semanticDiagnostics,
    ]),
  };
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
