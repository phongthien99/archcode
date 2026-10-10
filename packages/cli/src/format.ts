import type { Diagnostic } from '@archcode/core';
import type pc from 'picocolors';

export type Colors = ReturnType<typeof pc.createColors>;

/**
 * `file:line:col  severity  code  message` — định dạng mà terminal VS Code
 * và hầu hết CI nhận diện được để click tới vị trí lỗi.
 */
export function formatDiagnostic(file: string, d: Diagnostic, c: Colors): string {
  const location = d.line ? `${file}:${d.line}:${d.column ?? 1}` : file;
  const severity =
    d.severity === 'error'
      ? c.red('error  ')
      : d.severity === 'warning'
        ? c.yellow('warning')
        : c.blue('info   ');
  const lines = [`${c.dim(location)}  ${severity}  ${c.dim(d.code)}  ${d.message}`];
  if (d.hint) lines.push(`    ${c.cyan('↳')} ${d.hint}`);
  for (const r of d.related ?? []) {
    lines.push(`    ${c.dim('↳')} ${c.dim(`${file}:${r.line}:${r.column}`)} ${r.message}`);
  }
  return lines.join('\n');
}

export function count(diagnostics: Diagnostic[]) {
  return {
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
  };
}
