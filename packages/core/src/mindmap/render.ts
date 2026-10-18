import type { Point } from '../layout/route';
import { escapeXml as x } from '../render/text';
import { diagramCss } from '../render/theme';
import type { Diagnostic, Severity } from '../types';
import type { MindBox, MindmapLayout } from './layout';
import { mindmapCss } from './theme';
import type { MindColor } from './types';

export interface MindmapRenderOptions {
  /** Diagnostics để tô viền node có lỗi/cảnh báo (khớp theo đường dẫn YAML). */
  diagnostics?: Diagnostic[];
  /** Tiền tố cho id trong SVG — bắt buộc khác nhau khi nhiều SVG cùng một trang. */
  idPrefix?: string;
  /** true: SVG độc lập (có xmlns + <style>); false: nhúng vào trang đã có mindmapCss(). */
  standalone?: boolean;
  /** Nhãn mô tả cho trình đọc màn hình; mặc định là text của gốc. */
  title?: string;
}

const MARGIN = 16;
const LINE_HEIGHT = 1.3;
/** Layout → chuỗi SVG. Không dùng DOM, chạy được ở mọi môi trường. */
export function renderMindmapSvg(
  layout: MindmapLayout,
  options: MindmapRenderOptions = {},
): string {
  const prefix = options.idPrefix ?? 'ac-mm-';
  const severity = severityByBox(layout.boxes, options.diagnostics ?? []);
  const width = Math.ceil(layout.width + 2 * MARGIN);
  const height = Math.ceil(layout.height + 2 * MARGIN);
  const title = options.title ?? layout.boxes[0]?.node.text ?? 'Mind map';
  const markerId = `${prefix}arrow`;

  const out: string[] = [];
  out.push(
    `<svg${options.standalone === false ? '' : ' xmlns="http://www.w3.org/2000/svg"'} class="ac-diagram ac-mindmap" ` +
      `viewBox="${n(layout.x - MARGIN)} ${n(layout.y - MARGIN)} ${width} ${height}" width="${width}" height="${height}" ` +
      `role="img" aria-label="${x(title)}">`,
  );
  out.push(`<title>${x(title)}</title>`);
  if (options.standalone !== false) out.push(`<style>${diagramCss()}\n${mindmapCss()}</style>`);
  out.push(
    `<defs><marker id="${x(markerId)}" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" ` +
      `markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path class="ac-mm-arrow" d="M0,0 L10,5 L0,10 z"/></marker></defs>`,
  );

  // Thứ tự vẽ: nhánh → node → link chéo (nằm trên cùng để không bị node che).
  for (const b of layout.branches) {
    out.push(`<path class="${mindBranchClass(b.child)}" d="${mindBranchPath(b.from, b.to)}"/>`);
  }
  for (const box of layout.boxes) out.push(renderBox(box, severity.get(box)));
  for (const { link, from, to } of layout.links) {
    const g = mindLinkGeometry(from, to);
    out.push(
      `<g class="ac-mm-link" data-kind="mind-link" data-from="${x(link.from)}" data-to="${x(link.to)}">` +
        `<path d="${g.d}" marker-end="url(#${x(markerId)})"/>` +
        (link.label
          ? `<text x="${n(g.label.x)}" y="${n(g.label.y)}" text-anchor="middle">${x(link.label)}</text>`
          : '') +
        '</g>',
    );
  }
  out.push('</svg>');
  return out.join('\n');
}

/** Đường cong nhánh cha → con giữa hai điểm neo. */
export function mindBranchPath(from: Point, to: Point): string {
  const mx = (from.x + to.x) / 2;
  return `M${p(from)} C${n(mx)},${n(from.y)} ${n(mx)},${n(to.y)} ${p(to)}`;
}

export function mindBranchClass(child: MindBox): string {
  return `ac-mm-branch ac-mm-b${Math.min(child.node.depth, 3)}${colorClass(child.color)}`;
}

type Rect = Pick<MindBox, 'x' | 'y' | 'width' | 'height'>;

/** Đường nối chéo giữa hai node: path và vị trí nhãn. */
export function mindLinkGeometry(from: Rect, to: Rect): { d: string; label: Point } {
  const a = edgePoint(from, center(to));
  const b = edgePoint(to, center(from));
  // Cong nhẹ sang một bên để không trùng với nhánh cây nối hai node gần nhau.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const c = { x: (a.x + b.x) / 2 - dy * 0.2, y: (a.y + b.y) / 2 + dx * 0.2 };
  return {
    d: `M${p(a)} Q${p(c)} ${p(b)}`,
    label: { x: ((a.x + b.x) / 2) * 0.5 + c.x * 0.5, y: ((a.y + b.y) / 2) * 0.5 + c.y * 0.5 - 4 },
  };
}

function renderBox(box: MindBox, sev: Severity | undefined): string {
  const { node } = box;
  return (
    `<g class="${mindNodeClass(box, sev)}" data-kind="mind-node" data-id="${x(node.id)}"` +
    (node.link ? ` data-link="${x(node.link)}"` : '') +
    `><title>${x(mindNodeTooltip(box))}</title>${mindNodeBodySvg(box)}</g>`
  );
}

/** Class của `<g>` bọc node — dùng chung cho SVG xuất ra và node trên Preview tương tác. */
export function mindNodeClass(box: MindBox, sev?: Severity): string {
  return (
    `ac-mm-node ac-mm-d${Math.min(box.node.depth, 2)}${colorClass(box.color)}` +
    (box.shape === 'box' && box.node.depth >= 2 ? ' ac-mm-boxed' : '') +
    (sev ? ` ac-${sev}` : '') +
    (box.hidden ? ' ac-mm-collapsed' : '')
  );
}

export function mindNodeTooltip(box: MindBox): string {
  const { node } = box;
  return [node.text, node.note, node.tags.length ? `#${node.tags.join(' #')}` : '']
    .filter(Boolean)
    .join('\n');
}

export interface MindNodeBodyOptions {
  /** true: tọa độ tính từ góc trên trái của box (0,0) thay vì tọa độ tuyệt đối. */
  local?: boolean;
  /** false: không vẽ huy hiệu "+N" (Preview tương tác có nút mở/đóng riêng). */
  badge?: boolean;
}

/** Shape + chữ (+ huy hiệu thu gọn) của một node, chưa có `<g>` bọc ngoài. */
export function mindNodeBodySvg(box: MindBox, options: MindNodeBodyOptions = {}): string {
  const { padX, padY } = box;
  const ox = options.local ? 0 : box.x;
  const oy = options.local ? 0 : box.y;
  const boxed = box.shape === 'box';

  const parts: string[] = [];
  if (boxed) {
    parts.push(
      `<rect class="ac-mm-shape" x="${n(ox)}" y="${n(oy)}" width="${box.width}" height="${box.height}" rx="${box.node.depth === 0 ? 12 : 8}"/>`,
    );
  } else {
    // Nhánh phụ: chữ trên gạch chân, gạch chân nối liền với nhánh.
    const bottom = oy + box.height;
    parts.push(`<path class="ac-mm-shape" d="M${n(ox)},${n(bottom)} H${n(ox + box.width)}"/>`);
  }
  const anchor = boxed ? 'middle' : 'start';
  const tx = boxed ? ox + box.width / 2 : ox + padX;
  box.lines.forEach((line, i) => {
    const ty = oy + padY + box.fontSize * (0.95 + i * LINE_HEIGHT);
    parts.push(
      `<text x="${n(tx)}" y="${n(ty)}" text-anchor="${anchor}" font-size="${box.fontSize}">${x(line)}</text>`,
    );
  });
  if (box.hidden && options.badge !== false) {
    // Huy hiệu "+N" ở mép ngoài: báo nhánh đang thu gọn.
    const cx = box.side === 'left' ? ox - 12 : ox + box.width + 12;
    const cy = boxed ? oy + box.height / 2 : oy + box.height;
    parts.push(
      `<g class="ac-mm-badge"><circle cx="${n(cx)}" cy="${n(cy)}" r="10"/>` +
        `<text x="${n(cx)}" y="${n(cy + 3.5)}" text-anchor="middle">+${box.hidden}</text></g>`,
    );
  }
  return parts.join('');
}

/** Mỗi diagnostic gắn vào node có đường dẫn YAML là tiền tố dài nhất của đường dẫn lỗi. */
export function severityByBox(boxes: MindBox[], diagnostics: Diagnostic[]): Map<MindBox, Severity> {
  const result = new Map<MindBox, Severity>();
  for (const d of diagnostics) {
    if (!d.path || d.severity === 'info') continue;
    let best: MindBox | undefined;
    for (const box of boxes) {
      const path = box.node.path;
      const isPrefix = path.length <= d.path.length && path.every((seg, i) => d.path![i] === seg);
      if (isPrefix && (!best || path.length > best.node.path.length)) best = box;
    }
    if (best && result.get(best) !== 'error') result.set(best, d.severity);
  }
  return result;
}

function colorClass(color: MindColor | undefined): string {
  return color ? ` ac-mm-c-${color}` : '';
}

function center(box: Rect): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Giao điểm của đoạn tâm box → `toward` với viền box. */
function edgePoint(box: Rect, toward: Point): Point {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const scale = Math.min(
    dx ? box.width / 2 / Math.abs(dx) : Infinity,
    dy ? box.height / 2 / Math.abs(dy) : Infinity,
  );
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

/** Làm tròn 1 chữ số thập phân: SVG gọn và ổn định giữa các môi trường. */
function n(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function p(point: Point): string {
  return `${n(point.x)},${n(point.y)}`;
}
