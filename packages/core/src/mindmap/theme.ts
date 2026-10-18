import { palette, semantic, type ThemeName } from '../tokens';
import { MIND_COLORS } from './types';

// Tách khỏi render.ts để trang web nạp CSS qua `@archcode/core/theme` mà không kéo cả core.

/** Màu nhánh và màu gốc theo theme. Theme sáng dùng sắc 600, tối dùng 400 cho đủ tương phản. */
function mindmapVariables(theme: ThemeName): Record<string, string> {
  const shade = theme === 'light' ? 600 : 400;
  return {
    ...Object.fromEntries(MIND_COLORS.map((c) => [`mm-${c}`, palette[c][shade]])),
    'mm-default': theme === 'light' ? palette.slate[500] : palette.slate[400],
    'mm-root-fill': theme === 'light' ? palette.slate[800] : palette.slate[100],
    'mm-root-text': theme === 'light' ? '#ffffff' : palette.slate[900],
  };
}

/** Biến CSS của mind map cho một theme; đặt cạnh `diagramThemeVariables()` của trang chứa SVG. */
export function mindmapThemeVariables(theme: ThemeName): string {
  return Object.entries(mindmapVariables(theme))
    .map(([k, v]) => `--ac-${k}:${v}`)
    .join(';');
}

/** CSS của mind map; nhúng một lần mỗi trang, sau `diagramCss()` (dùng chung biến chữ, lỗi, chọn). */
export function mindmapCss(): string {
  const d = mindmapVariables('light');
  const s = semantic.light;
  const v = (name: string, fallback: string) => `var(--ac-${name},${fallback})`;
  const mm = 'var(--mm)';
  return [
    `.ac-mindmap{--mm:${v('mm-default', d['mm-default']!)}}`,
    MIND_COLORS.map((c) => `.ac-mm-c-${c}{--mm:${v(`mm-${c}`, d[`mm-${c}`]!)}}`).join(''),
    `.ac-mm-branch{fill:none;stroke:${mm};stroke-linecap:round}`,
    '.ac-mm-b1{stroke-width:3}.ac-mm-b2{stroke-width:2}.ac-mm-b3{stroke-width:1.5}',
    `.ac-mm-node>text{fill:${v('text', s.text)}}`,
    `.ac-mm-d0>.ac-mm-shape{fill:${v('mm-root-fill', d['mm-root-fill']!)};stroke:none}`,
    `.ac-mm-d0>text{fill:${v('mm-root-text', d['mm-root-text']!)};font-weight:700}`,
    `.ac-mm-d1>.ac-mm-shape{fill:color-mix(in srgb,${mm} 12%,${v('label-bg', s.surface)});stroke:${mm};stroke-width:2}`,
    '.ac-mm-d1>text{font-weight:600}',
    `.ac-mm-d2>.ac-mm-shape{fill:none;stroke:${mm};stroke-width:1.5;stroke-linecap:round}`,
    // Nhánh phụ dạng khối (style notebook): nền nhạt hơn nhánh chính, viền mảnh.
    `.ac-mm-d2.ac-mm-boxed>.ac-mm-shape{fill:color-mix(in srgb,${mm} 8%,${v('label-bg', s.surface)});stroke-width:1.25}`,
    `.ac-mm-badge>circle{fill:${mm}}`,
    `.ac-mm-badge>text{fill:${v('label-bg', s.surface)};font-size:10px;font-weight:700}`,
    `.ac-mm-link>path{fill:none;stroke:${v('muted', s.textMuted)};stroke-width:1.5;stroke-dasharray:6 4}`,
    `.ac-mm-link>text{fill:${v('muted', s.textMuted)};font-size:11px}`,
    `.ac-mm-arrow{fill:${v('muted', s.textMuted)}}`,
    `.ac-mm-node.ac-warning>.ac-mm-shape{stroke:${v('warning', s.warning)};stroke-width:3}`,
    `.ac-mm-node.ac-error>.ac-mm-shape{stroke:${v('error', s.danger)};stroke-width:3}`,
    '.ac-mm-node{cursor:pointer}',
    // Chọn: viền màu focus + ring nhẹ (gốc không có viền nên thêm viền khi chọn).
    `.ac-mm-node.ac-selected>.ac-mm-shape{filter:drop-shadow(0 0 3px color-mix(in srgb,${v('selected', s.focus)} 45%,transparent))}`,
    `.ac-mm-node.ac-selected:not(.ac-error):not(.ac-warning)>.ac-mm-shape{stroke:${v('selected', s.focus)};stroke-width:2}`,
  ].join('\n');
}
