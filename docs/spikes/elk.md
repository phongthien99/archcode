# Spike S2-LAYOUT-01 — ELK.js cho auto-layout

> Ngày: 2026-10-10 · elkjs 0.12.0 · Node 24 · `elk.bundled.js` (chạy cùng thread)

## Câu hỏi

1. ELK có xử lý được group lồng nhau (compound node) và edge vượt ranh giới group không?
2. Hệ tọa độ của edge/label trả về là gì?
3. Kết quả có deterministic không?
4. Có đạt ngân sách hiệu năng (200 node / 400 edge < 500ms) không?

## Kết quả

**1. Group lồng nhau:** Có. Dùng `elk.hierarchyHandling: INCLUDE_CHILDREN` ở root, khai báo **toàn bộ edge ở root**, kể cả edge nối node nằm sâu trong group. Padding của group dùng `elk.padding: [top=40,...]` để chừa chỗ cho tên group.

**2. Tọa độ:**
- Node: `x, y` tương đối so với node cha → cộng dồn offset khi duyệt cây.
- Edge: ELK gắn thêm trường `container` (group cha chung gần nhất của hai đầu). `sections` và `labels` của edge **tương đối so với `container`**, không phải so với nơi khai báo.
  → Khi chuyển sang tọa độ tuyệt đối: cộng offset tuyệt đối của `container`.

**3. Deterministic:** Có. Chạy nhiều lần cùng input → JSON output giống hệt. Dùng thêm `elk.layered.considerModelOrder.strategy: NODES_AND_EDGES` để thứ tự khai báo trong YAML ảnh hưởng tới bố cục (người dùng kiểm soát được).

**4. Hiệu năng** (đã warm-up, đo lần chạy thứ 2):

| Kịch bản | Thời gian |
|---|---|
| 50 node / 80 edge / 5 group (cỡ phổ biến) | **~110 ms** |
| 200 node / 400 edge, phụ thuộc "thực tế" (cục bộ, chủ yếu một chiều), có label | ~1 150 ms |
| như trên + `elk.layered.thoroughness: 1` | **~660 ms** |
| 200 node / 400 edge **ngẫu nhiên** (nhiều vòng, edge dài), có label | ~11 000 ms |
| như trên, không label | ~5 600 ms |
| như trên, routing POLYLINE thay vì ORTHOGONAL | ~10 300 ms |

Lần chạy đầu tiên chậm hơn ~150ms do JIT warm-up.

## Quyết định

1. **Chọn ELK.js** làm layout engine (giữ nguyên quyết định trong tài liệu kiến trúc).
2. **Chỉnh `thoroughness` theo kích thước:** mặc định của ELK (7) cho view < 100 node; `1` cho view ≥ 100 node.
3. **Ngân sách hiệu năng điều chỉnh:** 200 node / 400 edge thực tế ≤ **1s**, chạy trong Web Worker nên không chặn UI. Ngân sách 500ms ban đầu không thực tế với ELK ở kích thước này.
4. **Bỏ S2-LAYOUT-06 (fallback dagre)** khỏi Sprint 2: ELK chạy ổn trên Node lẫn trình duyệt, dagre không xử lý group lồng nhau tốt hơn. Xem xét lại nếu model > 300 node trở nên phổ biến; khi đó hướng xử lý chính là **view lọc** (MVP đã hỗ trợ), không phải đổi engine.
5. Model lớn ngẫu nhiên (~10s) là trường hợp bệnh lý; sẽ cảnh báo trên UI khi view > 150 node và gợi ý tách view.
