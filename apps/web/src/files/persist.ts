import { get, set } from 'idb-keyval';
import { accents, diagramPalettes } from '@archcode/core/tokens';
import { layoutText, useApp, type AccentName, type DiagramPaletteName, type Theme } from '../store';

const DOC_KEY = 'archcode:document';
const THEME_KEY = 'archcode:theme';
const ACCENT_KEY = 'archcode:accent';
const DIAGRAM_KEY = 'archcode:diagram-palette';

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

/** Autosave nội dung + layout vào IndexedDB (debounce 500ms) và theme vào localStorage. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return useApp.subscribe((state, prev) => {
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
