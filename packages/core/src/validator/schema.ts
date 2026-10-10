import AjvModule, { type ErrorObject } from 'ajv';
import schema from '../schema/architecture.schema.json';
import { keyRefOf, sourceRefOf } from '../parser/sourceRef';
import type { ParsedYaml } from '../parser/parse';
import type { Diagnostic, YamlPath } from '../types';
import { closestMatch, toValidId } from '../util/strings';

// ajv là CommonJS: tùy bundler mà class nằm ở `default` hoặc ở chính module.
const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;
const ajv = new Ajv({ allErrors: true, strict: false, verbose: true });
const validateSchema = ajv.compile(schema);

export const architectureSchema = schema;

/** Kiểm tra cấu trúc dữ liệu theo JSON Schema; lỗi trả về kèm dòng/cột trong YAML. */
export function schemaValidate(data: unknown, parsed: ParsedYaml): Diagnostic[] {
  if (validateSchema(data)) return [];
  return (validateSchema.errors ?? []).map((err) => toDiagnostic(err, parsed));
}

function toDiagnostic(err: ErrorObject, parsed: ParsedYaml): Diagnostic {
  const path = parsePointer(err.instancePath);
  const where = describePath(path);
  const field = lastKey(path);
  const at = (p: YamlPath) => ({ path: p, ...sourceRefOf(parsed, p) });

  switch (err.keyword) {
    case 'required': {
      const missing = (err.params as { missingProperty: string }).missingProperty;
      return {
        severity: 'error',
        code: 'schema-required',
        message: `Thiếu trường bắt buộc "${missing}" trong ${where}`,
        ...at(path),
      };
    }
    case 'type': {
      const expected = String((err.params as { type: string | string[] }).type);
      return {
        severity: 'error',
        code: 'schema-type',
        message: `"${field}" phải là ${typeName(expected)}, nhận được ${typeName(jsonType(err.data))}`,
        hint:
          expected.includes('array') && typeof err.data === 'string'
            ? `Viết dạng danh sách: [${err.data}]`
            : undefined,
        ...at(path),
      };
    }
    case 'enum': {
      const allowed = (err.params as { allowedValues: unknown[] }).allowedValues.map(String);
      const suggestion = typeof err.data === 'string' ? closestMatch(err.data, allowed) : undefined;
      return {
        severity: 'error',
        code: 'schema-enum',
        message: `Giá trị ${JSON.stringify(err.data)} không hợp lệ cho "${field}". Chỉ chấp nhận: ${allowed.join(', ')}`,
        hint: suggestion ? `Có phải ý bạn là "${suggestion}"?` : undefined,
        ...at(path),
      };
    }
    case 'pattern': {
      const value = String(err.data);
      const fixed = toValidId(value);
      return {
        severity: 'error',
        code: 'schema-pattern',
        message: `ID "${value}" sai định dạng: chỉ dùng chữ thường, số, ".", "_", "-" và bắt đầu bằng chữ hoặc số`,
        hint: fixed ? `Gợi ý: "${fixed}"` : undefined,
        ...at(path),
      };
    }
    case 'additionalProperties': {
      const extra = (err.params as { additionalProperty: string }).additionalProperty;
      const known = Object.keys(
        (err.parentSchema as { properties?: Record<string, unknown> } | undefined)?.properties ??
          {},
      );
      const suggestion = closestMatch(extra, known);
      const keyPath = [...path, extra];
      return {
        severity: 'warning',
        code: 'schema-unknown-field',
        message: `Trường "${extra}" không được hỗ trợ trong ${where} và sẽ bị bỏ qua`,
        hint: suggestion
          ? `Có phải ý bạn là "${suggestion}"?`
          : `Trường hợp lệ: ${known.join(', ')}`,
        path: keyPath,
        ...keyRefOf(parsed, keyPath),
      };
    }
    case 'minLength':
      return {
        severity: 'error',
        code: 'schema-invalid',
        message: `"${field}" không được để trống`,
        ...at(path),
      };
    default:
      return {
        severity: 'error',
        code: 'schema-invalid',
        message: `${capitalize(where)}: ${err.message ?? 'không khớp schema'}`,
        ...at(path),
      };
  }
}

/** `/system/components/1` → ['system', 'components', 1] */
function parsePointer(pointer: string): YamlPath {
  if (!pointer) return [];
  return pointer
    .split('/')
    .slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

const NESTED_SECTIONS = new Set(['groups', 'components', 'relationships']);

/** ['system', 'components', 1, 'tags'] → `components[1].tags` */
function describePath(path: YamlPath): string {
  if (!path.length) return 'gốc tài liệu';
  // `system.components[1]` đọc giống `components[1]` cho người dùng.
  const segments =
    path[0] === 'system' && NESTED_SECTIONS.has(String(path[1])) ? path.slice(1) : path;
  return segments.reduce<string>((acc, seg) => {
    if (typeof seg === 'number') return `${acc}[${seg}]`;
    return acc ? `${acc}.${seg}` : seg;
  }, '');
}

function lastKey(path: YamlPath): string {
  for (let i = path.length - 1; i >= 0; i--) {
    if (typeof path[i] === 'string') return path[i] as string;
  }
  return 'gốc tài liệu';
}

function jsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

const TYPE_NAMES: Record<string, string> = {
  string: 'chuỗi',
  integer: 'số nguyên',
  number: 'số',
  boolean: 'true/false',
  array: 'danh sách',
  object: 'object',
  null: 'rỗng',
};

function typeName(type: string): string {
  return type
    .split(',')
    .map((t) => TYPE_NAMES[t] ?? t)
    .join(' hoặc ');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
