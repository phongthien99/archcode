# ArchCode

**Visual-first Architecture as Code** — mô tả kiến trúc hệ thống bằng YAML, validate trong CI, sinh diagram và tài liệu HTML. Chạy hoàn toàn trên trình duyệt, không cần server.

> Trạng thái: Sprint 2 xong (core + CLI `validate`/`build` → HTML). Xem [docs/](./docs).

## Cấu trúc

```
packages/core   Parse, validate, view resolver — thuần TypeScript, không phụ thuộc DOM/Node
packages/cli    CLI `archcode` cho CI
apps/web        Web app tĩnh (Sprint 3)
fixtures/       YAML mẫu dùng chung cho test
docs/           Feature list, kiến trúc, task breakdown
```

## Bắt đầu

```bash
pnpm install
pnpm archcode validate fixtures/document-platform.yaml
pnpm archcode validate fixtures/invalid/broken-ref.yaml   # xem lỗi mẫu
```

Tùy chọn của `validate`: `--strict` (cảnh báo cũng làm fail), `--format json`, `--no-color`.
Exit code: `0` hợp lệ · `1` có lỗi · `2` không đọc được file / sai tham số.

### Sinh tài liệu HTML

```bash
pnpm archcode build fixtures/document-platform.yaml -o out/architecture.html
pnpm archcode build fixtures/document-platform.yaml -f svg --view core-domain   # SVG một view
```

File HTML tự chứa (mở offline, không tải tài nguyên ngoài): diagram theo từng view (kéo để di chuyển, Ctrl + cuộn để zoom), bảng component với phụ thuộc vào / được dùng bởi, bảng quan hệ, kết quả kiểm tra. Tùy chọn: `--force` (vẫn ghi khi có lỗi, exit code vẫn 1), `--no-embed-source`.

Dùng trong CI: xem [docs/ci-example.yml](./docs/ci-example.yml). Đóng gói CLI: `pnpm --filter @archcode/cli build` → `packages/cli/dist/archcode.mjs`.

## YAML tối thiểu

```yaml
version: 1
system:
  id: document-platform
  name: Document Platform
components:
  - id: api-gateway
    type: gateway
  - id: document-service
    type: service
relationships:
  - from: api-gateway
    to: document-service
    type: http
```

Đầy đủ cú pháp: [docs/02-architecture-and-tech-stack.md §4.2](./docs/02-architecture-and-tech-stack.md) và ví dụ [fixtures/document-platform.yaml](./fixtures/document-platform.yaml). JSON Schema: `packages/core/src/schema/architecture.schema.json`.

## Phát triển

```bash
pnpm test         # Vitest (core + cli)
pnpm coverage     # độ phủ của core
pnpm typecheck
pnpm lint         # gồm rule cấm core dùng API trình duyệt/Node
pnpm format
```
