/// <reference lib="webworker" />
import {
  extractEmbeddedSource,
  generateHtml,
  layoutView,
  renderSvg,
  resolveView,
  validate,
  type ValidationResult,
} from '@archcode/core';
import { expose } from 'comlink';
import type { AnalyzeResult, CoreWorkerApi } from './api';
import { installElkShim } from './elk-shim';

// Phải chạy trước lần layout đầu tiên — xem giải thích trong elk-shim.ts.
installElkShim();

// Cache kết quả validate theo text: đổi view không cần parse lại.
let cache: { text: string; result: ValidationResult } | undefined;
function validated(text: string): ValidationResult {
  if (cache?.text !== text) cache = { text, result: validate(text) };
  return cache.result;
}

async function render(text: string, viewId: string | null, standalone: boolean) {
  const { model, diagnostics } = validated(text);
  if (!model) return null;
  const view = model.views.find((v) => v.id === viewId) ?? model.views[0]!;
  const resolved = resolveView(model, view);
  const layout = await layoutView(resolved);
  const svg = renderSvg(layout, {
    diagnostics,
    standalone,
    idPrefix: 'app-',
    title: view.name,
  });
  return { id: view.id, svg, nodeCount: resolved.components.length };
}

const api: CoreWorkerApi = {
  async analyze(text, viewId): Promise<AnalyzeResult> {
    const start = performance.now();
    const { model, diagnostics } = validated(text);
    const view = await render(text, viewId, false);
    return { model, diagnostics, view, durationMs: Math.round(performance.now() - start) };
  },
  async exportHtml(text, sourceName) {
    return (await generateHtml(text, { sourceName })).html;
  },
  async standaloneSvg(text, viewId) {
    return (await render(text, viewId, true))?.svg ?? null;
  },
  extractEmbeddedSource,
};

expose(api);
