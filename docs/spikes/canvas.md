# Spike S4-SPIKE-02 — Canvas: React Flow + layout

> Ngày: 2026-10-10 · `@xyflow/react` 12.12 · elkjs 0.12 · Chrome headless, 1440×900

## Câu hỏi

1. Vị trí node lấy từ đâu khi vừa có auto-layout (ELK) vừa có kéo thả?
2. Connector: dùng edge có sẵn của React Flow (smoothstep) hay route của ELK?
3. Group: sub-flow của React Flow hay cách khác?
4. Kéo node với 200 node / 400 connector có giữ được ≥ 30 fps (KPI 8)?

## Kết quả đo

| Phép đo (200 component / 400 quan hệ) | Thời gian |
|---|---|
| ELK auto-layout (Worker) | ~600 ms |
| Layout thủ công, mọi node đã ghim | 2.5 ms |
| Layout thủ công, 50 node mới cần tự đặt | 9 ms |
| Định tuyến 400 connector (router orthogonal của core) | **0.5 ms** |
| Tính khung 10 group | 0.06 ms |
| Kéo node trên canvas (E2E, đếm `requestAnimationFrame`) | **~50 fps**, khung chậm nhất 50 ms |

## Quyết định

**1. Vị trí node.** ELK layered không hỗ trợ ghim một phần node (chế độ `interactive` chỉ giữ *thứ tự*, không giữ tọa độ). Vì vậy:

- View **chưa có vị trí nào** → ELK như cũ (HTML xuất ra không đổi so với Sprint 3).
- View **có node đã ghim** (file layout) → *layout thủ công* (`packages/core/src/layout/manual.ts`): node ghim giữ nguyên tọa độ; node mới được đặt vào ô trống gần nhất cạnh node cùng group hoặc node có quan hệ với nó, không chồng node khác và không lọt vào group mà nó không thuộc về; không có điểm neo thì xếp vào vùng trống bên phải (đúng phương án dự phòng của S5-LAYOUT-02).
- Canvas giữ thêm **vị trí tạm trong phiên** (không ghi file) cho view chưa ghim: gõ YAML thêm component thì node cũ đứng yên, chỉ node mới được đặt (S4-CANVAS-05).
- **Lần kéo đầu tiên trong một view ghim toàn bộ node của view** vào file layout. Nhờ vậy file layout mô tả đủ bố cục, HTML xuất ra khớp canvas, kể cả khi auto-layout sau này đổi.

**2. Connector: router orthogonal riêng, dùng chung cho canvas và HTML** (`packages/core/src/layout/route.ts`). Không chọn smoothstep của React Flow, vì nó vẽ khác bản xuất. Cũng không chọn route ELK, vì phải chạy lại ELK (~600 ms) mỗi lần kéo. Router chọn cạnh ra/vào theo vị trí tương đối, trải đều cổng trên mỗi cạnh để connector không chồng nhau, đặt nhãn ở giữa đường. Thuần hàm, chạy trên main thread mỗi khung hình khi kéo. Connector chỉ render lại khi đường đi của nó đổi (kho route riêng, `useSyncExternalStore`).
  - Ở view auto-layout, HTML dùng route của ELK còn canvas dùng router, nên connector có thể khác nhau đôi chút (node thì trùng khớp). Chế độ **Xem trước** luôn hiển thị đúng bản sẽ xuất.

**3. Group: không dùng sub-flow.** Khung group *được tính* từ các component con (cùng `computeGroupBoxes` với SVG xuất ra), vẽ thành node nền (`zIndex` âm). Sub-flow buộc tọa độ con tương đối với cha, và phải đổi lại tọa độ mỗi khi khung cha co giãn. Hành vi:
  - Kéo group = kéo mọi component bên trong (kể cả group con).
  - Trong lúc kéo một node, khung group được *cố định*: thả ra ngoài viền là rời group, thả vào viền group khác là vào group đó → lệnh `updateField group` (S5-LAYOUT-08).

**4. Hiệu năng đạt KPI 8** (≥ 30 fps). Node truyền sẵn `width/height` (React Flow không phải đo DOM), nội dung node là SVG dựng sẵn trong Worker (`nodeBodySvg` — cùng hàm với renderer HTML, S4-CANVAS-02).

## Canvas và Xem trước

Giữ cả hai (quyết định 3 trong tài liệu task): **Canvas** để sửa, **Xem trước** là SVG giống hệt bản xuất. Có E2E so sánh cấu trúc node (shape, class, chữ) giữa hai chế độ.
