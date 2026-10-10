import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Diagnostic } from '../src';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/', import.meta.url));

export function fixture(name: string): string {
  return readFileSync(FIXTURES + name, 'utf8');
}

/** Dạng gọn để so sánh: `line:code`. */
export function summarize(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map((d) => `${d.line}:${d.code}`);
}

/** Bỏ diagnostic do rule kiến trúc sinh ra (rule mặc định no-orphan báo cả YAML tí hon trong test). */
export function withoutRules(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.filter((d) => !d.rule);
}

/** Ghép YAML tối thiểu hợp lệ với phần thân cần test. */
export function yaml(body: string): string {
  return `version: 1\nsystem:\n  id: test\n  name: Test\n${body}`;
}
