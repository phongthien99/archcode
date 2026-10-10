import { layoutView, renderSvg, resolveView, validate, type Diagnostic } from '@archcode/core';
import { installElkShim } from './worker/elk-shim';

const ROOT_SELECTOR = '.archcode-viewer,[data-archcode-viewer]';
const SOURCE_SELECTOR = '.archcode-source,[data-archcode-source]';
const OUTPUT_SELECTOR = '.archcode-output,[data-archcode-output]';
const DIAGNOSTICS_SELECTOR = '.archcode-diagnostics,[data-archcode-diagnostics]';
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
    const layout = await layoutView(resolveView(result.model, view));
    output.innerHTML = renderSvg(layout, {
      diagnostics: result.diagnostics,
      idPrefix: `hugo-${index}-`,
      title: view.name,
    });
    renderMessages(diagnostics, issues, result.diagnostics);
  } catch (err) {
    showError(output, diagnostics, `Could not render diagram: ${(err as Error).message}`);
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
  font: 0.9rem/1.45 system-ui, sans-serif;
}
.archcode-diagnostics {
  display: grid;
  gap: 0.25rem;
}
.archcode-diagnostic-error,
.archcode-error {
  color: #b42318;
}
.archcode-diagnostic-warning {
  color: #a15c07;
}
`;
  document.head.appendChild(style);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void renderAll());
} else {
  void renderAll();
}
