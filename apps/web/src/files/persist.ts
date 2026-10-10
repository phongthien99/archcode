import { get, set } from 'idb-keyval';
import { useApp, type Theme } from '../store';

const DOC_KEY = 'archcode:document';
const THEME_KEY = 'archcode:theme';

interface SavedDocument {
  text: string;
  fileName: string;
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

/** Autosave nội dung vào IndexedDB (debounce 500ms) và theme vào localStorage. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return useApp.subscribe((state, prev) => {
    if (state.theme !== prev.theme) localStorage.setItem(THEME_KEY, state.theme);
    if (state.text === prev.text && state.fileName === prev.fileName) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const doc: SavedDocument = {
        text: state.text,
        fileName: state.fileName,
        savedAt: Date.now(),
      };
      set(DOC_KEY, doc).catch(() => undefined);
    }, 500);
  });
}
