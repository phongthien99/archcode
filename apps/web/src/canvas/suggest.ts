/** Giao thức gợi ý khi nối connector, theo loại component đích (S4-EDIT-02). */
const BY_TARGET: Record<string, string> = {
  database: 'sql',
  queue: 'amqp',
  cache: 'tcp',
  storage: 's3',
  external: 'https',
  gateway: 'https',
  frontend: 'https',
  service: 'http',
  system: 'https',
};

export function suggestRelationshipType(targetType: string | undefined): string | undefined {
  return targetType ? BY_TARGET[targetType] : undefined;
}
