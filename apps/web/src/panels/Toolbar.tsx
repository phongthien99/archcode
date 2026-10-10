import { useRef } from 'react';
import { baseName, download, readArchitectureFile, svgToPng } from '../files/files';
import { useApp, type Theme } from '../store';
import { BLANK_TEMPLATE, TEMPLATES } from '../templates';
import { core } from '../worker/client';

export function Toolbar({ onError }: { onError: (message: string) => void }) {
  const fileName = useApp((s) => s.fileName);
  const model = useApp((s) => s.model);
  const viewId = useApp((s) => s.viewId);
  const theme = useApp((s) => s.theme);
  const analyzing = useApp((s) => s.analyzing);
  const durationMs = useApp((s) => s.durationMs);
  const input = useRef<HTMLInputElement>(null);

  const run = (task: () => Promise<void>) => () =>
    task().catch((err: Error) => onError(err.message));

  const loadTemplate = (id: string) => {
    const template = TEMPLATES.find((t) => t.id === id);
    const text = template?.text ?? BLANK_TEMPLATE;
    if (useApp.getState().text.trim() && !confirm('Thay nội dung hiện tại bằng mẫu mới?')) return;
    useApp.getState().loadDocument(text, template?.fileName ?? 'architecture.yaml');
  };

  const exportHtml = async (open: boolean) => {
    const { text, fileName } = useApp.getState();
    const html = await core.exportHtml(text, fileName);
    if (open) {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      download(html, `${baseName(fileName)}.html`, 'text/html');
    }
  };

  const exportImage = async (format: 'svg' | 'png') => {
    const { text, fileName, viewId } = useApp.getState();
    const svg = await core.standaloneSvg(text, viewId);
    if (!svg) throw new Error('Chưa có diagram để xuất — sửa lỗi YAML trước');
    const name = `${baseName(fileName)}${viewId ? `.${viewId}` : ''}.${format}`;
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

      <button type="button" onClick={() => input.current?.click()}>
        Mở…
      </button>
      <input
        ref={input}
        type="file"
        accept=".yaml,.yml,.html,.htm"
        hidden
        data-testid="file-input"
        onChange={run(async () => {
          const file = input.current?.files?.[0];
          input.current!.value = '';
          if (!file) return;
          const doc = await readArchitectureFile(file);
          useApp.getState().loadDocument(doc.text, doc.fileName);
        })}
      />
      <button type="button" onClick={() => download(useApp.getState().text, fileName, 'text/yaml')}>
        Lưu YAML
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
      <button type="button" onClick={run(() => exportHtml(true))}>
        Xem HTML
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

      <span className="spacer" />
      <span className="file-name" title="Tên file">
        {fileName}
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
    </header>
  );
}
