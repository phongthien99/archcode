import {
  DEFAULT_ACCENT,
  DEFAULT_DIAGRAM_PALETTE,
  type AccentName,
  type DiagramPaletteName,
} from '@archcode/core/tokens';
import type {
  ArchitectureModel,
  MindmapModel,
  Command,
  Diagnostic,
  DiagnosticTarget,
  ElementRange,
  MutationResult,
} from '@archcode/core';
import {
  emptyLayout,
  isLayoutEmpty,
  layoutFileName,
  parseLayout,
  pruneLayout,
  renameInLayout,
  serializeLayout,
  type LayoutFile,
  type Point,
} from '@archcode/core/canvas';
import { create } from 'zustand';
import type { CanvasData, DocumentKind, ViewPositions } from './worker/api';
import { core, createAnalyzer } from './worker/client';

export type Theme = 'system' | 'light' | 'dark';
export type { AccentName, DiagramPaletteName };
export type Mode = 'canvas' | 'preview';

export interface RevealRequest {
  line: number;
  column: number;
  /** Đổi mỗi lần yêu cầu để editor nhảy lại cả khi cùng dòng. */
  nonce: number;
  /** Chuyển focus vào editor (false khi thao tác trên canvas để phím Delete/mũi tên vẫn thuộc canvas). */
  focus: boolean;
}

/** Thay đổi text đến từ ngoài editor (canvas, undo/redo) — editor áp dưới dạng một transaction. */
export interface ExternalEdit {
  changes: { from: number; to: number; insert: string }[];
  /** Đặt con trỏ tại đây sau khi áp (undo/redo). */
  cursor?: number;
  nonce: number;
}

export type SelectionOrigin = 'canvas' | 'editor' | 'other';

/** Một mục lịch sử: trạng thái YAML + layout + phần tử đang chọn. */
export interface Snapshot {
  text: string;
  layout: LayoutFile;
  sticky: Record<string, Record<string, Point>>;
  selection: DiagnosticTarget | null;
}

/** File đang mở trực tiếp từ thư mục trên máy (File System Access API). */
export interface FsBinding {
  dir: FileSystemDirectoryHandle;
  file: FileSystemFileHandle;
  /** Đường dẫn tương đối trong thư mục, để hiển thị. */
  path: string;
  /** Nội dung trên đĩa lần đọc/ghi gần nhất — phát hiện file bị đổi bên ngoài. */
  diskText: string;
  diskLayout: string | null;
}

export interface Notice {
  kind: 'error' | 'info';
  message: string;
  nonce: number;
}

export interface AppState {
  text: string;
  fileName: string;
  /** Tăng khi nội dung được thay hoàn toàn (mở file, template) để editor nạp lại. */
  docVersion: number;
  /** Presentation model: vị trí node theo view (architecture.layout.yaml). */
  layout: LayoutFile;
  /** Vị trí giữ tạm trong phiên làm việc theo view — canvas không "nhảy" khi model đổi. */
  sticky: Record<string, Record<string, Point>>;

  /** Loại tài liệu của lần phân tích gần nhất (theo `kind` trong YAML). */
  kind: DocumentKind;
  model: ArchitectureModel | null;
  /** Model khi tài liệu là mind map (`model` khi đó là null). */
  mindmap: MindmapModel | null;
  diagnostics: Diagnostic[];
  svg: string | null;
  canvas: CanvasData | null;
  viewId: string | null;
  nodeCount: number;
  ranges: ElementRange[];
  membership: Record<string, string[]>;
  /** true khi YAML hiện tại lỗi cú pháp và diagram đang là bản hợp lệ gần nhất (canvas chỉ đọc). */
  stale: boolean;
  analyzing: boolean;
  durationMs: number;
  mode: Mode;

  selection: DiagnosticTarget | null;
  selectionOrigin: SelectionOrigin;
  /** Các component đang chọn trên canvas (chọn nhiều bằng Shift). */
  multiSelection: string[];
  reveal: RevealRequest | null;
  /** Yêu cầu canvas căn giữa một node. */
  focus: { id: string; nonce: number } | null;
  edit: ExternalEdit | null;
  theme: Theme;
  accent: AccentName;
  diagramPalette: DiagramPaletteName;
  canUndo: boolean;
  canRedo: boolean;
  /** Mốc "đã lưu" để biết còn thay đổi chưa lưu. */
  saved: { text: string; layout: string };
  fs: FsBinding | null;
  notice: Notice | null;
  searchOpen: boolean;

  setText(text: string): void;
  loadDocument(
    text: string,
    fileName: string,
    options?: { layout?: LayoutFile | string; fs?: FsBinding | null },
  ): void;
  setViewId(viewId: string): void;
  setMode(mode: Mode): void;
  revealLine(line: number, column?: number, focus?: boolean): void;
  select(target: DiagnosticTarget | null, origin?: SelectionOrigin): void;
  setMultiSelection(ids: string[]): void;
  /** Chạy một lệnh canvas → YAML. `confirm` trả false để hủy (ví dụ còn tham chiếu khi xóa). */
  dispatch(
    command: Command,
    options?: {
      layout?: (result: Extract<MutationResult, { ok: true }>, layout: LayoutFile) => LayoutFile;
      confirm?: (result: Extract<MutationResult, { ok: true }>) => boolean;
    },
  ): Promise<MutationResult | null>;
  /** Ghi vị trí node của view vào layout (kéo thả) — không đụng YAML. */
  commitPositions(viewId: string, positions: Record<string, Point>): void;
  /**
   * Ghi điểm gấp của một connector (null/rỗng = bỏ, quay về tự định tuyến). Ghim luôn vị trí node
   * hiện tại để HTML xuất ra dùng layout thủ công, khớp với canvas.
   */
  commitWaypoints(
    viewId: string,
    edgeId: string,
    points: Point[] | null,
    positions: Record<string, Point>,
  ): void;
  /** Bỏ ghim cả view hoặc chỉ các node chỉ định → tự sắp xếp lại. */
  relayout(viewId: string, ids?: string[]): void;
  undo(): void;
  redo(): void;
  focusElement(target: DiagnosticTarget): void;
  markSaved(): void;
  setFs(fs: FsBinding | null): void;
  notify(message: string, kind?: Notice['kind']): void;
  setSearchOpen(open: boolean): void;
  setTheme(theme: Theme): void;
  setAccent(accent: AccentName): void;
  setDiagramPalette(diagramPalette: DiagramPaletteName): void;
}

const DEBOUNCE_MS = 250;
/** Gõ YAML liên tục (nghỉ dưới ngưỡng này) được gộp thành một mục lịch sử. */
const TYPING_GROUP_MS = 500;
const HISTORY_LIMIT = 200;

/**
 * Layout dạng text để lưu/xuất; undefined nếu chưa có vị trí nào.
 * `prune`: bỏ entry của phần tử không còn tồn tại (khi lưu file); autosave giữ nguyên.
 */
export function layoutText(
  state: Pick<AppState, 'layout' | 'model'>,
  prune = true,
): string | undefined {
  const layout = prune && state.model ? pruneLayout(state.layout, state.model) : state.layout;
  return isLayoutEmpty(layout) ? undefined : serializeLayout(layout);
}

export function isDirty(state: Pick<AppState, 'text' | 'layout' | 'model' | 'saved'>): boolean {
  return state.text !== state.saved.text || (layoutText(state) ?? '') !== state.saved.layout;
}

export function currentLayoutName(state: Pick<AppState, 'fileName'>): string {
  return layoutFileName(state.fileName);
}

/** Thay đổi tối thiểu biến `a` thành `b` (một đoạn). */
export function diffText(a: string, b: string) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return { from: start, to: endA, insert: b.slice(start, endB) };
}

export const useApp = create<AppState>()((set, get) => {
  const analyzer = createAnalyzer(
    (result) => {
      if (!result.model && !result.mindmap) {
        // Giữ diagram và model hợp lệ gần nhất (nếu cùng loại tài liệu); chỉ cập nhật diagnostics.
        const sameKind = get().kind === result.kind;
        const hasDiagram = sameKind && (get().svg !== null || get().canvas !== null);
        set({
          kind: result.kind,
          ...(sameKind ? {} : { model: null, mindmap: null, svg: null, canvas: null }),
          diagnostics: result.diagnostics,
          stale: hasDiagram,
          durationMs: result.durationMs,
          ranges: [],
        });
        return;
      }
      const view = result.view;
      const sticky = { ...get().sticky };
      if (view?.canvas) {
        sticky[view.id] = Object.fromEntries(
          view.canvas.nodes.map((n) => [n.id, { x: n.x, y: n.y }]),
        );
      }
      set({
        kind: result.kind,
        model: result.model,
        mindmap: result.mindmap,
        diagnostics: result.diagnostics,
        svg: view?.svg ?? null,
        canvas: view?.canvas ?? null,
        viewId: view?.id ?? null,
        nodeCount: view?.nodeCount ?? 0,
        ranges: result.ranges,
        membership: result.membership,
        sticky,
        stale: false,
        durationMs: result.durationMs,
      });
    },
    (analyzing) => set({ analyzing }),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (immediate = false) => {
    clearTimeout(timer);
    const run = () => {
      const { text, viewId, mode, layout, sticky } = get();
      const positions: Record<string, ViewPositions> = {};
      for (const id of new Set([...Object.keys(layout.views), ...Object.keys(sticky)])) {
        positions[id] = {
          pinned: layout.views[id]?.nodes ?? {},
          sticky: sticky[id] ?? {},
          waypoints: layout.views[id]?.edges ?? {},
        };
      }
      analyzer.request({ text, viewId, mode, positions });
    };
    if (immediate) run();
    else timer = setTimeout(run, DEBOUNCE_MS);
  };

  // --- Lịch sử chung cho YAML editor và canvas
  let past: Snapshot[] = [];
  let future: Snapshot[] = [];
  let lastKind: string | null = null;
  let lastTime = 0;

  const snapshot = (): Snapshot => {
    const { text, layout, sticky, selection } = get();
    return { text, layout, sticky, selection };
  };
  const syncHistory = () => set({ canUndo: past.length > 0, canRedo: future.length > 0 });
  const record = (kind: 'typing' | 'command' | 'layout') => {
    const now = Date.now();
    const coalesce = kind === 'typing' && lastKind === 'typing' && now - lastTime < TYPING_GROUP_MS;
    lastKind = kind;
    lastTime = now;
    if (coalesce) return;
    past.push(snapshot());
    if (past.length > HISTORY_LIMIT) past.shift();
    future = [];
    syncHistory();
  };
  const resetHistory = () => {
    past = [];
    future = [];
    lastKind = null;
    syncHistory();
  };

  /** Đổi text từ ngoài editor; editor nhận `changes` và áp thành một transaction. */
  const applyText = (text: string, changes?: ExternalEdit['changes'], cursor?: number) => {
    const prev = get().text;
    if (text === prev) return;
    const edit: ExternalEdit = {
      changes: changes ?? [diffText(prev, text)],
      cursor,
      nonce: Date.now() + Math.random(),
    };
    set({ text, edit });
  };

  const restore = (s: Snapshot) => {
    const { from, insert } = diffText(get().text, s.text);
    applyText(s.text, undefined, from + insert.length);
    set({ layout: s.layout, sticky: s.sticky, selection: s.selection, selectionOrigin: 'other' });
    lastKind = null;
    schedule(true);
  };

  return {
    text: '',
    fileName: 'architecture.yaml',
    docVersion: 0,
    layout: emptyLayout(),
    sticky: {},
    kind: 'architecture',
    model: null,
    mindmap: null,
    diagnostics: [],
    svg: null,
    canvas: null,
    viewId: null,
    nodeCount: 0,
    ranges: [],
    membership: {},
    stale: false,
    analyzing: false,
    durationMs: 0,
    mode: 'canvas',
    selection: null,
    selectionOrigin: 'other',
    multiSelection: [],
    reveal: null,
    focus: null,
    edit: null,
    theme: 'system',
    accent: DEFAULT_ACCENT,
    diagramPalette: DEFAULT_DIAGRAM_PALETTE,
    canUndo: false,
    canRedo: false,
    saved: { text: '', layout: '' },
    fs: null,
    notice: null,
    searchOpen: false,

    setText(text) {
      if (text === get().text) return;
      record('typing');
      set({ text });
      schedule();
    },
    loadDocument(text, fileName, options = {}) {
      const layout =
        typeof options.layout === 'string'
          ? parseLayout(options.layout).layout
          : (options.layout ?? emptyLayout());
      set({
        text,
        fileName,
        layout,
        sticky: {},
        fs: options.fs ?? null,
        docVersion: get().docVersion + 1,
        viewId: null,
        selection: null,
        multiSelection: [],
        svg: null,
        canvas: null,
        model: null,
        mindmap: null,
        saved: { text, layout: isLayoutEmpty(layout) ? '' : serializeLayout(layout) },
      });
      resetHistory();
      schedule(true);
    },
    setViewId(viewId) {
      set({ viewId, selection: null, multiSelection: [] });
      schedule(true);
    },
    setMode(mode) {
      if (mode === get().mode) return;
      set({ mode });
      schedule(true);
    },
    revealLine(line, column = 1, focus = true) {
      set({ reveal: { line, column, focus, nonce: Date.now() + Math.random() } });
    },
    select(selection, origin = 'other') {
      const cur = get().selection;
      if (cur?.kind === selection?.kind && cur?.id === selection?.id) return;
      set({ selection, selectionOrigin: origin });
    },
    setMultiSelection(multiSelection) {
      set({ multiSelection });
    },
    async dispatch(command, options = {}) {
      if (get().stale) {
        get().notify('YAML đang lỗi cú pháp — sửa lỗi trong editor trước khi sửa trên canvas');
        return null;
      }
      const base = get().text;
      const selectionBefore = get().selection;
      let result = await core.applyCommand(base, command);
      // Người dùng gõ thêm trong lúc Worker chạy → áp lại trên text mới nhất.
      if (get().text !== base) result = await core.applyCommand(get().text, command);
      if (!result.ok) {
        get().notify(result.error);
        return result;
      }
      if (options.confirm && !options.confirm(result)) return null;
      if (!result.changes.length && !options.layout) return result;

      record('command');
      let { layout, sticky } = get();
      const rename =
        command.type === 'renameId' && command.kind === 'component'
          ? { from: command.from, to: command.to }
          : command.type === 'updateField' &&
              command.field === 'id' &&
              command.target.kind === 'component'
            ? { from: command.target.id, to: String(command.value) }
            : undefined;
      if (rename) {
        layout = renameInLayout(layout, rename.from, rename.to);
        sticky = Object.fromEntries(
          Object.entries(sticky).map(([v, pos]) => [
            v,
            Object.fromEntries(
              Object.entries(pos).map(([id, p]) => [id === rename.from ? rename.to : id, p]),
            ),
          ]),
        );
      }
      if (options.layout) layout = options.layout(result, layout);
      applyText(result.text, result.changes);
      set({
        layout,
        sticky,
        // Chọn phần tử vừa tạo — trừ khi người dùng đã chọn thứ khác trong lúc Worker chạy.
        ...(result.select && get().selection === selectionBefore
          ? { selection: result.select, selectionOrigin: 'other' as const }
          : {}),
      });
      schedule(true);
      return result;
    },
    commitPositions(viewId, positions) {
      const { layout } = get();
      const current = layout.views[viewId]?.nodes ?? {};
      const nodes = { ...current, ...positions };
      if (
        Object.entries(positions).every(
          ([id, p]) => current[id]?.x === p.x && current[id]?.y === p.y,
        )
      )
        return;
      record('layout');
      set({
        layout: {
          ...layout,
          views: { ...layout.views, [viewId]: { nodes, edges: layout.views[viewId]?.edges ?? {} } },
        },
        sticky: { ...get().sticky, [viewId]: { ...get().sticky[viewId], ...positions } },
      });
      schedule(true);
    },
    commitWaypoints(viewId, edgeId, points, positions) {
      const { layout } = get();
      const view = layout.views[viewId];
      const edges = { ...view?.edges };
      const next = points?.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
      if (next?.length) edges[edgeId] = next;
      else if (edgeId in edges) delete edges[edgeId];
      else return;
      record('layout');
      set({
        layout: {
          ...layout,
          views: { ...layout.views, [viewId]: { nodes: { ...view?.nodes, ...positions }, edges } },
        },
        sticky: { ...get().sticky, [viewId]: { ...get().sticky[viewId], ...positions } },
      });
      schedule(true);
    },
    relayout(viewId, ids) {
      const { layout, sticky } = get();
      const drop = (pos: Record<string, Point> | undefined) =>
        ids
          ? Object.fromEntries(Object.entries(pos ?? {}).filter(([id]) => !ids.includes(id)))
          : {};
      record('layout');
      set({
        layout: {
          ...layout,
          views: {
            ...layout.views,
            [viewId]: {
              nodes: drop(layout.views[viewId]?.nodes),
              edges: ids ? (layout.views[viewId]?.edges ?? {}) : {},
            },
          },
        },
        sticky: { ...sticky, [viewId]: drop(sticky[viewId]) },
      });
      schedule(true);
    },
    undo() {
      const prev = past.pop();
      if (!prev) return;
      future.push(snapshot());
      restore(prev);
      syncHistory();
    },
    redo() {
      const next = future.pop();
      if (!next) return;
      past.push(snapshot());
      restore(next);
      syncHistory();
    },
    focusElement(target) {
      const { model, membership, viewId, select, revealLine } = get();
      if (target.kind === 'component') {
        const views = membership[target.id] ?? [];
        if (viewId && views.length && !views.includes(viewId)) get().setViewId(views[0]!);
      }
      select(target, 'other');
      set({ focus: { id: target.id, nonce: Date.now() + Math.random() } });
      const list =
        target.kind === 'component'
          ? model?.components
          : target.kind === 'group'
            ? model?.groups
            : model?.relationships;
      const source = (
        list as { id: string; source?: { line: number; column: number } }[] | undefined
      )?.find((el) => el.id === target.id)?.source;
      if (source) revealLine(source.line, source.column, false);
    },
    markSaved() {
      set({ saved: { text: get().text, layout: layoutText(get()) ?? '' } });
    },
    setFs(fs) {
      set({ fs });
    },
    notify(message, kind = 'error') {
      set({ notice: { message, kind, nonce: Date.now() + Math.random() } });
    },
    setSearchOpen(searchOpen) {
      set({ searchOpen });
    },
    setTheme(theme) {
      set({ theme });
    },
    setAccent(accent) {
      set({ accent });
    },
    setDiagramPalette(diagramPalette) {
      set({ diagramPalette });
    },
  };
});
