import { describe, expect, it } from 'vitest';
import { edgePath } from '../src/render/svg';
import { TYPE_COLORS, diagramPaletteVariants, diagramThemeVariables } from '../src/render/theme';
import {
  accentColors,
  accents,
  categoryLevels,
  componentTypes,
  diagramPalettes,
  mixHex,
  semantic,
  tokensCss,
  typeColor,
  type AccentName,
  type DiagramPaletteName,
  type ThemeName,
} from '../src/tokens';

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const themes: ThemeName[] = ['light', 'dark'];

describe('design tokens', () => {
  it('hai theme có cùng bộ key semantic', () => {
    expect(Object.keys(semantic.dark).sort()).toEqual(Object.keys(semantic.light).sort());
  });

  it.each(themes)('chữ đủ tương phản WCAG AA trên nền (%s)', (theme) => {
    const c = semantic[theme];
    for (const bg of [c.surface, c.bg, c.surfaceSunken]) {
      expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(4.5);
    }
    // Chữ phụ chỉ đặt trên panel/canvas, không đặt thẳng lên `bg`.
    for (const bg of [c.surface, c.surfaceSunken]) {
      expect(contrast(c.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
    }
    for (const code of [c.codeKey, c.codeString, c.codeNumber, c.codeAtom, c.codeComment]) {
      expect(contrast(code, c.surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(c.textOnAccent, c.accent)).toBeGreaterThanOrEqual(3);
    // Màu trạng thái "main" chỉ làm viền/indicator; chữ trạng thái dùng bản `*Text`.
    for (const [text, subtle] of [
      [c.dangerText, c.dangerSubtle],
      [c.warningText, c.warningSubtle],
      [c.successText, c.successSubtle],
      [c.infoText, c.infoSubtle],
    ] as const) {
      expect(contrast(text, c.surface)).toBeGreaterThanOrEqual(4.5);
      // subtle tối là rgba: kiểm trên nền đã pha với surface.
      const bg = subtle.startsWith('#') ? subtle : c.surface;
      expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(themes)('chữ trong node đọc được trên nền node mọi type (%s)', (theme) => {
    for (const [type, [fill, , text]] of Object.entries(TYPE_COLORS).map(
      ([t, c]) => [t, c[theme]] as const,
    )) {
      expect(contrast(text, fill), type).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('bảng C4 giữ màu theo cấp C4', () => {
    expect(componentTypes).toEqual(Object.keys(categoryLevels));
    expect(typeColor('person', 'light', 'c4').fill).toBe('#08427b');
    expect(typeColor('system', 'light', 'c4').fill).toBe('#1168bd');
    expect(typeColor('service', 'light', 'c4').fill).toBe(
      typeColor('database', 'light', 'c4').fill,
    );
  });

  it('bảng "Nhiều màu": mỗi loại component một màu riêng', () => {
    const fills = componentTypes.map((t) => typeColor(t, 'light', 'colorful').fill);
    expect(new Set(fills).size).toBe(fills.length);
  });

  it('bảng Pastel (mặc định): màu theo category, cùng domain cùng màu, đúng bảng spec', () => {
    expect(Object.keys(TYPE_COLORS)).toEqual(componentTypes);
    expect(typeColor('my-custom-type', 'light')).toEqual(typeColor('custom', 'light'));
    expect(typeColor('service', 'light')).toMatchObject({
      fill: '#ecfdf5',
      stroke: '#a7f3d0',
      text: '#047857',
    });
    // data domain: database, cache, storage chung một màu
    expect(typeColor('cache', 'light')).toEqual(typeColor('database', 'light'));
    expect(typeColor('storage', 'light')).toEqual(typeColor('database', 'light'));
    const fills = new Set(componentTypes.map((t) => typeColor(t, 'light').fill));
    expect(fills.size).toBeLessThanOrEqual(9); // ≤ 8 màu + trung tính
  });

  it('bảng Enterprise: neutral first, chỉ system/external có màu riêng', () => {
    const card = typeColor('service', 'light', 'enterprise');
    expect(card).toEqual({ fill: '#ffffff', stroke: '#cbd5e1', text: '#334155', muted: '#64748b' });
    for (const type of componentTypes.filter((t) => t !== 'system' && t !== 'external')) {
      expect(typeColor(type, 'light', 'enterprise'), type).toEqual(card);
    }
    expect(typeColor('system', 'light', 'enterprise').fill).toBe('#eff6ff');
  });

  it.each(themes)('chữ trên node đủ tương phản ở mọi bảng màu (%s)', (theme) => {
    for (const name of Object.keys(diagramPalettes) as DiagramPaletteName[]) {
      for (const type of componentTypes) {
        const c = typeColor(type, theme, name);
        expect(contrast(c.text, c.fill), `${name}/${type}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.muted, c.fill), `${name}/${type} muted`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('bảng màu diagram khác mặc định sinh biến thể data-diagram', () => {
    const css = tokensCss('data-theme', { variants: diagramPaletteVariants() });
    expect(css).toContain(':root[data-diagram=c4]{--ac-person-fill:#08427b');
    expect(css).toContain(':root[data-theme=dark][data-diagram=c4]{');
    expect(css).toContain(':root[data-diagram=colorful]{');
    expect(css).toContain(':root[data-diagram=enterprise]{');
    expect(css).not.toContain('data-diagram=soft');
  });

  it('viền node là bản tối hơn của nền (theme sáng)', () => {
    const lum = (hex: string) => luminance(hex);
    for (const [type, { light }] of Object.entries(TYPE_COLORS)) {
      expect(lum(light[1]), type).toBeLessThan(lum(light[0]));
    }
  });

  it.each(themes)('mọi bộ màu nhấn đủ tương phản (%s)', (theme) => {
    for (const name of Object.keys(accents) as AccentName[]) {
      const c = accentColors(name, theme);
      const min = theme === 'light' ? 4.5 : 3;
      expect(contrast('#ffffff', c.accent), name).toBeGreaterThanOrEqual(min);
      expect(contrast(c.accent, semantic[theme].surface), name).toBeGreaterThanOrEqual(3);
      expect(contrast(semantic[theme].text, c.accentSubtle), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('accent tối được ghi đè sau theme tối (đúng thứ tự cascade)', () => {
    const css = tokensCss('data-theme');
    const lightViolet = css.indexOf(':root[data-accent=violet]');
    const dark = css.indexOf(':root[data-theme=dark]{');
    const darkViolet = css.indexOf(':root[data-theme=dark][data-accent=violet]');
    expect(lightViolet).toBeGreaterThan(-1);
    expect(lightViolet).toBeLessThan(dark);
    expect(dark).toBeLessThan(darkViolet);
    expect(css).not.toContain('data-accent=blue');
  });

  it('edgePath bo góc rẽ, đoạn thẳng giữ nguyên', () => {
    expect(
      edgePath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toBe('M0,0 L100,0');
    expect(
      edgePath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ]),
    ).toBe('M0,0 L94,0 Q100,0 100,6 L100,50');
    // đoạn ngắn: bán kính không quá nửa đoạn
    expect(
      edgePath([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 50 },
      ]),
    ).toBe('M0,0 L2,0 Q4,0 4,2 L4,50');
  });

  it('mixHex pha đúng tỉ lệ', () => {
    expect(mixHex('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(mixHex('#2563eb', '#ffffff', 1)).toBe('#2563eb');
  });

  it('tokensCss khai báo biến cho cả hai chế độ theme', () => {
    const attr = tokensCss('data-theme', { dark: diagramThemeVariables('dark') });
    expect(attr).toContain('--ac-color-bg:#f1f5f9');
    expect(attr).toContain('--ac-space-1-5:6px');
    expect(attr).toContain(':root[data-theme=dark]{--ac-color-bg:#020617');
    expect(attr).toContain('[data-theme=system]');
    expect(attr).toContain('--ac-service-fill:');
    const media = tokensCss('media');
    expect(media).toContain('@media (prefers-color-scheme:dark){:root{');
    expect(media).not.toContain('data-theme');
  });
});
