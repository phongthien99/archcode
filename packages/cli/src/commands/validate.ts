import { readFileSync } from 'node:fs';
import { checkLayout, parseLayout, validate, type Diagnostic } from '@archcode/core';
import { findLayout } from './build';
import { colors, count, printDiagnostics } from '../format';

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
    const { model, diagnostics } = validate(text);
    // File layout đi kèm (nếu có) chỉ sinh cảnh báo.
    const layoutPath = findLayout(file);
    if (layoutPath) {
      const parsed = parseLayout(readFileSync(layoutPath, 'utf8'), layoutPath);
      diagnostics.push(...parsed.diagnostics);
      if (model) diagnostics.push(...checkLayout(parsed.layout, model, layoutPath));
    }
    const { errors, warnings } = count(diagnostics);
    reports.push({
      file,
      valid: errors === 0 && !(options.strict && warnings > 0),
      errorCount: errors,
      warningCount: warnings,
      diagnostics,
    });
  }

  if (options.format === 'json') console.log(JSON.stringify(reports, null, 2));
  else printDiagnostics(reports, colors(options.color));

  if (unreadable) return 2;
  return reports.every((r) => r.valid) ? 0 : 1;
}
