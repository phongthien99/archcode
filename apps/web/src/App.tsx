import { darkThemeVariables, diagramCss } from '@archcode/core/theme';
import { useEffect, useRef, useState } from 'react';
import { YamlEditor } from './editor/YamlEditor';
import { readArchitectureFile } from './files/files';
import { DiagnosticsPanel } from './panels/Diagnostics';
import { Toolbar } from './panels/Toolbar';
import { Preview } from './preview/Preview';
import { useApp } from './store';

// Diagram dùng CSS variables: khai báo một lần, đổi theme không cần render lại SVG.
const DIAGRAM_STYLE = `${diagramCss()}
[data-theme=dark]{${darkThemeVariables()}}
@media (prefers-color-scheme:dark){[data-theme=system]{${darkThemeVariables()}}}`;

export function App() {
  const theme = useApp((s) => s.theme);
  const [split, setSplit] = useState(42);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const main = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

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
    const file = e.dataTransfer.files[0];
    if (!file) return;
    try {
      const doc = await readArchitectureFile(file);
      useApp.getState().loadDocument(doc.text, doc.fileName);
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
      <style>{DIAGRAM_STYLE}</style>
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
        <Preview />
      </div>
      <DiagnosticsPanel />
      {error && (
        <div className="toast" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">Thả file .yaml hoặc .html của ArchCode vào đây</div>
      )}
    </div>
  );
}
