import type { MindmapModel, MindNode } from '@archcode/core';
import {
  MIND_COLORS,
  MIND_DIRECTIONS,
  MIND_LINK_FIELDS,
  MIND_NODE_FIELDS,
  MIND_ROOT_FIELDS,
  MIND_STYLES,
} from '@archcode/core/canvas';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import { parseKeyLine } from './completion';

type MindContext = 'root' | 'node' | 'link';

const FIELDS: Record<MindContext, readonly string[]> = {
  root: MIND_ROOT_FIELDS,
  node: MIND_NODE_FIELDS,
  link: MIND_LINK_FIELDS,
};

/** Object chứa dòng hiện tại: cấp gốc, một node (dưới `root`) hay một link (dưới `links`). */
export function mindContextAt(state: EditorState, lineNumber: number, indent: number): MindContext {
  if (indent === 0) return 'root';
  let top: string | undefined;
  let target = indent;
  for (let n = lineNumber - 1; n >= 1 && target > 0; n--) {
    const parsed = parseKeyLine(state.doc.line(n).text);
    if (!parsed || parsed.keyIndent >= target) continue;
    top = parsed.key;
    target = parsed.dashIndent ?? parsed.keyIndent;
  }
  return top === 'links' ? 'link' : 'node';
}

function valueOptions(ctx: MindContext, key: string, model: MindmapModel | null): Completion[] {
  const enums = (values: readonly string[]) => values.map((label) => ({ label, type: 'enum' }));
  if (ctx === 'root') {
    if (key === 'style') return enums(MIND_STYLES);
    if (key === 'direction') return enums(MIND_DIRECTIONS);
    if (key === 'kind') return enums(['mindmap']);
    return [];
  }
  if (ctx === 'link') {
    if (key !== 'from' && key !== 'to') return [];
    // Chỉ node khai báo `id` rõ ràng mới làm đích của link.
    const ids: Completion[] = [];
    const visit = (node: MindNode) => {
      if (node.explicitId) ids.push({ label: node.id, detail: node.text, type: 'variable' });
      node.children.forEach(visit);
    };
    if (model) visit(model.root);
    return ids;
  }
  if (key === 'color') return enums(MIND_COLORS);
  if (key === 'side') return enums(['left', 'right']);
  if (key === 'collapsed') return enums(['true', 'false']);
  return [];
}

export function mindmapCompletion(getModel: () => MindmapModel | null) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = line.text.slice(0, ctx.pos - line.from);
    const indentOf = (text: string) => {
      const p = parseKeyLine(text);
      if (p) return p.keyIndent;
      return /^(\s*)(-\s+)?/.exec(text)![0].length;
    };

    const value = /(?:^|[\s{,-])([\w-]+)\s*:\s*['"]?([\w.-]*)$/.exec(before);
    if (value) {
      const where = mindContextAt(ctx.state, line.number, indentOf(line.text));
      const options = valueOptions(where, value[1]!, getModel());
      if (!options.length) return null;
      return { from: ctx.pos - value[2]!.length, options, validFor: /^[\w.-]*$/ };
    }

    const key = /^(\s*)(-\s+)?([\w-]*)$/.exec(before);
    if (key && (key[3] || ctx.explicit)) {
      const indent = key[1]!.length + (key[2]?.length ?? 0);
      const where = mindContextAt(ctx.state, line.number, indent);
      return {
        from: ctx.pos - key[3]!.length,
        options: FIELDS[where].map((p) => ({ label: p, apply: `${p}: `, type: 'property' })),
        validFor: /^[\w-]*$/,
      };
    }
    return null;
  };
}
