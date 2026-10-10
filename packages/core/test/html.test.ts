import { describe, expect, it } from 'vitest';
import { extractSource, generateHtml } from '../src';
import { fixture, yaml } from './helpers';

describe('generateHtml', async () => {
  const text = fixture('document-platform.yaml');
  const { html, validation } = await generateHtml(text, { sourceName: 'architecture.yaml' });

  it('là trang HTML đầy đủ, có tiêu đề hệ thống', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Document Platform — Kiến trúc hệ thống</title>');
    expect(validation.diagnostics).toEqual([]);
  });

  it('tự chứa: không tải tài nguyên ngoài', () => {
    expect(html).not.toMatch(/(src|href)=["']?(https?:)?\/\//i);
    expect(html).not.toMatch(/@import|url\(\s*["']?https?:/i);
    expect(html).not.toContain('<link');
  });

  it('mỗi view một tab và một SVG với id riêng', () => {
    expect(html.match(/data-view-tab="/g)).toHaveLength(2);
    expect(html.match(/<svg /g)).toHaveLength(2);
    expect(html).toContain('id="v0-arrow"');
    expect(html).toContain('id="v1-arrow"');
  });

  it('bảng component có depends on / used by kèm link nội bộ', () => {
    expect(html).toContain('<tr id="c-api-gateway">');
    expect(html).toMatch(
      /<tr id="c-search-service">[\s\S]*?<a href="#c-api-gateway">API Gateway<\/a><a href="#c-document-events">Document Events<\/a>/,
    );
  });

  it('không có mục kiểm tra khi model sạch', () => {
    expect(html).not.toContain('id="validation"');
  });

  it('deterministic: cùng YAML → cùng HTML', async () => {
    expect((await generateHtml(text, { sourceName: 'architecture.yaml' })).html).toBe(html);
  });

  it('nhúng YAML gốc và đọc lại chính xác', () => {
    expect(extractSource(html)).toBe(text);
  });

  it('embedSource: false thì không nhúng', async () => {
    const { html: plain } = await generateHtml(text, { embedSource: false });
    expect(extractSource(plain)).toBeNull();
  });
});

describe('generateHtml với lỗi', () => {
  it('liệt kê lỗi rule kèm vị trí', async () => {
    const { html } = await generateHtml(fixture('invalid/rule-violations.yaml'), {
      sourceName: 'x.yaml',
    });
    expect(html).toContain('id="validation"');
    expect(html).toContain('<code>x.yaml:51:5</code>');
    expect(html).toContain('<code>no-cross-domain-db</code>');
  });

  it('YAML sai cú pháp vẫn sinh trang báo lỗi', async () => {
    const { html, validation } = await generateHtml(fixture('invalid/syntax-error.yaml'));
    expect(validation.model).toBeNull();
    expect(html).toContain('Không dựng được mô hình kiến trúc');
    expect(html).toContain('yaml-syntax');
  });
});

describe('bảo mật XSS', async () => {
  const evil = yaml(`# </script><script>alert('comment')</script>
components:
  - id: x
    type: service
    name: '<img src=x onerror=alert(1)>'
    description: '</script><script>alert(2)</script>'
    technology: '"><svg onload=alert(3)>'
`);
  const { html } = await generateHtml(evil);

  it('không có thẻ script nào ngoài 2 thẻ của ArchCode', () => {
    expect(html.match(/<script/g)).toHaveLength(2);
  });

  it('không có thẻ img/svg onload do người dùng chèn', () => {
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<svg onload/i);
    expect(html).not.toMatch(/<[^>]+onerror=/i);
  });

  it('YAML nhúng vẫn khôi phục chính xác, kể cả chuỗi </script>', () => {
    expect(extractSource(html)).toBe(evil);
  });
});
