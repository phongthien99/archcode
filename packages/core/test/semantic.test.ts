import { describe, expect, it } from 'vitest';
import { validate } from '../src';
import { fixture, summarize, yaml } from './helpers';

const codes = (text: string) => validate(text).diagnostics.map((d) => d.code);

describe('tham chiếu', () => {
  const { diagnostics } = validate(fixture('invalid/broken-ref.yaml'));

  it('báo tham chiếu không tồn tại kèm gợi ý ID gần đúng', () => {
    const refs = diagnostics.filter((d) => d.code === 'unknown-reference');
    expect(refs.map((d) => [d.line, d.hint])).toEqual([
      [8, 'Có phải ý bạn là "core"?'],
      [16, 'Có phải ý bạn là "document-db"?'],
      [18, undefined],
      [23, 'Có phải ý bạn là "document-service"?'],
    ]);
  });

  it('trỏ đúng cột của giá trị bị sai', () => {
    expect(diagnostics.find((d) => d.line === 16)).toMatchObject({ column: 9 });
  });

  it('quan hệ nối vào group là lỗi invalid-reference', () => {
    expect(
      codes(
        yaml(`groups: [{ id: g, name: G }]
components: [{ id: a, type: service, group: g }]
relationships: [{ from: a, to: g }]
`),
      ),
    ).toContain('invalid-reference');
  });
});

describe('trùng ID', () => {
  const { diagnostics } = validate(fixture('invalid/duplicate-id.yaml'));

  it('báo trùng giữa group và component, giữa component, giữa relationship', () => {
    expect(summarize(diagnostics)).toEqual([
      '9:duplicate-id',
      '13:duplicate-id',
      '19:duplicate-id',
    ]);
  });

  it('chỉ ra vị trí khai báo lần đầu', () => {
    expect(diagnostics[1]!.related).toEqual([
      { message: 'Đã khai báo lần đầu (component)', line: 11, column: 9 },
    ]);
  });

  it('view và rule có không gian tên riêng', () => {
    expect(
      codes(
        yaml(`components: [{ id: x, type: service }]
views: [{ id: x, name: X }]
rules: [{ id: x, type: no-orphan }]
`),
      ),
    ).not.toContain('duplicate-id');
  });
});

describe('group', () => {
  it('phát hiện vòng lặp parent', () => {
    expect(
      codes(
        yaml(`groups:
  - { id: a, name: A, parent: b }
  - { id: b, name: B, parent: a }
`),
      ),
    ).toEqual(['group-cycle', 'group-cycle']);
  });

  it('group cha không tồn tại', () => {
    expect(codes(yaml('groups: [{ id: a, name: A, parent: zzz }]\n'))).toEqual([
      'unknown-reference',
    ]);
  });
});

describe('view selector', () => {
  const base = `groups: [{ id: core, name: Core }]
components:
  - { id: api, type: service, group: core, tags: [public] }
  - { id: db, type: database }
`;

  it('selector hợp lệ không báo lỗi', () => {
    expect(
      codes(
        yaml(
          `${base}views: [{ id: v, name: V, include: ['*', core, 'group:core', 'type:database', 'tag:public', db] }]\n`,
        ),
      ),
    ).toEqual([]);
  });

  it('prefix không hợp lệ', () => {
    expect(codes(yaml(`${base}views: [{ id: v, name: V, include: ['kind:service'] }]\n`))).toEqual([
      // Cùng một dòng: sắp theo cột — view (cột 10) đứng trước selector.
      'empty-view',
      'invalid-selector',
    ]);
  });

  it('selector không khớp component nào là cảnh báo', () => {
    expect(
      codes(yaml(`${base}views: [{ id: v, name: V, include: ['*'], exclude: ['tag:none'] }]\n`)),
    ).toEqual(['empty-selector']);
  });
});

describe('khác', () => {
  it('phiên bản schema chưa hỗ trợ', () => {
    expect(codes('version: 2\nsystem: { id: s, name: S }\n')).toEqual(['unsupported-version']);
  });

  it('rule forbidden thiếu from/to', () => {
    expect(codes(yaml('rules: [{ id: r, type: forbidden }]\n'))).toEqual(['invalid-rule']);
  });

  it('rule tham chiếu group không tồn tại', () => {
    expect(codes(yaml('rules: [{ id: r, type: forbidden, from: { group: nope } }]\n'))).toEqual([
      'unknown-reference',
    ]);
  });

  it('type tự định nghĩa chỉ là cảnh báo', () => {
    const { diagnostics } = validate(yaml('components: [{ id: lb, type: load-balancer }]\n'));
    expect(diagnostics).toMatchObject([{ code: 'unknown-component-type', severity: 'warning' }]);
  });

  it('diagnostics được sắp theo dòng', () => {
    const lines = validate(fixture('invalid/wrong-type.yaml')).diagnostics.map((d) => d.line!);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });
});
