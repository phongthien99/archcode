# ArchCode

**Visual-first Architecture as Code** — mô tả kiến trúc hệ thống bằng YAML, xem diagram ngay khi gõ, kiểm tra rule kiến trúc, xuất tài liệu HTML. Chạy **hoàn toàn trên trình duyệt**, không có server: dữ liệu kiến trúc không rời máy bạn.

> Trạng thái: MVP giai đoạn 1 (Sprint 1–3). Tài liệu thiết kế: [docs/](./docs).

## Dùng trên web

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

- Gõ YAML bên trái → diagram bên phải cập nhật sau ~250ms. Lỗi hiện ngay trong editor (gạch chân) và trong panel **Kiểm tra** — click để nhảy tới dòng.
- Click một node trên diagram → nhảy tới định nghĩa trong YAML.
- Kéo để di chuyển, cuộn chuột để zoom, **Vừa khung** để căn lại.
- `Ctrl + Space` để gợi ý: key, component type, giao thức, ID component/group.
- **Mới từ mẫu**: Document Platform, E-commerce microservices, Event-driven (IoT).
- **Mở…** hoặc kéo thả file `.yaml` — hoặc file `.html` đã xuất trước đó (YAML gốc được nhúng sẵn).
- **Xuất HTML**: một file tự chứa, mở offline. Thêm **SVG / PNG** của view hiện tại.
- Tự lưu vào trình duyệt (IndexedDB); tải lại trang không mất bài.

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

| Lệnh                  | Tùy chọn                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `validate <files...>` | `--strict` (cảnh báo cũng fail), `--format json`, `--no-color`                                      |
| `build <file>`        | `-o`, `-f html\|svg`, `--view <id>`, `--force` (vẫn ghi file, exit code vẫn 1), `--no-embed-source` |

Exit code: `0` hợp lệ · `1` có lỗi · `2` không đọc được file / sai tham số. Ví dụ GitHub Actions: [docs/ci-example.yml](./docs/ci-example.yml). Đóng gói CLI: `pnpm --filter @archcode/cli build` → `packages/cli/dist/archcode.mjs`.

Web và CLI dùng chung một core: cùng YAML cho ra **cùng một file HTML**, giống từng byte (có test E2E kiểm chứng).

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

## Cấu trúc

```
packages/core   Parse, validate, rule, layout (ELK), SVG, HTML — thuần TypeScript, không phụ thuộc DOM/Node
packages/cli    CLI `archcode` cho CI
apps/web        Web app tĩnh: React + CodeMirror; core chạy trong Web Worker
fixtures/       YAML mẫu dùng chung cho test
docs/           Feature list, kiến trúc & tech stack, task breakdown, spike
```

## Phát triển

```bash
pnpm test         # unit test (core, cli, web)
pnpm e2e          # Playwright trên bản build production
pnpm coverage     # độ phủ của core
pnpm typecheck
pnpm lint         # gồm rule cấm core dùng API trình duyệt/Node
pnpm format
```
