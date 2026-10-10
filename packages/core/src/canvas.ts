/**
 * Phần core dùng trực tiếp trên main thread của web app (canvas): thuần hàm, nhẹ,
 * không kéo theo ELK hay Ajv. Phần nặng chạy trong Worker qua entry chính.
 */
export {
  routeEdges,
  type Box,
  type Point,
  type RouteRequest,
  type RouteResult,
} from './layout/route';
export { computeGroupBoxes, GROUP_PADDING, type GroupBoxResult } from './layout/manual';
export {
  emptyLayout,
  parseLayout,
  serializeLayout,
  renameInLayout,
  pruneLayout,
  checkLayout,
  viewLayout,
  isLayoutEmpty,
  layoutFileName,
  type LayoutFile,
  type ViewLayout,
} from './layout/file';
export { nodeBodySvg, nodeClass, nodeTooltip } from './render/svg';
export { elementAt, type ElementRange } from './parser/ranges';
export { COMPONENT_TYPES, RELATIONSHIP_TYPES, ID_PATTERN, isAsyncRelationship } from './constants';
