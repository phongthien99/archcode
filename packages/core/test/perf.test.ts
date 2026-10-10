import { describe, expect, it } from 'vitest';
import { layoutView, resolveView, validate } from '../src';

/**
 * S3-QA-02: model 200 component / 400 quan hệ "thực tế" (cục bộ theo domain, chủ yếu một chiều).
 * Ngân sách sau spike ELK (docs/spikes/elk.md): validate < 50ms, layout ≤ 1s.
 * Ngưỡng trong test nới gấp 3 để không chập chờn trên máy CI chậm; thời gian thật được in ra.
 */
function realisticModel(components: number, relationships: number): string {
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lines = ['version: 1', 'system: { id: perf, name: Perf }', 'groups:'];
  for (let g = 0; g < 10; g++) lines.push(`  - { id: domain-${g}, name: Domain ${g} }`);
  lines.push('components:');
  const types = ['service', 'service', 'service', 'database', 'queue', 'cache'];
  for (let i = 0; i < components; i++) {
    lines.push(
      `  - { id: c${i}, name: Component ${i}, type: ${types[i % types.length]}, group: domain-${Math.floor(i / 20)}, technology: Go }`,
    );
  }
  lines.push('relationships:');
  const seen = new Set<string>();
  while (seen.size < relationships) {
    const from = Math.floor(rnd() * (components - 1));
    const to = Math.min(components - 1, from + 1 + Math.floor(rnd() * 25));
    const key = `${from}-${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`  - { from: c${from}, to: c${to}, type: http }`);
  }
  lines.push(
    'rules: [{ id: no-cycles, type: no-circular }, { id: no-orphans, type: no-orphan, severity: warning }]',
  );
  return lines.join('\n');
}

describe('hiệu năng', () => {
  const text = realisticModel(200, 400);

  it('validate 200 component / 400 quan hệ', () => {
    validate(text); // warm-up (biên dịch schema Ajv)
    const start = performance.now();
    const { model, diagnostics } = validate(text);
    const ms = performance.now() - start;
    console.log(`validate: ${ms.toFixed(0)} ms`);
    expect(model!.components).toHaveLength(200);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(ms).toBeLessThan(150);
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
