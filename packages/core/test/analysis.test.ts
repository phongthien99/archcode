import { describe, expect, it } from 'vitest';
import { buildGraph, dependsOn, findCycles, usedBy, validate } from '../src';
import { fixture, summarize, yaml } from './helpers';

describe('dependency graph', () => {
  const { model } = validate(fixture('document-platform.yaml'));
  const graph = buildGraph(model!);

  it('dependsOn / usedBy theo thứ tự khai báo, không trùng lặp', () => {
    expect(dependsOn(graph, 'api-gateway').map((c) => c.id)).toEqual([
      'identity-provider',
      'document-service',
      'search-service',
    ]);
    expect(usedBy(graph, 'search-service').map((c) => c.id)).toEqual([
      'api-gateway',
      'document-events',
    ]);
  });

  it('bỏ qua quan hệ có đầu không tồn tại', () => {
    const broken = validate(fixture('invalid/broken-ref.yaml')).model!;
    expect(buildGraph(broken).outgoing.get('document-service')).toEqual([]);
  });
});

describe('findCycles', () => {
  const cycles = (body: string) =>
    findCycles(buildGraph(validate(yaml(body)).model!)).map((c) => ({
      path: [...c.cycle.map((r) => r.from), c.cycle[0]!.from].join('>'),
      size: c.size,
    }));
  const comps = (ids: string) =>
    `components:\n${ids
      .split(' ')
      .map((id) => `  - { id: ${id}, type: service }`)
      .join('\n')}\n`;
  const rels = (pairs: string) =>
    `relationships:\n${pairs
      .split(' ')
      .map((p) => {
        const [from, to] = p.split('>');
        return `  - { from: ${from}, to: ${to} }`;
      })
      .join('\n')}\n`;

  it('không có vòng', () => {
    expect(cycles(comps('a b c') + rels('a>b b>c a>c'))).toEqual([]);
  });

  it('một vòng, bắt đầu từ component khai báo sớm nhất', () => {
    expect(cycles(comps('a b c') + rels('b>c c>a a>b'))).toEqual([{ path: 'a>b>c>a', size: 3 }]);
  });

  it('nhiều vòng độc lập', () => {
    expect(cycles(comps('a b c d') + rels('a>b b>a c>d d>c'))).toEqual([
      { path: 'a>b>a', size: 2 },
      { path: 'c>d>c', size: 2 },
    ]);
  });

  it('chọn vòng ngắn nhất trong nhóm liên thông lớn hơn', () => {
    expect(cycles(comps('a b c d') + rels('a>b b>c c>d d>a b>a'))).toEqual([
      { path: 'a>b>a', size: 4 },
    ]);
  });

  it('self-loop không tính là vòng phụ thuộc', () => {
    expect(cycles(comps('a') + rels('a>a'))).toEqual([]);
  });

  it('không tràn stack với chuỗi dài', () => {
    const ids = Array.from({ length: 3000 }, (_, i) => `n${i}`);
    const body =
      comps(ids.join(' ')) +
      rels(ids.map((id, i) => `${id}>${ids[(i + 1) % ids.length]}`).join(' '));
    expect(cycles(body)).toHaveLength(1);
  });
});

describe('rules', () => {
  const { diagnostics } = validate(fixture('invalid/rule-violations.yaml'));

  it('phát hiện orphan, vòng phụ thuộc và quan hệ bị cấm', () => {
    expect(summarize(diagnostics)).toEqual([
      '32:orphan-component',
      '41:circular-dependency',
      '51:forbidden-dependency',
      '55:forbidden-dependency',
    ]);
  });

  it('severity và rule id lấy từ khai báo rule', () => {
    expect(diagnostics.map((d) => [d.rule, d.severity])).toEqual([
      ['no-orphans', 'warning'],
      ['no-cycles', 'error'],
      ['no-cross-domain-db', 'error'],
      ['no-cross-domain-db', 'error'],
    ]);
  });

  it('person không bị coi là orphan', () => {
    expect(diagnostics.some((d) => d.message.includes('customer'))).toBe(false);
  });

  it('same-group so sánh chính xác: group con không tính là cùng group', () => {
    // billing-service (billing) → invoice-db (billing-data, con của billing) vẫn vi phạm.
    expect(diagnostics[3]!.message).toContain('billing-service → invoice-db');
  });

  it('gắn target để renderer tô viền', () => {
    expect(diagnostics.map((d) => d.target)).toEqual([
      { kind: 'component', id: 'legacy-report' },
      { kind: 'relationship', id: 'order-service->billing-service' },
      { kind: 'relationship', id: 'order-service->billing-db' },
      { kind: 'relationship', id: 'billing-service->invoice-db' },
    ]);
  });

  it('rule mặc định là warning khi YAML không khai báo rules', () => {
    const { diagnostics: d } = validate(yaml('components: [{ id: a, type: service }]\n'));
    expect(d).toMatchObject([{ code: 'orphan-component', severity: 'warning' }]);
  });

  it('matcher group khớp cả group con; matcher kết hợp AND giữa các trường', () => {
    const body = `groups:
  - { id: billing, name: B }
  - { id: billing-data, name: BD, parent: billing }
components:
  - { id: report, type: service }
  - { id: invoice-db, type: database, group: billing-data }
  - { id: cache, type: cache, group: billing-data }
relationships:
  - { from: report, to: invoice-db }
  - { from: report, to: cache }
rules:
  - { id: r, type: forbidden, to: { group: billing, type: database } }
`;
    expect(validate(yaml(body)).diagnostics.map((d) => d.target?.id)).toEqual([
      'report->invoice-db',
    ]);
  });

  it('target của lỗi schema được suy ra từ đường dẫn YAML', () => {
    const { diagnostics: d } = validate(fixture('invalid/wrong-type.yaml'));
    expect(d.find((x) => x.code === 'schema-unknown-field')!.target).toEqual({
      kind: 'component',
      id: 'api',
    });
  });
});
