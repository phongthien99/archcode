import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { editorText, errorCount, expect, FIXTURE, ROOT, setYaml, test } from './helpers';

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

test('bấm nút mở/đóng: đổi số node, không sửa YAML, node vừa bấm đứng yên', async ({
  app: page,
}) => {
  await setYaml(page, MINDMAP);
  await expect(mindNodes(page)).toHaveCount(15);
  const before = await editorText(page);
  const tech = page.locator('.react-flow__node[data-id="tech"]');
  const pos = async () => {
    const b = (await tech.boundingBox())!;
    return [Math.round(b.x), Math.round(b.y)];
  };
  const start = await pos();

  // Thu gọn "Kỹ thuật": ẩn 3 con hiển thị.
  await tech.getByTestId('mind-toggle').click();
  await expect(mindNodes(page)).toHaveCount(12);
  await expect(tech.getByTestId('mind-toggle')).toHaveText('3');
  await expect.poll(pos).toEqual(start);

  // Mở lại.
  await tech.getByTestId('mind-toggle').click();
  await expect(mindNodes(page)).toHaveCount(15);
  await expect.poll(pos).toEqual(start);
  expect(await editorText(page)).toBe(before);
});

test('Mở hết / Thu hết / Mở tới tầng', async ({ app: page }) => {
  await setYaml(page, MINDMAP);
  await page.getByTestId('mind-expand-all').click();
  await expect(mindNodes(page)).toHaveCount(17);
  await page.getByTestId('mind-collapse-all').click();
  await expect(mindNodes(page)).toHaveCount(5);
  await page.getByTestId('mind-depth').selectOption('2');
  await expect(mindNodes(page)).toHaveCount(15);
});

const node = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`[data-testid=preview] .ac-mm-node[data-id="${id}"]`);
const selectedNode = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid=preview] .ac-mm-node.ac-selected');

test('template notebook: mọi node dạng khối, mở sẵn tới expandDepth', async ({ app: page }) => {
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('template-select').selectOption('mindmap-notebook');
  // expandDepth: 2 → gốc + 3 nhánh chính + 10 nhánh tầng 2.
  await expect(mindNodes(page)).toHaveCount(14);
  await expect(errorCount(page)).toHaveText('0 lỗi');
  await expect(page.locator('[data-testid=preview] .ac-mm-boxed')).toHaveCount(10);
});

test('bàn phím: mũi tên di chuyển, Space mở/đóng, Enter tới YAML', async ({ app: page }) => {
  await setYaml(page, MINDMAP);
  await expect(mindNodes(page)).toHaveCount(15);
  await node(page, 'launch').click();
  await page.keyboard.press('ArrowRight');
  await expect(selectedNode(page)).toHaveAttribute('data-id', 'marketing');
  await page.keyboard.press('ArrowDown');
  await expect(selectedNode(page)).toHaveAttribute('data-id', 'tech');
  await page.keyboard.press('ArrowRight');
  await expect(selectedNode(page)).toHaveAttribute('data-id', 'load-test');
  await page.keyboard.press('ArrowLeft');
  await expect(selectedNode(page)).toHaveAttribute('data-id', 'tech');
  await page.keyboard.press(' ');
  await expect(mindNodes(page)).toHaveCount(12);
  await page.keyboard.press('ArrowRight');
  await expect(mindNodes(page)).toHaveCount(15);
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-activeLine')).toContainText('- id: tech');
});

test('tìm kiếm: node trong nhánh đang đóng → mở nhánh, chọn node', async ({ app: page }) => {
  await setYaml(page, MINDMAP);
  await expect(mindNodes(page)).toHaveCount(15);
  await page.getByRole('button', { name: 'Tìm' }).click();
  await page.getByTestId('search-input').fill('search v2');
  await expect(page.locator('.search li').first()).toContainText('Kỹ thuật › Feature flag');
  await page.keyboard.press('Enter');
  await expect(mindNodes(page)).toHaveCount(17);
  await expect(selectedNode(page)).toContainText('Search v2');
  await expect(page.locator('.cm-activeLine')).toContainText('Search v2');
});

test('trạng thái mở/đóng còn nguyên sau khi tải lại trang', async ({ app: page }) => {
  await setYaml(page, MINDMAP);
  await expect(mindNodes(page)).toHaveCount(15);
  await page.locator('.react-flow__node[data-id="tech"]').getByTestId('mind-toggle').click();
  await expect(mindNodes(page)).toHaveCount(12);
  await page.waitForTimeout(900); // autosave nội dung 500ms, trạng thái mở/đóng 300ms
  await page.reload();
  await expect(mindNodes(page)).toHaveCount(12);
});

test('xuất SVG theo các nhánh đang mở', async ({ app: page }) => {
  await setYaml(page, MINDMAP);
  await page.locator('.react-flow__node[data-id="tech"]').getByTestId('mind-toggle').click();
  await expect(mindNodes(page)).toHaveCount(12);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'SVG', exact: true }).click(),
  ]);
  const svg = readFileSync((await download.path())!, 'utf8');
  expect(svg).toContain('Kỹ thuật');
  expect(svg).not.toContain('Load test');
  expect(svg.match(/class="ac-mm-node /g)).toHaveLength(12);
});

test('autocomplete trong file mind map', async ({ app: page }) => {
  await setYaml(page, 'version: 1\nkind: mindmap\nroot: R\nstyle: no');
  await page.waitForTimeout(400); // đợi phân tích nhận ra kind: mindmap
  await page.locator('.cm-content').press('ControlOrMeta+End');
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('notebook');
});
