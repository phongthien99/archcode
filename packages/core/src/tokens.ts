/**
 * Design tokens — nguồn duy nhất cho màu, khoảng cách, chữ, bo góc, bóng đổ của ArchCode.
 * Web app, trang HTML export, Hugo viewer và diagram SVG đều lấy giá trị từ đây.
 *
 * Ba tầng:
 * 1. `palette`  — màu gốc (thang 50–950). Không dùng trực tiếp trong UI.
 * 2. `semantic` — màu theo vai trò (nền, chữ, viền, accent…), mỗi theme một bộ.
 * 3. CSS variables `--ac-*` sinh từ hai tầng trên; CSS chỉ được tham chiếu biến, không viết mã hex.
 *
 * Đổi giao diện = sửa `semantic` (hoặc `palette`), không sửa từng file CSS.
 */

// prettier-ignore
export const palette = {
  slate: {
    50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b',
    600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617',
  },
  stone: {
    50: '#fafaf9', 100: '#f5f5f4', 200: '#e7e5e4', 300: '#d6d3d1', 400: '#a8a29e', 500: '#78716c',
    600: '#57534e', 700: '#44403c', 800: '#292524', 900: '#1c1917', 950: '#0c0a09',
  },
  red: {
    50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444',
    600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a',
  },
  orange: {
    50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316',
    600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12', 950: '#431407',
  },
  amber: {
    50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b',
    600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03',
  },
  green: {
    50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e',
    600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d', 950: '#052e16',
  },
  teal: {
    50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6',
    600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e',
  },
  sky: {
    50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9',
    600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e', 950: '#082f49',
  },
  blue: {
    50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6',
    600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
  },
  indigo: {
    50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1',
    600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b',
  },
  violet: {
    50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6',
    600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065',
  },
  pink: {
    50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899',
    600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843', 950: '#500724',
  },
} as const;

export type Hue = keyof typeof palette;
export type ThemeName = 'light' | 'dark';

const { slate, blue, red, amber, green, violet } = palette;

/**
 * Bộ màu nhấn (accent) người dùng chọn được. Mỗi bộ chỉ đổi nhóm biến accent/focus;
 * nền, chữ, màu node giữ nguyên.
 */
export const accents = {
  blue: { label: 'Xanh dương', hue: 'blue' },
  indigo: { label: 'Chàm', hue: 'indigo' },
  violet: { label: 'Tím', hue: 'violet' },
  pink: { label: 'Hồng', hue: 'pink' },
  orange: { label: 'Cam', hue: 'orange' },
  green: { label: 'Xanh lá', hue: 'green' },
  teal: { label: 'Ngọc', hue: 'teal' },
  graphite: { label: 'Than chì', hue: 'slate' },
} as const satisfies Record<string, { label: string; hue: Hue }>;

export type AccentName = keyof typeof accents;
export const DEFAULT_ACCENT: AccentName = 'blue';

type AccentColors = {
  accent: string;
  accentHover: string;
  accentSubtle: string; // nền mục đang chọn
  focus: string;
};

/**
 * Màu accent của một hue. Chọn bậc sáng nhất mà chữ trắng trên nút vẫn đủ tương phản:
 * light cần 4.5 (WCAG AA chữ thường), dark cần 3 (để nút không quá tối trên nền tối).
 */
export function accentColors(name: AccentName, theme: ThemeName): AccentColors {
  const scale = palette[accents[name].hue];
  const white = '#ffffff';
  if (theme === 'light') {
    const accent = contrastRatio(scale[600], white) >= 4.5 ? scale[600] : scale[700];
    return {
      accent,
      accentHover: accent === scale[600] ? scale[700] : scale[800],
      accentSubtle: scale[100],
      focus: scale[500],
    };
  }
  const accent = contrastRatio(scale[500], white) >= 3 ? scale[500] : scale[600];
  return {
    accent,
    accentHover: accent === scale[500] ? scale[400] : scale[500],
    accentSubtle: scale[950],
    focus: scale[400],
  };
}

/** Màu theo vai trò. Thêm key mới thì thêm ở cả hai theme (test kiểm tra). */
export const semantic = {
  light: {
    bg: slate[100], // nền ứng dụng, sau các panel
    surface: '#ffffff', // panel, card, toolbar
    surfaceHover: slate[50],
    surfaceSunken: slate[50], // canvas, ô input
    border: slate[200],
    borderStrong: slate[300],
    text: slate[900],
    textMuted: slate[500],
    textOnAccent: '#ffffff',
    ...accentColors(DEFAULT_ACCENT, 'light'),
    // Trạng thái: main (viền, indicator) / subtle (nền nhạt) / text (chữ trên subtle hoặc surface)
    danger: red[500],
    dangerSubtle: red[50],
    dangerText: red[800],
    warning: amber[500],
    warningSubtle: amber[50],
    warningText: amber[800],
    success: green[500],
    successSubtle: green[50],
    successText: green[800],
    info: blue[500],
    infoSubtle: blue[50],
    infoText: blue[800],
    canvasDot: 'rgba(203, 213, 225, 0.5)', // slate-300 @ 50%: grid không được đậm hơn edge
    edge: slate[400],
    edgeLabel: slate[600],
    backdrop: 'rgba(15, 23, 42, 0.35)',
    shadowSm: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04)',
    shadowMd: '0 4px 12px rgba(15, 23, 42, 0.08)',
    shadowLg: '0 16px 48px rgba(15, 23, 42, 0.18)',
    // Tô màu cú pháp trong editor YAML
    codeKey: blue[700],
    codeString: green[700],
    codeNumber: amber[700],
    codeAtom: violet[700], // true/false/null
    codeComment: slate[500],
  },
  dark: {
    bg: slate[950],
    surface: slate[900],
    surfaceHover: slate[800],
    surfaceSunken: '#0b1120',
    border: slate[800],
    borderStrong: slate[700],
    text: slate[100],
    textMuted: slate[400],
    textOnAccent: '#ffffff',
    ...accentColors(DEFAULT_ACCENT, 'dark'),
    danger: red[400],
    dangerSubtle: 'rgba(239, 68, 68, 0.12)',
    dangerText: red[300],
    warning: amber[400],
    warningSubtle: 'rgba(245, 158, 11, 0.12)',
    warningText: amber[300],
    success: green[400],
    successSubtle: 'rgba(34, 197, 94, 0.12)',
    successText: green[300],
    info: blue[400],
    infoSubtle: 'rgba(59, 130, 246, 0.12)',
    infoText: blue[300],
    canvasDot: 'rgba(51, 65, 85, 0.6)',
    edge: slate[500],
    edgeLabel: slate[300],
    backdrop: 'rgba(2, 6, 23, 0.6)',
    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.4)',
    shadowMd: '0 4px 12px rgba(0, 0, 0, 0.4)',
    shadowLg: '0 16px 48px rgba(0, 0, 0, 0.55)',
    codeKey: blue[300],
    codeString: green[300],
    codeNumber: amber[300],
    codeAtom: violet[300],
    codeComment: slate[400],
  },
} satisfies Record<ThemeName, Record<string, string>>;

export type SemanticColor = keyof typeof semantic.light;

/** Thang khoảng cách 4px. Key là bội số của 4px (`1.5` = 6px). */
export const space = {
  0: '0',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px', // khoảng cách node thông thường
  20: '80px', // khoảng cách giữa các tầng
} as const;

export const radius = { sm: '4px', md: '6px', lg: '8px', xl: '12px', full: '999px' } as const;

/** Chỉ font hệ thống: trang export phải mở được offline, không tải font ngoài. */
export const font = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const;

export const fontSize = {
  xs: '11px',
  sm: '12px',
  md: '13px',
  base: '14px',
  lg: '16px',
  xl: '18px',
  '2xl': '20px',
  '3xl': '24px',
  '4xl': '30px',
} as const;

export const fontWeight = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

export const lineHeight = { tight: 1.2, normal: 1.45, relaxed: 1.55 } as const;

export const zIndex = { raised: 1, overlay: 5, toast: 20, drop: 30, modal: 40 } as const;

export const duration = { fast: '120ms', normal: '200ms' } as const;

/**
 * Cấp C4 của từng loại component — quyết định màu theo ký hiệu Structurizr/C4
 * (https://docs.structurizr.com/server/diagrams/notation). Loại tự định nghĩa dùng `component`.
 */
export type C4Level = 'person' | 'system' | 'container' | 'component' | 'external';

export const categoryLevels: Record<string, C4Level> = {
  person: 'person',
  system: 'system',
  external: 'external',
  frontend: 'container',
  gateway: 'container',
  service: 'container',
  database: 'container',
  queue: 'container',
  storage: 'container',
  cache: 'container',
  custom: 'component',
};

/**
 * Nền theo bảng màu C4 quen thuộc của Structurizr. Container và external được làm tối nhẹ
 * so với bản gốc (`#438dd5`, `#999999`) để chữ trắng đạt WCAG AA.
 */
export const c4Colors: Record<C4Level, { background: string; text: string }> = {
  person: { background: '#08427b', text: '#ffffff' },
  system: { background: '#1168bd', text: '#ffffff' },
  container: { background: '#3478c1', text: '#ffffff' },
  component: { background: '#85bbf0', text: '#000000' },
  external: { background: '#737373', text: '#ffffff' },
};

export interface CategoryColor {
  fill: string;
  stroke: string;
  /** Tên node. */
  text: string;
  /** Mô tả, metadata, icon phụ trong node. */
  muted: string;
}

/**
 * Nền và chữ như nhau ở hai theme. Viền: theo Structurizr là "phiên bản tối hơn của nền";
 * riêng theme tối dùng bản sáng hơn, vì nền node tối (person) gần như lẫn vào canvas tối.
 */
export function categoryColor(level: C4Level, theme: ThemeName): CategoryColor {
  const { background, text } = c4Colors[level];
  return {
    fill: background,
    stroke: strokeFor(background, theme),
    text,
    muted: mutedOn(text),
  };
}

/**
 * Chữ phụ trên nền đặc. Chữ trắng trên nền đặc chỉ vừa đạt 4.5:1, làm nhạt thêm là rớt chuẩn,
 * nên chữ phụ giữ màu chữ chính; phân cấp bằng cỡ chữ và độ đậm.
 */
function mutedOn(text: string): string {
  return text;
}

function strokeFor(background: string, theme: ThemeName): string {
  return theme === 'light'
    ? mixHex(background, '#000000', 0.7)
    : mixHex(background, '#ffffff', 0.6);
}

/** Bảng màu node diagram người dùng chọn được. */
export const diagramPalettes = {
  soft: { label: 'Pastel (nhiều màu nhẹ)' },
  enterprise: { label: 'Enterprise (trung tính)' },
  colorful: { label: 'Nhiều màu' },
  c4: { label: 'C4 (Structurizr)' },
} as const;

export type DiagramPaletteName = keyof typeof diagramPalettes;
export const DEFAULT_DIAGRAM_PALETTE: DiagramPaletteName = 'soft';

/**
 * Bảng "Soft Multi-Color" (spec Enterprise Graph Design — Light Theme): mỗi màu gồm
 * background (pastel), border, accent (indicator) và foreground (tên, icon).
 * `neutral` cho loại không mang nghĩa category (external, custom).
 */
export const softColors = {
  blue: { background: '#eff6ff', border: '#bfdbfe', accent: '#3b82f6', foreground: '#1e40af' },
  violet: { background: '#f5f3ff', border: '#ddd6fe', accent: '#8b5cf6', foreground: '#6d28d9' },
  teal: { background: '#f0fdfa', border: '#99f6e4', accent: '#14b8a6', foreground: '#0f766e' },
  emerald: { background: '#ecfdf5', border: '#a7f3d0', accent: '#10b981', foreground: '#047857' },
  amber: { background: '#fffbeb', border: '#fde68a', accent: '#f59e0b', foreground: '#92400e' },
  orange: { background: '#fff7ed', border: '#fed7aa', accent: '#f97316', foreground: '#9a3412' },
  rose: { background: '#fff1f2', border: '#fecdd3', accent: '#f43f5e', foreground: '#be123c' },
  indigo: { background: '#eef2ff', border: '#c7d2fe', accent: '#6366f1', foreground: '#3730a3' },
  neutral: { background: '#f1f5f9', border: '#cbd5e1', accent: '#64748b', foreground: '#334155' },
} as const;

export type SoftColorName = keyof typeof softColors;

/**
 * Color registry: category → màu, cố định (thêm/xóa node không đổi màu category đã có).
 * Cùng domain dùng chung màu: database/cache/storage đều là "data" → amber.
 */
export const softCategories: Record<string, SoftColorName> = {
  person: 'indigo', // actor
  system: 'blue', // hệ thống đang mô tả
  external: 'neutral',
  frontend: 'teal', // client
  gateway: 'violet', // edge / routing
  service: 'emerald', // compute
  database: 'amber', // data
  cache: 'amber',
  storage: 'amber',
  queue: 'rose', // messaging
  custom: 'neutral',
};

/**
 * Light: nền pastel, viền border, tên + icon foreground, chữ phụ slate-600 (slate-500 của spec
 * chưa đạt 4.5:1 trên vài nền pastel). Dark: cùng tông, accent pha vào surface tối.
 */
function softColor(type: string, theme: ThemeName): CategoryColor {
  const c = softColors[softCategories[type] ?? 'neutral'];
  if (type === 'custom') {
    // Type tự định nghĩa: thẻ trắng trung tính.
    if (theme === 'light')
      return { fill: '#ffffff', stroke: c.border, text: c.foreground, muted: palette.slate[600] };
  }
  if (theme === 'light')
    return { fill: c.background, stroke: c.border, text: c.foreground, muted: palette.slate[600] };
  const surface = semantic.dark.surface;
  return {
    fill: mixHex(c.accent, surface, 0.14),
    stroke: mixHex(c.accent, surface, 0.45),
    text: mixHex(c.accent, '#ffffff', 0.45),
    muted: palette.slate[400],
  };
}

/**
 * Bảng "Enterprise": neutral first. Node là thẻ nền trắng, viền slate-300, chữ slate-700/500.
 * Loại component phân biệt bằng shape + nhãn `[type: tech]`, không bằng màu. Chỉ hai vai trò
 * có màu vì mang nghĩa: `system` (hệ thống đang mô tả) nền xanh rất nhạt, `external` xám lùi lại.
 */
function enterpriseColor(type: string, theme: ThemeName): CategoryColor {
  const { slate, blue } = palette;
  const role = type === 'system' ? 'focus' : type === 'external' ? 'external' : 'default';
  if (theme === 'light') {
    if (role === 'focus')
      return { fill: blue[50], stroke: blue[300], text: blue[800], muted: slate[600] };
    if (role === 'external')
      return { fill: slate[100], stroke: slate[300], text: slate[700], muted: slate[600] };
    return { fill: '#ffffff', stroke: slate[300], text: slate[700], muted: slate[500] };
  }
  if (role === 'focus')
    return { fill: blue[950], stroke: blue[800], text: blue[200], muted: slate[300] };
  if (role === 'external')
    return { fill: slate[800], stroke: slate[600], text: slate[300], muted: slate[400] };
  return { fill: slate[900], stroke: slate[700], text: slate[200], muted: slate[400] };
}

/** Bảng "Nhiều màu": mỗi loại component một tông, để nhìn diagram là phân biệt được loại. */
export const categoryHues: Record<string, Hue> = {
  person: 'indigo',
  system: 'blue',
  external: 'slate',
  frontend: 'sky',
  gateway: 'violet',
  service: 'green',
  database: 'amber',
  queue: 'pink',
  storage: 'orange',
  cache: 'teal',
  custom: 'stone',
};

/** Loại component đã biết; type tự định nghĩa dùng màu của `custom`. */
export const componentTypes = Object.keys(categoryHues);

/**
 * Màu node theo bảng đã chọn. "Nhiều màu": nền đặc bậc 600 (hoặc 700 nếu chữ trắng
 * chưa đạt 4.5), cùng kiểu nền đặc + chữ trắng + viền đậm như C4.
 */
export function typeColor(
  type: string,
  theme: ThemeName,
  name: DiagramPaletteName = DEFAULT_DIAGRAM_PALETTE,
): CategoryColor {
  const known = type in categoryHues ? type : 'custom';
  if (name === 'soft') return softColor(known, theme);
  if (name === 'enterprise') return enterpriseColor(known, theme);
  if (name === 'c4') return categoryColor(categoryLevels[known]!, theme);
  const scale = palette[categoryHues[known]!];
  const fill = contrastRatio(scale[600], '#ffffff') >= 4.5 ? scale[600] : scale[700];
  return { fill, stroke: strokeFor(fill, theme), text: '#ffffff', muted: mutedOn('#ffffff') };
}

/** Tỉ lệ tương phản WCAG giữa hai màu hex. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = parseHex(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Pha `a` vào `b` theo tỉ lệ `amount` (0–1). Dùng khi cần mã hex tĩnh (SVG/PNG export). */
export function mixHex(a: string, b: string, amount: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  return `#${pa
    .map((v, i) => Math.round(v * amount + pb[i]! * (1 - amount)))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

function parseHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const key = (k: string) => k.replace('.', '-');

const toVariables = (colors: Record<string, string>) =>
  Object.entries(colors)
    .map(([name, value]) => `--ac-color-${kebab(name)}:${value}`)
    .join(';');

/** Biến màu của một theme: `--ac-color-bg:…;--ac-color-text:…` */
export function colorVariables(theme: ThemeName): string {
  return toVariables(semantic[theme]);
}

/** Biến accent của một bộ màu; `--ac-selected` là màu chọn trên diagram. */
export function accentVariables(name: AccentName, theme: ThemeName): string {
  const colors = accentColors(name, theme);
  return `${toVariables(colors)};--ac-selected:${colors.focus}`;
}

/** Biến không phụ thuộc theme: khoảng cách, bo góc, chữ, z-index, thời gian. */
export function scaleVariables(): string {
  return [
    ...Object.entries(space).map(([k, v]) => `--ac-space-${key(k)}:${v}`),
    ...Object.entries(radius).map(([k, v]) => `--ac-radius-${k}:${v}`),
    ...Object.entries(font).map(([k, v]) => `--ac-font-${k}:${v}`),
    ...Object.entries(fontSize).map(([k, v]) => `--ac-font-size-${k}:${v}`),
    ...Object.entries(fontWeight).map(([k, v]) => `--ac-font-weight-${k}:${v}`),
    ...Object.entries(lineHeight).map(([k, v]) => `--ac-line-height-${k}:${v}`),
    ...Object.entries(zIndex).map(([k, v]) => `--ac-z-${k}:${v}`),
    ...Object.entries(duration).map(([k, v]) => `--ac-duration-${k}:${v}`),
  ].join(';');
}

/**
 * CSS khai báo toàn bộ token.
 * - `data-theme`: theme theo thuộc tính `<html data-theme="light|dark|system">` (web app).
 * - `media`: theo hệ điều hành (trang export, không có nút đổi theme).
 * `extra` là biến bổ sung theo theme (vd. biến diagram), khai báo cùng chỗ với biến màu.
 */
export interface ThemeVariant {
  /** Thuộc tính trên `<html>`, vd. `accent` → `data-accent`. */
  attr: string;
  value: string;
  light: string;
  dark: string;
}

/** Biến thể accent (trừ mặc định, đã nằm trong `:root`). */
export function accentVariants(): ThemeVariant[] {
  return (Object.keys(accents) as AccentName[])
    .filter((a) => a !== DEFAULT_ACCENT)
    .map((a) => ({
      attr: 'accent',
      value: a,
      light: accentVariables(a, 'light'),
      dark: accentVariables(a, 'dark'),
    }));
}

export function tokensCss(
  mode: 'data-theme' | 'media',
  extra: { light?: string; dark?: string; variants?: ThemeVariant[] } = {},
): string {
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(';');
  const light = join(scaleVariables(), colorVariables('light'), extra.light);
  const dark = join(colorVariables('dark'), extra.dark);
  const root = `:root{${light};color-scheme:light}`;
  if (mode === 'media') {
    return `${root}\n@media (prefers-color-scheme:dark){:root{${dark};color-scheme:dark}}`;
  }
  // Thứ tự quan trọng: biến thể sáng (0,2,0) → theme tối (0,2,0, ghi đè biến thể sáng)
  // → biến thể tối (0,3,0).
  const variants = [...accentVariants(), ...(extra.variants ?? [])];
  const sel = (v: ThemeVariant) => `[data-${v.attr}=${v.value}]`;
  return [
    root,
    ...variants.map((v) => `:root${sel(v)}{${v.light}}`),
    `:root[data-theme=dark]{${dark};color-scheme:dark}`,
    `@media (prefers-color-scheme:dark){:root[data-theme=system]{${dark};color-scheme:dark}}`,
    ...variants.map((v) => `:root[data-theme=dark]${sel(v)}{${v.dark}}`),
    ...variants.map(
      (v) => `@media (prefers-color-scheme:dark){:root[data-theme=system]${sel(v)}{${v.dark}}}`,
    ),
  ].join('\n');
}
