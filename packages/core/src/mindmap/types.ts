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
  direction: MindDirection;
  root: MindNode;
  links: MindLink[];
}

export interface MindmapValidationResult {
  /** null khi YAML lỗi cú pháp hoặc không có `root`. */
  model: MindmapModel | null;
  diagnostics: Diagnostic[];
}
