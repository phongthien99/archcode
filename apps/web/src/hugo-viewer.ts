import {
  checkLayout,
  layoutView,
  parseLayout,
  renderSvg,
  resolveView,
  validate,
  viewLayout,
  type Diagnostic,
  type LayoutFile,
} from '@archcode/core';
import { font, palette } from '@archcode/core/tokens';
import { installElkShim } from './worker/elk-shim';

const ROOT_SELECTOR = '.archcode-viewer,[data-archcode-viewer]';
const SOURCE_SELECTOR = '.archcode-source,[data-archcode-source]';
const OUTPUT_SELECTOR = '.archcode-output,[data-archcode-output]';
const DIAGNOSTICS_SELECTOR = '.archcode-diagnostics,[data-archcode-diagnostics]';
const LAYOUT_SELECTOR = '.archcode-layout,[data-archcode-layout]';
const STYLE_ID = 'archcode-hugo-viewer-style';

installElkShim();

export interface RenderOptions {
  root?: ParentNode;
}

export async function renderAll(options: RenderOptions = {}): Promise<void> {
  installStyle();
  const root = options.root ?? document;
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(ROOT_SELECTOR));
  await Promise.all(blocks.map((block, index) => renderBlock(block, index)));
}

export async function renderBlock(block: HTMLElement, index = 0): Promise<void> {
  const source = block.querySelector<HTMLElement>(SOURCE_SELECTOR);
  const output = ensureChild(block, OUTPUT_SELECTOR, 'div', 'archcode-output');
  const diagnostics = ensureChild(block, DIAGNOSTICS_SELECTOR, 'div', 'archcode-diagnostics');
  const requestedView = block.dataset.view?.trim() || undefined;

  block.classList.add('archcode-js');
  setSourceVisibility(block, source);
  diagnostics.textContent = '';
  output.innerHTML = '<div class="archcode-loading">Rendering diagram...</div>';

  if (!source) {
    showError(output, diagnostics, 'Missing .archcode-source block.');
    return;
  }

  const text = normalizeSource(source.textContent ?? '');
  const result = validate(text);
  const issues: string[] = [];

  if (!result.model) {
    showDiagnostics(output, diagnostics, result.diagnostics);
    return;
  }

  const view =
    (requestedView && result.model.views.find((candidate) => candidate.id === requestedView)) ||
    result.model.views[0];
  if (!view) {
    showError(output, diagnostics, 'No view is available in this architecture document.');
    return;
  }
  if (requestedView && view.id !== requestedView) {
    issues.push(`View "${requestedView}" was not found; rendering "${view.id}" instead.`);
  }

  try {
    // Vị trí kéo thả từ file `.layout.yaml` (data-layout-src hoặc khối .archcode-layout); không có → auto-layout ELK.
    const saved = await loadLayout(block, issues);
    const layoutDiagnostics = saved ? checkLayout(saved.layout, result.model) : [];
    const { nodes, edges } = viewLayout(saved?.layout, view.id);
    const layout = await layoutView(resolveView(result.model, view), {
      positions: nodes,
      waypoints: edges,
      // Hugo viewer không nhúng libavoid (xem libavoid-stub.ts).
      avoidNodes: false,
    });
    output.innerHTML = renderSvg(layout, {
      diagnostics: result.diagnostics,
      idPrefix: `hugo-${index}-`,
      title: view.name,
    });
    renderMessages(diagnostics, issues, [
      ...result.diagnostics,
      ...(saved?.diagnostics ?? []),
      ...layoutDiagnostics,
    ]);
  } catch (err) {
    showError(output, diagnostics, `Could not render diagram: ${(err as Error).message}`);
  }
}

async function loadLayout(
  block: HTMLElement,
  issues: string[],
): Promise<{ layout: LayoutFile; diagnostics: Diagnostic[] } | undefined> {
  const inline = block.querySelector<HTMLElement>(LAYOUT_SELECTOR);
  if (inline) {
    inline.hidden = true;
    return parseLayout(normalizeSource(inline.textContent ?? ''));
  }
  const src = block.dataset.layoutSrc?.trim();
  if (!src) return undefined;
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseLayout(await response.text(), src);
  } catch (err) {
    issues.push(`Could not load layout "${src}" (${(err as Error).message}); using auto-layout.`);
    return undefined;
  }
}

function ensureChild<K extends keyof HTMLElementTagNameMap>(
  block: HTMLElement,
  selector: string,
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const existing = block.querySelector<HTMLElementTagNameMap[K]>(selector);
  if (existing) return existing;
  const child = document.createElement(tag);
  child.className = className;
  block.appendChild(child);
  return child;
}

function setSourceVisibility(block: HTMLElement, source: HTMLElement | null): void {
  if (!source) return;
  const showSource = block.dataset.showSource;
  if (showSource === 'false' || showSource === '0') source.hidden = true;
}

function normalizeSource(text: string): string {
  return text.replace(/^\n+|\s+$/g, '');
}

function showError(output: HTMLElement, diagnostics: HTMLElement, message: string): void {
  output.innerHTML = `<div class="archcode-error">${escapeHtml(message)}</div>`;
  diagnostics.innerHTML = `<p class="archcode-diagnostic archcode-diagnostic-error">${escapeHtml(message)}</p>`;
}

function showDiagnostics(output: HTMLElement, diagnostics: HTMLElement, items: Diagnostic[]): void {
  output.innerHTML = '<div class="archcode-error">Architecture YAML has errors.</div>';
  renderMessages(diagnostics, [], items);
}

function renderMessages(target: HTMLElement, messages: string[], diagnostics: Diagnostic[]): void {
  const visibleDiagnostics = diagnostics.filter((item) => item.severity !== 'info');
  if (!messages.length && !visibleDiagnostics.length) {
    target.textContent = '';
    return;
  }
  target.innerHTML = [
    ...messages.map((message) => diagnosticHtml('warning', message)),
    ...visibleDiagnostics.map((item) => diagnosticHtml(item.severity, formatDiagnostic(item))),
  ].join('');
}

function diagnosticHtml(severity: string, message: string): string {
  return `<p class="archcode-diagnostic archcode-diagnostic-${escapeHtml(severity)}">${escapeHtml(message)}</p>`;
}

function formatDiagnostic(item: Diagnostic): string {
  const location =
    item.line !== undefined
      ? `line ${item.line}${item.column !== undefined ? `:${item.column}` : ''}: `
      : '';
  return `${location}${item.message}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.archcode-viewer {
  display: grid;
  gap: 0.75rem;
  margin: 1rem 0;
}
.archcode-output {
  overflow: auto;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 8px;
  padding: 0.75rem;
}
.archcode-output svg {
  display: block;
  max-width: 100%;
  height: auto;
}
.archcode-source {
  overflow: auto;
  margin: 0;
  padding: 0.75rem;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 8%, transparent);
}
.archcode-diagnostic,
.archcode-loading,
.archcode-error {
  margin: 0;
  font: 0.9rem/1.45 ${font.sans};
}
.archcode-diagnostics {
  display: grid;
  gap: 0.25rem;
}
.archcode-diagnostic-error,
.archcode-error {
  color: ${palette.red[700]};
}
.archcode-diagnostic-warning {
  color: ${palette.amber[700]};
}
`;
  document.head.appendChild(style);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void renderAll());
} else {
  void renderAll();
}
