import { LineCounter, parseDocument, type Document } from 'yaml';
import type { Diagnostic } from '../types';

export interface ParsedYaml {
  doc: Document;
  lineCounter: LineCounter;
  /** Lỗi và cảnh báo cú pháp YAML. */
  diagnostics: Diagnostic[];
  /** false nếu có lỗi cú pháp — khi đó không nên dùng dữ liệu của `doc`. */
  ok: boolean;
}

/** Đọc YAML thành Document AST, giữ vị trí dòng/cột và comment. */
export function parseYaml(text: string): ParsedYaml {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: true, uniqueKeys: true });

  const diagnostics: Diagnostic[] = [];
  for (const err of doc.errors) {
    const pos = err.linePos?.[0];
    diagnostics.push({
      severity: 'error',
      code: 'yaml-syntax',
      message: `YAML sai cú pháp: ${firstLine(err.message)}`,
      line: pos?.line,
      column: pos?.col,
    });
  }
  for (const warn of doc.warnings) {
    const pos = warn.linePos?.[0];
    diagnostics.push({
      severity: 'warning',
      code: 'yaml-warning',
      message: firstLine(warn.message),
      line: pos?.line,
      column: pos?.col,
    });
  }

  return { doc, lineCounter, diagnostics, ok: doc.errors.length === 0 };
}

// prettyErrors nối thêm đoạn code minh họa sau dòng đầu; diagnostics chỉ cần thông điệp.
function firstLine(message: string): string {
  return message.split('\n')[0]!.replace(/ at line \d+, column \d+:?$/, '');
}
