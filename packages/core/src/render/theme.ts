import {
  componentTypes,
  diagramPalettes,
  DEFAULT_DIAGRAM_PALETTE,
  font,
  palette,
  semantic,
  typeColor,
  type DiagramPaletteName,
  type ThemeVariant,
} from '../tokens';

/**
 * Bảng màu theo type, sinh từ design tokens (`../tokens`). Diagram dùng `var(--ac-*, <mặc định sáng>)`
 * nên trang chứa SVG (HTML export, web app) chỉ cần khai báo biến để đổi theme — không phải render lại.
 */
type TypeColors = [fill: string, stroke: string, text: string, muted: string];

function typeColors(name: DiagramPaletteName) {
  return Object.fromEntries(
    componentTypes.map((type) => {
      const tuple = (theme: 'light' | 'dark'): TypeColors => {
        const c = typeColor(type, theme, name);
        return [c.fill, c.stroke, c.text, c.muted];
      };
      return [type, { light: tuple('light'), dark: tuple('dark') }];
    }),
  ) as Record<string, { light: TypeColors; dark: TypeColors }>;
}

/** Màu theo type của bảng mặc định — cũng là giá trị fallback nhúng trong SVG xuất ra. */
export const TYPE_COLORS = typeColors(DEFAULT_DIAGRAM_PALETTE);

const TYPE_VARS = ['fill', 'stroke', 'text', 'muted'] as const;

export function colorKey(type: string): string {
  return type in TYPE_COLORS ? type : 'custom';
}

/** Biến riêng của diagram theo theme, ánh xạ từ màu semantic. */
function diagramVariables(theme: 'light' | 'dark') {
  const c = semantic[theme];
  const { slate } = palette;
  return {
    text: c.text,
    muted: c.textMuted,
    edge: c.edge,
    'edge-label': c.edgeLabel,
    'label-bg': c.surface,
    // Group rất nhạt: ranh giới bằng viền đứt, không bằng nền đậm.
    'group-fill': theme === 'light' ? 'rgba(241,245,249,0.6)' : 'rgba(30,41,59,0.35)',
    'group-stroke': theme === 'light' ? slate[300] : slate[700],
    'group-text': theme === 'light' ? slate[800] : slate[300],
    error: c.danger,
    warning: c.warning,
    selected: c.focus,
  };
}

function typeVariables(colors: typeof TYPE_COLORS, theme: 'light' | 'dark'): string[] {
  return Object.entries(colors).flatMap(([type, c]) =>
    TYPE_VARS.map((name, i) => `--ac-${type}-${name}:${c[theme][i]}`),
  );
}

/** Biến CSS của diagram cho một theme (màu từng type + chữ, cạnh, group, lỗi/cảnh báo). */
export function diagramThemeVariables(theme: 'light' | 'dark'): string {
  const shared = Object.entries(diagramVariables(theme)).map(([k, v]) => `--ac-${k}:${v}`);
  return [...typeVariables(TYPE_COLORS, theme), ...shared].join(';');
}

/** Biến thể `data-diagram=<bảng>` cho `tokensCss`: đổi màu node không cần render lại SVG. */
export function diagramPaletteVariants(): ThemeVariant[] {
  return (Object.keys(diagramPalettes) as DiagramPaletteName[])
    .filter((name) => name !== DEFAULT_DIAGRAM_PALETTE)
    .map((name) => {
      const colors = typeColors(name);
      return {
        attr: 'diagram',
        value: name,
        light: typeVariables(colors, 'light').join(';'),
        dark: typeVariables(colors, 'dark').join(';'),
      };
    });
}

/** Biến CSS cho theme tối — trang chứa diagram đặt trong `@media (prefers-color-scheme: dark)` hoặc `[data-theme=dark]`. */
export function darkThemeVariables(): string {
  return diagramThemeVariables('dark');
}

/** CSS của diagram; nhúng một lần mỗi trang (hoặc trong chính SVG khi xuất file độc lập). */
export function diagramCss(): string {
  const d = diagramVariables('light');
  const v = (name: keyof typeof d) => `var(--ac-${name},${d[name]})`;
  const types = Object.entries(TYPE_COLORS)
    .map(([type, { light }]) => {
      const t = (i: number) => `var(--ac-${type}-${TYPE_VARS[i]},${light[i]})`;
      return (
        `.ac-t-${type}>.ac-shape{fill:${t(0)};stroke:${t(1)}}` +
        `.ac-t-${type}>text{fill:${t(2)}}` +
        `.ac-t-${type}>.ac-meta,.ac-t-${type}>.ac-desc{fill:${t(3)}}` +
        `.ac-t-${type}>.ac-icon{stroke:${t(2)}}` +
        `.ac-t-${type}>.ac-divider{stroke:${t(1)}}`
      );
    })
    .join('');
  const sel = v('selected');
  return [
    `.ac-diagram{font-family:${font.sans}}`,
    // Viền 1px xác định ranh giới; trạng thái (chọn/lỗi) mới dùng 2px.
    '.ac-shape{stroke-width:1}',
    types,
    '.ac-t-external>.ac-shape{stroke-dasharray:6 4}',
    // Card: header (icon + tên 14/600) → body (mô tả 12px) → footer (metadata 11px).
    '.ac-icon{fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}',
    '.ac-divider{stroke-width:1;opacity:.7}',
    '.ac-name{font-size:14px;font-weight:600}',
    '.ac-desc{font-size:12px}',
    '.ac-meta{font-size:11px}',
    // Edge trung tính, nét liền; nét đứt dành cho quan hệ async.
    `.ac-edge>path{fill:none;stroke:${v('edge')};stroke-width:1.5;stroke-linejoin:round}`,
    '.ac-edge.ac-async>path{stroke-dasharray:6 4}',
    `.ac-arrow{fill:${v('edge')}}`,
    `.ac-arrow-error{fill:${v('error')}}`,
    `.ac-arrow-warning{fill:${v('warning')}}`,
    `.ac-label rect{fill:${v('label-bg')};opacity:.92}`,
    `.ac-label text{font-size:11px;font-weight:500;fill:${v('edge-label')}}`,
    `.ac-group>rect{fill:${v('group-fill')};stroke:${v('group-stroke')};stroke-width:1}`,
    `.ac-group>text{font-size:14px;font-weight:600;fill:${v('group-text')}}`,
    `.ac-warning>.ac-shape,.ac-group.ac-warning>rect{stroke:${v('warning')};stroke-width:2}`,
    `.ac-error>.ac-shape,.ac-group.ac-error>rect{stroke:${v('error')};stroke-width:2}`,
    `.ac-edge.ac-warning>path{stroke:${v('warning')};stroke-width:2}`,
    `.ac-edge.ac-error>path{stroke:${v('error')};stroke-width:2}`,
    '.ac-node,.ac-edge{cursor:pointer}',
    // Selected: viền xanh 2px + focus ring nhẹ. Node lỗi/cảnh báo giữ viền trạng thái, chỉ thêm ring.
    `.ac-selected>.ac-shape{stroke-width:2;filter:drop-shadow(0 0 3px color-mix(in srgb,${sel} 45%,transparent))}`,
    `.ac-selected:not(.ac-error):not(.ac-warning)>.ac-shape{stroke:${sel}}`,
  ].join('\n');
}

export { mindmapCss, mindmapThemeVariables } from '../mindmap/theme';
