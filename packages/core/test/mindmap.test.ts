import { describe, expect, it } from 'vitest';
import {
  isMindmapSource,
  layoutMindmap,
  renderMindmapSvg,
  validateMindmap,
  type MindmapLayout,
} from '../src';
import { fixture, summarize } from './helpers';

const mm = (body: string) => `version: 1\nkind: mindmap\n${body}`;

function layoutOf(text: string): MindmapLayout {
  const { model } = validateMindmap(text);
  return layoutMindmap(model!);
}

const boxOf = (layout: MindmapLayout, id: string) => layout.boxes.find((b) => b.node.id === id)!;

describe('isMindmapSource', () => {
  it('nhận `kind: mindmap` ở cấp gốc', () => {
    expect(isMindmapSource(mm('root: A\n'))).toBe(true);
    expect(isMindmapSource("version: 1\nkind: 'mindmap' # comment\n")).toBe(true);
    expect(isMindmapSource('version: 1\nsystem:\n  kind: mindmap\n')).toBe(false);
    expect(isMindmapSource(fixture('document-platform.yaml'))).toBe(false);
  });
});

describe('validateMindmap', () => {
  it('fixture mẫu hợp lệ', () => {
    const { model, diagnostics } = validateMindmap(fixture('mindmap-launch.yaml'));
    expect(diagnostics).toEqual([]);
    expect(model!.root.text).toBe('Ra mắt Document Platform v2');
    expect(model!.root.children.map((c) => c.id)).toEqual(['marketing', 'tech', 'support', 'risk']);
    expect(model!.links).toHaveLength(1);
  });

  it('node dạng chuỗi và id sinh theo vị trí', () => {
    const { model } = validateMindmap(
      mm('root:\n  text: Gốc\n  children: [A, { text: B, children: [C] }]\n'),
    );
    const [a, b] = model!.root.children;
    expect(model!.root.id).toBe('~');
    expect([a!.id, a!.text, a!.explicitId]).toEqual(['~0', 'A', false]);
    expect(b!.children[0]!.id).toBe('~1.0');
    expect(b!.children[0]!.path).toEqual(['root', 'children', 1, 'children', 0]);
    expect(b!.children[0]!.depth).toBe(2);
  });

  it('root dạng chuỗi', () => {
    expect(validateMindmap(mm('root: Ý tưởng\n')).model!.root.text).toBe('Ý tưởng');
  });

  it('báo lỗi cấu trúc kèm dòng', () => {
    const { model, diagnostics } = validateMindmap(`version: 2
kind: mindmap
direction: both-ways
root:
  text: R
  colour: red
  children:
    - id: Bad ID
      text: X
    - color: purple
      text: Y
    - text: Z
      side: up
`);
    expect(model).not.toBeNull();
    expect(summarize(diagnostics)).toEqual([
      '1:unsupported-version',
      '3:schema-enum',
      '6:schema-unknown-field',
      '8:schema-pattern',
      '10:schema-enum',
      '13:schema-enum',
    ]);
    expect(diagnostics.find((d) => d.code === 'schema-unknown-field')!.hint).toBe(
      'Có phải ý bạn là "color"?',
    );
  });

  it('thiếu root → không có model', () => {
    const { model, diagnostics } = validateMindmap(mm(''));
    expect(model).toBeNull();
    expect(diagnostics.map((d) => d.code)).toEqual(['schema-required']);
  });

  it('YAML lỗi cú pháp → không có model', () => {
    expect(validateMindmap('root: [a\n').model).toBeNull();
  });

  it('side chỉ có tác dụng ở nhánh cấp 1', () => {
    const { model, diagnostics } = validateMindmap(
      mm(
        'root:\n  text: R\n  children:\n    - text: A\n      children:\n        - { text: B, side: left }\n',
      ),
    );
    expect(diagnostics.map((d) => [d.severity, d.code])).toEqual([['warning', 'schema-invalid']]);
    expect(model!.root.children[0]!.children[0]!.side).toBeUndefined();
  });

  it('trùng id, link tới id không tồn tại, link vào chính nó', () => {
    const { model, diagnostics } = validateMindmap(
      mm(`root:
  id: r
  text: R
  children:
    - { id: a, text: A }
    - { id: a, text: A2 }
    - B
links:
  - { from: a, to: r }
  - { from: aa, to: r }
  - { from: a, to: '~1' }
  - { from: r, to: r }
`),
    );
    expect(summarize(diagnostics)).toEqual([
      '8:duplicate-id',
      '12:unknown-reference',
      '13:unknown-reference',
      '14:self-loop',
    ]);
    expect(diagnostics[1]!.hint).toBe('Có phải ý bạn là "a"?');
    expect(diagnostics[2]!.hint).toContain('id');
    expect(model!.links.map((l) => `${l.from}->${l.to}`)).toEqual(['a->r']);
  });
});

describe('layoutMindmap', () => {
  it('deterministic', () => {
    const text = fixture('mindmap-launch.yaml');
    expect(layoutOf(text)).toEqual(layoutOf(text));
  });

  it('gốc ở tâm, nhánh chia hai phía, side khai báo được tôn trọng', () => {
    const layout = layoutOf(fixture('mindmap-launch.yaml'));
    const root = boxOf(layout, 'launch');
    expect(root.x + root.width / 2).toBe(0);
    expect(root.y + root.height / 2).toBe(0);
    expect(boxOf(layout, 'marketing').side).toBe('right');
    expect(boxOf(layout, 'risk').side).toBe('left');
    expect(boxOf(layout, 'risk').x + boxOf(layout, 'risk').width).toBeLessThan(root.x);
    expect(boxOf(layout, 'marketing').x).toBeGreaterThan(root.x + root.width);
  });

  it('direction LR / RL: mọi nhánh một phía (side bị bỏ qua)', () => {
    const body = 'root:\n  text: R\n  children: [A, B, { text: C, side: left }]\n';
    for (const [direction, side] of [
      ['LR', 'right'],
      ['RL', 'left'],
    ] as const) {
      const layout = layoutOf(mm(`direction: ${direction}\n${body}`));
      expect(new Set(layout.boxes.slice(1).map((b) => b.side))).toEqual(new Set([side]));
    }
  });

  it('con xếp từ trên xuống theo thứ tự khai báo, không chồng nhau', () => {
    const layout = layoutOf(fixture('mindmap-launch.yaml'));
    const boxes = layout.boxes;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap, `${a.node.text} ∩ ${b.node.text}`).toBe(false);
      }
    }
    const kids = ['load-test', 'migration'].map((id) => boxOf(layout, id));
    expect(kids[0]!.y).toBeLessThan(kids[1]!.y);
  });

  it('collapsed: ẩn con, đếm số node bị ẩn', () => {
    const layout = layoutOf(fixture('mindmap-launch.yaml'));
    const flag = layout.boxes.find((b) => b.node.text === 'Feature flag')!;
    expect(flag.hidden).toBe(2);
    expect(layout.boxes.some((b) => b.node.text === 'Search v2')).toBe(false);
  });

  it('options.collapsed ghi đè trạng thái trong YAML', () => {
    const { model } = validateMindmap(fixture('mindmap-launch.yaml'));
    const flag = (layout: MindmapLayout) =>
      layout.boxes.find((b) => b.node.text === 'Feature flag')!;
    // Mở nhánh đang thu gọn trong YAML.
    const opened = layoutMindmap(model!, { collapsed: () => false });
    expect(flag(opened).hidden).toBe(0);
    expect(opened.boxes.some((b) => b.node.text === 'Search v2')).toBe(true);
    // Thu gọn một nhánh cấp 1.
    const closed = layoutMindmap(model!, { collapsed: (n) => n.id === 'tech' || n.collapsed });
    expect(boxOf(closed, 'tech').hidden).toBe(5);
    expect(closed.boxes.some((b) => b.node.id === 'migration')).toBe(false);
    // Màu nhánh khác không nhảy khi thu gọn.
    expect(boxOf(closed, 'support').color).toBe('orange');
  });

  it('childCount: số con trực tiếp, kể cả khi đang thu gọn', () => {
    const layout = layoutOf(fixture('mindmap-launch.yaml'));
    expect(boxOf(layout, 'launch').childCount).toBe(4);
    expect(layout.boxes.find((b) => b.node.text === 'Feature flag')!.childCount).toBe(2);
    expect(boxOf(layout, 'load-test').childCount).toBe(0);
  });

  it('màu: tự gán theo nhánh cấp 1, khai báo thì ghi đè, con kế thừa', () => {
    const layout = layoutOf(fixture('mindmap-launch.yaml'));
    expect(boxOf(layout, 'launch').color).toBeUndefined();
    expect(boxOf(layout, 'marketing').color).toBe('blue');
    expect(boxOf(layout, 'tech').color).toBe('violet');
    expect(boxOf(layout, 'migration').color).toBe('violet');
    // violet đã được "tech" chọn → nhánh tự gán bỏ qua violet.
    expect(boxOf(layout, 'support').color).toBe('orange');
    expect(boxOf(layout, 'risk').color).toBe('green');
  });

  it('thêm node ở phía phải không làm phía trái đổi chỗ', () => {
    const base =
      'root:\n  text: R\n  children:\n    - { text: A, children: [a1] }\n    - { id: l, text: L, side: left, children: [l1, l2] }\n';
    const more = base.replace('[a1]', '[a1, a2, a3, a4]');
    const left = (text: string) =>
      layoutOf(mm(text))
        .boxes.filter((b) => b.side === 'left')
        .map((b) => [b.x, b.y]);
    expect(left(more)).toEqual(left(base));
  });

  it('cây rỗng chỉ có gốc', () => {
    const layout = layoutOf(mm('root: Một mình\n'));
    expect(layout.boxes).toHaveLength(1);
    expect(layout.branches).toEqual([]);
  });
});

describe('style notebook', () => {
  it('validate: mặc định LR, expandDepth 1; khai báo thì ghi đè', () => {
    const { model, diagnostics } = validateMindmap(fixture('mindmap-notebook.yaml'));
    expect(diagnostics).toEqual([]);
    expect([model!.style, model!.direction, model!.expandDepth]).toEqual(['notebook', 'LR', 2]);
    const bare = validateMindmap(mm('style: notebook\nroot: R\n')).model!;
    expect([bare.direction, bare.expandDepth]).toEqual(['LR', 1]);
    const classic = validateMindmap(mm('root: R\n')).model!;
    expect([classic.style, classic.direction, classic.expandDepth]).toEqual([
      'classic',
      'both',
      undefined,
    ]);
  });

  it('validate: giá trị sai', () => {
    const { diagnostics } = validateMindmap(mm('style: notebok\nexpandDepth: -1\nroot: R\n'));
    expect(diagnostics.map((d) => [d.code, d.hint ?? d.message])).toEqual([
      ['schema-enum', 'Có phải ý bạn là "notebook"?'],
      ['schema-type', '"expandDepth" phải là số nguyên ≥ 0'],
    ]);
  });

  it('expandDepth: node sâu hơn đóng sẵn; collapsed trong YAML vẫn được tôn trọng', () => {
    const layout = layoutOf(fixture('mindmap-notebook.yaml'));
    // Tầng 0–2 hiện, tầng 3 ẩn.
    expect(Math.max(...layout.boxes.map((b) => b.node.depth))).toBe(2);
    expect(boxOf(layout, 'bounded-context').hidden).toBe(2);
    expect(boxOf(layout, 'ubiquitous').hidden).toBe(0);
    const depth1 = layoutOf(
      mm('style: notebook\nroot:\n  text: R\n  children: [{ text: A, children: [a] }]\n'),
    );
    expect(depth1.boxes).toHaveLength(2);
  });

  it('mọi node là khối, một phía, màu theo tầng; color khai báo được kế thừa', () => {
    const layout = layoutOf(fixture('mindmap-notebook.yaml'));
    expect(new Set(layout.boxes.map((b) => b.shape))).toEqual(new Set(['box']));
    expect(new Set(layout.boxes.slice(1).map((b) => b.side))).toEqual(new Set(['right']));
    expect(boxOf(layout, 'strategic').color).toBe('indigo');
    expect(boxOf(layout, 'tactical').color).toBe('indigo');
    expect(boxOf(layout, 'aggregate').color).toBe('teal');
    expect(boxOf(layout, 'practice').color).toBe('red');
    const arch = layout.boxes.find((b) => b.node.text === 'Kiến trúc')!;
    expect(arch.color).toBe('red');
  });

  it('nhánh neo ở giữa mép node (không neo ở đáy như gạch chân)', () => {
    const layout = layoutOf(fixture('mindmap-notebook.yaml'));
    const b = layout.branches.find((x) => x.child.node.id === 'aggregate')!;
    expect(b.to.y).toBe(b.child.y + b.child.height / 2);
  });

  it('SVG: nhánh phụ vẽ dạng khối', () => {
    const { model } = validateMindmap(fixture('mindmap-notebook.yaml'));
    const svg = renderMindmapSvg(layoutMindmap(model!));
    expect(svg).toMatch(
      /class="ac-mm-node ac-mm-d2 ac-mm-c-teal ac-mm-boxed[^"]*"[^>]*><title>[^<]*<\/title><rect/,
    );
    expect(svg).toMatchSnapshot();
  });
});

describe('renderMindmapSvg', () => {
  const svgOf = (text: string) => {
    const { model, diagnostics } = validateMindmap(text);
    return renderMindmapSvg(layoutMindmap(model!), { diagnostics });
  };

  it('SVG độc lập: node, nhánh, link, huy hiệu thu gọn', () => {
    const svg = svgOf(fixture('mindmap-launch.yaml'));
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" class="ac-diagram ac-mindmap"/,
    );
    expect(svg).toContain('<style>');
    expect(svg).toContain('data-kind="mind-node" data-id="launch"');
    expect(svg).toContain('data-link="document-db"');
    expect(svg.match(/class="ac-mm-branch/g)).toHaveLength(14);
    expect(svg).toContain('data-kind="mind-link" data-from="risk" data-to="migration"');
    expect(svg).toContain('>giảm thiểu</text>');
    expect(svg).toContain('>+2</text>');
    expect(svg).toContain('ac-mm-c-violet');
  });

  it('escape nội dung người dùng', () => {
    const svg = svgOf(mm(`root:\n  text: '<script>x</script>'\n  note: '" onload="alert(1)'\n`));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('" onload="');
  });

  it('tô node có lỗi', () => {
    const svg = svgOf(mm('root:\n  text: R\n  children:\n    - { text: A, color: purple }\n'));
    expect(svg).toMatch(/class="ac-mm-node ac-mm-d1[^"]*ac-error"/);
  });

  it('standalone: false bỏ xmlns và <style>', () => {
    const { model } = validateMindmap(mm('root: R\n'));
    const svg = renderMindmapSvg(layoutMindmap(model!), { standalone: false });
    expect(svg).not.toContain('xmlns');
    expect(svg).not.toContain('<style>');
  });
});
