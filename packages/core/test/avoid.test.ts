import { beforeAll, describe, expect, it } from 'vitest';
import {
  edgeLabelContent,
  layoutView,
  loadRouter,
  MAX_AVOID_EDGES,
  resolveView,
  routeEdges,
  routeEdgesAvoid,
  routerReady,
  validate,
  type AvoidGroup,
  type Box,
  type Point,
  type RouteRequest,
} from '../src';
import { yaml } from './helpers';
import { realisticModel } from './perf-model';

/** Số đoạn connector đi xuyên qua node không phải đầu mút. */
function crossings(
  routes: Map<string, { points: Point[] }>,
  boxes: Map<string, Box>,
  edges: RouteRequest[],
): number {
  let n = 0;
  for (const edge of edges) {
    const points = routes.get(edge.id)?.points ?? [];
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
      const [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
      for (const [id, r] of boxes) {
        if (id === edge.from || id === edge.to) continue;
        if (x2 > r.x && x1 < r.x + r.width && y2 > r.y && y1 < r.y + r.height) n++;
      }
    }
  }
  return n;
}

const onBorder = (p: Point, b: Box) =>
  (p.x === b.x || p.x === b.x + b.width) !== (p.y === b.y || p.y === b.y + b.height) ||
  ((p.x === b.x || p.x === b.x + b.width) && p.y >= b.y && p.y <= b.y + b.height) ||
  ((p.y === b.y || p.y === b.y + b.height) && p.x >= b.x && p.x <= b.x + b.width);

// a và c nằm hai bên, b chắn ngay giữa: router cũ đi thẳng xuyên b.
const boxes = new Map<string, Box>([
  ['a', { x: 0, y: 0, width: 100, height: 60 }],
  ['b', { x: 200, y: 0, width: 100, height: 60 }],
  ['c', { x: 400, y: 0, width: 100, height: 60 }],
]);
const edges: RouteRequest[] = [{ id: 'a-c', from: 'a', to: 'c', label: { width: 40, height: 16 } }];

describe('routeEdgesAvoid (libavoid)', () => {
  it('WASM chưa nạp → kết quả giống hệt router cũ', () => {
    expect(routerReady()).toBe(false);
    expect(routeEdgesAvoid(boxes, edges)).toEqual(routeEdges(boxes, edges));
  });

  describe('sau khi nạp WASM', () => {
    beforeAll(async () => {
      expect(await loadRouter()).toBe(true);
    });

    it('nạp lại trả cùng kết quả, không nạp hai lần', async () => {
      expect(await loadRouter()).toBe(true);
      expect(routerReady()).toBe(true);
    });

    it('đi vòng qua node chắn giữa; router cũ thì đi xuyên', () => {
      expect(crossings(routeEdges(boxes, edges), boxes, edges)).toBe(1);
      const route = routeEdgesAvoid(boxes, edges).get('a-c')!;
      expect(crossings(new Map([['a-c', route]]), boxes, edges)).toBe(0);
      expect(route.points.length).toBeGreaterThan(2);
      expect(route.label).toBeDefined();
    });

    it('giữ khoảng hở 12px với node chắn (tham số routing được áp dụng thật)', () => {
      const { points } = routeEdgesAvoid(boxes, edges).get('a-c')!;
      const b = boxes.get('b')!;
      const around = points.filter((p) => p.x > b.x && p.x < b.x + b.width);
      for (const p of around) expect(p.y <= b.y - 12 || p.y >= b.y + b.height + 12).toBe(true);
      expect(points.some((p) => p.y === b.y - 12 || p.y === b.y + b.height + 12)).toBe(true);
    });

    it('hai đầu connector nằm trên cạnh node, không nằm ở tâm', () => {
      const { points } = routeEdgesAvoid(boxes, edges).get('a-c')!;
      expect(onBorder(points[0]!, boxes.get('a')!)).toBe(true);
      expect(onBorder(points[points.length - 1]!, boxes.get('c')!)).toBe(true);
    });

    it('mọi đoạn đều orthogonal', () => {
      const { points } = routeEdgesAvoid(boxes, edges).get('a-c')!;
      for (let i = 0; i + 1 < points.length; i++) {
        const [p, q] = [points[i]!, points[i + 1]!];
        expect(p.x === q.x || p.y === q.y).toBe(true);
      }
    });

    it('self-loop vẫn dùng router cũ; giữ thứ tự kết quả', () => {
      const mixed: RouteRequest[] = [{ id: 'loop', from: 'b', to: 'b' }, ...edges];
      const result = routeEdgesAvoid(boxes, mixed);
      expect([...result.keys()]).toEqual(['loop', 'a-c']);
      expect(result.get('loop')).toEqual(routeEdges(boxes, mixed).get('loop'));
    });

    it('điểm gấp người dùng đặt: route orthogonal đi qua đúng từng điểm', () => {
      const waypoints = [
        { x: 150, y: 200 },
        { x: 350, y: 160 },
      ];
      const { points } = routeEdgesAvoid(boxes, [
        { id: 'manual', from: 'a', to: 'c', waypoints },
      ]).get('manual')!;
      const passes = (w: Point) =>
        points.some((p, i) => {
          const q = points[i + 1];
          if (!q) return p.x === w.x && p.y === w.y;
          return (
            (p.x === q.x &&
              p.x === w.x &&
              w.y >= Math.min(p.y, q.y) &&
              w.y <= Math.max(p.y, q.y)) ||
            (p.y === q.y && p.y === w.y && w.x >= Math.min(p.x, q.x) && w.x <= Math.max(p.x, q.x))
          );
        });
      for (const w of waypoints) expect(passes(w)).toBe(true);
      for (let i = 0; i + 1 < points.length; i++) {
        expect(points[i]!.x === points[i + 1]!.x || points[i]!.y === points[i + 1]!.y).toBe(true);
      }
    });

    describe('group', () => {
      // Group g (chứa x, y) chắn giữa a và c.
      const gBoxes = new Map<string, Box>([
        ['a', { x: 0, y: 100, width: 100, height: 60 }],
        ['x', { x: 220, y: 60, width: 100, height: 60 }],
        ['y', { x: 220, y: 160, width: 100, height: 60 }],
        ['c', { x: 460, y: 100, width: 100, height: 60 }],
      ]);
      const g: AvoidGroup = { id: 'g', box: { x: 200, y: 20, width: 140, height: 220 } };
      const options = {
        groups: [g],
        nodeGroup: new Map([
          ['x', 'g'],
          ['y', 'g'],
        ]),
      };
      const enters = (points: Point[], box: Box) =>
        points.some((p, i) => {
          const q = points[i + 1];
          if (!q) return false;
          const [x1, x2] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
          const [y1, y2] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
          return x2 > box.x && x1 < box.x + box.width && y2 > box.y && y1 < box.y + box.height;
        });

      it('connector giữa hai node ngoài group đi vòng qua khung group', () => {
        const req: RouteRequest[] = [{ id: 'a-c', from: 'a', to: 'c' }];
        expect(enters(routeEdgesAvoid(gBoxes, req).get('a-c')!.points, g.box)).toBe(true);
        expect(enters(routeEdgesAvoid(gBoxes, req, options).get('a-c')!.points, g.box)).toBe(false);
      });

      it('connector nối vào node trong group được đi vào group, vẫn tránh node khác', () => {
        const req: RouteRequest[] = [
          { id: 'a-y', from: 'a', to: 'y' },
          { id: 'a-c', from: 'a', to: 'c' },
        ];
        const result = routeEdgesAvoid(gBoxes, req, options);
        const ay = result.get('a-y')!.points;
        expect(enters(ay, g.box)).toBe(true);
        expect(enters(ay, gBoxes.get('x')!)).toBe(false);
        expect(enters(result.get('a-c')!.points, g.box)).toBe(false);
        expect(routeEdgesAvoid(gBoxes, req, options)).toEqual(result);
      });
    });

    it('model 30 node / 48 connector: 0 đoạn xuyên node, deterministic', async () => {
      const { model } = validate(realisticModel(30, 48));
      const view = resolveView(model!, model!.views[0]!);
      const layout = await layoutView(view);
      const nodeBoxes = new Map<string, Box>(
        layout.nodes.map((n) => [
          n.component.id,
          { x: n.x, y: n.y, width: n.width, height: n.height },
        ]),
      );
      const requests: RouteRequest[] = view.relationships.map((r, i) => ({
        id: `e${i}`,
        from: r.from,
        to: r.to,
        label: edgeLabelContent(r),
      }));
      const first = routeEdgesAvoid(nodeBoxes, requests);
      expect(crossings(routeEdges(nodeBoxes, requests), nodeBoxes, requests)).toBeGreaterThan(0);
      expect(crossings(first, nodeBoxes, requests)).toBe(0);
      expect(routeEdgesAvoid(nodeBoxes, requests)).toEqual(first);
    });
  });

  describe('layout thủ công dùng libavoid (S6-ROUTE-07)', () => {
    // a, b, c thẳng hàng; b nằm giữa đường a → c. x nằm trong group g, a → c không được đi qua g.
    const { model } = validate(
      yaml(`groups:
  - { id: g, name: G }
components:
  - { id: a, type: service, name: A }
  - { id: b, type: service, name: B }
  - { id: c, type: service, name: C }
  - { id: x, type: service, name: X, group: g }
relationships:
  - { from: a, to: c }
  - { from: b, to: x }
`),
    );
    const view = resolveView(model!, model!.views[0]!);
    const positions = {
      a: { x: 0, y: 0 },
      b: { x: 400, y: 0 },
      c: { x: 800, y: 0 },
      x: { x: 400, y: 300 },
    };
    const toMap = (layout: Awaited<ReturnType<typeof layoutView>>) => ({
      boxes: new Map<string, Box>(layout.nodes.map((n) => [n.component.id, n])),
      routes: new Map(layout.edges.map((e, i) => [`e${i}`, { points: e.points }])),
      requests: layout.edges.map((e, i) => ({
        id: `e${i}`,
        from: e.relationship.from,
        to: e.relationship.to,
      })),
    });

    it('connector tránh node; avoidNodes: false → router cũ đi xuyên', async () => {
      const avoided = toMap(await layoutView(view, { positions }));
      expect(crossings(avoided.routes, avoided.boxes, avoided.requests)).toBe(0);
      const old = toMap(await layoutView(view, { positions, avoidNodes: false }));
      expect(crossings(old.routes, old.boxes, old.requests)).toBeGreaterThan(0);
    });

    it('connector không đi xuyên group không chứa đầu mút', async () => {
      const layout = await layoutView(view, { positions });
      const g = layout.groups.find((gr) => gr.group.id === 'g')!;
      const ac = layout.edges.find((e) => e.relationship.from === 'a')!.points;
      for (let i = 0; i + 1 < ac.length; i++) {
        const [p, q] = [ac[i]!, ac[i + 1]!];
        const inside =
          Math.max(p.x, q.x) > g.x &&
          Math.min(p.x, q.x) < g.x + g.width &&
          Math.max(p.y, q.y) > g.y &&
          Math.min(p.y, q.y) < g.y + g.height;
        expect(inside).toBe(false);
      }
    });
  });

  it(`nhóm hơn ${MAX_AVOID_EDGES} connector → router cũ (ngưỡng R-ROUTE-PERF)`, async () => {
    await loadRouter();
    const many: RouteRequest[] = Array.from({ length: MAX_AVOID_EDGES + 1 }, (_, i) => ({
      id: `m${i}`,
      from: 'a',
      to: 'c',
    }));
    expect(routeEdgesAvoid(boxes, many)).toEqual(routeEdges(boxes, many));
    const few = many.slice(0, 2);
    expect(routeEdgesAvoid(boxes, few)).not.toEqual(routeEdges(boxes, few));
  });
});
