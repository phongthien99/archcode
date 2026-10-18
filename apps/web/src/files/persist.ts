import { get, set } from 'idb-keyval';
import { accents, diagramPalettes } from '@archcode/core/tokens';
import type { MindCollapsed } from '../mindmap/collapse';
import {
  layoutText,
  useApp,
  type AccentName,
  type AppState,
  type DiagramPaletteName,
  type Theme,
} from '../store';

const DOC_KEY = 'archcode:document';
const THEME_KEY = 'archcode:theme';
const ACCENT_KEY = 'archcode:accent';
const DIAGRAM_KEY = 'archcode:diagram-palette';
const MIND_KEY = 'archcode:mind-collapsed';
/** Số file nhớ trạng thái mở/đóng mind map; file dùng lâu nhất bị bỏ trước. */
const MIND_FILES_LIMIT = 50;

/** Trạng thái mở/đóng mind map theo file (đường dẫn trong thư mục, hoặc tên file). */
type MindStore = Record<string, { collapsed: MindCollapsed; at: number }>;

const fileKey = (s: Pick<AppState, 'fs' | 'fileName'>) => s.fs?.path ?? s.fileName;

interface SavedDocument {
  text: string;
  fileName: string;
  /** File layout (vị trí node) — tải lại trang vẫn giữ bố cục (S5-FS-06). */
  layout?: string;
  savedAt: number;
}

export async function restore(): Promise<SavedDocument | undefined> {
  try {
    return await get<SavedDocument>(DOC_KEY);
  } catch {
    return undefined; // IndexedDB bị chặn (chế độ riêng tư...) → bắt đầu mới.
  }
}

export function restoreTheme(): Theme {
  const theme = localStorage.getItem(THEME_KEY);
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

export function restoreAccent(): AccentName | null {
  const accent = localStorage.getItem(ACCENT_KEY);
  return accent && accent in accents ? (accent as AccentName) : null;
}

export function restoreDiagramPalette(): DiagramPaletteName | null {
  const name = localStorage.getItem(DIAGRAM_KEY);
  return name && name in diagramPalettes ? (name as DiagramPaletteName) : null;
}

/** Mở file → khôi phục trạng thái mở/đóng mind map đã lưu (nếu người dùng chưa bấm gì). */
async function restoreMindCollapsed() {
  const { docVersion } = useApp.getState();
  const key = fileKey(useApp.getState());
  const saved = await get<MindStore>(MIND_KEY).catch(() => undefined);
  const entry = saved?.[key];
  const now = useApp.getState();
  if (!entry || now.docVersion !== docVersion || Object.keys(now.mindCollapsed).length) return;
  now.setMindCollapsed(entry.collapsed);
}

async function saveMindCollapsed(key: string, collapsed: MindCollapsed) {
  const saved = (await get<MindStore>(MIND_KEY).catch(() => undefined)) ?? {};
  if (Object.keys(collapsed).length) saved[key] = { collapsed, at: Date.now() };
  else delete saved[key];
  const keep = Object.entries(saved)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MIND_FILES_LIMIT);
  await set(MIND_KEY, Object.fromEntries(keep)).catch(() => undefined);
}

/** Autosave nội dung + layout vào IndexedDB (debounce 500ms) và theme vào localStorage. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let mindTimer: ReturnType<typeof setTimeout> | undefined;
  void restoreMindCollapsed();
  return useApp.subscribe((state, prev) => {
    if (state.docVersion !== prev.docVersion) void restoreMindCollapsed();
    else if (state.mindCollapsed !== prev.mindCollapsed && state.kind === 'mindmap') {
      clearTimeout(mindTimer);
      const key = fileKey(state);
      mindTimer = setTimeout(() => void saveMindCollapsed(key, state.mindCollapsed), 300);
    }
    if (state.theme !== prev.theme) localStorage.setItem(THEME_KEY, state.theme);
    if (state.accent !== prev.accent) localStorage.setItem(ACCENT_KEY, state.accent);
    if (state.diagramPalette !== prev.diagramPalette)
      localStorage.setItem(DIAGRAM_KEY, state.diagramPalette);
    if (
      state.text === prev.text &&
      state.fileName === prev.fileName &&
      state.layout === prev.layout
    )
      return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const current = useApp.getState();
      const doc: SavedDocument = {
        text: current.text,
        fileName: current.fileName,
        layout: layoutText(current, false),
        savedAt: Date.now(),
      };
      set(DOC_KEY, doc).catch(() => undefined);
    }, 500);
  });
}
