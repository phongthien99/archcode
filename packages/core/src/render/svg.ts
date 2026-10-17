import type { EdgeRoute, GroupBox, Layout, NodeBox } from '../layout/elk';
import { isAsyncRelationship } from '../constants';
import type { Component, Diagnostic, Severity } from '../types';
import { CARD, type NodeContent } from './nodeContent';
import { escapeXml as x } from './text';
import { colorKey, diagramCss } from './theme';

export interface RenderOptions {
  /** Diagnostics để tô viền phần tử có lỗi/cảnh báo. */
  diagnostics?: Diagnostic[];
  /** Tiền tố cho id trong SVG — bắt buộc khác nhau khi nhiều SVG cùng một trang. */
  idPrefix?: string;
  /** true: SVG độc lập (có xmlns + <style>); false: nhúng vào trang đã có diagramCss(). */
  standalone?: boolean;
  /** Nhãn mô tả cho trình đọc màn hình. */
  title?: string;
}

const MARGIN = 8;

/** Layout → chuỗi SVG. Không dùng DOM, chạy được ở mọi môi trường. */
export function renderSvg(layout: Layout, options: RenderOptions = {}): string {
  const prefix = options.idPrefix ?? 'ac-';
  const severity = severityIndex(options.diagnostics ?? []);
  const width = Math.ceil(layout.width + 2 * MARGIN);
  const height = Math.ceil(layout.height + 2 * MARGIN);
  const markerId = `${prefix}arrow`;

  const out: string[] = [];
  out.push(
    `<svg${options.standalone === false ? '' : ' xmlns="http://www.w3.org/2000/svg"'} class="ac-diagram" ` +
      `viewBox="${(layout.x ?? 0) - MARGIN} ${(layout.y ?? 0) - MARGIN} ${width} ${height}" width="${width}" height="${height}" ` +
      `role="img"${options.title ? ` aria-label="${x(options.title)}"` : ''}>`,
  );
  if (options.title) out.push(`<title>${x(options.title)}</title>`);
  if (options.standalone !== false) out.push(`<style>${diagramCss()}</style>`);
  // Marker riêng cho từng trạng thái: mũi tên cùng màu với edge, kích thước cố định (không phóng theo stroke-width).
  const marker = (suffix: string, cls: string) =>
    `<marker id="${x(markerId + suffix)}" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" ` +
    `markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path class="${cls}" d="M0,0 L10,5 L0,10 z"/></marker>`;
  out.push(
    `<defs>${marker('', 'ac-arrow')}${marker('-error', 'ac-arrow ac-arrow-error')}${marker('-warning', 'ac-arrow ac-arrow-warning')}</defs>`,
  );

  // Thứ tự vẽ: group (ngoài → trong) → edge → node → nhãn edge (luôn nằm trên cùng).
  for (const group of [...layout.groups].sort((a, b) => a.depth - b.depth)) {
    out.push(renderGroup(group, severity.get(`group:${group.group.id}`)));
  }
  for (const edge of layout.edges) {
    out.push(renderEdge(edge, markerId, severity.get(`relationship:${edge.relationship.id}`)));
  }
  for (const node of layout.nodes) {
    out.push(renderNode(node, severity.get(`component:${node.component.id}`)));
  }
  for (const edge of layout.edges) {
    if (edge.label) out.push(renderLabel(edge));
  }
  out.push('</svg>');
  return out.join('\n');
}

function renderGroup(box: GroupBox, sev: Severity | undefined): string {
  const { group } = box;
  const label = group.type ? `${group.name} [${group.type}]` : group.name;
  return (
    `<g class="ac-group${stateClass(sev)}" data-kind="group" data-id="${x(group.id)}">` +
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="12"/>` +
    `<text x="${box.x + 16}" y="${box.y + 26}">${x(label)}</text></g>`
  );
}

function renderNode(box: NodeBox, sev: Severity | undefined): string {
  const c = box.component;
  return (
    `<g class="${nodeClass(c.type, sev)}" data-kind="component" data-id="${x(c.id)}">` +
    `<title>${x(nodeTooltip(c))}</title>${nodeBodySvg(c.type, box.content, box)}</g>`
  );
}

export function nodeClass(type: string, sev: Severity | undefined): string {
  return `ac-node ac-t-${colorKey(type)}${stateClass(sev)}`;
}

export function nodeTooltip(c: Component): string {
  return [
    c.name,
    c.description,
    c.technology && `Công nghệ: ${c.technology}`,
    c.owner && `Owner: ${c.owner}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Card + icon + chữ của một node tại `box` — dùng chung cho SVG xuất ra và node trên canvas. */
export function nodeBodySvg(
  type: string,
  content: NodeContent,
  box: { x: number; y: number; width: number; height: number },
): string {
  const { icon } = content;
  const text = content.lines
    .map(
      (l) =>
        `<text class="${l.className}" x="${box.x + l.x}" y="${box.y + l.y}">${x(l.text)}</text>`,
    )
    .join('');
  const divider =
    content.dividerY === undefined
      ? ''
      : `<line class="ac-divider" x1="${box.x + CARD.padX}" y1="${box.y + content.dividerY}" x2="${box.x + box.width - CARD.padX}" y2="${box.y + content.dividerY}"/>`;
  return (
    shapeSvg(type, box) +
    `<g class="ac-icon" transform="translate(${box.x + icon.x},${box.y + icon.y})">${iconSvg(type)}</g>` +
    divider +
    text
  );
}

/**
 * Khung node: mọi loại đều là card chữ nhật bo 8px (spec: cấu trúc nhất quán).
 * Loại component phân biệt bằng icon (`iconSvg`) và footer `type · technology`.
 * Phần tử chính có class `ac-shape` để nhận màu và trạng thái lỗi.
 */
export function shapeSvg(
  _type: string,
  b: { x: number; y: number; width: number; height: number },
): string {
  return `<rect class="ac-shape" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="8"/>`;
}

/**
 * Icon 16×16 (nét 1.5px, không fill) theo loại component, kế thừa ký hiệu Structurizr:
 * person → người, database → cylinder, queue → pipe, storage → bucket, gateway → hexagon,
 * frontend → trình duyệt. Type tự định nghĩa dùng icon của `custom`.
 */
export function iconSvg(type: string): string {
  return ICONS[type] ?? ICONS.custom!;
}

const ICONS: Record<string, string> = {
  person: '<circle cx="8" cy="5" r="3"/><path d="M2.5 14.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>',
  system:
    '<rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1"/>' +
    '<rect x="1.5" y="9" width="5.5" height="5.5" rx="1"/><rect x="9" y="9" width="5.5" height="5.5" rx="1"/>',
  external:
    '<circle cx="8" cy="8" r="6.5"/><ellipse cx="8" cy="8" rx="2.75" ry="6.5"/><path d="M1.5 8h13"/>',
  frontend:
    '<rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M1.5 6h13"/>' +
    '<circle cx="4" cy="4.25" r=".4"/><circle cx="5.75" cy="4.25" r=".4"/>',
  gateway:
    '<path d="M4.75 2h6.5L14.5 8l-3.25 6h-6.5L1.5 8z"/><path d="M6 8h4M8.5 6.5 10 8l-1.5 1.5"/>',
  service:
    '<path d="M8 1.5l6 3.25v6.5L8 14.5l-6-3.25v-6.5z"/><path d="M2 4.75 8 8l6-3.25M8 8v6.5"/>',
  database:
    '<ellipse cx="8" cy="3.5" rx="5.5" ry="2"/><path d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9"/>' +
    '<path d="M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"/>',
  cache: '<path d="M9 1.5 3.5 9h4L7 14.5 12.5 7h-4z"/>',
  queue: '<rect x="1.5" y="3.5" width="13" height="9" rx="2"/><path d="M5.5 3.5v9M9.5 3.5v9"/>',
  storage:
    '<ellipse cx="8" cy="3.5" rx="6" ry="2"/><path d="M2 3.5l1.5 9.5c.2 1 2.2 1.5 4.5 1.5s4.3-.5 4.5-1.5L14 3.5"/>',
  custom: '<rect x="2" y="2" width="12" height="12" rx="2.5"/><path d="M5.5 8h5M8 5.5v5"/>',
};

const EDGE_CORNER = 6;

/**
 * Path của connector: polyline orthogonal, mỗi góc rẽ bo cung bậc hai bán kính 6px
 * (không quá nửa đoạn ngắn hơn, để góc sát nhau không bị lẹm). Dùng chung cho SVG và canvas.
 */
export function edgePath(points: { x: number; y: number }[], radius = EDGE_CORNER): string {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pt = (p: { x: number; y: number }) => `${r2(p.x)},${r2(p.y)}`;
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'}${pt(p)}`).join(' ');
  let d = `M${pt(points[0]!)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [prev, cur, next] = [points[i - 1]!, points[i]!, points[i + 1]!];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += ` L${pt(cur)}`;
      continue;
    }
    const a = {
      x: cur.x - ((cur.x - prev.x) / inLen) * r,
      y: cur.y - ((cur.y - prev.y) / inLen) * r,
    };
    const b = {
      x: cur.x + ((next.x - cur.x) / outLen) * r,
      y: cur.y + ((next.y - cur.y) / outLen) * r,
    };
    d += ` L${pt(a)} Q${pt(cur)} ${pt(b)}`;
  }
  return `${d} L${pt(points[points.length - 1]!)}`;
}

function renderEdge(edge: EdgeRoute, markerId: string, sev: Severity | undefined): string {
  const rel = edge.relationship;
  const d = edgePath(edge.points);
  const async = isAsyncRelationship(rel) ? ' ac-async' : '';
  const title = [`${rel.from} → ${rel.to}`, rel.label, rel.type && `[${rel.type}]`]
    .filter(Boolean)
    .join('\n');
  return (
    `<g class="ac-edge${async}${stateClass(sev)}" data-kind="relationship" data-id="${x(rel.id)}">` +
    `<title>${x(title)}</title><path d="${d}" marker-end="url(#${x(markerId + (sev ? `-${sev}` : ''))})"/></g>`
  );
}

function renderLabel(edge: EdgeRoute): string {
  const l = edge.label!;
  const cx = l.x + l.width / 2;
  const text = l.lines
    .map(
      (line, i) =>
        `<text x="${cx}" y="${l.y + 14 + i * 14}" text-anchor="middle">${x(line)}</text>`,
    )
    .join('');
  return (
    `<g class="ac-label" data-kind="relationship" data-id="${x(edge.relationship.id)}">` +
    `<rect x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" rx="3"/>${text}</g>`
  );
}

function stateClass(sev: Severity | undefined): string {
  return sev === 'error' ? ' ac-error' : sev === 'warning' ? ' ac-warning' : '';
}

/** `kind:id` → mức nghiêm trọng cao nhất của các diagnostic nhắm tới phần tử đó. */
function severityIndex(diagnostics: Diagnostic[]): Map<string, Severity> {
  const index = new Map<string, Severity>();
  for (const d of diagnostics) {
    if (!d.target || d.severity === 'info') continue;
    const key = `${d.target.kind}:${d.target.id}`;
    if (index.get(key) !== 'error') index.set(key, d.severity);
  }
  return index;
}
