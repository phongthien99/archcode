import type { Diagnostic } from '@archcode/core';
import pc from 'picocolors';

export type Colors = ReturnType<typeof pc.createColors>;

export function colors(enabled: boolean): Colors {
  return pc.createColors(enabled && pc.isColorSupported);
}

/**
 * `file:line:col  severity  code  message` — định dạng mà terminal VS Code
 * và hầu hết CI nhận diện được để click tới vị trí lỗi.
 */
export function formatDiagnostic(file: string, d: Diagnostic, c: Colors): string {
  const target = d.file ?? file;
  const location = d.line ? `${target}:${d.line}:${d.column ?? 1}` : target;
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

/** In diagnostics của nhiều file và dòng tổng kết. */
export function printDiagnostics(
  reports: { file: string; diagnostics: Diagnostic[] }[],
  c: Colors,
  { quietWhenClean = false } = {},
): void {
  for (const report of reports) {
    for (const d of report.diagnostics) console.log(formatDiagnostic(report.file, d, c));
  }
  const all = reports.flatMap((r) => r.diagnostics);
  const { errors, warnings } = count(all);
  const fileWord = `${reports.length} file`;
  if (errors === 0 && warnings === 0) {
    if (!quietWhenClean) console.log(c.green(`✔ ${fileWord} hợp lệ`));
    return;
  }
  console.log('');
  const summary = `${errors} lỗi, ${warnings} cảnh báo trong ${fileWord}`;
  console.log(errors ? c.red(`✖ ${summary}`) : c.yellow(`⚠ ${summary}`));
}

export function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
