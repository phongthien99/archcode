import { describe, expect, it } from 'vitest';
import { layoutView, resolveView, validate, type Layout } from '../src';
import { fixture, yaml } from './helpers';

const { model } = validate(fixture('document-platform.yaml'));
const layoutOf = (viewId: string, direction?: 'TB' | 'LR') =>
  layoutView(
    resolveView(
      model!,
      model!.views.find((v) => v.id === viewId)!,
    ),
    { direction },
  );

const inside = (
  inner: { x: number; y: number; width: number; height: number },
  outer: typeof inner,
) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

describe('layoutView', () => {
  it('đủ node, edge, group của view', async () => {
    const layout = await layoutOf('overview');
    expect(layout.nodes).toHaveLength(9);
    expect(layout.edges).toHaveLength(9);
    expect(layout.groups.map((g) => [g.group.id, g.depth])).toEqual([
      ['core', 0],
      ['data', 1],
    ]);
  });

  it('component nằm trong group của nó; group con nằm trong group cha', async () => {
    const layout = await layoutOf('overview');
    const group = (id: string) => layout.groups.find((g) => g.group.id === id)!;
    const node = (id: string) => layout.nodes.find((n) => n.component.id === id)!;
    expect(inside(node('document-service'), group('core'))).toBe(true);
    expect(inside(node('object-storage'), group('data'))).toBe(true);
    expect(inside(group('data'), group('core'))).toBe(true);
    expect(inside(node('api-gateway'), group('core'))).toBe(false);
  });

  it('node không chồng lên nhau', async () => {
    const { nodes } = await layoutOf('overview');
    for (const a of nodes) {
      for (const b of nodes) {
        if (a === b) continue;
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap, `${a.component.id} chồng ${b.component.id}`).toBe(false);
      }
    }
  });

  it('edge bắt đầu và kết thúc ở mép node (tọa độ tuyệt đối, kể cả edge trong group)', async () => {
    const layout = await layoutOf('overview');
    const node = (id: string) => layout.nodes.find((n) => n.component.id === id)!;
    const near = (p: { x: number; y: number }, n: ReturnType<typeof node>) =>
      p.x >= n.x - 1 && p.x <= n.x + n.width + 1 && p.y >= n.y - 1 && p.y <= n.y + n.height + 1;
    for (const edge of layout.edges) {
      const first = edge.points[0]!;
      const last = edge.points[edge.points.length - 1]!;
      expect(near(first, node(edge.relationship.from)), `đầu ${edge.relationship.id}`).toBe(true);
      expect(near(last, node(edge.relationship.to)), `cuối ${edge.relationship.id}`).toBe(true);
    }
  });

  it('deterministic: chạy nhiều lần ra cùng tọa độ', async () => {
    const runs: Layout[] = [];
    for (let i = 0; i < 5; i++) runs.push(await layoutOf('overview'));
    for (const run of runs.slice(1)) expect(run).toEqual(runs[0]);
  });

  it('direction LR trải ngang, TB trải dọc', async () => {
    const lr = await layoutOf('overview', 'LR');
    const tb = await layoutOf('overview', 'TB');
    expect(lr.width / lr.height).toBeGreaterThan(tb.width / tb.height);
    expect(lr.direction).toBe('LR');
  });

  it('node là card 220–260px: tên dài xuống dòng, cao hơn chứ không nở ngang', async () => {
    const m = validate(
      yaml(`components:
  - { id: a, type: service, name: A }
  - { id: b, type: service, name: Một tên component rất rất dài để kiểm tra việc xuống dòng tự động }
`),
    ).model!;
    const { nodes } = await layoutView(resolveView(m, m.views[0]!));
    const [a, b] = nodes;
    expect(a!.width).toBe(220);
    expect(a!.height).toBeGreaterThanOrEqual(64);
    expect(b!.width).toBeGreaterThan(220);
    expect(b!.width).toBeLessThanOrEqual(260);
    expect(b!.height).toBeGreaterThan(a!.height);
  });

  it('không crash khi model có ID trùng', async () => {
    const m = validate(fixture('invalid/duplicate-id.yaml')).model!;
    const layout = await layoutView(resolveView(m, m.views[0]!));
    expect(layout.nodes.map((n) => n.component.id)).toEqual(['api', 'db']);
  });
});
