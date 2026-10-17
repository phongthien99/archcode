import { ID_PATTERN, SCHEMA_VERSION } from '../constants';
import { isObj } from '../parser/normalize';
import { parseYaml, type ParsedYaml } from '../parser/parse';
import { keyRefOf, sourceRefOf } from '../parser/sourceRef';
import type { Diagnostic, YamlPath } from '../types';
import { closestMatch, didYouMean } from '../util/strings';
import { sortDiagnostics } from '../validator';
import {
  MIND_COLORS,
  MIND_DIRECTIONS,
  type MindColor,
  type MindDirection,
  type MindLink,
  type MindmapValidationResult,
  type MindNode,
  type MindSide,
} from './types';

const ROOT_FIELDS = ['version', 'kind', 'direction', 'root', 'links'];
const NODE_FIELDS = [
  'id',
  'text',
  'note',
  'color',
  'side',
  'collapsed',
  'tags',
  'link',
  'children',
];
const LINK_FIELDS = ['from', 'to', 'label'];
/** Chặn cây sâu bất thường (ví dụ sinh tự động) làm tràn stack khi layout/render. */
const MAX_DEPTH = 64;

/**
 * Pipeline validate cho file mind map: YAML → cấu trúc → model → tham chiếu.
 * Khoan dung như `validate()`: node lỗi vẫn được giữ nếu đủ để vẽ, chỉ kèm diagnostic.
 */
export function validateMindmap(text: string): MindmapValidationResult {
  const parsed = parseYaml(text);
  if (!parsed.ok) return { model: null, diagnostics: sortDiagnostics(parsed.diagnostics) };

  const diagnostics: Diagnostic[] = [...parsed.diagnostics];
  const data: unknown = parsed.doc.toJS();
  if (!isObj(data)) {
    diagnostics.push({
      severity: 'error',
      code: 'empty-document',
      message: 'File rỗng hoặc gốc không phải object YAML (cần có "version", "kind" và "root")',
      line: 1,
      column: 1,
    });
    return { model: null, diagnostics: sortDiagnostics(diagnostics) };
  }

  const report = new Reporter(parsed, diagnostics);
  report.unknownFields(data, [], ROOT_FIELDS, 'file mind map');

  if (data.version === undefined) report.required([], 'version');
  else if (data.version !== SCHEMA_VERSION) {
    report.error(['version'], 'unsupported-version', `Chỉ hỗ trợ "version: ${SCHEMA_VERSION}"`);
  }
  if (data.kind !== 'mindmap') {
    report.error(['kind'], 'schema-enum', '"kind" phải là "mindmap"');
  }

  let direction: MindDirection = 'both';
  if (data.direction !== undefined) {
    if (MIND_DIRECTIONS.includes(data.direction as MindDirection)) {
      direction = data.direction as MindDirection;
    } else report.enumError(['direction'], data.direction, MIND_DIRECTIONS);
  }

  if (data.root === undefined) {
    report.required([], 'root');
    return { model: null, diagnostics: sortDiagnostics(diagnostics) };
  }

  const ids = new Map<string, MindNode>();
  const root = readNode(data.root, ['root'], '~', 0, report, ids);
  if (!root) return { model: null, diagnostics: sortDiagnostics(diagnostics) };

  const links = readLinks(data.links, report, ids);
  return {
    model: { version: SCHEMA_VERSION, kind: 'mindmap', direction, root, links },
    diagnostics: sortDiagnostics(diagnostics),
  };
}

function readNode(
  raw: unknown,
  path: YamlPath,
  implicitId: string,
  depth: number,
  report: Reporter,
  ids: Map<string, MindNode>,
): MindNode | undefined {
  // Dạng rút gọn: `- Blog post` thay cho `- text: Blog post`.
  if (typeof raw === 'string' || typeof raw === 'number') {
    return {
      id: implicitId,
      explicitId: false,
      text: String(raw),
      collapsed: false,
      tags: [],
      children: [],
      depth,
      path,
      source: report.ref(path),
    };
  }
  if (!isObj(raw)) {
    report.error(path, 'schema-type', 'Node phải là chuỗi hoặc object có "text"');
    return undefined;
  }
  report.unknownFields(raw, path, NODE_FIELDS, 'node');

  let id = implicitId;
  let explicitId = false;
  if (raw.id !== undefined) {
    if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) {
      report.error(
        [...path, 'id'],
        'schema-pattern',
        '"id" chỉ gồm chữ thường, số, ".", "_", "-" và bắt đầu bằng chữ hoặc số',
      );
    } else {
      id = raw.id;
      explicitId = true;
    }
  }

  let text = scalar(raw.text);
  if (text === undefined) {
    if (raw.text === undefined) report.required(path, 'text');
    else report.error([...path, 'text'], 'schema-type', '"text" phải là chuỗi');
    text = explicitId ? id : '';
  }

  let color: MindColor | undefined;
  if (raw.color !== undefined) {
    if (MIND_COLORS.includes(raw.color as MindColor)) color = raw.color as MindColor;
    else report.enumError([...path, 'color'], raw.color, MIND_COLORS);
  }

  let side: MindSide | undefined;
  if (raw.side !== undefined) {
    if (raw.side === 'left' || raw.side === 'right') side = raw.side;
    else report.enumError([...path, 'side'], raw.side, ['left', 'right']);
    if (side && depth !== 1) {
      report.warning(
        [...path, 'side'],
        'schema-invalid',
        '"side" chỉ có tác dụng với nhánh cấp 1 (con trực tiếp của root) và sẽ bị bỏ qua',
      );
      side = undefined;
    }
  }

  if (raw.collapsed !== undefined && typeof raw.collapsed !== 'boolean') {
    report.error([...path, 'collapsed'], 'schema-type', '"collapsed" phải là true hoặc false');
  }

  const tags: string[] = [];
  if (raw.tags !== undefined) {
    if (Array.isArray(raw.tags)) {
      raw.tags.forEach((tag, i) => {
        const value = scalar(tag);
        if (value === undefined) {
          report.error([...path, 'tags', i], 'schema-type', 'Tag phải là chuỗi');
        } else tags.push(value);
      });
    } else report.error([...path, 'tags'], 'schema-type', '"tags" phải là danh sách');
  }

  let link: string | undefined;
  if (raw.link !== undefined) {
    if (typeof raw.link === 'string' && ID_PATTERN.test(raw.link)) link = raw.link;
    else report.error([...path, 'link'], 'schema-pattern', '"link" phải là ID component hợp lệ');
  }

  const node: MindNode = {
    id,
    explicitId,
    text,
    note: scalar(raw.note),
    color,
    side,
    collapsed: raw.collapsed === true,
    tags,
    link,
    children: [],
    depth,
    path,
    source: report.ref(path),
  };

  if (explicitId) {
    const first = ids.get(id);
    if (first) {
      report.error([...path, 'id'], 'duplicate-id', `ID "${id}" bị trùng`, [
        { message: `"${id}" khai báo lần đầu`, ...first.source! },
      ]);
    } else ids.set(id, node);
  }

  if (raw.children !== undefined) {
    if (!Array.isArray(raw.children)) {
      report.error([...path, 'children'], 'schema-type', '"children" phải là danh sách');
    } else if (depth + 1 > MAX_DEPTH) {
      report.error([...path, 'children'], 'schema-invalid', `Cây sâu quá ${MAX_DEPTH} cấp`);
    } else {
      raw.children.forEach((child, i) => {
        const childId = implicitId === '~' ? `~${i}` : `${implicitId}.${i}`;
        const kid = readNode(child, [...path, 'children', i], childId, depth + 1, report, ids);
        if (kid) node.children.push(kid);
      });
    }
  }
  return node;
}

function readLinks(raw: unknown, report: Reporter, ids: Map<string, MindNode>): MindLink[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    report.error(['links'], 'schema-type', '"links" phải là danh sách');
    return [];
  }
  const links: MindLink[] = [];
  raw.forEach((item, i) => {
    const path: YamlPath = ['links', i];
    if (!isObj(item)) {
      report.error(path, 'schema-type', 'Link phải là object có "from" và "to"');
      return;
    }
    report.unknownFields(item, path, LINK_FIELDS, 'link');
    const from = scalar(item.from);
    const to = scalar(item.to);
    if (from === undefined) report.required(path, 'from');
    if (to === undefined) report.required(path, 'to');
    if (from === undefined || to === undefined) return;

    let ok = true;
    for (const [key, id] of [
      ['from', from],
      ['to', to],
    ] as const) {
      if (ids.has(id)) continue;
      ok = false;
      report.error(
        [...path, key],
        'unknown-reference',
        `Không có node nào có id "${id}"`,
        undefined,
        didYouMean(id, ids.keys()) ?? 'Chỉ node khai báo "id" rõ ràng mới làm đích của link được',
      );
    }
    if (from === to) {
      ok = false;
      report.error(path, 'self-loop', `Link "${from}" trỏ vào chính nó`);
    }
    if (ok) links.push({ from, to, label: scalar(item.label), path, source: report.ref(path) });
  });
  return links;
}

function scalar(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

class Reporter {
  constructor(
    private parsed: ParsedYaml,
    private out: Diagnostic[],
  ) {}

  ref(path: YamlPath) {
    return sourceRefOf(this.parsed, path);
  }

  error(
    path: YamlPath,
    code: Diagnostic['code'],
    message: string,
    related?: Diagnostic['related'],
    hint?: string,
  ) {
    this.out.push({ severity: 'error', code, message, hint, related, path, ...this.ref(path) });
  }

  warning(path: YamlPath, code: Diagnostic['code'], message: string) {
    this.out.push({ severity: 'warning', code, message, path, ...this.ref(path) });
  }

  required(path: YamlPath, field: string) {
    this.error(path, 'schema-required', `Thiếu trường bắt buộc "${field}"`);
  }

  enumError(path: YamlPath, value: unknown, allowed: readonly string[]) {
    const suggestion = typeof value === 'string' ? closestMatch(value, allowed) : undefined;
    this.out.push({
      severity: 'error',
      code: 'schema-enum',
      message: `"${String(path[path.length - 1])}" không hợp lệ: ${JSON.stringify(value)}`,
      hint: suggestion
        ? `Có phải ý bạn là "${suggestion}"?`
        : `Giá trị hợp lệ: ${allowed.join(', ')}`,
      path,
      ...this.ref(path),
    });
  }

  unknownFields(raw: Record<string, unknown>, path: YamlPath, known: string[], where: string) {
    for (const key of Object.keys(raw)) {
      if (known.includes(key)) continue;
      const keyPath = [...path, key];
      const suggestion = closestMatch(key, known);
      this.out.push({
        severity: 'warning',
        code: 'schema-unknown-field',
        message: `Trường "${key}" không được hỗ trợ trong ${where} và sẽ bị bỏ qua`,
        hint: suggestion
          ? `Có phải ý bạn là "${suggestion}"?`
          : `Trường hợp lệ: ${known.join(', ')}`,
        path: keyPath,
        ...keyRefOf(this.parsed, keyPath),
      });
    }
  }
}
