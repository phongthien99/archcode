import { describe, expect, it } from 'vitest';
import { layoutView, renderSvg, resolveView, validate } from '../src';
import { wrapText } from '../src/render/text';
import { fixture, yaml } from './helpers';

async function svgOf(text: string, options: Parameters<typeof renderSvg>[1] = {}) {
  const { model, diagnostics } = validate(text);
  const layout = await layoutView(resolveView(model!, model!.views[0]!));
  return renderSvg(layout, { diagnostics, ...options });
}

describe('renderSvg', () => {
  it('escape nội dung người dùng — không chèn được thẻ hay thuộc tính', async () => {
    const svg = await svgOf(
      yaml(`components:
  - id: x
    type: service
    name: '<script>alert(1)</script>'
    description: '" onmouseover="alert(1)'
`),
    );
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(svg).not.toContain('" onmouseover="');
  });

  it('node là card thống nhất: khung bo góc, icon theo type, footer type · technology', async () => {
    const svg = await svgOf(fixture('document-platform.yaml'));
    for (const type of ['database', 'gateway', 'person', 'queue', 'external']) {
      expect(svg, type).toMatch(
        new RegExp(
          `class="ac-node ac-t-${type}"[^>]*><title>[^<]*</title><rect class="ac-shape"[^>]*rx="8"/><g class="ac-icon"`,
        ),
      );
    }
    // Icon khác nhau theo type (database: cylinder có ellipse; gateway: hexagon).
    expect(svg).toMatch(/ac-t-database"[\s\S]*?<g class="ac-icon"[^>]*><ellipse/);
    expect(svg).toMatch(/<line class="ac-divider"/);
    expect(svg).toMatch(/<text class="ac-meta"[^>]*>database · PostgreSQL/);
  });

  it('type tự định nghĩa dùng màu mặc định', async () => {
    expect(await svgOf(yaml('components: [{ id: lb, type: load-balancer }]\n'))).toContain(
      'ac-t-custom',
    );
  });

  it('gắn data-id cho node, edge và group', async () => {
    const svg = await svgOf(fixture('document-platform.yaml'));
    expect(svg).toContain('data-kind="component" data-id="document-service"');
    expect(svg).toContain('data-kind="relationship" data-id="api-gateway-&gt;document-service"');
    expect(svg).toContain('data-kind="group" data-id="core"');
  });

  it('edge bất đồng bộ nét đứt; nhãn gồm label và [type]', async () => {
    const svg = await svgOf(fixture('document-platform.yaml'));
    expect(svg).toMatch(
      /class="ac-edge ac-async" data-kind="relationship" data-id="document-service-&gt;document-events"/,
    );
    expect(svg).toContain('>Publish DocumentUploaded</text>');
    expect(svg).toContain('>[amqp]</text>');
  });

  it('tô viền phần tử có lỗi/cảnh báo, mũi tên đổi màu theo', async () => {
    const svg = await svgOf(fixture('invalid/rule-violations.yaml'));
    expect(svg).toContain(
      'class="ac-node ac-t-service ac-warning" data-kind="component" data-id="legacy-report"',
    );
    expect(svg).toMatch(
      /class="ac-edge ac-error" data-kind="relationship" data-id="order-service-&gt;billing-db"><title>[^<]*<\/title><path [^>]*marker-end="url\(#ac-arrow-error\)"/,
    );
  });

  it('standalone có xmlns và style; nhúng thì không', async () => {
    const text = fixture('document-platform.yaml');
    const standalone = await svgOf(text);
    const embedded = await svgOf(text, { standalone: false, idPrefix: 'v1-' });
    expect(standalone).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(standalone).toContain('<style>');
    expect(embedded).not.toContain('<style>');
    expect(embedded).toContain('id="v1-arrow"');
  });

  it('tiếng Việt có dấu giữ nguyên', async () => {
    expect(await svgOf(fixture('document-platform.yaml'))).toContain('>Người dùng</text>');
  });
});

describe('wrapText', () => {
  it('ngắt theo từ và thêm … khi vượt số dòng', () => {
    const lines = wrapText('một hai ba bốn năm sáu bảy tám chín mười', 60, 11, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
  });

  it('cắt từ quá dài theo ký tự', () => {
    const lines = wrapText('a'.repeat(80), 100, 11, 10);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('a'.repeat(80));
  });
});
