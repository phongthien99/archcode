# ArchCode

**Visual-first Architecture as Code** — mô tả kiến trúc hệ thống bằng YAML, xem diagram ngay khi gõ, kiểm tra rule kiến trúc, xuất tài liệu HTML. Chạy **hoàn toàn trên trình duyệt**, không có server: dữ liệu kiến trúc không rời máy bạn.

> Trạng thái: MVP (Sprint 1–5). Tài liệu thiết kế: [docs/](./docs).

## Dùng trên web

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

**Canvas (sửa trực quan) — mặc định**

- Kéo một loại component từ **palette** vào canvas để tạo. Thả vào trong khung group thì component thuộc group đó.
- Kéo từ chấm tròn ở cạnh node sang node khác để nối quan hệ. Giao thức được gợi ý theo đích: database → `sql`, queue → `amqp`…
- Chọn một connector để chỉnh đường đi: kéo chấm nhỏ giữa đoạn để thêm điểm gấp, kéo chấm tròn để dời, double-click để bỏ. Mũi tên bám vào cạnh node hướng về điểm gấp gần nhất, nên kéo điểm gấp cũng là cách chọn cạnh nối. **Bỏ điểm gấp** (panel Thuộc tính) để quay lại tự định tuyến. Điểm gấp lưu trong file layout.
- Chọn node/connector/group → sửa trong **Thuộc tính** (Enter hoặc rời ô để ghi). Đổi ID cập nhật mọi tham chiếu: quan hệ, view, rule, file layout.
- `Delete` để xóa. Nếu phần tử còn được tham chiếu trong views/rules, ứng dụng hỏi lại trước khi xóa.
- Kéo node để sắp xếp; kéo ra ngoài viền group là rời group. **Sắp xếp lại** bỏ mọi vị trí đã ghim (hoặc chỉ các node đang chọn).
- Mỗi thao tác ghi thẳng vào YAML bên trái. Chỉ đoạn liên quan thay đổi, **comment và format còn nguyên**.
- YAML đang lỗi cú pháp thì canvas chuyển sang chỉ đọc, cho tới khi sửa xong.

**YAML editor và Xem trước**

- Gõ YAML → diagram cập nhật sau ~250ms. Lỗi hiện ngay trong editor (gạch chân) và trong panel **Kiểm tra**; click để nhảy tới dòng.
- Đặt con trỏ trong block của một component thì node đó được chọn trên canvas, và ngược lại.
- `Ctrl + Space` để gợi ý: key, component type, giao thức, ID component/group.
- **Xem trước**: SVG giống hệt bản xuất HTML.

**Chung**

- `Ctrl+Z` / `Ctrl+Shift+Z` (`Ctrl+Y`): một lịch sử undo/redo chung cho canvas và editor. Mỗi thao tác canvas là một bước; gõ liên tục được gộp lại cho tới khi nghỉ 0,5 giây.
- `Ctrl+K`: tìm component/group theo id, tên, công nghệ, owner (không cần gõ dấu). Chọn kết quả → căn giữa node, nhảy tới YAML, tự chuyển sang view có node đó.
- **Mở thư mục…** (Chrome/Edge): mở thẳng repo đã clone, chọn file kiến trúc. `Ctrl+S` ghi đè `architecture.yaml` và `architecture.layout.yaml`. Quay lại tab mà file đã bị đổi bên ngoài (git pull, editor khác) thì ứng dụng hỏi nạp lại hay giữ bản đang sửa. **Gần đây…** mở lại thư mục cũ.
- Firefox/Safari: **Mở…** (chọn cả `.yaml` và `.layout.yaml`), **Lưu** để tải về hai file.
- **Mới từ mẫu**: Trống, Document Platform, E-commerce microservices, Event-driven (IoT). Có thể mở cả file `.html` đã xuất (YAML và bố cục được nhúng sẵn).
- **Xuất HTML**: một file tự chứa, mở offline. Thêm **SVG / PNG** của view hiện tại.
- Tự lưu vào trình duyệt (IndexedDB), kể cả vị trí node.

### Deploy

Bản build chỉ là file tĩnh — đặt ở bất kỳ đâu (GitHub Pages, S3, Nginx, thư mục chia sẻ nội bộ):

```bash
pnpm build:web    # → apps/web/dist
```

Workflow [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) deploy lên GitHub Pages khi push `main` (bật Settings → Pages → Source: GitHub Actions).

## Dùng trong CI (CLI)

```bash
pnpm archcode validate architecture.yaml                     # exit 1 nếu có lỗi hoặc vi phạm rule mức error
pnpm archcode build architecture.yaml -o out/architecture.html
pnpm archcode build architecture.yaml -f svg --view overview
```

| Lệnh                  | Tùy chọn                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `validate <files...>` | `--strict` (cảnh báo cũng fail), `--format json`, `--no-color`                                                                          |
| `build <file>`        | `-o`, `-f html\|svg`, `--view <id>`, `--force` (vẫn ghi file, exit code vẫn 1), `--no-embed-source`, `--layout <path>`, `--auto-layout` |

Exit code: `0` hợp lệ · `1` có lỗi · `2` không đọc được file / sai tham số. Ví dụ GitHub Actions: [docs/ci-example.yml](./docs/ci-example.yml). Đóng gói CLI: `pnpm --filter @archcode/cli build` → `packages/cli/dist/archcode.mjs`.

Web và CLI dùng chung một core: cùng YAML cho ra **cùng một file HTML**, giống từng byte (có test E2E kiểm chứng).

## Nhúng vào Hugo

Ngoài cách xuất HTML/SVG trước bằng CLI, ArchCode có viewer client-side cho Hugo:
Markdown giữ YAML inline, còn trình duyệt của reviewer tự validate và render diagram.

```bash
pnpm --filter @archcode/web build:hugo-viewer
# copy apps/web/dist-hugo/archcode-viewer.js vào static/js/ của Hugo site
```

Xem shortcode và ví dụ dùng trong [docs/hugo-client-viewer.md](./docs/hugo-client-viewer.md).

## YAML

```yaml
version: 1
system:
  id: document-platform
  name: Document Platform

groups:
  - id: core
    name: Core Domain

components:
  - id: api-gateway
    type: gateway # person, system, external, frontend, gateway, service, database, queue, storage, cache
    technology: Kong
  - id: document-service
    type: service
    group: core
  - id: document-db
    type: database
    group: core

relationships:
  - from: api-gateway
    to: document-service
    type: http
    label: REST /documents
  - from: document-service
    to: document-db
    type: sql

views:
  - id: overview
    name: Tổng quan
    include: ['*'] # *, <id>, group:<id>, type:<type>, tag:<tag>
    direction: LR

rules:
  - id: no-cycles
    type: no-circular
    severity: error
  - id: no-cross-domain-db
    type: forbidden
    from: { type: service }
    to: { type: database }
    unless: same-group # so sánh chính xác: group cha/con không tính là cùng group
```

Ví dụ đầy đủ: [fixtures/document-platform.yaml](./fixtures/document-platform.yaml). JSON Schema: `packages/core/src/schema/architecture.schema.json`. Không khai báo `rules` thì mặc định cảnh báo vòng phụ thuộc và component mồ côi.

Detailed syntax guide: [docs/05-syntax-guide.md](./docs/05-syntax-guide.md).

Rule `no-circular` có thể bỏ qua quan hệ bất đồng bộ (event bus hai chiều là bình thường): `{ id: no-cycles, type: no-circular, ignore: async }` (async = `amqp`, `kafka`, `event`, `async`, `mqtt`, `sns`, `sqs`, `pubsub`).

## Publish core library

`@archcode/core` can be packed and published as the reusable library package:

```bash
pnpm --filter @archcode/core build
pnpm --filter @archcode/core pack:dry
npm publish ./packages/core/dist --access public
```

Before publishing, confirm the npm package name/scope. The package is licensed under MIT.

## File layout

Vị trí node **không** nằm trong file kiến trúc. Khi bạn kéo node, vị trí được ghi vào file đi kèm `<tên>.layout.yaml` (ví dụ `architecture.layout.yaml`), nên diff của file kiến trúc chỉ chứa thay đổi về kiến trúc.

```yaml
# architecture.layout.yaml — sinh tự động, không cần sửa tay
version: 1
views:
  overview: # ID của view
    nodes: # góc trên trái của node, theo ID component
      api-gateway: { x: 320, y: 120 }
      document-service: { x: 320, y: 300 }
    edges: # (tùy chọn) điểm gấp của connector, theo ID quan hệ
      api-gateway->document-service: { points: [[400, 200], [400, 260]] }
```

- File layout là **tùy chọn**. View không có vị trí nào được tự sắp xếp (ELK). View có node đã ghim dùng đúng các vị trí đó; node mới được tự đặt quanh các node cũ.
- Lần đầu kéo một node trong view, ứng dụng ghim mọi node của view đó, để HTML xuất ra khớp với canvas.
- ID không tồn tại chỉ sinh **cảnh báo** (`layout-unknown-id`), không làm build fail. Khi lưu, entry của phần tử đã xóa được dọn đi; đổi ID trên canvas cũng đổi key trong file layout.
- File được ghi theo dạng chuẩn: key sắp xếp, tọa độ số nguyên, mỗi node một dòng. Cùng bố cục luôn cho cùng nội dung, diff gọn.
- CLI tự đọc `<tên>.layout.yaml` cạnh file YAML. Dùng `--layout <path>` để chỉ định file khác, `--auto-layout` để bỏ qua.

**Quy ước Git:** commit file layout cùng file kiến trúc, trong cùng commit nếu thay đổi đi kèm nhau (thêm service và đặt vị trí cho nó). Commit chỉ sắp xếp lại diagram thì chỉ đụng tới `*.layout.yaml`, ví dụ `docs(arch): sắp xếp lại view overview`. Khi merge mà file layout xung đột, có thể giữ một phía rồi mở lại ứng dụng: node thiếu vị trí sẽ được tự đặt.
