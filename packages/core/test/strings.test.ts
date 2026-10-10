import { describe, expect, it } from 'vitest';
import { closestMatch, levenshtein, toValidId } from '../src/util/strings';

describe('strings', () => {
  it('levenshtein', () => {
    expect(levenshtein('documnet', 'document')).toBe(2);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('closestMatch chỉ gợi ý khi đủ gần', () => {
    expect(closestMatch('servise', ['service', 'database'])).toBe('service');
    expect(closestMatch('payment-service', ['document-service'])).toBeUndefined();
    expect(closestMatch('up', ['TB', 'LR'])).toBeUndefined();
  });

  it('toValidId', () => {
    expect(toValidId('Wrong_Type!')).toBe('wrong_type');
    expect(toValidId('Dịch vụ Đặt hàng')).toBe('dich-vu-dat-hang');
  });
});
