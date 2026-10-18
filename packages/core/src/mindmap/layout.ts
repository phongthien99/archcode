import type { Point } from '../layout/route';
import { textWidth, wrapText } from '../render/text';
import {
  declaredCollapsed,
  MIND_COLORS,
  type MindColor,
  type MindLink,
  type MindmapModel,
  type MindNode,
  type MindStyle,
} from './types';

export interface MindBox {
  node: MindNode;
  /** Màu hiệu lực: khai báo trên node, kế thừa từ nhánh cha, hoặc tự gán cho nhánh cấp 1. */
  color: MindColor | undefined;
  side: 'left' | 'right' | 'root';
  /** `box`: khối bo tròn; `underline`: chữ trên gạch chân (nhánh phụ kiểu classic). */
  shape: 'box' | 'underline';
  lines: string[];
  fontSize: number;
  /** Khoảng cách từ mép box tới chữ. */
  padX: number;
  padY: number;
  /** Số node con bị ẩn vì `collapsed` (tính cả cháu chắt). */
  hidden: number;
  /** Số con trực tiếp, tính cả con đang ẩn — dùng cho nút mở/đóng. */
  childCount: number;
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

interface Level {
  fontSize: number;
  padX: number;
  padY: number;
  maxWidth: number;
  hGap: number;
  vGap: number;
  bold: boolean;
}

/** Kích thước chữ và khoảng cách theo cấp: 0 = gốc, 1 = nhánh chính, 2+ = nhánh phụ. */
const LEVELS: Record<MindStyle, Level[]> = {
  classic: [
    { fontSize: 18, padX: 20, padY: 12, maxWidth: 240, hGap: 56, vGap: 20, bold: true },
    { fontSize: 15, padX: 14, padY: 8, maxWidth: 220, hGap: 40, vGap: 14, bold: true },
    { fontSize: 13, padX: 6, padY: 5, maxWidth: 200, hGap: 32, vGap: 6, bold: false },
  ],
  // Khoảng ngang rộng hơn: nút mở/đóng nằm ngoài mép node, nhánh mọc ra sau nút.
  notebook: [
    { fontSize: 16, padX: 18, padY: 12, maxWidth: 220, hGap: 64, vGap: 16, bold: true },
    // Nhánh chính in đậm (mindmapCss `.ac-mm-d1`) — đo chữ phải khớp, không thì tràn khỏi khối.
    { fontSize: 14, padX: 14, padY: 9, maxWidth: 220, hGap: 56, vGap: 12, bold: true },
    { fontSize: 13, padX: 12, padY: 7, maxWidth: 220, hGap: 56, vGap: 10, bold: false },
  ],
};
const LINE_HEIGHT = 1.3;
const MAX_LINES = 4;

/** Màu theo tầng của `notebook` (tầng 1 trở đi, lặp lại khi cây sâu hơn). */
const NOTEBOOK_DEPTH_COLORS: readonly MindColor[] = ['indigo', 'teal', 'amber', 'pink', 'sky'];

export interface MindmapLayoutOptions {
  /**
   * Ghi đè trạng thái thu gọn của từng node (vd. trạng thái mở/đóng trên giao diện).
   * Không truyền → dùng `collapsed` khai báo trong YAML.
   */
  collapsed?: (node: MindNode) => boolean;
}

/**
 * Layout mind map kiểu cổ điển: mỗi cây con chiếm một dải dọc, con xếp chồng và căn giữa theo cha.
 * Không dùng DOM, đồng bộ, deterministic (cùng model → cùng tọa độ). Thêm node chỉ đẩy các nhánh
 * cùng phía ra xa, không làm phía bên kia đổi chỗ.
 */
export function layoutMindmap(
  model: MindmapModel,
  options: MindmapLayoutOptions = {},
): MindmapLayout {
  const style = model.style ?? 'classic';
  const levels = LEVELS[style];
  const level = (depth: number) => levels[Math.min(depth, levels.length - 1)]!;
  const shapeOf = (node: MindNode) =>
    style === 'classic' && node.depth >= 2 ? 'underline' : 'box';
  const isCollapsed = options.collapsed ?? ((node: MindNode) => declaredCollapsed(model, node));
  const visibleChildren = (node: MindNode) => (isCollapsed(node) ? [] : node.children);
  const boxes: MindBox[] = [];
  const branches: MindBranch[] = [];
  const byId = new Map<string, MindBox>();

  const measure = (node: MindNode, color: MindColor | undefined, side: MindBox['side']) => {
    const l = level(node.depth);
    const lines = wrapText(node.text || ' ', l.maxWidth, l.fontSize, MAX_LINES, l.bold);
    const textW = Math.max(...lines.map((line) => textWidth(line, l.fontSize, l.bold)));
    const box: MindBox = {
      node,
      color,
      side,
      shape: shapeOf(node),
      lines,
      fontSize: l.fontSize,
      padX: l.padX,
      padY: l.padY,
      hidden: node.children.length && isCollapsed(node) ? countDescendants(node) : 0,
      childCount: node.children.length,
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

  const measureHeight = (node: MindNode) => {
    const l = level(node.depth);
    const lines = wrapText(node.text || ' ', l.maxWidth, l.fontSize, MAX_LINES, l.bold);
    return Math.ceil(lines.length * l.fontSize * LINE_HEIGHT + 2 * l.padY);
  };

  const root = model.root;
  const rootBox = measure(root, root.color, 'root');

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
  // Box có màu do khai báo (trên chính nó hoặc tổ tiên dưới gốc) — `notebook` cho con kế thừa.
  const declared = new Set<MindBox>();
  /** Màu của `kid` khi không tự khai báo. */
  const inheritedColor = (kid: MindNode, parent: MindBox): MindColor | undefined => {
    if (style === 'notebook') {
      return declared.has(parent)
        ? parent.color
        : NOTEBOOK_DEPTH_COLORS[(kid.depth - 1) % NOTEBOOK_DEPTH_COLORS.length];
    }
    return parent.side === 'root' ? auto.get(kid) : parent.color;
  };

  /** Đặt các con của `parent` thành một cột ở phía `side`, căn giữa theo tâm dọc của cha. */
  const placeChildren = (parent: MindBox, kids: MindNode[], side: 'left' | 'right') => {
    if (!kids.length) return;
    const l = level(parent.node.depth + 1);
    const total = sum(kids.map(band)) + l.vGap * (kids.length - 1);
    let top = parent.y + parent.height / 2 - total / 2;
    for (const kid of kids) {
      const box = measure(kid, kid.color ?? inheritedColor(kid, parent), side);
      if (kid.color || declared.has(parent)) declared.add(box);
      const h = band(kid);
      box.y = top + h / 2 - box.height / 2;
      box.x = side === 'right' ? parent.x + parent.width + l.hGap : parent.x - l.hGap - box.width;
      branches.push({ parent, child: box, ...anchors(parent, box, side) });
      placeChildren(box, visibleChildren(kid), side);
      top += h + l.vGap;
    }
  };

  rootBox.x = -rootBox.width / 2;
  rootBox.y = -rootBox.height / 2;
  const [right, left] = splitSides(model, visibleChildren(root), band);
  placeChildren(rootBox, right, 'right');
  placeChildren(rootBox, left, 'left');

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
    box.shape === 'underline' ? box.y + box.height : box.y + box.height / 2;
  const from: Point =
    parent.side === 'root'
      ? // Nhánh mọc từ trong viền gốc ra một chút, để chỗ nối không lộ khe hở.
        { x: side === 'right' ? parent.x + parent.width - 6 : parent.x + 6, y: anchorY(parent) }
      : { x: side === 'right' ? parent.x + parent.width : parent.x, y: anchorY(parent) };
  const to: Point = { x: side === 'right' ? child.x : child.x + child.width, y: anchorY(child) };
  return { from, to };
}

function countDescendants(node: MindNode): number {
  return node.children.reduce((n, child) => n + 1 + countDescendants(child), 0);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
