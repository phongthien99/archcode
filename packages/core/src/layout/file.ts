import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node, type Pair } from 'yaml';
import { formatScalar } from '../mutate/text';
import type { ArchitectureModel, Diagnostic } from '../types';
import { resolveView } from '../views/resolve';
import type { Point } from './route';

/**
 * Presentation model (AAC-12) — `architecture.layout.yaml`, tách khỏi YAML kiến trúc để
 * kéo thả node không làm bẩn diff kiến trúc:
 *
 * ```yaml
 * version: 1
 * views:
 *   overview:
 *     nodes:
 *       api-gateway: { x: 320, y: 120 }
 *     edges:
 *       api-gateway->document-service: { points: [[400, 200], [400, 260]] }
 * ```
 */
export interface LayoutFile {
  version: 1;
  views: Record<string, ViewLayout>;
}

export interface ViewLayout {
  /** Góc trên trái của node, theo ID component. */
  nodes: Record<string, Point>;
  /** Điểm gấp của connector, theo ID quan hệ. */
  edges: Record<string, Point[]>;
}

export const LAYOUT_VERSION = 1;

export function emptyLayout(): LayoutFile {
  return { version: LAYOUT_VERSION, views: {} };
}

export interface ParsedLayout {
  layout: LayoutFile;
  diagnostics: Diagnostic[];
}

/**
 * Đọc file layout. Khoan dung: entry sai định dạng bị bỏ qua (kèm cảnh báo), phần còn lại vẫn dùng được.
 * File layout chỉ ảnh hưởng tới cách trình bày nên mọi vấn đề đều là cảnh báo, không chặn build.
 */
export function parseLayout(text: string, fileName = 'architecture.layout.yaml'): ParsedLayout {
  const layout = emptyLayout();
  const diagnostics: Diagnostic[] = [];
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  const at = (node: Node | null | undefined) => {
    if (!node?.range) return {};
    const { line, col } = lineCounter.linePos(node.range[0]);
    return { line, column: col };
  };
  const warn = (message: string, node?: Node | null) =>
    diagnostics.push({
      severity: 'warning',
      code: 'layout-invalid',
      message,
      file: fileName,
      ...at(node),
    });

  if (doc.errors.length) {
    const pos = doc.errors[0]!.linePos?.[0];
    diagnostics.push({
      severity: 'warning',
      code: 'layout-invalid',
      message: `File layout sai cú pháp YAML — bỏ qua, dùng auto-layout: ${doc.errors[0]!.message.split('\n')[0]}`,
      file: fileName,
      line: pos?.line,
      column: pos?.col,
    });
    return { layout, diagnostics };
  }
  const root = doc.contents;
  if (root === null || (isScalar(root) && root.value === null)) return { layout, diagnostics };
  if (!isMap(root)) {
    warn('File layout phải là object có "version" và "views"', root);
    return { layout, diagnostics };
  }
  const version: unknown = root.toJSON().version;
  if (version !== undefined && version !== LAYOUT_VERSION) {
    warn(
      `Phiên bản file layout ${String(version)} chưa được hỗ trợ; phiên bản hiện tại là ${LAYOUT_VERSION}`,
      root.get('version', true) as Node,
    );
  }
  const views = root.get('views', true);
  if (views === undefined) return { layout, diagnostics };
  if (!isMap(views)) {
    warn('"views" phải là object: <view-id>: { nodes: ..., edges: ... }', views as Node);
    return { layout, diagnostics };
  }
  for (const pair of views.items as Pair<Node, Node>[]) {
    const viewId = isScalar(pair.key) ? String(pair.key.value) : '';
    const value = pair.value;
    if (!viewId || !isMap(value)) {
      warn(`View "${viewId}" trong file layout phải là object`, pair.value ?? pair.key);
      continue;
    }
    const view: ViewLayout = { nodes: {}, edges: {} };
    const nodes = value.get('nodes', true);
    if (isMap(nodes)) {
      for (const n of nodes.items as Pair<Node, Node>[]) {
        const id = isScalar(n.key) ? String(n.key.value) : '';
        const p =
          n.value && isMap(n.value) ? (n.value.toJSON() as Record<string, unknown>) : undefined;
        if (
          !id ||
          !p ||
          typeof p.x !== 'number' ||
          typeof p.y !== 'number' ||
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y)
        ) {
          warn(`Vị trí của "${id}" phải có dạng { x: <số>, y: <số> }`, n.value ?? n.key);
          continue;
        }
        view.nodes[id] = { x: p.x, y: p.y };
      }
    } else if (nodes !== undefined) {
      warn('"nodes" phải là object: <component-id>: { x, y }', nodes as Node);
    }
    const edges = value.get('edges', true);
    if (isMap(edges)) {
      for (const e of edges.items as Pair<Node, Node>[]) {
        const id = isScalar(e.key) ? String(e.key.value) : '';
        const raw = e.value && isMap(e.value) ? e.value.get('points', true) : undefined;
        const points = isSeq(raw) ? (raw.toJSON() as unknown[]) : undefined;
        const valid =
          points?.every(
            (pt) =>
              Array.isArray(pt) &&
              pt.length === 2 &&
              pt.every((n) => typeof n === 'number' && Number.isFinite(n)),
          ) ?? false;
        if (!id || !valid) {
          warn(`Điểm gấp của "${id}" phải có dạng { points: [[x, y], ...] }`, e.value ?? e.key);
          continue;
        }
        view.edges[id] = (points as [number, number][]).map(([x, y]) => ({ x, y }));
      }
    } else if (edges !== undefined) {
      warn('"edges" phải là object: <relationship-id>: { points: [[x, y], ...] }', edges as Node);
    }
    layout.views[viewId] = view;
  }
  return { layout, diagnostics };
}

/** Cảnh báo entry trỏ tới view/component/quan hệ không tồn tại. */
export function checkLayout(
  layout: LayoutFile,
  model: ArchitectureModel,
  fileName = 'architecture.layout.yaml',
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const warn = (message: string) =>
    diagnostics.push({ severity: 'warning', code: 'layout-unknown-id', message, file: fileName });
  for (const [viewId, view] of Object.entries(layout.views)) {
    const v = model.views.find((x) => x.id === viewId);
    if (!v) {
      warn(`File layout có view "${viewId}" nhưng kiến trúc không có view này`);
      continue;
    }
    const resolved = resolveView(model, v);
    const components = new Set(resolved.components.map((c) => c.id));
    const relationships = new Set(resolved.relationships.map((r) => r.id));
    for (const id of Object.keys(view.nodes)) {
      if (!components.has(id))
        warn(`File layout (view "${viewId}"): component "${id}" không có trong view`);
    }
    for (const id of Object.keys(view.edges)) {
      if (!relationships.has(id))
        warn(`File layout (view "${viewId}"): quan hệ "${id}" không có trong view`);
    }
  }
  return diagnostics;
}

/**
 * Ghi file layout dạng chuẩn: key sắp xếp, tọa độ số nguyên, mỗi node một dòng —
 * cùng layout luôn ra cùng text để diff trong Git gọn.
 */
export function serializeLayout(layout: LayoutFile): string {
  const key = (k: string) => formatScalar(k, false);
  const lines = [`version: ${LAYOUT_VERSION}`];
  const viewIds = Object.keys(layout.views)
    .filter((id) => hasEntries(layout.views[id]!))
    .sort();
  if (!viewIds.length) return `${lines[0]}\nviews: {}\n`;
  lines.push('views:');
  for (const viewId of viewIds) {
    const view = layout.views[viewId]!;
    lines.push(`  ${key(viewId)}:`);
    const nodeIds = Object.keys(view.nodes).sort();
    if (nodeIds.length) {
      lines.push('    nodes:');
      for (const id of nodeIds) {
        const p = view.nodes[id]!;
        lines.push(`      ${key(id)}: { x: ${Math.round(p.x)}, y: ${Math.round(p.y)} }`);
      }
    }
    const edgeIds = Object.keys(view.edges).sort();
    if (edgeIds.length) {
      lines.push('    edges:');
      for (const id of edgeIds) {
        const pts = view.edges[id]!.map((p) => `[${Math.round(p.x)}, ${Math.round(p.y)}]`).join(
          ', ',
        );
        lines.push(`      ${key(id)}: { points: [${pts}] }`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

function hasEntries(view: ViewLayout): boolean {
  return Object.keys(view.nodes).length > 0 || Object.keys(view.edges).length > 0;
}

export function isLayoutEmpty(layout: LayoutFile): boolean {
  return !Object.values(layout.views).some(hasEntries);
}

/** Bỏ entry của view/component/quan hệ không còn tồn tại (gọi khi lưu). */
export function pruneLayout(layout: LayoutFile, model: ArchitectureModel): LayoutFile {
  const views: Record<string, ViewLayout> = {};
  for (const [viewId, view] of Object.entries(layout.views)) {
    const v = model.views.find((x) => x.id === viewId);
    if (!v) continue;
    const resolved = resolveView(model, v);
    const components = new Set(resolved.components.map((c) => c.id));
    const relationships = new Set(resolved.relationships.map((r) => r.id));
    const next: ViewLayout = {
      nodes: Object.fromEntries(Object.entries(view.nodes).filter(([id]) => components.has(id))),
      edges: Object.fromEntries(Object.entries(view.edges).filter(([id]) => relationships.has(id))),
    };
    if (hasEntries(next)) views[viewId] = next;
  }
  return { version: LAYOUT_VERSION, views };
}

/**
 * Đổi ID component trong layout (đi kèm lệnh `renameId`). ID quan hệ sinh tự động
 * (`from->to`, `from->to:type`, `from->to~2`) cũng được đổi theo.
 */
export function renameInLayout(layout: LayoutFile, from: string, to: string): LayoutFile {
  const renameRel = (id: string) => {
    const m = /^(.+?)->(.+?)((?::[^~]+)?(?:~\d+)?)$/.exec(id);
    if (!m) return id;
    const a = m[1] === from ? to : m[1]!;
    const b = m[2] === from ? to : m[2]!;
    return `${a}->${b}${m[3]}`;
  };
  const views: Record<string, ViewLayout> = {};
  for (const [viewId, view] of Object.entries(layout.views)) {
    views[viewId] = {
      nodes: Object.fromEntries(
        Object.entries(view.nodes).map(([id, p]) => [id === from ? to : id, p]),
      ),
      edges: Object.fromEntries(
        Object.entries(view.edges).map(([id, pts]) => [renameRel(id), pts]),
      ),
    };
  }
  return { version: LAYOUT_VERSION, views };
}

/** Vị trí đã ghim của một view (rỗng nếu chưa có). */
export function viewLayout(layout: LayoutFile | undefined, viewId: string): ViewLayout {
  return layout?.views[viewId] ?? { nodes: {}, edges: {} };
}

/** Tên file layout đi kèm: `architecture.yaml` → `architecture.layout.yaml`. */
export function layoutFileName(architectureFile: string): string {
  return architectureFile.replace(/(\.layout)?\.ya?ml$/i, '') + '.layout.yaml';
}
