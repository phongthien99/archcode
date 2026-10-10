/**
 * Bảng màu theo type. Diagram dùng `var(--ac-*, <mặc định sáng>)` nên trang chứa SVG
 * (HTML export, web app) chỉ cần khai báo biến để đổi theme — không phải render lại.
 */
export const TYPE_COLORS: Record<string, { light: [string, string]; dark: [string, string] }> = {
  //            [fill,      stroke]
  person: { light: ['#dbeafe', '#1d4ed8'], dark: ['#1e3a5f', '#60a5fa'] },
  system: { light: ['#e0e7ff', '#4338ca'], dark: ['#2e2a5c', '#a5b4fc'] },
  external: { light: ['#f1f5f9', '#64748b'], dark: ['#1f2937', '#94a3b8'] },
  frontend: { light: ['#e0f2fe', '#0369a1'], dark: ['#0c3349', '#38bdf8'] },
  gateway: { light: ['#ede9fe', '#6d28d9'], dark: ['#33215c', '#c4b5fd'] },
  service: { light: ['#dcfce7', '#15803d'], dark: ['#123824', '#4ade80'] },
  database: { light: ['#fef3c7', '#b45309'], dark: ['#422c0b', '#fbbf24'] },
  queue: { light: ['#fce7f3', '#be185d'], dark: ['#4a1530', '#f472b6'] },
  storage: { light: ['#ffedd5', '#c2410c'], dark: ['#47220c', '#fb923c'] },
  cache: { light: ['#ccfbf1', '#0f766e'], dark: ['#0b3b37', '#2dd4bf'] },
  custom: { light: ['#f5f5f4', '#57534e'], dark: ['#292524', '#a8a29e'] },
};

export function colorKey(type: string): string {
  return type in TYPE_COLORS ? type : 'custom';
}

/** Biến CSS cho theme tối — trang chứa diagram đặt trong `@media (prefers-color-scheme: dark)` hoặc `[data-theme=dark]`. */
export function darkThemeVariables(): string {
  const vars = Object.entries(TYPE_COLORS).flatMap(([type, { dark }]) => [
    `--ac-${type}-fill:${dark[0]}`,
    `--ac-${type}-stroke:${dark[1]}`,
  ]);
  return [
    ...vars,
    '--ac-text:#e5e7eb',
    '--ac-muted:#9ca3af',
    '--ac-edge:#9ca3af',
    '--ac-label-bg:#111827',
    '--ac-group-fill:rgba(148,163,184,0.06)',
    '--ac-group-stroke:#4b5563',
    '--ac-error:#f87171',
    '--ac-warning:#fbbf24',
  ].join(';');
}

/** CSS của diagram; nhúng một lần mỗi trang (hoặc trong chính SVG khi xuất file độc lập). */
export function diagramCss(): string {
  const types = Object.entries(TYPE_COLORS)
    .map(
      ([type, { light }]) =>
        `.ac-t-${type}>.ac-shape{fill:var(--ac-${type}-fill,${light[0]});stroke:var(--ac-${type}-stroke,${light[1]})}`,
    )
    .join('');
  return [
    '.ac-diagram{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}',
    '.ac-shape{stroke-width:1.5}',
    types,
    '.ac-t-external>.ac-shape{stroke-dasharray:6 4}',
    '.ac-t-system>.ac-shape{stroke-width:2.5}',
    '.ac-deco{fill:none;stroke:var(--ac-muted,#64748b);stroke-width:1}',
    '.ac-dot{fill:var(--ac-muted,#64748b)}',
    '.ac-name{font-size:14px;font-weight:600;fill:var(--ac-text,#0f172a)}',
    '.ac-meta{font-size:11px;fill:var(--ac-muted,#475569)}',
    '.ac-desc{font-size:11px;fill:var(--ac-text,#334155)}',
    '.ac-edge>path{fill:none;stroke:var(--ac-edge,#64748b);stroke-width:1.5}',
    '.ac-edge.ac-async>path{stroke-dasharray:6 4}',
    '.ac-arrow{fill:var(--ac-edge,#64748b)}',
    '.ac-arrow-error{fill:var(--ac-error,#dc2626)}',
    '.ac-arrow-warning{fill:var(--ac-warning,#d97706)}',
    '.ac-label rect{fill:var(--ac-label-bg,#ffffff);opacity:.92}',
    '.ac-label text{font-size:11px;fill:var(--ac-muted,#475569)}',
    '.ac-group>rect{fill:var(--ac-group-fill,rgba(100,116,139,0.05));stroke:var(--ac-group-stroke,#94a3b8);stroke-width:1.2;stroke-dasharray:8 5}',
    '.ac-group>text{font-size:12px;font-weight:600;fill:var(--ac-muted,#475569)}',
    '.ac-warning>.ac-shape,.ac-group.ac-warning>rect{stroke:var(--ac-warning,#d97706);stroke-width:3}',
    '.ac-error>.ac-shape,.ac-group.ac-error>rect{stroke:var(--ac-error,#dc2626);stroke-width:3}',
    '.ac-edge.ac-warning>path{stroke:var(--ac-warning,#d97706);stroke-width:2.5}',
    '.ac-edge.ac-error>path{stroke:var(--ac-error,#dc2626);stroke-width:2.5}',
    '.ac-node,.ac-edge{cursor:pointer}',
    '.ac-selected>.ac-shape{stroke-width:3.5;filter:drop-shadow(0 0 4px rgba(59,130,246,.6))}',
  ].join('\n');
}
