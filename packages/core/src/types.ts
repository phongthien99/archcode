import type { DiagnosticCode } from './codes';

/** Vị trí trong file YAML nguồn (1-based). */
export interface SourceRef {
  line: number;
  column: number;
}

export type Severity = 'error' | 'warning' | 'info';

export interface System {
  id: string;
  name: string;
  description?: string;
  source?: SourceRef;
}

/** Boundary: domain, cluster, network, trust zone... Có thể lồng nhau qua `parent`. */
export interface Group {
  id: string;
  name: string;
  type?: string;
  description?: string;
  parent?: string;
  source?: SourceRef;
}

export interface Component {
  id: string;
  name: string;
  type: string;
  group?: string;
  technology?: string;
  description?: string;
  owner?: string;
  tags: string[];
  source?: SourceRef;
}

export interface Relationship {
  /** Luôn có giá trị sau khi normalize: lấy từ YAML hoặc sinh từ `from->to`. */
  id: string;
  /** true nếu `id` được khai báo trong YAML. */
  explicitId: boolean;
  from: string;
  to: string;
  type?: string;
  label?: string;
  description?: string;
  technology?: string;
  source?: SourceRef;
}

export type LayoutDirection = 'TB' | 'LR';

export interface View {
  id: string;
  name: string;
  description?: string;
  /** Selector: `*`, `<id>`, `type:<t>`, `group:<g>`, `tag:<t>`. */
  include: string[];
  exclude: string[];
  direction: LayoutDirection;
  /** true nếu view được sinh tự động vì YAML không khai báo `views`. */
  implicit: boolean;
  source?: SourceRef;
}

export type RuleType = 'no-circular' | 'no-orphan' | 'forbidden';

export interface RuleMatcher {
  id?: string[];
  type?: string[];
  group?: string[];
  tag?: string[];
}

export interface Rule {
  id: string;
  type: RuleType;
  severity: Exclude<Severity, 'info'>;
  description?: string;
  from?: RuleMatcher;
  to?: RuleMatcher;
  unless?: 'same-group';
  /** true nếu rule là mặc định (YAML không khai báo `rules`). */
  implicit: boolean;
  source?: SourceRef;
}

export interface ArchitectureModel {
  version: number;
  system: System;
  groups: Group[];
  components: Component[];
  relationships: Relationship[];
  views: View[];
  rules: Rule[];
}

export type YamlPath = (string | number)[];

export interface RelatedLocation {
  message: string;
  line: number;
  column: number;
}

export interface Diagnostic {
  severity: Severity;
  code: DiagnosticCode;
  message: string;
  /** Gợi ý sửa lỗi, ví dụ "Có phải ý bạn là `document-db`?" */
  hint?: string;
  path?: YamlPath;
  line?: number;
  column?: number;
  related?: RelatedLocation[];
}

export interface ValidationResult {
  /** null khi YAML lỗi cú pháp hoặc gốc không phải object. */
  model: ArchitectureModel | null;
  diagnostics: Diagnostic[];
}
