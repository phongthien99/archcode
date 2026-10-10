/** Model 200 component / 400 quan hệ "thực tế": cục bộ theo domain, chủ yếu một chiều. */
export function realisticModel(components: number, relationships: number): string {
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
