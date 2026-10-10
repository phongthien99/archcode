export * from './types';
export { DIAGNOSTIC_CODES, type DiagnosticCode } from './codes';
export {
  COMPONENT_TYPES,
  RELATIONSHIP_TYPES,
  SCHEMA_VERSION,
  ID_PATTERN,
  DEFAULT_VIEW_ID,
  type BuiltinComponentType,
} from './constants';
export { parseYaml, type ParsedYaml } from './parser/parse';
export { sourceRefOf } from './parser/sourceRef';
export { normalize, type NormalizeResult } from './parser/normalize';
export { schemaValidate, architectureSchema } from './validator/schema';
export { semanticValidate } from './validator/semantic';
export { validate, sortDiagnostics, hasErrors } from './validator';
export { resolveView, matchesSelector, groupChain, type ResolvedView } from './views/resolve';
