import { describe, expect, it } from 'vitest';
import { suggestRelationshipType } from './suggest';

describe('suggestRelationshipType', () => {
  it('gợi ý theo loại đích', () => {
    expect(suggestRelationshipType('database')).toBe('sql');
    expect(suggestRelationshipType('queue')).toBe('amqp');
    expect(suggestRelationshipType('person')).toBeUndefined();
    expect(suggestRelationshipType(undefined)).toBeUndefined();
  });
});
