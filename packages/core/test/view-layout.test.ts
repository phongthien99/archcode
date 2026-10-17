import { describe, expect, it } from 'vitest';
import { layoutView, resolveView, validate } from '../src';
import { summarize, withoutRules, yaml } from './helpers';

const chain = `components:
  - { id: a, type: service, name: A }
  - { id: b, type: service, name: B }
  - { id: c, type: service, name: C }
relationships:
  - { from: a, to: b }
  - { from: b, to: c }
`;

const check = (views: string) => {
  const { model, diagnostics } = validate(yaml(chain + views));
  return { model: model!, diagnostics: withoutRules(diagnostics) };
};

describe('khối layout của view', () => {
  it('không khai báo → mặc định layered / TB / orthogonal', () => {
    const { model, diagnostics } = check('');
    expect(diagnostics).toEqual([]);
    expect(model.views[0]!.layout).toEqual({
      algorithm: 'layered',
      direction: 'TB',
      edges: 'orthogonal',
    });
  });

  it('đọc đủ algorithm, direction, edges, root', () => {
    const { model, diagnostics } = check(`views:
  - id: v
    name: V
    layout: { algorithm: tree, direction: RL, edges: splines, root: b }
`);
    expect(diagnostics).toEqual([]);
    expect(model.views[0]!.layout).toEqual({
      algorithm: 'tree',
      direction: 'RL',
      edges: 'splines',
      root: 'b',
    });
  });

  it('cú pháp cũ: direction ở cấp view vẫn dùng được, kể cả BT', () => {
    const { model, diagnostics } = check(`views:
  - { id: v, name: V, direction: BT }
`);
    expect(diagnostics).toEqual([]);
    expect(model.views[0]!.layout.direction).toBe('BT');
  });

  it('khai báo direction ở cả hai nơi → lỗi xung đột, layout.direction thắng', () => {
    const { model, diagnostics } = check(`views:
  - id: v
    name: V
    direction: LR
    layout:
      direction: BT
`);
    expect(summarize(diagnostics)).toEqual(['15:layout-option-conflict']);
    expect(diagnostics[0]!.related?.[0]?.line).toBe(17);
    expect(model.views[0]!.layout.direction).toBe('BT');
  });

  it('giá trị lạ và trường lạ bị schema từ chối', () => {
    const { diagnostics } = check(`views:
  - id: v
    name: V
    layout: { algorithm: dagre, edges: curvy, spacing: 10 }
`);
    expect(diagnostics.map((d) => d.code).sort()).toEqual([
      'schema-enum',
      'schema-enum',
      'schema-unknown-field',
    ]);
  });

  it('auto-layout theo 4 hướng: chuỗi a → b → c đi đúng chiều', async () => {
    const order = async (direction: string) => {
      const { model } = check(`views:
  - { id: v, name: V, layout: { direction: ${direction} } }
`);
      const { nodes } = await layoutView(resolveView(model, model.views[0]!));
      const at = (id: string) => nodes.find((n) => n.component.id === id)!;
      return [at('a'), at('b'), at('c')];
    };
    const [tb, bt, lr, rl] = await Promise.all(['TB', 'BT', 'LR', 'RL'].map(order));
    expect(tb[0]!.y).toBeLessThan(tb[2]!.y);
    expect(bt[0]!.y).toBeGreaterThan(bt[2]!.y);
    expect(lr[0]!.x).toBeLessThan(lr[2]!.x);
    expect(rl[0]!.x).toBeGreaterThan(rl[2]!.x);
  });
});
