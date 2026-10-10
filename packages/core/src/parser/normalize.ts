import { DEFAULT_VIEW_ID, SCHEMA_VERSION } from '../constants';
import type {
  ArchitectureModel,
  Component,
  Diagnostic,
  Group,
  LayoutDirection,
  Relationship,
  Rule,
  RuleMatcher,
  RuleType,
  SourceRef,
  System,
  View,
  YamlPath,
} from '../types';
import type { ParsedYaml } from './parse';
import { sourceRefOf } from './sourceRef';

type Raw = Record<string, unknown>;

export interface NormalizeResult {
  model: ArchitectureModel;
  /** Đường dẫn YAML của từng phần tử trong model, để báo lỗi chính xác tới từng trường. */
  pathOf: (element: object) => YamlPath | undefined;
  diagnostics: Diagnostic[];
}

const RULE_TYPES: readonly RuleType[] = ['no-circular', 'no-orphan', 'forbidden'];

/**
 * Chuyển dữ liệu YAML thô thành ArchitectureModel.
 *
 * Khoan dung với dữ liệu lỗi: phần tử thiếu thông tin tối thiểu (ví dụ không có `id`) bị bỏ qua,
 * các phần tử còn lại vẫn được giữ. Việc báo lỗi cấu trúc là trách nhiệm của schema validator.
 */
export function normalize(data: Raw, parsed: ParsedYaml): NormalizeResult {
  const paths = new WeakMap<object, YamlPath>();
  const diagnostics: Diagnostic[] = [];
  const ref = (path: YamlPath): SourceRef | undefined => sourceRefOf(parsed, path);
  const track = <T extends object>(element: T, path: YamlPath): T => {
    paths.set(element, path);
    return element;
  };

  const rawSystem = isObj(data.system) ? data.system : undefined;

  // Hỗ trợ cả `system.components` (dạng lồng) và `components` ở cấp gốc.
  const section = (key: 'groups' | 'components' | 'relationships') => {
    const inRoot = data[key] !== undefined;
    const inSystem = rawSystem?.[key] !== undefined;
    if (inRoot && inSystem) {
      const at = ref(['system', key]);
      const other = ref([key]);
      diagnostics.push({
        severity: 'error',
        code: 'ambiguous-section',
        message: `"${key}" được khai báo ở cả cấp gốc và trong "system"; chỉ dùng một nơi`,
        path: ['system', key],
        ...at,
        related: other ? [{ message: `"${key}" ở cấp gốc`, ...other }] : undefined,
      });
    }
    const path: YamlPath = inSystem ? ['system', key] : [key];
    const value = inSystem ? rawSystem![key] : data[key];
    return { items: Array.isArray(value) ? value : [], path };
  };

  // --- system
  const system: System = track(
    {
      id: str(rawSystem?.id) ?? 'system',
      name: str(rawSystem?.name) ?? str(rawSystem?.id) ?? 'System',
      description: str(rawSystem?.description),
      source: ref(['system']),
    },
    ['system'],
  );

  // --- groups
  const groupSection = section('groups');
  const groups: Group[] = [];
  groupSection.items.forEach((raw, i) => {
    const path = [...groupSection.path, i];
    if (!isObj(raw) || !str(raw.id)) return;
    groups.push(
      track(
        {
          id: str(raw.id)!,
          name: str(raw.name) ?? str(raw.id)!,
          type: str(raw.type),
          description: str(raw.description),
          parent: str(raw.parent),
          source: ref(path),
        },
        path,
      ),
    );
  });

  // --- components
  const componentSection = section('components');
  const components: Component[] = [];
  componentSection.items.forEach((raw, i) => {
    const path = [...componentSection.path, i];
    if (!isObj(raw) || !str(raw.id)) return;
    components.push(
      track(
        {
          id: str(raw.id)!,
          name: str(raw.name) ?? str(raw.id)!,
          type: str(raw.type) ?? 'unknown',
          group: str(raw.group),
          technology: str(raw.technology),
          description: str(raw.description),
          owner: str(raw.owner),
          tags: strList(raw.tags),
          source: ref(path),
        },
        path,
      ),
    );
  });

  // --- relationships
  const relSection = section('relationships');
  const explicitIds = new Set(
    relSection.items.flatMap((raw) => (isObj(raw) && str(raw.id) ? [str(raw.id)!] : [])),
  );
  const usedIds = new Set<string>();
  const relationships: Relationship[] = [];
  relSection.items.forEach((raw, i) => {
    const path = [...relSection.path, i];
    if (!isObj(raw)) return;
    const from = str(raw.from);
    const to = str(raw.to);
    if (!from || !to) return;
    const type = str(raw.type);
    const explicitId = str(raw.id);
    const id = explicitId ?? autoRelationshipId(from, to, type, explicitIds, usedIds);
    usedIds.add(id);
    relationships.push(
      track(
        {
          id,
          explicitId: explicitId !== undefined,
          from,
          to,
          type,
          label: str(raw.label),
          description: str(raw.description),
          technology: str(raw.technology),
          source: ref(path),
        },
        path,
      ),
    );
  });

  // --- views
  const views: View[] = [];
  const rawViews = Array.isArray(data.views) ? data.views : [];
  rawViews.forEach((raw, i) => {
    const path: YamlPath = ['views', i];
    if (!isObj(raw) || !str(raw.id)) return;
    const include = strList(raw.include);
    views.push(
      track(
        {
          id: str(raw.id)!,
          name: str(raw.name) ?? str(raw.id)!,
          description: str(raw.description),
          include: include.length ? include : ['*'],
          exclude: strList(raw.exclude),
          direction: direction(raw.direction),
          implicit: false,
          source: ref(path),
        },
        path,
      ),
    );
  });
  if (!views.length) {
    views.push({
      id: DEFAULT_VIEW_ID,
      name: 'Toàn bộ hệ thống',
      include: ['*'],
      exclude: [],
      direction: 'TB',
      implicit: true,
    });
  }

  // --- rules
  const rules: Rule[] = [];
  if (data.rules === undefined) {
    rules.push(
      { id: 'default-no-circular', type: 'no-circular', severity: 'warning', implicit: true },
      { id: 'default-no-orphan', type: 'no-orphan', severity: 'warning', implicit: true },
    );
  } else if (Array.isArray(data.rules)) {
    data.rules.forEach((raw, i) => {
      const path: YamlPath = ['rules', i];
      if (!isObj(raw) || !str(raw.id)) return;
      const type = str(raw.type) as RuleType | undefined;
      if (!type || !RULE_TYPES.includes(type)) return;
      rules.push(
        track(
          {
            id: str(raw.id)!,
            type,
            severity: raw.severity === 'warning' ? 'warning' : 'error',
            description: str(raw.description),
            from: matcher(raw.from),
            to: matcher(raw.to),
            unless: raw.unless === 'same-group' ? 'same-group' : undefined,
            implicit: false,
            source: ref(path),
          },
          path,
        ),
      );
    });
  }

  const model: ArchitectureModel = {
    version: typeof data.version === 'number' ? data.version : SCHEMA_VERSION,
    system,
    groups,
    components,
    relationships,
    views,
    rules,
  };

  return { model, pathOf: (el) => paths.get(el), diagnostics };
}

/**
 * ID ổn định cho relationship không khai báo id: `from->to`.
 * Trùng thì thêm type (`from->to:http`), vẫn trùng thì thêm số thứ tự (`from->to~2`).
 */
function autoRelationshipId(
  from: string,
  to: string,
  type: string | undefined,
  explicitIds: Set<string>,
  usedIds: Set<string>,
): string {
  const taken = (id: string) => explicitIds.has(id) || usedIds.has(id);
  const base = `${from}->${to}`;
  if (!taken(base)) return base;
  if (type && !taken(`${base}:${type}`)) return `${base}:${type}`;
  for (let n = 2; ; n++) {
    if (!taken(`${base}~${n}`)) return `${base}~${n}`;
  }
}

function matcher(value: unknown): RuleMatcher | undefined {
  if (!isObj(value)) return undefined;
  const result: RuleMatcher = {};
  for (const key of ['id', 'type', 'group', 'tag'] as const) {
    const list = strList(value[key]);
    if (list.length) result[key] = list;
  }
  return result;
}

function direction(value: unknown): LayoutDirection {
  return value === 'LR' ? 'LR' : 'TB';
}

export function isObj(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function strList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
