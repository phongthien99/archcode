import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test as base, type Locator, type Page } from '@playwright/test';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const FIXTURE = readFileSync(join(ROOT, 'fixtures/document-platform.yaml'), 'utf8');

/**
 * Test có kiểm tra ràng buộc C-03: ứng dụng không được gọi bất kỳ máy chủ nào ngoài nơi phục vụ file tĩnh.
 * Mỗi test bắt đầu với IndexedDB trống (template mẫu mặc định).
 */
export const test = base.extend<{ app: Page }>({
  app: async ({ page, baseURL }, use) => {
    const offOrigin: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith(baseURL!) && !/^(data|blob):/.test(url)) offOrigin.push(url);
    });
    await page.goto('/');
    await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
    await page.reload();
    await expect(canvasNodes(page)).toHaveCount(9);
    await use(page);
    expect(offOrigin, 'request ra ngoài origin').toEqual([]);
  },
});
export { expect };

export const canvasNodes = (page: Page) => page.locator('.react-flow__node-component');
export const canvasNode = (page: Page, id: string) =>
  page.locator(`.react-flow__node-component[data-id="c:${id}"]`);
export const canvasEdges = (page: Page) => page.locator('.react-flow__edge');
export const previewNodes = (page: Page) => page.locator('[data-testid=preview] svg .ac-node');
export const errorCount = (page: Page) => page.getByTestId('error-count');

/** Nội dung editor (đọc từ CodeMirror — chính xác từng byte, kể cả phần chưa hiển thị). */
export async function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid=yaml-editor]') as HTMLElement & {
      editorView: { state: { doc: { toString(): string } } };
    };
    return el.editorView.state.doc.toString();
  });
}

/** Thay toàn bộ nội dung editor (insertText không kích hoạt auto-indent của CodeMirror). */
export async function setYaml(page: Page, text: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
}

/** Kéo node trên canvas một đoạn (dx, dy) theo pixel màn hình. */
export async function dragBy(page: Page, target: Locator, dx: number, dy: number, steps = 8) {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
  await page.mouse.up();
}

/** Kéo một loại component từ palette và thả tại (x, y) — tọa độ tương đối với khung canvas. */
export async function dropFromPalette(page: Page, type: string, x: number, y: number) {
  await page
    .locator(`.palette-item[data-type="${type}"]`)
    .dragTo(page.locator('.react-flow__pane'), { targetPosition: { x, y } });
}

/** Nối hai node: kéo từ handle bên phải của `from` thả lên thân `to`. */
export async function connect(page: Page, from: string, to: string) {
  const source = canvasNode(page, from);
  await source.hover();
  const handle = (await source
    .locator('.react-flow__handle.h-connect[data-handleid="right"]')
    .boundingBox())!;
  const target = (await canvasNode(page, to).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height / 2;
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(
      handle.x + ((tx - handle.x) * i) / 10,
      handle.y + ((ty - handle.y) * i) / 10,
    );
  }
  await page.mouse.up();
}

/** Đặt con trỏ editor ngay sau đoạn `text` (như người dùng click vào dòng đó). */
export async function setCursor(page: Page, text: string) {
  await page.evaluate((needle) => {
    const el = document.querySelector('[data-testid=yaml-editor]') as HTMLElement & {
      editorView: {
        state: { doc: { toString(): string } };
        focus(): void;
        dispatch(spec: { selection: { anchor: number }; scrollIntoView: boolean }): void;
      };
    };
    const view = el.editorView;
    const pos = view.state.doc.toString().indexOf(needle);
    if (pos === -1) throw new Error(`Không thấy "${needle}" trong editor`);
    view.focus();
    view.dispatch({ selection: { anchor: pos + needle.length }, scrollIntoView: true });
  }, text);
}

/** Vị trí node trong hệ tọa độ của diagram (không phụ thuộc zoom/pan). */
export async function flowPos(page: Page, id: string) {
  const transform = await canvasNode(page, id).evaluate(
    (el) => (el as HTMLElement).style.transform,
  );
  const m = /translate\((-?[\d.]+)px, ?(-?[\d.]+)px\)/.exec(transform)!;
  return { x: Number(m[1]), y: Number(m[2]) };
}
