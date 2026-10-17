import type { Component, Relationship } from '../types';
import { textWidth, wrapText } from './text';

export const NAME_SIZE = 14;
export const META_SIZE = 11;
export const DESC_SIZE = 12;

/**
 * Node là một "compact information card" (spec Enterprise Graph Design, mục 3):
 * header (icon + tên) → body (mô tả) → footer (type · technology, ngăn bằng đường mảnh).
 * Chữ căn trái; card rộng 220–260px (spec: preferred), text dài thì xuống dòng, không nở ngang.
 */
export const CARD = {
  padX: 16,
  padY: 12,
  minWidth: 220,
  maxWidth: 260,
  minHeight: 64,
  icon: 16,
  iconGap: 8,
  nameLine: 20,
  descLine: 17, // ~1.4 × 12px
  metaLine: 16,
  sectionGap: 6,
  footerGap: 8, // khoảng trống trên/dưới đường ngăn footer
} as const;

export interface TextLine {
  text: string;
  className: 'ac-name' | 'ac-meta' | 'ac-desc';
  /** Mép trái của text, tính từ mép trái node. */
  x: number;
  /** Baseline, tính từ mép trên của node. */
  y: number;
}

export interface NodeContent {
  width: number;
  height: number;
  lines: TextLine[];
  /** Vị trí icon loại component (góc trên trái), tính từ mép node. */
  icon: { x: number; y: number; size: number };
  /** Toạ độ y của đường ngăn footer (luôn có vì footer luôn có `type`). */
  dividerY?: number;
}

/** Footer: `type · technology`. */
export function nodeMeta(component: Component): string {
  return component.technology ? `${component.type} · ${component.technology}` : component.type;
}

/**
 * Nội dung và kích thước của một node. Dùng chung cho layout và render
 * để kích thước node luôn khớp với text được vẽ.
 */
export function nodeContent(component: Component): NodeContent {
  const c = CARD;
  const nameX = c.padX + c.icon + c.iconGap;
  const nameMax = c.maxWidth - nameX - c.padX;
  const bodyMax = c.maxWidth - 2 * c.padX;

  const nameLines = wrapText(component.name, nameMax, NAME_SIZE, 2, true);
  const descLines = component.description
    ? wrapText(component.description, bodyMax, DESC_SIZE, 2)
    : [];
  const metaLines = wrapText(nodeMeta(component), bodyMax, META_SIZE, 1);

  const widest = Math.max(
    nameX + Math.max(...nameLines.map((l) => textWidth(l, NAME_SIZE, true))) + c.padX,
    ...descLines.map((l) => 2 * c.padX + textWidth(l, DESC_SIZE)),
    ...metaLines.map((l) => 2 * c.padX + textWidth(l, META_SIZE)),
  );
  const width = Math.round(Math.min(c.maxWidth, Math.max(c.minWidth, widest)));

  const lines: TextLine[] = [];
  // Header: baseline dòng tên đầu căn giữa theo icon.
  let y = c.padY;
  const icon = { x: c.padX, y: c.padY + (c.nameLine - c.icon) / 2, size: c.icon };
  for (const text of nameLines) {
    lines.push({ text, className: 'ac-name', x: nameX, y: y + 15 });
    y += c.nameLine;
  }
  if (descLines.length) y += c.sectionGap;
  for (const text of descLines) {
    lines.push({ text, className: 'ac-desc', x: c.padX, y: y + 13 });
    y += c.descLine;
  }
  y += c.footerGap;
  const dividerY = y;
  y += c.footerGap;
  for (const text of metaLines) {
    lines.push({ text, className: 'ac-meta', x: c.padX, y: y + 12 });
    y += c.metaLine;
  }
  const height = Math.max(c.minHeight, Math.round(y + c.padY - 4));
  return { width, height, lines, icon, dividerY };
}

export const LABEL_SIZE = 11;
const LINE_SMALL = 14;

export interface EdgeLabelContent {
  width: number;
  height: number;
  lines: string[];
}

/** Nhãn của connector: `label` (nếu có) và `[type]`. */
export function edgeLabelContent(rel: Relationship): EdgeLabelContent | undefined {
  const lines = [
    ...(rel.label ? wrapText(rel.label, 160, LABEL_SIZE, 2) : []),
    ...(rel.type ? [`[${rel.type}]`] : []),
  ];
  if (!lines.length) return undefined;
  return {
    lines,
    width: Math.ceil(Math.max(...lines.map((l) => textWidth(l, LABEL_SIZE))) + 10),
    height: lines.length * LINE_SMALL + 6,
  };
}
