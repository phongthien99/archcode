import {
  isCollection,
  isMap,
  isScalar,
  isSeq,
  parse,
  type Node,
  type Pair,
  type Scalar,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml';

/** Một thay đổi trên text gốc: thay đoạn `[from, to)` bằng `insert`. Offset tính trên text *trước* khi sửa. */
export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * Gom các thay đổi nhỏ trên text YAML. Mọi offset tính trên text gốc, nên phần không bị
 * đụng tới giữ nguyên từng byte (comment, khoảng trắng, kiểu quote...).
 */
export class TextPatcher {
  private edits: TextChange[] = [];
  readonly eol: string;

  constructor(readonly text: string) {
    this.eol = text.includes('\r\n') ? '\r\n' : '\n';
  }

  replace(from: number, to: number, insert: string): void {
    if (from === to && !insert) return;
    this.edits.push({ from, to, insert });
  }

  /** Đầu dòng chứa `pos`. */
  lineStart(pos: number): number {
    return this.text.lastIndexOf('\n', pos - 1) + 1;
  }

  /** Đầu dòng kế tiếp sau dòng chứa `pos` (hoặc cuối text). */
  nextLineStart(pos: number): number {
    const nl = this.text.indexOf('\n', pos);
    return nl === -1 ? this.text.length : nl + 1;
  }

  /** Cột (0-based) của `pos` trong dòng. */
  column(pos: number): number {
    return pos - this.lineStart(pos);
  }

  /** Vị trí ngay sau ký tự có nghĩa cuối cùng của node (bỏ khoảng trắng/xuống dòng ở cuối range). */
  contentEnd(node: Node): number {
    const [start, end] = node.range!;
    let pos = end;
    while (pos > start && /\s/.test(this.text[pos - 1]!)) pos--;
    return pos;
  }

  /** Vị trí ký tự `-` của một phần tử trong block sequence. */
  dashOf(item: Node): number {
    let pos = item.range![0] - 1;
    while (pos >= 0 && this.text[pos] !== '-') pos--;
    return pos;
  }

  isBlankLine(lineStart: number): boolean {
    if (lineStart >= this.text.length) return false;
    const end = this.text.indexOf('\n', lineStart);
    return this.text.slice(lineStart, end === -1 ? this.text.length : end).trim() === '';
  }

  /** Áp các thay đổi; các đoạn xóa chồng nhau được gộp lại. */
  build(): { text: string; changes: TextChange[] } {
    const sorted = [...this.edits].sort((a, b) => a.from - b.from || a.to - b.to);
    const merged: TextChange[] = [];
    for (const edit of sorted) {
      const last = merged[merged.length - 1];
      if (last && edit.from < last.to) {
        if (last.insert || edit.insert) throw new Error('Các thay đổi chồng lên nhau');
        last.to = Math.max(last.to, edit.to);
        continue;
      }
      if (last && edit.from === last.to && !last.insert && !edit.insert) {
        last.to = edit.to;
        continue;
      }
      merged.push({ ...edit });
    }
    let out = '';
    let pos = 0;
    for (const edit of merged) {
      out += this.text.slice(pos, edit.from) + edit.insert;
      pos = edit.to;
    }
    out += this.text.slice(pos);
    return { text: out, changes: merged };
  }
}

// ---------------------------------------------------------------------------
// Định dạng giá trị

/**
 * Chuỗi → scalar YAML. Ưu tiên plain (không quote) nếu đọc lại ra đúng chuỗi đó;
 * giữ kiểu quote cũ khi sửa giá trị đã có.
 */
export function formatScalar(value: string, flow: boolean, previous?: Scalar['type']): string {
  const single = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const multiline = /[\n\r]/.test(value);
  if (previous === 'QUOTE_DOUBLE') return JSON.stringify(value);
  if (previous === 'QUOTE_SINGLE' && !multiline) return single(value);
  if (!multiline && isPlainSafe(value, flow)) return value;
  // eslint-disable-next-line no-control-regex
  if (multiline || value.includes("'") || /[\x00-\x1f\\]/.test(value)) return JSON.stringify(value);
  return single(value);
}

function isPlainSafe(value: string, flow: boolean): boolean {
  if (!value || value !== value.trim()) return false;
  try {
    const parsed: unknown = flow ? parse(`[${value}]`) : parse(`k: ${value}`);
    const result = flow ? (parsed as unknown[])[0] : (parsed as Record<string, unknown>).k;
    return flow
      ? Array.isArray(parsed) && parsed.length === 1 && result === value
      : result === value;
  } catch {
    return false;
  }
}

export type FieldValue = string | string[];

/** Giá trị ở dạng một dòng (flow): scalar hoặc `[a, b]`. */
export function formatInline(value: FieldValue, flow: boolean): string {
  return Array.isArray(value)
    ? `[${value.map((v) => formatScalar(v, true)).join(', ')}]`
    : formatScalar(value, flow);
}

// ---------------------------------------------------------------------------
// Thao tác trên map / sequence

export function findPair(map: YAMLMap, key: string): Pair<Node, Node | null> | undefined {
  return (map.items as Pair<Node, Node | null>[]).find(
    (p) => isScalar(p.key) && p.key.value === key,
  );
}

/** Thứ tự key chuẩn — key mới được chèn sau key đứng trước nó theo thứ tự này. */
export type KeyOrder = readonly string[];

/**
 * Đặt giá trị cho `key` trong map: sửa tại chỗ nếu đã có (giữ comment cuối dòng),
 * chèn mới theo thứ tự `order` nếu chưa có.
 */
export function setMapValue(
  p: TextPatcher,
  map: YAMLMap,
  key: string,
  value: FieldValue,
  order: KeyOrder = [],
): void {
  const pair = findPair(map, key);
  if (!pair) {
    insertPair(p, map, key, value, order);
    return;
  }
  const node = pair.value;
  const flow = !!map.flow;
  if (!node || (isScalar(node) && node.value === null && node.range![0] === node.range![1])) {
    // `key:` không có giá trị.
    const at = node ? node.range![0] : (pair.key as Node).range![1] + 1;
    p.replace(at, at, `${needsSpace(p.text, at) ? ' ' : ''}${formatInline(value, flow)}`);
    return;
  }
  if (isScalar(node) && !Array.isArray(value)) {
    replaceScalar(p, node, value, flow);
    return;
  }
  const [start] = node.range!;
  const end = p.contentEnd(node);
  if (Array.isArray(value) && isSeq(node) && !node.flow && node.items.length) {
    // Giữ dạng block cho list đang ở dạng block.
    const indent = ' '.repeat(p.column(p.dashOf(node.items[0] as Node)));
    const text = value.map((v, i) => `${i ? indent : ''}- ${formatScalar(v, false)}`).join(p.eol);
    p.replace(p.dashOf(node.items[0] as Node), end, text);
    return;
  }
  p.replace(start, end, formatInline(value, flow));
}

function needsSpace(text: string, at: number): boolean {
  return text[at - 1] === ':';
}

export function replaceScalar(p: TextPatcher, node: Scalar, value: string, flow: boolean): void {
  const [start, end] = node.range!;
  if (node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED') {
    // Block scalar: range gồm cả dòng cuối; giữ dạng `|` với thụt lề của nội dung cũ.
    const firstContent = p.nextLineStart(start);
    const indentMatch = /^[ ]*/.exec(p.text.slice(firstContent));
    const indent = indentMatch?.[0] || ' '.repeat(p.column(start) + 2);
    const lines = value.replace(/\n$/, '').split('\n');
    const header = value.endsWith('\n') ? '|' : '|-';
    const body = lines.map((l) => (l ? indent + l : '')).join(p.eol);
    const tail = p.text.slice(start, end).endsWith('\n') ? p.eol : '';
    p.replace(start, end, `${header}${p.eol}${body}${tail}`);
    return;
  }
  p.replace(start, end, formatScalar(value, flow, node.type));
}

/** Chèn cặp `key: value` mới vào map. */
export function insertPair(
  p: TextPatcher,
  map: YAMLMap,
  key: string,
  value: FieldValue | { block: string },
  order: KeyOrder = [],
): void {
  const pairs = map.items as Pair<Node, Node | null>[];
  const rank = order.indexOf(key);
  // Cặp đứng ngay trước vị trí chèn: cặp cuối cùng có thứ hạng nhỏ hơn key mới.
  let after: Pair<Node, Node | null> | undefined;
  if (rank !== -1) {
    for (const pair of pairs) {
      const r = isScalar(pair.key) ? order.indexOf(String(pair.key.value)) : -1;
      if (r !== -1 && r < rank) after = pair;
    }
  }
  after ??= pairs[pairs.length - 1];
  const before = after ? pairs[pairs.indexOf(after) + 1] : pairs[0];

  if (map.flow) {
    const text = isBlock(value) ? value.block : `${key}: ${formatInline(value, true)}`;
    if (!pairs.length) {
      const close = map.range![1] - 1; // vị trí `}`
      const inner = p.text.slice(map.range![0] + 1, close);
      p.replace(map.range![0] + 1, close, inner.trim() ? `${inner}${text}` : ` ${text} `);
      return;
    }
    if (after) p.replace(pairEnd(p, after), pairEnd(p, after), `, ${text}`);
    else p.replace(nodeStart(before!), nodeStart(before!), `${text}, `);
    return;
  }

  const indent = pairs.length
    ? ' '.repeat(p.column(nodeStart(pairs[0]!)))
    : ' '.repeat(p.column(map.range![0]));
  const line = isBlock(value) ? value.block : `${key}: ${formatInline(value, false)}`;
  if (!after) {
    // Map rỗng — không xảy ra với map block thực tế.
    p.replace(map.range![0], map.range![0], `${line}${p.eol}${indent}`);
    return;
  }
  const at = p.nextLineStart(pairEnd(p, after));
  const lead = at === p.text.length && !p.text.endsWith('\n') ? p.eol : '';
  p.replace(at, at, `${lead}${indent}${line}${p.eol}`);
}

function isBlock(value: FieldValue | { block: string }): value is { block: string } {
  return typeof value === 'object' && !Array.isArray(value);
}

/** Xóa cặp `key` khỏi map (cả dòng của nó với map block). */
export function deletePair(p: TextPatcher, map: YAMLMap, key: string): void {
  const pairs = map.items as Pair<Node, Node | null>[];
  const index = pairs.findIndex((pair) => isScalar(pair.key) && pair.key.value === key);
  if (index === -1) return;
  const pair = pairs[index]!;
  const next = pairs[index + 1];
  const prev = pairs[index - 1];
  const start = nodeStart(pair);

  if (map.flow) {
    if (next) p.replace(start, nodeStart(next), '');
    else if (prev) p.replace(pairEnd(p, prev), pairEnd(p, pair), '');
    else p.replace(start, pairEnd(p, pair), '');
    return;
  }
  const lineStart = p.lineStart(start);
  const onDashLine = p.text.slice(lineStart, start).trim() !== '';
  if (onDashLine) {
    // `- key: v` — kéo cặp kế tiếp lên dòng có dấu `-`.
    if (next) p.replace(start, nodeStart(next), '');
    else p.replace(start, pairEnd(p, pair), '{}');
    return;
  }
  p.replace(lineStart, p.nextLineStart(pairEnd(p, pair)), '');
}

function nodeStart(pair: Pair<Node, Node | null>): number {
  return (pair.key as Node).range![0];
}

/** Vị trí ngay sau nội dung của cặp (giá trị, hoặc key nếu không có giá trị). */
function pairEnd(p: TextPatcher, pair: Pair<Node, Node | null>): number {
  const value = pair.value;
  if (value && value.range && value.range[1] > value.range[0]) return p.contentEnd(value);
  // Giá trị rỗng: sau dấu `:`.
  const keyEnd = (pair.key as Node).range![1];
  const colon = p.text.indexOf(':', keyEnd);
  return colon === -1 ? keyEnd : colon + 1;
}

/** Kiểu trình bày của các phần tử trong một sequence, để phần tử mới giống phần tử lân cận. */
export interface SeqStyle {
  flowItems: boolean;
  /** `{ a: 1 }` (có khoảng trắng trong ngoặc) hay `{a: 1}`. */
  padded: boolean;
  /** Các phần tử block cách nhau một dòng trống. */
  spaced: boolean;
}

export function seqStyle(p: TextPatcher, seq: YAMLSeq): SeqStyle {
  const items = seq.items as Node[];
  const last = items[items.length - 1];
  const flowItems = !!last && isCollection(last) && !!last.flow;
  const padded = flowItems ? p.text[last.range![0] + 1] === ' ' : true;
  let spaced = false;
  if (!seq.flow && items.length >= 2) {
    const a = items[items.length - 2]!;
    const between = p.text.slice(p.contentEnd(a), p.dashOf(last!));
    spaced = /\n[ \t]*\r?\n/.test(between);
  }
  return { flowItems, padded, spaced };
}

export type Entry = [key: string, value: FieldValue];

export function flowMapText(entries: Entry[], padded: boolean): string {
  const body = entries.map(([k, v]) => `${k}: ${formatInline(v, true)}`).join(', ');
  return padded ? `{ ${body} }` : `{${body}}`;
}

/** Phần tử map dạng block trong sequence: `- k: v` + các dòng `  k: v`. */
export function blockItemText(entries: Entry[], indent: string, eol: string): string {
  return entries
    .map(([k, v], i) => `${i ? `${indent}  ` : `${indent}- `}${k}: ${formatInline(v, false)}`)
    .join(eol);
}

/** Thêm một phần tử (map) vào cuối sequence, theo kiểu của phần tử lân cận. */
export function appendMapItem(
  p: TextPatcher,
  seq: YAMLSeq,
  entries: Entry[],
  keyIndent: number,
): void {
  const items = seq.items as Node[];
  const style = seqStyle(p, seq);

  if (seq.flow) {
    const item = flowMapText(entries, true);
    if (!items.length) {
      // `key: []` → chuyển sang dạng block cho dễ đọc.
      const colon = p.text.lastIndexOf(':', seq.range![0]);
      const indent = ' '.repeat(keyIndent + 2);
      p.replace(colon + 1, seq.range![1], `${p.eol}${blockItemText(entries, indent, p.eol)}`);
      return;
    }
    const end = p.contentEnd(items[items.length - 1]!);
    p.replace(end, end, `, ${item}`);
    return;
  }

  const last = items[items.length - 1]!;
  const indent = ' '.repeat(p.column(p.dashOf(last)));
  const text = style.flowItems
    ? `${indent}- ${flowMapText(entries, style.padded)}`
    : blockItemText(entries, indent, p.eol);
  const at = p.nextLineStart(p.contentEnd(last));
  const lead = at === p.text.length && !p.text.endsWith('\n') ? p.eol : '';
  p.replace(at, at, `${lead}${style.spaced ? p.eol : ''}${text}${p.eol}`);
}

/** Xóa các phần tử `indices` khỏi sequence. Xóa hết thì để lại `[]` (schema yêu cầu kiểu array). */
export function deleteSeqItems(p: TextPatcher, seq: YAMLSeq, indices: Set<number>): void {
  const items = seq.items as Node[];
  if (!indices.size) return;

  if (seq.flow) {
    if (items.every((_, i) => indices.has(i))) {
      p.replace(seq.range![0], seq.range![1], '[]');
      return;
    }
    // Xóa theo từng đoạn liên tiếp, kèm dấu phẩy phân cách.
    let i = 0;
    while (i < items.length) {
      if (!indices.has(i)) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < items.length && indices.has(j + 1)) j++;
      const next = items[j + 1];
      if (next) p.replace(items[i]!.range![0], next.range![0], '');
      else p.replace(p.contentEnd(items[i - 1]!), p.contentEnd(items[j]!), '');
      i = j + 1;
    }
    return;
  }

  const ranges: [number, number][] = [];
  for (const i of [...indices].sort((a, b) => a - b)) {
    const item = items[i]!;
    const from = attachedCommentStart(p, p.lineStart(p.dashOf(item)), p.column(p.dashOf(item)));
    const to = p.nextLineStart(p.contentEnd(item));
    const last = ranges[ranges.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else ranges.push([from, to]);
  }
  for (const range of ranges) {
    // Không để lại hai dòng trống liền nhau.
    const [from, to] = range;
    const blankBefore = from === 0 || p.isBlankLine(p.lineStart(from - 1));
    if (blankBefore && to < p.text.length && p.isBlankLine(to)) range[1] = p.nextLineStart(to);
    p.replace(range[0], range[1], '');
  }
  if (items.every((_, i) => indices.has(i))) {
    const colon = p.text.lastIndexOf(':', p.dashOf(items[0]!));
    p.replace(colon + 1, colon + 1, ' []');
  }
}

/**
 * Comment nằm ngay trên phần tử (cùng thụt lề, không cách dòng trống) được coi là của phần tử đó
 * và bị xóa cùng nó.
 */
function attachedCommentStart(p: TextPatcher, lineStart: number, indent: number): number {
  let start = lineStart;
  while (start > 0) {
    const prev = p.lineStart(start - 1);
    const line = p.text.slice(prev, start).replace(/\r?\n$/, '');
    if (!/^\s*#/.test(line) || line.length - line.trimStart().length !== indent) break;
    start = prev;
  }
  return start;
}

export { isMap, isScalar, isSeq };
