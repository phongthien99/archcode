import { describe, expect, it } from 'vitest';
import { validate } from '../src';
import { fixture, withoutRules, yaml } from './helpers';

describe('normalize', () => {
  it('fixture chuẩn → model khớp snapshot', () => {
    const { model, diagnostics } = validate(fixture('document-platform.yaml'));
    expect(diagnostics).toEqual([]);
    expect(model).toMatchSnapshot();
  });

  it('gắn vị trí nguồn cho từng phần tử', () => {
    const { model } = validate(fixture('document-platform.yaml'));
    const service = model!.components.find((c) => c.id === 'document-service')!;
    expect(service.source).toEqual({ line: 36, column: 5 });
  });

  it('`system.components` và `components` ở cấp gốc cho cùng model', () => {
    const nested = validate(
      'version: 1\nsystem:\n  id: s\n  name: S\n  components:\n    - id: a\n      type: service\n',
    );
    const root = validate(
      'version: 1\nsystem:\n  id: s\n  name: S\ncomponents:\n  - id: a\n    type: service\n',
    );
    const strip = (m: typeof nested.model) =>
      m!.components.map(({ source: _source, ...rest }) => rest);
    expect(strip(nested.model)).toEqual(strip(root.model));
    expect(withoutRules(nested.diagnostics)).toEqual([]);
  });

  it('báo lỗi khi một mục khai báo ở cả hai nơi', () => {
    const { diagnostics } = validate(
      'version: 1\nsystem:\n  id: s\n  name: S\n  components: []\ncomponents: []\n',
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'ambiguous-section', line: 5 }),
    );
  });

  it('điền giá trị mặc định: name = id, view và rule mặc định', () => {
    const { model } = validate(yaml('components:\n  - id: api\n    type: service\n'));
    expect(model!.components[0]!.name).toBe('api');
    expect(model!.views).toMatchObject([{ id: 'all', include: ['*'], implicit: true }]);
    expect(model!.rules.map((r) => [r.type, r.severity])).toEqual([
      ['no-circular', 'warning'],
      ['no-orphan', 'warning'],
    ]);
  });

  it('không thêm rule mặc định khi YAML khai báo `rules: []`', () => {
    const { model } = validate(yaml('rules: []\n'));
    expect(model!.rules).toEqual([]);
  });
});

describe('relationship id', () => {
  const body = `components:
  - { id: a, type: service }
  - { id: b, type: service }
relationships:
  - { from: a, to: b, type: http }
  - { from: a, to: b, type: grpc }
  - { from: a, to: b, type: grpc }
  - { id: a->b~2, from: b, to: a }
`;

  it('sinh id ổn định và không trùng với id khai báo', () => {
    const { model } = validate(yaml(body));
    expect(model!.relationships.map((r) => r.id)).toEqual([
      'a->b',
      'a->b:grpc',
      'a->b~3',
      'a->b~2',
    ]);
  });

  it('cho cùng kết quả qua nhiều lần parse', () => {
    const ids = () => validate(yaml(body)).model!.relationships.map((r) => r.id);
    expect(ids()).toEqual(ids());
  });
});

describe('model một phần khi dữ liệu lỗi', () => {
  it('bỏ qua phần tử hỏng, giữ phần tử còn lại', () => {
    const { model, diagnostics } = validate(fixture('invalid/missing-field.yaml'));
    expect(model!.components.map((c) => c.id)).toEqual(['api', 'db']);
    expect(model!.relationships).toHaveLength(1);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('trả model null khi YAML sai cú pháp', () => {
    expect(validate(fixture('invalid/syntax-error.yaml')).model).toBeNull();
  });

  it('trả model null và empty-document khi file rỗng', () => {
    const result = validate('');
    expect(result.model).toBeNull();
    expect(result.diagnostics).toMatchObject([{ code: 'empty-document' }]);
  });
});
