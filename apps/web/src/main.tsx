import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { restore, restoreTheme, startAutosave } from './files/persist';
import { useApp } from './store';
import { TEMPLATES } from './templates';
import './styles.css';

async function boot() {
  // Khôi phục bản đang làm dở; lần đầu mở thì dùng template mẫu.
  const saved = await restore();
  const state = useApp.getState();
  state.setTheme(restoreTheme());
  if (saved?.text) state.loadDocument(saved.text, saved.fileName);
  else state.loadDocument(TEMPLATES[0]!.text, TEMPLATES[0]!.fileName);
  startAutosave();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
