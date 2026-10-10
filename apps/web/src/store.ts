import type { ArchitectureModel, Diagnostic, DiagnosticTarget } from '@archcode/core';
import { create } from 'zustand';
import { createAnalyzer } from './worker/client';

export type Theme = 'system' | 'light' | 'dark';

export interface RevealRequest {
  line: number;
  column: number;
  /** Đổi mỗi lần yêu cầu để editor nhảy lại cả khi cùng dòng. */
  nonce: number;
}

export interface AppState {
  text: string;
  fileName: string;
  /** Tăng khi nội dung được thay từ bên ngoài editor (mở file, template) để editor nạp lại. */
  docVersion: number;

  model: ArchitectureModel | null;
  diagnostics: Diagnostic[];
  svg: string | null;
  viewId: string | null;
  nodeCount: number;
  /** true khi YAML hiện tại lỗi cú pháp và diagram đang là bản hợp lệ gần nhất. */
  stale: boolean;
  analyzing: boolean;
  durationMs: number;

  selection: DiagnosticTarget | null;
  reveal: RevealRequest | null;
  theme: Theme;

  setText(text: string): void;
  loadDocument(text: string, fileName: string): void;
  setViewId(viewId: string): void;
  revealLine(line: number, column?: number): void;
  select(target: DiagnosticTarget | null): void;
  setTheme(theme: Theme): void;
}

const DEBOUNCE_MS = 250;

export const useApp = create<AppState>()((set, get) => {
  const analyzer = createAnalyzer(
    (result) => {
      if (!result.model) {
        // Giữ diagram và model hợp lệ gần nhất; chỉ cập nhật diagnostics.
        set({
          diagnostics: result.diagnostics,
          stale: get().svg !== null,
          durationMs: result.durationMs,
        });
        return;
      }
      set({
        model: result.model,
        diagnostics: result.diagnostics,
        svg: result.view?.svg ?? null,
        viewId: result.view?.id ?? null,
        nodeCount: result.view?.nodeCount ?? 0,
        stale: false,
        durationMs: result.durationMs,
      });
    },
    (analyzing) => set({ analyzing }),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (immediate = false) => {
    clearTimeout(timer);
    const run = () => analyzer.request(get().text, get().viewId);
    if (immediate) run();
    else timer = setTimeout(run, DEBOUNCE_MS);
  };

  return {
    text: '',
    fileName: 'architecture.yaml',
    docVersion: 0,
    model: null,
    diagnostics: [],
    svg: null,
    viewId: null,
    nodeCount: 0,
    stale: false,
    analyzing: false,
    durationMs: 0,
    selection: null,
    reveal: null,
    theme: 'system',

    setText(text) {
      set({ text });
      schedule();
    },
    loadDocument(text, fileName) {
      set({
        text,
        fileName,
        docVersion: get().docVersion + 1,
        viewId: null,
        selection: null,
        svg: null,
        model: null,
      });
      schedule(true);
    },
    setViewId(viewId) {
      set({ viewId, selection: null });
      schedule(true);
    },
    revealLine(line, column = 1) {
      set({ reveal: { line, column, nonce: Date.now() + Math.random() } });
    },
    select(selection) {
      set({ selection });
    },
    setTheme(theme) {
      set({ theme });
    },
  };
});
