import type { Diagnostic, SourceRef, YamlPath } from '../types';

/** Màu nhánh — tên hue trong design tokens. Nhánh con kế thừa màu của nhánh cha. */
export const MIND_COLORS = [
  'blue',
  'orange',
  'green',
  'violet',
  'pink',
  'teal',
  'amber',
  'red',
  'indigo',
  'sky',
] as const;

export type MindColor = (typeof MIND_COLORS)[number];

export type MindSide = 'left' | 'right';

/** `both`: nhánh cấp 1 chia hai phía quanh gốc (kiểu XMind); `LR`/`RL`: một phía. */
export type MindDirection = 'both' | 'LR' | 'RL';

export const MIND_DIRECTIONS: readonly MindDirection[] = ['both', 'LR', 'RL'];

/**
 * `classic`: nhánh cấp 2+ là chữ trên gạch chân, màu theo nhánh (kiểu XMind).
 * `notebook`: mọi node là khối bo tròn, màu theo tầng, mặc định một phía (kiểu NotebookLM).
 */
export type MindStyle = 'classic' | 'notebook';

export const MIND_STYLES: readonly MindStyle[] = ['classic', 'notebook'];

/** Trường hợp lệ — dùng chung cho validate và autocomplete. */
export const MIND_ROOT_FIELDS = [
  'version',
  'kind',
  'style',
  'direction',
  'expandDepth',
  'root',
  'links',
] as const;
export const MIND_NODE_FIELDS = [
  'id',
  'text',
  'note',
  'color',
  'side',
  'collapsed',
  'tags',
  'link',
  'children',
] as const;
export const MIND_LINK_FIELDS = ['from', 'to', 'label'] as const;

export interface MindNode {
  /** Luôn có giá trị: lấy từ YAML hoặc sinh theo vị trí trong cây (`~`, `~0`, `~0.1`). */
  id: string;
  /** true nếu `id` được khai báo trong YAML — chỉ node có id rõ ràng mới làm đích của `links`. */
  explicitId: boolean;
  text: string;
  note?: string;
  /** Màu đã khai báo trên chính node (chưa tính kế thừa). */
  color?: MindColor;
  /** Chỉ có tác dụng với nhánh cấp 1 khi `direction: both`. */
  side?: MindSide;
  collapsed: boolean;
  tags: string[];
  /** ID component trong file kiến trúc mà node này nói tới. */
  link?: string;
  children: MindNode[];
  /** 0 = gốc. */
  depth: number;
  /** Đường dẫn YAML của node, dùng cho báo lỗi và đồng bộ con trỏ editor. */
  path: YamlPath;
  source?: SourceRef;
}

/** Node đóng hay mở theo khai báo trong file (chưa tính thao tác mở/đóng trên giao diện). */
export function declaredCollapsed(
  model: Pick<MindmapModel, 'expandDepth'>,
  node: MindNode,
): boolean {
  if (!node.children.length) return false;
  return node.collapsed || (model.expandDepth !== undefined && node.depth >= model.expandDepth);
}

/** Đường nối chéo giữa hai nhánh (nét đứt). */
export interface MindLink {
  from: string;
  to: string;
  label?: string;
  path: YamlPath;
  source?: SourceRef;
}

export interface MindmapModel {
  version: number;
  kind: 'mindmap';
  style: MindStyle;
  /** `notebook` không khai báo thì mặc định `LR`, `classic` thì `both`. */
  direction: MindDirection;
  /**
   * Số tầng mở sẵn khi mở file (1 = chỉ thấy nhánh chính). Không khai báo: `notebook` là 1,
   * `classic` mở hết. Node có `collapsed: true` vẫn đóng.
   */
  expandDepth?: number;
  root: MindNode;
  links: MindLink[];
}

export interface MindmapValidationResult {
  /** null khi YAML lỗi cú pháp hoặc không có `root`. */
  model: MindmapModel | null;
  diagnostics: Diagnostic[];
}
