import type { Page } from '@playwright/test';
import {
  canvasNode,
  canvasNodes,
  dragBy,
  editorText,
  expect,
  FIXTURE,
  flowPos,
  setCursor,
  test,
} from './helpers';

/**
 * S5-QA-02: File System Access trên Chromium. Hộp chọn thư mục của hệ điều hành không điều khiển
 * được từ Playwright, nên `showDirectoryPicker` trả về một thư mục tạm trong Origin Private File
 * System — cùng kiểu FileSystemDirectoryHandle thật, đọc/ghi/liệt kê như thư mục trên đĩa.
 */
async function writeRepo(page: Page, files: Record<string, string>, reset = false) {
  await page.evaluate(
    async ({ entries, reset }) => {
      const root = await navigator.storage.getDirectory();
      if (reset) await root.removeEntry('repo', { recursive: true }).catch(() => undefined);
      const repo = await root.getDirectoryHandle('repo', { create: true });
      for (const [path, content] of Object.entries(entries)) {
        const parts = path.split('/');
        let dir = repo;
        for (const part of parts.slice(0, -1))
          dir = await dir.getDirectoryHandle(part, { create: true });
        const file = await dir.getFileHandle(parts[parts.length - 1]!, { create: true });
        const w = await file.createWritable();
        await w.write(content);
        await w.close();
      }
    },
    { entries: files, reset },
  );
}

async function readRepo(page: Page, path: string): Promise<string | null> {
  return page.evaluate(async (p) => {
    const root = await navigator.storage.getDirectory();
    let dir = await root.getDirectoryHandle('repo');
    const parts = p.split('/');
    try {
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
      return await (await (await dir.getFileHandle(parts[parts.length - 1]!)).getFile()).text();
    } catch {
      return null;
    }
  }, path);
}

const fsTest = test.extend<{ repo: Page }>({
  repo: async ({ app }, use) => {
    await app.evaluate(() => {
      (
        window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
      ).showDirectoryPicker = async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle('repo');
    });
    await writeRepo(
      app,
      {
        'architecture.yaml': FIXTURE,
        'docs/notes.yaml': 'title: không phải file kiến trúc\n',
        'services/billing.yaml':
          'version: 1\nsystem: { id: billing, name: Billing }\ncomponents:\n  - { id: api, type: service }\n',
        'node_modules/pkg/arch.yaml': 'version: 1\nsystem: { id: x, name: X }\n',
      },
      true,
    );
    await use(app);
  },
});

fsTest.describe('Sprint 5 — thư mục local', () => {
  fsTest(
    'S5-QA-01: kéo node → lưu → mở lại → vị trí giữ nguyên, YAML không đổi byte nào',
    async ({ repo: page }) => {
      await page.getByTestId('open-folder').click();
      await page.getByRole('dialog').getByRole('button', { name: 'architecture.yaml' }).click();
      await dragBy(page, canvasNode(page, 'end-user'), 0, 140);
      const pos = await flowPos(page, 'end-user');
      await page.keyboard.press('ControlOrMeta+s');
      await expect(page.locator('[data-testid=save] .dirty')).toHaveCount(0);
      expect(await readRepo(page, 'architecture.yaml')).toBe(FIXTURE);
      expect(await readRepo(page, 'architecture.layout.yaml')).toContain('      end-user: {');

      // Bỏ bản tự lưu trong trình duyệt để chắc chắn vị trí được đọc lại từ file trên đĩa.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            const req = indexedDB.open('keyval-store');
            req.onsuccess = () => {
              const tx = req.result.transaction('keyval', 'readwrite');
              tx.objectStore('keyval').delete('archcode:document');
              tx.oncomplete = () => resolve();
            };
          }),
      );
      await page.reload();
      await expect(canvasNodes(page)).toHaveCount(9);
      await page.getByLabel('Thư mục gần đây').selectOption({ label: 'repo' });
      await page.getByRole('dialog').getByRole('button', { name: 'architecture.yaml' }).click();
      await expect(page.locator('.file-name')).toHaveText('📁 architecture.yaml');
      await expect.poll(() => flowPos(page, 'end-user')).toEqual(pos);
      expect(await editorText(page)).toBe(FIXTURE);
    },
  );

  fsTest(
    'mở thư mục → chọn file → sửa → Ctrl+S ghi YAML + layout; diff YAML chỉ có phần đổi tên',
    async ({ repo: page }) => {
      await page.getByTestId('open-folder').click();
      const dialog = page.getByRole('dialog', { name: 'Chọn file kiến trúc' });
      await expect(dialog.getByRole('button')).toHaveText([
        'architecture.yaml',
        'services/billing.yaml',
        'Đóng',
      ]);
      await dialog.getByRole('button', { name: 'architecture.yaml' }).click();
      await expect(page.locator('.file-name')).toHaveText('📁 architecture.yaml');

      await dragBy(page, canvasNode(page, 'web-app'), 0, 100);
      await canvasNode(page, 'search-service').click();
      const id = page.getByTestId('property-panel').getByLabel('ID');
      await id.fill('search');
      await id.press('Enter');
      await expect(canvasNode(page, 'search')).toBeVisible();
      await expect(page.locator('[data-testid=save] .dirty')).toBeVisible();

      await page.keyboard.press('ControlOrMeta+s');
      await expect(page.locator('[data-testid=save] .dirty')).toHaveCount(0);
      const yaml = (await readRepo(page, 'architecture.yaml'))!;
      expect(yaml).toBe(await editorText(page));
      // "git diff": chỉ các dòng chứa ID cũ thay đổi.
      const before = FIXTURE.split('\n');
      const after = yaml.split('\n');
      expect(after).toHaveLength(before.length);
      const changed = before.flatMap((line, i) =>
        line === after[i] ? [] : [`${line} → ${after[i]}`],
      );
      expect(changed).toEqual([
        '  - id: search-service →   - id: search',
        '    to: search-service →     to: search',
        '    to: search-service →     to: search',
      ]);
      const layout = (await readRepo(page, 'architecture.layout.yaml'))!;
      expect(layout).toMatch(/^version: 1\nviews:\n {2}overview:\n {4}nodes:\n/);
      expect(layout).toContain('      search: {');
      expect(layout).not.toContain('search-service');
    },
  );

  fsTest(
    'file đổi bên ngoài: chưa sửa → tự nạp lại; đang sửa → hỏi nạp lại hay giữ',
    async ({ repo: page }) => {
      await page.getByTestId('open-folder').click();
      await page.getByRole('dialog').getByRole('button', { name: 'architecture.yaml' }).click();
      await expect(page.locator('.file-name')).toHaveText('📁 architecture.yaml');

      // Không có thay đổi chưa lưu → nạp lại luôn.
      await writeRepo(page, {
        'architecture.yaml': FIXTURE.replace('name: Search Service', 'name: Tìm kiếm (git pull)'),
      });
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect.poll(() => editorText(page)).toContain('name: Tìm kiếm (git pull)');
      await expect(page.getByRole('status').filter({ hasText: 'Đã nạp lại' })).toBeVisible();

      // Có thay đổi chưa lưu → hỏi; chọn giữ bản đang sửa.
      await setCursor(page, 'name: Document Platform');
      await page.keyboard.type(' (đang sửa)');
      await writeRepo(page, {
        'architecture.yaml': FIXTURE.replace('name: Search Service', 'name: Lần 2'),
      });
      let asked = '';
      page.once('dialog', (d) => {
        asked = d.message();
        void d.dismiss();
      });
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect.poll(() => asked).toContain('đã thay đổi bên ngoài');
      expect(await editorText(page)).toContain('Document Platform (đang sửa)');

      // Đổi tiếp bên ngoài → hỏi lại; lần này nạp lại.
      await writeRepo(page, {
        'architecture.yaml': FIXTURE.replace('name: Search Service', 'name: Lần 3'),
      });
      page.once('dialog', (d) => void d.accept());
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect.poll(() => editorText(page)).toContain('name: Lần 3');
      expect(await editorText(page)).not.toContain('(đang sửa)');
    },
  );

  fsTest(
    'mở file có sẵn layout; nhớ thư mục gần đây sau khi tải lại trang',
    async ({ repo: page }) => {
      await writeRepo(page, {
        'architecture.yaml': FIXTURE,
        'architecture.layout.yaml':
          'version: 1\nviews:\n  overview:\n    nodes:\n      end-user: { x: -600, y: -400 }\n',
      });
      await page.getByTestId('open-folder').click();
      await page.getByRole('dialog').getByRole('button', { name: 'architecture.yaml' }).click();
      await expect(page.getByText('Bố cục thủ công (1 node đã ghim)')).toBeVisible();
      const transform = await canvasNode(page, 'end-user').evaluate(
        (el) => (el as HTMLElement).style.transform,
      );
      expect(transform).toContain('translate(-600px, -400px)');

      await page.reload();
      await expect(canvasNodes(page)).toHaveCount(9);
      const recent = page.getByLabel('Thư mục gần đây');
      await expect(recent.locator('option')).toHaveText(['Gần đây…', 'repo']);
      await recent.selectOption({ label: 'repo' });
      await expect(page.getByRole('dialog', { name: 'Chọn file kiến trúc' })).toBeVisible();
    },
  );
});

test('trình duyệt không hỗ trợ thư mục → thông báo rõ, dùng tải lên/tải về', async ({
  app: page,
}) => {
  // Giả lập Firefox/Safari: không có API.
  await page.evaluate(() => {
    delete (Window.prototype as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
  await page.getByTestId('open-folder').click();
  await expect(
    page.getByRole('status').filter({ hasText: 'chưa hỗ trợ mở thư mục' }),
  ).toBeVisible();
});
