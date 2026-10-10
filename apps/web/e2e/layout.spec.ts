import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canvasNode,
  canvasNodes,
  dragBy,
  editorText,
  errorCount,
  expect,
  FIXTURE,
  flowPos,
  ROOT,
  setCursor,
  test,
} from './helpers';

test.describe('Sprint 5 — file layout', () => {
  test('kéo node: YAML không đổi byte nào, vị trí vào layout; tải lại trang giữ vị trí', async ({
    app: page,
  }) => {
    const before = await editorText(page);
    const start = await flowPos(page, 'web-app');
    await dragBy(page, canvasNode(page, 'web-app'), 0, 120);
    await expect(page.getByText('Bố cục thủ công (9 node đã ghim)')).toBeVisible();
    const moved = await flowPos(page, 'web-app');
    expect(moved.y).toBeGreaterThan(start.y + 40);
    expect(await editorText(page)).toBe(before);
    await expect(page.locator('[data-testid=save] .dirty')).toBeVisible();

    await page.waitForTimeout(800); // autosave debounce 500ms
    await page.reload();
    await expect(canvasNodes(page)).toHaveCount(9);
    expect(await flowPos(page, 'web-app')).toEqual(moved);
    expect(await editorText(page)).toBe(before);

    // Sắp xếp lại: bỏ ghim → về bố cục tự động.
    await page.getByTestId('relayout').click();
    await expect(page.getByText('Bố cục tự động')).toBeVisible();
    await expect.poll(() => flowPos(page, 'web-app')).toEqual(start);
  });

  test('xuất HTML có layout giống hệt CLI với cùng YAML + file layout', async ({ app: page }) => {
    await dragBy(page, canvasNode(page, 'document-events'), -150, 140);
    await expect(page.getByText(/Bố cục thủ công/)).toBeVisible();

    // "Lưu" (không mở từ thư mục) tải về YAML và file layout.
    const downloads: string[] = [];
    page.on('download', async (d) => downloads.push(`${d.suggestedFilename()}|${await d.path()}`));
    await page.getByTestId('save').click();
    await expect.poll(() => downloads.length).toBe(2);
    const files = Object.fromEntries(downloads.map((d) => d.split('|') as [string, string]));
    expect(Object.keys(files).sort()).toEqual([
      'document-platform.layout.yaml',
      'document-platform.yaml',
    ]);
    const layout = readFileSync(files['document-platform.layout.yaml']!, 'utf8');
    expect(layout).toMatch(
      /^version: 1\nviews:\n {2}overview:\n {4}nodes:\n {6}api-gateway: \{ x: -?\d+, y: -?\d+ \}\n/,
    );
    await expect(page.locator('[data-testid=save] .dirty')).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-html').click(),
    ]);
    const html = readFileSync((await download.path())!, 'utf8');

    const dir = mkdtempSync(join(tmpdir(), 'archcode-e2e-'));
    writeFileSync(
      join(dir, 'document-platform.yaml'),
      readFileSync(files['document-platform.yaml']!),
    );
    writeFileSync(join(dir, 'document-platform.layout.yaml'), layout);
    execFileSync(
      'npx',
      [
        'tsx',
        join(ROOT, 'packages/cli/src/index.ts'),
        'build',
        'document-platform.yaml',
        '-o',
        'cli.html',
      ],
      {
        cwd: dir,
      },
    );
    expect(html).toBe(readFileSync(join(dir, 'cli.html'), 'utf8'));
    expect(html).toContain('"layout":{"name":"document-platform.layout.yaml"');
  });

  test('mở lại HTML đã xuất → khôi phục cả bố cục', async ({ app: page }) => {
    await dragBy(page, canvasNode(page, 'end-user'), 0, -100);
    const pos = await flowPos(page, 'end-user');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-html').click(),
    ]);
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('template-select').selectOption('event-driven');
    await expect(canvasNodes(page)).toHaveCount(10);
    await page.getByTestId('file-input').setInputFiles((await download.path())!);
    await expect(canvasNodes(page)).toHaveCount(9);
    expect(await flowPos(page, 'end-user')).toEqual(pos);
  });
});

test.describe('Sprint 5 — undo/redo', () => {
  test('chuỗi thao tác xen kẽ canvas và YAML; Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y', async ({
    app: page,
  }) => {
    const original = await editorText(page);
    const start = await flowPos(page, 'web-app');

    // 1. Kéo node (chỉ đổi layout).
    await dragBy(page, canvasNode(page, 'web-app'), 0, 120);
    const moved = await flowPos(page, 'web-app');
    // 2. Đổi tên qua property panel (đổi YAML).
    await canvasNode(page, 'search-service').click();
    const id = page.getByTestId('property-panel').getByLabel('ID');
    await id.fill('search');
    await id.press('Enter');
    await expect(canvasNode(page, 'search')).toBeVisible();
    // 3. Gõ YAML: cả cụm gõ liên tục là một mục lịch sử.
    await setCursor(page, 'name: Document Platform');
    await page.keyboard.type(' v2', { delay: 30 });
    await expect.poll(() => editorText(page)).toContain('name: Document Platform v2');
    await page.waitForTimeout(600);

    // Undo từng bước, ngược thứ tự.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => editorText(page)).not.toContain('Document Platform v2');
    expect(await editorText(page)).toContain('- id: search\n');
    // Con trỏ về chỗ vừa hoàn tác.
    await expect(page.locator('.cm-activeLine')).toContainText('name: Document Platform');

    await canvasNode(page, 'search').click(); // undo từ canvas cũng được
    await page.keyboard.press('ControlOrMeta+z');
    await expect(canvasNode(page, 'search-service')).toBeVisible();
    expect(await editorText(page)).toBe(original);

    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => flowPos(page, 'web-app')).toEqual(start);
    expect(await editorText(page)).toBe(original);

    // Redo: Ctrl+Shift+Z và Ctrl+Y.
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => flowPos(page, 'web-app')).toEqual(moved);
    await page.keyboard.press('ControlOrMeta+y');
    await expect(canvasNode(page, 'search')).toBeVisible();
    await page.getByRole('button', { name: 'Làm lại' }).click();
    await expect.poll(() => editorText(page)).toContain('name: Document Platform v2');
    await expect(page.getByRole('button', { name: 'Làm lại' })).toBeDisabled();
    await expect(errorCount(page)).toHaveText('0 lỗi');
  });

  test('thao tác mới sau khi undo xóa nhánh redo', async ({ app: page }) => {
    await dragBy(page, canvasNode(page, 'web-app'), 0, 100);
    await page.getByRole('button', { name: 'Hoàn tác' }).click();
    await expect(page.getByRole('button', { name: 'Làm lại' })).toBeEnabled();
    await dragBy(page, canvasNode(page, 'end-user'), 0, -80);
    await expect(page.getByRole('button', { name: 'Làm lại' })).toBeDisabled();
    expect(await editorText(page)).toBe(FIXTURE);
  });
});

test.describe('Sprint 5 — tìm kiếm', () => {
  test('Ctrl+K → chọn kết quả → chọn node, căn giữa, nhảy tới YAML', async ({ app: page }) => {
    await page.locator('.react-flow__pane').click();
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByTestId('search-input').fill('spring');
    await expect(page.locator('.search li')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.locator('.search')).toHaveCount(0);
    await expect(canvasNode(page, 'search-service')).toHaveClass(/selected/);
    await expect(page.locator('.cm-activeLine')).toContainText('- id: search-service');
    // Node được đưa vào giữa khung canvas.
    const canvas = (await page.getByTestId('canvas').boundingBox())!;
    await expect
      .poll(async () => {
        const box = (await canvasNode(page, 'search-service').boundingBox())!;
        return Math.abs(box.x + box.width / 2 - (canvas.x + canvas.width / 2)) < 40;
      })
      .toBe(true);
  });

  test('node không có trong view hiện tại → chuyển sang view chứa nó; tìm theo owner, không dấu', async ({
    app: page,
  }) => {
    await page.getByTestId('view-select').selectOption('core-domain');
    await expect(canvasNodes(page)).toHaveCount(4);
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByTestId('search-input').fill('nguoi dung');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('view-select')).toHaveValue('overview');
    await expect(canvasNode(page, 'end-user')).toHaveClass(/selected/);

    await page.keyboard.press('ControlOrMeta+k');
    await page.getByTestId('search-input').fill('team-docs');
    await expect(page.locator('.search li.active')).toContainText('Document Service');
    await page.keyboard.press('Escape');
    await expect(page.locator('.search')).toHaveCount(0);
  });
});
