import { readFileSync } from 'node:fs';
import { validate, type Diagnostic } from '@archcode/core';
import pc from 'picocolors';
import { count, formatDiagnostic, type Colors } from '../format';

export interface ValidateOptions {
  strict: boolean;
  format: string;
  color: boolean;
}

interface FileReport {
  file: string;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  diagnostics: Diagnostic[];
}

/** Trả exit code: 0 = sạch, 1 = có lỗi (hoặc cảnh báo khi --strict), 2 = lỗi sử dụng/đọc file. */
export function validateCommand(files: string[], options: ValidateOptions): number {
  if (options.format !== 'text' && options.format !== 'json') {
    console.error(`Định dạng "${options.format}" không hỗ trợ; dùng text hoặc json`);
    return 2;
  }

  const reports: FileReport[] = [];
  let unreadable = false;
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch (err) {
      unreadable = true;
      console.error(`Không đọc được file "${file}": ${(err as Error).message}`);
      continue;
    }
    const { diagnostics } = validate(text);
    const { errors, warnings } = count(diagnostics);
    reports.push({
      file,
      valid: errors === 0 && !(options.strict && warnings > 0),
      errorCount: errors,
      warningCount: warnings,
      diagnostics,
    });
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    printText(reports, pc.createColors(options.color && pc.isColorSupported));
  }

  if (unreadable) return 2;
  return reports.every((r) => r.valid) ? 0 : 1;
}

function printText(reports: FileReport[], c: Colors) {
  for (const report of reports) {
    for (const d of report.diagnostics) console.log(formatDiagnostic(report.file, d, c));
  }

  const errors = reports.reduce((n, r) => n + r.errorCount, 0);
  const warnings = reports.reduce((n, r) => n + r.warningCount, 0);
  const fileWord = `${reports.length} file`;
  if (errors === 0 && warnings === 0) {
    console.log(c.green(`✔ ${fileWord} hợp lệ`));
  } else {
    if (reports.some((r) => r.diagnostics.length)) console.log('');
    const summary = `${errors} lỗi, ${warnings} cảnh báo trong ${fileWord}`;
    console.log(errors ? c.red(`✖ ${summary}`) : c.yellow(`⚠ ${summary}`));
  }
}
