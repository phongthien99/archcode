import { describe, expect, it } from 'vitest';
import {
  checkLayout,
  GROUP_PADDING,
  generateHtml,
  layoutView,
  parseLayout,
  pruneLayout,
  renameInLayout,
  renderSvg,
  resolveView,
  routeEdges,
  serializeLayout,
  validate,
  type Box,
  type Layout,
} from '../src';
import { fixture } from './helpers';

const FIXTURE = fixture('document-platform.yaml');
const model = validate(FIXTURE).model!;
const overview = resolveView(model, model.views[0]!);

function overlap(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function expectNoOverlap(layout: Layout) {
  for (const [i, a] of layout.nodes.entries()) {
    for (const b of layout.nodes.slice(i + 1)) {
      expect(overlap(a, b), `${a.component.id} chồng ${b.component.id}`).toBe(false);
    }
  }
}

describe('layout thủ công (S5-LAYOUT-02)', () => {
  it('không có node nào được ghim → auto-layout ELK như cũ', async () => {
    const auto = await layoutView(overview);
    const same = await layoutView(overview, { positions: { 'not-in-view': { x: 1, y: 1 } } });
    expect(same).toEqual(auto);
    expect(auto.x).toBe(0);
  });

  it('node ghim giữ nguyên vị trí; node mới được đặt quanh, không chồng nhau', async () => {
    const auto = await layoutView(overview);
    const positions = Object.fromEntries(
      auto.nodes.map((n) => [n.component.id, { x: n.x, y: n.y }]),
    );
    delete positions['search-service'];
    delete positions['document-events'];
    positions['web-app'] = { x: -500, y: -300 };
    const layout = await layoutView(overview, { positions });
    for (const [id, p] of Object.entries(positions)) {
      const node = layout.nodes.find((n) => n.component.id === id)!;
      expect({ x: node.x, y: node.y }).toEqual(p);
    }
    expect(layout.nodes).toHaveLength(9);
    expectNoOverlap(layout);
    // Vùng vẽ bao cả node ở tọa độ âm.
    expect(layout.x).toBeLessThan(-500);
    expect(layout.edges).toHaveLength(overview.relationships.length);
  });

  it('chỉ ghim một node: các node còn lại xếp quanh, không chồng nhau, deterministic', async () => {
    const positions = { 'api-gateway': { x: 0, y: 0 } };
    const a = await layoutView(overview, { positions });
    const b = await layoutView(overview, { positions });
    expect(a).toEqual(b);
    expectNoOverlap(a);
  });

  it('node mới cùng group được đặt cạnh thành viên khác của group, không lọt vào group khác', async () => {
    const text = FIXTURE.replace(
      '  - id: identity-provider',
      '  - id: audit-service\n    type: service\n    group: core\n\n  - id: identity-provider',
    );
    const m = validate(text).model!;
    const view = resolveView(m, m.views[0]!);
    const auto = await layoutView(resolveView(model, model.views[0]!));
    const positions = Object.fromEntries(
      auto.nodes.map((n) => [n.component.id, { x: n.x, y: n.y }]),
    );
    const layout = await layoutView(view, { positions });
    expectNoOverlap(layout);
    const core = layout.groups.find((g) => g.group.id === 'core')!;
    const node = layout.nodes.find((n) => n.component.id === 'audit-service')!;
    expect(node.x >= core.x && node.x + node.width <= core.x + core.width).toBe(true);
    const data = layout.groups.find((g) => g.group.id === 'data')!;
    expect(overlap(node, data)).toBe(false);
  });

  it('group bao quanh component con và group con', async () => {
    const auto = await layoutView(overview);
    const positions = Object.fromEntries(
      auto.nodes.map((n) => [n.component.id, { x: n.x, y: n.y }]),
    );
    const layout = await layoutView(overview, { positions });
    const core = layout.groups.find((g) => g.group.id === 'core')!;
    const data = layout.groups.find((g) => g.group.id === 'data')!;
    expect(data.depth).toBe(1);
    expect(data.x).toBeGreaterThan(core.x);
    expect(data.y + data.height).toBeLessThan(core.y + core.height);
    const storage = layout.nodes.find((n) => n.component.id === 'object-storage')!;
    expect(storage.x - data.x).toBe(GROUP_PADDING.side);
    expect(storage.y - data.y).toBe(GROUP_PADDING.top);
  });

  it('connector nối vào group: đầu mút nằm trên khung group', async () => {
    const m = validate(`version: 1
system: { id: t, name: T }
groups: [{ id: g, name: G }, { id: h, name: H }]
components:
  - { id: a, type: service, group: g }
  - { id: b, type: service, group: h }
relationships: [{ from: g, to: h }, { from: a, to: h }]
`).model!;
    const view = resolveView(m, m.views[0]!);
    expect(view.relationships.map((r) => r.id)).toEqual(['g->h', 'a->h']);

    for (const positions of [undefined, { a: { x: 0, y: 0 }, b: { x: 0, y: 300 } }]) {
      const layout = await layoutView(view, { positions, avoidNodes: false });
      const h = layout.groups.find((x) => x.group.id === 'h')!;
      for (const edge of layout.edges) {
        const end = edge.points.at(-1)!;
        expect(end.y, edge.relationship.id).toBeCloseTo(h.y, 0);
      }
    }
  });

  it('SVG dùng viewBox theo vùng vẽ', async () => {
    const layout = await layoutView(overview, {
      positions: { 'api-gateway': { x: -100, y: -50 } },
    });
    const svg = renderSvg(layout);
    expect(svg).toContain(`viewBox="${layout.x - 8} ${layout.y - 8} `);
  });
});

describe('router orthogonal (S5-LAYOUT-04)', () => {
  const boxes = new Map<string, Box>([
    ['a', { x: 0, y: 0, width: 100, height: 60 }],
    ['b', { x: 300, y: 100, width: 100, height: 60 }],
    ['c', { x: 0, y: 300, width: 100, height: 60 }],
  ]);

  it('nối cạnh phải → cạnh trái bằng 3 đoạn vuông góc; nhãn ở giữa đường', () => {
    const routes = routeEdges(boxes, [
      { id: 'e', from: 'a', to: 'b', label: { width: 40, height: 20 } },
    ]);
    const { points, label } = routes.get('e')!;
    expect(points).toEqual([
      { x: 100, y: 30 },
      { x: 200, y: 30 },
      { x: 200, y: 130 },
      { x: 300, y: 130 },
    ]);
    expect(label).toEqual({ x: 180, y: 70 });
  });

  it('theo chiều dọc khi hai node cách nhau theo trục y', () => {
    const { points } = routeEdges(boxes, [{ id: 'e', from: 'a', to: 'c' }]).get('e')!;
    expect(points).toEqual([
      { x: 50, y: 60 },
      { x: 50, y: 300 },
    ]);
  });

  it('nhiều connector trên cùng cạnh được trải đều', () => {
    const routes = routeEdges(boxes, [
      { id: '1', from: 'b', to: 'a' },
      { id: '2', from: 'b', to: 'c' },
    ]);
    const starts = ['1', '2'].map((id) => routes.get(id)!.points[0]!);
    expect(starts[0]).not.toEqual(starts[1]);
  });

  it('điểm gấp do người dùng khai báo', () => {
    const { points } = routeEdges(boxes, [
      { id: 'e', from: 'a', to: 'b', waypoints: [{ x: 150, y: -50 }] },
    ]).get('e')!;
    expect(points[1]).toEqual({ x: 150, y: -50 });
    expect(points).toHaveLength(3);
  });

  it('quan hệ tự trỏ', () => {
    expect(routeEdges(boxes, [{ id: 'e', from: 'a', to: 'a' }]).get('e')!.points).toHaveLength(5);
  });
});

describe('file layout (S5-LAYOUT-01)', () => {
  const TEXT = `version: 1
views:
  overview:
    nodes:
      api-gateway: { x: 320, y: 120 }
      document-service: { x: 320.4, y: 300 }
      ghost: { x: 0, y: 0 }
    edges:
      api-gateway->document-service: { points: [[400, 200], [400, 260]] }
  missing-view:
    nodes:
      web-app: { x: 1, y: 2 }
`;

  it('đọc đúng định dạng §4.3', () => {
    const { layout, diagnostics } = parseLayout(TEXT);
    expect(diagnostics).toEqual([]);
    expect(layout.views.overview!.nodes['api-gateway']).toEqual({ x: 320, y: 120 });
    expect(layout.views.overview!.edges['api-gateway->document-service']).toEqual([
      { x: 400, y: 200 },
      { x: 400, y: 260 },
    ]);
  });

  it('ID không tồn tại → cảnh báo', () => {
    const { layout } = parseLayout(TEXT);
    const messages = checkLayout(layout, model, 'a.layout.yaml').map(
      (d) => `${d.severity}:${d.code}:${d.message}`,
    );
    expect(messages).toEqual([
      'warning:layout-unknown-id:File layout (view "overview"): component "ghost" không có trong view',
      'warning:layout-unknown-id:File layout có view "missing-view" nhưng kiến trúc không có view này',
    ]);
  });

  it('sai định dạng → cảnh báo kèm dòng, bỏ entry lỗi', () => {
    const { layout, diagnostics } = parseLayout(
      'version: 2\nviews:\n  v:\n    nodes:\n      a: { x: 1 }\n      b: { x: 1, y: 2 }\n    edges:\n      e: { points: [1, 2] }\n',
      'x.layout.yaml',
    );
    expect(diagnostics.map((d) => `${d.line}:${d.code}:${d.file}`)).toEqual([
      '1:layout-invalid:x.layout.yaml',
      '5:layout-invalid:x.layout.yaml',
      '8:layout-invalid:x.layout.yaml',
    ]);
    expect(layout.views.v!.nodes).toEqual({ b: { x: 1, y: 2 } });
    expect(parseLayout('views: [').diagnostics[0]!.message).toMatch(/sai cú pháp/);
    expect(parseLayout('').diagnostics).toEqual([]);
  });

  it('ghi dạng chuẩn: key sắp xếp, số nguyên; đọc lại ra cùng dữ liệu', () => {
    const { layout } = parseLayout(TEXT);
    const text = serializeLayout(layout);
    expect(text).toBe(`version: 1
views:
  missing-view:
    nodes:
      web-app: { x: 1, y: 2 }
  overview:
    nodes:
      api-gateway: { x: 320, y: 120 }
      document-service: { x: 320, y: 300 }
      ghost: { x: 0, y: 0 }
    edges:
      api-gateway->document-service: { points: [[400, 200], [400, 260]] }
`);
    expect(serializeLayout(parseLayout(text).layout)).toBe(text);
  });

  it('dọn entry của phần tử đã xóa; đổi ID (cả ID quan hệ sinh tự động)', () => {
    const { layout } = parseLayout(TEXT);
    const pruned = pruneLayout(layout, model);
    expect(Object.keys(pruned.views)).toEqual(['overview']);
    expect(Object.keys(pruned.views.overview!.nodes)).toEqual(['api-gateway', 'document-service']);
    const renamed = renameInLayout(pruned, 'api-gateway', 'edge');
    expect(Object.keys(renamed.views.overview!.nodes)).toEqual(['edge', 'document-service']);
    expect(Object.keys(renamed.views.overview!.edges)).toEqual(['edge->document-service']);
    expect(
      Object.keys(renameInLayout(layout, 'document-service', 'docs').views.overview!.edges),
    ).toEqual(['api-gateway->docs']);
  });
});

describe('generateHtml với layout (S5-LAYOUT-05)', () => {
  it('dùng vị trí trong file layout, nhúng layout để mở lại', async () => {
    const layout =
      'version: 1\nviews:\n  overview:\n    nodes:\n      api-gateway: { x: -400, y: -400 }\n';
    const { html, layoutDiagnostics } = await generateHtml(FIXTURE, {
      layout,
      layoutName: 'a.layout.yaml',
    });
    expect(layoutDiagnostics).toEqual([]);
    expect(html).toMatch(/viewBox="-\d+ -\d+ /);
    const { extractEmbeddedSource } = await import('../src');
    expect(extractEmbeddedSource(html)!.layout).toEqual({ text: layout, name: 'a.layout.yaml' });
    // Không có layout → HTML như cũ (không nhúng trường layout).
    expect(extractEmbeddedSource((await generateHtml(FIXTURE)).html)!.layout).toBeUndefined();
  });

  it('cảnh báo của file layout hiện trong phần kiểm tra', async () => {
    const { html, layoutDiagnostics } = await generateHtml(FIXTURE, {
      layout: 'version: 1\nviews:\n  overview:\n    nodes:\n      ghost: { x: 0, y: 0 }\n',
      layoutName: 'a.layout.yaml',
    });
    expect(layoutDiagnostics).toHaveLength(1);
    expect(html).toContain('component &quot;ghost&quot; không có trong view');
    expect(html).toContain('<code>a.layout.yaml</code>');
  });
});
