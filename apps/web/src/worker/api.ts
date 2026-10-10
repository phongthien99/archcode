import type { ArchitectureModel, Diagnostic, EmbeddedSource } from '@archcode/core';

export interface ViewRender {
  id: string;
  svg: string;
  nodeCount: number;
}

export interface AnalyzeResult {
  /** null khi YAML lỗi cú pháp/gốc không phải object. */
  model: ArchitectureModel | null;
  diagnostics: Diagnostic[];
  /** SVG của view được yêu cầu (hoặc view đầu tiên); null nếu không dựng được model. */
  view: ViewRender | null;
  durationMs: number;
}

/** API mà Worker cung cấp cho main thread (qua Comlink). */
export interface CoreWorkerApi {
  analyze(text: string, viewId: string | null): Promise<AnalyzeResult>;
  exportHtml(text: string, sourceName: string): Promise<string>;
  /** SVG độc lập (có style nhúng) để tải về hoặc chuyển sang PNG. */
  standaloneSvg(text: string, viewId: string | null): Promise<string | null>;
  extractEmbeddedSource(html: string): EmbeddedSource | null;
}
