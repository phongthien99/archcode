# Spike S6-ROUTE-01 — libavoid-js cho connector tránh node

> Ngày: 2026-10-17 · libavoid-js 0.5.0-beta.5 · Node 20 · model `realisticModel` (test/perf-model.ts), vị trí node lấy từ ELK

## Câu hỏi

1. libavoid-js có chạy được trong Node (CLI) và trình duyệt không, nặng bao nhiêu?
2. Chất lượng route so với router hiện tại (`layout/route.ts`)?
3. Có đủ nhanh để route lại **mỗi khung hình** khi kéo node (KPI 8: 200 node / 400 connector ≥ 50 fps)?
4. License LGPL-2.1 có dùng được trong dự án MIT không?

## Kết quả

**1. Nạp và kích thước**

| | Kích thước | gzip |
|---|---|---|
| `libavoid.wasm` | 492 KB | **180 KB** |
| JS glue (`index.js`) | 44 KB | 17 KB |

- Nạp WASM trong Node: ~21 ms. Bản Node (`index-node.mjs`) tự tìm `libavoid.wasm` qua `import.meta.url`; `AvoidLib.load(url)` cho phép truyền URL tường minh (dùng cho Vite `?url`).
- **Lỗi đóng gói của bản beta:** `exports["."].types` trỏ tới `dist/libavoid.d.ts` không tồn tại → phải tự khai báo type (`typings/libavoid.d.ts` có trong package nhưng không được export). Typings cũng lệch với binding thật (`PolyLine.at(i)` đúng; enum là object embind, phải dùng `.value`).
- Binding là **embind**: mọi object C++ (`Router`, `ShapeRef`, `ConnRef`, `Point`…) phải gọi `.delete()` khi bỏ, nếu không rò bộ nhớ WASM.
- Chưa đo trong trình duyệt/Worker (cùng file WASM nên thời gian tương đương; phần cấu hình Vite để ở ROUTE-08).

**2. Chất lượng** — số đoạn connector đi xuyên qua node không phải đầu mút:

| Kích thước | Router hiện tại | libavoid |
|---|---|---|
| 10 node / 15 connector | 13 | **0** |
| 30 / 48 | 51 | **0** |
| 50 / 80 | 62 | **0** |
| 200 / 400 | 425 | **0** |

Số điểm gấp tương đương hoặc ít hơn (200/400: 703 so với 790).

**3. Hiệu năng** — cấu hình cuối cùng: 1 pin ở tâm node (`ConnDirAll`), `shapeBufferDistance=12`, `idealNudgingDistance=8`, `segmentPenalty=50`.

| Kích thước | Router hiện tại (toàn bộ) | libavoid lần đầu | libavoid mỗi khung hình kéo (trung vị / p95) |
|---|---|---|---|
| 10 / 15 | 0.4 ms | 23 ms | 2.9 / 3.6 ms |
| 20 / 30 | 0.3 ms | 38 ms | 5.7 / 9.5 ms |
| 30 / 48 | 0.6 ms | 46 ms | 33 / 41 ms |
| 50 / 80 | 0.8 ms | 91 ms | 50 / 95 ms |
| 200 / 400 | 1.7 ms | **4 400 ms** | **7 600 / 11 100 ms** |

Phát hiện khi tinh chỉnh (30/48):

| Biến thể | Lần đầu | Mỗi khung hình (trung vị) |
|---|---|---|
| 4 pin non-exclusive (giữa 4 cạnh), mặc định | 1 170 ms | 3 040 ms |
| + `segmentPenalty=50` | 198 ms | 457 ms |
| + 1 pin ở tâm thay cho 4 pin | **44 ms** | **34 ms** |
| + `nudgeOrthogonalSegmentsConnectedToShapes` | 62 ms | 71 ms |

→ Nhiều pin trên mỗi node làm không gian tìm kiếm bùng nổ; `segmentPenalty` bắt buộc phải có. Bước nudging của libavoid chạy **toàn cục** mỗi `processTransaction`, nên `moveShape` một node vẫn tốn gần bằng route lại cả view.

**4. License:** LGPL-2.1-or-later. Dùng được trong dự án MIT nếu: WASM là file riêng nạp lúc chạy (không gộp vào bundle JS, người dùng thay được), giữ nguyên license, kèm notice và link mã nguồn. Không sửa mã libavoid.

## ⚠️ Đính chính (2026-10-17, khi làm S6-ROUTE-02)

Các số đo ở mục 3 bên trên **sai một phần**: bench truyền `RoutingParameter.x.value` (số) vào `setRoutingParameter`, trong khi binding embind cần chính object enum. Truyền số thì mọi lời gọi đều ghi vào tham số đầu tiên (`segmentPenalty`), nên `shapeBufferDistance` và `idealNudgingDistance` **chưa từng được áp dụng** (connector chạy sát mép node). Adapter `layout/avoid.ts` đã sửa, có test chống tái phát (khoảng hở 12px).

Đo lại với cấu hình đúng — route toàn bộ view một lần (`routeEdgesAvoid`, trung vị):

| Kích thước | Router hiện tại | libavoid (buffer 12, nudging 8, penalty 50) |
|---|---|---|
| 10 / 15 | 0.4 ms | 3.9 ms |
| 20 / 30 | 0.3 ms | 64 ms |
| 30 / 48 | 0.6 ms | 193 ms |
| 50 / 80 | 0.8 ms | 184 ms |
| 100 / 200 | ~1 ms | **~23 000 ms** |
| 200 / 400 | 1.7 ms | **~16 500 ms** |

Biến thể tham số (route một lần):

| Biến thể | 50 / 80 | 100 / 200 |
|---|---|---|
| chỉ `segmentPenalty=50` | 89 ms | 11 200 ms |
| + buffer 4 | 58 ms | 21 600 ms |
| + buffer 12 | 117 ms | 20 600 ms |
| + nudging 8 | 82 ms | 21 600 ms |
| buffer 12 + nudging 8 | 121 ms | 20 300 ms |
| như trên, `segmentPenalty=200` | 110 ms | 16 900 ms |

→ Không tham số nào đưa view 100 node xuống dưới ~11 s. Thời gian tăng vọt trong khoảng 50 → 100 node, không tuyến tính. **Rủi ro R-ROUTE-PERF vì vậy không chỉ ảnh hưởng thao tác kéo mà cả xuất SVG/HTML/CLI ở view ≥ ~100 node.**

### Ảnh hưởng của group (S6-ROUTE-03)

Group không liên quan được đưa vào router như vật cản; node nằm trong group bị chặn được bỏ khỏi router (khung group đã che). Mỗi tập group "được phép" chạy một router riêng. Kết quả: **group làm route nhanh hơn**, vì mỗi router có ít shape hơn:

| Kích thước (model có domain group) | Không truyền group | Có group |
|---|---|---|
| 20 / 30 (1 group) | 64 ms | 46 ms |
| 30 / 48 (2) | 203 ms | 65 ms |
| 50 / 80 (3) | 120 ms | 49 ms |
| 100 / 200 (5) | 13 200 ms | **1 750 ms** |
| 200 / 400 (10) | 9 700 ms | **2 200 ms** |

→ View lớn **có group** xuất được trong ~2 s. View lớn **không có group** vẫn chậm (10–23 s).

## Kết luận

- **Chất lượng: đạt.** libavoid loại bỏ hoàn toàn connector cắt ngang node — đúng vấn đề cần giải.
- **Route lại mỗi khung hình khi kéo: không đạt.** Chỉ dưới 16 ms/khung hình khi view ≤ ~20 node; 50 node đã ~20 fps; 200/400 mất ~7.6 s mỗi lần. Không thể thay router hiện tại trong vòng lặp kéo.

## Quyết định (2026-10-17)

Giữ nguyên kế hoạch dùng libavoid-js (task list không đổi). Vấn đề hiệu năng ghi vào bảng rủi ro **R-ROUTE-PERF** ([02-architecture-and-tech-stack.md §11](../02-architecture-and-tech-stack.md#11-rủi-ro-kỹ-thuật--giảm-thiểu)); các phương án dưới đây là phương án dự phòng, xử lý tiếp ở S6-ROUTE-06.

## Phương án dự phòng (chưa áp dụng)

**Phương án lai — route hai tầng:**

1. **Trong lúc kéo:** giữ router hiện tại (0.5–2 ms cho 400 connector) — KPI 8 giữ nguyên.
2. **Khi thả chuột / khi YAML đổi:** chạy libavoid trong **Worker** (debounce ~150 ms), xong thì thay route trên canvas. Kết quả bị hủy nếu có thay đổi mới hơn.
3. **Xuất SVG/HTML, CLI:** luôn dùng libavoid (chờ được vài giây ở view lớn).
4. **Ngưỡng:** view > N connector (đề xuất N ≈ 150, chốt sau khi có số 75/100 node) thì canvas chỉ dùng router hiện tại, chạy libavoid khi xuất; UI ghi chú "connector sẽ được tối ưu khi xuất".
5. Fallback như kế hoạch: WASM lỗi → router hiện tại.

Nếu áp dụng, hệ quả cho task list: ROUTE-06 đổi từ "route tăng dần mỗi khung hình" thành "route nền trong Worker sau khi thả + ngưỡng"; canvas và bản xuất có thể khác nhau **trong lúc kéo** (giống tình trạng ELK/canvas đã chấp nhận ở Sprint 4).

**Phương án thay thế:** cải tiến router tự viết (lưới visibility + A*, không nudging toàn cục) — nhanh hơn nhiều nhưng chất lượng thấp hơn libavoid và tốn ~3–4 ngày.
