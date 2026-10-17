import type { ArchitectureModel } from '@archcode/core';
import {
  COMPONENT_TYPES,
  EDGE_STYLES,
  LAYOUT_ALGORITHMS,
  RELATIONSHIP_TYPES,
} from '@archcode/core/constants';
import schema from '@archcode/core/schema.json';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';

type Definition =
  | 'root'
  | 'system'
  | 'group'
  | 'component'
  | 'relationship'
  | 'view'
  | 'viewLayout'
  | 'rule'
  | 'matcher';

const SECTION_DEFINITION: Record<string, Definition> = {
  groups: 'group',
  components: 'component',
  relationships: 'relationship',
  views: 'view',
  rules: 'rule',
  system: 'system',
};

/** Thuộc tính hợp lệ của từng loại object, lấy thẳng từ JSON Schema (một nguồn sự thật). */
function propertiesOf(def: Definition): string[] {
  const s = schema as unknown as {
    properties: Record<string, unknown>;
    definitions: Record<string, { properties?: Record<string, unknown> }>;
  };
  if (def === 'root') return Object.keys(s.properties);
  if (def === 'system')
    return Object.keys((s.properties.system as { properties: object }).properties);
  return Object.keys(s.definitions[def]?.properties ?? {});
}

interface KeyLine {
  keyIndent: number;
  dashIndent?: number;
  key: string;
}

function parseKeyLine(text: string): KeyLine | undefined {
  const m = /^(\s*)(-\s+)?([\w-]+)\s*:/.exec(text);
  if (!m) return undefined;
  const lead = m[1]!.length;
  return m[2]
    ? { dashIndent: lead, keyIndent: lead + m[2].length, key: m[3]! }
    : { keyIndent: lead, key: m[3]! };
}

/**
 * Xác định object YAML chứa dòng hiện tại bằng cách lần ngược các key cha theo thụt lề.
 * Đủ chính xác cho autocomplete mà không cần AST hợp lệ (người dùng đang gõ dở).
 */
export function contextAt(state: EditorState, lineNumber: number, indent: number): Definition {
  const ancestors: string[] = [];
  let target = indent;
  for (let n = lineNumber - 1; n >= 1 && target > 0; n--) {
    const parsed = parseKeyLine(state.doc.line(n).text);
    if (!parsed || parsed.keyIndent >= target) continue;
    ancestors.unshift(parsed.key);
    target = parsed.dashIndent ?? parsed.keyIndent;
  }
  if (!ancestors.length) return 'root';
  const last = ancestors[ancestors.length - 1]!;
  if ((last === 'from' || last === 'to') && ancestors.includes('rules')) return 'matcher';
  if (last === 'layout' && ancestors.includes('views')) return 'viewLayout';
  return (
    SECTION_DEFINITION[last] ??
    (ancestors[0] === 'system' && ancestors.length === 1 ? 'system' : 'root')
  );
}

function valueOptions(def: Definition, key: string, model: ArchitectureModel | null): Completion[] {
  const ids = (items: { id: string; name: string }[], type: string) =>
    items.map((i) => ({ label: i.id, detail: i.name !== i.id ? i.name : undefined, type }));
  const enums = (values: readonly string[]) => values.map((label) => ({ label, type: 'enum' }));
  const components = model?.components ?? [];
  const groups = model?.groups ?? [];

  switch (key) {
    case 'type':
      if (def === 'component' || def === 'matcher') return enums(COMPONENT_TYPES);
      if (def === 'relationship') return enums(RELATIONSHIP_TYPES);
      if (def === 'rule') return enums(['no-circular', 'no-orphan', 'forbidden']);
      if (def === 'group') return enums(['domain', 'cluster', 'network', 'trust-zone']);
      return [];
    case 'severity':
      return enums(['error', 'warning']);
    case 'direction':
      return enums(['TB', 'LR', 'BT', 'RL']);
    case 'algorithm':
      return def === 'viewLayout' ? enums(LAYOUT_ALGORITHMS) : [];
    case 'edges':
      return def === 'viewLayout' ? enums(EDGE_STYLES) : [];
    case 'root':
      return def === 'viewLayout' ? ids(components, 'variable') : [];
    case 'unless':
      return enums(['same-group']);
    case 'from':
    case 'to':
      return def === 'relationship' ? ids(components, 'variable') : [];
    case 'group':
      return def === 'component' || def === 'matcher' ? ids(groups, 'namespace') : [];
    case 'parent':
      return def === 'group' ? ids(groups, 'namespace') : [];
    case 'id':
      return def === 'matcher' ? ids(components, 'variable') : [];
    default:
      return [];
  }
}

function selectorOptions(model: ArchitectureModel | null): Completion[] {
  return [
    { label: '*', detail: 'mọi component', type: 'keyword' },
    ...(model?.components ?? []).map((c) => ({ label: c.id, detail: c.name, type: 'variable' })),
    ...(model?.groups ?? []).map((g) => ({
      label: `group:${g.id}`,
      detail: g.name,
      type: 'namespace',
    })),
    ...COMPONENT_TYPES.map((t) => ({ label: `type:${t}`, type: 'enum' })),
  ];
}

export function yamlCompletion(getModel: () => ArchitectureModel | null) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = line.text.slice(0, ctx.pos - line.from);
    const indentOf = (text: string) => {
      const p = parseKeyLine(text);
      if (p) return p.keyIndent;
      const m = /^(\s*)(-\s+)?/.exec(text)!;
      return m[0].length;
    };

    // Selector trong include/exclude dạng flow: include: ['*', group:co|
    const selector = /(?:include|exclude)\s*:\s*\[[^\]]*?['"]?([\w.:*-]*)$/.exec(before);
    if (selector) {
      return {
        from: ctx.pos - selector[1]!.length,
        options: selectorOptions(getModel()),
        validFor: /^[\w.:*-]*$/,
      };
    }

    // Giá trị: `key: partial` (cả block lẫn flow `{ from: ap`).
    const value = /(?:^|[\s{,-])([\w-]+)\s*:\s*['"]?([\w.:-]*)$/.exec(before);
    if (value) {
      const def = contextAt(ctx.state, line.number, indentOf(line.text));
      const flowDef = /\{[^}]*$/.test(before) ? flowContext(ctx.state, line.number, def) : def;
      const options = valueOptions(flowDef, value[1]!, getModel());
      if (!options.length) return null;
      return { from: ctx.pos - value[2]!.length, options, validFor: /^[\w.:-]*$/ };
    }

    // Key: dòng chỉ có (`- `) + từ đang gõ.
    const key = /^(\s*)(-\s+)?([\w-]*)$/.exec(before);
    if (key && (key[3] || ctx.explicit)) {
      const indent = key[1]!.length + (key[2]?.length ?? 0);
      const def = contextAt(ctx.state, line.number, indent);
      return {
        from: ctx.pos - key[3]!.length,
        options: propertiesOf(def).map((p) => ({ label: p, apply: `${p}: `, type: 'property' })),
        validFor: /^[\w-]*$/,
      };
    }
    return null;
  };
}

/** Dòng flow `- { from: a, to: b }` nằm trực tiếp dưới section → object là item của section. */
function flowContext(state: EditorState, lineNumber: number, def: Definition): Definition {
  if (def !== 'root') return def;
  for (let n = lineNumber - 1; n >= 1; n--) {
    const parsed = parseKeyLine(state.doc.line(n).text);
    if (parsed && parsed.keyIndent === 0) return SECTION_DEFINITION[parsed.key] ?? 'root';
  }
  return def;
}
