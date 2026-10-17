/** Phiên bản schema hiện tại. */
export const SCHEMA_VERSION = 1;

/** Component type có sẵn (theo C4). Type khác vẫn hợp lệ nhưng có cảnh báo. */
export const COMPONENT_TYPES = [
  'person',
  'system',
  'external',
  'frontend',
  'gateway',
  'service',
  'database',
  'queue',
  'storage',
  'cache',
] as const;

export type BuiltinComponentType = (typeof COMPONENT_TYPES)[number];

/** Relationship type gợi ý cho autocomplete; không bắt buộc. */
export const RELATIONSHIP_TYPES = [
  'http',
  'https',
  'grpc',
  'graphql',
  'websocket',
  'sql',
  'tcp',
  'amqp',
  'kafka',
  'event',
  'async',
  'webhook',
  's3',
  'oidc',
] as const;

export const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export const VIEW_SELECTOR_PREFIXES = ['type', 'group', 'tag'] as const;

export const DEFAULT_VIEW_ID = 'all';

/** Giao thức bất đồng bộ: connector vẽ nét đứt; rule `no-circular` có thể bỏ qua (`ignore: async`). */
export const ASYNC_RELATIONSHIP_TYPES: readonly string[] = [
  'amqp',
  'kafka',
  'event',
  'async',
  'mqtt',
  'sns',
  'sqs',
  'pubsub',
];

export function isAsyncRelationship(rel: { type?: string }): boolean {
  return rel.type !== undefined && ASYNC_RELATIONSHIP_TYPES.includes(rel.type);
}

/** Thuật toán auto-layout của view (`layout.algorithm`). */
export const LAYOUT_ALGORITHMS = ['layered', 'tree', 'radial', 'stress', 'force', 'grid'] as const;

/** Kiểu đường connector (`layout.edges`). */
export const EDGE_STYLES = ['orthogonal', 'polyline', 'splines'] as const;
