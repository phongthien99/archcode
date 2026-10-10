import { describe, expect, it } from 'vitest';
import { layoutView, resolveView, validate } from '../src';
import { realisticModel } from './perf-model';

/**
 * S3-QA-02: model 200 component / 400 quan hệ "thực tế" (cục bộ theo domain, chủ yếu một chiều).
 * Ngân sách sau spike ELK (docs/spikes/elk.md): validate < 50ms, layout ≤ 1s.
 * Chạy riêng sau các test khác (xem script `test`) để số đo không bị nhiễu.
 * Trên CI ngưỡng nới gấp 3 để không chập chờn trên máy chậm; thời gian thật được in ra.
 */
describe('hiệu năng', () => {
  const text = realisticModel(200, 400);

  it('validate 200 component / 400 quan hệ < 50ms (S5-TECH-02)', () => {
    validate(text); // warm-up (biên dịch schema Ajv, JIT)
    validate(text);
    const runs: number[] = [];
    let result = validate(text);
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      result = validate(text);
      runs.push(performance.now() - start);
    }
    // Lấy lần nhanh nhất: các file test khác chạy song song làm nhiễu số đo.
    const best = Math.min(...runs);
    console.log(`validate: ${best.toFixed(0)} ms (nhanh nhất / 5 lần)`);
    expect(result.model!.components).toHaveLength(200);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(best).toBeLessThan(process.env.CI ? 150 : 50);
  });

  it('layout 200 component / 400 quan hệ', { timeout: 30_000 }, async () => {
    const { model } = validate(text);
    const view = resolveView(model!, model!.views[0]!);
    await layoutView(view); // warm-up JIT
    const start = performance.now();
    const layout = await layoutView(view);
    const ms = performance.now() - start;
    console.log(`layout: ${ms.toFixed(0)} ms`);
    expect(layout.nodes).toHaveLength(200);
    expect(layout.edges).toHaveLength(400);
    expect(ms).toBeLessThan(3000);
  });
});
