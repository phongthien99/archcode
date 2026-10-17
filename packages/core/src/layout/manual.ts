import { edgeLabelContent, nodeContent, type NodeContent } from '../render/nodeContent';
import type { Component, Group, LayoutDirection } from '../types';
import type { ResolvedView } from '../views/resolve';
import { routeEdges, type Box, type Point } from './route';

/** Khoảng đệm của group quanh phần tử con — giống `elk.padding` của group trong auto-layout. */
/** Padding group (spec: 24–32px); `top` gồm cả dòng tiêu đề 14px. */
export const GROUP_PADDING = { top: 44, side: 24, bottom: 24 } as const;
/** Lề quanh toàn bộ diagram — giống `elk.padding` của root. */
const MARGIN = 24;
/** Khoảng cách tối thiểu giữa hai node khi tự đặt node mới. */
const GAP = 40;

export interface GroupBoxResult extends Box {
  depth: number;
}

/**
 * Khung của từng group = bao của component con và group con, cộng padding.
 * Dùng chung cho SVG xuất ra và canvas (tính lại khi kéo node).
 */
export function computeGroupBoxes(
  groups: { id: string; parent?: string }[],
  members: { group?: string; box: Box }[],
): Map<string, GroupBoxResult> {
  const ids = new Set(groups.map((g) => g.id));
  const parentOf = new Map(
    groups.map((g) => [g.id, g.parent && ids.has(g.parent) ? g.parent : undefined]),
  );
  const depthOf = (id: string) => {
    let depth = 0;
    const seen = new Set([id]);
    for (let p = parentOf.get(id); p && !seen.has(p); p = parentOf.get(p)) {
      seen.add(p);
      depth++;
    }
    return depth;
  };
  const bounds = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
  const extend = (id: string, b: { x1: number; y1: number; x2: number; y2: number }) => {
    const cur = bounds.get(id);
    bounds.set(
      id,
      cur
        ? {
            x1: Math.min(cur.x1, b.x1),
            y1: Math.min(cur.y1, b.y1),
            x2: Math.max(cur.x2, b.x2),
            y2: Math.max(cur.y2, b.y2),
          }
        : { ...b },
    );
  };
  for (const m of members) {
    if (m.group && ids.has(m.group)) {
      extend(m.group, {
        x1: m.box.x,
        y1: m.box.y,
        x2: m.box.x + m.box.width,
        y2: m.box.y + m.box.height,
      });
    }
  }
  // Từ group sâu nhất ra ngoài: khung group con (đã cộng padding) góp vào group cha.
  const ordered = groups
    .filter((g, i) => groups.findIndex((x) => x.id === g.id) === i)
    .map((g) => ({ id: g.id, depth: depthOf(g.id) }))
    .sort((a, b) => b.depth - a.depth);
  const result = new Map<string, GroupBoxResult>();
  for (const { id, depth } of ordered) {
    const b = bounds.get(id);
    if (!b) continue;
    const box = {
      x: b.x1 - GROUP_PADDING.side,
      y: b.y1 - GROUP_PADDING.top,
      width: b.x2 - b.x1 + 2 * GROUP_PADDING.side,
      height: b.y2 - b.y1 + GROUP_PADDING.top + GROUP_PADDING.bottom,
      depth,
    };
    result.set(id, box);
    const parent = parentOf.get(id);
    if (parent)
      extend(parent, { x1: box.x, y1: box.y, x2: box.x + box.width, y2: box.y + box.height });
  }
  return result;
}

function overlaps(a: Box, b: Box, margin = 0): boolean {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  );
}

/**
 * Đặt các node chưa có vị trí quanh các node đã ghim:
 * cạnh node cùng group hoặc node có quan hệ với nó, tại ô trống gần nhất; không chồng node khác
 * và không lọt vào group mà nó không thuộc về. Không có điểm neo → xếp vào vùng trống bên phải.
 */
export function placeNodes(
  view: ResolvedView,
  sizes: Map<string, { width: number; height: number }>,
  positions: Record<string, Point>,
  direction: LayoutDirection,
): Map<string, Box> {
  const placed = new Map<string, Box>();
  const chainOf = new Map<string, string[]>();
  const groupParent = new Map(view.groups.map((g) => [g.id, g.parent]));
  for (const c of view.components) {
    const chain: string[] = [];
    for (let g = c.group; g && groupParent.has(g) && !chain.includes(g); g = groupParent.get(g))
      chain.push(g);
    chainOf.set(c.id, chain);
  }

  const pending: Component[] = [];
  for (const c of view.components) {
    if (placed.has(c.id)) continue;
    const p = positions[c.id];
    const size = sizes.get(c.id)!;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y))
      placed.set(c.id, { x: p.x, y: p.y, ...size });
    else if (!pending.some((x) => x.id === c.id)) pending.push(c);
  }
  if (!pending.length) return placed;

  const maxW = Math.max(...[...sizes.values()].map((s) => s.width));
  const maxH = Math.max(...[...sizes.values()].map((s) => s.height));
  const colW = maxW + GAP * 1.5;
  const rowH = maxH + GAP;
  const cells = gridCells(8, direction);
  const groups = view.groups.map((g) => ({ id: g.id, parent: g.parent }));
  const groupOf = new Map(view.components.map((c) => [c.id, c.group]));
  let fallback: { x: number; y: number } | undefined;

  for (const c of pending) {
    const size = sizes.get(c.id)!;
    const chain = chainOf.get(c.id)!;
    const neighbors = view.relationships
      .flatMap((r) => (r.from === c.id ? [r.to] : r.to === c.id ? [r.from] : []))
      .filter((id) => placed.has(id));
    const sameGroup = (id: string) => chain.length > 0 && groupOf.get(id) === c.group;
    const anchorId =
      neighbors.find(sameGroup) ??
      [...placed.keys()].find(sameGroup) ??
      (chain.length
        ? [...placed.keys()].find((id) => chainOf.get(id)!.includes(chain[0]!))
        : undefined) ??
      neighbors[0];

    let spot: Box | undefined;
    if (anchorId) {
      const anchor = placed.get(anchorId)!;
      const boxes = computeGroupBoxes(
        groups,
        [...placed].map(([id, box]) => ({ group: groupOf.get(id), box })),
      );
      const foreign = [...boxes].filter(([id]) => !chain.includes(id)).map(([, b]) => b);
      for (const [i, j] of cells) {
        const candidate = { x: anchor.x + i * colW, y: anchor.y + j * rowH, ...size };
        if ([...placed.values()].some((b) => overlaps(b, candidate, GAP / 2))) continue;
        if (foreign.some((b) => overlaps(b, candidate, GAP / 2))) continue;
        spot = candidate;
        break;
      }
    }
    if (!spot) {
      if (!fallback) {
        const all = [...placed.values()];
        fallback = all.length
          ? {
              x: Math.max(...all.map((b) => b.x + b.width)) + GAP * 2,
              y: Math.min(...all.map((b) => b.y)),
            }
          : { x: MARGIN, y: MARGIN };
      }
      spot = { ...fallback, ...size };
      fallback.y += size.height + GAP;
    }
    placed.set(c.id, round(spot));
  }
  return placed;
}

/** Ô lưới quanh điểm neo, gần trước xa sau; ưu tiên theo hướng của view. */
function gridCells(radius: number, direction: LayoutDirection): [number, number][] {
  const cells: [number, number][] = [];
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) if (i || j) cells.push([i, j]);
  }
  const [main, cross] = direction === 'LR' || direction === 'RL' ? [0, 1] : [1, 0];
  // BT/RL: hướng chính là trên/trái (âm).
  const sign = direction === 'BT' || direction === 'RL' ? -1 : 1;
  const score = (c: [number, number]) =>
    Math.max(Math.abs(c[0]), Math.abs(c[1])) * 100 + Math.abs(c[0]) + Math.abs(c[1]);
  return cells.sort(
    (a, b) =>
      score(a) - score(b) ||
      // Hướng chính trước (phải với LR, dưới với TB…), rồi tới hướng phụ.
      Number(b[main] * sign > 0) - Number(a[main] * sign > 0) ||
      Math.abs(a[cross]) - Math.abs(b[cross]) ||
      b[cross] - a[cross],
  );
}

function round(b: Box): Box {
  return { ...b, x: Math.round(b.x), y: Math.round(b.y) };
}

export interface ManualInput {
  view: ResolvedView;
  direction: LayoutDirection;
  positions: Record<string, Point>;
  waypoints?: Record<string, Point[]>;
}

/** Layout thủ công: vị trí node theo file layout (node mới tự đặt), group bao quanh, connector orthogonal. */
export function manualLayout({ view, direction, positions, waypoints = {} }: ManualInput) {
  const components = uniqueById(view.components);
  const contents = new Map<string, NodeContent>(components.map((c) => [c.id, nodeContent(c)]));
  const boxes = placeNodes({ ...view, components }, contents, positions, direction);

  const groupBoxes = computeGroupBoxes(
    view.groups.map((g) => ({ id: g.id, parent: g.parent })),
    components.map((c) => ({ group: c.group, box: boxes.get(c.id)! })),
  );
  const groupById = new Map<string, Group>(view.groups.map((g) => [g.id, g]));
  const groups = view.groups
    .filter((g, i) => view.groups.findIndex((x) => x.id === g.id) === i && groupBoxes.has(g.id))
    .map((g) => {
      const { depth, ...box } = groupBoxes.get(g.id)!;
      return { group: groupById.get(g.id)!, depth, ...box };
    });

  const labels = new Map(view.relationships.map((r, i) => [i, edgeLabelContent(r)]));
  const routes = routeEdges(
    boxes,
    view.relationships.map((r, i) => ({
      id: String(i),
      from: r.from,
      to: r.to,
      label: labels.get(i),
      waypoints: waypoints[r.id],
    })),
  );
  const edges = view.relationships.flatMap((relationship, i) => {
    const route = routes.get(String(i));
    if (!route) return [];
    const label = labels.get(i);
    return [
      {
        relationship,
        points: route.points,
        label: label && route.label ? { ...label, ...route.label } : undefined,
      },
    ];
  });

  const nodes = components.map((component) => ({
    component,
    content: contents.get(component.id)!,
    ...boxes.get(component.id)!,
  }));

  // Khung bao toàn bộ (node, group, connector, nhãn) + lề.
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (b: Box) => {
    xs.push(b.x, b.x + b.width);
    ys.push(b.y, b.y + b.height);
  };
  nodes.forEach(add);
  groups.forEach(add);
  for (const e of edges) {
    e.points.forEach((p) => add({ ...p, width: 0, height: 0 }));
    if (e.label) add(e.label);
  }
  const x = xs.length ? Math.min(...xs) - MARGIN : 0;
  const y = ys.length ? Math.min(...ys) - MARGIN : 0;
  return {
    x,
    y,
    width: xs.length ? Math.max(...xs) + MARGIN - x : 0,
    height: ys.length ? Math.max(...ys) + MARGIN - y : 0,
    direction,
    nodes,
    groups,
    edges,
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id));
}
