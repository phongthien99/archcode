import {
  diagramCss,
  diagramPaletteVariants,
  diagramThemeVariables,
  mindmapCss,
  mindmapThemeVariables,
} from '@archcode/core/theme';
import { tokensCss } from '@archcode/core/tokens';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import {
  restore,
  restoreAccent,
  restoreDiagramPalette,
  restoreTheme,
  startAutosave,
} from './files/persist';
import { useApp } from './store';
import { TEMPLATES } from './templates';
import './styles.css';

// Design tokens + CSS diagram: khai báo một lần trước khi render, đổi theme chỉ cần đổi `data-theme`.
const themeStyle = document.createElement('style');
themeStyle.id = 'archcode-tokens';
themeStyle.textContent = `${tokensCss('data-theme', {
  light: `${diagramThemeVariables('light')};${mindmapThemeVariables('light')}`,
  dark: `${diagramThemeVariables('dark')};${mindmapThemeVariables('dark')}`,
  variants: diagramPaletteVariants(),
})}\n${diagramCss()}\n${mindmapCss()}`;
document.head.prepend(themeStyle);

async function boot() {
  // Khôi phục bản đang làm dở; lần đầu mở thì dùng template mẫu.
  const saved = await restore();
  const state = useApp.getState();
  state.setTheme(restoreTheme());
  const accent = restoreAccent();
  if (accent) state.setAccent(accent);
  const diagramPalette = restoreDiagramPalette();
  if (diagramPalette) state.setDiagramPalette(diagramPalette);
  if (saved?.text) state.loadDocument(saved.text, saved.fileName, { layout: saved.layout });
  else state.loadDocument(TEMPLATES[0]!.text, TEMPLATES[0]!.fileName);
  startAutosave();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
