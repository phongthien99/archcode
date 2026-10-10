import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import {
  edgeLabelContent,
  nodeContent,
  type EdgeLabelContent,
  type NodeContent,
} from '../render/nodeContent';
import type { Component, Group, LayoutDirection, Relationship } from '../types';
import type { ResolvedView } from '../views/resolve';
import { manualLayout } from './manual';
import type { Point } from './route';

export type { Point };

export interface NodeBox {
  component: Component;
  content: NodeContent;
  /** Tọa độ tuyệt đối của góc trên trái. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GroupBox {
  group: Group;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0 = group ngoài cùng. */
  depth: number;
}

export interface EdgeRoute {
  relationship: Relationship;
  points: Point[];
  label?: EdgeLabelContent & Point;
}

export interface Layout {
  /** Góc trên trái của vùng vẽ (0 với auto-layout; layout thủ công có thể âm). */
  x: number;
  y: number;
  width: number;
  height: number;
  direction: LayoutDirection;
  nodes: NodeBox[];
  groups: GroupBox[];
  edges: EdgeRoute[];
}

export interface LayoutOptions {
  direction?: LayoutDirection;
  /**
   * Vị trí đã ghim (góc trên trái) theo ID component, lấy từ file layout.
   * Có ít nhất một node của view được ghim → layout thủ công: node ghim giữ nguyên chỗ,
   * node mới được đặt quanh, connector định tuyến orthogonal. Không có → auto-layout ELK.
   */
  positions?: Record<string, Point>;
  /** Điểm gấp của connector theo ID quan hệ (chỉ dùng với layout thủ công). */
  waypoints?: Record<string, Point[]>;
}

/** View từ ngưỡng này trở lên dùng thoroughness thấp để giữ thời gian layout ~1s (xem docs/spikes/elk.md). */
const LARGE_VIEW = 100;

let elk: InstanceType<typeof ELK> | undefined;

/** Auto-layout một view bằng ELK layered. Deterministic: cùng input → cùng tọa độ. */
export async function layoutView(view: ResolvedView, options: LayoutOptions = {}): Promise<Layout> {
  const direction = options.direction ?? view.view.direction;
  const positions = options.positions;
  if (positions && view.components.some((c) => Object.hasOwn(positions, c.id))) {
    return manualLayout({ view, direction, positions, waypoints: options.waypoints });
  }
  elk ??= new ELK();

  // Tiền tố tránh trùng ID giữa group và component (trùng ID là lỗi, nhưng layout không được crash).
  const gid = (id: string) => `g:${id}`;
  const cid = (id: string) => `c:${id}`;

  const components = uniqueById(view.components);
  const groupIds = new Set(view.groups.map((g) => g.id));
  const contents = new Map(components.map((c) => [c.id, nodeContent(c)]));

  const elkNodes = new Map<string, ElkNode>();
  const root: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction === 'LR' ? 'RIGHT' : 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.thoroughness': components.length >= LARGE_VIEW ? '1' : '7',
      'elk.edgeLabels.placement': 'CENTER',
      'elk.spacing.nodeNode': '40',
      'elk.spacing.edgeNode': '20',
      'elk.spacing.edgeEdge': '12',
      'elk.spacing.edgeLabel': '4',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
    children: [],
    edges: [],
  };

  for (const group of uniqueById(view.groups)) {
    elkNodes.set(gid(group.id), {
      id: gid(group.id),
      layoutOptions: { 'elk.padding': '[top=40,left=20,bottom=20,right=20]' },
      children: [],
    });
  }
  // Gắn group vào group cha (nếu cha nằm trong view), theo thứ tự khai báo.
  for (const group of uniqueById(view.groups)) {
    const parent =
      group.parent && groupIds.has(group.parent) ? elkNodes.get(gid(group.parent))! : root;
    parent.children!.push(elkNodes.get(gid(group.id))!);
  }
  for (const component of components) {
    const content = contents.get(component.id)!;
    const node: ElkNode = { id: cid(component.id), width: content.width, height: content.height };
    const parent =
      component.group && groupIds.has(component.group) ? elkNodes.get(gid(component.group))! : root;
    parent.children!.push(node);
  }

  const relById = new Map<string, Relationship>();
  const labels = new Map<string, EdgeLabelContent>();
  view.relationships.forEach((rel, i) => {
    const id = `e:${i}`;
    relById.set(id, rel);
    const label = edgeLabelContent(rel);
    const edge: ElkExtendedEdge = { id, sources: [cid(rel.from)], targets: [cid(rel.to)] };
    if (label) {
      labels.set(id, label);
      edge.labels = [
        {
          id: `${id}:label`,
          text: label.lines.join('\n'),
          width: label.width,
          height: label.height,
        },
      ];
    }
    root.edges!.push(edge);
  });

  const result = await elk.layout(root);

  // Tọa độ ELK tương đối với node cha → chuyển sang tuyệt đối.
  const offset = new Map<string, Point>([['root', { x: 0, y: 0 }]]);
  const nodes: NodeBox[] = [];
  const groups: GroupBox[] = [];
  const componentById = new Map(components.map((c) => [c.id, c]));
  const groupById = new Map(view.groups.map((g) => [g.id, g]));

  const walk = (node: ElkNode, origin: Point, depth: number) => {
    for (const child of node.children ?? []) {
      const x = origin.x + (child.x ?? 0);
      const y = origin.y + (child.y ?? 0);
      offset.set(child.id, { x, y });
      const box = {
        x: round(x),
        y: round(y),
        width: round(child.width ?? 0),
        height: round(child.height ?? 0),
      };
      if (child.id.startsWith('g:')) {
        groups.push({ group: groupById.get(child.id.slice(2))!, depth, ...box });
        walk(child, { x, y }, depth + 1);
      } else {
        const component = componentById.get(child.id.slice(2))!;
        nodes.push({ component, content: contents.get(component.id)!, ...box });
      }
    }
  };
  walk(result, { x: 0, y: 0 }, 0);

  const edges: EdgeRoute[] = [];
  for (const edge of (result.edges ?? []) as (ElkExtendedEdge & { container?: string })[]) {
    // Tọa độ edge và label tương đối với `container` (group cha chung gần nhất) — xem spike.
    const base = offset.get(edge.container ?? 'root') ?? { x: 0, y: 0 };
    const points: Point[] = [];
    for (const section of edge.sections ?? []) {
      for (const p of [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]) {
        points.push({ x: round(base.x + p.x), y: round(base.y + p.y) });
      }
    }
    const route: EdgeRoute = { relationship: relById.get(edge.id)!, points };
    const label = labels.get(edge.id);
    const elkLabel = edge.labels?.[0];
    if (label && elkLabel) {
      route.label = {
        ...label,
        x: round(base.x + (elkLabel.x ?? 0)),
        y: round(base.y + (elkLabel.y ?? 0)),
      };
    }
    edges.push(route);
  }

  return {
    x: 0,
    y: 0,
    width: round(result.width ?? 0),
    height: round(result.height ?? 0),
    direction,
    nodes,
    groups,
    edges,
  };
}

/** Giữ phần tử đầu tiên với mỗi ID. */
function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id));
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
