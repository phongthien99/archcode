import { accentColors, accents, diagramPalettes, typeColor } from '@archcode/core/tokens';
import { useEffect, useRef, useState } from 'react';
import { useApp, type AccentName, type DiagramPaletteName, type Theme } from '../store';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Hệ thống' },
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
];

/** Vài loại tiêu biểu để xem trước một bảng màu diagram. */
const PREVIEW_TYPES = ['person', 'service', 'database', 'queue', 'cache'];

/** Nút "Giao diện" trên toolbar: theme sáng/tối, màu nhấn của UI, bảng màu node diagram. */
export function AppearanceMenu() {
  const theme = useApp((s) => s.theme);
  const accent = useApp((s) => s.accent);
  const diagramPalette = useApp((s) => s.diagramPalette);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const app = useApp.getState();
  return (
    <div className="appearance" ref={root}>
      <button aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <span className="swatch" aria-hidden /> Giao diện
      </button>
      {open && (
        <div className="appearance-panel" role="dialog" aria-label="Giao diện">
          <fieldset>
            <legend>Theme</legend>
            <div className="segmented" role="radiogroup" aria-label="Theme">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  role="radio"
                  aria-checked={theme === t.value}
                  className={theme === t.value ? 'active' : ''}
                  onClick={() => app.setTheme(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Màu nhấn</legend>
            <div className="accent-swatches" role="radiogroup" aria-label="Màu nhấn">
              {(Object.keys(accents) as AccentName[]).map((name) => (
                <button
                  key={name}
                  role="radio"
                  aria-checked={accent === name}
                  aria-label={accents[name].label}
                  title={accents[name].label}
                  className="accent-swatch"
                  style={{ background: accentColors(name, 'light').accent }}
                  onClick={() => app.setAccent(name)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Màu diagram</legend>
            <div className="palette-options" role="radiogroup" aria-label="Màu diagram">
              {(Object.keys(diagramPalettes) as DiagramPaletteName[]).map((name) => (
                <button
                  key={name}
                  role="radio"
                  aria-checked={diagramPalette === name}
                  className={diagramPalette === name ? 'active' : ''}
                  onClick={() => app.setDiagramPalette(name)}
                >
                  <span className="palette-preview" aria-hidden>
                    {PREVIEW_TYPES.map((type) => (
                      <span
                        key={type}
                        style={{ background: typeColor(type, 'light', name).fill }}
                      />
                    ))}
                  </span>
                  {diagramPalettes[name].label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
