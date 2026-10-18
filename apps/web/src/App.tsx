import { useEffect, useRef, useState } from 'react';
import { YamlEditor } from './editor/YamlEditor';
import { checkExternalChanges, readPickedFiles, save } from './files/fs';
import { DiagnosticsPanel } from './panels/Diagnostics';
import { SearchDialog } from './panels/SearchDialog';
import { Toolbar } from './panels/Toolbar';
import { Workspace } from './panels/Workspace';
import { useApp } from './store';

export function App() {
  const theme = useApp((s) => s.theme);
  const accent = useApp((s) => s.accent);
  const diagramPalette = useApp((s) => s.diagramPalette);
  const notice = useApp((s) => s.notice);
  const [split, setSplit] = useState(34);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<{ kind: 'error' | 'info'; message: string } | null>(null);
  const main = useRef<HTMLDivElement>(null);
  const setError = (message: string | null) =>
    setToast(message ? { kind: 'error', message } : null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  useEffect(() => {
    document.documentElement.dataset.diagram = diagramPalette;
  }, [diagramPalette]);

  useEffect(() => {
    if (notice) setToast({ kind: notice.kind, message: notice.message });
  }, [notice]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Phím tắt toàn cục: undo/redo chung cho editor và canvas (S5-HIST-02), lưu, tìm kiếm.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      // Ô nhập của property panel/tìm kiếm giữ undo riêng của trình duyệt.
      const nativeField =
        !!target?.closest('input, textarea, select') && !target.closest('.cm-editor');
      const state = useApp.getState();
      if (key === 's') {
        e.preventDefault();
        save().catch((err: Error) => setError(err.message));
      } else if (key === 'k') {
        e.preventDefault();
        state.setSearchOpen(true);
      } else if (nativeField) {
        return;
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        state.undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        state.redo();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Quay lại tab: phát hiện file bị đổi bên ngoài (S5-FS-03).
  useEffect(() => {
    let busy = false;
    const check = () => {
      if (busy || document.visibilityState !== 'visible' || !useApp.getState().fs) return;
      busy = true;
      checkExternalChanges(async (path) =>
        confirm(
          `"${path}" đã thay đổi bên ngoài (git pull, editor khác).\n\n` +
            'OK: nạp lại từ đĩa (bỏ thay đổi chưa lưu)\nHủy: giữ bản đang sửa',
        ),
      )
        .catch((err: Error) => setError(err.message))
        .finally(() => (busy = false));
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  const onSplitterDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const box = main.current!.getBoundingClientRect();
      setSplit(Math.min(75, Math.max(20, ((ev.clientX - box.left) / box.width) * 100)));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    try {
      const doc = await readPickedFiles(files);
      if (doc) useApp.getState().loadDocument(doc.text, doc.fileName, { layout: doc.layout });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <Toolbar onError={setError} />
      <div className="main" ref={main} style={{ gridTemplateColumns: `${split}% 6px 1fr` }}>
        <YamlEditor />
        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(split)}
          onPointerDown={onSplitterDown}
        />
        <Workspace />
      </div>
      <DiagnosticsPanel />
      <SearchDialog />
      {toast && (
        <div
          className={`toast ${toast.kind}`}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          onClick={() => setToast(null)}
        >
          {toast.message}
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          Thả file .yaml (kèm .layout.yaml) hoặc .html của ArchCode vào đây
        </div>
      )}
    </div>
  );
}
