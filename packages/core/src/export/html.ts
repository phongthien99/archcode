import { buildGraph, dependsOn, usedBy, type DependencyGraph } from '../analysis/graph';
import { layoutView } from '../layout/elk';
import { renderSvg } from '../render/svg';
import { escapeXml as h } from '../render/text';
import type { ArchitectureModel, Component, Diagnostic, ValidationResult } from '../types';
import { validate } from '../validator';
import { resolveView } from '../views/resolve';
import { pageCss } from './page.css';
import { VIEWER_JS } from './viewer';

export interface HtmlOptions {
  /** Nhúng YAML gốc để web app mở lại được file HTML (mặc định: true). */
  embedSource?: boolean;
  /** Tên file nguồn, hiển thị ở footer. */
  sourceName?: string;
  /**
   * Thời điểm sinh (chuỗi tùy ý). Mặc định không ghi để output deterministic:
   * cùng YAML → cùng HTML, diff được trong Git.
   */
  generatedAt?: string;
}

export interface HtmlResult {
  html: string;
  validation: ValidationResult;
}

const SOURCE_SCRIPT_ID = 'archcode-source';

/** Toàn bộ pipeline: YAML → validate → layout → SVG → một file HTML tự chứa. */
export async function generateHtml(text: string, options: HtmlOptions = {}): Promise<HtmlResult> {
  const validation = validate(text);
  const { model, diagnostics } = validation;

  const title = model ? model.system.name : 'Kiến trúc hệ thống';
  const body = model
    ? await renderModel(model, diagnostics, options)
    : `<main class="wrap">${renderValidation(diagnostics, options)}</main>`;

  const footer = [
    'Sinh bởi ArchCode',
    options.sourceName && `từ <code>${h(options.sourceName)}</code>`,
    options.generatedAt && `lúc ${h(options.generatedAt)}`,
  ]
    .filter(Boolean)
    .join(' ');

  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="ArchCode">
<title>${h(title)} — Kiến trúc hệ thống</title>
<style>${pageCss()}</style>
</head>
<body>
${renderHeader(model, diagnostics)}
${body}
<footer class="wrap">${footer}</footer>
${options.embedSource === false ? '' : embedSource(text, options.sourceName)}
<script>${VIEWER_JS}</script>
</body>
</html>
`;
  return { html, validation };
}

/** Đọc lại YAML đã nhúng trong file HTML export (dùng cho web app). */
export function extractSource(html: string): string | null {
  const match = new RegExp(
    `<script type="application/json" id="${SOURCE_SCRIPT_ID}">([\\s\\S]*?)</script>`,
  ).exec(html);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]!) as { format?: string; text?: unknown };
    return data.format === 'archcode/yaml' && typeof data.text === 'string' ? data.text : null;
  } catch {
    return null;
  }
}

/**
 * Nhúng YAML dạng JSON trong <script type="application/json">.
 * Escape `<` thành `<` để nội dung không bao giờ đóng được thẻ script; JSON.parse khôi phục chính xác.
 */
function embedSource(text: string, name: string | undefined): string {
  const json = JSON.stringify({ format: 'archcode/yaml', version: 1, name, text })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/json" id="${SOURCE_SCRIPT_ID}">${json}</script>`;
}

function renderHeader(model: ArchitectureModel | null, diagnostics: Diagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  const stat = (label: string, value: number, cls = '') =>
    `<div${cls ? ` class="${cls}"` : ''}><dt>${label}</dt><dd>${value}</dd></div>`;
  const stats = model
    ? stat('Component', model.components.length) +
      stat('Quan hệ', model.relationships.length) +
      stat('View', model.views.length) +
      stat('Lỗi', errors, errors ? 'err' : '') +
      stat('Cảnh báo', warnings, warnings ? 'warn' : '')
    : stat('Lỗi', errors, 'err');
  return `<header class="hero"><div class="wrap">
<div><p class="eyebrow">Tài liệu kiến trúc</p>
<h1>${h(model ? model.system.name : 'Không dựng được mô hình kiến trúc')}</h1>
${model?.system.description ? `<p class="lead">${h(model.system.description)}</p>` : model ? '' : '<p class="lead">File YAML có lỗi cú pháp hoặc cấu trúc. Xem chi tiết bên dưới.</p>'}
</div>
<dl class="stats">${stats}</dl>
</div></header>`;
}

async function renderModel(
  model: ArchitectureModel,
  diagnostics: Diagnostic[],
  options: HtmlOptions,
): Promise<string> {
  const graph = buildGraph(model);
  const hasIssues = diagnostics.some((d) => d.severity !== 'info');
  const nav = [
    ['diagrams', 'Diagram'],
    ['components', 'Component'],
    ['relationships', 'Quan hệ'],
    ...(hasIssues ? [['validation', 'Kiểm tra']] : []),
  ]
    .map(([id, label]) => `<a href="#${id}">${label}</a>`)
    .join('');

  return `<nav class="toc"><div class="wrap">${nav}</div></nav>
<main class="wrap">
${await renderDiagrams(model, diagnostics)}
${renderComponents(model, graph)}
${renderRelationships(model)}
${hasIssues ? renderValidation(diagnostics, options) : ''}
</main>`;
}

async function renderDiagrams(
  model: ArchitectureModel,
  diagnostics: Diagnostic[],
): Promise<string> {
  const panels: string[] = [];
  const tabs: string[] = [];
  for (const [i, view] of model.views.entries()) {
    const resolved = resolveView(model, view);
    const viewId = `v${i}`;
    tabs.push(
      `<button type="button" role="tab" data-view-tab="${viewId}" aria-controls="view-${viewId}">${h(view.name)}</button>`,
    );
    let canvas: string;
    if (!resolved.components.length) {
      canvas = '<div class="empty">View không có component nào.</div>';
    } else {
      const layout = await layoutView(resolved);
      const svg = renderSvg(layout, {
        diagnostics,
        idPrefix: `${viewId}-`,
        standalone: false,
        title: view.name,
      });
      // Khung giữ tỉ lệ của diagram: không dư khoảng trống khi thu nhỏ, không phóng to quá kích thước gốc.
      const w = Math.ceil(layout.width + 16);
      const hgt = Math.ceil(layout.height + 16);
      canvas = `<div class="canvas" style="aspect-ratio:${w}/${hgt};max-width:${w}px">${svg}</div>`;
    }
    panels.push(`<div class="view card" id="view-${viewId}" role="tabpanel">
<div class="view-head"><div><h3>${h(view.name)}</h3>${view.description ? `<p>${h(view.description)}</p>` : ''}</div>
<div class="zoom"><span>Kéo để di chuyển · Ctrl + cuộn để zoom</span><button type="button" data-zoom="in" title="Phóng to">+</button><button type="button" data-zoom="out" title="Thu nhỏ">−</button><button type="button" data-zoom="fit">Vừa khung</button></div></div>
${canvas}
</div>`);
  }
  return `<section id="diagrams"><h2>Diagram</h2>
${tabs.length > 1 ? `<div class="tabs" role="tablist">${tabs.join('')}</div>` : ''}
${panels.join('\n')}
</section>`;
}

function componentLinks(components: Component[]): string {
  if (!components.length) return '<span class="none">—</span>';
  return `<span class="links">${components
    .map((c) => `<a href="#c-${h(encodeURIComponent(c.id))}">${h(c.name)}</a>`)
    .join('')}</span>`;
}

function renderComponents(model: ArchitectureModel, graph: DependencyGraph): string {
  const groupName = new Map(model.groups.map((g) => [g.id, g.name]));
  const rows = model.components
    .map(
      (c) => `<tr id="c-${h(c.id)}">
<td><strong>${h(c.name)}</strong> <code>${h(c.id)}</code>${c.description ? `<div class="desc">${h(c.description)}</div>` : ''}</td>
<td><span class="pill">${h(c.type)}</span></td>
<td>${c.technology ? h(c.technology) : '<span class="none">—</span>'}</td>
<td>${c.group ? h(groupName.get(c.group) ?? c.group) : '<span class="none">—</span>'}</td>
<td>${c.owner ? h(c.owner) : '<span class="none">—</span>'}</td>
<td>${componentLinks(dependsOn(graph, c.id))}</td>
<td>${componentLinks(usedBy(graph, c.id))}</td>
</tr>`,
    )
    .join('\n');
  return `<section id="components"><h2>Component (${model.components.length})</h2>
<div class="card" style="overflow-x:auto">${
    model.components.length
      ? `<table><thead><tr><th>Component</th><th>Loại</th><th>Công nghệ</th><th>Group</th><th>Owner</th><th>Phụ thuộc vào</th><th>Được dùng bởi</th></tr></thead><tbody>
${rows}
</tbody></table>`
      : '<div class="empty">Chưa có component.</div>'
  }</div></section>`;
}

function renderRelationships(model: ArchitectureModel): string {
  const name = new Map(model.components.map((c) => [c.id, c.name]));
  const cell = (id: string) =>
    name.has(id)
      ? `<a href="#c-${h(encodeURIComponent(id))}">${h(name.get(id)!)}</a>`
      : `<code>${h(id)}</code>`;
  const rows = model.relationships
    .map(
      (r) => `<tr><td>${cell(r.from)}</td><td>${cell(r.to)}</td>
<td>${r.type ? `<span class="pill">${h(r.type)}</span>` : '<span class="none">—</span>'}</td>
<td>${r.label ? h(r.label) : '<span class="none">—</span>'}${r.description ? `<div class="desc">${h(r.description)}</div>` : ''}</td></tr>`,
    )
    .join('\n');
  return `<section id="relationships"><h2>Quan hệ (${model.relationships.length})</h2>
<div class="card" style="overflow-x:auto">${
    model.relationships.length
      ? `<table><thead><tr><th>Từ</th><th>Đến</th><th>Giao thức</th><th>Mô tả</th></tr></thead><tbody>
${rows}
</tbody></table>`
      : '<div class="empty">Chưa có quan hệ.</div>'
  }</div></section>`;
}

function renderValidation(diagnostics: Diagnostic[], options: HtmlOptions): string {
  const items = diagnostics.filter((d) => d.severity !== 'info');
  if (!items.length) return '';
  const file = options.sourceName ? `${h(options.sourceName)}:` : 'dòng ';
  const rows = items
    .map(
      (
        d,
      ) => `<tr><td><span class="sev ${d.severity}">${d.severity === 'error' ? 'Lỗi' : 'Cảnh báo'}</span></td>
<td>${d.line ? `<code>${file}${d.line}:${d.column ?? 1}</code>` : '<span class="none">—</span>'}</td>
<td>${h(d.message)}${d.hint ? `<div class="hint">↳ ${h(d.hint)}</div>` : ''}</td>
<td><code>${h(d.rule ?? d.code)}</code></td></tr>`,
    )
    .join('\n');
  return `<section id="validation"><h2>Kết quả kiểm tra (${items.length})</h2>
<div class="card" style="overflow-x:auto"><table><thead><tr><th>Mức</th><th>Vị trí</th><th>Nội dung</th><th>Rule / mã</th></tr></thead><tbody>
${rows}
</tbody></table></div></section>`;
}
