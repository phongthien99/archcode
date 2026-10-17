# Design tokens

Nguồn duy nhất: [`packages/core/src/tokens.ts`](../packages/core/src/tokens.ts) (`@archcode/core/tokens`).
Web app, trang HTML export, Hugo viewer và diagram SVG đều lấy giá trị từ đây.
**Không viết mã hex hay px rời trong CSS**: dùng biến `--ac-*`.

## Ba tầng

| Tầng       | Ở đâu                         | Dùng khi                                                              |
| ---------- | ----------------------------- | --------------------------------------------------------------------- |
| `palette`  | `palette.blue[600]`…          | Chỉ trong `tokens.ts` / `theme.ts`. UI không tham chiếu trực tiếp.    |
| `semantic` | `semantic.light.accent`…      | Màu theo vai trò, mỗi theme một bộ. Đổi giao diện = sửa ở đây.        |
| CSS vars   | `var(--ac-color-accent)`…     | Mọi CSS / style inline trong app.                                     |

## Biến CSS

**Màu** (đổi theo theme): `--ac-color-<tên kebab-case của semantic>`

| Biến                                  | Vai trò                                            |
| ------------------------------------- | -------------------------------------------------- |
| `bg`                                  | Nền ứng dụng, phía sau các panel                   |
| `surface`, `surface-hover`            | Panel, card, toolbar, nút                          |
| `surface-sunken`                      | Canvas, vùng lõm                                   |
| `border`, `border-strong`             | Viền mặc định / viền cần nổi hơn                   |
| `text`, `text-muted`, `text-on-accent`| Chữ chính, chữ phụ (chỉ đặt trên surface), chữ trên nút accent |
| `accent`, `accent-hover`, `accent-subtle` | Hành động chính, nền mục đang chọn            |
| `danger`, `warning`, `success`, `info` + `-subtle`, `-text` | Trạng thái: main (viền, indicator) / nền nhạt / chữ |
| `focus`                               | Viền focus bàn phím                                |
| `canvas-dot`, `edge`, `backdrop`      | Chấm lưới canvas, đường nối, nền mờ sau modal      |
| `shadow-sm`, `shadow-md`, `shadow-lg` | Bóng: palette nổi / tooltip, toast / modal         |
| `code-key`, `code-string`, `code-number`, `code-atom`, `code-comment` | Tô màu YAML trong editor |

**Thang cố định** (không đổi theo theme):

| Nhóm       | Biến                                                    | Giá trị                          |
| ---------- | ------------------------------------------------------- | -------------------------------- |
| Khoảng cách| `--ac-space-{0,0-5,1,1-5,2,3,4,5,6,8,10}`               | bội số 4px (`1-5` = 6px)         |
| Bo góc     | `--ac-radius-{sm,md,lg,xl,full}`                        | 4 / 6 / 8 / 12 / 999px           |
| Font       | `--ac-font-{sans,mono}`                                 | font hệ thống (export chạy offline) |
| Cỡ chữ     | `--ac-font-size-{xs,sm,md,base,lg,xl,2xl,3xl,4xl}`      | 11 / 12 / 13 / 14 / 16 / 18 / 20 / 24 / 30px |
| Độ đậm     | `--ac-font-weight-{regular,medium,semibold,bold}`       | 400 / 500 / 600 / 700            |
| Line height| `--ac-line-height-{tight,normal,relaxed}`               | 1.2 / 1.45 / 1.55                |
| Lớp        | `--ac-z-{raised,overlay,toast,drop,modal}`              | 1 / 5 / 20 / 30 / 40             |
| Thời gian  | `--ac-duration-{fast,normal}`                           | 120 / 200ms                      |

## Node card

Mọi node là một card chữ nhật bo 8px (`CARD` trong `render/nodeContent.ts`), chữ căn trái:

| Vùng   | Nội dung                                  | Chữ                   |
| ------ | ----------------------------------------- | --------------------- |
| Header | icon 16px theo loại + tên (tối đa 2 dòng) | 14px / 600            |
| Body   | mô tả (tối đa 2 dòng, không bắt buộc)     | 12px, màu chữ phụ     |
| Footer | `type · technology`, ngăn bằng đường mảnh | 11px, màu chữ phụ     |

Rộng 220–260px (text dài thì xuống dòng, không nở ngang), cao tối thiểu 64px, padding 12px 16px.
Icon (`iconSvg(type)`) kế thừa ký hiệu Structurizr: person → người, database → cylinder,
queue → pipe, storage → bucket, gateway → hexagon, frontend → trình duyệt, cache → tia chớp,
external → quả cầu, system → lưới, service → khối. Palette trên canvas dùng cùng bộ icon.

## Màu diagram

Hai bảng màu node (`diagramPalettes`), chọn trong **Giao diện → Màu diagram**; màu lấy qua
`typeColor(type, theme, palette)`. Cả hai cùng kiểu nền đặc, chữ trắng, viền đậm hơn nền.

### Pastel (mặc định, `soft`)

Spec "Enterprise Graph Design — Soft Multi-Color". Mỗi màu trong `softColors` gồm background
(pastel), border, accent, foreground. Node: nền background, viền border 1px, tên + icon
foreground, chữ phụ slate-600. **Color registry** `softCategories` gán màu theo category và
không đổi khi thêm/xóa node; cùng domain dùng chung màu:

| Category  | Loại                      | Màu     |
| --------- | ------------------------- | ------- |
| Actor     | person                    | indigo  |
| Hệ thống  | system                    | blue    |
| Client    | frontend                  | teal    |
| Edge      | gateway                   | violet  |
| Compute   | service                   | emerald |
| Data      | database, cache, storage  | amber   |
| Messaging | queue                     | rose    |
| Trung tính| external (nền slate-100), type tự định nghĩa (thẻ trắng) | neutral |

Edge không dùng màu node: luôn slate-400, góc rẽ bo 6px (`edgePath`). Group nền rất nhạt,
viền liền slate-300, padding 24px (`GROUP_PADDING`), khoảng cách giữa các tầng 80px.

### Enterprise (`enterprise`)

Theo spec "Enterprise Graph Design": **neutral first**, màu chỉ dùng khi mang nghĩa. Loại component
phân biệt bằng shape và nhãn `[type: tech]`, không bằng màu.

| Vai trò                | Loại           | Nền (sáng / tối)          | Viền                  | Tên / chữ phụ               |
| ---------------------- | -------------- | ------------------------- | --------------------- | --------------------------- |
| Thẻ mặc định           | các loại khác  | `#ffffff` / slate-900     | slate-300 / slate-700 | slate-700, slate-500        |
| Hệ thống đang mô tả    | system         | blue-50 / blue-950        | blue-300 / blue-800   | blue-800, slate-600         |
| Bên ngoài (lùi lại)    | external       | slate-100 / slate-800     | slate-300, nét đứt    | slate-700, slate-600        |

Viền 1px; selected 2px màu focus (blue-500) + ring nhẹ; lỗi/cảnh báo viền 2px màu trạng thái,
và vẫn giữ viền trạng thái khi đang được chọn (chỉ thêm ring). Edge slate-400 1.5px nét liền,
async nét đứt, nhãn 11px weight 500 slate-600. Group nền slate-100 @60%, viền 1px nét đứt
slate-300, bo 12px, tiêu đề 14px/600 slate-800.

### Nhiều màu (`colorful`)

Mỗi loại một tông trong `categoryHues`, để nhìn là biết loại component. Nền là bậc `600` của tông,
hoặc `700` nếu chữ trắng trên `600` chưa đạt 4.5:1.

| Loại     | Tông   | Loại     | Tông   | Loại    | Tông   |
| -------- | ------ | -------- | ------ | ------- | ------ |
| person   | indigo | gateway  | violet | storage | orange |
| system   | blue   | service  | green  | cache   | teal   |
| external | slate  | database | amber  | custom  | stone  |
| frontend | sky    | queue    | pink   |         |        |

### C4 (`c4`)

Theo ký hiệu [Structurizr/C4](https://docs.structurizr.com/server/diagrams/notation).
Mỗi loại component gán một cấp C4 trong `categoryLevels`; màu lấy từ `c4Colors`:

| Cấp C4      | Loại                                                            | Nền       | Chữ   |
| ----------- | --------------------------------------------------------------- | --------- | ----- |
| `person`    | person                                                          | `#08427b` | trắng |
| `system`    | system                                                          | `#1168bd` | trắng |
| `container` | frontend, gateway, service, database, queue, storage, cache     | `#3478c1` | trắng |
| `external`  | external                                                        | `#737373` | trắng |
| `component` | custom (và type tự định nghĩa)                                  | `#85bbf0` | đen   |

Container và external tối hơn bản gốc C4 (`#438dd5`, `#999999`) để chữ trắng đạt WCAG AA.
Viền dày 2px, là bản tối hơn của nền (theme tối: bản sáng hơn, để node tối không lẫn vào canvas).
Connector nét đứt (mặc định của Structurizr); quan hệ async nét chấm.

## Theme

`tokensCss(mode, extra?)` sinh toàn bộ khai báo:

- `'data-theme'`: theo `<html data-theme="light|dark|system">` (web app, xem `apps/web/src/main.tsx`).
- `'media'`: theo hệ điều hành (trang HTML export, xem `packages/core/src/export/page.css.ts`).

```ts
import { tokensCss } from '@archcode/core/tokens';
import { diagramThemeVariables } from '@archcode/core/theme';

style.textContent = tokensCss('data-theme', {
  light: diagramThemeVariables('light'),
  dark: diagramThemeVariables('dark'),
});
```

## Biến thể: màu nhấn và bảng màu diagram

Người dùng đổi bằng thuộc tính trên `<html>`, không cần render lại:

| Thuộc tính       | Giá trị                                                                  | Đổi gì                          |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------- |
| `data-accent`    | `blue` (mặc định), `indigo`, `violet`, `pink`, `orange`, `green`, `teal`, `graphite` | `accent*`, `focus`, màu chọn trên diagram |
| `data-diagram`   | `colorful` (mặc định), `c4`                                              | `--ac-<type>-fill/stroke/text`  |

Mỗi biến thể có giá trị riêng cho theme sáng và tối (`ThemeVariant`). `tokensCss` tự thêm biến thể
accent; biến thể diagram truyền qua `extra.variants: diagramPaletteVariants()`. Accent sinh từ
thang màu bằng `accentColors()`: chọn bậc sáng nhất mà chữ trắng trên nút vẫn đủ tương phản.

Thêm màu nhấn: thêm một dòng vào `accents`. Thêm bảng màu diagram: thêm vào `diagramPalettes`
và nhánh tương ứng trong `typeColor()`.

## Thêm / đổi token

1. Sửa `semantic.light` **và** `semantic.dark` (test bắt buộc hai theme cùng bộ key).
2. Chạy `pnpm --filter @archcode/core exec vitest run test/tokens.test.ts`: test kiểm tra
   độ tương phản WCAG AA cho chữ, chữ phụ, màu code, mọi màu nhấn và chữ trên nền node của
   mọi bảng màu.
3. Dùng biến mới trong CSS: `var(--ac-color-<tên>)`.
