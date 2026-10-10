import { describe, expect, it } from 'vitest';
import { applyCommand, validate, type Command, type MutationResult } from '../src';
import { yaml } from './helpers';

function ok(result: MutationResult) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

function apply(text: string, command: Command): string {
  return ok(applyCommand(text, command)).text;
}

function error(text: string, command: Command): string {
  const result = applyCommand(text, command);
  if (result.ok) throw new Error('Lệnh lẽ ra phải lỗi');
  return result.error;
}

const BLOCK = yaml(`
components:
  # Cổng vào
  - id: api
    type: gateway # Kong
    technology: Kong

  - id: service
    type: service

relationships:
  - from: api
    to: service
    type: http
`);

const FLOW = yaml(`
components:
  - { id: api, type: gateway }
  - { id: db, type: database }
relationships:
  - { from: api, to: db, type: sql }
`);

describe('applyCommand — khung', () => {
  it('trả changes tối thiểu, áp vào text gốc ra đúng text mới', () => {
    const result = ok(
      applyCommand(BLOCK, {
        type: 'updateField',
        target: { kind: 'component', id: 'api' },
        field: 'technology',
        value: 'Envoy',
      }),
    );
    expect(result.changes).toEqual([
      { from: BLOCK.lastIndexOf('Kong\n'), to: BLOCK.lastIndexOf('Kong\n') + 4, insert: 'Envoy' },
    ]);
    let out = BLOCK;
    for (const c of [...result.changes].reverse())
      out = out.slice(0, c.from) + c.insert + out.slice(c.to);
    expect(out).toBe(result.text);
  });

  it('YAML lỗi cú pháp → lỗi rõ ràng, không đổi text', () => {
    expect(error('a: [', { type: 'deleteComponent', id: 'x' })).toMatch(/lỗi cú pháp/);
  });

  it('lệnh không hợp lệ', () => {
    expect(error(BLOCK, { type: 'nope' } as unknown as Command)).toMatch(/không được hỗ trợ/);
    expect(error(BLOCK, { type: 'addComponent', component: { type: '' } })).toMatch(/Thiếu "type"/);
    expect(
      error(BLOCK, { type: 'addComponent', component: { type: 'service', id: 'Bad ID' } }),
    ).toMatch(/không hợp lệ/);
    expect(
      error(BLOCK, { type: 'addComponent', component: { type: 'service', id: 'api' } }),
    ).toMatch(/đã được dùng/);
    expect(
      error(BLOCK, { type: 'addComponent', component: { type: 'service', group: 'nope' } }),
    ).toMatch(/Group "nope" không tồn tại/);
    expect(
      error(BLOCK, {
        type: 'updateField',
        target: { kind: 'component', id: 'api' },
        field: 'color',
        value: 'x',
      }),
    ).toMatch(/không có trong component/);
    expect(
      error(BLOCK, {
        type: 'updateField',
        target: { kind: 'component', id: 'zzz' },
        field: 'name',
        value: 'x',
      }),
    ).toMatch(/Component "zzz" không tồn tại/);
    expect(
      error(BLOCK, {
        type: 'updateField',
        target: { kind: 'component', id: 'api' },
        field: 'type',
        value: null,
      }),
    ).toMatch(/bắt buộc/);
    expect(
      error(BLOCK, {
        type: 'updateField',
        target: { kind: 'component', id: 'api' },
        field: 'tags',
        value: 'x',
      }),
    ).toMatch(/danh sách/);
    expect(
      error(BLOCK, {
        type: 'updateField',
        target: { kind: 'component', id: 'api' },
        field: 'name',
        value: ['x'],
      }),
    ).toMatch(/phải là chuỗi/);
    expect(
      error(BLOCK, { type: 'renameId', kind: 'component', from: 'api', to: 'service' }),
    ).toMatch(/đã được dùng/);
    expect(
      error(BLOCK, { type: 'addRelationship', relationship: { from: 'api', to: 'ghost' } }),
    ).toMatch(/không tồn tại/);
    expect(
      error(BLOCK, {
        type: 'addRelationship',
        relationship: { from: 'api', to: 'service', type: 'http' },
      }),
    ).toMatch(/Đã có quan hệ/);
    expect(error(BLOCK, { type: 'updateRelationship', id: 'api->service' })).toMatch(
      /Cần "from" hoặc "to"/,
    );
    expect(error(BLOCK, { type: 'deleteRelationship', id: 'x->y' })).toMatch(
      /Quan hệ "x->y" không tồn tại/,
    );
  });

  it('giá trị không đổi → không có thay đổi', () => {
    const result = ok(
      applyCommand(BLOCK, {
        type: 'updateField',
        target: { kind: 'component', id: 'api' },
        field: 'technology',
        value: 'Kong',
      }),
    );
    expect(result.changes).toEqual([]);
    expect(result.text).toBe(BLOCK);
  });
});

describe('addComponent', () => {
  it('block: sinh ID duy nhất, chèn cuối danh sách, giữ dòng trống giữa các phần tử', () => {
    const out = apply(BLOCK, { type: 'addComponent', component: { type: 'service' } });
    expect(out).toContain(
      '  - id: service\n    type: service\n\n  - id: service-2\n    type: service\n\nrelationships:',
    );
    const again = apply(out, { type: 'addComponent', component: { type: 'service' } });
    expect(again).toContain('- id: service-3');
  });

  it('flow: phần tử mới cùng kiểu với phần tử lân cận', () => {
    const out = apply(FLOW, {
      type: 'addComponent',
      component: { type: 'cache', name: 'Redis, cluster', technology: 'Redis' },
    });
    expect(out).toContain(
      "  - { id: db, type: database }\n  - { id: cache, name: 'Redis, cluster', type: cache, technology: Redis }\nrelationships:",
    );
    expect(validate(out).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('danh sách flow trên một dòng', () => {
    const text = yaml('components: [{ id: a, type: service }]\n');
    expect(apply(text, { type: 'addComponent', component: { type: 'queue', id: 'q' } })).toContain(
      'components: [{ id: a, type: service }, { id: q, type: queue }]',
    );
  });

  it('`components: []` → chuyển sang dạng block', () => {
    const text = yaml('components: []\n');
    expect(apply(text, { type: 'addComponent', component: { type: 'service' } })).toContain(
      'components:\n  - id: service\n    type: service\n',
    );
  });

  it('chưa có section → tạo section ở cấp gốc, trước views', () => {
    const text =
      '# Hệ thống\nversion: 1\nsystem:\n  id: s\n  name: S\n\n# Các view\nviews:\n  - id: all\n    name: All\n';
    const out = apply(text, { type: 'addComponent', component: { type: 'frontend', name: 'Web' } });
    expect(out).toBe(
      '# Hệ thống\nversion: 1\nsystem:\n  id: s\n  name: S\n\ncomponents:\n  - id: frontend\n    name: Web\n    type: frontend\n\n# Các view\nviews:\n  - id: all\n    name: All\n',
    );
  });

  it('YAML trống tối thiểu (không có newline cuối)', () => {
    const out = apply('version: 1\nsystem: { id: s, name: S }', {
      type: 'addComponent',
      component: { type: 'service' },
    });
    expect(out).toBe(
      'version: 1\nsystem: { id: s, name: S }\n\ncomponents:\n  - id: service\n    type: service\n',
    );
    expect(validate(out).model!.components).toHaveLength(1);
  });

  it('section trong system (system.components)', () => {
    const text =
      'version: 1\nsystem:\n  id: s\n  name: S\n  components:\n    - id: a\n      type: service\n';
    const out = apply(text, { type: 'addComponent', component: { type: 'database', id: 'db' } });
    expect(out).toBe(`${text}    - id: db\n      type: database\n`);
    const rel = apply(out, {
      type: 'addRelationship',
      relationship: { from: 'a', to: 'db', type: 'sql' },
    });
    expect(rel).toContain('  relationships:\n    - from: a\n      to: db\n      type: sql\n');
    expect(validate(rel).model!.relationships).toHaveLength(1);
  });

  it('`components:` rỗng', () => {
    const out = apply(yaml('components:\nrelationships: []\n'), {
      type: 'addComponent',
      component: { type: 'service' },
    });
    expect(out).toContain('components:\n  - id: service\n    type: service\nrelationships: []');
  });

  it('ID sinh từ type tùy biến có ký tự lạ', () => {
    const result = ok(
      applyCommand(BLOCK, { type: 'addComponent', component: { type: 'Máy chủ ĐN' } }),
    );
    expect(result.select).toEqual({ kind: 'component', id: 'may-chu-dn' });
  });
});

describe('updateField', () => {
  const target = { kind: 'component' as const, id: 'api' };

  it('sửa giá trị giữ comment cuối dòng', () => {
    const out = apply(BLOCK, { type: 'updateField', target, field: 'type', value: 'service' });
    expect(out).toContain('    type: service # Kong\n');
  });

  it('thêm field theo thứ tự chuẩn (name sau id)', () => {
    const out = apply(BLOCK, { type: 'updateField', target, field: 'name', value: 'API Gateway' });
    expect(out).toContain('  - id: api\n    name: API Gateway\n    type: gateway # Kong\n');
  });

  it('thêm field vào cuối khi không có key đứng sau', () => {
    const out = apply(BLOCK, {
      type: 'updateField',
      target: { kind: 'component', id: 'service' },
      field: 'owner',
      value: 'team-a',
    });
    expect(out).toContain(
      '  - id: service\n    type: service\n    owner: team-a\n\nrelationships:',
    );
  });

  it('xóa field = bỏ key (kể cả comment trên cùng dòng)', () => {
    const out = apply(BLOCK, { type: 'updateField', target, field: 'technology', value: null });
    expect(out).toContain('    type: gateway # Kong\n\n  - id: service');
    expect(out).not.toContain('technology');
    expect(
      apply(BLOCK, { type: 'updateField', target, field: 'technology', value: '  ' }),
    ).not.toContain('technology');
  });

  it('xóa key nằm trên dòng có dấu "-"', () => {
    const text = yaml('components:\n  - name: A # tên\n    id: a\n    type: service\n');
    expect(
      apply(text, {
        type: 'updateField',
        target: { kind: 'component', id: 'a' },
        field: 'name',
        value: null,
      }),
    ).toContain('components:\n  - id: a\n    type: service\n');
  });

  it('flow map: sửa, thêm, xóa', () => {
    const t = { kind: 'component' as const, id: 'db' };
    let out = apply(FLOW, {
      type: 'updateField',
      target: t,
      field: 'technology',
      value: 'PostgreSQL 16',
    });
    expect(out).toContain('- { id: db, type: database, technology: PostgreSQL 16 }');
    out = apply(out, { type: 'updateField', target: t, field: 'name', value: 'Main: DB' });
    expect(out).toContain(
      "- { id: db, name: 'Main: DB', type: database, technology: PostgreSQL 16 }",
    );
    out = apply(out, { type: 'updateField', target: t, field: 'technology', value: null });
    expect(out).toContain("- { id: db, name: 'Main: DB', type: database }");
    out = apply(out, { type: 'updateField', target: t, field: 'name', value: null });
    expect(out).toContain('- { id: db, type: database }');
  });

  it('giữ kiểu quote cũ; quote khi cần', () => {
    const text = yaml(
      'components:\n  - id: a\n    type: service\n    name: "A"\n    owner: \'x\'\n',
    );
    const t = { kind: 'component' as const, id: 'a' };
    expect(apply(text, { type: 'updateField', target: t, field: 'name', value: 'B' })).toContain(
      'name: "B"',
    );
    expect(
      apply(text, { type: 'updateField', target: t, field: 'owner', value: "it's" }),
    ).toContain("owner: 'it''s'");
    expect(
      apply(text, { type: 'updateField', target: t, field: 'technology', value: 'true' }),
    ).toContain("technology: 'true'");
    expect(
      apply(text, { type: 'updateField', target: t, field: 'technology', value: 'a # b' }),
    ).toContain("technology: 'a # b'");
    expect(
      apply(text, {
        type: 'updateField',
        target: t,
        field: 'technology',
        value: 'Java / Spring Boot',
      }),
    ).toContain('technology: Java / Spring Boot');
  });

  it('mô tả nhiều dòng; block scalar giữ dạng |', () => {
    const t = { kind: 'component' as const, id: 'a' };
    const text = yaml(
      'components:\n  - id: a\n    type: service\n    description: |\n      Dòng 1\n      Dòng 2\n    owner: x\n',
    );
    const out = apply(text, {
      type: 'updateField',
      target: t,
      field: 'description',
      value: 'Mới 1\nMới 2',
    });
    expect(out).toContain('    description: |-\n      Mới 1\n      Mới 2\n    owner: x\n');
    expect(validate(out).model!.components[0]!.description).toBe('Mới 1\nMới 2');
    const plain = apply(yaml('components:\n  - id: a\n    type: service\n'), {
      type: 'updateField',
      target: t,
      field: 'description',
      value: 'A\nB',
    });
    expect(validate(plain).model!.components[0]!.description).toBe('A\nB');
  });

  it('tags: flow mới, block giữ block, rỗng = xóa', () => {
    const t = { kind: 'component' as const, id: 'a' };
    const text = yaml('components:\n  - id: a\n    type: service\n');
    const out = apply(text, {
      type: 'updateField',
      target: t,
      field: 'tags',
      value: ['critical', 'pci dss'],
    });
    expect(out).toContain('    tags: [critical, pci dss]\n');
    const block = yaml(
      'components:\n  - id: a\n    type: service\n    tags:\n      - x\n      - y\n',
    );
    expect(apply(block, { type: 'updateField', target: t, field: 'tags', value: ['z'] })).toContain(
      '    tags:\n      - z\n',
    );
    expect(apply(out, { type: 'updateField', target: t, field: 'tags', value: [] })).not.toContain(
      'tags',
    );
  });

  it('group / parent / from / to được kiểm tra tham chiếu', () => {
    const text = yaml(
      'groups:\n  - { id: g1, name: G1 }\n  - { id: g2, name: G2, parent: g1 }\ncomponents:\n  - { id: a, type: service }\n',
    );
    expect(
      apply(text, {
        type: 'updateField',
        target: { kind: 'component', id: 'a' },
        field: 'group',
        value: 'g2',
      }),
    ).toContain('- { id: a, type: service, group: g2 }');
    expect(
      error(text, {
        type: 'updateField',
        target: { kind: 'group', id: 'g1' },
        field: 'parent',
        value: 'g2',
      }),
    ).toMatch(/vòng/);
    expect(
      error(text, {
        type: 'updateField',
        target: { kind: 'group', id: 'g1' },
        field: 'parent',
        value: 'g1',
      }),
    ).toMatch(/vòng/);
    expect(
      error(text, {
        type: 'updateField',
        target: { kind: 'group', id: 'g1' },
        field: 'name',
        value: '',
      }),
    ).toMatch(/bắt buộc/);
  });

  it('field id → đổi tên', () => {
    const result = ok(
      applyCommand(BLOCK, { type: 'updateField', target, field: 'id', value: 'edge' }),
    );
    expect(result.text).toContain('from: edge');
    expect(result.select).toEqual({ kind: 'component', id: 'edge' });
  });
});

describe('deleteComponent', () => {
  const text = yaml(`
groups:
  - id: core
    name: Core

components:
  - id: a
    type: service

  # B là database
  - id: b
    type: database
    group: core

  - id: c
    type: queue

relationships:
  - from: a
    to: b
  - from: a
    to: c
  - from: b
    to: c

views:
  - id: v
    name: V
    include: [a, b]
rules:
  - id: r
    type: forbidden
    from: { id: [b, c] }
`);

  it('xóa component cùng các quan hệ liên quan, báo tham chiếu còn sót', () => {
    const result = ok(applyCommand(text, { type: 'deleteComponent', id: 'b' }));
    // Comment ngay trên component (không cách dòng) bị xóa cùng nó.
    expect(result.text).toContain(
      '  - id: a\n    type: service\n\n  - id: c\n    type: queue\n\nrelationships:\n  - from: a\n    to: c\n\nviews:',
    );
    expect(result.removed).toEqual([
      { kind: 'relationship', id: 'a->b' },
      { kind: 'relationship', id: 'b->c' },
    ]);
    expect(result.references.map((r) => `${r.kind}:${r.id}:${r.value}:${r.line}`)).toEqual([
      'view:v:b:24',
      'rule:r:b:28',
    ]);
  });

  it('xóa phần tử cuối cùng → để lại []', () => {
    const one = yaml('components:\n  - id: a\n    type: service\nviews: []\n');
    const out = apply(one, { type: 'deleteComponent', id: 'a' });
    expect(out).toContain('components: []\nviews: []');
    expect(validate(out).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('flow', () => {
    const out = apply(FLOW, { type: 'deleteComponent', id: 'db' });
    expect(out).toContain('components:\n  - { id: api, type: gateway }\nrelationships: []\n');
    const inline = yaml(
      'components: [{ id: a, type: service }, { id: b, type: service }, { id: c, type: service }]\n',
    );
    expect(apply(inline, { type: 'deleteComponent', id: 'b' })).toContain(
      'components: [{ id: a, type: service }, { id: c, type: service }]',
    );
    expect(apply(inline, { type: 'deleteComponent', id: 'c' })).toContain(
      'components: [{ id: a, type: service }, { id: b, type: service }]',
    );
  });
});

describe('renameId', () => {
  const text = yaml(`
groups:
  - id: core
    name: Core
  - id: data
    name: Data
    parent: core
components:
  - id: api
    type: service
    group: core
  - id: db
    type: database
    group: data
relationships:
  - from: api # gọi
    to: db
views:
  - id: v
    name: V
    include: ['group:core', api, core]
    exclude: [db]
rules:
  - id: r
    type: forbidden
    severity: warning
    from: { id: api, group: [core] }
    to: { id: [db] }
`);

  it('đổi ID component và mọi tham chiếu', () => {
    const out = apply(text, { type: 'renameId', kind: 'component', from: 'api', to: 'api-v2' });
    expect(out).toContain('  - id: api-v2\n');
    expect(out).toContain('  - from: api-v2 # gọi\n');
    expect(out).toContain("include: ['group:core', api-v2, core]");
    expect(out).toContain('from: { id: api-v2, group: [core] }');
    expect(validate(out).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('đổi ID group: component, group con, selector, rule', () => {
    const out = apply(text, { type: 'renameId', kind: 'group', from: 'core', to: 'domain' });
    expect(out).toContain('  - id: domain\n    name: Core');
    expect(out).toContain('    parent: domain\n');
    expect(out).toContain('    group: domain\n');
    expect(out).toContain("include: ['group:domain', api, domain]");
    expect(out).toContain('from: { id: api, group: [domain] }');
    expect(validate(out).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('selector dạng chuỗi đơn', () => {
    expect(
      apply(text.replace('exclude: [db]', 'exclude: db'), {
        type: 'renameId',
        kind: 'component',
        from: 'db',
        to: 'store',
      }),
    ).toContain('exclude: store');
  });
});

describe('relationship', () => {
  it('thêm quan hệ → chọn quan hệ mới theo ID sinh tự động', () => {
    const result = ok(
      applyCommand(BLOCK, {
        type: 'addRelationship',
        relationship: { from: 'service', to: 'api', type: 'grpc', label: 'Callback' },
      }),
    );
    expect(result.text).toContain(
      '    type: http\n  - from: service\n    to: api\n    type: grpc\n    label: Callback\n',
    );
    expect(result.select).toEqual({ kind: 'relationship', id: 'service->api' });
  });

  it('quan hệ trùng from/to nhưng khác type → ID có hậu tố type', () => {
    const result = ok(
      applyCommand(BLOCK, {
        type: 'addRelationship',
        relationship: { from: 'api', to: 'service', type: 'grpc' },
      }),
    );
    expect(result.select).toEqual({ kind: 'relationship', id: 'api->service:grpc' });
  });

  it('đổi đầu nối, xóa', () => {
    const text = apply(BLOCK, { type: 'addComponent', component: { type: 'database', id: 'db' } });
    const moved = apply(text, { type: 'updateRelationship', id: 'api->service', to: 'db' });
    expect(moved).toContain('  - from: api\n    to: db\n    type: http\n');
    const removed = apply(moved, { type: 'deleteRelationship', id: 'api->db' });
    expect(removed).toContain('relationships: []\n');
  });

  it('không nối vào group', () => {
    const text = yaml('groups: [{ id: g, name: G }]\ncomponents: [{ id: a, type: service }]\n');
    expect(error(text, { type: 'addRelationship', relationship: { from: 'a', to: 'g' } })).toMatch(
      /là group/,
    );
  });
});

describe('group', () => {
  const text = yaml(`
groups:
  - id: core
    name: Core
  - id: data
    name: Data
    parent: core
  - id: deep
    name: Deep
    parent: data
components:
  - id: a
    type: service
    group: data
  - id: b
    type: service
    group: core
views:
  - id: v
    name: V
    include: ['group:data']
`);

  it('thêm group (có group cha)', () => {
    const result = ok(
      applyCommand(text, { type: 'addGroup', group: { name: 'Edge', parent: 'core' } }),
    );
    expect(result.text).toContain(
      '    parent: data\n  - id: group\n    name: Edge\n    parent: core\ncomponents:',
    );
    expect(result.select).toEqual({ kind: 'group', id: 'group' });
  });

  it('xóa group: phần tử con chuyển lên group cha, báo tham chiếu', () => {
    const result = ok(applyCommand(text, { type: 'deleteGroup', id: 'data' }));
    expect(result.text).toContain('  - id: deep\n    name: Deep\n    parent: core\n');
    expect(result.text).toContain('  - id: a\n    type: service\n    group: core\n');
    expect(result.references.map((r) => r.value)).toEqual(['group:data']);
  });

  it('xóa group gốc: bỏ field group/parent', () => {
    const out = apply(text, { type: 'deleteGroup', id: 'core' });
    expect(out).toContain('  - id: data\n    name: Data\n  - id: deep');
    expect(out).toContain('  - id: b\n    type: service\nviews:');
  });

  it('chưa có groups → tạo section', () => {
    const out = apply(BLOCK, { type: 'addGroup', group: { id: 'edge', name: 'Edge' } });
    expect(out).toContain('  name: Test\n\ngroups:\n  - id: edge\n    name: Edge\n\ncomponents:');
  });
});

describe('xuống dòng CRLF', () => {
  it('giữ CRLF cho dòng mới', () => {
    const text = BLOCK.replace(/\n/g, '\r\n');
    const out = apply(text, { type: 'addComponent', component: { type: 'cache' } });
    expect(out).toContain('  - id: cache\r\n    type: cache\r\n');
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

describe('elementRanges', () => {
  it('con trỏ trong block của component → component đó; trong quan hệ → quan hệ', async () => {
    const { elementRanges, elementAt } = await import('../src');
    const ranges = elementRanges(BLOCK);
    expect(elementAt(ranges, BLOCK.indexOf('technology: Kong'))).toMatchObject({
      kind: 'component',
      id: 'api',
    });
    expect(elementAt(ranges, BLOCK.indexOf('- id: service'))).toMatchObject({
      kind: 'component',
      id: 'service',
    });
    expect(elementAt(ranges, BLOCK.indexOf('type: http'))).toMatchObject({
      kind: 'relationship',
      id: 'api->service',
    });
    expect(elementAt(ranges, 0)).toBeUndefined();
    expect(elementRanges('a: [')).toEqual([]);
  });
});
