import { describe, expect, it } from 'vitest';
import { parseYaml, sourceRefOf } from '../src';
import { fixture } from './helpers';

describe('parseYaml', () => {
  it('đọc YAML hợp lệ không có lỗi', () => {
    const parsed = parseYaml(fixture('document-platform.yaml'));
    expect(parsed.ok).toBe(true);
    expect(parsed.diagnostics).toEqual([]);
  });

  it('báo lỗi thụt lề đúng dòng và cột', () => {
    const parsed = parseYaml(fixture('invalid/syntax-error.yaml'));
    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics[0]).toMatchObject({ code: 'yaml-syntax', line: 8, column: 4 });
    // Thông điệp chỉ giữ dòng đầu, không kèm đoạn code minh họa.
    expect(parsed.diagnostics[0]!.message).not.toContain('\n');
  });

  it('báo lỗi key trùng trong cùng một map', () => {
    const parsed = parseYaml('version: 1\nversion: 2\n');
    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics[0]).toMatchObject({ code: 'yaml-syntax', line: 2 });
  });
});

describe('sourceRefOf', () => {
  const parsed = parseYaml(fixture('document-platform.yaml'));

  it('trả vị trí của giá trị lồng nhau', () => {
    expect(sourceRefOf(parsed, ['components', 3, 'id'])).toEqual({ line: 37, column: 9 });
  });

  it('lùi về node cha gần nhất khi path không tồn tại', () => {
    const parent = sourceRefOf(parsed, ['components', 0]);
    expect(sourceRefOf(parsed, ['components', 0, 'technology'])).toEqual(parent);
  });

  it('trả vị trí gốc khi path trống', () => {
    expect(sourceRefOf(parsed, [])).toEqual({ line: 3, column: 1 });
  });
});
