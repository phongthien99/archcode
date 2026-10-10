import {
  isMap,
  isScalar,
  isSeq,
  type Document,
  type Node,
  type Pair,
  type Scalar,
  type YAMLMap,
} from 'yaml';
import { ID_PATTERN } from '../constants';
import { isObj, normalize } from '../parser/normalize';
import { parseYaml } from '../parser/parse';
import type { ArchitectureModel, YamlPath } from '../types';
import {
  appendMapItem,
  blockItemText,
  deletePair,
  deleteSeqItems,
  findPair,
  insertPair,
  replaceScalar,
  setMapValue,
  TextPatcher,
  type Entry,
  type TextChange,
} from './text';

export type EditableKind = 'component' | 'relationship' | 'group';

export interface ElementRef {
  kind: EditableKind;
  id: string;
}

export interface ComponentInput {
  id?: string;
  type: string;
  name?: string;
  group?: string;
  technology?: string;
  description?: string;
  owner?: string;
  tags?: string[];
}

export interface RelationshipInput {
  from: string;
  to: string;
  type?: string;
  label?: string;
  description?: string;
  technology?: string;
}

export interface GroupInput {
  id?: string;
  name?: string;
  type?: string;
  description?: string;
  parent?: string;
}

/** Thao tác sửa mô hình từ canvas. Mỗi lệnh = một thay đổi tối thiểu trên text YAML. */
export type Command =
  | { type: 'addComponent'; component: ComponentInput }
  | { type: 'updateField'; target: ElementRef; field: string; value: string | string[] | null }
  | { type: 'deleteComponent'; id: string }
  | { type: 'renameId'; kind: 'component' | 'group'; from: string; to: string }
  | { type: 'addRelationship'; relationship: RelationshipInput }
  | { type: 'updateRelationship'; id: string; from?: string; to?: string }
  | { type: 'deleteRelationship'; id: string }
  | { type: 'addGroup'; group: GroupInput }
  | { type: 'deleteGroup'; id: string };

export type CommandType = Command['type'];

/** Tham chiếu còn sót trong views/rules sau khi xóa — UI dùng để cảnh báo. */
export interface DanglingReference {
  kind: 'view' | 'rule';
  /** ID của view/rule chứa tham chiếu. */
  id: string;
  /** Giá trị tham chiếu, ví dụ `api-gateway`, `group:core`. */
  value: string;
  line?: number;
  column?: number;
}

export type MutationResult =
  | {
      ok: true;
      text: string;
      /** Thay đổi tối thiểu trên text gốc, áp dụng thẳng vào editor được. */
      changes: TextChange[];
      /** Phần tử nên được chọn sau lệnh (phần tử vừa tạo / đổi tên). */
      select?: ElementRef;
      /** Phần tử bị xóa theo (ví dụ quan hệ của component bị xóa). */
      removed: ElementRef[];
      references: DanglingReference[];
    }
  | { ok: false; error: string };

/** Thứ tự key chuẩn khi chèn field mới. */
export const COMPONENT_FIELDS = [
  'id',
  'name',
  'type',
  'group',
  'technology',
  'description',
  'owner',
  'tags',
] as const;
export const RELATIONSHIP_FIELDS = [
  'id',
  'from',
  'to',
  'type',
  'label',
  'description',
  'technology',
] as const;
export const GROUP_FIELDS = ['id', 'name', 'type', 'description', 'parent'] as const;
const ROOT_ORDER = ['version', 'system', 'groups', 'components', 'relationships', 'views', 'rules'];
const SYSTEM_ORDER = ['id', 'name', 'description', 'groups', 'components', 'relationships'];

const FIELDS: Record<EditableKind, readonly string[]> = {
  component: COMPONENT_FIELDS,
  relationship: RELATIONSHIP_FIELDS,
  group: GROUP_FIELDS,
};
const REQUIRED: Record<EditableKind, readonly string[]> = {
  component: ['type'],
  relationship: ['from', 'to'],
  group: ['name'],
};
const SECTION: Record<EditableKind, 'components' | 'relationships' | 'groups'> = {
  component: 'components',
  relationship: 'relationships',
  group: 'groups',
};

class CommandError extends Error {}

const fail = (message: string): never => {
  throw new CommandError(message);
};

/**
 * Áp một lệnh lên text YAML. Chỉ sửa đúng đoạn liên quan: comment, format và phần còn lại
 * giữ nguyên từng byte. Lệnh không hợp lệ trả `{ ok: false }` và không đổi text.
 */
export function applyCommand(text: string, command: Command): MutationResult {
  try {
    checkCommand(command);
    const ctx = createContext(text);
    const outcome = run(ctx, command);
    const { text: next, changes } = ctx.p.build();
    if (changes.length && !parseYaml(next).ok) {
      return { ok: false, error: 'Lỗi nội bộ: kết quả sửa không còn là YAML hợp lệ' };
    }
    // Vị trí tham chiếu tính trên text mới (UI hiển thị sau khi áp lệnh).
    for (const ref of outcome.references ?? [])
      Object.assign(ref, lineColumn(next, mapOffset(ref.offset, changes)));
    const select =
      outcome.select ??
      (outcome.selectNewRelationship
        ? newRelationship(next, outcome.selectNewRelationship)
        : undefined);
    return {
      ok: true,
      text: next,
      changes,
      select,
      removed: outcome.removed ?? [],
      references: (outcome.references ?? []).map(({ offset: _, ...ref }) => ref),
    };
  } catch (err) {
    if (err instanceof CommandError) return { ok: false, error: err.message };
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Kiểm tra tham số

function checkCommand(command: Command): void {
  if (!command || typeof command !== 'object') fail('Lệnh không hợp lệ');
  const str = (value: unknown, name: string) => {
    if (typeof value !== 'string' || !value.trim()) fail(`Thiếu "${name}"`);
  };
  const optStr = (value: unknown, name: string) => {
    if (value !== undefined && typeof value !== 'string') fail(`"${name}" phải là chuỗi`);
  };
  switch (command.type) {
    case 'addComponent': {
      const c = command.component;
      if (!c || typeof c !== 'object') fail('Thiếu thông tin component');
      str(c.type, 'type');
      for (const key of ['id', 'name', 'group', 'technology', 'description', 'owner'] as const)
        optStr(c[key], key);
      if (
        c.tags !== undefined &&
        (!Array.isArray(c.tags) || c.tags.some((t) => typeof t !== 'string'))
      ) {
        fail('"tags" phải là danh sách chuỗi');
      }
      if (c.id !== undefined) checkId(c.id);
      return;
    }
    case 'updateField': {
      const { target, field, value } = command;
      if (!target || !(target.kind in FIELDS)) fail('Phần tử cần sửa không hợp lệ');
      str(target.id, 'id');
      if (field === 'id' && target.kind === 'relationship')
        fail('Không đổi được ID của quan hệ từ canvas');
      if (field !== 'id' && !FIELDS[target.kind].includes(field)) {
        fail(
          `Trường "${field}" không có trong ${target.kind}; dùng: ${FIELDS[target.kind].join(', ')}`,
        );
      }
      if (field === 'tags') {
        if (value !== null && (!Array.isArray(value) || value.some((t) => typeof t !== 'string'))) {
          fail('"tags" phải là danh sách chuỗi');
        }
      } else if (value !== null && typeof value !== 'string') {
        fail(`"${field}" phải là chuỗi`);
      }
      return;
    }
    case 'renameId':
      if (command.kind !== 'component' && command.kind !== 'group')
        fail('Chỉ đổi được ID của component hoặc group');
      str(command.from, 'from');
      str(command.to, 'to');
      checkId(command.to);
      return;
    case 'addRelationship': {
      const r = command.relationship;
      if (!r || typeof r !== 'object') fail('Thiếu thông tin quan hệ');
      str(r.from, 'from');
      str(r.to, 'to');
      for (const key of ['type', 'label', 'description', 'technology'] as const)
        optStr(r[key], key);
      return;
    }
    case 'updateRelationship':
      str(command.id, 'id');
      optStr(command.from, 'from');
      optStr(command.to, 'to');
      if (command.from === undefined && command.to === undefined) fail('Cần "from" hoặc "to"');
      return;
    case 'addGroup': {
      const g = command.group ?? {};
      for (const key of ['id', 'name', 'type', 'description', 'parent'] as const)
        optStr(g[key], key);
      if (g.id !== undefined) checkId(g.id);
      return;
    }
    case 'deleteComponent':
    case 'deleteRelationship':
    case 'deleteGroup':
      str(command.id, 'id');
      return;
    default:
      fail(`Lệnh "${(command as { type: unknown }).type}" không được hỗ trợ`);
  }
}

function checkId(id: string) {
  if (!ID_PATTERN.test(id)) {
    fail(
      `ID "${id}" không hợp lệ: chỉ dùng chữ thường, số, ".", "_", "-" và bắt đầu bằng chữ hoặc số`,
    );
  }
}

// ---------------------------------------------------------------------------
// Ngữ cảnh

interface Context {
  doc: Document;
  model: ArchitectureModel;
  pathOf: (el: object) => YamlPath | undefined;
  p: TextPatcher;
}

function createContext(text: string): Context {
  const parsed = parseYaml(text);
  if (!parsed.ok)
    fail('YAML đang lỗi cú pháp — sửa lỗi trong editor trước khi thao tác trên canvas');
  const data: unknown = parsed.doc.toJS();
  if (!isObj(data) || !isMap(parsed.doc.contents))
    fail('YAML cần là một object có "version" và "system"');
  const { model, pathOf } = normalize(data as Record<string, unknown>, parsed);
  return {
    doc: parsed.doc,
    model,
    pathOf,
    p: new TextPatcher(text),
  };
}

interface Outcome {
  select?: ElementRef;
  /** Đường dẫn của quan hệ vừa thêm — ID chỉ biết sau khi chuẩn hóa text mới. */
  selectNewRelationship?: YamlPath;
  removed?: ElementRef[];
  references?: (DanglingReference & { offset: number })[];
}

function mapOffset(offset: number, changes: TextChange[]): number {
  let delta = 0;
  for (const c of changes) {
    if (c.to <= offset) delta += c.insert.length - (c.to - c.from);
    else break;
  }
  return offset + delta;
}

function lineColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  return { line, column: offset - before.lastIndexOf('\n') };
}

function run(ctx: Context, command: Command): Outcome {
  switch (command.type) {
    case 'addComponent':
      return addComponent(ctx, command.component);
    case 'updateField':
      if (command.field === 'id') {
        if (typeof command.value !== 'string') fail('ID mới phải là chuỗi');
        checkId(command.value as string);
        return renameId(
          ctx,
          command.target.kind as 'component' | 'group',
          command.target.id,
          command.value as string,
        );
      }
      return updateField(ctx, command.target, command.field, command.value);
    case 'deleteComponent':
      return deleteComponent(ctx, command.id);
    case 'renameId':
      return renameId(ctx, command.kind, command.from, command.to);
    case 'addRelationship':
      return addRelationship(ctx, command.relationship);
    case 'updateRelationship': {
      const target: ElementRef = { kind: 'relationship', id: command.id };
      if (command.from !== undefined) updateField(ctx, target, 'from', command.from);
      if (command.to !== undefined) updateField(ctx, target, 'to', command.to);
      return {};
    }
    case 'deleteRelationship':
      return deleteRelationship(ctx, command.id);
    case 'addGroup':
      return addGroup(ctx, command.group ?? {});
    case 'deleteGroup':
      return deleteGroup(ctx, command.id);
  }
}

// ---------------------------------------------------------------------------
// Lệnh

function addComponent(ctx: Context, input: ComponentInput): Outcome {
  const id = input.id ?? uniqueId(ctx, slug(input.type, 'component'));
  if (input.id !== undefined && takenIds(ctx).has(id)) fail(`ID "${id}" đã được dùng`);
  if (input.group !== undefined && !ctx.model.groups.some((g) => g.id === input.group)) {
    fail(`Group "${input.group}" không tồn tại`);
  }
  const entries: Entry[] = [['id', id]];
  if (input.name) entries.push(['name', input.name]);
  entries.push(['type', input.type]);
  for (const key of ['group', 'technology', 'description', 'owner'] as const) {
    if (input[key]) entries.push([key, input[key]!]);
  }
  if (input.tags?.length) entries.push(['tags', input.tags]);
  appendToSection(ctx, 'components', entries);
  return { select: { kind: 'component', id } };
}

function addRelationship(ctx: Context, input: RelationshipInput): Outcome {
  for (const end of ['from', 'to'] as const) {
    const id = input[end];
    if (!ctx.model.components.some((c) => c.id === id)) {
      fail(
        ctx.model.groups.some((g) => g.id === id)
          ? `"${id}" là group; quan hệ chỉ nối giữa các component`
          : `Component "${id}" không tồn tại`,
      );
    }
  }
  const type = input.type || undefined;
  if (
    ctx.model.relationships.some(
      (r) => r.from === input.from && r.to === input.to && r.type === type,
    )
  ) {
    fail(`Đã có quan hệ ${input.from} → ${input.to}${type ? ` [${type}]` : ''}`);
  }
  const entries: Entry[] = [
    ['from', input.from],
    ['to', input.to],
  ];
  for (const key of ['type', 'label', 'description', 'technology'] as const) {
    if (input[key]) entries.push([key, input[key]!]);
  }
  const path = appendToSection(ctx, 'relationships', entries);
  return { selectNewRelationship: path };
}

function addGroup(ctx: Context, input: GroupInput): Outcome {
  const id = input.id ?? uniqueId(ctx, slug(input.type ?? '', 'group'));
  if (input.id !== undefined && takenIds(ctx).has(id)) fail(`ID "${id}" đã được dùng`);
  if (input.parent !== undefined && !ctx.model.groups.some((g) => g.id === input.parent)) {
    fail(`Group cha "${input.parent}" không tồn tại`);
  }
  const entries: Entry[] = [
    ['id', id],
    ['name', input.name || id],
  ];
  for (const key of ['type', 'description', 'parent'] as const) {
    if (input[key]) entries.push([key, input[key]!]);
  }
  appendToSection(ctx, 'groups', entries);
  return { select: { kind: 'group', id } };
}

function updateField(
  ctx: Context,
  target: ElementRef,
  field: string,
  raw: string | string[] | null,
): Outcome {
  const el = find(ctx, target);
  const map = mapOf(ctx, el.path);
  let value = raw;
  if (typeof value === 'string' && field !== 'name' && field !== 'description' && field !== 'label')
    value = value.trim();
  if (value === '' || (Array.isArray(value) && !value.length)) value = null;
  if (value === null && REQUIRED[target.kind].includes(field))
    fail(`"${field}" là trường bắt buộc`);

  if (value !== null && typeof value === 'string') {
    if (
      target.kind === 'component' &&
      field === 'group' &&
      !ctx.model.groups.some((g) => g.id === value)
    ) {
      fail(`Group "${value}" không tồn tại`);
    }
    if (target.kind === 'group' && field === 'parent') checkParent(ctx, target.id, value);
    if (
      target.kind === 'relationship' &&
      (field === 'from' || field === 'to') &&
      !ctx.model.components.some((c) => c.id === value)
    ) {
      fail(`Component "${value}" không tồn tại`);
    }
  }

  const current = map.get(field, true);
  if (value === null) {
    if (findPair(map, field)) deletePair(ctx.p, map, field);
  } else if (!sameValue(current, value)) {
    setMapValue(ctx.p, map, field, value, FIELDS[target.kind]);
  }
  return {};
}

function checkParent(ctx: Context, groupId: string, parent: string) {
  if (!ctx.model.groups.some((g) => g.id === parent)) fail(`Group cha "${parent}" không tồn tại`);
  // Group cha không được là chính nó hoặc group con của nó.
  let current: string | undefined = parent;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === groupId)
      fail(`Không đặt "${parent}" làm group cha của "${groupId}": tạo thành vòng`);
    seen.add(current);
    current = ctx.model.groups.find((g) => g.id === current)?.parent;
  }
}

function deleteComponent(ctx: Context, id: string): Outcome {
  const el = find(ctx, { kind: 'component', id });
  const removed: ElementRef[] = [];
  deleteItems(ctx, [el.path]);
  const relPaths = ctx.model.relationships
    .filter((r) => r.from === id || r.to === id)
    .map((r) => {
      removed.push({ kind: 'relationship', id: r.id });
      return ctx.pathOf(r)!;
    });
  deleteItems(ctx, relPaths);
  return { removed, references: references(ctx, 'component', id) };
}

function deleteRelationship(ctx: Context, id: string): Outcome {
  const el = find(ctx, { kind: 'relationship', id });
  deleteItems(ctx, [el.path]);
  return {};
}

function deleteGroup(ctx: Context, id: string): Outcome {
  const el = find(ctx, { kind: 'group', id });
  const parent = ctx.model.groups.find((g) => g.id === id)!.parent;
  deleteItems(ctx, [el.path]);
  // Phần tử con chuyển lên group cha (nếu có), không thì bỏ field.
  const reassign = (path: YamlPath, field: string) => {
    const map = mapOf(ctx, path);
    if (parent) setMapValue(ctx.p, map, field, parent);
    else deletePair(ctx.p, map, field);
  };
  for (const c of ctx.model.components) if (c.group === id) reassign(ctx.pathOf(c)!, 'group');
  for (const g of ctx.model.groups)
    if (g.parent === id && g.id !== id) reassign(ctx.pathOf(g)!, 'parent');
  return { references: references(ctx, 'group', id) };
}

function renameId(ctx: Context, kind: 'component' | 'group', from: string, to: string): Outcome {
  const el = find(ctx, { kind, id: from });
  if (from === to) return { select: { kind, id: to } };
  if (takenIds(ctx).has(to)) fail(`ID "${to}" đã được dùng`);
  const { model } = ctx;

  replaceIn(ctx, mapOf(ctx, el.path), 'id', (v) => (v === from ? to : undefined));
  const swap = (v: string) => (v === from ? to : undefined);

  if (kind === 'component') {
    for (const r of model.relationships) {
      const map = mapOf(ctx, ctx.pathOf(r)!);
      replaceIn(ctx, map, 'from', swap);
      replaceIn(ctx, map, 'to', swap);
    }
  } else {
    for (const c of model.components)
      if (c.group === from) replaceIn(ctx, mapOf(ctx, ctx.pathOf(c)!), 'group', swap);
    for (const g of model.groups)
      if (g.parent === from) replaceIn(ctx, mapOf(ctx, ctx.pathOf(g)!), 'parent', swap);
  }

  // Selector của view: `<id>` (cả component và group), `group:<id>`.
  forEachView(ctx, (view) => {
    for (const key of ['include', 'exclude']) {
      replaceIn(ctx, view, key, (v) =>
        v === from ? to : kind === 'group' && v === `group:${from}` ? `group:${to}` : undefined,
      );
    }
  });
  // Matcher của rule.
  forEachRule(ctx, (rule) => {
    for (const end of ['from', 'to']) {
      const matcher = rule.get(end, true);
      if (isMap(matcher)) replaceIn(ctx, matcher, kind === 'component' ? 'id' : 'group', swap);
    }
  });
  return { select: { kind, id: to } };
}

// ---------------------------------------------------------------------------
// Tiện ích

function find(ctx: Context, ref: ElementRef): { path: YamlPath } {
  const list =
    ref.kind === 'component'
      ? ctx.model.components
      : ref.kind === 'group'
        ? ctx.model.groups
        : ctx.model.relationships;
  const el = (list as { id: string }[]).find((item) => item.id === ref.id);
  const label = ref.kind === 'component' ? 'Component' : ref.kind === 'group' ? 'Group' : 'Quan hệ';
  if (!el) fail(`${label} "${ref.id}" không tồn tại`);
  return { path: ctx.pathOf(el!)! };
}

function mapOf(ctx: Context, path: YamlPath): YAMLMap {
  const node = ctx.doc.getIn(path, true);
  if (!isMap(node)) fail(`Phần tử tại ${path.join('.')} không phải object`);
  return node as YAMLMap;
}

function takenIds(ctx: Context): Set<string> {
  return new Set([...ctx.model.components.map((c) => c.id), ...ctx.model.groups.map((g) => g.id)]);
}

function uniqueId(ctx: Context, base: string): string {
  const taken = takenIds(ctx);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

function slug(value: string, fallback: string): string {
  const s = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');
  return ID_PATTERN.test(s) ? s : fallback;
}

function sameValue(current: unknown, value: string | string[]): boolean {
  if (Array.isArray(value)) {
    const list = isSeq(current)
      ? current.items.map((i) => (isScalar(i) ? i.value : undefined))
      : undefined;
    return !!list && list.length === value.length && list.every((v, i) => v === value[i]);
  }
  return isScalar(current) && current.value === value;
}

/** Thay giá trị của `key` (scalar hoặc từng phần tử list) theo `map(value)`; trả undefined = giữ nguyên. */
function replaceIn(
  ctx: Context,
  map: YAMLMap,
  key: string,
  fn: (value: string) => string | undefined,
) {
  const pair = findPair(map, key);
  const node = pair?.value;
  const visit = (scalar: Node, flow: boolean) => {
    if (!isScalar(scalar) || typeof scalar.value !== 'string') return;
    const next = fn(scalar.value);
    if (next !== undefined) replaceScalar(ctx.p, scalar as Scalar, next, flow);
  };
  if (isScalar(node)) visit(node, !!map.flow);
  else if (isSeq(node)) for (const item of node.items as Node[]) visit(item, !!node.flow);
}

function forEachView(ctx: Context, fn: (view: YAMLMap) => void) {
  const views = ctx.doc.get('views', true);
  if (isSeq(views)) for (const v of views.items) if (isMap(v)) fn(v as YAMLMap);
}

function forEachRule(ctx: Context, fn: (rule: YAMLMap) => void) {
  const rules = ctx.doc.get('rules', true);
  if (isSeq(rules)) for (const r of rules.items) if (isMap(r)) fn(r as YAMLMap);
}

/** Tham chiếu tới component/group trong views và rules (dùng khi xóa). */
function references(ctx: Context, kind: 'component' | 'group', id: string) {
  const result: (DanglingReference & { offset: number })[] = [];
  const collect = (
    owner: 'view' | 'rule',
    ownerId: string,
    map: YAMLMap,
    key: string,
    match: (v: string) => boolean,
  ) => {
    const node = findPair(map, key)?.value;
    const scalars = isScalar(node) ? [node] : isSeq(node) ? (node.items as Node[]) : [];
    for (const s of scalars) {
      if (isScalar(s) && typeof s.value === 'string' && match(s.value)) {
        result.push({ kind: owner, id: ownerId, value: s.value, offset: s.range![0] });
      }
    }
  };
  forEachView(ctx, (view) => {
    const viewId = String(view.get('id') ?? '');
    for (const key of ['include', 'exclude']) {
      collect(
        'view',
        viewId,
        view,
        key,
        (v) => v === id || (kind === 'group' && v === `group:${id}`),
      );
    }
  });
  forEachRule(ctx, (rule) => {
    const ruleId = String(rule.get('id') ?? '');
    for (const end of ['from', 'to']) {
      const matcher = rule.get(end, true);
      if (isMap(matcher))
        collect('rule', ruleId, matcher, kind === 'component' ? 'id' : 'group', (v) => v === id);
    }
  });
  return result;
}

/** Xóa các phần tử theo đường dẫn; gom theo sequence để xóa một lượt. */
function deleteItems(ctx: Context, paths: YamlPath[]) {
  const bySeq = new Map<string, { seqPath: YamlPath; indices: Set<number> }>();
  for (const path of paths) {
    const seqPath = path.slice(0, -1);
    const key = JSON.stringify(seqPath);
    if (!bySeq.has(key)) bySeq.set(key, { seqPath, indices: new Set() });
    bySeq.get(key)!.indices.add(path[path.length - 1] as number);
  }
  for (const { seqPath, indices } of bySeq.values()) {
    const seq = ctx.doc.getIn(seqPath, true);
    if (isSeq(seq)) deleteSeqItems(ctx.p, seq, indices);
  }
}

/**
 * Thêm phần tử vào section (`components`, `relationships`, `groups`). Dùng section đang có
 * (cấp gốc hoặc trong `system`); chưa có thì tạo mới. Trả đường dẫn YAML của phần tử mới.
 */
function appendToSection(
  ctx: Context,
  key: 'components' | 'relationships' | 'groups',
  entries: Entry[],
): YamlPath {
  const { doc, p } = ctx;
  const root = doc.contents as YAMLMap;
  const system = root.get('system', true);
  const inSystem = isMap(system) && findPair(system as YAMLMap, key) !== undefined;
  const parent: YAMLMap | undefined = inSystem
    ? (system as YAMLMap)
    : findPair(root, key)
      ? root
      : undefined;

  if (parent) {
    const pair = findPair(parent, key)!;
    const keyIndent = p.column((pair.key as Node).range![0]);
    const sectionPath: YamlPath = inSystem ? ['system', key] : [key];
    const node = pair.value;
    if (isSeq(node)) {
      appendMapItem(p, node, entries, keyIndent);
      return [...sectionPath, node.items.length];
    }
    if (!node || (isScalar(node) && node.value === null)) {
      // `components:` chưa có giá trị.
      const colon = p.text.indexOf(':', (pair.key as Node).range![1]);
      const at = p.nextLineStart(colon);
      const lead = at === p.text.length && !p.text.endsWith('\n') ? p.eol : '';
      p.replace(
        at,
        at,
        `${lead}${blockItemText(entries, ' '.repeat(keyIndent + 2), p.eol)}${p.eol}`,
      );
      return [...sectionPath, 0];
    }
    fail(`"${key}" phải là danh sách`);
  }

  // Chưa có section: đặt cùng chỗ với các section khác (trong `system` hay cấp gốc).
  const nested =
    isMap(system) &&
    ['groups', 'components', 'relationships'].some((k) => findPair(system as YAMLMap, k));
  if (nested) {
    const sys = system as YAMLMap;
    const indent = p.column(((sys.items[0] as Pair<Node>).key as Node).range![0]);
    const block = `${key}:${p.eol}${blockItemText(entries, ' '.repeat(indent + 2), p.eol)}`;
    insertPair(p, sys, key, { block }, SYSTEM_ORDER);
    return ['system', key, 0];
  }
  const block = `${p.eol}${key}:${p.eol}${blockItemText(entries, '  ', p.eol)}`;
  insertPair(p, root, key, { block }, ROOT_ORDER);
  return [key, 0];
}

function newRelationship(text: string, path: YamlPath): ElementRef | undefined {
  const parsed = parseYaml(text);
  const data: unknown = parsed.doc.toJS();
  if (!isObj(data)) return undefined;
  const { model, pathOf } = normalize(data, parsed);
  const rel = model.relationships.find((r) => JSON.stringify(pathOf(r)) === JSON.stringify(path));
  return rel ? { kind: 'relationship', id: rel.id } : undefined;
}

/** Field sửa được theo loại phần tử (dùng cho property panel). */
export function editableFields(kind: EditableKind): readonly string[] {
  return FIELDS[kind];
}

export { SECTION as SECTION_OF_KIND };
