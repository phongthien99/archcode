import { validateMindmap } from '@archcode/core';
import { describe, expect, it } from 'vitest';
import { expandToDepth, isCollapsed, maxDepth, pruneCollapsed, setAll } from './collapse';

const model = validateMindmap(`version: 1
kind: mindmap
root:
  id: r
  text: R
  children:
    - id: a
      text: A
      children:
        - id: a1
          text: A1
          collapsed: true
          children: [x, y]
    - B
`).model!;

describe('mind map collapse', () => {
  it('ghi đè YAML; không ghi đè thì theo YAML', () => {
    const a1 = model.root.children[0]!.children[0]!;
    expect(isCollapsed(model, a1, {})).toBe(true);
    expect(isCollapsed(model, a1, { a1: false })).toBe(false);
    // expandDepth: node từ tầng đó trở xuống đóng sẵn.
    const a = model.root.children[0]!;
    expect(isCollapsed({ ...model, expandDepth: 1 }, a, {})).toBe(true);
    expect(isCollapsed({ ...model, expandDepth: 1 }, a, { a: false })).toBe(false);
  });

  it('mở/đóng tất cả — gốc luôn mở, bỏ qua lá', () => {
    expect(setAll(model, true)).toEqual({ r: false, a: true, a1: true });
    expect(setAll(model, false)).toEqual({ r: false, a: false, a1: false });
  });

  it('mở tới tầng N', () => {
    expect(expandToDepth(model, 1)).toEqual({ r: false, a: true, a1: true });
    expect(expandToDepth(model, 2)).toEqual({ r: false, a: false, a1: true });
    expect(maxDepth(model)).toBe(3);
  });

  it('bỏ id không còn tồn tại', () => {
    const same = { a: true };
    expect(pruneCollapsed(model, same)).toBe(same);
    expect(pruneCollapsed(model, { a: true, gone: false })).toEqual({ a: true });
  });
});
