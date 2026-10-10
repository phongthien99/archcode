import { layoutFileName } from '@archcode/core/canvas';
import { useEffect, useRef, useState } from 'react';
import { baseName, download, svgToPng } from '../files/files';
import {
  listArchitectureFiles,
  openEntry,
  pickDirectory,
  readPickedFiles,
  recentFolders,
  reopenFolder,
  save,
  supportsFolders,
  type ArchitectureEntry,
  type RecentFolder,
} from '../files/fs';
import { currentLayoutName, isDirty, layoutText, useApp, type Theme } from '../store';
import { BLANK_TEMPLATE, TEMPLATES } from '../templates';
import { core } from '../worker/client';

const FOLDER_UNSUPPORTED =
  'Trình duyệt này chưa hỗ trợ mở thư mục (File System Access API — chỉ có trên Chrome/Edge). ' +
  'Hãy dùng "Mở…" (chọn cả file .yaml và .layout.yaml) và "Lưu" (tải về hai file).';

export function Toolbar({ onError }: { onError: (message: string) => void }) {
  const fileName = useApp((s) => s.fileName);
  const fs = useApp((s) => s.fs);
  const model = useApp((s) => s.model);
  const viewId = useApp((s) => s.viewId);
  const theme = useApp((s) => s.theme);
  const analyzing = useApp((s) => s.analyzing);
  const durationMs = useApp((s) => s.durationMs);
  const canUndo = useApp((s) => s.canUndo);
  const canRedo = useApp((s) => s.canRedo);
  const dirty = useApp(isDirty);
  const input = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<{ folder: string; list: ArchitectureEntry[] } | null>(
    null,
  );
  const [recent, setRecent] = useState<RecentFolder[]>([]);

  useEffect(() => {
    if (supportsFolders()) void recentFolders().then(setRecent);
  }, [fs]);

  const run = (task: () => Promise<void>) => () =>
    task().catch((err: Error) => {
      if (err.name !== 'AbortError') onError(err.message);
    });

  const loadTemplate = (id: string) => {
    const template = TEMPLATES.find((t) => t.id === id);
    const text = template?.text ?? BLANK_TEMPLATE;
    if (useApp.getState().text.trim() && !confirm('Thay nội dung hiện tại bằng mẫu mới?')) return;
    useApp.getState().loadDocument(text, template?.fileName ?? 'architecture.yaml');
  };

  const browse = async (dir: FileSystemDirectoryHandle) => {
    const list = await listArchitectureFiles(dir);
    if (!list.length)
      throw new Error(
        `Thư mục "${dir.name}" không có file kiến trúc (*.yaml có "version" và "system")`,
      );
    if (list.length === 1) await openEntry(list[0]!);
    else setEntries({ folder: dir.name, list });
  };

  const openFolder = async () => {
    if (!supportsFolders()) {
      useApp.getState().notify(FOLDER_UNSUPPORTED, 'info');
      return;
    }
    if (isDirty(useApp.getState()) && !confirm('Có thay đổi chưa lưu. Vẫn mở thư mục khác?'))
      return;
    await browse(await pickDirectory());
  };

  const exportHtml = async (open: boolean) => {
    const state = useApp.getState();
    const html = await core.exportHtml(state.text, {
      sourceName: state.fileName,
      layout: layoutText(state),
      layoutName: currentLayoutName(state),
    });
    if (open) {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      download(html, `${baseName(state.fileName)}.html`, 'text/html');
    }
  };

  const exportImage = async (format: 'svg' | 'png') => {
    const state = useApp.getState();
    const svg = await core.standaloneSvg(state.text, state.viewId, layoutText(state));
    if (!svg) throw new Error('Chưa có diagram để xuất — sửa lỗi YAML trước');
    const name = `${baseName(state.fileName)}${state.viewId ? `.${state.viewId}` : ''}.${format}`;
    if (format === 'svg') download(svg, name, 'image/svg+xml');
    else download(await svgToPng(svg), name, 'image/png');
  };

  return (
    <header className="toolbar">
      <div className="brand" title="ArchCode — Architecture as Code">
        <span className="logo" aria-hidden>
          ◆
        </span>{' '}
        ArchCode
      </div>

      <select
        aria-label="Tạo mới từ mẫu"
        value=""
        onChange={(e) => loadTemplate(e.target.value)}
        data-testid="template-select"
      >
        <option value="" disabled>
          Mới từ mẫu…
        </option>
        <option value="blank">Trống</option>
        {TEMPLATES.map((t) => (
          <option key={t.id} value={t.id} title={t.description}>
            {t.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => input.current?.click()}
        title="Mở file .yaml (kèm .layout.yaml) hoặc .html đã xuất"
      >
        Mở…
      </button>
      <input
        ref={input}
        type="file"
        accept=".yaml,.yml,.html,.htm"
        multiple
        hidden
        data-testid="file-input"
        onChange={run(async () => {
          const files = [...(input.current?.files ?? [])];
          input.current!.value = '';
          const doc = await readPickedFiles(files);
          if (doc) useApp.getState().loadDocument(doc.text, doc.fileName, { layout: doc.layout });
        })}
      />
      <button
        type="button"
        onClick={run(openFolder)}
        data-testid="open-folder"
        title="Mở và sửa trực tiếp file trong thư mục repo"
      >
        Mở thư mục…
      </button>
      {recent.length > 0 && (
        <select
          aria-label="Thư mục gần đây"
          value=""
          onChange={(e) => {
            const folder = recent[Number(e.target.value)];
            if (folder) void run(async () => browse(await reopenFolder(folder)))();
          }}
        >
          <option value="" disabled>
            Gần đây…
          </option>
          {recent.map((f, i) => (
            <option key={i} value={i}>
              {f.name}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={run(save)}
        data-testid="save"
        title={
          fs
            ? `Lưu vào ${fs.path} (Ctrl+S)`
            : `Tải về ${fileName} và ${layoutFileName(fileName)} (Ctrl+S)`
        }
      >
        Lưu
        {dirty && (
          <span className="dirty" aria-label="chưa lưu">
            {' '}
            ●
          </span>
        )}
      </button>

      <span className="sep" />
      <button
        type="button"
        onClick={() => useApp.getState().undo()}
        disabled={!canUndo}
        title="Hoàn tác (Ctrl+Z)"
        aria-label="Hoàn tác"
      >
        ↶
      </button>
      <button
        type="button"
        onClick={() => useApp.getState().redo()}
        disabled={!canRedo}
        title="Làm lại (Ctrl+Shift+Z)"
        aria-label="Làm lại"
      >
        ↷
      </button>

      <span className="sep" />
      <button
        type="button"
        className="primary"
        onClick={run(() => exportHtml(false))}
        data-testid="export-html"
      >
        Xuất HTML
      </button>
      <button type="button" onClick={run(() => exportHtml(true))} title="Mở bản HTML trong tab mới">
        Xem
      </button>
      <button type="button" onClick={run(() => exportImage('svg'))}>
        SVG
      </button>
      <button type="button" onClick={run(() => exportImage('png'))}>
        PNG
      </button>

      <span className="sep" />
      {model && model.views.length > 0 && (
        <label className="view-select">
          View
          <select
            value={viewId ?? ''}
            onChange={(e) => useApp.getState().setViewId(e.target.value)}
            data-testid="view-select"
          >
            {model.views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        onClick={() => useApp.getState().setSearchOpen(true)}
        title="Tìm component/group (Ctrl+K)"
      >
        Tìm
      </button>

      <span className="spacer" />
      <span className="file-name" title={fs ? `Thư mục ${fs.dir.name}: ${fs.path}` : 'Tên file'}>
        {fs ? `📁 ${fs.path}` : fileName}
      </span>
      <span className="status" aria-live="polite">
        {analyzing ? 'Đang phân tích…' : `${durationMs} ms`}
      </span>
      <select
        aria-label="Giao diện"
        value={theme}
        onChange={(e) => useApp.getState().setTheme(e.target.value as Theme)}
      >
        <option value="system">Theo hệ thống</option>
        <option value="light">Sáng</option>
        <option value="dark">Tối</option>
      </select>

      {entries && (
        <div className="modal-backdrop" onMouseDown={() => setEntries(null)}>
          <div
            className="folder-dialog"
            role="dialog"
            aria-label="Chọn file kiến trúc"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2>Thư mục {entries.folder}</h2>
            <p>Chọn file kiến trúc để mở:</p>
            <ul>
              {entries.list.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={run(async () => {
                      setEntries(null);
                      await openEntry(entry);
                    })}
                  >
                    {entry.path}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setEntries(null)}>
              Đóng
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
