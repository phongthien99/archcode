import { readFileSync } from 'node:fs';
import { validate } from '@archcode/core';
import { describe, expect, it } from 'vitest';

// Template là ấn tượng đầu tiên của người dùng: phải luôn hợp lệ, không cả cảnh báo.
const files = ['ecommerce-microservices.yaml', 'event-driven.yaml'];

describe('templates', () => {
  it.each(files)('%s hợp lệ, không lỗi, không cảnh báo', (file) => {
    const text = readFileSync(new URL(`./templates/${file}`, import.meta.url), 'utf8');
    const { model, diagnostics } = validate(text);
    expect(model).not.toBeNull();
    expect(diagnostics).toEqual([]);
  });
});
