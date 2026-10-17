import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { errorCount, expect, FIXTURE, previewNodes, ROOT, setYaml, test as base } from './helpers';

/** Các luồng của Sprint 3 chạy ở chế độ Xem trước (SVG giống hệt bản xuất). */
const test = base.extend<{ preview: Page }>({
  preview: async ({ app }, use) => {
    await app.getByTestId('mode-preview').click();
    await expect(previewNodes(app)).toHaveCount(9);
    await use(app);
  },
});
const nodes = previewNodes;

test('mở lần đầu: template mẫu, diagram 9 component, không lỗi', async ({ preview: page }) => {
  await expect(errorCount(page)).toHaveText('0 lỗi');
  await expect(page.getByTestId('view-select').locator('option')).toHaveText([
    'Tổng quan hệ thống',
    'Core Domain',
  ]);
});

test('sửa YAML → diagram và lỗi cập nhật; sửa lại → hết lỗi', async ({ preview: page }) => {
  await setYaml(page, FIXTURE.replace('to: document-db', 'to: documnet-db'));
  await expect(errorCount(page)).toHaveText('1 lỗi');
  // document-db mất quan hệ duy nhất nên còn có thêm cảnh báo orphan — chọn đúng mục lỗi.
  const item = page.locator('.diagnostics li', { hasText: 'documnet-db' });
  await expect(item).toContainText('Component "documnet-db" không tồn tại');
  await expect(item).toContainText('Có phải ý bạn là "document-db"?');
  // Lỗi cũng hiện ngay trong editor.
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(1);

  await setYaml(page, FIXTURE.replace('name: Search Service', 'name: Tìm kiếm'));
  await expect(errorCount(page)).toHaveText('0 lỗi');
  await expect(page.locator('[data-testid=preview] svg')).toContainText('Tìm kiếm');
});

test('click diagnostic → nhảy tới đúng dòng trong editor', async ({ preview: page }) => {
  await setYaml(page, FIXTURE.replace('to: document-db', 'to: documnet-db'));
  await page.locator('.diagnostics li button', { hasText: 'documnet-db' }).click();
  await expect(page.locator('.cm-activeLine')).toContainText('to: documnet-db');
});

test('click node trên diagram → nhảy tới định nghĩa trong YAML và đánh dấu node', async ({
  preview: page,
}) => {
  const node = page.locator('[data-testid=preview] svg .ac-node[data-id="search-service"]');
  await node.click();
  await expect(page.locator('.cm-activeLine')).toContainText('- id: search-service');
  await expect(node).toHaveClass(/ac-selected/);
});

test('YAML lỗi cú pháp → giữ diagram hợp lệ gần nhất', async ({ preview: page }) => {
  await setYaml(page, `${FIXTURE}\n  - id: [broken`);
  await expect(page.getByText('đang hiển thị bản hợp lệ gần nhất')).toBeVisible();
  await expect(nodes(page)).toHaveCount(9);
  await expect(errorCount(page)).not.toHaveText('0 lỗi');
});

test('đổi view → diagram chỉ còn component của view', async ({ preview: page }) => {
  await page.getByTestId('view-select').selectOption('core-domain');
  await expect(nodes(page)).toHaveCount(4);
});

test('template e-commerce: 2 view, không lỗi', async ({ preview: page }) => {
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('template-select').selectOption('ecommerce');
  await expect(nodes(page)).toHaveCount(13);
  await expect(errorCount(page)).toHaveText('0 lỗi');
});

test('xuất HTML giống hệt output của CLI với cùng YAML', async ({ preview: page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-html').click(),
  ]);
  expect(download.suggestedFilename()).toBe('document-platform.html');
  const html = readFileSync((await download.path())!, 'utf8');

  const out = join(mkdtempSync(join(tmpdir(), 'archcode-e2e-')), 'cli.html');
  execFileSync(
    'npx',
    ['tsx', '../packages/cli/src/index.ts', 'build', 'document-platform.yaml', '-o', out],
    {
      cwd: join(ROOT, 'fixtures'),
    },
  );
  expect(html).toBe(readFileSync(out, 'utf8'));
});

test('mở lại file HTML đã xuất → nạp YAML nhúng (nhận diện theo nội dung, kể cả khi mất đuôi .html)', async ({
  preview: page,
}) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-html').click(),
  ]);
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('template-select').selectOption('event-driven');
  await expect(nodes(page)).toHaveCount(10);

  await page.getByTestId('file-input').setInputFiles((await download.path())!);
  await expect(nodes(page)).toHaveCount(9);
  await expect(page.locator('.file-name')).toHaveText('document-platform.yaml');
});

test('mở file YAML từ máy', async ({ preview: page }) => {
  const file = join(mkdtempSync(join(tmpdir(), 'archcode-e2e-')), 'mini.yaml');
  writeFileSync(
    file,
    'version: 1\nsystem: { id: mini, name: Mini }\ncomponents:\n  - { id: a, type: service }\n  - { id: b, type: database }\nrelationships:\n  - { from: a, to: b }\n',
  );
  await page.getByTestId('file-input').setInputFiles(file);
  await expect(nodes(page)).toHaveCount(2);
  await expect(page.locator('.file-name')).toHaveText('mini.yaml');
});

test('xuất PNG và SVG', async ({ preview: page }) => {
  const [png] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PNG' }).click(),
  ]);
  expect(png.suggestedFilename()).toBe('document-platform.overview.png');
  expect(
    readFileSync((await png.path())!)
      .subarray(1, 4)
      .toString(),
  ).toBe('PNG');

  const [svg] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'SVG' }).click(),
  ]);
  expect(readFileSync((await svg.path())!, 'utf8')).toMatch(
    /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/,
  );
});

test('tự lưu: tải lại trang vẫn giữ nội dung đang sửa', async ({ preview: page }) => {
  await setYaml(page, FIXTURE.replace('name: Document Platform', 'name: Bản nháp của tôi'));
  await page.waitForTimeout(800); // autosave debounce 500ms
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('name: Bản nháp của tôi');
});

test('autocomplete: gợi ý component type', async ({ preview: page }) => {
  await setYaml(
    page,
    'version: 1\nsystem: { id: s, name: S }\ncomponents:\n  - id: a\n    type: data',
  );
  await page.locator('.cm-content').press('ControlOrMeta+End');
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('database');
});

test('đổi theme', async ({ preview: page }) => {
  await page.getByRole('button', { name: 'Giao diện' }).click();
  await page.getByRole('radio', { name: 'Tối' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('đổi màu nhấn và bảng màu diagram', async ({ preview: page }) => {
  await page.getByRole('button', { name: 'Giao diện' }).click();
  await page.getByRole('radio', { name: 'Tím' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');
  await page.getByRole('radio', { name: 'C4 (Structurizr)' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-diagram', 'c4');
  const fill = await page
    .locator('.ac-t-service > .ac-shape')
    .first()
    .evaluate((el) => getComputedStyle(el).fill);
  expect(fill).toBe('rgb(52, 120, 193)'); // container C4 #3478c1
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Giao diện' })).toBeHidden();
});
