import type {
  ArchitectureModel,
  Command,
  Diagnostic,
  ElementRange,
  EmbeddedSource,
  LayoutDirection,
  MindmapModel,
  MutationResult,
  Point,
  Severity,
} from '@archcode/core';

/** Vị trí đã biết của node trong một view: từ file layout (ghim) và vị trí giữ tạm trong phiên làm việc. */
export interface ViewPositions {
  /** Vị trí ghim trong file layout. */
  pinned: Record<string, Point>;
  /** Vị trí giữ tạm để canvas không "nhảy" khi model đổi (chỉ dùng ở chế độ Canvas). */
  sticky: Record<string, Point>;
  waypoints: Record<string, Point[]>;
}

export interface CanvasNode {
  id: string;
  type: string;
  group?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Shape + chữ (SVG) — cùng hàm với renderer của HTML xuất ra. */
  body: string;
  className: string;
  tooltip: string;
}

export interface CanvasGroup {
  id: string;
  parent?: string;
  label: string;
  severity?: Severity;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  type?: string;
  label?: { lines: string[]; width: number; height: number };
  async: boolean;
  severity?: Severity;
}

export interface CanvasData {
  direction: LayoutDirection;
  nodes: CanvasNode[];
  groups: CanvasGroup[];
  edges: CanvasEdge[];
}

export interface ViewRender {
  id: string;
  nodeCount: number;
  /** Chế độ Xem trước: SVG giống hệt bản xuất. */
  svg?: string;
  /** Chế độ Canvas. */
  canvas?: CanvasData;
}

export interface AnalyzeRequest {
  text: string;
  viewId: string | null;
  mode: 'canvas' | 'preview';
  /** Vị trí theo view ID. */
  positions: Record<string, ViewPositions>;
}

/** Loại tài liệu, chọn theo `kind` ở cấp gốc của YAML. */
export type DocumentKind = 'architecture' | 'mindmap';

export interface AnalyzeResult {
  kind: DocumentKind;
  /** null khi YAML lỗi cú pháp/gốc không phải object, hoặc tài liệu là mind map. */
  model: ArchitectureModel | null;
  /** Chỉ với `kind: mindmap`; null khi YAML lỗi cú pháp hoặc thiếu `root`. */
  mindmap: MindmapModel | null;
  diagnostics: Diagnostic[];
  view: ViewRender | null;
  /** Đoạn text của từng phần tử (đồng bộ con trỏ YAML → chọn trên canvas). */
  ranges: ElementRange[];
  /** View chứa từng component (tìm kiếm: chuyển sang view có component). */
  membership: Record<string, string[]>;
  durationMs: number;
}

export interface ExportOptions {
  sourceName: string;
  layout?: string;
  layoutName?: string;
}

/** API mà Worker cung cấp cho main thread (qua Comlink). */
export interface CoreWorkerApi {
  analyze(request: AnalyzeRequest): Promise<AnalyzeResult>;
  applyCommand(text: string, command: Command): MutationResult;
  exportHtml(text: string, options: ExportOptions): Promise<string>;
  /** SVG độc lập (có style nhúng) để tải về hoặc chuyển sang PNG. */
  standaloneSvg(text: string, viewId: string | null, layout?: string): Promise<string | null>;
  extractEmbeddedSource(html: string): EmbeddedSource | null;
}
