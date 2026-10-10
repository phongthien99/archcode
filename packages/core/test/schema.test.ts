import { describe, expect, it } from 'vitest';
import { architectureSchema, validate } from '../src';
import { fixture, summarize } from './helpers';

describe('schema validation', () => {
  it('fixture chuẩn hợp lệ', () => {
    expect(validate(fixture('document-platform.yaml')).diagnostics).toEqual([]);
  });

  it('thiếu trường bắt buộc báo đúng dòng của phần tử', () => {
    const { diagnostics } = validate(fixture('invalid/missing-field.yaml'));
    expect(summarize(diagnostics)).toEqual(['8:schema-required', '10:schema-required']);
    expect(diagnostics[0]!.message).toBe('Thiếu trường bắt buộc "id" trong components[1]');
  });

  it('sai kiểu, sai định dạng, sai enum, trường lạ', () => {
    const { diagnostics } = validate(fixture('invalid/wrong-type.yaml'));
    expect(summarize(diagnostics)).toEqual([
      '1:schema-type',
      '3:schema-pattern',
      '8:schema-type',
      '9:schema-unknown-field',
      '11:unknown-component-type',
      '13:self-loop',
      '18:schema-type',
      '19:schema-enum',
      '22:schema-enum',
      '23:schema-enum',
    ]);
  });

  it('thông báo lỗi bằng tiếng Việt, không lộ thông điệp thô của Ajv', () => {
    const { diagnostics } = validate(fixture('invalid/wrong-type.yaml'));
    for (const d of diagnostics) expect(d.message).not.toMatch(/must (be|have|match)/);
  });

  it('gợi ý sửa lỗi', () => {
    const { diagnostics } = validate(fixture('invalid/wrong-type.yaml'));
    const hint = (code: string) => diagnostics.find((d) => d.code === code)?.hint;
    expect(hint('schema-pattern')).toBe('Gợi ý: "wrong_type"');
    expect(hint('unknown-component-type')).toBe('Có phải ý bạn là "service"?');
  });

  it('trường lạ chỉ là cảnh báo và trỏ vào dòng của key', () => {
    const { diagnostics } = validate(fixture('invalid/wrong-type.yaml'));
    expect(diagnostics.find((d) => d.code === 'schema-unknown-field')).toMatchObject({
      severity: 'warning',
      line: 9,
      column: 5,
    });
  });
});

// S1-SCHEMA-04: kiểu TS và JSON Schema không được lệch nhau.
describe('đồng bộ kiểu TypeScript ↔ JSON Schema', () => {
  const defs = architectureSchema.definitions as unknown as Record<string, { properties: object }>;
  const { model } = validate(fixture('document-platform.yaml'));
  // Trường chỉ có trong model (sinh ra khi normalize), không có trong YAML.
  const derived = new Set(['source', 'explicitId', 'implicit']);
  const fieldsOf = (objects: object[]) =>
    [...new Set(objects.flatMap((o) => Object.keys(o)))].filter((k) => !derived.has(k));

  it.each([
    ['component', () => model!.components],
    ['group', () => model!.groups],
    ['relationship', () => model!.relationships],
    ['view', () => model!.views],
    ['rule', () => model!.rules],
  ] as const)('mọi trường của %s trong model đều có trong schema', (name, items) => {
    const schemaFields = Object.keys(defs[name]!.properties);
    for (const field of fieldsOf(items())) expect(schemaFields).toContain(field);
  });
});
