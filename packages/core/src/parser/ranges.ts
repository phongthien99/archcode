import { isNode } from 'yaml';
import type { ElementKind } from '../types';
import { isObj, normalize } from './normalize';
import { parseYaml } from './parse';

export interface ElementRange {
  kind: Extract<ElementKind, 'component' | 'relationship' | 'group'>;
  id: string;
  /** Offset trong text: [from, to). */
  from: number;
  to: number;
}

/**
 * Đoạn text của từng component/quan hệ/group — để đặt con trỏ trong YAML là chọn được
 * phần tử tương ứng trên canvas. Trả mảng rỗng khi YAML lỗi cú pháp.
 */
export function elementRanges(text: string): ElementRange[] {
  const parsed = parseYaml(text);
  if (!parsed.ok) return [];
  const data: unknown = parsed.doc.toJS();
  if (!isObj(data)) return [];
  const { model, pathOf } = normalize(data, parsed);
  const ranges: ElementRange[] = [];
  const add = (kind: ElementRange['kind'], items: { id: string }[]) => {
    for (const el of items) {
      const path = pathOf(el);
      const node = path && parsed.doc.getIn(path, true);
      if (isNode(node) && node.range)
        ranges.push({ kind, id: el.id, from: node.range[0], to: node.range[1] });
    }
  };
  add('group', model.groups);
  add('component', model.components);
  add('relationship', model.relationships);
  return ranges;
}

/** Phần tử hẹp nhất chứa vị trí `pos` (con trỏ ở dấu `- ` đầu phần tử cũng tính). */
export function elementAt(ranges: ElementRange[], pos: number): ElementRange | undefined {
  let best: ElementRange | undefined;
  for (const r of ranges) {
    if (pos >= r.from - 2 && pos <= r.to && (!best || r.to - r.from < best.to - best.from))
      best = r;
  }
  return best;
}
