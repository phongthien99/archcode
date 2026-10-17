import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { errorCount, expect, FIXTURE, ROOT, setYaml, test } from './helpers';

const MINDMAP = readFileSync(join(ROOT, 'fixtures/mindmap-launch.yaml'), 'utf8');
const mindNodes = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid=preview] svg .ac-mm-node');

test('file `kind: mindmap` → validate mind map, chỉ có Xem trước', async ({ app: page }) => {
  await setYaml(page, MINDMAP);
  // 17 node, "Feature flag" thu gọn ẩn 2 con → 15 node hiển thị.
  await expect(mindNodes(page)).toHaveCount(15);
  await expect(errorCount(page)).toHaveText('0 lỗi');
  await expect(page.getByTestId('mode-canvas')).toBeDisabled();
  await expect(page.getByTestId('export-html')).toBeDisabled();
  await expect(page.getByTestId('view-select')).toHaveCount(0);
});

test('lỗi mind map hiện trong panel và tô node', async ({ app: page }) => {
  await setYaml(page, MINDMAP.replace('color: violet', 'color: purple'));
  await expect(errorCount(page)).toHaveText('1 lỗi');
  await expect(page.locator('.diagnostics li')).toContainText('Giá trị hợp lệ');
  await expect(
    page.locator('[data-testid=preview] svg .ac-mm-node.ac-error[data-id="tech"]'),
  ).toHaveCount(1);
});

test('click node → nhảy tới YAML và đánh dấu node', async ({ app: page }) => {
  await setYaml(page, MINDMAP);
  const node = page.locator('[data-testid=preview] svg .ac-mm-node[data-id="migration"]');
  await node.click();
  await expect(page.locator('.cm-activeLine')).toContainText('- id: migration');
  await expect(node).toHaveClass(/ac-selected/);
});

test('chuyển lại file kiến trúc → Canvas dùng được như cũ', async ({ app: page }) => {
  await setYaml(page, MINDMAP);
  await expect(mindNodes(page)).toHaveCount(15);
  await setYaml(page, FIXTURE);
  await expect(page.getByTestId('mode-canvas')).toBeEnabled();
  await expect(page.locator('.react-flow__node-component')).toHaveCount(9);
});
