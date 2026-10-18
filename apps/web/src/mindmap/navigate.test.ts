import { layoutMindmap, validateMindmap } from '@archcode/core';
import { describe, expect, it } from 'vitest';
import { navigate } from './navigate';

const model = validateMindmap(`version: 1
kind: mindmap
root:
  id: r
  text: R
  children:
    - id: a
      text: A
      children: [{ id: a1, text: A1 }, { id: a2, text: A2 }]
    - { id: b, text: B, collapsed: true, children: [b1] }
    - { id: l, text: L, side: left }
`).model!;
const layout = layoutMindmap(model);
const box = (id: string) => layout.boxes.find((b) => b.node.id === id)!;
const sel = (r: ReturnType<typeof navigate>) =>
  r && 'select' in r ? r.select.node.id : r && `expand:${r.expand.node.id}`;

describe('navigate', () => {
  it('chưa chọn → chọn gốc; gốc → con đầu tiên theo phía', () => {
    expect(sel(navigate(layout, undefined, 'ArrowDown'))).toBe('r');
    expect(sel(navigate(layout, box('r'), 'ArrowRight'))).toBe('a');
    expect(sel(navigate(layout, box('r'), 'ArrowLeft'))).toBe('l');
  });

  it('ra ngoài: tới con đầu, hoặc mở nhánh đang đóng; vào trong: về cha', () => {
    expect(sel(navigate(layout, box('a'), 'ArrowRight'))).toBe('a1');
    expect(sel(navigate(layout, box('b'), 'ArrowRight'))).toBe('expand:b');
    expect(sel(navigate(layout, box('a1'), 'ArrowLeft'))).toBe('a');
    expect(sel(navigate(layout, box('l'), 'ArrowRight'))).toBe('r');
    expect(navigate(layout, box('a1'), 'ArrowRight')).toBeNull();
  });

  it('lên/xuống: cùng cha, cùng phía', () => {
    expect(sel(navigate(layout, box('a1'), 'ArrowDown'))).toBe('a2');
    expect(sel(navigate(layout, box('a2'), 'ArrowUp'))).toBe('a1');
    expect(navigate(layout, box('a2'), 'ArrowDown')).toBeNull();
    expect(sel(navigate(layout, box('a'), 'ArrowDown'))).toBe('b');
    expect(navigate(layout, box('l'), 'ArrowUp')).toBeNull();
  });
});
