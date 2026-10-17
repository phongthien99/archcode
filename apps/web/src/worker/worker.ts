/// <reference lib="webworker" />
import {
  applyCommand,
  edgeLabelContent,
  elementRanges,
  extractEmbeddedSource,
  generateHtml,
  isAsyncRelationship,
  isMindmapSource,
  layoutMindmap,
  layoutView,
  nodeBodySvg,
  nodeClass,
  nodeTooltip,
  parseLayout,
  renderMindmapSvg,
  renderSvg,
  resolveView,
  setRouterWasmUrl,
  validate,
  validateMindmap,
  viewLayout,
  type Diagnostic,
  type Layout,
  type MindmapValidationResult,
  type MindNode,
  type Severity,
  type ValidationResult,
} from '@archcode/core';
import { expose } from 'comlink';
import type {
  AnalyzeRequest,
  AnalyzeResult,
  CanvasData,
  CoreWorkerApi,
  ViewPositions,
} from './api';
import libavoidWasm from 'libavoid-js/libavoid.wasm?url';
import { installElkShim } from './elk-shim';

// Phải chạy trước lần layout đầu tiên — xem giải thích trong elk-shim.ts.
installElkShim();
// URL thật (có hash) của libavoid.wasm: không đặt thì libavoid-js tìm `libavoid.wasm` cạnh worker
// → 404 → connector lặng lẽ dùng router cũ. WASM chỉ nạp ở lần layout thủ công đầu tiên.
setRouterWasmUrl(libavoidWasm);

// Cache theo text: đổi view, kéo node không cần parse lại.
let cache: { text: string; result: ValidationResult; ranges?: AnalyzeResult['ranges'] } | undefined;
function validated(text: string) {
  if (cache?.text !== text) cache = { text, result: validate(text) };
  return cache;
}

let mindCache: { text: string; result: MindmapValidationResult } | undefined;
function validatedMindmap(text: string) {
  if (mindCache?.text !== text) mindCache = { text, result: validateMindmap(text) };
  return mindCache.result;
}

/** Mind map chỉ có chế độ Xem trước: layout tính từ cấu trúc cây, không có vị trí ghim. */
function mindmapSvg(text: string, standalone: boolean): string | null {
  const { model, diagnostics } = validatedMindmap(text);
  if (!model) return null;
  return renderMindmapSvg(layoutMindmap(model), {
    diagnostics,
    standalone,
    idPrefix: 'app-',
  });
}

function countNodes(node: MindNode): number {
  return node.children.reduce((n, child) => n + countNodes(child), 1);
}

function severityIndex(diagnostics: Diagnostic[]): Map<string, Severity> {
  const index = new Map<string, Severity>();
  for (const d of diagnostics) {
    if (!d.target || d.severity === 'info') continue;
    const key = `${d.target.kind}:${d.target.id}`;
    if (index.get(key) !== 'error') index.set(key, d.severity);
  }
  return index;
}

function toCanvas(layout: Layout, diagnostics: Diagnostic[]): CanvasData {
  const severity = severityIndex(diagnostics);
  return {
    direction: layout.direction,
    nodes: layout.nodes.map((n) => ({
      id: n.component.id,
      type: n.component.type,
      group: n.component.group,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      body: nodeBodySvg(n.component.type, n.content, {
        x: 0,
        y: 0,
        width: n.width,
        height: n.height,
      }),
      className: nodeClass(n.component.type, severity.get(`component:${n.component.id}`)),
      tooltip: nodeTooltip(n.component),
    })),
    groups: layout.groups.map((g) => ({
      id: g.group.id,
      parent: g.group.parent,
      label: g.group.type ? `${g.group.name} [${g.group.type}]` : g.group.name,
      severity: severity.get(`group:${g.group.id}`),
    })),
    edges: layout.edges.map((e) => ({
      id: e.relationship.id,
      from: e.relationship.from,
      to: e.relationship.to,
      type: e.relationship.type,
      label: edgeLabelContent(e.relationship),
      async: isAsyncRelationship(e.relationship),
      severity: severity.get(`relationship:${e.relationship.id}`),
    })),
  };
}

async function layoutFor(
  text: string,
  viewId: string | null,
  positions: ViewPositions | undefined,
  sticky: boolean,
) {
  const { model } = validated(text).result;
  if (!model) return null;
  const view = model.views.find((v) => v.id === viewId) ?? model.views[0]!;
  const resolved = resolveView(model, view);
  const p = positions ?? { pinned: {}, sticky: {}, waypoints: {} };
  const layout = await layoutView(resolved, {
    positions: sticky ? { ...p.sticky, ...p.pinned } : p.pinned,
    waypoints: p.waypoints,
  });
  return { view, resolved, layout };
}

const api: CoreWorkerApi = {
  async analyze(req: AnalyzeRequest): Promise<AnalyzeResult> {
    const start = performance.now();
    if (isMindmapSource(req.text)) {
      const { model, diagnostics } = validatedMindmap(req.text);
      return {
        kind: 'mindmap',
        model: null,
        mindmap: model,
        diagnostics,
        view: model
          ? { id: 'mindmap', nodeCount: countNodes(model.root), svg: mindmapSvg(req.text, false)! }
          : null,
        ranges: [],
        membership: {},
        durationMs: Math.round(performance.now() - start),
      };
    }
    const entry = validated(req.text);
    const { model, diagnostics } = entry.result;
    entry.ranges ??= elementRanges(req.text);
    let view: AnalyzeResult['view'] = null;
    const membership: Record<string, string[]> = {};
    if (model) {
      const viewId = model.views.some((v) => v.id === req.viewId) ? req.viewId : model.views[0]!.id;
      const canvas = req.mode === 'canvas';
      const result = (await layoutFor(req.text, viewId, req.positions[viewId!], canvas))!;
      view = {
        id: result.view.id,
        nodeCount: result.resolved.components.length,
        ...(canvas
          ? { canvas: toCanvas(result.layout, diagnostics) }
          : {
              svg: renderSvg(result.layout, {
                diagnostics,
                standalone: false,
                idPrefix: 'app-',
                title: result.view.name,
              }),
            }),
      };
      for (const v of model.views) {
        for (const c of resolveView(model, v).components) (membership[c.id] ??= []).push(v.id);
      }
    }
    return {
      kind: 'architecture',
      model,
      mindmap: null,
      diagnostics,
      view,
      ranges: entry.ranges,
      membership,
      durationMs: Math.round(performance.now() - start),
    };
  },
  applyCommand,
  async exportHtml(text, options) {
    if (isMindmapSource(text)) {
      throw new Error('Chưa hỗ trợ xuất HTML cho mind map — dùng SVG hoặc PNG');
    }
    return (await generateHtml(text, options)).html;
  },
  async standaloneSvg(text, viewId, layoutText) {
    if (isMindmapSource(text)) return mindmapSvg(text, true);
    const layout = layoutText ? parseLayout(layoutText).layout : undefined;
    const { model } = validated(text).result;
    const id = viewId ?? model?.views[0]?.id ?? '';
    const pinned = viewLayout(layout, id);
    const result = await layoutFor(
      text,
      viewId,
      { pinned: pinned.nodes, sticky: {}, waypoints: pinned.edges },
      false,
    );
    if (!result) return null;
    return renderSvg(result.layout, {
      diagnostics: validated(text).result.diagnostics,
      standalone: true,
      idPrefix: 'app-',
      title: result.view.name,
    });
  },
  extractEmbeddedSource,
};

expose(api);
