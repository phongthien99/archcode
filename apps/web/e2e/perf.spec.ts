import { realisticModel } from '../../../packages/core/test/perf-model';
import { canvasEdges, canvasNode, canvasNodes, dragBy, expect, setYaml, test } from './helpers';

// Chạy riêng sau các test khác (project "perf" trong playwright.config.ts) để số đo không bị nhiễu.
test('hiệu năng: 200 node, kéo giữ ≥ 30 fps (KPI 8)', async ({ app: page }) => {
  test.setTimeout(90_000);
  await setYaml(page, realisticModel(200, 400));
  await expect(canvasNodes(page)).toHaveCount(200, { timeout: 30_000 });
  await expect(canvasEdges(page)).toHaveCount(400);
  const node = canvasNode(page, 'c100');
  await node.scrollIntoViewIfNeeded();
  // Đếm khung hình bằng requestAnimationFrame trong lúc kéo.
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__frames = [];
    w.__stop = false;
    const tick = (t: number) => {
      w.__frames.push(t);
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const start = Date.now();
  await dragBy(page, node, 300, 200, 60);
  const elapsed = Date.now() - start;
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__stop = true;
    return w.__frames;
  });
  const span = (frames[frames.length - 1]! - frames[0]!) / 1000;
  const fps = (frames.length - 1) / span;
  // Khoảng nghỉ dài nhất giữa hai khung hình (giật).
  const worst = Math.max(...frames.slice(1).map((t, i) => t - frames[i]!));
  console.log(
    `drag 200 node: ${fps.toFixed(0)} fps, khung chậm nhất ${worst.toFixed(0)} ms, ${elapsed} ms`,
  );
  expect(fps).toBeGreaterThanOrEqual(30);
});
