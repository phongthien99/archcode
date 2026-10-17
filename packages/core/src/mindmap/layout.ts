import type { Point } from '../layout/route';
import { textWidth, wrapText } from '../render/text';
import {
  MIND_COLORS,
  type MindColor,
  type MindLink,
  type MindmapModel,
  type MindNode,
} from './types';

export interface MindBox {
  node: MindNode;
  /** Màu hiệu lực: khai báo trên node, kế thừa từ nhánh cha, hoặc tự gán cho nhánh cấp 1. */
  color: MindColor | undefined;
  side: 'left' | 'right' | 'root';
  lines: string[];
  fontSize: number;
  /** Khoảng cách từ mép box tới chữ. */
  padX: number;
  padY: number;
  /** Số node con bị ẩn vì `collapsed` (tính cả cháu chắt). */
  hidden: number;
  /** Tọa độ tuyệt đối của góc trên trái. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Nhánh cha → con. `from`/`to` là điểm neo; đường cong do renderer vẽ. */
export interface MindBranch {
  parent: MindBox;
  child: MindBox;
  from: Point;
  to: Point;
}

export interface MindmapLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  boxes: MindBox[];
  branches: MindBranch[];
  links: { link: MindLink; from: MindBox; to: MindBox }[];
}

/** Kích thước chữ và khoảng cách theo cấp: 0 = gốc, 1 = nhánh chính, 2+ = nhánh phụ. */
const LEVELS = [
  { fontSize: 18, padX: 20, padY: 12, maxWidth: 240, hGap: 56, vGap: 20 },
  { fontSize: 15, padX: 14, padY: 8, maxWidth: 220, hGap: 40, vGap: 14 },
  { fontSize: 13, padX: 6, padY: 5, maxWidth: 200, hGap: 32, vGap: 6 },
] as const;
const LINE_HEIGHT = 1.3;
const MAX_LINES = 4;

const level = (depth: number) => LEVELS[Math.min(depth, LEVELS.length - 1)]!;

/**
 * Layout mind map kiểu cổ điển: mỗi cây con chiếm một dải dọc, con xếp chồng và căn giữa theo cha.
 * Không dùng DOM, đồng bộ, deterministic (cùng model → cùng tọa độ). Thêm node chỉ đẩy các nhánh
 * cùng phía ra xa, không làm phía bên kia đổi chỗ.
 */
export function layoutMindmap(model: MindmapModel): MindmapLayout {
  const boxes: MindBox[] = [];
  const branches: MindBranch[] = [];
  const byId = new Map<string, MindBox>();

  const measure = (node: MindNode, color: MindColor | undefined, side: MindBox['side']) => {
    const l = level(node.depth);
    const bold = node.depth <= 1;
    const lines = wrapText(node.text || ' ', l.maxWidth, l.fontSize, MAX_LINES, bold);
    const textW = Math.max(...lines.map((line) => textWidth(line, l.fontSize, bold)));
    const box: MindBox = {
      node,
      color,
      side,
      lines,
      fontSize: l.fontSize,
      padX: l.padX,
      padY: l.padY,
      hidden: node.collapsed ? countDescendants(node) : 0,
      x: 0,
      y: 0,
      width: Math.ceil(textW + 2 * l.padX),
      height: Math.ceil(lines.length * l.fontSize * LINE_HEIGHT + 2 * l.padY),
    };
    boxes.push(box);
    if (!byId.has(node.id)) byId.set(node.id, box);
    return box;
  };

  // Chiều cao dải của từng cây con (đã tính collapsed); memo theo node.
  const bandCache = new Map<MindNode, number>();
  const band = (node: MindNode): number => {
    const cached = bandCache.get(node);
    if (cached !== undefined) return cached;
    const kids = visibleChildren(node);
    const self = measureHeight(node);
    const value = kids.length
      ? Math.max(self, sum(kids.map(band)) + level(node.depth + 1).vGap * (kids.length - 1))
      : self;
    bandCache.set(node, value);
    return value;
  };

  /**
   * Đặt các con của `parent` thành một cột ở phía `side`, căn giữa theo tâm dọc của cha.
   * Màu: khai báo trên node, nếu không thì `inherit` (nhánh cấp 1: màu tự gán; sâu hơn: màu của cha).
   */
  const placeChildren = (
    parent: MindBox,
    kids: MindNode[],
    side: 'left' | 'right',
    inherit: (kid: MindNode) => MindColor | undefined,
  ) => {
    if (!kids.length) return;
    const l = level(parent.node.depth + 1);
    const total = sum(kids.map(band)) + l.vGap * (kids.length - 1);
    let top = parent.y + parent.height / 2 - total / 2;
    for (const kid of kids) {
      const box = measure(kid, kid.color ?? inherit(kid), side);
      const h = band(kid);
      box.y = top + h / 2 - box.height / 2;
      box.x = side === 'right' ? parent.x + parent.width + l.hGap : parent.x - l.hGap - box.width;
      branches.push({ parent, child: box, ...anchors(parent, box, side) });
      placeChildren(box, visibleChildren(kid), side, () => box.color);
      top += h + l.vGap;
    }
  };

  const root = model.root;
  const rootBox = measure(root, root.color, 'root');
  rootBox.x = -rootBox.width / 2;
  rootBox.y = -rootBox.height / 2;

  // Nhánh cấp 1 chưa khai báo màu: xoay vòng theo thứ tự khai báo, bỏ qua màu nhánh khác đã chọn.
  // Tính trên toàn bộ con của gốc nên thu gọn hay đổi phía một nhánh không làm màu nhánh khác nhảy.
  const taken = new Set(root.children.map((c) => c.color));
  const pool = MIND_COLORS.filter((c) => !taken.has(c));
  const auto = new Map<MindNode, MindColor>();
  for (const kid of root.children) {
    if (!kid.color)
      auto.set(
        kid,
        (pool.length ? pool : MIND_COLORS)[auto.size % (pool.length || MIND_COLORS.length)]!,
      );
  }
  const autoColor = (kid: MindNode) => auto.get(kid);
  const [right, left] = splitSides(model, visibleChildren(root), band);
  placeChildren(rootBox, right, 'right', autoColor);
  placeChildren(rootBox, left, 'left', autoColor);

  const links = model.links.flatMap((link) => {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    return from && to ? [{ link, from, to }] : [];
  });

  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    boxes,
    branches,
    links,
  };
}

/**
 * Chia nhánh cấp 1 sang hai phía. `side` khai báo được tôn trọng; còn lại giữ thứ tự khai báo:
 * phía phải nhận nhánh cho tới khi đủ nửa tổng chiều cao, phần sau sang trái.
 */
function splitSides(
  model: MindmapModel,
  nodes: MindNode[],
  band: (node: MindNode) => number,
): [right: MindNode[], left: MindNode[]] {
  if (model.direction === 'LR') return [nodes, []];
  if (model.direction === 'RL') return [[], nodes];

  const total = sum(nodes.map(band));
  let rightHeight = sum(nodes.filter((n) => n.side === 'right').map(band));
  const right: MindNode[] = [];
  const left: MindNode[] = [];
  for (const node of nodes) {
    if (node.side === 'right') right.push(node);
    else if (node.side === 'left') left.push(node);
    else if (rightHeight < total / 2 || !right.length) {
      right.push(node);
      rightHeight += band(node);
    } else left.push(node);
  }
  return [right, left];
}

/**
 * Điểm neo nhánh: từ mép cha hướng về con, tới mép con hướng về cha.
 * Node cấp 2+ vẽ dạng gạch chân, nên neo ở đáy để nhánh nối liền với gạch chân.
 */
function anchors(parent: MindBox, child: MindBox, side: 'left' | 'right') {
  const anchorY = (box: MindBox) =>
    box.node.depth >= 2 ? box.y + box.height : box.y + box.height / 2;
  const from: Point =
    parent.side === 'root'
      ? // Nhánh mọc từ trong viền gốc ra một chút, để chỗ nối không lộ khe hở.
        { x: side === 'right' ? parent.x + parent.width - 6 : parent.x + 6, y: anchorY(parent) }
      : { x: side === 'right' ? parent.x + parent.width : parent.x, y: anchorY(parent) };
  const to: Point = { x: side === 'right' ? child.x : child.x + child.width, y: anchorY(child) };
  return { from, to };
}

function measureHeight(node: MindNode): number {
  const l = level(node.depth);
  const lines = wrapText(node.text || ' ', l.maxWidth, l.fontSize, MAX_LINES, node.depth <= 1);
  return Math.ceil(lines.length * l.fontSize * LINE_HEIGHT + 2 * l.padY);
}

function visibleChildren(node: MindNode): MindNode[] {
  return node.collapsed ? [] : node.children;
}

function countDescendants(node: MindNode): number {
  return node.children.reduce((n, child) => n + 1 + countDescendants(child), 0);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
