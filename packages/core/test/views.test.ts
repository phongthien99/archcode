import { describe, expect, it } from 'vitest';
import { resolveView, validate } from '../src';
import { fixture } from './helpers';

const { model } = validate(fixture('document-platform.yaml'));
const view = (id: string) =>
  resolveView(
    model!,
    model!.views.find((v) => v.id === id)!,
  );

describe('resolveView', () => {
  it('`*` lấy toàn bộ component theo thứ tự khai báo', () => {
    expect(view('overview').components.map((c) => c.id)).toEqual(
      model!.components.map((c) => c.id),
    );
    expect(view('overview').relationships).toHaveLength(model!.relationships.length);
  });

  it('group: lấy cả group con, exclude theo type, chỉ giữ quan hệ có hai đầu trong view', () => {
    const v = view('core-domain');
    // data là group con của core; object-storage bị loại bởi exclude type:storage.
    expect(v.components.map((c) => c.id)).toEqual([
      'api-gateway',
      'document-service',
      'search-service',
      'document-db',
    ]);
    expect(v.relationships.map((r) => r.id)).toEqual([
      'api-gateway->document-service',
      'api-gateway->search-service',
      'document-service->document-db',
    ]);
    expect(v.groups.map((g) => g.id)).toEqual(['core', 'data']);
  });

  it('kết quả ổn định qua nhiều lần chạy', () => {
    expect(view('core-domain')).toEqual(view('core-domain'));
  });
});
