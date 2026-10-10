import type { EdgeRoute, GroupBox, Layout, NodeBox } from '../layout/elk';
import { isAsyncRelationship } from '../constants';
import type { Component, Diagnostic, Severity } from '../types';
import type { NodeContent } from './nodeContent';
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
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="10"/>` +
    `<text x="${box.x + 12}" y="${box.y + 22}">${x(label)}</text></g>`
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

/** Shape + chữ của một node tại `box` — dùng chung cho SVG xuất ra và node trên canvas. */
export function nodeBodySvg(
  type: string,
  content: NodeContent,
  box: { x: number; y: number; width: number; height: number },
): string {
  const cx = box.x + box.width / 2;
  const text = content.lines
    .map(
      (l) =>
        `<text class="${l.className}" x="${cx}" y="${box.y + l.y}" text-anchor="middle">${x(l.text)}</text>`,
    )
    .join('');
  return shapeSvg(type, box) + text;
}

/**
 * Shape theo component type. Phần tử chính có class `ac-shape` để nhận màu và trạng thái lỗi.
 * Dùng chung cho SVG xuất ra và node trên canvas.
 */
export function shapeSvg(
  type: string,
  b: { x: number; y: number; width: number; height: number },
): string {
  const { x: px, y: py, width: w, height: h } = b;
  switch (type) {
    case 'person': {
      const body = 30;
      return (
        `<circle class="ac-shape" cx="${px + w / 2}" cy="${py + 13}" r="12"/>` +
        `<rect class="ac-shape" x="${px}" y="${py + body - 2}" width="${w}" height="${h - body + 2}" rx="18"/>`
      );
    }
    case 'database':
    case 'cache': {
      const ry = 8;
      return (
        `<path class="ac-shape" d="M${px},${py + ry} v${h - 2 * ry} a${w / 2},${ry} 0 0 0 ${w},0 v${-(h - 2 * ry)} a${w / 2},${ry} 0 0 0 ${-w},0 z"/>` +
        `<ellipse class="ac-shape" cx="${px + w / 2}" cy="${py + ry}" rx="${w / 2}" ry="${ry}"/>`
      );
    }
    case 'queue':
      return `<rect class="ac-shape" x="${px}" y="${py}" width="${w}" height="${h}" rx="${Math.min(24, h / 2)}"/>`;
    case 'storage':
      return `<polygon class="ac-shape" points="${px},${py} ${px + w},${py} ${px + w - 12},${py + h} ${px + 12},${py + h}"/>`;
    case 'gateway':
      return `<polygon class="ac-shape" points="${px + 12},${py} ${px + w - 12},${py} ${px + w},${py + h / 2} ${px + w - 12},${py + h} ${px + 12},${py + h} ${px},${py + h / 2}"/>`;
    case 'frontend':
      return (
        `<rect class="ac-shape" x="${px}" y="${py}" width="${w}" height="${h}" rx="6"/>` +
        `<line class="ac-deco" x1="${px}" y1="${py + 14}" x2="${px + w}" y2="${py + 14}"/>` +
        [0, 1, 2]
          .map((i) => `<circle class="ac-dot" cx="${px + 9 + i * 8}" cy="${py + 7}" r="2"/>`)
          .join('')
      );
    case 'system':
      return `<rect class="ac-shape" x="${px}" y="${py}" width="${w}" height="${h}" rx="4"/>`;
    default:
      return `<rect class="ac-shape" x="${px}" y="${py}" width="${w}" height="${h}" rx="8"/>`;
  }
}

function renderEdge(edge: EdgeRoute, markerId: string, sev: Severity | undefined): string {
  const rel = edge.relationship;
  const d = edge.points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
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
