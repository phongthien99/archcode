# ArchCode — Feature List

> Phần mềm vẽ kiến trúc hệ thống theo hướng **Visual-first Architecture as Code**
> Phiên bản tài liệu: 0.1 · Ngày: 2026-10-10 · Trạng thái: Draft

---

## 0. Định vị & ràng buộc sản phẩm

**Định vị:** Người mới bắt đầu bằng kéo thả; developer/architect làm việc trực tiếp với YAML, Git và CI/CD. Giá trị cốt lõi là biến sơ đồ thành **mô hình kiến trúc có cấu trúc**, có thể kiểm thử, review và tự động hóa — không phải số lượng hình vẽ.

**Ba trụ cột:**

| Trụ cột | Mục tiêu | Người dùng chính |
|---|---|---|
| Visual Modeling | Vẽ kiến trúc bằng giao diện trực quan | Architect, Tech Lead, Developer |
| Architecture as Code | Định nghĩa kiến trúc bằng YAML, lưu Git, review qua PR | Team theo GitOps / CI/CD |
| Architecture Intelligence | Phân tích dependency, kiểm tra rule, sinh tài liệu | Quản trị kiến trúc, QA kiến trúc |

**Ràng buộc bắt buộc (đã chốt):**

| Mã | Ràng buộc | Hệ quả |
|---|---|---|
| C-01 | **Cấu hình kiến trúc bằng YAML** | YAML là source of truth; mọi thao tác trên diagram đều ghi ngược về YAML |
| C-02 | **Sinh ra HTML** từ YAML | Output chính là một file HTML tự chứa (diagram + tài liệu + báo cáo validate) |
| C-03 | **Chạy hoàn toàn trên trình duyệt, không cần server render** | Toàn bộ parse, validate, layout, render, export chạy client-side; deploy dạng static files |
| C-04 | Cùng một core chạy được trong CI | Core không phụ thuộc DOM; CLI dùng lại core trên Node.js |

**Quy ước ưu tiên:** P0 = bắt buộc cho MVP · P1 = V1 · P2 = V2 · ⚠ = cần backend/dịch vụ ngoài, xung đột với C-03 (xem mục 11).

---

## A. Visual Editor

| ID | Feature | Mô tả | Ưu tiên |
|---|---|---|---|
| VIS-01 | Infinite canvas | Canvas không giới hạn, zoom, pan, snap-to-grid, minimap | P0 |
| VIS-02 | Drag & drop | Kéo node từ component palette vào canvas | P0 |
| VIS-03 | Node editor | Thêm/sửa/xóa component qua property panel | P0 |
| VIS-04 | Connectors | Nối node có hướng, nhãn, kiểu quan hệ (http, grpc, sql, event…) | P0 |
| VIS-05 | Auto-layout | Tự sắp xếp theo graph layout (TB/LR), hỗ trợ group lồng nhau | P0 |
| VIS-06 | Group & boundary | Gom nhóm theo domain, cluster, network, trust boundary | P0 |
| VIS-07 | Layers | Bật/tắt lớp Application, Data, Infrastructure, Security | P1 |
| VIS-08 | Search & navigation | Tìm component, nhảy tới node trên canvas và dòng trong YAML | P0 |
| VIS-09 | Undo/redo | Lịch sử chỉnh sửa thống nhất cho cả canvas và YAML | P0 |
| VIS-10 | Export ảnh | Xuất SVG, PNG (P0); PDF (P1) | P0/P1 |
| VIS-11 | Templates | Microservices, monolith, event-driven, cloud-native | P1 |
| VIS-12 | Multiple views | Một mô hình, nhiều góc nhìn | P1 |

> **Yêu cầu nền tảng:** Node và connector là đối tượng có cấu trúc (id, type, thuộc tính), không phải hình vẽ tự do.

## B. Architecture as Code Engine

| ID | Feature | Mô tả | Ưu tiên |
|---|---|---|---|
| AAC-01 | Architecture YAML DSL | Ngôn ngữ mô tả kiến trúc, có JSON Schema công bố | P0 |
| AAC-02 | YAML import | Mở file/thư mục `.yaml` từ máy hoặc kéo thả vào trình duyệt | P0 |
| AAC-03 | YAML export | Lưu file YAML để quản lý bằng Git | P0 |
| AAC-04 | Bidirectional sync | Sửa diagram ↔ cập nhật YAML theo thời gian thực, **giữ nguyên comment và format** | P0 |
| AAC-05 | Schema validation | Kiểm tra cấu trúc, kiểu dữ liệu, trường bắt buộc; báo lỗi kèm số dòng | P0 |
| AAC-06 | Semantic validation | Tham chiếu không tồn tại, trùng ID, self-loop, group không tồn tại | P0 |
| AAC-07 | Stable IDs | ID do người dùng đặt, không sinh ngẫu nhiên; diff không nhiễu bởi vị trí | P0 |
| AAC-08 | Formatter | Chuẩn hóa thứ tự key, thụt lề | P1 |
| AAC-09 | Model migration | Nâng `version` của schema tự động | P1 |
| AAC-10 | Code preview | Editor YAML song song với canvas, highlight, autocomplete từ schema | P0 |
| AAC-11 | **HTML generator** | Sinh file HTML tự chứa từ YAML (xem mục G) | **P0** |
| AAC-12 | Tách presentation | Vị trí/màu/kích thước lưu ở file layout riêng, không lẫn vào semantic model | P0 |

## C. Architecture Modeling

| ID | Feature | Mô tả | Ưu tiên |
|---|---|---|---|
| MOD-01 | C4 Model | Context, Container, Component (Code: P2) | P0 |
| MOD-02 | System landscape | Sơ đồ các hệ thống trong tổ chức | P1 |
| MOD-03 | Deployment model | Node, VM, container, cluster, region | P1 |
| MOD-04 | Data flow | Luồng dữ liệu giữa các thành phần | P1 |
| MOD-05 | Integration model | HTTP, gRPC, event, queue, webhook | P0 |
| MOD-06 | Network topology | VPC, subnet, ingress, egress, firewall | P2 |
| MOD-07 | Security boundary | Trust zone, ranh giới bảo mật | P1 |
| MOD-08 | Cloud resources | AWS, Azure, GCP, Kubernetes icon/type | P2 |
| MOD-09 | Technology metadata | Framework, runtime, protocol, DB engine | P0 |
| MOD-10 | Environment views | Dev, staging, production | P2 |
| MOD-11 | Ownership | Team/người chịu trách nhiệm | P0 |
| MOD-12 | Custom types | Tự định nghĩa loại node, connector, thuộc tính | P1 |

## D. Multi-view & Reusable Architecture — P1

| ID | Feature | Mô tả |
|---|---|---|
| VIEW-01 | Một model, nhiều diagram | Context/Container/Deployment dùng chung tập component |
| VIEW-02 | Drill-down | Click vào system để mở diagram chi tiết |
| VIEW-03 | Filtered views | Lọc theo id, type, group, tag, layer |
| VIEW-04 | Cross-diagram navigation | Điều hướng giữa các view theo quan hệ thực tế |
| VIEW-05 | Reusable patterns | API Gateway, Outbox, Saga, CQRS, auth flow (P2) |
| VIEW-06 | Reusable components | Import component definition từ file/package khác (P2) |
| VIEW-07 | Architecture variants | So sánh hai phương án thiết kế (P2) |

## E. Architecture Analysis & Rules

| ID | Feature | Mô tả | Ưu tiên |
|---|---|---|---|
| ANA-01 | Dependency graph | Quan hệ phụ thuộc trực tiếp/gián tiếp | P1 |
| ANA-02 | Circular dependency | Phát hiện vòng phụ thuộc | **P0** |
| ANA-03 | Layering rules | Ràng buộc chiều phụ thuộc giữa các layer | P1 |
| ANA-04 | Forbidden dependencies | Cấm quan hệ theo id/type/group/tag | P1 |
| ANA-05 | Protocol validation | Quan hệ phải có giao thức hợp lệ | P1 |
| ANA-06 | Orphan detection | Component không có quan hệ | **P0** |
| ANA-07 | Coupling analysis | Fan-in / fan-out, instability | P1 |
| ANA-08 | Impact analysis | Liệt kê thành phần bị ảnh hưởng khi sửa một node | P1 |
| ANA-09 | Fitness functions | Kiểm thử kiến trúc tự động trong CI | P1 |
| ANA-10 | Policy engine | Rule `error` / `warning`, có cơ chế ngoại lệ (`exceptions`) | P1 |
| ANA-11 | Risk annotations | SPOF, trust boundary, điểm lỗi tiềm tàng | P2 |
| ANA-12 | Compliance checks | Bộ rule chuẩn nội bộ cấp tổ chức | P2 |

## F. Git, Version Control & CI/CD

| ID | Feature | Mô tả | Ưu tiên |
|---|---|---|---|
| GIT-01 | Mở/lưu thư mục local | File System Access API — sửa trực tiếp file trong repo đã clone | P0 |
| GIT-02 | CLI | `archcode validate`, `archcode build` (YAML → HTML/SVG) | P1 |
| GIT-03 | CI validation | Chạy CLI trong GitHub Actions/GitLab CI, fail khi có lỗi mức `error` | P1 |
| GIT-04 | Semantic diff | So sánh 2 phiên bản: service/dependency/protocol/boundary nào thay đổi | P1 |
| GIT-05 | PR report | CI comment báo cáo diff + vi phạm rule vào PR | P1 |
| GIT-06 | GitHub/GitLab integration | Đọc/ghi repo trực tiếp từ trình duyệt qua REST API + token | P2 ⚠ |
| GIT-07 | Snapshot / tag / rollback | Dựa trên Git tag; web chỉ hiển thị | P2 |

## G. Documentation & HTML Generator

| ID | Feature | Mô tả | Ưu tiên |
|---|---|---|---|
| DOC-01 | **HTML tự chứa** | Một file `.html` duy nhất, không cần mạng, mở trực tiếp bằng trình duyệt | **P0** |
| DOC-02 | Nội dung HTML | Tổng quan hệ thống, diagram (SVG inline, zoom/pan), bảng component, bảng relationship, báo cáo validation | **P0** |
| DOC-03 | Mỗi view một tab | Các view trong YAML trở thành tab trong HTML | P1 |
| DOC-04 | Trang theo service | Mỗi component có phần chi tiết: mô tả, công nghệ, owner, depends on, used by | P1 |
| DOC-05 | Export Markdown | Để nhúng vào README / docs portal | P1 |
| DOC-06 | Theme & template | Tùy biến giao diện HTML đầu ra (logo, màu, template) | P2 |
| DOC-07 | ADR | Architecture Decision Record liên kết với component | P2 |
| DOC-08 | Static site | Sinh thư mục HTML nhiều trang để publish lên GitHub Pages | P2 |

## H. Collaboration & Governance — P2

| ID | Feature | Ghi chú |
|---|---|---|
| COL-01 | Comment trên node/diagram | Lưu trong YAML (`notes`) hoặc qua PR comment — không cần backend |
| COL-02 | Review & approval | Dùng luồng Pull Request của Git |
| COL-03 | Organization templates & rules | Chia sẻ qua file/package rule dùng chung |
| COL-04 | Realtime co-editing | ⚠ Cần signaling/sync server (hoặc WebRTC P2P) |
| COL-05 | Workspace, RBAC, SSO/OIDC, audit log | ⚠ Cần backend — chỉ cân nhắc cho bản Enterprise |

## I. AI-assisted Architecture — P2

Text-to-YAML, đề xuất component còn thiếu, giải thích dependency, phát hiện thiết kế bất hợp lý, sinh ADR, tóm tắt thay đổi trong PR, hỏi đáp về kiến trúc.

- Chạy client-side, gọi API LLM bằng key của người dùng (lưu cục bộ).
- **AI chỉ đề xuất thay đổi dạng patch trên YAML**, người dùng xem diff và xác nhận trước khi áp dụng.

## J. Import & Ecosystem — P2

| ID | Feature | Ghi chú |
|---|---|---|
| IMP-01 | Import Mermaid / PlantUML | Import một chiều, phần không map được giữ lại dạng ghi chú |
| IMP-02 | Import draw.io | Chỉ import shape có thể map sang type |
| IMP-03 | Import OpenAPI | Dựng API/service view |
| IMP-04 | Import Terraform / Kubernetes manifests | Dựng deployment view |
| IMP-05 | Export Mermaid / PlantUML / Structurizr DSL | Tương thích hệ sinh thái |
| IMP-06 | Plugin SDK | Custom node type, rule, exporter |
| IMP-07 | VS Code extension | Dùng lại core + webview |
| IMP-08 | MCP server | Cho AI agent đọc/validate model |

---

## 10. Lộ trình phát hành

### MVP — Core editor + YAML → HTML (chạy 100% trên web)
- Canvas, node, connector, group, auto-layout (VIS-01→06, 08, 09).
- YAML DSL + JSON Schema, editor YAML có highlight & báo lỗi theo dòng (AAC-01→07, 10, 12).
- Đồng bộ hai chiều canvas ↔ YAML, giữ comment (AAC-04).
- Rule cơ bản: circular dependency, orphan (ANA-02, ANA-06).
- **Sinh HTML tự chứa** (AAC-11, DOC-01, DOC-02); export SVG/PNG/YAML.
- Lưu cục bộ: IndexedDB + mở/lưu thư mục local (GIT-01).
- Deploy dạng static site.

**Mục tiêu:** tạo, sửa, lưu và tái tạo sơ đồ + tài liệu HTML nhất quán từ một file YAML.

### V1 — Engineering workflow
CLI & CI validation, semantic diff, policy engine, multi-view & drill-down, impact/coupling analysis, Markdown export, templates, custom types.

### V2 — Platform & Intelligence
AI-assisted, import Terraform/K8s/OpenAPI/Mermaid, plugin SDK, GitHub integration trực tiếp, static docs site, VS Code extension, (Enterprise) collaboration có backend.

---

## 11. Tính năng xung đột với ràng buộc "không server"

| Tính năng | Vấn đề | Hướng xử lý không cần server |
|---|---|---|
| Realtime collaboration | Cần sync server | Dùng Git + PR; về sau có thể P2P (WebRTC + CRDT) |
| GitHub OAuth login | OAuth cần client secret phía server | Personal Access Token lưu local, hoặc làm việc với repo clone qua File System Access API |
| Publish docs nội bộ | Cần hosting | CI build HTML rồi đẩy lên GitHub Pages / S3 (static) |
| RBAC, SSO, audit log | Cần backend | Ủy quyền cho quyền repo Git; Enterprise mới thêm backend |
| Webhook, REST API | Cần server | Thay bằng CLI chạy trong CI |

---

## 12. KPI cho MVP

1. Người dùng tạo được sơ đồ đầu tiên mà không cần viết YAML.
2. Một YAML hợp lệ luôn render ra cùng một diagram và cùng một HTML (deterministic).
3. Thao tác trên canvas cập nhật đúng YAML, không làm mất comment.
4. Import/export không mất ID, quan hệ hoặc thuộc tính được hỗ trợ.
5. Lỗi tham chiếu và vòng phụ thuộc được báo kèm số dòng.
6. File HTML sinh ra mở được offline, không request mạng nào.
7. Ứng dụng hoạt động khi deploy lên bất kỳ static hosting nào, không có API backend.
8. Model 200 node / 400 edge: validate + layout < 1 giây, canvas giữ ≥ 30 fps.
