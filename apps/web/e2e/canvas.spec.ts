import { readFileSync } from 'node:fs';
import {
  canvasEdges,
  canvasNode,
  canvasNodes,
  connect,
  dragBy,
  dropFromPalette,
  editorText,
  errorCount,
  expect,
  FIXTURE,
  setCursor,
  setYaml,
  test,
} from './helpers';

/** Comment trong YAML (bỏ qua `#` trong chuỗi quote) — đủ cho các fixture dùng ở đây. */
const comments = (text: string) =>
  text
    .split('\n')
    .map((line) => /(^|\s)(#.*)$/.exec(line)?.[2])
    .filter((c): c is string => !!c && !/^#\w+['"]/.test(c));

test.describe('Sprint 4 — canvas', () => {
  test('KPI 1: từ mẫu trống, chỉ dùng canvas tạo 4 component + 3 quan hệ → YAML hợp lệ → xuất HTML', async ({
    app: page,
  }) => {
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('template-select').selectOption('blank');
    await expect(canvasNodes(page)).toHaveCount(0);

    await dropFromPalette(page, 'person', 200, 140);
    await expect(canvasNodes(page)).toHaveCount(1);
    await dropFromPalette(page, 'frontend', 200, 320);
    await dropFromPalette(page, 'service', 480, 320);
    await dropFromPalette(page, 'database', 480, 500);
    await expect(canvasNodes(page)).toHaveCount(4);
    // Node xuất hiện tại vị trí thả, không chồng nhau.
    const boxes = await Promise.all(
      ['person', 'frontend', 'service', 'database'].map((id) => canvasNode(page, id).boundingBox()),
    );
    expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height);
    expect(boxes[2]!.x).toBeGreaterThan(boxes[1]!.x + boxes[1]!.width);

    await connect(page, 'person', 'frontend');
    await expect(canvasEdges(page)).toHaveCount(1);
    await connect(page, 'frontend', 'service');
    await connect(page, 'service', 'database');
    await expect(canvasEdges(page)).toHaveCount(3);

    await canvasNode(page, 'service').click();
    const panel = page.getByTestId('property-panel');
    await panel.getByLabel('Tên').fill('Order Service');
    await panel.getByLabel('Tên').press('Enter');
    await panel.getByLabel('Công nghệ').fill('Go');
    await panel.getByLabel('Công nghệ').press('Enter');
    await expect(canvasNode(page, 'service')).toContainText('Order Service');

    const yaml = await editorText(page);
    expect(yaml).toContain(
      '  - id: service\n    name: Order Service\n    type: service\n    technology: Go\n',
    );
    // Giao thức gợi ý theo loại đích.
    expect(yaml).toContain('  - from: service\n    to: database\n    type: sql\n');
    expect(yaml).toContain('  - from: frontend\n    to: service\n    type: http\n');
    expect(yaml).toContain('  - from: person\n    to: frontend\n    type: https\n');
    await expect(errorCount(page)).toHaveText('0 lỗi');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-html').click(),
    ]);
    const html = readFileSync((await download.path())!, 'utf8');
    expect(html).toContain('Order Service');
    expect(html).toContain('class="ac-node');
  });

  test('KPI 3: thao tác trên canvas không làm mất comment trong YAML', async ({ app: page }) => {
    const text = FIXTURE.replace(
      '    technology: Kong',
      '    technology: Kong # API gateway mã nguồn mở',
    )
      .replace('  - id: document-db', '  # DB chính của domain\n  - id: document-db')
      .replace("    include: ['*']", "    include: ['*'] # mọi component");
    await setYaml(page, text);
    await expect(canvasNode(page, 'api-gateway')).toBeVisible();
    const before = comments(text);
    expect(before.length).toBeGreaterThanOrEqual(5);

    await dropFromPalette(page, 'cache', 120, 420);
    await expect(canvasNodes(page)).toHaveCount(10);
    await connect(page, 'search-service', 'cache');
    await canvasNode(page, 'api-gateway').click();
    await page.getByTestId('property-panel').getByLabel('Owner').fill('team-edge');
    await page.getByTestId('property-panel').getByLabel('Owner').press('Enter');
    await expect.poll(() => editorText(page)).toContain('owner: team-edge');
    await dragBy(page, canvasNode(page, 'web-app'), 0, 60);

    const after = await editorText(page);
    expect(comments(after)).toEqual(expect.arrayContaining(before));
    expect(after).toContain('technology: Kong # API gateway mã nguồn mở');
    expect(after).toContain('  # DB chính của domain\n  - id: document-db');
  });

  test('đổi ID qua property panel → mọi tham chiếu cập nhật, 0 lỗi', async ({ app: page }) => {
    await canvasNode(page, 'api-gateway').click();
    const id = page.getByTestId('property-panel').getByLabel('ID');
    await expect(id).toHaveValue('api-gateway');
    await id.fill('edge-gateway');
    await id.press('Enter');
    await expect(canvasNode(page, 'edge-gateway')).toBeVisible();
    const yaml = await editorText(page);
    expect(yaml).not.toContain('api-gateway');
    expect(yaml).toContain("include: ['group:core', edge-gateway]");
    expect(yaml.match(/from: edge-gateway/g)).toHaveLength(3);
    await expect(errorCount(page)).toHaveText('0 lỗi');
  });

  test('YAML lỗi cú pháp → canvas chỉ đọc, giữ bản hợp lệ gần nhất', async ({ app: page }) => {
    await expect(canvasNode(page, 'web-app')).toHaveClass(/draggable/);
    await setYaml(page, `${FIXTURE}\n  - id: [broken`);
    await expect(page.getByText('canvas chỉ đọc')).toBeVisible();
    await expect(canvasNodes(page)).toHaveCount(9);
    await expect(canvasNode(page, 'web-app')).not.toHaveClass(/draggable/);
    await expect(page.locator('.palette-item.disabled')).toHaveCount(10);
    // Sửa lại → canvas sửa được.
    await setYaml(page, FIXTURE);
    await expect(canvasNode(page, 'web-app')).toHaveClass(/draggable/);
  });

  test('chọn hai chiều: con trỏ trong YAML ↔ node trên canvas', async ({ app: page }) => {
    await setCursor(page, 'technology: Java / Spring Boot');
    await expect(canvasNode(page, 'search-service')).toHaveClass(/selected/);
    await expect(page.getByTestId('property-panel').getByLabel('ID')).toHaveValue('search-service');

    await canvasNode(page, 'document-db').click();
    await expect(page.locator('.cm-activeLine')).toContainText('- id: document-db');
    // Focus vẫn ở canvas để phím Delete/Ctrl+Z dùng được.
    await expect(page.locator('.cm-focused')).toHaveCount(0);
  });

  test('xóa bằng phím Delete: hỏi xác nhận khi còn được tham chiếu trong views', async ({
    app: page,
  }) => {
    await canvasNode(page, 'api-gateway').click();
    let message = '';
    page.once('dialog', (d) => {
      message = d.message();
      void d.dismiss();
    });
    await page.keyboard.press('Delete');
    await expect.poll(() => message).toContain('View "core-domain"');
    await expect(canvasNodes(page)).toHaveCount(9);

    page.once('dialog', (d) => d.accept());
    await page.keyboard.press('Delete');
    await expect(canvasNodes(page)).toHaveCount(8);
    const yaml = await editorText(page);
    expect(yaml).not.toContain('- id: api-gateway');
    expect(yaml).not.toContain('from: api-gateway');

    // Quan hệ: không có tham chiếu → xóa ngay.
    await page
      .locator(
        '.react-flow__edge[data-id="e:document-service->document-db"] .react-flow__edge-interaction',
      )
      .click({ force: true });
    await page.keyboard.press('Delete');
    await expect.poll(() => editorText(page)).not.toContain('to: document-db');
  });

  test('kéo node vào/ra group → field group trong YAML đổi theo', async ({ app: page }) => {
    // document-events nằm ngoài group; kéo vào giữa group "core".
    const core = (await page.locator('.react-flow__node-group[data-id="g:core"]').boundingBox())!;
    const node = (await canvasNode(page, 'document-events').boundingBox())!;
    await dragBy(
      page,
      canvasNode(page, 'document-events'),
      core.x + 40 - node.x,
      core.y + core.height - 30 - node.y - node.height / 2,
    );
    await expect
      .poll(() => editorText(page))
      .toContain(
        '  - id: document-events\n    name: Document Events\n    type: queue\n    group: core\n',
      );
    // Kéo ra ngoài → bỏ field group.
    const coreAfter = (await page
      .locator('.react-flow__node-group[data-id="g:core"]')
      .boundingBox())!;
    const n = (await canvasNode(page, 'document-events').boundingBox())!;
    await dragBy(
      page,
      canvasNode(page, 'document-events'),
      0,
      coreAfter.y + coreAfter.height + 80 - n.y,
    );
    await expect.poll(() => editorText(page)).not.toContain('type: queue\n    group: core');
  });
});

test('node trên canvas dùng chung shape, màu, chữ với SVG xuất ra (S4-CANVAS-02)', async ({
  app: page,
}) => {
  // Cấu trúc node: thẻ, class, nội dung chữ (tọa độ khác nhau: canvas vẽ node tại gốc 0,0).
  const shape = (el: Element) =>
    [...el.querySelectorAll('*')]
      .filter((n) => n.tagName !== 'title')
      .map(
        (n) =>
          `${n.tagName}.${n.getAttribute('class') ?? ''}:${n.tagName === 'text' ? n.textContent : ''}`,
      );
  const ids = [
    'end-user',
    'web-app',
    'api-gateway',
    'document-db',
    'object-storage',
    'document-events',
    'identity-provider',
  ];
  const onCanvas: Record<string, { cls: string; parts: string[] }> = {};
  for (const id of ids) {
    onCanvas[id] = await page
      .locator(`.react-flow__node-component[data-id="c:${id}"] g.ac-node`)
      .evaluate((el, fn) => {
        const parts = new Function(`return ${fn}`)()(el) as string[];
        return { cls: el.getAttribute('class')!, parts };
      }, shape.toString());
  }
  await page.getByTestId('mode-preview').click();
  for (const id of ids) {
    const exported = await page
      .locator(`[data-testid=preview] svg .ac-node[data-id="${id}"]`)
      .evaluate((el, fn) => {
        const parts = new Function(`return ${fn}`)()(el) as string[];
        return { cls: el.getAttribute('class')!, parts };
      }, shape.toString());
    expect(onCanvas[id]).toEqual(exported);
  }
});
