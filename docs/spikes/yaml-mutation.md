# Spike S4-SPIKE-01 — Sửa YAML mà giữ comment

> Ngày: 2026-10-10 · thư viện `yaml` 2.9 · Node 24

## Câu hỏi

Canvas sửa mô hình (thêm component, đổi tên, nối quan hệ…) thì phải ghi ngược vào file YAML người dùng đang viết tay. Yêu cầu (KPI 3): **không mất comment, phần không liên quan không đổi byte nào**, để `git diff` chỉ hiện đúng thay đổi.

Ba cách được so sánh:

1. **Document API** — `parseDocument → sửa node → doc.toString()`.
2. **CST** — `Parser`/`CST.visit`/`CST.setScalarValue` của thư viện `yaml`.
3. **Vá theo range** — dùng Document AST chỉ để *định vị* (mỗi node có `range` trong text), rồi tự sinh các thay đổi text nhỏ `{from, to, insert}`.

## Kết quả đo

**Round-trip không sửa gì** (`parseDocument(t).toString() === t`), trên 9 fixture/template parse được:

- **5/9 file (56%)** giữ nguyên từng byte.
- Cả 4 file còn lại đều bị đổi format, dù không sửa gì:
  - flow sequence thêm khoảng trắng: `[critical]` → `[ critical ]`, `['*']` → `[ '*' ]`;
  - dòng dài hơn 80 ký tự bị ngắt (template e-commerce: mô tả `system`);
  - flow map dài bị bung thành nhiều dòng (template event-driven: `- { from: …, to: …, type: kafka, label: … }`).

**Một lệnh sửa** (đặt `technology` cho component đầu tiên). Số dòng xóa/thêm theo `git diff`:

| File | Số dòng | Round-trip | Document API | Vá theo range |
|---|---|---|---|---|
| document-platform.yaml | 135 | -4 +4 | -4 +5 | **-0 +1** |
| ecommerce-microservices.yaml | 123 | -5 +11 | -5 +12 | **-0 +1** |
| event-driven.yaml (flow style) | 88 | -2 +7 | -3 +8 | **-1 +1** |
| broken-ref.yaml | 24 | -1 +1 | -1 +2 | **-0 +1** |
| 5 file còn lại | 10–73 | giữ nguyên | -0 +1 | **-0 +1** |

Document API giữ được comment, nhưng **diff lẫn các dòng không liên quan** ở 4/9 file. Chỉnh `lineWidth`, `flowCollectionPadding` giảm được vài trường hợp nhưng không loại bỏ được (thư viện không lưu khoảng trắng gốc trong flow collection).

**CST** giữ nguyên byte khi *sửa giá trị scalar* (`CST.setScalarValue`), nhưng *thêm/xóa* phần tử (thêm component, xóa quan hệ, tạo section mới) phải tự dựng token CST cho từng trường hợp block/flow — phức tạp ngang cách 3 mà khó đọc hơn.

## Quyết định

**Chọn cách 3 — vá theo range** (`packages/core/src/mutate/`):

- `parseYaml` + `normalize` để tìm phần tử theo ID (cùng logic với validate, kể cả ID quan hệ sinh tự động `from->to`), lấy node AST và `range` của nó.
- Mỗi lệnh sinh danh sách thay đổi text trên **text gốc**; mọi byte ngoài các đoạn đó giữ nguyên. Editor áp thẳng `changes` thành một transaction CodeMirror nên con trỏ không nhảy.
- Giá trị mới bắt chước phần tử lân cận: block hay flow (`{ id: a, type: b }`), có dòng trống giữa các phần tử hay không, `\n` hay `\r\n`; sửa scalar giữ kiểu quote cũ (`"…"`, `'…'`, `|`); chuỗi mới chỉ quote khi đọc lại sai (`true`, `a # b`, `x: y`…).
- Key mới chèn theo thứ tự chuẩn (`id, name, type, group, technology, description, owner, tags`), comment cuối dòng của key khác được giữ.
- Xóa phần tử: xóa cả comment nằm ngay trên nó (cùng thụt lề, không cách dòng trống) — comment đó mô tả chính phần tử; không để lại hai dòng trống liền nhau; xóa phần tử cuối cùng để lại `[]` (schema yêu cầu kiểu array).
- Lưới an toàn: kết quả phải parse được, nếu không lệnh trả lỗi và text không đổi.

**Kiểm chứng (S4-MUT-10):** bộ test round-trip chạy **mọi lệnh × 11 file** (fixture, template, file lỗi, file dạng `system.components` + flow style): 139 trường hợp, kiểm tra comment còn nguyên, mỗi thay đổi < 80 ký tự với lệnh không xóa, kết quả không sinh lỗi schema/ngữ nghĩa mới.

**Hiệu năng:** `applyCommand` trên fixture 135 dòng ~3 ms; model 200 component / 400 quan hệ ~55 ms (chủ yếu là parse YAML), chạy trong Worker.

## Giới hạn đã biết

- Anchor/alias (`&x`, `*x`) không được cập nhật khi đổi ID (chưa gặp trong file kiến trúc thực tế).
- Đổi `tags` từ block sang flow giữ dạng block; giá trị nhiều dòng mới viết dạng `"…\n…"` nếu giá trị cũ không phải block scalar.
