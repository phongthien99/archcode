import { spawnSync } from 'node:child_process';
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
    expect(reports[0]).toMatchObject({ valid: false, errorCount: 3, warningCount: 0 });
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
