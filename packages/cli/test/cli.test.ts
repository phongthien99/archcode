import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function run(...args: string[]) {
  const result = spawnSync('npx', ['tsx', 'packages/cli/src/index.ts', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('archcode validate', () => {
  it('file hợp lệ → exit 0', () => {
    const r = run('validate', 'fixtures/document-platform.yaml');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('✔ 1 file hợp lệ');
  });

  it('có lỗi → exit 1, in file:line:col và gợi ý', () => {
    const r = run('validate', 'fixtures/invalid/broken-ref.yaml');
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(
      'fixtures/invalid/broken-ref.yaml:16:9  error    unknown-reference  Component "documnet-db" không tồn tại',
    );
    expect(r.stdout).toContain('↳ Có phải ý bạn là "document-db"?');
  });

  it('chỉ có cảnh báo → exit 0; với --strict → exit 1', () => {
    const file = 'packages/cli/test/fixtures/warning-only.yaml';
    expect(run('validate', file).code).toBe(0);
    expect(run('validate', '--strict', file).code).toBe(1);
  });

  it('--format json parse được', () => {
    const r = run('validate', '--format', 'json', 'fixtures/invalid/duplicate-id.yaml');
    const reports = JSON.parse(r.stdout);
    // 1 cảnh báo: api ↔ db tạo vòng, bị rule mặc định no-circular phát hiện.
    expect(reports[0]).toMatchObject({ valid: false, errorCount: 3, warningCount: 1 });
    expect(reports[0].diagnostics[0]).toMatchObject({ code: 'duplicate-id', line: 9 });
  });

  it('file không tồn tại → exit 2', () => {
    const r = run('validate', 'khong-ton-tai.yaml');
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Không đọc được file');
  });

  it('nhiều file: tổng hợp kết quả', () => {
    const r = run(
      'validate',
      'fixtures/document-platform.yaml',
      'fixtures/invalid/missing-field.yaml',
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('2 lỗi, 0 cảnh báo trong 2 file');
  });
});

describe('archcode build', () => {
  const out = (name: string) => join(tmp, name);
  const tmp = mkdtempSync(join(tmpdir(), 'archcode-'));

  it('sinh HTML tự chứa, nhúng YAML gốc', () => {
    const r = run('build', 'fixtures/document-platform.yaml', '-o', out('doc.html'));
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/✔ Đã ghi .*doc\.html \(\d+\.\d KB\)/);
    const html = readFileSync(out('doc.html'), 'utf8');
    expect(html).toContain('<title>Document Platform — Kiến trúc hệ thống</title>');
    expect(html).toContain('id="archcode-source"');
  });

  it('--no-embed-source không nhúng YAML', () => {
    run('build', 'fixtures/document-platform.yaml', '-o', out('plain.html'), '--no-embed-source');
    expect(readFileSync(out('plain.html'), 'utf8')).not.toContain('id="archcode-source"');
  });

  it('có lỗi → không ghi file, exit 1', () => {
    const r = run('build', 'fixtures/invalid/rule-violations.yaml', '-o', out('bad.html'));
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('Không ghi file vì model có lỗi');
    expect(existsSync(out('bad.html'))).toBe(false);
  });

  it('--force vẫn ghi file nhưng exit 1 để CI fail', () => {
    const r = run(
      'build',
      'fixtures/invalid/rule-violations.yaml',
      '-o',
      out('forced.html'),
      '--force',
    );
    expect(r.code).toBe(1);
    expect(readFileSync(out('forced.html'), 'utf8')).toContain('id="validation"');
  });

  it('--format svg --view xuất SVG độc lập của một view', () => {
    const r = run(
      'build',
      'fixtures/document-platform.yaml',
      '-f',
      'svg',
      '--view',
      'core-domain',
      '-o',
      out('core.svg'),
    );
    expect(r.code).toBe(0);
    const svg = readFileSync(out('core.svg'), 'utf8');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('<title>Core Domain</title>');
  });

  it('view không tồn tại → exit 2, liệt kê view hiện có', () => {
    const r = run('build', 'fixtures/document-platform.yaml', '-f', 'svg', '--view', 'nope');
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('View hiện có: overview, core-domain');
  });

  it('tên file mặc định đặt cạnh file YAML', () => {
    const src = join(tmp, 'arch.yaml');
    writeFileSync(src, readFileSync(join(ROOT, 'fixtures/document-platform.yaml')));
    expect(run('build', src).code).toBe(0);
    expect(existsSync(join(tmp, 'arch.html'))).toBe(true);
  });
});
