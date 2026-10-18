import { layoutMindmap, validateMindmap } from '@archcode/core';
import { describe, expect, it } from 'vitest';
import { frameAt, keyLayout, planTransition, type Placed } from './animate';

const model = validateMindmap(`version: 1
kind: mindmap
direction: LR
root:
  id: r
  text: Gốc
  children:
    - id: a
      text: A
      children: [{ id: a1, text: A1 }, { id: a2, text: A2 }]
    - { id: b, text: B }
`).model!;

function placed(collapsed: (id: string) => boolean) {
  const layout = layoutMindmap(model, { collapsed: (n) => collapsed(n.id) });
  const keyed = keyLayout(layout);
  const items: Placed[] = layout.boxes.map((box) => ({
    key: keyed.keys.get(box)!,
    box,
    x: box.x,
    y: box.y,
    opacity: 1,
  }));
  return { items, keyed, map: new Map(items.map((p) => [p.key, p])) };
}

describe('planTransition', () => {
  const open = placed(() => false);
  const closed = placed((id) => id === 'a');

  it('node mới mọc ra từ tâm node cha, mờ → rõ', () => {
    const tr = planTransition(closed.map, open.items, closed.keyed.parentOf, open.keyed.parentOf);
    const a = closed.map.get('a')!;
    const a1 = tr.start.get('a1')!;
    expect(a1.opacity).toBe(0);
    expect(a1.x + a1.box.width / 2).toBeCloseTo(a.x + a.box.width / 2);
    expect(a1.y + a1.box.height / 2).toBeCloseTo(a.y + a.box.height / 2);
    expect(tr.end.get('a1')!.opacity).toBe(1);
    expect(tr.exiting.size).toBe(0);
  });

  it('node bị ẩn thu về node cha rồi biến mất', () => {
    const tr = planTransition(open.map, closed.items, open.keyed.parentOf, closed.keyed.parentOf);
    expect([...tr.exiting].sort()).toEqual(['a1', 'a2']);
    const end = tr.end.get('a1')!;
    const a = closed.map.get('a')!;
    expect(end.opacity).toBe(0);
    expect(end.x + end.box.width / 2).toBeCloseTo(a.x + a.box.width / 2);
  });

  it('frameAt nội suy tuyến tính theo t', () => {
    const tr = planTransition(closed.map, open.items, closed.keyed.parentOf, open.keyed.parentOf);
    const s = tr.start.get('a1')!;
    const e = tr.end.get('a1')!;
    const mid = frameAt(tr, 0.5).find((p) => p.key === 'a1')!;
    expect(mid.x).toBeCloseTo((s.x + e.x) / 2);
    expect(mid.opacity).toBeCloseTo(0.5);
    expect(frameAt(tr, 1).find((p) => p.key === 'b')).toEqual(tr.end.get('b'));
  });

  it('id trùng vẫn có khóa riêng', () => {
    const dup = validateMindmap(
      'version: 1\nkind: mindmap\nroot:\n  text: R\n  children: [{ id: x, text: A }, { id: x, text: B }]\n',
    ).model!;
    const { keys } = keyLayout(layoutMindmap(dup));
    expect(new Set(keys.values()).size).toBe(keys.size);
  });
});
