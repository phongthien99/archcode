import type { Component, Relationship } from '../types';
import { textWidth, wrapText } from './text';

export const NAME_SIZE = 14;
export const META_SIZE = 11;
export const DESC_SIZE = 11;
const LINE_NAME = 18;
const LINE_SMALL = 14;
const MIN_WIDTH = 160;
const MAX_WIDTH = 240;
const PAD_X = 18;

export interface TextLine {
  text: string;
  className: 'ac-name' | 'ac-meta' | 'ac-desc';
  /** Baseline, tính từ mép trên của node. */
  y: number;
}

export interface NodeContent {
  width: number;
  height: number;
  lines: TextLine[];
}

/** Khoảng trống phía trên dành cho phần trang trí của shape (đầu người, nắp cylinder...). */
function decorationTop(type: string): number {
  switch (type) {
    case 'person':
      return 30;
    case 'database':
    case 'cache':
      return 16;
    case 'frontend':
      return 14;
    default:
      return 0;
  }
}

/** Khoảng trống hai bên cho shape có cạnh xiên (gateway, storage). */
function decorationX(type: string): number {
  return type === 'gateway' || type === 'storage' ? 12 : 0;
}

/**
 * Nội dung và kích thước của một node. Dùng chung cho layout và render
 * để kích thước node luôn khớp với text được vẽ.
 */
export function nodeContent(component: Component): NodeContent {
  const extraX = decorationX(component.type);
  const textMax = MAX_WIDTH - 2 * (PAD_X + extraX);

  const nameLines = wrapText(component.name, textMax, NAME_SIZE, 2, true);
  const meta = `[${component.type}${component.technology ? `: ${component.technology}` : ''}]`;
  const metaLines = wrapText(meta, textMax, META_SIZE, 1);
  const descLines = component.description
    ? wrapText(component.description, textMax, DESC_SIZE, 2)
    : [];

  const widest = Math.max(
    ...nameLines.map((l) => textWidth(l, NAME_SIZE, true)),
    ...metaLines.map((l) => textWidth(l, META_SIZE)),
    ...descLines.map((l) => textWidth(l, DESC_SIZE)),
  );
  const width = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widest + 2 * (PAD_X + extraX))));

  const lines: TextLine[] = [];
  let y = decorationTop(component.type) + 14;
  for (const text of nameLines) {
    y += LINE_NAME - 4;
    lines.push({ text, className: 'ac-name', y });
    y += 4;
  }
  y += 2;
  for (const text of metaLines) {
    y += LINE_SMALL;
    lines.push({ text, className: 'ac-meta', y });
  }
  if (descLines.length) y += 4;
  for (const text of descLines) {
    y += LINE_SMALL;
    lines.push({ text, className: 'ac-desc', y });
  }
  const height = Math.max(64, Math.round(y + 14));
  return { width, height, lines };
}

export const LABEL_SIZE = 11;

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
